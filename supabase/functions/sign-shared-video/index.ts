import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function extractPath(urlOrPath: string | null | undefined, bucket: string): string | null {
  if (!urlOrPath) return null;
  const s = String(urlOrPath).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    return s.replace(new RegExp(`^${bucket}/`), '');
  }
  const re = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?]+)`);
  const m = s.match(re);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let videoId: string | null = null;
    if (req.method === 'GET') {
      videoId = new URL(req.url).searchParams.get('id');
    } else {
      const body = await req.json().catch(() => ({}));
      videoId = body?.video_id ?? body?.id ?? null;
    }

    if (!videoId || typeof videoId !== 'string') {
      return new Response(JSON.stringify({ error: 'video_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: video, error } = await admin
      .from('videos')
      .select('id, file_url, thumbnail_url')
      .eq('id', videoId)
      .maybeSingle();

    if (error || !video) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    async function signEither(url: string | null): Promise<string | null> {
      if (!url) return null;
      for (const bucket of ['lesson-videos', 'golf-media'] as const) {
        const path = extractPath(url, bucket);
        if (path) {
          const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60);
          if (data?.signedUrl) return data.signedUrl;
        }
      }
      return url;
    }
    const fileUrl = await signEither(video.file_url);
    const thumbUrl = await signEither(video.thumbnail_url);

    return new Response(JSON.stringify({
      file_url: fileUrl,
      thumbnail_url: thumbUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});