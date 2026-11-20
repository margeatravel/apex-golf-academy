import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const CONNECTOR_ID = 'google_calendar';

function waitForOAuthCompletion(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== CONNECTOR_ID ||
        (type !== 'appUserConnectorOAuthComplete' && type !== 'appUserConnectorOAuthFailed')
      ) return;
      cleanup();
      if (type === 'appUserConnectorOAuthComplete') {
        resolve();
        return;
      }
      popup.close();
      reject(new Error(event.data?.reason ?? 'OAuth connection failed.'));
    };
    window.addEventListener('message', onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error('OAuth window closed before completion.'));
    }, 500);
  });
}

export function GoogleCalendarConnect() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const es = language === 'es';
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-calendar-status');
      if (error) throw error;
      return data as { connected: boolean; reconnectRequired?: boolean; calendarName?: string | null };
    },
  });

  const handleConnect = async () => {
    setBusy(true);
    const popup = window.open('', 'lovable-oauth', 'width=600,height=720');
    if (!popup) {
      setBusy(false);
      toast({
        title: es ? 'Ventana bloqueada' : 'Popup blocked',
        description: es ? 'Permite ventanas emergentes e inténtalo de nuevo.' : 'Allow popups and try again.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('app-user-oauth-start', {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      const completion = waitForOAuthCompletion(popup);
      if (data.state) sessionStorage.setItem('gcal_oauth_state', data.state);
      popup.location.href = data.authorizationUrl;
      await completion;
      await queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast({
        title: es ? 'Google Calendar conectado' : 'Google Calendar connected',
        description: es ? 'Tu calendario ya está ligado a tu cuenta.' : 'Your calendar is now linked to your account.',
      });
    } catch (error) {
      popup.close();
      toast({
        title: es ? 'No se pudo conectar' : 'Could not connect',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-my-google-calendar');
      if (error) throw error;
      const r = data as { created: number; updated: number; removed: number; failed: number; pending?: number };
      toast({
        title: es ? 'Calendario sincronizado' : 'Calendar synced',
        description: es
          ? `${r.created} nuevas · ${r.updated} actualizadas · ${r.removed} quitadas${r.failed ? ` · ${r.failed} con error` : ''}${r.pending ? ` · faltan ${r.pending}, vuelve a sincronizar` : ''}`
          : `${r.created} new · ${r.updated} updated · ${r.removed} removed${r.failed ? ` · ${r.failed} failed` : ''}${r.pending ? ` · ${r.pending} left, sync again` : ''}`,
        variant: r.failed ? 'destructive' : undefined,
      });
    } catch (error) {
      toast({
        title: es ? 'No se pudo sincronizar' : 'Could not sync',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('google-calendar-disconnect');
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast({
        title: es ? 'Google Calendar desconectado' : 'Google Calendar disconnected',
      });
    } catch (error) {
      toast({
        title: es ? 'No se pudo desconectar' : 'Could not disconnect',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const connected = !!data?.connected;
  const reconnectRequired = !!data?.reconnectRequired;

  return (
    <div className="pro-zone-tile p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center">
          <CalendarCheck className="w-4 h-4 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ivory">Google Calendar</p>
          <p className="text-xs text-ivory/60 truncate">
            {isLoading
              ? (es ? 'Comprobando…' : 'Checking…')
              : connected
                ? (data?.calendarName ?? (es ? 'Conectado' : 'Connected'))
                : reconnectRequired
                  ? (es ? 'Necesita reconectarse' : 'Needs to be renewed')
                  : (es ? 'No conectado' : 'Not connected')}
          </p>
        </div>
      </div>
      {connected && !reconnectRequired ? (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            onClick={handleSync}
            disabled={busy}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {es ? 'Sincronizar' : 'Sync'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDisconnect}
            disabled={busy}
            aria-label={es ? 'Desconectar' : 'Disconnect'}
            className="text-ivory/70 hover:text-ivory"
          >
            <Unlink className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={handleConnect}
          disabled={busy || isLoading}
          className="shrink-0 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4 mr-1" />}
          {reconnectRequired ? (es ? 'Reconectar' : 'Reconnect') : (es ? 'Conectar' : 'Connect')}
        </Button>
      )}
    </div>
  );
}
