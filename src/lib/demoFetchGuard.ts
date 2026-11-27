/**
 * DEMO FETCH GUARD — network backstop for Demo Mode.
 *
 * The primary demo layer is the client guard (src/lib/demoClientGuard.ts),
 * which answers every supabase-js call from the demo store. But some code
 * calls Supabase with a raw `fetch()` (e.g. `create-student`,
 * `get-available-slots`, `book-lesson`, `coach-ai-chat`, the tus resumable
 * upload), bypassing the client entirely. This guard catches ALL of it:
 *
 * While demo mode is on, every fetch to `*.supabase.co` is answered locally
 * and NOTHING reaches the real backend — no real reads, no real writes, no
 * real emails, no real Stripe, no real calendar sync.
 *
 * Allowed through (needed to keep the signed-in session alive):
 *  - POST /auth/v1/token            (session refresh)
 *  - GET  /auth/v1/user             (getUser)
 *  - POST /auth/v1/logout           (sign out)
 * Everything else under /auth/v1 (password change, recover, signup, OTP…)
 * is answered with a fake success.
 *
 * Demo IDs (old `xxx-00000000-0000-4000-8000-<12 digits>` shape, `demo-…`
 * prefixed ids like `demo-rec-…` / `demo-open-…`, and anything the demo
 * store creates) all match the guard: in demo mode the guard intercepts by
 * HOST, not by id pattern, so no demo id can ever leak to the real backend.
 */

import { isDemoModeActive } from '@/contexts/DemoModeContext';
import {
  demoInvokeFunction,
  demoAvailableDays,
  demoAiChatReply,
} from '@/lib/demoQuery';
import { nextDemoId } from '@/lib/demoStore';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

async function readJsonBody(init?: RequestInit): Promise<any> {
  try {
    if (typeof init?.body === 'string') return JSON.parse(init.body);
  } catch { /* ignore */ }
  return undefined;
}

async function handleSupabaseFetch(url: string, init: RequestInit | undefined, method: string): Promise<Response | null> {
  const u = new URL(url);
  const path = u.pathname;

  // ── Auth: only session upkeep passes through ──
  if (path.startsWith('/auth/v1/')) {
    if (path === '/auth/v1/token' && method === 'POST') return null;
    if (path === '/auth/v1/user' && method === 'GET') return null;
    if (path === '/auth/v1/logout') return null;
    // Password change, recover, signup, OTP… → fake success, never real.
    return json({});
  }

  // ── Edge functions ──
  if (path.startsWith('/functions/v1/')) {
    const name = path.replace('/functions/v1/', '').split('/')[0].split('?')[0];

    if (name === 'lookup-invite' && method === 'GET') {
      return json(demoInvokeFunction('lookup-invite', { code: u.searchParams.get('code') ?? '' }));
    }
    if (name === 'get-available-slots' && method === 'GET') {
      const start = u.searchParams.get('startDate') ?? new Date().toISOString().slice(0, 10);
      const end = u.searchParams.get('endDate') ?? start;
      return json({ days: demoAvailableDays(start, end) });
    }
    if (name === 'create-student' && method === 'POST') {
      const body = await readJsonBody(init);
      return json(demoInvokeFunction('create-student', body));
    }
    if (name === 'book-lesson' && method === 'POST') {
      const body = await readJsonBody(init);
      return json(demoInvokeFunction('book-lesson', body));
    }
    if (name === 'coach-ai-chat' && method === 'POST') {
      const body = await readJsonBody(init);
      const { sse, conversationId } = demoAiChatReply(
        String(body?.message ?? ''),
        body?.conversation_id ?? null,
      );
      return new Response(sse, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'X-Conversation-Id': conversationId,
        },
      });
    }
    if (method === 'GET') return json(demoInvokeFunction(name, Object.fromEntries(u.searchParams.entries())));
    const body = await readJsonBody(init);
    return json(demoInvokeFunction(name, body));
  }

  // ── Storage ──
  if (path.startsWith('/storage/v1/')) {
    // tus resumable upload handshake (ProZoneMediaUploader): fake an upload URL.
    if (path === '/storage/v1/upload/resumable' && method === 'POST') {
      const uploadId = `demo-${nextDemoId('upl')}`;
      return new Response(null, {
        status: 201,
        headers: { Location: `/storage/v1/upload/resumable/${uploadId}` },
      });
    }
    if (path.startsWith('/storage/v1/upload/resumable/') && method === 'PATCH') {
      const size = Number((init?.headers as any)?.['Upload-Length'] ?? 0);
      return new Response(null, {
        status: 204,
        headers: { 'Upload-Offset': String(size) },
      });
    }
    if (path.startsWith('/storage/v1/upload/resumable/')) {
      return new Response(null, { status: 204 });
    }
    return json({});
  }

  // ── REST: safety net. No direct REST fetch is expected (the client guard
  // handles all supabase-js traffic), so answer empty success — never real
  // data, never a real write.
  if (path.startsWith('/rest/v1/')) {
    const headers = new Headers((init?.headers as any) ?? undefined);
    const wantsObject = (headers.get('accept') || '').includes('vnd.pgrst.object');
    if (method === 'GET' && wantsObject) {
      return json(
        { code: 'PGRST116', details: 'demo', hint: null, message: 'demo' },
        406,
      );
    }
    if (method === 'GET') return json([], 200, { 'Content-Range': '*/0' });
    return json(method === 'POST' ? {} : [], 200, { 'Content-Range': '*/0' });
  }

  // Realtime websocket upgrade goes through fetch in some environments; the
  // client guard already neuters channels in demo, so block any stray call.
  if (path.startsWith('/realtime/v1/')) return json({});

  return null;
}

let installed = false;

export function installDemoFetchGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isDemoModeActive()) return orig(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('supabase.co')) return orig(input, init);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    // Request objects can carry a body; fall back to the original fetch body
    // handling by reading it only when init has none.
    let effectiveInit = init;
    if (!effectiveInit && input instanceof Request) {
      try {
        const text = await input.clone().text();
        effectiveInit = { method, headers: input.headers, body: text || undefined };
      } catch { /* ignore */ }
    }
    const handled = await handleSupabaseFetch(url, effectiveInit, method).catch(() => null);
    if (handled) return handled;
    return orig(input, init);
  };
}

installDemoFetchGuard();
