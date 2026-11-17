import { toast } from 'sonner';

export async function downloadVideo(url: string, filename?: string) {
  const name = filename || url.split('/').pop() || 'video.mp4';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      a.remove();
    }, 200);
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank');
    toast.info("If the download didn't start, long-press the video to save it.");
  }
}
