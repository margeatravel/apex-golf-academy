/**
 * Extracts the real error message returned by a Supabase Edge Function.
 * `supabase.functions.invoke` surfaces only "Edge Function returned a non-2xx
 * status code"; the actual JSON body lives on `error.context` (a Response).
 */
export async function getFunctionErrorMessage(error: any, fallback = 'Unexpected error'): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json().catch(async () => {
        const txt = await ctx.clone().text().catch(() => '');
        return txt ? { error: txt } : null;
      });
      const msg = body?.error || body?.message;
      if (msg) return typeof msg === 'string' ? msg : JSON.stringify(msg);
    }
  } catch {
    /* ignore */
  }
  return error?.message || fallback;
}
