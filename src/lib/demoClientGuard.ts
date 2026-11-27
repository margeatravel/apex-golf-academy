/**
 * DEMO CLIENT GUARD — patches the shared Supabase client while demo mode is on.
 *
 * Same pattern as src/lib/previewWriteGuard.ts, but for Demo Mode the patch is
 * not a stub: reads AND writes are served from the demo store
 * (src/lib/demoStore.ts) through DemoQueryBuilder, so the whole app keeps
 * working with fictitious data and NOTHING reaches the network:
 *
 *  - supabase.from(table)        → DemoQueryBuilder (demo store)
 *  - supabase.rpc(name, params)  → demoRpc
 *  - supabase.functions.invoke   → demoInvokeFunction (no real edge function,
 *                                  so no real email / Stripe / calendar call)
 *  - supabase.storage            → fake storage (signed URLs → placeholder)
 *  - supabase.channel(...)       → no-op channel (no live real-time pushes)
 *  - supabase.auth.updateUser    → fake success (never changes the real password)
 *
 * The patch is installed once at import and checks sessionStorage on every
 * call, so toggling demo on/off takes effect immediately. Outside demo mode
 * the client is completely untouched.
 */

import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { DemoQueryBuilder, demoRpc, demoInvokeFunction, demoStorageApi } from '@/lib/demoQuery';

let patched = false;

function fakeChannel() {
  const ch: any = {
    on: () => ch,
    subscribe: (cb?: (status: string) => void) => {
      try { cb?.('SUBSCRIBED'); } catch { /* ignore */ }
      return ch;
    },
    unsubscribe: () => ch,
    send: async () => ({}),
    track: async () => ({}),
    untrack: async () => ({}),
    presenceState: () => ({}),
  };
  return ch;
}

export function installDemoClientGuard() {
  if (patched || typeof window === 'undefined') return;
  patched = true;

  const client = supabase as any;

  const origFrom = client.from.bind(client);
  client.from = (table: string) => {
    if (!isDemoModeActive()) return origFrom(table);
    return new DemoQueryBuilder(table);
  };

  const origRpc = client.rpc.bind(client);
  client.rpc = (name: string, params?: any, _options?: any) => {
    if (!isDemoModeActive()) return origRpc(name, params, _options);
    return Promise.resolve({ data: demoRpc(name, params), error: null });
  };

  const origInvoke = client.functions.invoke.bind(client.functions);
  client.functions.invoke = (name: string, options?: any) => {
    if (!isDemoModeActive()) return origInvoke(name, options);
    let body: any = undefined;
    try {
      body = options?.body;
      if (typeof body === 'string') body = JSON.parse(body);
    } catch { /* keep raw */ }
    return Promise.resolve({ data: demoInvokeFunction(name, body), error: null });
  };

  const origStorageFrom = client.storage.from.bind(client.storage);
  client.storage.from = (bucket: string) => {
    if (!isDemoModeActive()) return origStorageFrom(bucket);
    return demoStorageApi(bucket);
  };

  const origChannel = client.channel.bind(client);
  client.channel = (name: string, ...args: any[]) => {
    if (!isDemoModeActive()) return origChannel(name, ...args);
    return fakeChannel();
  };

  const origRemoveChannel = client.removeChannel.bind(client);
  client.removeChannel = (channel: any) => {
    if (!isDemoModeActive()) return origRemoveChannel(channel);
    return Promise.resolve('ok');
  };

  const origUpdateUser = client.auth.updateUser.bind(client.auth);
  client.auth.updateUser = async (attrs: any, options?: any) => {
    if (!isDemoModeActive()) return origUpdateUser(attrs, options);
    return { data: { user: null }, error: null };
  };
}

installDemoClientGuard();
