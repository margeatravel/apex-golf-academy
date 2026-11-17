# Botón flotante: mismo chequeo de choques que el calendario

**Revisado:** el botón flotante usa la misma revisión de choques que ya arreglé (lo de Ivan cada 2 semanas). Lo más probable es que lo intentaras antes del arreglo. Adriana Sabatez ya quedó el viernes 16 a las 9:00.

**Falla adicional encontrada:** el botón flotante revisa choques contra los horarios de **todos** los coaches, no solo los tuyos. Un horario de otro coach te puede bloquear sin razón.

## Corrección
- `src/components/QuickAddLessonModal.tsx` → `handleSave`: pasar el coach (el coach asignado del alumno, o tú si no tiene) a `findSlotConflicts`, igual que en el calendario.
- El mismo ajuste en `AddLessonModal.tsx` (Add Lesson), que tampoco filtra por coach.

## No se toca
Calendario, recurrentes, paquetes, cobros.

## Verificación
Viernes 16 oct 9:00 desde el botón flotante para otro alumno: solo marca choque con Adriana (tu clase), no con horarios de otros coaches.
