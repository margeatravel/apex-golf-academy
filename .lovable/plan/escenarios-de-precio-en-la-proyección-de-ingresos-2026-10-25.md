# Escenarios de precio en la proyección de Ingresos

## Qué verás
1. **La gráfica queda con una sola línea**: "Con renovaciones". Se quita la línea dorada punteada de "solo agendado".
2. **Nueva pestaña arriba de la lista de alumnos**: "Alumnos" | "Precios".
   - **Alumnos**: la lista actual (palomita de renovación + precio por clase al lado del nombre).
   - **Precios**: tus alumnos agrupados por lo que pagan por clase, por ejemplo:
     - $450 por clase: 3 alumnos
     - $600 por clase: 5 alumnos
     - $800 por clase: 10 alumnos
   - Cada grupo tiene una casilla para poner un **precio nuevo**. Al cambiarlo, la gráfica y el total de arriba se recalculan al momento.
   - Botón rápido **"Subir todos a…"** para poner un solo precio a todos.
   - Botón **"Restablecer"** para volver a tus precios reales.
3. Cuando haya un escenario activo, arriba se muestra "Real: $X → Escenario: $Y (+$Z)".

## Reglas del cálculo
- El precio nuevo aplica **desde la siguiente renovación** de cada alumno; los paquetes ya vendidos mantienen su precio.
- Solo se proyecta para alumnos con horario recurrente (como hoy).
- Los escenarios son solo simulación: no cambian precios, paquetes ni Stripe. Se guardan en este dispositivo.

## Detalles técnicos
- `src/components/revenue/RevenueProjectionChart.tsx`: quitar serie "scheduled"; añadir Tabs (Alumnos/Precios); estado `priceOverrides: Record<precioOriginal, precioNuevo>` en localStorage; agrupar `students` por `pricePerClass` redondeado.
- `src/lib/revenueProjection.ts`: `projectRenewalDates`/buckets aceptan un precio de renovación por alumno (opcional, aditivo).
- Prueba en `tests/revenueProjection.test.ts`: subir un grupo de precio cambia solo los ingresos de renovación de esos alumnos.
- No tocar: Stripe, precios guardados, paquetes, recurring slots, Revenue Trend.
