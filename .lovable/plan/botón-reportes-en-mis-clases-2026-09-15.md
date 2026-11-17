# Botón "Reportes" en Mis Clases

## Objetivo
En la página **Mis Clases** del portal del alumno, agregar un botón **"Reportes"** que abra el mismo generador de reportes de clases que ya existe hoy (el mismo que usa Pro Zone), guardando el reporte igual que siempre. Además, los reportes guardados se podrán ver dentro de la propia página Mis Clases.

## Qué verá el alumno
- En la parte superior de Mis Clases, un botón **"Reportes"** (ícono de documento, acento dorado, estilo glass del portal).
- Al tocarlo se abre el mismo modal de siempre: elegir tipo de reporte (clases) y periodo (este mes, últimos 30 días, últimos 3 meses o personalizado), y se genera el reporte.
- El reporte se guarda automáticamente y aparece listado en una nueva pestaña/sección **"Reportes"** dentro de Mis Clases, con opción de verlo (el mismo visor de reportes que ya existe).
- Los reportes siguen apareciendo también donde ya se ven hoy (vista Reportes / Pro Zone); nada se duplica, es el mismo registro.

## Detalles técnicos
- `src/pages/StudentLessons.tsx`:
  - Botón "Reportes" en el encabezado de la página, que abre `<CreateReportModal mode="student" studentId={user.id} ... />` — el mismo componente y modo que usa `src/pages/ProZoneStats.tsx` (auto-guardado en `student_reports`, límite mensual por alumno ya incluido).
  - Nueva pestaña "Reportes" en los tabs existentes (junto a Agendadas / Completadas / Paquetes) que renderiza el componente existente `StudentReportsPanel` (lista los reportes guardados del alumno, query `['my-visible-reports', user.id]`).
  - Al generar un reporte, invalidar `['my-visible-reports', user.id]` para que aparezca al instante.
- i18n: nuevas claves ES/EN (`ui.studentLessons.tabReports` = "Reportes"/"Reports"; reutilizar `reports.generateReport` para el botón si aplica).
- Sin cambios en backend: la función de generación, la tabla `student_reports`, permisos y límites quedan exactamente igual.

## No se toca
- El botón/modal de reportes en Pro Zone ni su lógica.
- Reportes del coach en el admin, precios, Stripe, RLS, ni conteos de paquetes.
