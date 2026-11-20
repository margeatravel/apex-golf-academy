// BORRADOR — módulo compartido para Google Calendar con OAuth 2.0 directo.
// Reemplaza a _shared/appUserConnector.ts (Connector Gateway de Lovable).
//
// Colocar en: supabase/functions/_shared/googleCalendarDirect.ts
// Reutiliza sin cambios: _shared/appUserConnections.ts (tabla + save/get/delete)
// y _shared/connectionKeyCrypto.ts (AES-GCM con APP_USER_CONNECTION_KEY_SECRET)
// y _shared/appUserScopes.ts (GOOGLE_CALENDAR_SCOPES).
//
// Contenido cifrado en app_user_connections.connection_key_ciphertext:
//   JSON { refresh_token, access_token, expires_at } (expires_at = epoch ms)
// NO una lovack_* — esas mueren con el gateway.
//
// Secretos que usa: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
// (Google Cloud Console, OAuth 2.0 Client ID tipo Web application, con la
// Google Calendar API habilitada). Redirect URI registrada en Google:
//   https://www.margeagolfacademy.com/oauth/google-calendar/return
//
// Uso típico en una función (ver DESIGN.md):
//   import { buildAuthUrl, exchangeCode, callGoogleCalendar, revokeConnection }
//     from "../_shared/googleCalendarDirect.ts";

import { GOOGLE_CALENDAR_SCOPES } from "./appUserScopes.ts";
import {
  deleteConnectionKeyForUser,
  getConnectionKeyForUser,
  saveConnectionKeyForUser,
} from "./appUserConnections.ts";

const CONNECTOR_ID = "google_calendar";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com";

export interface GoogleTokenSet {
  refresh_token: string;
  access_token?: string;
  /** epoch ms en que caduca el access_token */
  expires_at?: number;
}

function clientId(): string {
  const v = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is not set");
  return v;
}

/** URL de autorización de Google para el inicio del flujo (app-user-oauth-start). */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const qs = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // siempre devuelve refresh_token, también al re-vincular
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${qs}`;
}

/** Canjea el code del redirect por el token set (app-user-oauth-complete). */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenSet> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  if (!body.refresh_token) {
    // Sin access_type=offline + prompt=consent Google no devuelve refresh_token.
    throw new Error("Google did not return a refresh_token; check access_type=offline and prompt=consent");
  }
  return {
    refresh_token: body.refresh_token as string,
    access_token: body.access_token as string | undefined,
    expires_at: typeof body.expires_in === "number"
      ? Date.now() + body.expires_in * 1000
      : undefined,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      `Google token refresh failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`,
    ) as Error & { invalidGrant?: boolean };
    // invalid_grant = el usuario revocó el acceso o el refresh caducó:
    // hay que re-vincular (misma semántica que el "credential_*" de antes).
    if (body?.error === "invalid_grant") err.invalidGrant = true;
    throw err;
  }
  return {
    refresh_token: refreshToken, // Google no devuelve uno nuevo al refrescar
    access_token: body.access_token as string | undefined,
    expires_at: typeof body.expires_in === "number"
      ? Date.now() + body.expires_in * 1000
      : undefined,
  };
}

/** Lee el token set cifrado del usuario; null si no hay conexión. */
export async function getStoredTokens(userId: string): Promise<GoogleTokenSet | null> {
  let raw: string | null;
  try {
    raw = await getConnectionKeyForUser(userId, CONNECTOR_ID);
  } catch {
    // Fila vieja cifrada con el secreto anterior (APP_USER_CONNECTION_KEY_SECRET
    // se re-emite en la migración) o corrupta: no se puede descifrar, no sirve.
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GoogleTokenSet;
  } catch {
    // Fila vieja con una lovack_* (cifrado con el secreto anterior): no sirve.
    return null;
  }
}

export async function saveTokens(userId: string, tokens: GoogleTokenSet): Promise<void> {
  await saveConnectionKeyForUser(userId, CONNECTOR_ID, JSON.stringify(tokens));
}

/**
 * Devuelve un access_token válido (refresca y guarda si caducó).
 * Devuelve null si no hay conexión, y lanza con invalidGrant si el
 * refresh fue rechazado (usuario revocó → hay que re-vincular).
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const stored = await getStoredTokens(userId);
  if (!stored?.refresh_token) return null;
  if (stored.access_token && stored.expires_at && stored.expires_at > Date.now() + 60_000) {
    return stored.access_token;
  }
  const fresh = await refreshAccessToken(stored.refresh_token);
  await saveTokens(userId, fresh);
  return fresh.access_token ?? null;
}

export interface CalendarCallResult {
  res: Response;
  /** true si el token fue revocado: el usuario debe re-vincular. */
  reconnectRequired: boolean;
}

/**
 * Llama a la Google Calendar API como el usuario (p. ej.
 * "/calendar/v3/calendars/primary/events?..."). Refresca el token si
 * Google responde 401 y reintenta una vez. Equivale a callAsAppUser
 * del módulo viejo, sin gateway.
 */
export async function callGoogleCalendar(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<CalendarCallResult> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const token = await getValidAccessToken(userId);
  if (!token) {
    return {
      res: new Response(JSON.stringify({ error: "not_connected" }), { status: 400 }),
      reconnectRequired: false,
    };
  }
  const doFetch = (t: string) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${t}`);
    return fetch(`${GOOGLE_CALENDAR_API}${normalizedPath}`, { ...init, headers });
  };
  let res = await doFetch(token);
  if (res.status === 401) {
    // El token guardado caducó entre la lectura y la llamada: refrescar.
    const stored = await getStoredTokens(userId);
    if (stored?.refresh_token) {
      try {
        const fresh = await refreshAccessToken(stored.refresh_token);
        await saveTokens(userId, fresh);
        if (fresh.access_token) res = await doFetch(fresh.access_token);
      } catch (e) {
        if ((e as Error & { invalidGrant?: boolean }).invalidGrant) {
          return { res, reconnectRequired: true };
        }
        throw e;
      }
    }
  }
  return { res, reconnectRequired: false };
}

/**
 * Revoca el acceso en Google (best effort) y borra la conexión guardada
 * (google-calendar-disconnect). La revocación no bloquea el borrado.
 */
export async function revokeConnection(userId: string): Promise<void> {
  const stored = await getStoredTokens(userId);
  if (stored?.refresh_token) {
    try {
      await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(stored.refresh_token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch (e) {
      console.error("Google revoke failed (continuing with local delete):", e);
    }
  }
  await deleteConnectionKeyForUser(userId, CONNECTOR_ID);
}
