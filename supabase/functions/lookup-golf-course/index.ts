import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

interface TeeInfo {
  tee_name: string;
  slope: number | null;
  rating: number | null;
}

interface SearchResult {
  external_id: string;
  name: string;
  city: string | null;
  country: string | null;
  par: number | null;
  tees: TeeInfo[];
}

// In-memory rate limit (resets per cold start) — 15 req/min per user
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

function checkRate(userId: string): boolean {
  const now = Date.now();
  const rec = rateMap.get(userId);
  if (!rec || rec.resetAt < now) {
    rateMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (rec.count >= RATE_LIMIT) return false;
  rec.count += 1;
  return true;
}

const API_BASE = 'https://api.golfcourseapi.com/v1';

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/** Normalise tee data from a variety of possible response shapes. */
function normaliseTees(raw: unknown): TeeInfo[] {
  if (!raw) return [];
  // Object keyed by tee name → { slope, rating }
  if (!Array.isArray(raw) && typeof raw === 'object') {
    return Object.entries(raw as Record<string, any>)
      .map(([k, v]) => ({
        tee_name: String(k),
        slope: pickNumber(v?.slope, v?.Slope, v?.slope_rating),
        rating: pickNumber(v?.rating, v?.Rating, v?.course_rating),
      }))
      .filter((t) => t.tee_name);
  }
  if (Array.isArray(raw)) {
    return raw
      .map((t: any): TeeInfo => ({
        tee_name:
          pickString(t?.tee_name, t?.name, t?.tee, t?.color, t?.colour, t?.tee_color) ?? '',
        slope: pickNumber(t?.slope, t?.Slope, t?.slope_rating),
        rating: pickNumber(t?.rating, t?.Rating, t?.course_rating),
      }))
      .filter((t) => t.tee_name);
  }
  return [];
}

function normaliseCourse(c: any, idx: number): SearchResult {
  const id =
    pickString(c?.id, c?.course_id, c?.uuid, c?._id, c?.external_id) ??
    `${pickString(c?.name, c?.course_name) ?? 'unknown'}-${idx}`;
  // GolfCourseAPI returns tees grouped by gender: { male: [...], female: [...] }
  let teesRaw: any = c?.tees ?? c?.tee_boxes ?? c?.tee_box ?? c?.teeBoxes;
  if (teesRaw && !Array.isArray(teesRaw) && (Array.isArray(teesRaw.male) || Array.isArray(teesRaw.female))) {
    teesRaw = [...(teesRaw.male ?? []), ...(teesRaw.female ?? [])];
  }
  const tees = normaliseTees(teesRaw);
  // Compose course name from club_name + course_name when both exist
  const club = pickString(c?.club_name);
  const courseName = pickString(c?.course_name, c?.name);
  const composedName =
    club && courseName && club.toLowerCase() !== courseName.toLowerCase()
      ? `${club} — ${courseName}`
      : (courseName ?? club ?? 'Unknown course');
  return {
    external_id: id,
    name: composedName,
    city: pickString(c?.city, c?.address?.city, c?.location?.city, c?.location?.address, c?.town),
    country: pickString(c?.country, c?.address?.country, c?.location?.country),
    par: pickNumber(c?.par, c?.total_par, c?.course_par, c?.parTotal),
    tees,
  };
}

async function searchGolfCourseApi(query: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get('GOLF_COURSE_API_KEY');
  if (!apiKey) throw new Error('GOLF_COURSE_API_KEY is not configured');

  const url = `${API_BASE}/search?search_query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Key ${apiKey}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('GolfCourseAPI error', res.status, body);
    throw new Error(`Course search failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.courses)
      ? data.courses
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data)
          ? data.data
          : [];
  return list.slice(0, 10).map((c: any, i: number) => normaliseCourse(c, i));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error('lookup-golf-course auth error', claimsErr);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    if (!checkRate(userId)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded — try again in a minute' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? '').trim();
    if (query.length < 2 || query.length > 100) {
      return new Response(JSON.stringify({ error: 'Query must be 2-100 chars' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const results = await searchGolfCourseApi(query);
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('lookup-golf-course error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});