# Reporte de clases: agregar "Avance cronológico"

## Qué cambia
- Se conservan todas las secciones actuales (Resumen, Avances, Áreas de mejora, Video y notas, Estadísticas).
- Nueva sección **"Avance cronológico" / "Progress timeline"** antes de Estadísticas: una línea de tiempo de la más antigua a la más reciente.
- Cada punto: fecha de la clase, tipo (Clase / Playing Lesson) y 1 frase de lo que se trabajó, tomada de tus notas de coach, notas del alumno y videos de esa clase.
- Si el periodo elegido es corto (ej. solo hoy, como el de Pablo), la línea de tiempo usa el historial reciente de clases completadas (mismo historial que ya alimenta "Frecuencia de temas"), para que siempre se vea la evolución.
- Clases sin notas ni video no aparecen en la línea de tiempo.
- Agrupado por mes si hay muchas clases (máx. ~20 puntos, se resumen las más viejas).

## Detalles técnicos
- `supabase/functions/generate-student-report/index.ts`: construir lista cronológica (asc) de lecciones completadas (periodo, o `histLessons` si el periodo tiene < 3) con notas + videos ligados por `lesson_id`; pedir a la IA un campo extra `timeline: [{date, type, focus}]` en ES/EN; guardar en el contenido del reporte.
- `src/lib/generateLessonReportPdf.ts`: dibujar la sección con viñeta dorada por fecha y línea vertical verde; saltos de página.
- `ReportPreviewModal.tsx` / `StudentReportsPanel.tsx` / `StudentSharedReports.tsx`: mostrar la misma sección en la vista previa. Reportes viejos sin timeline siguen funcionando (sección oculta).
- No se tocan permisos, límites de reportes, paquetes ni estadísticas.
