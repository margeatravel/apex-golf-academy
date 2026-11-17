import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, X, Image, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatLessonDate } from '@/lib/formatLessonDateTime';
import { FamilyTargetSelect } from '@/components/family/FamilyTargetSelect';

interface Lesson {
  id: string;
  lesson_date: string;
  lesson_type: string;
}

interface MediaUploadModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  coachId: string;
  lessons: Lesson[];
  onUploaded: () => void;
}

export function MediaUploadModal({ open, onClose, studentId, coachId, lessons, onUploaded }: MediaUploadModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [lessonLink, setLessonLink] = useState<string>('general');
  const [uploading, setUploading] = useState(false);
  // Destination: the student, or one of their linked family members.
  const [targetStudentId, setTargetStudentId] = useState('');
  const uploadTargetId = targetStudentId || studentId;
  const uploadingForFamily = uploadTargetId !== studentId;

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).filter(f =>
        f.type.startsWith('image/') || f.type.startsWith('video/')
      );
      setFiles(prev => [...prev, ...selected]);
    }
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const path = `${uploadTargetId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from('golf-media')
          .upload(path, file);

        if (storageError) throw storageError;

        const { data: urlData } = supabase.storage.from('golf-media').getPublicUrl(path);

        // A family member's media is never tied to the student's own lesson.
        const isGeneral = lessonLink === 'general' || uploadingForFamily;
        const fileType = file.type.startsWith('video/') ? 'video' : 'image';

        const { error: dbError } = await supabase
          .from('student_media' as any)
          .insert({
            student_id: uploadTargetId,
            coach_id: coachId,
            lesson_id: isGeneral ? null : lessonLink,
            is_general: isGeneral,
            file_url: urlData.publicUrl,
            file_type: fileType,
            title: title || file.name,
          });

        if (dbError) throw dbError;
      }

      toast({ title: 'Media uploaded', description: `${files.length} file(s) uploaded successfully.` });
      setFiles([]);
      setTitle('');
      setLessonLink('general');
      onUploaded();
      onClose();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setTitle('');
    setLessonLink('general');
    setTargetStudentId('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="glass-card border-white/15 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ivory">Upload Media</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker area */}
          <div
            className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-green-accent/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-ivory/40 mx-auto mb-2" />
            <p className="text-ivory/60 text-sm">Tap to select photos or videos</p>
            <p className="text-ivory/30 text-xs mt-1">JPEG, PNG, WebP, MP4, MOV</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
          </div>

          {/* Selected files preview */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative group">
                  <div className="h-16 w-16 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden">
                    {f.type.startsWith('image/') ? (
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Video className="h-6 w-6 text-ivory/40" />
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 flex items-center justify-center"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Title */}
          <Input
            placeholder="Caption (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="bg-white/5 border-white/15 text-ivory placeholder:text-ivory/30"
          />

          {/* Family destination — only when the student has linked family */}
          <FamilyTargetSelect
            studentId={studentId}
            value={uploadTargetId}
            onChange={(id) => { setTargetStudentId(id); setLessonLink('general'); }}
          />

          {/* Lesson link */}
          {!uploadingForFamily && (
          <Select value={lessonLink} onValueChange={setLessonLink}>
            <SelectTrigger className="bg-white/5 border-white/15 text-ivory">
              <SelectValue placeholder="Link to a class..." />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/15">
              <SelectItem value="general" className="text-ivory">General (no class)</SelectItem>
              {lessons.map(l => (
                <SelectItem key={l.id} value={l.id} className="text-ivory">
                  {formatLessonDate({ lesson_date: l.lesson_date }, 'short')} — {l.lesson_type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}

          <Button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="w-full bg-green-accent hover:bg-green-accent/90 text-ivory gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
