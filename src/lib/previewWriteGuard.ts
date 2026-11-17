import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * CENTRALIZED WRITE GUARD for the student preview (impersonation) sandbox.
 *
 * Inside the preview the signed-in Supabase session belongs to the COACH/ADMIN,
 * not to the previewed student. The UI stays fully interactive (sandbox mode),
 * so every mutation must be intercepted at the data layer instead:
 *
 *  - table writes: insert / update / upsert / delete
 *  - RPCs that are not obviously read-only (get_* / can_* / is_* / list_*)
 *  - Edge Function calls (incl. Stripe checkout) except a read-only allowlist
 *  - Storage writes: upload / update / remove / move / copy
 *
 * All of them resolve to a simulated success and show a toast. Nothing is sent
 * to the backend. Outside the preview the client is untouched.
 */

let active = false;
let patched = false;
let lastToastAt = 0;

/** Read-only Edge Functions that may still run so navigation works. */
const READ_ONLY_FUNCTIONS = new Set([
  'get-available-slots',
  'apex-ai-availability',
  'check-subscription',
  'sign-shared-video',
  'lookup-golf-course',
  'lookup-invite',
  'resend-domain-status',
  // Managing account-less family members is a legitimate action the coach
  // performs on behalf of the previewed student, so it is not simulated.
  'create-managed-family-member',
  'update-managed-family-member',
]);

/** Read-only RPCs that don't match the naming prefixes below. */
const READ_ONLY_RPCS = new Set([
  'search_family_candidates',
  'family_request_people',
]);

const isReadOnlyRpc = (name: string) =>
  READ_ONLY_RPCS.has(name) || /^(get_|can_|is_|has_|list_|count_)/.test(name);

function simulatedToast() {
  const now = Date.now();
  if (now - lastToastAt < 1200) return;
  lastToastAt = now;
  toast.info('Modo preview: acción simulada, no se guardó nada.');
}

/** A thenable that mimics a successful Supabase response. */
function simulatedResult(payload: any = null) {
  simulatedToast();
  const result = { data: payload, error: null, count: null, status: 200, statusText: 'OK' };
  const thenable: any = {
    ...result,
    select: () => thenable,
    single: () => thenable,
    maybeSingle: () => thenable,
    eq: () => thenable,
    neq: () => thenable,
    in: () => thenable,
    match: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    catch: () => Promise.resolve(result),
    finally: (cb: any) => Promise.resolve(result).finally(cb),
  };
  return thenable;
}

/** Install the guard once; it only acts while `active` is true. */
function patchClient() {
  if (patched) return;
  patched = true;

  const client = supabase as any;

  const origFrom = client.from.bind(client);
  client.from = (table: string) => {
    const builder = origFrom(table);
    if (!active) return builder;
    for (const op of ['insert', 'update', 'upsert', 'delete'] as const) {
      builder[op] = () => simulatedResult(null);
    }
    return builder;
  };

  const origRpc = client.rpc.bind(client);
  client.rpc = (name: string, params?: any, options?: any) => {
    if (active && !isReadOnlyRpc(name)) return simulatedResult(null);
    return origRpc(name, params, options);
  };

  const origInvoke = client.functions.invoke.bind(client.functions);
  client.functions.invoke = (name: string, options?: any) => {
    if (active && !READ_ONLY_FUNCTIONS.has(name)) {
      simulatedToast();
      return Promise.resolve({ data: { simulated: true, url: null }, error: null });
    }
    return origInvoke(name, options);
  };

  const origStorageFrom = client.storage.from.bind(client.storage);
  client.storage.from = (bucket: string) => {
    const api = origStorageFrom(bucket);
    if (!active) return api;
    for (const op of ['upload', 'update', 'remove', 'move', 'copy', 'uploadToSignedUrl'] as const) {
      (api as any)[op] = async () => {
        simulatedToast();
        return { data: { path: 'preview/simulated' }, error: null };
      };
    }
    return api;
  };

  const origUpdateUser = client.auth.updateUser.bind(client.auth);
  client.auth.updateUser = async (attrs: any, options?: any) => {
    if (active) {
      simulatedToast();
      return { data: { user: null }, error: null };
    }
    return origUpdateUser(attrs, options);
  };
}

/**
 * DISABLED BY PRODUCT DECISION: inside the student preview every action must
 * run for real (writes, edge functions, storage and payments included). The
 * guard is kept inert so existing imports keep working and it can be switched
 * back on by restoring `active = enabled`.
 */
export function setPreviewWriteGuard(_enabled: boolean) {
  active = false;
}

export const isPreviewWriteGuardActive = () => active;

/**
 * Coach preview (admin viewing a coach's portal): writes ARE blocked.
 * Independent from the student-preview switch above.
 */
export function setCoachPreviewWriteGuard(enabled: boolean) {
  patchClient();
  active = enabled;
}
