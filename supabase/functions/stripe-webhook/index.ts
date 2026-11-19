import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// Price ID to plan tier mapping (kept for reference; product mapping below is primary)
const PRICE_TO_TIER: Record<string, string> = {
  "price_1Sinw0Rw8gEMe8Y711w64DoY": "scratch",
  "price_1SinwJRw8gEMe8Y7CVutBkBd": "pro",
};

// Product ID to plan tier mapping (primary source of truth — survives price changes)
const PRODUCT_TO_TIER: Record<string, string> = {
  "prod_TgAGZ9Sdt68lo1": "scratch",
  "prod_TgAGrGYvHwWyMC": "pro",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[STRIPE-WEBHOOK] ${step}`, details ? JSON.stringify(details) : "");
};

// Pro loyalty ladder: $999 for the first 4 months, then drops $100 every 2 months until $499 (keep in sync with src/lib/proPriceSteps.ts).
const PRO_BASE_PRICE = "price_1UVG2oRw8gEMe8Y73Z57Pcqc";
const PRO_LADDER = [
  "price_1UX53mRw8gEMe8Y7epgD8n4e", // 899
  "price_1UX53pRw8gEMe8Y7ZFkSVcXp", // 799
  "price_1UX53qRw8gEMe8Y7uuR4foIW", // 699
  "price_1UX53rRw8gEMe8Y7fhpdU49j", // 599
];
const PRO_FINAL = "price_1UX53sRw8gEMe8Y7pJahYkzf"; // 499

async function attachProLadder(subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price.id;
  if (price !== PRO_BASE_PRICE || subscription.schedule) return;
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscription.id });
  const current = schedule.phases[0];
  const hasTrial = !!subscription.trial_end && subscription.trial_end * 1000 > Date.now();
  const step = (p: string, iterations?: number) => ({ items: [{ price: p, quantity: 1 }], ...(iterations ? { iterations } : {}) });
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: current.items.map((i) => ({ price: typeof i.price === "string" ? i.price : i.price.id, quantity: i.quantity ?? 1 })),
        start_date: current.start_date,
        end_date: current.end_date,
        ...(current.trial_end ? { trial_end: current.trial_end } : {}),
      },
      // Current phase already covers month 1 (trial or first paid month); base price covers months 2-4.
      step(PRO_BASE_PRICE, 3),
      ...PRO_LADDER.map((p) => step(p, 2)),
      step(PRO_FINAL, 1),
    ],
  });
  logStep("Pro ladder attached", { subscriptionId: subscription.id, scheduleId: schedule.id });
}

// Fire-and-forget admin email notification. Never throws — logs and continues.
async function notifyAdmin(payload: Record<string, unknown>) {
  try {
    await supabaseAdmin.functions.invoke("notify-admin", { body: payload });
    logStep("notify-admin sent", { eventType: payload.eventType });
  } catch (err) {
    logStep("notify-admin failed", { error: String(err), eventType: payload.eventType });
  }
}

// Find student by email, customer ID, or metadata
async function findStudent(email?: string | null, customerId?: string | null, metadata?: Record<string, string> | null) {
  if (metadata?.student_id) {
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").eq("id", metadata.student_id).maybeSingle();
    if (data) return data;
  }
  if (metadata?.user_id) {
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").eq("id", metadata.user_id).maybeSingle();
    if (data) return data;
  }
  if (customerId) {
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").eq("stripe_customer_id", customerId).maybeSingle();
    if (data) return data;
  }
  if (email) {
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").eq("email", email).maybeSingle();
    if (data) return data;
  }
  return null;
}

// Classify purchase type from product/price info
function classifyPurchase(productName?: string, metadata?: Record<string, string> | null): { purchaseType: string; reportingCategory: string; packageSize: number } {
  const name = (productName || "").toLowerCase();
  const metaPurchaseType = metadata?.purchase_type;

  if (metaPurchaseType === "individual_lesson" || name.includes("individual")) {
    return { purchaseType: "individual_lesson", reportingCategory: "individual_lesson", packageSize: 1 };
  }
  if (metaPurchaseType === "lesson_package" || name.includes("package") || name.includes("lessons")) {
    const match = name.match(/(\d+)/);
    const size = match ? parseInt(match[1]) : (metadata?.package_size ? parseInt(metadata.package_size) : 10);
    return { purchaseType: "lesson_package", reportingCategory: "package", packageSize: size };
  }
  if (name.includes("video") || name.includes("analysis")) {
    return { purchaseType: "video_analysis", reportingCategory: "video_analysis", packageSize: 1 };
  }
  if (name.includes("subscription") || name.includes("scratch") || name.includes("pro")) {
    return { purchaseType: "subscription", reportingCategory: "subscription", packageSize: 0 };
  }
  return { purchaseType: "one_time", reportingCategory: "uncategorized", packageSize: 1 };
}

// Upsert a stripe payment record (idempotent by payment_intent_id)
async function upsertStripePayment(params: {
  paymentIntentId: string;
  checkoutSessionId?: string;
  customerId?: string;
  studentId?: string | null;
  studentEmail?: string | null;
  studentName?: string | null;
  productId?: string;
  priceId?: string;
  productName?: string;
  purchaseType: string;
  amount: number;
  currency: string;
  status: string;
  paidAt?: string;
  studentMatched: boolean;
  reportingCategory: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: existing } = await supabaseAdmin
    .from("stripe_payments")
    .select("id")
    .eq("stripe_payment_intent_id", params.paymentIntentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("stripe_payments")
      .update({
        status: params.status,
        student_id: params.studentId || null,
        student_email: params.studentEmail,
        student_name: params.studentName,
        student_matched: params.studentMatched,
        paid_at: params.paidAt,
      })
      .eq("id", existing.id);

    if (error) logStep("ERROR updating stripe_payment", { error: error.message });
    else logStep("Updated existing stripe_payment", { id: existing.id });
    return existing.id;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("stripe_payments")
    .insert({
      stripe_payment_intent_id: params.paymentIntentId,
      stripe_checkout_session_id: params.checkoutSessionId || null,
      stripe_customer_id: params.customerId || null,
      student_id: params.studentId || null,
      student_email: params.studentEmail,
      student_name: params.studentName,
      stripe_product_id: params.productId || null,
      stripe_price_id: params.priceId || null,
      product_name: params.productName || null,
      purchase_type: params.purchaseType,
      amount: params.amount,
      currency: params.currency,
      status: params.status,
      paid_at: params.paidAt || null,
      student_matched: params.studentMatched,
      source: "stripe",
      reporting_category: params.reportingCategory,
      metadata: params.metadata || {},
    })
    .select("id")
    .single();

  if (error) {
    logStep("ERROR inserting stripe_payment", { error: error.message });
    return null;
  }
  logStep("Inserted stripe_payment", { id: inserted.id });
  return inserted.id;
}

// Upsert subscription record (idempotent by stripe_subscription_id)
async function upsertSubscription(sub: Stripe.Subscription, student: { id: string; full_name: string | null; email: string } | null) {
  const item = sub.items.data[0];
  const priceId = item?.price.id;
  const productId = item?.price.product as string;
  // Stripe API 2025+: current_period_end/start moved to subscription items
  const periodStartUnix = (item as any)?.current_period_start ?? (sub as any)?.current_period_start;
  const periodEndUnix = (item as any)?.current_period_end ?? (sub as any)?.current_period_end;
  let planTier = PRODUCT_TO_TIER[productId] || PRICE_TO_TIER[priceId] || null;
  const interval = item?.price.recurring?.interval || "month";

  let productName = planTier || "Unknown";
  try {
    const prod = await stripe.products.retrieve(productId);
    productName = prod.name;
  } catch (_) { /* ignore */ }

  // Try to find billing_plan by stripe_product_id
  let billingPlanId: string | null = null;
  const { data: bp } = await supabaseAdmin
    .from("billing_plans")
    .select("id, tier_key")
    .eq("stripe_product_id", productId)
    .maybeSingle();
  if (bp) {
    billingPlanId = bp.id;
    planTier = bp.tier_key || planTier;
  }

  const isActive = ["active", "trialing"].includes(sub.status);
  const customerEmail = student?.email || null;

  // Get customer email if no student
  let resolvedEmail = customerEmail;
  if (!resolvedEmail && sub.customer) {
    try {
      const cust = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
      resolvedEmail = cust.email;
    } catch (_) { /* ignore */ }
  }

  const record = {
    student_id: student?.id || null,
    student_email: resolvedEmail,
    student_name: student?.full_name || null,
    billing_plan_id: billingPlanId,
    plan_name: productName,
    plan_tier: planTier,
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    stripe_product_id: productId,
    stripe_price_id: priceId,
    billing_interval: interval,
    status: sub.status,
    started_at: new Date(sub.start_date * 1000).toISOString(),
    current_period_start: periodStartUnix ? new Date(periodStartUnix * 1000).toISOString() : null,
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    ended_at: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    trial_start: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    is_active: isActive,
    student_matched: !!student,
    source: "stripe",
    cancel_at: (sub as any).cancel_at ? new Date((sub as any).cancel_at * 1000).toISOString() : null,
    last_synced_at: new Date().toISOString(),
  };

  // Upsert by stripe_subscription_id
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  const isNew = !existing;
  if (existing) {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(record)
      .eq("id", existing.id);
    if (error) logStep("ERROR updating subscription record", { error: error.message });
    else logStep("Updated subscription record", { id: existing.id, status: sub.status });
  } else {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .insert(record);
    if (error) logStep("ERROR inserting subscription record", { error: error.message });
    else logStep("Inserted subscription record", { stripeSubId: sub.id });
  }

  return { planTier, isActive, productId, priceId, productName, isNew };
}

// Append a subscription_history row so the frontend can compute grace windows.
// Idempotent-ish: we always insert a fresh row capturing the latest state of the sub.
async function recordSubscriptionHistory(sub: Stripe.Subscription, studentId: string | null, planTier: string | null) {
  if (!studentId || !planTier) return;
  const item = sub.items.data[0];
  const periodEndUnix = (item as any)?.current_period_end ?? (sub as any)?.current_period_end;
  const startedAt = sub.start_date ? new Date(sub.start_date * 1000).toISOString() : null;
  const endedAt = sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null;
  const paidThrough = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;

  try {
    await supabaseAdmin.from("subscription_history").insert({
      user_id: studentId,
      plan_tier: planTier,
      started_at: startedAt,
      ended_at: endedAt,
      paid_through: paidThrough,
      source: "stripe",
      stripe_subscription_id: sub.id,
      metadata: {
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
      },
    });
    logStep("Recorded subscription_history", { studentId, planTier, paidThrough });
  } catch (e) {
    logStep("ERROR recording subscription_history", { error: String(e) });
  }
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature) {
    logStep("ERROR: No signature provided");
    return new Response("No signature", { status: 400 });
  }

  if (!webhookSecret) {
    logStep("ERROR: No webhook secret configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    
    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout completed", { 
          customerId: session.customer, 
          subscriptionId: session.subscription,
          mode: session.mode,
          paymentIntentId: session.payment_intent,
          amountTotal: session.amount_total,
        });

        const customerEmail = session.customer_email || session.customer_details?.email;
        let resolvedEmail = customerEmail;

        if (!resolvedEmail && session.customer) {
          try {
            const cust = await stripe.customers.retrieve(session.customer as string) as Stripe.Customer;
            resolvedEmail = cust.email;
          } catch (e) {
            logStep("Could not retrieve customer", { error: String(e) });
          }
        }

        const student = await findStudent(
          resolvedEmail,
          session.customer as string,
          session.metadata as Record<string, string>
        );

        logStep("Student lookup", { found: !!student, studentId: student?.id, email: resolvedEmail });

        // Update stripe_customer_id on profile if missing
        if (student && session.customer) {
          await supabaseAdmin
            .from("profiles")
            .update({ stripe_customer_id: session.customer as string })
            .eq("id", student.id)
            .is("stripe_customer_id", null);
        }

        // Handle SUBSCRIPTION checkout
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          // Upsert into subscriptions table
          const { planTier } = await upsertSubscription(subscription, student);

          // Pro loyalty ladder: price drops $100 every 2 months until $499/mo.
          try { await attachProLadder(subscription); }
          catch (e) { logStep("ERROR attaching Pro ladder", { message: (e as Error).message }); }


          if (student) {
            const subItem = subscription.items.data[0];
            const periodEndUnix = (subItem as any)?.current_period_end ?? (subscription as any)?.current_period_end;
            const { error } = await supabaseAdmin
              .from("profiles")
              .update({
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: session.subscription as string,
                subscription_status: subscription.status,
                plan_tier: planTier || "free",
                current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
              })
              .eq("id", student.id);

            if (error) logStep("ERROR updating profile for subscription", { error: error.message });
            else logStep("Profile updated for subscription", { planTier });
          }

          // Record subscription payment
          if (session.payment_intent) {
            const productId = subscription.items.data[0]?.price.product as string;
            const priceId = subscription.items.data[0]?.price.id;
            let productName = planTier || "subscription";
            try {
              const prod = await stripe.products.retrieve(productId);
              productName = prod.name;
            } catch (_) { /* ignore */ }

            await upsertStripePayment({
              paymentIntentId: session.payment_intent as string,
              checkoutSessionId: session.id,
              customerId: session.customer as string,
              studentId: student?.id,
              studentEmail: resolvedEmail,
              studentName: student?.full_name,
              productId,
              priceId,
              productName,
              purchaseType: "subscription",
              amount: (session.amount_total || 0) / 100,
              currency: session.currency || "mxn",
              status: "succeeded",
              paidAt: new Date().toISOString(),
              studentMatched: !!student,
              reportingCategory: "subscription",
              metadata: session.metadata || {},
            });
          }
        }

        // Handle ONE-TIME PAYMENT checkout
        if (session.mode === "payment" && session.payment_intent) {
          logStep("Processing one-time payment", { paymentIntent: session.payment_intent });

          let productName = "Purchase";
          let productId = "";
          let priceId = "";
          let lineQuantity = 1;
          try {
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
              expand: ["data.price.product"],
            });
            const item = lineItems.data[0];
            if (item) {
              const price = item.price;
              priceId = price?.id || "";
              const product = price?.product as Stripe.Product;
              productName = product?.name || item.description || "Purchase";
              productId = product?.id || "";
              lineQuantity = Math.max(1, Number(item.quantity) || 1);
            }
          } catch (e) {
            logStep("Could not retrieve line items", { error: String(e) });
          }

          const classified = classifyPurchase(
            productName,
            session.metadata as Record<string, string>
          );
          const { purchaseType, reportingCategory } = classified;
          // For individual lessons, scale package size by line item quantity
          const packageSize = purchaseType === "individual_lesson"
            ? lineQuantity
            : classified.packageSize;

          logStep("Classified purchase", { purchaseType, reportingCategory, packageSize, productName });

          await upsertStripePayment({
            paymentIntentId: session.payment_intent as string,
            checkoutSessionId: session.id,
            customerId: session.customer as string || undefined,
            studentId: student?.id,
            studentEmail: resolvedEmail,
            studentName: student?.full_name,
            productId,
            priceId,
            productName,
            purchaseType,
            amount: (session.amount_total || 0) / 100,
            currency: session.currency || "mxn",
            status: "succeeded",
            paidAt: new Date().toISOString(),
            studentMatched: !!student,
            reportingCategory,
            metadata: { ...(session.metadata || {}), package_size: packageSize },
          });

          // Create class_packages / entitlements if student matched
          if (student && (purchaseType === "individual_lesson" || purchaseType === "lesson_package")) {
            const { data: existingPkg } = await supabaseAdmin
              .from("class_packages")
              .select("id")
              .eq("user_id", student.id)
              .ilike("package_name", `%${productName}%`)
              .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
              .maybeSingle();

            if (!existingPkg) {
              const pkgName = purchaseType === "individual_lesson"
                ? (packageSize > 1 ? `${packageSize} Individual Lessons` : "Individual Lesson")
                : `${packageSize} Lessons Package`;

              const { data: pkg, error: pkgError } = await supabaseAdmin
                .from("class_packages")
                .insert({
                  user_id: student.id,
                  package_name: pkgName,
                  package_size: packageSize,
                  classes_remaining: packageSize,
                  classes_used: 0,
                  price: (session.amount_total || 0) / 100,
                  amount_paid: (session.amount_total || 0) / 100,
                  payment_status: "paid",
                  payment_date: new Date().toISOString().split("T")[0],
                  is_active: true,
                })
                .select()
                .single();

              if (pkgError) {
                logStep("ERROR creating package from webhook", { error: pkgError.message });
              } else if (pkg) {
                logStep("Package created from webhook", { packageId: pkg.id });
                await supabaseAdmin.from("package_payments").insert({
                  package_id: pkg.id,
                  amount: (session.amount_total || 0) / 100,
                  payment_date: new Date().toISOString().split("T")[0],
                  payment_method: "Stripe",
                  notes: `Stripe webhook: ${session.id}`,
                });

                // Notify all admins (coaches) — non-blocking. Only fires here if
                // verify-checkout did NOT already create the package (dedup via existingPkg above).
                try {
                  const studentName = student.full_name || student.email || "A student";
                  const amountMxn = Math.round((session.amount_total || 0) / 100).toLocaleString("en-US");
                  const { data: admins } = await supabaseAdmin
                    .from("user_roles")
                    .select("user_id")
                    .eq("role", "admin");
                  if (admins && admins.length > 0) {
                    const rows = admins.map((a: any) => ({
                      user_id: a.user_id,
                      type: "package_purchased",
                      title: "💰 New package purchased",
                      message: `${studentName} just bought a ${packageSize}-lesson package ($${amountMxn} MXN)`,
                      link: `/admin/students/${student.id}`,
                      metadata: { package_id: pkg.id, student_id: student.id, source: "stripe_webhook", session_id: session.id },
                    }));
                    await supabaseAdmin.from("notifications").insert(rows);
                  }
                } catch (notifErr) {
                  logStep("Failed to create admin notifications", { error: String(notifErr) });
                }

                // Email admin@margeagolfacademy.com
                await notifyAdmin({
                  eventType: "package_purchased",
                  studentName: student.full_name || student.email || "A student",
                  studentEmail: student.email,
                  packageName: pkgName,
                  amount: (session.amount_total || 0) / 100,
                  currency: session.currency || "mxn",
                  packageId: pkg.id,
                  sessionId: session.id,
                });
                await notifyAdmin({
                  eventType: "payment_received",
                  studentName: student.full_name || student.email || "A student",
                  studentEmail: student.email,
                  amount: (session.amount_total || 0) / 100,
                  currency: session.currency || "mxn",
                  concept: pkgName,
                });

                // Email the STUDENT — package added confirmation (non-blocking)
                if (student.email) {
                  try {
                    await supabaseAdmin.functions.invoke("send-notification-email", {
                      body: {
                        to: student.email,
                        studentName: student.full_name || "there",
                        notificationType: "package_added",
                        packageSize,
                        lessonsRemaining: packageSize,
                      },
                    });
                    logStep("Student package_added email sent", { to: student.email });
                  } catch (e) {
                    logStep("Student package_added email failed", { error: String(e) });
                  }
                }
              }
            } else {
              logStep("Package already exists (created by verify-checkout)", { existingPkgId: existingPkg.id });
            }
          }

          if (student && purchaseType === "video_analysis") {
            const { data: existingAr } = await supabaseAdmin
              .from("analysis_requests")
              .select("id")
              .eq("student_id", student.id)
              .eq("stripe_session_id", session.id)
              .maybeSingle();

            if (!existingAr) {
              await supabaseAdmin.from("analysis_requests").insert({
                student_id: student.id,
                amount: (session.amount_total || 0) / 100,
                payment_status: "paid",
                delivery_status: "pending",
                stripe_session_id: session.id,
              });
              logStep("Analysis request created from webhook");

              // Notify all admins (coaches) — non-blocking
              try {
                const studentName = student.full_name || student.email || "A student";
                const amountMxn = Math.round((session.amount_total || 0) / 100).toLocaleString("en-US");
                const { data: admins } = await supabaseAdmin
                  .from("user_roles")
                  .select("user_id")
                  .eq("role", "admin");
                if (admins && admins.length > 0) {
                  const rows = admins.map((a: any) => ({
                    user_id: a.user_id,
                    type: "analysis_request",
                    title: "🎬 New swing analysis request",
                    message: `${studentName} paid for a video analysis ($${amountMxn} MXN). Awaiting their video upload.`,
                    link: `/admin/analysis-requests`,
                    metadata: { student_id: student.id, source: "stripe_webhook", session_id: session.id },
                  }));
                  await supabaseAdmin.from("notifications").insert(rows);
                }

                await notifyAdmin({
                  eventType: "payment_received",
                  studentName: student.full_name || student.email || "A student",
                  studentEmail: student.email,
                  amount: (session.amount_total || 0) / 100,
                  currency: session.currency || "mxn",
                  concept: "Video Analysis",
                });
              } catch (notifErr) {
                logStep("Failed to create analysis request admin notifications", { error: String(notifErr) });
              }
            }
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        logStep("PaymentIntent succeeded", { id: pi.id, amount: pi.amount });

        const { data: existing } = await supabaseAdmin
          .from("stripe_payments")
          .select("id")
          .eq("stripe_payment_intent_id", pi.id)
          .maybeSingle();

        if (existing) {
          await supabaseAdmin
            .from("stripe_payments")
            .update({ status: "succeeded", paid_at: new Date().toISOString() })
            .eq("id", existing.id);
          logStep("Updated payment status to succeeded", { id: existing.id });
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        logStep("Charge refunded", { chargeId: charge.id, paymentIntent: charge.payment_intent });

        if (charge.payment_intent) {
          const { error } = await supabaseAdmin
            .from("stripe_payments")
            .update({
              refund_status: charge.refunded ? "full" : "partial",
              refund_amount: (charge.amount_refunded || 0) / 100,
              status: charge.refunded ? "refunded" : "partially_refunded",
            })
            .eq("stripe_payment_intent_id", charge.payment_intent as string);

          if (error) logStep("ERROR updating refund", { error: error.message });
          else logStep("Refund recorded");
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription created/updated", { 
          subscriptionId: subscription.id, 
          status: subscription.status 
        });

        // Find student by customer ID
        const student = await findStudent(null, subscription.customer as string, null);

        // Upsert subscription record
        const { planTier, isActive, productName, isNew } = await upsertSubscription(subscription, student);

        // Always record a history row so we can compute grace windows
        await recordSubscriptionHistory(subscription, student?.id ?? null, planTier);

        // Update profile
        if (student) {
          const subItem = subscription.items.data[0];
          const periodEndUnix = (subItem as any)?.current_period_end ?? (subscription as any)?.current_period_end;
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({
              subscription_status: subscription.status,
              plan_tier: isActive ? (planTier || "free") : "free",
              current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
              ...(isActive ? { stripe_customer_id: subscription.customer as string, stripe_subscription_id: subscription.id } : {}),
            })
            .eq("id", student.id);

          if (error) logStep("ERROR updating profile subscription", { error: error.message });
        }

        // Notify all admins (coaches) of a NEW active subscription — non-blocking.
        if (isNew && isActive) {
          try {
            const studentName = student?.full_name || student?.email || "A student";
            const planLabel = (planTier || productName || "membership").toString();
            const planDisplay = planLabel.charAt(0).toUpperCase() + planLabel.slice(1);
            const item = subscription.items.data[0];
            const amountMxn = item?.price?.unit_amount
              ? Math.round(item.price.unit_amount / 100).toLocaleString("en-US")
              : null;
            const message = amountMxn
              ? `${studentName} subscribed to ${planDisplay} ($${amountMxn} MXN/${item?.price?.recurring?.interval || "month"})`
              : `${studentName} subscribed to ${planDisplay}`;

            const { data: admins } = await supabaseAdmin
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin");
            if (admins && admins.length > 0) {
              const rows = admins.map((a: any) => ({
                user_id: a.user_id,
                type: "subscription_started",
                title: "🎉 New subscriber",
                message,
                link: student ? `/admin/students/${student.id}` : "/admin/subscribers",
                metadata: {
                  stripe_subscription_id: subscription.id,
                  student_id: student?.id ?? null,
                  plan_tier: planTier,
                  source: "stripe_webhook",
                },
              }));
              await supabaseAdmin.from("notifications").insert(rows);
              logStep("Admin notifications created for new subscriber", { count: rows.length });
            }

            await notifyAdmin({
              eventType: "subscription_started",
              studentName,
              studentEmail: student?.email,
              planLabel: planDisplay,
              amount: amountMxn ? Number(amountMxn.replace(/,/g, "")) : undefined,
              currency: "MXN",
            });
            await notifyAdmin({
              eventType: "payment_received",
              studentName,
              studentEmail: student?.email,
              amount: amountMxn ? Number(amountMxn.replace(/,/g, "")) : undefined,
              currency: "MXN",
              concept: `${planDisplay} membership`,
            });
          } catch (notifErr) {
            logStep("Failed to create admin subscriber notifications", { error: String(notifErr) });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted", { subscriptionId: subscription.id });

        const student = await findStudent(null, subscription.customer as string, null);

        // Update subscription record
        const { planTier } = await upsertSubscription(subscription, student);

        // Record final history entry — paid_through = current_period_end so the
        // user keeps their tier perks until the end of the billing cycle.
        await recordSubscriptionHistory(subscription, student?.id ?? null, planTier);

        // Update profile
        if (student) {
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({
              subscription_status: "canceled",
              plan_tier: "free",
              stripe_subscription_id: null,

            })
            .eq("id", student.id);

          if (error) logStep("ERROR canceling subscription profile", { error: error.message });
        }

        await notifyAdmin({
          eventType: "subscription_cancelled",
          studentName: student?.full_name || student?.email || "A student",
          studentEmail: student?.email,
          planLabel: planTier || "membership",
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice paid", { invoiceId: invoice.id, subscriptionId: invoice.subscription });

        // Update subscription record's last_synced_at and period dates
        if (invoice.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const student = await findStudent(null, sub.customer as string, null);
            await upsertSubscription(sub, student);
          } catch (e) {
            logStep("Could not refresh subscription on invoice.paid", { error: String(e) });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        logStep("PaymentIntent failed", { id: pi.id });

        const { data: existing } = await supabaseAdmin
          .from("stripe_payments")
          .select("id")
          .eq("stripe_payment_intent_id", pi.id)
          .maybeSingle();

        if (existing) {
          await supabaseAdmin
            .from("stripe_payments")
            .update({ status: "failed" })
            .eq("id", existing.id);
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logStep("ERROR processing webhook", { error: errorMessage });
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }
});
