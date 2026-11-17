 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
 import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';
 
 const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
 const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
 
 Deno.serve(async (req) => {
   if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
 
   try {
     // Verify admin
     const authHeader = req.headers.get('Authorization');
     if (!authHeader?.startsWith('Bearer ')) {
       return new Response(JSON.stringify({ error: 'Missing authorization' }), {
         status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }
     const token = authHeader.replace('Bearer ', '');
     const userClient = createClient(SUPABASE_URL, ANON_KEY, {
       global: { headers: { Authorization: authHeader } },
     });
     const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
     if (claimsErr || !claimsData?.claims?.sub) {
       return new Response(JSON.stringify({ error: 'Invalid token' }), {
         status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }
 
     const admin = createClient(SUPABASE_URL, SERVICE_KEY);
 
     // Check admin role
     const userId = claimsData.claims.sub as string;
     const { data: roleRow } = await admin
       .from('user_roles')
       .select('role')
       .eq('user_id', userId)
       .eq('role', 'admin')
       .maybeSingle();
     if (!roleRow) {
       return new Response(JSON.stringify({ error: 'Admin only' }), {
         status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }
 
     const body = await req.json().catch(() => ({}));
     const blockDate = body?.block_date as string | undefined;
     const startTime = body?.start_time as string | undefined;
     const endTime = body?.end_time as string | undefined;
 
     if (!blockDate) {
       return new Response(JSON.stringify({ error: 'block_date required' }), {
         status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }
 
     // Find scheduled lessons on the blocked date
     let query = admin
       .from('lessons')
        .select('id, package_id, lesson_time, student_id, lesson_type')
       .eq('lesson_date', blockDate)
       .eq('status', 'scheduled');
 
     const { data: lessons, error: fetchErr } = await query;
     if (fetchErr) throw fetchErr;
 
     if (!lessons || lessons.length === 0) {
       return new Response(JSON.stringify({ cancelled: 0, restored: 0 }), {
         status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }
 
     // For partial-day blocks, filter lessons within the time range
     let toCancel = lessons;
     if (startTime && endTime) {
       const blockStartMin = timeToMinutes(startTime);
       const blockEndMin = timeToMinutes(endTime);
       toCancel = lessons.filter((l) => {
         const lessonMin = timeToMinutes(String(l.lesson_time));
         return lessonMin >= blockStartMin && lessonMin < blockEndMin;
       });
     }
 
     if (toCancel.length === 0) {
       return new Response(JSON.stringify({ cancelled: 0, restored: 0 }), {
         status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }
 
     // Cancel lessons
     const lessonIds = toCancel.map((l) => l.id);
     const { error: updateErr } = await admin
       .from('lessons')
       .update({ status: 'cancelled' })
       .in('id', lessonIds);
     if (updateErr) throw updateErr;
 
     // Restore package credits for lessons linked to a package
     let restored = 0;
      const packageIds = [...new Set(toCancel.filter((l: any) => l.package_id).map((l: any) => l.package_id!))];
     for (const pkgId of packageIds) {
        const countInPkg = toCancel.filter((l: any) => l.package_id === pkgId).length;
       // Fetch current package state
       const { data: pkg } = await admin
         .from('class_packages')
         .select('classes_remaining, classes_used')
         .eq('id', pkgId)
         .maybeSingle();
       if (pkg) {
         await admin
           .from('class_packages')
           .update({
             classes_remaining: (pkg.classes_remaining ?? 0) + countInPkg,
             classes_used: Math.max(0, (pkg.classes_used ?? 0) - countInPkg),
           })
           .eq('id', pkgId);
         restored += countInPkg;
       }
     }
 
      // Notify affected students
      const affectedStudentIds = [...new Set(toCancel.filter((l: any) => l.student_id).map((l: any) => l.student_id as string))];
      if (affectedStudentIds.length > 0) {
        // Format date for display
        const [y, mo, d] = blockDate.split('-');
        const dateLabel = `${parseInt(d, 10)}/${parseInt(mo, 10)}/${y}`;

        const notificationRows = affectedStudentIds.map((studentId: string) => {
          const studentLessons = toCancel.filter((l: any) => l.student_id === studentId);
          const count = studentLessons.length;
          const reason = body?.reason as string | undefined;
          const message = count === 1
            ? `Your lesson on ${dateLabel} has been cancelled by the coach.${reason ? ` Reason: ${reason}` : ''}`
            : `${count} of your lessons on ${dateLabel} have been cancelled by the coach.${reason ? ` Reason: ${reason}` : ''}`;
          return {
            user_id: studentId,
            type: 'lesson_cancelled_block',
            title: 'Lesson cancelled',
            message,
            link: '/student/lessons',
            metadata: {
              block_date: blockDate,
              cancelled_lesson_ids: studentLessons.map((l: any) => l.id),
              reason: reason || null,
            },
          };
        });

        await admin.from('notifications').insert(notificationRows);
      }

     return new Response(JSON.stringify({ cancelled: toCancel.length, restored }), {
       status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
     });
   } catch (e: any) {
     return new Response(JSON.stringify({ error: e?.message ?? 'Internal error' }), {
       status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
     });
   }
 });
 
 function timeToMinutes(t: string): number {
   const [h, m] = t.split(':').map(Number);
   return (h || 0) * 60 + (m || 0);
 }