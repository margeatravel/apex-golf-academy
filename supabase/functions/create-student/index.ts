import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity using getClaims (compatible with signing-keys JWTs)
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !callerId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin, staff, and coaches may create students. The authenticated caller
    // remains the assigned coach for every student created through this flow.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roleCheck } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin", "staff", "coach"])
      .limit(1)
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { name, phone, email } = body;

    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: "Name is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const trimmedName = name.trim();
    const trimmedPhone = phone?.trim() || null;
    const trimmedEmail = email?.trim() || null;

    if (trimmedEmail) {
      const { data: existingProfile, error: existingProfileError } = await serviceClient
        .from("profiles")
        .select("id, plan_tier, assigned_coach_id")
        .ilike("email", trimmedEmail)
        .maybeSingle();

      if (existingProfileError) {
        return new Response(JSON.stringify({ error: existingProfileError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (existingProfile?.id) {
        const updates: Record<string, unknown> = {
          full_name: trimmedName,
          plan_tier: existingProfile.plan_tier || "free",
          assigned_coach_id: existingProfile.assigned_coach_id || callerId,
        };
        if (trimmedPhone) updates.phone = trimmedPhone;

        const { error: updateExistingError } = await serviceClient
          .from("profiles")
          .update(updates)
          .eq("id", existingProfile.id);

        if (updateExistingError) {
          return new Response(JSON.stringify({ error: updateExistingError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await serviceClient
          .from("user_roles")
          .upsert(
            { user_id: existingProfile.id, role: "student" },
            { onConflict: "user_id,role", ignoreDuplicates: true }
          );

        return new Response(
          JSON.stringify({ id: existingProfile.id, email: trimmedEmail, existing: true }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Build a unique placeholder email if none provided
    const slug = trimmedName
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9.]/g, "");
    const finalEmail =
      trimmedEmail || `${slug}.${Date.now()}@placeholder.sc`;

    const { data: newUser, error: createError } =
      await serviceClient.auth.admin.createUser({
        email: finalEmail,
        email_confirm: true,
        password: crypto.randomUUID(), // random password, student won't login with this
        user_metadata: { full_name: trimmedName },
      });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const newId = newUser.user.id;

    // The handle_new_user trigger creates the profile and student role automatically.
    // Now update profile with extra fields
    const updates: Record<string, unknown> = {
      plan_tier: "free",
      assigned_coach_id: callerId,
    };
    if (trimmedPhone) updates.phone = trimmedPhone;

    await serviceClient
      .from("profiles")
      .update(updates)
      .eq("id", newId);

    return new Response(
      JSON.stringify({ id: newId, email: finalEmail }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
