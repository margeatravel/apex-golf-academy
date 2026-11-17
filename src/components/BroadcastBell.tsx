import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useBroadcastNotifications, type BroadcastNotification } from '@/hooks/useBroadcastNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

/**
 * Student header bell with in-app broadcast notifications (Pro Zone videos, etc.).
 * Additive component — reuses existing dropdown/button primitives.
 * Now also promotes Web Push (PWA) activation when supported and not yet subscribed.
 */
export function BroadcastBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useBroadcastNotifications();
  const { isSupported, isSubscribed, permission, loading, subscribe } = usePushNotifications();
  const { platform, isStandalone } = useInstallPrompt();

  const [open, setOpen] = useState(false);
  const [justActivated, setJustActivated] = useState(false);

  const showPromo = isSupported && !isSubscribed && permission !== 'denied';
  const isIOSNotStandalone = platform === 'ios' && !isStandalone;

  const handleClick = async (n: BroadcastNotification) => {
    if (!n.read) await markAsRead(n.id);
    if (n.link_url) navigate(n.link_url);
  };

  const handleActivate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await subscribe();
    if (ok) setJustActivated(true);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setJustActivated(false);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-push-bell=""
          aria-label="Notificaciones"
          className="relative h-9 w-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}
        >
          <Bell className="h-4 w-4 text-ivory" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : showPromo ? (
            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary border-2 border-background" />
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 max-h-[70vh] overflow-y-auto">
        {showPromo && !justActivated && (
          <div className="px-3 py-3 border-b border-primary/20 bg-primary/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ivory">Activa las notificaciones</p>
                <p className="text-xs text-ivory/70 mt-1">
                  Entérate cuando subamos nuevos tips a Pro Zone y mantente al día con tu juego.
                </p>
              </div>
              {!isIOSNotStandalone && (
                <div
                  className="pt-0.5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <Switch
                    checked={isSubscribed}
                    disabled={loading}
                    onCheckedChange={(checked) => {
                      if (checked) void subscribe();
                    }}
                  />
                </div>
              )}
            </div>
            {isIOSNotStandalone ? (
              <p className="text-xs text-ivory/80 mt-2">
                Para recibir avisos en iPhone: toca el botón compartir de Safari y elige Agregar a
                pantalla de inicio.
              </p>
            ) : null}
          </div>
        )}

        {justActivated && (
          <div className="px-3 py-3 border-b border-white/10 bg-white/5 flex items-center gap-2">
            <Check className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium text-ivory">Notificaciones activadas</span>
          </div>
        )}

        <div className="px-3 py-2 border-b border-white/10 text-sm font-medium text-ivory">
          Notificaciones
        </div>

        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-ivory/60">
            No tienes notificaciones
          </div>
        ) : (
          <div>
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className="w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors flex gap-2"
              >
                <span
                  className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                    n.read ? 'bg-transparent' : 'bg-primary'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ivory truncate">{n.title}</span>
                  {n.body && (
                    <span className="block text-xs text-ivory/70 truncate">{n.body}</span>
                  )}
                  <span className="block text-[11px] text-ivory/45 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-ivory/70 hover:text-ivory"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
            >
              Marcar todas como leídas
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
