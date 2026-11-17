import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAssignedStudentIds } from "@/hooks/useAssignedStudentIds";

export function NotificationBell() {
  const { user } = useAuth();
  const { isOwner, studentIds } = useAssignedStudentIds();
  const navigate = useNavigate();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-notifications", user?.id, isOwner ? 'all' : `coach:${(studentIds ?? []).slice().sort().join(',')}`],
    queryFn: async () => {
      if (!user?.id) return 0;

      if (isOwner) {
        const { count, error } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null);
        if (error) { console.error("Error fetching unread count:", error); return 0; }
        return count || 0;
      }
      // Non-owner coach: mirror the Notifications page filter so the badge
      // matches what the coach can actually see.
      const { data, error } = await supabase
        .from("notifications")
        .select("id, metadata")
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) { console.error("Error fetching unread count:", error); return 0; }
      const assigned = new Set(studentIds ?? []);
      return (data ?? []).filter((n: any) => {
        const sid = n?.metadata?.student_id;
        if (!sid) return true;
        return assigned.has(String(sid));
      }).length;
    },
    enabled: !!user?.id && (isOwner || Array.isArray(studentIds)),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const displayCount = unreadCount > 9 ? "9+" : unreadCount;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => navigate("/notifications")}
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
          {displayCount}
        </span>
      )}
    </Button>
  );
}
