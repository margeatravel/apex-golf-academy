import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, hasProZoneAccess } from '@/contexts/AuthContext';

export interface BroadcastNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  audience: string;
  created_at: string;
  read: boolean;
}

/**
 * In-app broadcast notifications (e.g. new Pro Zone video).
 * Additive: does not touch the per-user `notifications` table used by coaches.
 */
export function useBroadcastNotifications() {
  const { user, effectivePlan, graceUntil, trialEndsAt } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const proZoneAllowed = hasProZoneAccess(effectivePlan, graceUntil, trialEndsAt);

  const { data, isLoading } = useQuery({
    queryKey: ['broadcast-notifications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: rows, error }, { data: reads, error: readErr }] = await Promise.all([
        supabase
          .from('broadcast_notifications')
          .select('id, type, title, body, link_url, audience, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('broadcast_notification_reads')
          .select('notification_id')
          .eq('user_id', userId!),
      ]);
      if (error) throw error;
      if (readErr) throw readErr;

      const readSet = new Set((reads ?? []).map((r: any) => r.notification_id));
      return (rows ?? []).map((n: any) => ({
        ...n,
        read: readSet.has(n.id),
      })) as BroadcastNotification[];
    },
  });

  // Realtime refresh on new broadcasts.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('notifications-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'broadcast_notifications' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['broadcast-notifications'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const notifications = useMemo(() => {
    return (data ?? []).filter((n) => (n.audience === 'pro_zone' ? proZoneAllowed : true));
  }, [data, proZoneAllowed]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (notificationId: string) => {
    if (!userId) return;
    await supabase
      .from('broadcast_notification_reads')
      .upsert({ user_id: userId, notification_id: notificationId }, { onConflict: 'user_id,notification_id' });
    queryClient.invalidateQueries({ queryKey: ['broadcast-notifications'] });
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await supabase
      .from('broadcast_notification_reads')
      .upsert(
        unread.map((n) => ({ user_id: userId, notification_id: n.id })),
        { onConflict: 'user_id,notification_id' },
      );
    queryClient.invalidateQueries({ queryKey: ['broadcast-notifications'] });
  };

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead };
}
