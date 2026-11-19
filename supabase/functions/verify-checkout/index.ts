import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[VERIFY-CHECKOUT] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");
    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const { session_id } = await req.json();
    if (!session_id) throw new Error("session_id is required");
    logStep("Verifying session", { session_id });

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items.data.price.product"],
    });

    if (session.payment_status !== "paid") {
      logStep("Payment not completed", { status: session.payment_status });
      return new Response(JSON.stringify({
        verified: false,
        status: session.payment_status,
        message: "Payment not yet completed",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Extract product info
    const lineItem = session.line_items?.data?.[0];
    const price = lineItem?.price;
    const product = price?.product as Stripe.Product;
    const amountTotal = session.amount_total || 0;
    const currency = session.currency || "mxn";
    const lineQuantity = Math.max(1, Number(lineItem?.quantity) || 1);

    logStep("Payment verified", {
      productId: product?.id,
      productName: product?.name,
      amount: amountTotal,
      mode: session.mode,
    });

    // Determine product type from billing_plans table
    let purchaseType = "unknown";
    let packageSize = 1;
    let planRecord: any = null;

    if (price?.id) {
      const { data: billingPlan } = await supabaseAdmin
        .from("billing_plans")
        .select("*")
        .eq("stripe_price_id", price.id)
        .maybeSingle();

      if (billingPlan) {
        planRecord = billingPlan;
        if (billingPlan.plan_type === "subscription") {
          purchaseType = "subscription";
        } else if (billingPlan.name?.toLowerCase().includes("package") || billingPlan.name?.toLowerCase().includes("lessons")) {
          purchaseType = "lesson_package";
          // Extract package size from name
          const match = billingPlan.name.match(/(\d+)/);
          if (match) packageSize = parseInt(match[1]);
        } else if (billingPlan.name?.toLowerCase().includes("individual") || billingPlan.name?.toLowerCase().includes("lesson")) {
          purchaseType = "individual_lesson";
          packageSize = lineQuantity;
        } else if (billingPlan.name?.toLowerCase().includes("video") || billingPlan.name?.toLowerCase().includes("analysis")) {
          purchaseType = "video_analysis";
          packageSize = 1;
        } else {
          purchaseType = "one_time";
        }
      } else {
        // Fallback: try to detect from product name
        const productName = product?.name?.toLowerCase() || "";
        if (productName.includes("individual")) {
          purchaseType = "individual_lesson";
          packageSize = lineQuantity;
        } else if (productName.includes("package") || productName.includes("lessons")) {
          purchaseType = "lesson_package";
          const match = productName.match(/(\d+)/);
          if (match) packageSize = parseInt(match[1]);
        } else if (productName.includes("video") || productName.includes("analysis")) {
          purchaseType = "video_analysis";
        }
      }
    }

    logStep("Purchase classified", { purchaseType, packageSize });

    // Activate entitlement based on purchase type
    let entitlementResult: any = null;

    if (purchaseType === "individual_lesson" || purchaseType === "lesson_package") {
      // Create or update class_packages
      const packageName = purchaseType === "individual_lesson"
        ? (packageSize > 1 ? `${packageSize} Individual Lessons` : "Individual Lesson")
        : `${packageSize} Lessons Package`;

      const { data: pkg, error: pkgError } = await supabaseAdmin
        .from("class_packages")
        .insert({
          user_id: user.id,
          package_name: packageName,
          package_size: packageSize,
          classes_remaining: packageSize,
          classes_used: 0,
          price: amountTotal / 100,
          amount_paid: amountTotal / 100,
          payment_status: "paid",
          payment_date: new Date().toISOString().split("T")[0],
          is_active: true,
        })
        .select()
        .single();

      if (pkgError) {
        logStep("ERROR creating package", { error: pkgError.message });
      } else {
        logStep("Package created", { packageId: pkg.id, size: packageSize });
        entitlementResult = { package_id: pkg.id, lessons_available: packageSize };

        // Also record a package_payment
        await supabaseAdmin.from("package_payments").insert({
          package_id: pkg.id,
          amount: amountTotal / 100,
          payment_date: new Date().toISOString().split("T")[0],
          payment_method: "Stripe",
          notes: `Stripe session: ${session_id}`,
        });

        // Notify all admins (coaches) of the purchase — non-blocking
        try {
          const { data: studentProf } = await supabaseAdmin
            .from("profiles")
            .select("full_name, email")
            .eq("id", user.id)
            .maybeSingle();
          const studentName = studentProf?.full_name || user.email || "A student";
          const studentEmail = studentProf?.email || user.email || null;
          const amountMxn = Math.round(amountTotal / 100).toLocaleString("en-US");
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
              link: `/admin/students/${user.id}`,
              metadata: { package_id: pkg.id, student_id: user.id, source: "stripe", session_id },
            }));
            await supabaseAdmin.from("notifications").insert(rows);
          }

          // Email admin@margeagolfacademy.com — package purchased (non-blocking)
          try {
            await supabaseAdmin.functions.invoke("notify-admin", {
              body: {
                eventType: "package_purchased",
                studentName,
                studentEmail,
                packageName,
                amount: amountTotal / 100,
                currency: (currency || "mxn"),
                packageId: pkg.id,
                sessionId: session_id,
              },
            });
          } catch (e) {
            logStep("notify-admin (package_purchased) failed", { error: String(e) });
          }

          // Email admin@margeagolfacademy.com — payment received (non-blocking)
          try {
            await supabaseAdmin.functions.invoke("notify-admin", {
              body: {
                eventType: "payment_received",
                studentName,
                studentEmail,
                amount: amountTotal / 100,
                currency: (currency || "mxn"),
                concept: packageName,
              },
            });
          } catch (e) {
            logStep("notify-admin (payment_received) failed", { error: String(e) });
          }

          // Email the STUDENT — package added confirmation (non-blocking)
          if (studentEmail) {
            try {
              await supabaseAdmin.functions.invoke("send-notification-email", {
                body: {
                  to: studentEmail,
                  studentName,
                  notificationType: "package_added",
                  packageSize,
                  lessonsRemaining: packageSize,
                },
              });
              logStep("Student package_added email queued", { to: studentEmail });
            } catch (e) {
              logStep("Student package_added email failed", { error: String(e) });
            }
          }
        } catch (notifErr) {
          logStep("Failed to create admin notifications", { error: String(notifErr) });
        }
      }
    }

    if (purchaseType === "video_analysis") {
      const { data: ar, error: arError } = await supabaseAdmin
        .from("analysis_requests")
        .insert({
          student_id: user.id,
          amount: amountTotal / 100,
          payment_status: "paid",
          delivery_status: "pending",
          stripe_session_id: session_id,
        })
        .select()
        .single();

      if (!arError) {
        entitlementResult = { analysis_request_id: ar.id };
        logStep("Analysis request created", { id: ar.id });

        // Email admin@margeagolfacademy.com — payment received for video analysis
        try {
          const { data: studentProf } = await supabaseAdmin
            .from("profiles")
            .select("full_name, email")
            .eq("id", user.id)
            .maybeSingle();
          await supabaseAdmin.functions.invoke("notify-admin", {
            body: {
              eventType: "payment_received",
              studentName: studentProf?.full_name || user.email || "A student",
              studentEmail: studentProf?.email || user.email,
              amount: amountTotal / 100,
              currency: (currency || "mxn"),
              concept: "Video Analysis",
            },
          });
        } catch (e) {
          logStep("notify-admin (payment_received / video_analysis) failed", { error: String(e) });
        }
      }
    }

    // Handle SUBSCRIPTION purchases — flip plan_tier immediately
    if (purchaseType === "subscription" && session.subscription) {
      try {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const subItem = subscription.items.data[0];
        const periodEndUnix = (subItem as any)?.current_period_end ?? (subscription as any)?.current_period_end;
        const periodStartUnix = (subItem as any)?.current_period_start ?? (subscription as any)?.current_period_start;
        const subProductId = subItem?.price.product as string;

        // Resolve plan tier from billing_plans
        let planTier: string | null = null;
        let billingPlanId: string | null = null;
        const { data: bp } = await supabaseAdmin
          .from("billing_plans")
          .select("id, name")
          .eq("stripe_product_id", subProductId)
          .maybeSingle();
        if (bp) {
          billingPlanId = bp.id;
          const lname = String(bp.name).toLowerCase();
          if (lname.includes("scratch")) planTier = "scratch";
          else if (lname.includes("pro")) planTier = "pro";
          else planTier = lname;
        }

        // Update profile so badge flips
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status,
            plan_tier: planTier || "free",
            current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
            plan_selected_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        // Upsert subscription row
        const subRecord = {
          student_id: user.id,
          student_email: user.email,
          student_name: user.user_metadata?.full_name || user.email,
          billing_plan_id: billingPlanId,
          plan_name: bp?.name || product?.name || "Subscription",
          plan_tier: planTier,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscription.id,
          stripe_product_id: subProductId,
          stripe_price_id: subItem?.price.id || null,
          billing_interval: subItem?.price.recurring?.interval || "month",
          status: subscription.status,
          started_at: subscription.start_date ? new Date(subscription.start_date * 1000).toISOString() : null,
          current_period_start: periodStartUnix ? new Date(periodStartUnix * 1000).toISOString() : null,
          current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          is_active: ["active", "trialing"].includes(subscription.status),
          student_matched: true,
          source: "stripe",
          last_synced_at: new Date().toISOString(),
        };

        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();

        if (existingSub) {
          await supabaseAdmin.from("subscriptions").update(subRecord).eq("id", existingSub.id);
        } else {
          await supabaseAdmin.from("subscriptions").insert(subRecord);
        }

        entitlementResult = { plan_tier: planTier, subscription_id: subscription.id };
        logStep("Subscription activated on profile", { planTier, subId: subscription.id });

        // Notify all admins (coaches) of the NEW subscription — non-blocking.
        // We do it here (not just in the webhook) because verify-checkout is
        // the first place the subscription row gets created; by the time the
        // Stripe webhook fires, the row already exists and its `isNew` check
        // evaluates to false, so the webhook's notification block is skipped.
        if (!existingSub) {
          try {
            const { data: studentProf } = await supabaseAdmin
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle();
            const studentName = studentProf?.full_name || user.email || "A student";
            const planLabel = (planTier || product?.name || "membership").toString();
            const planDisplay = planLabel.charAt(0).toUpperCase() + planLabel.slice(1);
            const intervalLabel = subItem?.price.recurring?.interval || "month";
            const amountMxn = subItem?.price?.unit_amount
              ? Math.round(subItem.price.unit_amount / 100).toLocaleString("en-US")
              : null;
            const message = amountMxn
              ? `${studentName} subscribed to ${planDisplay} ($${amountMxn} MXN/${intervalLabel})`
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
                link: `/admin/students/${user.id}`,
                metadata: {
                  stripe_subscription_id: subscription.id,
                  student_id: user.id,
                  plan_tier: planTier,
                  source: "verify_checkout",
                  session_id,
                },
              }));
              await supabaseAdmin.from("notifications").insert(rows);
              logStep("Admin notifications created for new subscriber", { count: rows.length });
            }
          } catch (notifErr) {
            logStep("Failed to create admin subscriber notifications", { error: String(notifErr) });
          }

          // Send subscription confirmation email to the student — non-blocking
          try {
            const recipient = user.email;
            const planForEmail = (planTier || "").toLowerCase();
            if (recipient && (planForEmail === "scratch" || planForEmail === "pro")) {
              const renewalDate = periodEndUnix
                ? new Date(periodEndUnix * 1000).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : undefined;
              await supabaseAdmin.functions.invoke("send-notification-email", {
                body: {
                  to: recipient,
                  studentName: studentName,
                  notificationType: "subscription_confirmed",
                  planLabel: planForEmail,
                  renewalDate,
                },
              });
              logStep("Subscription confirmation email queued", { to: recipient, planForEmail });
            }
          } catch (emailErr) {
            logStep("Failed to send subscription confirmation email", { error: String(emailErr) });
          }
        }
      } catch (subErr) {
        logStep("ERROR activating subscription", { error: String(subErr) });
      }
    }

    // Also record in stripe_payments for reliable tracking (idempotent by payment_intent)
    const paymentIntentId = session.payment_intent as string;
    if (paymentIntentId) {
      const { data: existingSp } = await supabaseAdmin
        .from("stripe_payments")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (!existingSp) {
        await supabaseAdmin.from("stripe_payments").insert({
          stripe_payment_intent_id: paymentIntentId,
          stripe_checkout_session_id: session_id,
          stripe_customer_id: session.customer as string || null,
          student_id: user.id,
          student_email: user.email,
          student_name: user.user_metadata?.full_name || user.email,
          stripe_product_id: product?.id || null,
          stripe_price_id: price?.id || null,
          product_name: product?.name || planRecord?.name || "Purchase",
          purchase_type: purchaseType,
          amount: amountTotal / 100,
          currency,
          status: "succeeded",
          paid_at: new Date().toISOString(),
          student_matched: true,
          source: "stripe",
          reporting_category: purchaseType === "individual_lesson" ? "individual_lesson" :
            purchaseType === "lesson_package" ? "package" :
            purchaseType === "video_analysis" ? "video_analysis" :
            purchaseType === "subscription" ? "subscription" : "uncategorized",
          metadata: { verified_by: "verify-checkout", package_size: packageSize },
        });
        logStep("Recorded in stripe_payments");
      } else {
        logStep("stripe_payments record already exists", { id: existingSp.id });
      }
    }

    const result = {
      verified: true,
      purchase_type: purchaseType,
      product_name: product?.name || planRecord?.name || "Purchase",
      amount: amountTotal,
      currency,
      package_size: packageSize,
      entitlement: entitlementResult,
      session_mode: session.mode,
      customer_email: session.customer_email || user.email,
    };

    logStep("Verification complete", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logStep("ERROR", { error: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
