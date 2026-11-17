# Arreglar conflicto falso con horarios cada 2 semanas

**Causa (confirmada con datos):** Ivan Rosas tiene viernes 9:00 con cambio programado a "cada 2 semanas" desde el 23 oct (clases 23 oct, 6 nov, 20 nov…). El calendario sí lo respeta, pero el aviso de conflicto al agregar una clase solo mira la configuración actual (semanal) e ignora el cambio programado y la frecuencia.

## Corrección
En `src/lib/lessonSlotConflicts.ts` → `findSlotConflicts`, al revisar horarios recurrentes:
1. Leer también `interval_weeks`, `interval_anchor` y los `pending_*` (`pending_effective_date`, `pending_weekday`, `pending_start_time`, `pending_duration_minutes`, `pending_lesson_type`, `pending_interval_weeks`, `pending_interval_anchor`).
2. Si la fecha de la clase ≥ `pending_effective_date`, usar la configuración pendiente (día, hora, duración, frecuencia).
3. Descartar el slot si no cae en una semana de su frecuencia (`isCadenceWeek` de `recurringCadence.ts`) o si cambió a otro día.

Aplica a todos los formularios que usan esa revisión (Add Lesson, Quick Add, Edit Lesson, etc.).

## No se toca
Calendario, generación de clases recurrentes, paquetes, permisos, ReassignConflictDialog.

## Verificación
Viernes 16 oct 9:00: sin conflicto con Ivan. Viernes 23 oct 9:00: sí marca conflicto.
