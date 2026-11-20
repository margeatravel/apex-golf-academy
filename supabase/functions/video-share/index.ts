import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ORIGIN = "https://www.margeagolfacademy.com";
const SITE_NAME = "Margea Golf Academy";
const FALLBACK_IMAGE = `${APP_ORIGIN}/share-cover.jpg`;

const BOT_UA = /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|WhatsApp|SkypeUriPreview|Pinterest|redditbot|Applebot|Googlebot|bingbot|vkShare|iframely|Embedly|quora link preview)/i;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function renderMetaHtml(opts: {
  title: string;
  description: string;
  image: string;
  videoUrl: string | null;
  pageUrl: string;
  appUrl: string;
}): string {
  const { title, description, image, videoUrl, pageUrl, appUrl } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const videoTags = videoUrl ? `
    <meta property="og:video" content="${escapeHtml(videoUrl)}" />
    <meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}" />
    <meta property="og:video:type" content="video/mp4" />
    <meta property="og:video:width" content="1280" />
    <meta property="og:video:height" content="720" />
    <meta name="twitter:player" content="${escapeHtml(videoUrl)}" />
    <meta name="twitter:player:width" content="1280" />
    <meta name="twitter:player:height" content="720" />
  ` : "";
  return `<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${escapeHtml(appUrl)}" />
<meta property="og:type" content="video.other" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${escapeHtml(pageUrl)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="${videoUrl ? "player" : "summary_large_image"}" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
${videoTags}
<meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}" />
</head><body>
<p>Redirecting to <a href="${escapeHtml(appUrl)}">${t}</a>…</p>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = (url.searchParams.get("id") ?? "").trim();
    const ua = req.headers.get("user-agent") ?? "";
    const isBot = BOT_UA.test(ua);
    const appUrl = `${APP_ORIGIN}/v/${encodeURIComponent(id)}`;

    if (!id) {
      return new Response("Missing id", { status: 400, headers: corsHeaders });
    }

    // For real browsers: redirect immediately to the SPA page.
    if (!isBot) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: appUrl },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: video } = await service
      .from("videos")
      .select("id, title, description, thumbnail_url, file_url, category, student_id, lesson_id, upload_date")
      .eq("id", id)
      .maybeSingle();

    let title = "Margea Golf Academy";
    let description = "Coaching video";
    let image = FALLBACK_IMAGE;
    let videoUrl: string | null = null;

    if (video) {
      // Resolve student first name
      let studentName = "";
      if (video.student_id) {
        const { data: profile } = await service
          .from("profiles")
          .select("full_name")
          .eq("id", video.student_id)
          .maybeSingle();
        if (profile?.full_name) studentName = String(profile.full_name).split(" ")[0];
      }

      // Resolve lesson date
      let lessonDate: string | null = null;
      if (video.lesson_id) {
        const { data: lesson } = await service
          .from("lessons")
          .select("lesson_date")
          .eq("id", video.lesson_id)
          .maybeSingle();
        if (lesson?.lesson_date) lessonDate = lesson.lesson_date;
      }
      if (!lessonDate && video.upload_date) lessonDate = video.upload_date;

      const baseTitle = video.title || "Coaching video";
      title = studentName ? `${studentName} — ${baseTitle}` : baseTitle;
      const cat = video.category === "lesson" ? "Lesson" : video.category === "analysis" ? "Swing analysis" : "Video";
      const dateLabel = formatDate(lessonDate);
      description = [cat, dateLabel, SITE_NAME].filter(Boolean).join(" · ");
      if (video.thumbnail_url) image = video.thumbnail_url;
      if (video.file_url) videoUrl = video.file_url;

      // Bucket is now private — mint short-lived signed URLs for bot previews.
      const extractPath = (s: string | null): string | null => {
        if (!s) return null;
        const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/lesson-videos\/([^?]+)/);
        return m ? decodeURIComponent(m[1]) : null;
      };
      const filePath = extractPath(video.file_url);
      const thumbPath = extractPath(video.thumbnail_url);
      if (filePath) {
        const { data: s } = await service.storage.from('lesson-videos').createSignedUrl(filePath, 60 * 60);
        if (s?.signedUrl) videoUrl = s.signedUrl;
      }
      if (thumbPath) {
        const { data: s } = await service.storage.from('lesson-videos').createSignedUrl(thumbPath, 60 * 60);
        if (s?.signedUrl) image = s.signedUrl;
      }
    }

    const html = renderMetaHtml({
      title, description, image, videoUrl,
      pageUrl: req.url,
      appUrl,
    });

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});