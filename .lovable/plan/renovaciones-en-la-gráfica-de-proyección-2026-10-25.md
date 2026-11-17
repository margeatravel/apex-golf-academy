# Renovaciones en la gráfica de proyección

La gráfica actual no cambia; se le agrega una segunda línea y una lista para elegir quién renueva.

## Qué verás
- **Línea actual (punteada dorada):** solo lo ya agendado. Igual que ahora.
- **Nueva línea "Con renovaciones" (verde):** suma lo agendado más las clases de los alumnos que se espera que renueven cuando se les acabe el paquete.
- Total de cada línea arriba de la gráfica.
- Debajo, una lista plegable **"¿Quién renueva?"** con cada alumno, una palomita y una etiqueta:
  - "Ha renovado" si ya compró más de un paquete antes (palomita marcada por defecto).
  - "Primer paquete" si nunca ha renovado (sin palomita por defecto).
- Botones rápidos **Todos** / **Ninguno** / **Según historial**.
- Tus cambios en las palomitas se guardan en este dispositivo.

## Cómo se proyecta una renovación
- Cuando al alumno se le acaba el paquete, se asume que compra el mismo paquete (mismo precio por clase).
- Sigue con su mismo horario recurrente (mismos días, hora y cada cuántas semanas) hasta completar los 6 meses.
- Alumnos sin horario recurrente: no se proyecta renovación.

## Detalles técnicos
- `src/lib/revenueProjection.ts`: `hasRenewedBefore(packages)` (más de un paquete del alumno) y `projectRenewals(slots, lastScheduledDate, pricePerClass, until)` usando `isCadenceWeek`, `paused_until`; pruebas en `tests/revenueProjection.test.ts`.
- `RevenueProjectionChart.tsx`: carga también todos los paquetes de los alumnos del coach y sus `recurring_lesson_slots` activos; segunda `Line`; lista con `Checkbox` en `Collapsible`; overrides en `localStorage` por coach.
- Sin cambios en base de datos.
