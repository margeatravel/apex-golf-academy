# Línea de escenario en Revenue Projections

Cuando cambies precios en la pestaña Precios, la gráfica mostrará dos líneas:
- **Real (con renovaciones):** la verde actual, con tus precios de hoy.
- **Escenario:** una línea nueva verde clara (más ligera, punteada) con la proyección usando los precios nuevos.

Sin cambios de precio, solo se ve la línea real, igual que ahora. El tooltip muestra ambos montos y la leyenda los nombra. Nada más cambia (tabs, totales, PDF).

## Detalles técnicos
- `RevenueProjectionChart.tsx`: hoy `chartData` ya es el escenario y `realData` el real. Unir ambos por fecha en `{ date, withRenewals: real, scenario }`.
- `withRenewals` usa `realData`; añadir `<Line dataKey="scenario">` solo si `scenarioActive`, con `stroke="hsl(var(--success) / 0.45)"` y `strokeDasharray="5 4"`.
- Los totales del encabezado no cambian.
