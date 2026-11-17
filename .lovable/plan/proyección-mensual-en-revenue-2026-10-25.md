# Proyección mensual en Revenue

Nueva tarjeta "Proyección mensual / Monthly projection" en la página de Ingresos. Solo lee datos; no cambia precios, paquetes ni Stripe. Sin simulador.

## Cómo se calcula
- **Precio por clase (real, no promedio)**: monto del paquete ÷ número de clases del paquete. Cuenta aunque el paquete no esté pagado todavía.
- Cada clase usa el precio de **su propio paquete** (el paquete ligado a su horario recurrente). Una clase suelta agendada usa el monto que tenga registrado.
- **Calendario**: las clases agendadas del mes más las que generan los horarios recurrentes (respetando cada 2/3/4 semanas, pausas y fecha de inicio), hasta que se acaben las clases del paquete.
- **Total del mes** = suma del precio de cada clase de ese mes.

## Qué verás
- Total proyectado de este mes y del próximo.
- Tabla por alumno: paquete, precio por clase, clases en el mes, total del mes.

## Alcance
- Solo tus alumnos (y los del coach en la vista previa de coach).
- Inglés y español; montos `$X,XXX MXN`.

## Detalles técnicos
- `src/lib/revenueProjection.ts`: funciones puras (precio por clase = price / package_size; suma por mes) + `tests/revenueProjection.test.ts` (ej. paquete $10,000 / 10 clases, 8 clases en el mes = $8,000).
- Ocurrencias recurrentes reutilizando la lógica de cadencia existente (`isCadenceWeek`, `paused_until`, `starts_on`), limitadas por clases restantes del paquete.
- `src/components/revenue/MonthlyProjectionCard.tsx` insertado en `src/pages/AdminRevenue.tsx`.
- Datos: `class_packages`, `recurring_lesson_slots`, `lessons` agendadas, filtrados por alumnos del coach. Strings en `src/i18n/extra/adminMoney.ts`.
