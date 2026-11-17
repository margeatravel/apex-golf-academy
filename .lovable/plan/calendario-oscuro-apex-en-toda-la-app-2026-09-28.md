# Calendario oscuro Apex en toda la app

## Problema
Hay dos tipos de calendario:
- **El blanco:** el calendario propio del navegador. Sale en 11 pantallas: subir ronda, perfil del alumno, disponibilidad, horario recurrente ("Starting from"), ingresos, cobros, bloquear fechas y otras. No se le puede cambiar el color.
- **El de la app:** ya sale en unas 10 pantallas (agregar clase, paquete, pago, reporte…), pero con colores genéricos.

## Solución
Un solo selector de fecha con el estilo de la app, usado en todas partes:
- Fondo verde oscuro con efecto vidrio, igual que los modales.
- Día elegido en dorado y hoy marcado con un aro dorado.
- Flechas para cambiar de mes y encabezado con el mes en ES/EN según el idioma.
- En el botón, la fecha se lee "lun 28 sep 2026" y no "2026-09-28".
- Cambia las 11 pantallas con el calendario blanco por este selector.
- Aplica el mismo estilo al calendario de la app que ya existe, así las ~10 pantallas que lo usan se ven igual sin tocarlas una por una.

## Qué no cambia
Las fechas se guardan igual, en el mismo formato. Los límites de fecha (mínimo y máximo), las validaciones y la hora de Cancún quedan como están.

## Detalles técnicos
- Nuevo `src/components/ui/date-field.tsx`: `DateField({ value: 'YYYY-MM-DD', onChange(str), min?, max?, placeholder?, disabled?, id? })`. Usa Popover + Calendar y lee la fecha como local, no UTC. Usa el locale de date-fns según `useLanguage`.
- `src/components/ui/calendar.tsx`: nuevas clases con tokens del tema (dorado para el día seleccionado, texto ivory, botones de navegación en vidrio) y `pointer-events-auto`.
- `PopoverContent` del selector: mismas clases de fondo y borde que el modal.
- Reemplazar `<Input type="date">` en: AdminAvailability, StudentProfile, AdminBulkImport, AddRevenueEntryModal, AdminLogRoundSection, EditRecurringSlotModal, EditRevenueEntryModal, EditARModal, MarkARPaidModal, LogRoundModal y recurring/StartsOnField. Solo cambia lo que se ve; se conservan el mismo estado y los mismos handlers.
- Selector de fecha de nacimiento (día/mes/año) se queda como está.
- Respaldo: `color-scheme: dark` en index.css para cualquier campo de fecha del navegador que quede.
