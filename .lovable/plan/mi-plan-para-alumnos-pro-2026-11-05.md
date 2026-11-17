# «Mi plan» para alumnos Pro

Cuando un alumno Pro toca **Mi plan y beneficios** en su perfil, primero verá una tarjeta de su membresía (estilo glass Apex, verde/dorado) y debajo la lista de planes como hoy.

## Contenido de la tarjeta (solo Pro)
- APEX GOLF ACADEMY · by Santiago Castilla
- Nombre del alumno
- «Actualización de tu membresía»: «Desde tu siguiente cobro empieza tu descuento y baja $100 cada 2 meses hasta $499 MXN/mes.»
- Progresión: $999 → $899 → $799 → $699 → $599 → $499 permanente, resaltando el escalón actual según el mes de su suscripción.
- «Mantienes todos tus beneficios Pro»: precio preferencial en clases, análisis de video mensual gratis, 1 clase en campo gratis cada 2 meses, acceso total a la plataforma.
- Nota: «Tus beneficios y precios se mantienen mientras sigas en Apex. Si cancelas, al volver empiezas desde $999.»

Otros planes (Familiar, Scratch, Apex) no cambian. Español/inglés.

## Técnico
- Nuevo componente `ProMembershipCard` en la página `/plans`, mostrado arriba solo si el plan efectivo es Pro.
- Escalones leídos de `src/lib/proPriceSteps.ts`; mes actual calculado con la fecha de inicio de la suscripción (solo lectura).
- Sin cambios en Stripe, precios, webhook ni base de datos.
- Lo de «no se carga la foto»: se mostrará el diseño completo como tarjeta en la app (no imagen).
