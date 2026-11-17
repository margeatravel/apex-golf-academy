import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify caller is admin
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const {
      sourceStudentId,
      newStudentProfile,
      lessonIds = [],
      packageIds = [],
      paymentIds = [],
      packagePaymentIds = [],
      videoIds = [],
      mediaIds = [],
      drillIds = [],
    } = body

    if (!sourceStudentId || !newStudentProfile?.full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields: sourceStudentId, newStudentProfile.full_name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 1: Create an auth user first (profiles.id has FK to auth.users)
    const placeholderEmail = newStudentProfile.email && !newStudentProfile.email.includes('@placeholder.local')
      ? newStudentProfile.email
      : `split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: placeholderEmail,
      email_confirm: true,
      user_metadata: {
        full_name: newStudentProfile.full_name,
      },
      // No password — this is a data-only profile managed by the coach
    })

    if (authError || !authUser?.user) {
      return new Response(JSON.stringify({ error: `Failed to create auth user: ${authError?.message || 'Unknown error'}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newId = authUser.user.id

    // Step 2: Update the auto-created profile with full details
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: placeholderEmail,
        full_name: newStudentProfile.full_name,
        phone: newStudentProfile.phone || null,
        handicap: newStudentProfile.handicap || null,
      })
      .eq('id', newId)

    if (profileError) {
      return new Response(JSON.stringify({ error: `Failed to update profile: ${profileError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Ensure student role exists (trigger should have created it, but be safe)
    await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: newId, role: 'student' }, { onConflict: 'user_id,role' })

    const errors: string[] = []

    // Step 3: Reassign lessons
    if (lessonIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('lessons')
        .update({ student_id: newId })
        .in('id', lessonIds)
      if (error) errors.push(`Lessons: ${error.message}`)
    }

    // Step 4: Reassign packages
    if (packageIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('class_packages')
        .update({ user_id: newId })
        .in('id', packageIds)
      if (error) errors.push(`Packages: ${error.message}`)
    }

    // Step 5: Reassign payments
    if (paymentIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('payments')
        .update({ student_id: newId })
        .in('id', paymentIds)
      if (error) errors.push(`Payments: ${error.message}`)
    }

    // Step 6: Reassign videos
    if (videoIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('videos')
        .update({ student_id: newId })
        .in('id', videoIds)
      if (error) errors.push(`Videos: ${error.message}`)
    }

    // Step 7: Reassign media
    if (mediaIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('student_media')
        .update({ student_id: newId })
        .in('id', mediaIds)
      if (error) errors.push(`Media: ${error.message}`)
    }

    // Step 8: Reassign drills
    if (drillIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('student_drills')
        .update({ student_id: newId })
        .in('id', drillIds)
      if (error) errors.push(`Drills: ${error.message}`)
    }

    return new Response(JSON.stringify({
      success: true,
      newStudentId: newId,
      reassigned: {
        lessons: lessonIds.length,
        packages: packageIds.length,
        payments: paymentIds.length,
        videos: videoIds.length,
        media: mediaIds.length,
        drills: drillIds.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
