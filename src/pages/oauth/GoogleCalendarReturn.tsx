import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function GoogleCalendarReturn() {
  const [message, setMessage] = useState('Finishing connection…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifyOpenerAndClose = (
      type: 'appUserConnectorOAuthComplete' | 'appUserConnectorOAuthFailed',
    ) => {
      window.opener?.postMessage(
        { type, connectorId: 'google_calendar' },
        window.location.origin,
      );
      window.close();
    };
    if (params.get('success') !== 'true') {
      setMessage(params.get('error') ?? 'OAuth did not complete.');
      notifyOpenerAndClose('appUserConnectorOAuthFailed');
      return;
    }
    const code = params.get('code');
    if (!code) {
      if (params.get('offline_access_allowed') === 'false') {
        const reason =
          'This connection cannot be used yet: a workspace admin must enable offline access on the App User Connector client in workspace App User Connectors settings.';
        setMessage(reason);
        window.opener?.postMessage(
          { type: 'appUserConnectorOAuthFailed', connectorId: 'google_calendar', reason },
          window.location.origin,
        );
        return;
      }
      setMessage('OAuth completed without an exchange code.');
      notifyOpenerAndClose('appUserConnectorOAuthFailed');
      return;
    }
    void supabase.functions
      .invoke('app-user-oauth-complete', { body: { code } })
      .then(({ error }) => {
        if (error) throw error;
        notifyOpenerAndClose('appUserConnectorOAuthComplete');
      })
      .catch(() => {
        setMessage('Could not finish the connection.');
        notifyOpenerAndClose('appUserConnectorOAuthFailed');
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-ivory/80 text-sm">{message}</p>
    </div>
  );
}
