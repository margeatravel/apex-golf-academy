import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Página de retorno del OAuth directo de Google Calendar.
// Google redirige aquí con ?code=...&state=... (o ?error=access_denied).
// El `state` se verifica contra sessionStorage (protección CSRF): lo guarda
// quien abrió el popup (GoogleCalendarConnect) con la clave
// 'gcal_oauth_state' y lo lee la página de retorno desde el sessionStorage
// del opener (el del popup es una copia del momento de abrirlo, así que
// puede no tener el valor guardado después).
//
// NOTA: hasta que GoogleCalendarConnect guarde el `state` que devuelve
// app-user-oauth-start, no habrá valor guardado y la verificación se salta
// con un aviso (fail-soft). En cuanto el guardado exista, un `state`
// distinto al guardado rechaza el flujo. No romper el re-vínculo por esto.

const STATE_KEY = 'gcal_oauth_state';

function readStoredState(): string | null {
  try {
    return window.opener?.sessionStorage?.getItem(STATE_KEY)
      ?? sessionStorage.getItem(STATE_KEY);
  } catch {
    return sessionStorage.getItem(STATE_KEY);
  }
}

function clearStoredState() {
  try {
    window.opener?.sessionStorage?.removeItem(STATE_KEY);
  } catch {
    // opener no accesible; se limpia solo el propio
  }
  sessionStorage.removeItem(STATE_KEY);
}

export default function GoogleCalendarReturn() {
  const [message, setMessage] = useState('Finishing connection…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifyOpenerAndClose = (
      type: 'appUserConnectorOAuthComplete' | 'appUserConnectorOAuthFailed',
      reason?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: 'google_calendar', ...(reason ? { reason } : {}) },
        window.location.origin,
      );
      window.close();
    };
    const fail = (reason: string) => {
      setMessage(reason);
      notifyOpenerAndClose('appUserConnectorOAuthFailed', reason);
    };

    const error = params.get('error');
    if (error) {
      fail(params.get('error_description') ?? `Google authorization failed (${error}).`);
      return;
    }
    const code = params.get('code');
    if (!code) {
      fail('OAuth completed without an exchange code.');
      return;
    }
    const state = params.get('state');
    const expected = readStoredState();
    clearStoredState();
    if (expected && state !== expected) {
      fail('Could not verify this connection request. Please try again from your profile.');
      return;
    }
    if (!expected) {
      console.warn(
        'Google Calendar OAuth: no stored state to verify against; proceeding without the CSRF check.',
      );
    }
    void supabase.functions
      .invoke('app-user-oauth-complete', { body: { code, origin: window.location.origin } })
      .then(({ error }) => {
        if (error) throw error;
        notifyOpenerAndClose('appUserConnectorOAuthComplete');
      })
      .catch(() => {
        fail('Could not finish the connection.');
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-ivory/80 text-sm">{message}</p>
    </div>
  );
}
