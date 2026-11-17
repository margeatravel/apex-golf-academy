import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Package as PackageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface CreatePackageDraftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  defaultPackageSize?: number;
  defaultPrice?: number;
  onCreated?: () => void;
}

/**
 * Creates a `class_packages` row with `ar_status: 'draft'` — same shape as the
 * "Nuevo pendiente" tab in LinkToARModal. The draft surfaces in AR Pendientes
 * and is activated through the existing ActivateDraftModal / EditARModal flow.
 * Nothing is consumed until the coach activates it.
 */
export function CreatePackageDraftModal({
  open,
  onOpenChange,
  studentId,
  studentName,
  defaultPackageSize = 4,
  defaultPrice,
  onCreated,
}: CreatePackageDraftModalProps) {
  const { language } = useLanguage();
  const es = language === 'es';
  const [packageSize, setPackageSize] = useState<string>(String(defaultPackageSize));
  const [amount, setAmount] = useState<string>(defaultPrice ? String(defaultPrice) : '');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPackageSize(String(defaultPackageSize || 4));
      setAmount(defaultPrice ? String(defaultPrice) : '');
      setNotes('');
    }
  }, [open, defaultPackageSize, defaultPrice]);

  const handleCreate = async () => {
    if (!studentId) return;
    const size = parseInt(packageSize, 10) || 0;
    const amt = parseFloat(amount) || 0;
    if (size <= 0 || amt <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('class_packages')
        .insert({
          user_id: studentId,
          package_name: notes
            ? `${size}-Lesson Package — ${notes}`
            : `${size}-Lesson Package`,
          package_size: size,
          classes_remaining: size,
          classes_used: 0,
          price: amt,
          amount_paid: 0,
          payment_status: 'pending',
          is_active: true,
          imported: false,
          ar_status: 'active_pending',
        } as any);
      if (error) throw error;
      toast.success(es ? 'Pendiente creado' : 'Pending created', {
        description: es
          ? `Aparece en CXC Pendientes de ${studentName}.`
          : `Appears in AR Pending for ${studentName}.`,
      });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(es ? 'No se pudo crear el pendiente' : 'Could not create pending', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageIcon className="h-5 w-5 text-primary" />
            {es ? 'Crear pendiente CXC' : 'Create pending AR'}
          </DialogTitle>
          <DialogDescription>
            {es ? (
              <>Crea un pendiente de paquete para <strong>{studentName}</strong>. No se activa ni consume clases hasta que lo apruebes en CXC Pendientes.</>
            ) : (
              <>Create a pending package for <strong>{studentName}</strong>. It won't activate or consume lessons until you approve it in AR Pending.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {es ? 'Tamaño de paquete (clases)' : 'Package size (lessons)'}
            </label>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={packageSize}
              onChange={(e) => setPackageSize(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {es ? 'Precio total (MXN)' : 'Total price (MXN)'}
            </label>
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {es ? 'Notas (opcional)' : 'Notes (optional)'}
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={es ? 'Ej. renovación confirmada por WhatsApp' : 'e.g. renewal confirmed via WhatsApp'}
              className="h-9"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {es
              ? 'Los pendientes no aparecen como paquete activo hasta que se aprueben o paguen desde CXC Pendientes.'
              : "Pending entries don't show as an active package until approved or paid from AR Pending."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {es ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              saving ||
              !(parseInt(packageSize, 10) > 0) ||
              !(parseFloat(amount) > 0)
            }
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {es ? 'Crear pendiente' : 'Create pending'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}