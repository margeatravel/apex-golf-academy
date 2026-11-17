# Reporte PDF de Ingresos y Horas (Apex)

Botón **"Descargar reporte PDF"** en la página de Revenue que genera un PDF con colores Apex (fondo verde oscuro #0d1f18, verde #4a7c59, dorado #F0C040, marfil), en tu idioma (EN/ES).

## Contenido del PDF
1. **Portada** — logo Apex, nombre del coach, fecha de generación, periodo.
2. **Resumen** (tarjetas): alumnos activos, horas promedio por semana, ingreso promedio mensual (últimos 12 meses), proyección próximos 6 meses, total del año.
3. **Mis alumnos** — tabla: alumno, paquete, precio por clase, clases restantes, horario recurrente.
4. **Precio por clase** — grupos de precio con nº de alumnos y % (igual que la pestaña Precios).
5. **Mi calendario semanal** — cuadrícula lunes–domingo con los horarios recurrentes (alumno y hora).
6. **Horas trabajadas** — horas por semana (recurrentes, usando duración real; Playing Lesson 120 min) y promedio de las últimas 12 semanas en una gráfica de barras.
7. **Ingresos del año por mes** — gráfica de barras ene–dic + tabla con total, usando los mismos datos de Revenue Trend.
8. **Proyecciones** — gráfica de línea "Con renovaciones" a 6 meses (misma lógica que la gráfica actual) + total.

## Reglas
- Solo tus datos (o los del coach en vista previa); nada de otros coaches.
- Solo lectura: no cambia precios, paquetes, Stripe ni calendario.
- Cifras en formato `$X,XXX MXN`, fechas en hora de Cancún.

## Detalles técnicos
- Generación en el navegador con jsPDF (ya usado en el Scoring Report); gráficas dibujadas con primitivas de jsPDF (sin capturas de pantalla).
- Nuevo `src/lib/revenueReportPdf.ts` (armado del PDF) y `src/lib/revenueReportData.ts` (reúne datos reutilizando `revenueProjection.ts`, la fuente de Revenue Trend y `recurring_lesson_slots`).
- Botón en `AdminRevenue` que llama `deliverFile(blob, "apex-reporte-ingresos.pdf")`.
- Pruebas para cálculo de horas semanales y promedio mensual.
- Verificación: generar el PDF, convertir cada página a imagen y revisarla.
