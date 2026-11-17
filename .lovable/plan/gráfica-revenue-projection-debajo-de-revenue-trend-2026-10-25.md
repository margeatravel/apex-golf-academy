# Gráfica "Revenue Projection" debajo de Revenue Trend

Reemplazar la tarjeta con tabla actual por una gráfica de línea con el mismo estilo que Revenue Trend, colocada justo debajo de ella.

## Qué verás
- Título "Revenue Projection / Proyección de ingresos" con el total proyectado del periodo.
- Gráfica de línea dorada igual a Revenue Trend (mismos ejes, tooltip y puntos), pero con fechas **a futuro** desde hoy.
- Selector igual al de Revenue Trend: **Semanal** o **Mensual** (por defecto mensual, próximos 6 meses).
- Cada punto = suma del valor de las clases agendadas en esa semana/mes, incluidas las de horarios recurrentes.
- Se quita la tarjeta con tabla que está arriba de Accounts Receivable.

## Cálculo (sin cambios)
- Cada clase vale el monto de su paquete ÷ número de clases del paquete (pagado o no).
- Clases sueltas: su monto registrado. No cuenta canceladas ni saltadas.

## Detalles técnicos
- `src/lib/revenueProjection.ts`: agregar `projectBuckets(lessons, packages, from, 'weekly'|'monthly')` → `[{ date, revenue }]`; prueba nueva en `tests/revenueProjection.test.ts`.
- `src/components/revenue/MonthlyProjectionCard.tsx` → reescrito como `RevenueProjectionChart` con recharts `LineChart`, copiando estilos de Revenue Trend; carga lecciones `scheduled` desde hoy hasta +6 meses de los alumnos del coach.
- `src/pages/AdminRevenue.tsx`: quitar la tarjeta actual (línea ~1051) e insertar la gráfica después del bloque Revenue Trend (~línea 1579).
