// Must not import the backend client: this runs before it is created.
const isDemoModeActive = () => {
  try { return sessionStorage.getItem('apex_demo_mode_v1') === '1'; } catch { return false; }
};

/**
 * Demo mode uses fake IDs (e.g. `std-00000000-0000-4000-8000-000000000001`).
 * Any backend request that still carries one of them would fail ("invalid uuid")
 * and surface an error. While demo mode is on, such requests are answered
 * locally with an empty success so every screen loads.
 */
const DEMO_ID = /-00000000-0000-4000-8000-\d{12}/;

let installed = false;

export function installDemoFetchGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isDemoModeActive()) return orig(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('supabase.co')) return orig(input, init);
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch { /* keep raw */ }
    const body = typeof init?.body === 'string' ? init.body : '';
    if (!DEMO_ID.test(decoded) && !DEMO_ID.test(body)) return orig(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const method = (init?.method || 'GET').toUpperCase();
    const wantsObject = (headers.get('accept') || '').includes('vnd.pgrst.object');
    if (url.includes('/rest/v1/') && method === 'GET' && wantsObject) {
      return new Response(
        JSON.stringify({ code: 'PGRST116', details: 'demo', hint: null, message: 'demo' }),
        { status: 406, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const payload = url.includes('/rest/v1/') ? '[]' : '{}';
    return new Response(payload, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/0' },
    });
  };
}

installDemoFetchGuard();
