import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ApexBrand from '@/components/ApexBrand';

interface VideoRow {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  thumbnail_url: string | null;
  category: string | null;
  upload_date: string | null;
  student_id: string | null;
  lesson_id: string | null;
}

export default function SharedVideo() {
  const { videoId } = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [studentName, setStudentName] = useState<string>("");
  const [lessonDate, setLessonDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("id, title, description, file_url, thumbnail_url, category, upload_date, student_id, lesson_id")
          .eq("id", videoId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setError("This video isn't available.");
          setLoading(false);
          return;
        }
        setVideo(data as VideoRow);

        // Resolve signed URLs from the public-share edge function (bucket is private).
        try {
          const { data: signed } = await supabase.functions.invoke('sign-shared-video', {
            body: { video_id: data.id },
          });
          if (!cancelled && signed) {
            setVideo((prev) => prev ? {
              ...prev,
              file_url: signed.file_url ?? prev.file_url,
              thumbnail_url: signed.thumbnail_url ?? prev.thumbnail_url,
            } : prev);
          }
        } catch { /* fall back to original URLs */ }

        if (data.student_id) {
          const { data: p } = await supabase
            .from("profiles").select("full_name").eq("id", data.student_id).maybeSingle();
          if (!cancelled && p?.full_name) setStudentName(String(p.full_name).split(" ")[0]);
        }
        if (data.lesson_id) {
          const { data: l } = await supabase
            .from("lessons").select("lesson_date").eq("id", data.lesson_id).maybeSingle();
          if (!cancelled && l?.lesson_date) setLessonDate(l.lesson_date);
        } else if (data.upload_date) {
          setLessonDate(data.upload_date);
        }
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load.");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1410]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F0C040]" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d1410] text-[#F5F0E8] px-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Video unavailable</h1>
        <p className="text-[#F5F0E8]/70 mb-6">{error ?? "This video may have been removed."}</p>
        <Button asChild className="bg-[#4a7c59] hover:bg-[#4a7c59]/80">
          <Link to="/">Go to Apex Golf Academy</Link>
        </Button>
      </div>
    );
  }

  const dateLabel = lessonDate
    ? new Date(lessonDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const cat = video.category === "lesson" ? "Lesson" : video.category === "analysis" ? "Swing analysis" : "Video";
  const heading = studentName ? `${studentName} — ${video.title}` : video.title;

  return (
    <div className="min-h-screen bg-[#0d1410] text-[#F5F0E8]">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <Link to="/" className="flex items-center"><ApexBrand size="sm" /></Link>
        <Button asChild size="sm" variant="outline" className="border-white/20 text-[#F5F0E8] hover:bg-white/10">
          <Link to="/">Open app</Link>
        </Button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="rounded-2xl overflow-hidden bg-black border border-white/10 shadow-xl">
          <video
            controls
            playsInline
            className="w-full h-auto max-h-[80vh] bg-black"
            src={video.file_url}
            poster={video.thumbnail_url || undefined}
          />
        </div>

        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-[#F5F0E8]/70">
            {[cat, dateLabel].filter(Boolean).join(" · ")}
          </p>
        </div>

        {video.description && (
          <p className="text-[#F5F0E8]/85 leading-relaxed whitespace-pre-line">
            {video.description}
          </p>
        )}

        <div className="pt-4">
          <Button asChild className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
            <Link to="/">Watch more on Apex Golf Academy</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}