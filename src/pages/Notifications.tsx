import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, CheckCheck, ExternalLink, Calendar, Clock, User, Mail, Tag, DollarSign, Video, Info, Trash2, Package, FileText, AlertTriangle, Flag, MapPin } from "lucide-react";
import { InternalHeader } from "@/components/InternalHeader";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAssignedStudentIds } from "@/hooks/useAssignedStudentIds";
import { useLanguage } from "@/contexts/LanguageContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  link: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
}

/** Resolves a field from metadata, message parsing, or returns fallback */
function resolveField(meta: Record<string, any> | null, key: string, messageFallback?: string): string {
  const val = meta?.[key];
  if (val != null && val !== '' && String(val) !== '[object Object]') return String(val);
  if (messageFallback) return messageFallback;
  return '';
}

function NotificationDetail({ notification }: { notification: Notification }) {
  const { t } = useLanguage();
  const meta = notification.metadata;
  const msg = notification.message || '';

  const rows: { icon: React.ReactNode; label: string; value: string; missing?: boolean }[] = [];

  const MISSING = t('misc.notifMissingData');

  if (notification.type === "lesson_booked" || notification.type === "lesson_cancelled") {
    const parsedName = msg.replace(/ just scheduled a lesson.*/, '').replace(/ lesson was cancelled.*/, '').trim();
    const studentName = resolveField(meta, 'student_name', parsedName);
    rows.push({ icon: <User className="h-3.5 w-3.5" />, label: t('misc.notifStudent'), value: studentName || MISSING, missing: !studentName });
    const email = resolveField(meta, 'student_email');
    if (email && !email.includes('placeholder')) rows.push({ icon: <Mail className="h-3.5 w-3.5" />, label: t('misc.notifEmail'), value: email });
    rows.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: t('misc.notifDate'), value: resolveField(meta, 'lesson_date') || MISSING, missing: !resolveField(meta, 'lesson_date') });
    rows.push({ icon: <Clock className="h-3.5 w-3.5" />, label: t('misc.notifTime'), value: resolveField(meta, 'lesson_time') || MISSING, missing: !resolveField(meta, 'lesson_time') });
    rows.push({ icon: <Tag className="h-3.5 w-3.5" />, label: t('misc.notifType'), value: resolveField(meta, 'lesson_type') || MISSING, missing: !resolveField(meta, 'lesson_type') });
    if (notification.type === "lesson_booked") {
      const paid = resolveField(meta, 'paid_with');
      const remaining = resolveField(meta, 'lessons_remaining');
      const pkgSize = resolveField(meta, 'package_size');
      let payVal = '';
      if (paid === 'package') {
        payVal = remaining && pkgSize
          ? `${t('misc.notifDeductedPackage').replace('{remaining}', remaining).replace('{size}', pkgSize)}${Number(remaining) <= 2 ? ' ⚠️' : ''}`
          : t('misc.notifDeductedPackageSimple');
      } else if (paid === 'cash_transfer') {
        payVal = t('misc.notifPendingCashTransfer');
      } else if (paid === 'card') {
        payVal = t('misc.notifPendingCard');
      } else if (paid === 'membership') {
        payVal = t('misc.notifCoveredMembership');
      } else if (paid === 'unpaid') {
        payVal = t('misc.notifNoPaymentRecorded');
      }
      if (payVal) rows.push({ icon: <DollarSign className="h-3.5 w-3.5" />, label: t('misc.notifPayment'), value: payVal });
    }
  } else if (notification.type === "package_purchased") {
    rows.push({ icon: <User className="h-3.5 w-3.5" />, label: t('misc.notifStudent'), value: resolveField(meta, 'student_name') || MISSING, missing: !resolveField(meta, 'student_name') });
    const pkg = resolveField(meta, 'package_name') || (meta?.package_size ? `${meta.package_size}-lesson` : '');
    rows.push({ icon: <Package className="h-3.5 w-3.5" />, label: t('misc.notifPackage'), value: pkg || MISSING, missing: !pkg });
    const amount = resolveField(meta, 'amount');
    rows.push({ icon: <DollarSign className="h-3.5 w-3.5" />, label: t('misc.notifAmount'), value: amount || MISSING, missing: !amount });
  } else if (notification.type === "fixed_schedule_claim") {
    const dayNames = t('misc.notifDayNames').split(',');
    // Parse student name from message: "Name has booked the ..."
    const claimParsed = msg.match(/^(.+?) has booked/)?.[1]?.trim();
    rows.push({ icon: <User className="h-3.5 w-3.5" />, label: t('misc.notifStudent'), value: resolveField(meta, 'student_name', claimParsed) || MISSING, missing: !resolveField(meta, 'student_name', claimParsed) });
    const dayVal = meta?.day_of_week != null ? (dayNames[meta.day_of_week] || String(meta.day_of_week)) : '';
    rows.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: t('misc.notifDay'), value: dayVal || MISSING, missing: !dayVal });
    rows.push({ icon: <Clock className="h-3.5 w-3.5" />, label: t('misc.notifTime'), value: resolveField(meta, 'start_time') || MISSING, missing: !resolveField(meta, 'start_time') });
  } else if (notification.type === "video_uploaded" || notification.type === "student_video_uploaded") {
    // Parse student name from message for student uploads: "Name uploaded ..."
    const vidParsed = msg.match(/^(.+?) uploaded/)?.[1]?.trim();
    const studentName = resolveField(meta, 'student_name', notification.type === 'student_video_uploaded' ? vidParsed : undefined);
    if (studentName) rows.push({ icon: <User className="h-3.5 w-3.5" />, label: t('misc.notifStudent'), value: studentName });
    const uploadedBy = resolveField(meta, 'uploaded_by');
    if (uploadedBy) rows.push({ icon: <Video className="h-3.5 w-3.5" />, label: t('misc.notifUploadedBy'), value: uploadedBy === 'coach' ? t('misc.notifCoach') : uploadedBy === 'student' ? t('misc.notifStudent') : uploadedBy });
    const videoTitle = resolveField(meta, 'video_title');
    if (videoTitle) rows.push({ icon: <FileText className="h-3.5 w-3.5" />, label: t('misc.notifVideo'), value: videoTitle });
    if (meta?.count && meta.count > 1) rows.push({ icon: <Package className="h-3.5 w-3.5" />, label: t('misc.notifCount'), value: `${meta.count} ${t('misc.notifVideosSuffix')}` });
  } else if (notification.type === "package_added") {
    const parsedName = notification.message?.match(/package added to ([^(]+)/)?.[1]?.trim();
    rows.push({ icon: <User className="h-3.5 w-3.5" />, label: t('misc.notifStudent'), value: resolveField(meta, 'student_name', parsedName) || MISSING, missing: !resolveField(meta, 'student_name', parsedName) });
    const pkgSize = meta?.package_size ? `${meta.package_size}-lesson` : '';
    rows.push({ icon: <Package className="h-3.5 w-3.5" />, label: t('misc.notifPackage'), value: pkgSize || MISSING, missing: !pkgSize });
    const amount = resolveField(meta, 'amount');
    rows.push({ icon: <DollarSign className="h-3.5 w-3.5" />, label: t('misc.notifAmount'), value: amount || MISSING, missing: !amount });
    const source = resolveField(meta, 'source');
    if (source) rows.push({ icon: <Tag className="h-3.5 w-3.5" />, label: t('misc.notifSource'), value: source });
  } else if (notification.type === "lesson_skipped") {
    rows.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: t('misc.notifDate'), value: resolveField(meta, 'lesson_date') || MISSING, missing: !resolveField(meta, 'lesson_date') });
    const time = resolveField(meta, 'lesson_time');
    if (time) rows.push({ icon: <Clock className="h-3.5 w-3.5" />, label: t('misc.notifTime'), value: time });
    const type = resolveField(meta, 'lesson_type');
    if (type) rows.push({ icon: <Tag className="h-3.5 w-3.5" />, label: t('misc.notifType'), value: type });
  } else if (notification.type === "coach_notes") {
    const lessonType = resolveField(meta, 'lesson_type');
    if (lessonType) rows.push({ icon: <Tag className="h-3.5 w-3.5" />, label: t('misc.notifType'), value: lessonType });
    const lessonDate = resolveField(meta, 'lesson_date');
    if (lessonDate) rows.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: t('misc.notifDate'), value: lessonDate });
    const lessonTime = resolveField(meta, 'lesson_time');
    if (lessonTime) rows.push({ icon: <Clock className="h-3.5 w-3.5" />, label: t('misc.notifTime'), value: lessonTime });
  } else if (notification.type === "round_logged") {
    const studentName = resolveField(meta, 'student_name');
    if (studentName) rows.push({ icon: <User className="h-3.5 w-3.5" />, label: t('misc.notifStudent'), value: studentName });
    const course = resolveField(meta, 'course');
    if (course) rows.push({ icon: <MapPin className="h-3.5 w-3.5" />, label: t('misc.notifCourse'), value: course });
    const played = resolveField(meta, 'played_on');
    if (played) rows.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: t('misc.notifDate'), value: played });
    const holes = resolveField(meta, 'holes_played');
    const score = resolveField(meta, 'total_score');
    const par = resolveField(meta, 'course_par');
    const toPar = meta?.to_par;
    let scoreLabel = score || '—';
    if (par) scoreLabel += ` / par ${par}`;
    if (toPar != null) {
      const t = Number(toPar);
      scoreLabel += ` (${t === 0 ? 'E' : t > 0 ? '+' + t : t})`;
    }
    rows.push({ icon: <Flag className="h-3.5 w-3.5" />, label: holes ? `${t('misc.notifScore')} · ${holes} holes` : t('misc.notifScore'), value: scoreLabel });
    const rType = resolveField(meta, 'round_type');
    if (rType) rows.push({ icon: <Tag className="h-3.5 w-3.5" />, label: t('misc.notifRoundType'), value: rType });
  } else if (meta) {
    // Generic fallback: display metadata keys as rows
    const skipKeys = new Set(["id", "student_id", "video_id", "lesson_id", "package_id", "recurring_slot_id", "video_ids"]);
    Object.entries(meta).forEach(([key, value]) => {
      if (skipKeys.has(key) || value == null || value === "") return;
      const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      rows.push({ icon: <Info className="h-3.5 w-3.5" />, label, value: String(value) });
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className={row.missing ? "text-amber-500/70" : "text-gold/70"}>{row.missing ? <AlertTriangle className="h-3.5 w-3.5" /> : row.icon}</span>
          <span className="text-ivory/50 min-w-[60px]">{row.label}</span>
          <span className={`font-medium ${row.missing ? "text-amber-500/70 italic text-xs" : "text-ivory/90"}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Notifications() {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const { isOwner, studentIds } = useAssignedStudentIds();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id, isOwner ? 'all' : `coach:${(studentIds ?? []).slice().sort().join(',')}`],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, link, type, read_at, created_at, metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching notifications:", error);
        return [];
      }

      const rows = (data ?? []) as Notification[];
      // Owner sees everything addressed to them; non-owner coaches only see
      // notifications tied to a student assigned to them. Notifications without
      // a student_id in metadata are considered personal/system messages and
      // are always shown.
      if (isOwner) return rows;
      const assigned = new Set(studentIds ?? []);
      return rows.filter((n) => {
        const sid = (n.metadata as any)?.student_id;
        if (!sid) return true;
        return assigned.has(String(sid));
      });
    },
    enabled: !!user?.id && (isOwner || Array.isArray(studentIds)),
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });

  const { toast } = useToast();

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
      toast({ title: t('misc.notifAllDeletedToast') });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <div className="app-bg min-h-screen">
      <InternalHeader
        titleKey="admin.notificationsTitle"
        subtitleKey="admin.notificationsSub"
        backTo={role === 'admin' ? '/admin' : '/dashboard'}
      />
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {unreadCount > 0 && (
          <div className="flex justify-end gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              className="border-white/20 text-ivory/70 hover:text-ivory hover:bg-white/10"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              {t('misc.notifMarkAllRead')}
            </Button>
          </div>
        )}

        {notifications.length > 0 && (
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
              className="border-destructive/30 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('misc.notifDeleteAll')}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('misc.notifNoneYet')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map(notification => (
              <Card
                key={notification.id}
                className={`transition-colors hover:bg-white/5 ${
                  !notification.read_at ? "border-primary/50 bg-primary/5" : ""
                } cursor-pointer`}
                onClick={() => {
                  handleNotificationClick(notification);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                      !notification.read_at ? "bg-primary" : "bg-transparent"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{notification.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">
                          {notification.message}
                        </p>
                        <NotificationDetail notification={notification} />
                        {notification.link && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 border-white/20 text-ivory/80 hover:text-ivory hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(notification.link!);
                            }}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            {t('misc.notifGoTo').replace('{target}',
                              notification.type === 'lesson_booked' || notification.type === 'lesson_cancelled' || notification.type === 'lesson_skipped' || notification.type === 'coach_notes' ? t('misc.notifTargetLessons') :
                              notification.type === 'package_purchased' || notification.type === 'package_added' ? t('misc.notifTargetPackages') :
                              notification.type === 'fixed_schedule_claim' ? t('misc.notifTargetFixedSchedule') :
                              notification.type === 'video_uploaded' || notification.type === 'student_video_uploaded' ? t('misc.notifTargetVideos') :
                              t('misc.notifTargetDetails')
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
