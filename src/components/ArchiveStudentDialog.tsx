import { useState } from 'react';
import { Archive as ArchiveIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ArchiveStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  onConfirm?: () => Promise<void> | void;
  onArchived?: () => void;
}

export function ArchiveStudentDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onConfirm,
  onArchived,
}: ArchiveStudentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [archiving, setArchiving] = useState(false);

  if (!open) return null;

  const handleArchive = async () => {
    setArchiving(true);
    try {
      if (onConfirm) {
        await onConfirm();
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({ is_archived: true, archived_at: new Date().toISOString() } as any)
          .eq('id', studentId);
        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: ['all-students'] });
        queryClient.invalidateQueries({ queryKey: ['admin-students'] });
        queryClient.invalidateQueries({ queryKey: ['admin-all-students'] });
        queryClient.invalidateQueries({ queryKey: ['all-students-canonical'] });
        toast({ title: 'Estudiante archivado', description: 'Se movió a la sección de archivados. Puedes restaurarlo cuando quieras.' });
      }
      onArchived?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Archive failed:', err);
      toast({ title: 'Error', description: err?.message || 'No se pudo archivar al estudiante', variant: 'destructive' });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !archiving && onOpenChange(false)}>
      <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-warning/15 flex items-center justify-center">
            <ArchiveIcon className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Archivar estudiante</h3>
            <p className="text-sm text-muted-foreground">Se ocultará del roster activo. Los datos se conservan y puedes restaurarlo después.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          <strong className="text-foreground">{studentName || 'Este estudiante'}</strong> se moverá a "Alumnos archivados". Nada se borra:
        </p>
        <ul className="text-sm text-muted-foreground mb-5 list-disc pl-5 space-y-0.5">
          <li>Se conservan lecciones, paquetes, pagos, videos y notas</li>
          <li>Deja de aparecer en la lista principal de alumnos</li>
          <li>Puedes restaurarlo desde la sección de archivados</li>
        </ul>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={archiving}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2 bg-warning text-warning-foreground hover:bg-warning/90" onClick={handleArchive} disabled={archiving}>
            {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveIcon className="h-4 w-4" />}
            {archiving ? 'Archivando...' : 'Archivar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
