import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRow {
  clientName: string;
  packageSize: number;
  paymentDate: string | null;
  amountPaid: number;
  lessonDates: string[];
  /** If the coach chose to merge this row into an existing student, set this to that student's ID */
  mergeIntoId?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rows } = (await req.json()) as { rows: ImportRow[] };
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = {
      studentsCreated: 0,
      studentsMatched: 0,
      studentsMerged: 0,
      packagesCreated: 0,
      packagesSkipped: 0,
      lessonsCreated: 0,
      lessonsSkipped: 0,
      paymentsCreated: 0,
      paymentsSkipped: 0,
      pointsAwarded: 0,
      totalRevenueImported: 0,
      errors: [] as string[],
    };

    // Reference pricing (informational only — never overwrites CANTIDAD DE PAGO)
    const referencePricing: Record<number, number> = {
      1: 1650, 5: 7500, 10: 14850, 20: 26500, 30: 34650,
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowLabel = `Row ${i + 1} (${row.clientName})`;

      try {
        if (!row.clientName || row.clientName.trim() === "") {
          summary.errors.push(`${rowLabel}: Missing client name, skipped`);
          continue;
        }

        const clientName = row.clientName.trim();

        // 1. Resolve student ID
        let studentId: string;

        if (row.mergeIntoId) {
          // Coach explicitly chose to merge into an existing student
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", row.mergeIntoId)
            .single();

          if (!existingProfile) {
            summary.errors.push(`${rowLabel}: mergeIntoId not found — ${row.mergeIntoId}`);
            continue;
          }
          studentId = existingProfile.id;
          summary.studentsMerged++;
        } else {
          // Normal flow: check for exact ilike match, else create new
          const normalizedName = clientName.toLowerCase();
          const { data: existingProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .ilike("full_name", normalizedName);

          if (existingProfiles && existingProfiles.length > 0) {
            studentId = existingProfiles[0].id;
            summary.studentsMatched++;
          } else {
            const placeholderEmail = `import_${Date.now()}_${i}@scgolf.placeholder`;
            const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
              email: placeholderEmail,
              email_confirm: true,
              user_metadata: { full_name: clientName },
            });

            if (createErr || !newUser?.user) {
              summary.errors.push(`${rowLabel}: Failed to create user — ${createErr?.message}`);
              continue;
            }

            studentId = newUser.user.id;
            await supabase
              .from("profiles")
              .update({ full_name: clientName })
              .eq("id", studentId);

            summary.studentsCreated++;
          }
        }

        // 2. Package — duplicate-safe, supports packageSize=0 (pending assignment)
        const lessonDates = (row.lessonDates || []).filter((d) => d && d.trim() !== "");
        const packageSize = row.packageSize || 0; // 0 = pending coach assignment

        // CANTIDAD DE PAGO is the historical collected amount — stored as-is
        const historicalAmountPaid = row.amountPaid || 0;

        // Reference price is informational only
        const referencePrice = packageSize > 0
          ? (referencePricing[packageSize] || (packageSize * 1650))
          : 0;
        const paymentStatus = historicalAmountPaid <= 0
          ? "pending"
          : packageSize === 0
            ? "paid"
            : (referencePrice - historicalAmountPaid) <= 0
              ? "paid"
              : "partial";

        const paymentDate = row.paymentDate || null;

        // Check for existing package: student + size + payment_date
        let pkgQuery = supabase
          .from("class_packages")
          .select("id")
          .eq("user_id", studentId)
          .eq("package_size", packageSize);

        if (paymentDate) {
          pkgQuery = pkgQuery.eq("payment_date", paymentDate);
        } else {
          pkgQuery = pkgQuery.is("payment_date", null);
        }

        const { data: existingPkgs } = await pkgQuery.limit(1);
        const existingPackage = existingPkgs && existingPkgs.length > 0 ? existingPkgs[0] : null;

        let packageId: string;

        if (existingPackage) {
          packageId = existingPackage.id;
          summary.packagesSkipped++;
        } else {
          const pkgName = packageSize > 0 ? `${packageSize}-Lesson Package` : "Pending Assignment";
          const classesRemaining = packageSize > 0 ? Math.max(0, packageSize - lessonDates.length) : 0;
          const { data: newPkg, error: pkgErr } = await supabase
            .from("class_packages")
            .insert({
              user_id: studentId,
              package_size: packageSize,
              classes_used: lessonDates.length,
              classes_remaining: classesRemaining,
              price: referencePrice,
              amount_paid: historicalAmountPaid,
              payment_status: paymentStatus,
              payment_date: paymentDate,
              package_name: pkgName,
              is_active: packageSize === 0 ? true : classesRemaining > 0,
              imported: true,
            })
            .select("id")
            .single();

          if (pkgErr || !newPkg) {
            summary.errors.push(`${rowLabel}: Failed to create package — ${pkgErr?.message}`);
            continue;
          }
          packageId = newPkg.id;
          summary.packagesCreated++;
        }

        // 3. Payment record — exact CANTIDAD DE PAGO, duplicate-safe
        if (historicalAmountPaid > 0) {
          const payDate = paymentDate || new Date().toISOString().split("T")[0];

          const { data: existingPayments } = await supabase
            .from("package_payments")
            .select("id")
            .eq("package_id", packageId)
            .eq("amount", historicalAmountPaid)
            .eq("payment_date", payDate)
            .limit(1);

          if (existingPayments && existingPayments.length > 0) {
            summary.paymentsSkipped++;
          } else {
            const { error: payErr } = await supabase.from("package_payments").insert({
              package_id: packageId,
              amount: historicalAmountPaid,
              payment_date: payDate,
              payment_method: "Import",
              notes: "Imported from spreadsheet",
            });

            if (payErr) {
              summary.errors.push(`${rowLabel}: Payment record — ${payErr.message}`);
            } else {
              summary.paymentsCreated++;
              summary.totalRevenueImported += historicalAmountPaid;
            }
          }
        }

        // 4. Lessons — duplicate-safe, revenue = 0 (revenue tracked via package_payments)
        let lessonsCreatedForRow = 0;
        for (const dateStr of lessonDates) {
          const { data: existingLesson } = await supabase
            .from("lessons")
            .select("id")
            .eq("student_id", studentId)
            .eq("lesson_date", dateStr)
            .eq("status", "completed")
            .limit(1);

          if (existingLesson && existingLesson.length > 0) {
            summary.lessonsSkipped++;
            continue;
          }

          const { error: lessonErr } = await supabase.from("lessons").insert({
            student_id: studentId,
            lesson_date: dateStr,
            lesson_time: "09:00",
            lesson_type: "In-person",
            status: "completed",
            duration_minutes: 60,
            revenue: 0,
            coach_notes: "Imported from spreadsheet",
            imported: true,
          });

          if (lessonErr) {
            summary.errors.push(`${rowLabel}: Lesson on ${dateStr} — ${lessonErr.message}`);
          } else {
            lessonsCreatedForRow++;
            summary.lessonsCreated++;
          }
        }

        // 5. Points — only for newly created lessons
        if (lessonsCreatedForRow > 0) {
          const newPoints = lessonsCreatedForRow * 10;
          const { data: existingPoints } = await supabase
            .from("student_points")
            .select("total_points, total_lessons_ever")
            .eq("user_id", studentId)
            .maybeSingle();

          if (existingPoints) {
            await supabase
              .from("student_points")
              .update({
                total_points: existingPoints.total_points + newPoints,
                total_lessons_ever: existingPoints.total_lessons_ever + lessonsCreatedForRow,
                reward_available: existingPoints.total_points + newPoints >= 100,
              })
              .eq("user_id", studentId);
          } else {
            await supabase.from("student_points").insert({
              user_id: studentId,
              total_points: newPoints,
              total_lessons_ever: lessonsCreatedForRow,
              reward_available: newPoints >= 100,
            });
          }
          summary.pointsAwarded += newPoints;
        }
      } catch (rowErr: any) {
        summary.errors.push(`${rowLabel}: ${rowErr.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
