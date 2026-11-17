# Volver a mostrar el video de bienvenida a los alumnos gratis

La primera vez que un alumno entra ve el recorrido de bienvenida (el quiz con el video). Quien ya lo vio queda marcado y no vuelve a verlo. Hoy hay 118 alumnos y 115 están marcados como ya vistos, aunque en realidad no lo vieron.

## Qué se hará

- A todos los alumnos de cuenta gratis (incluidos los que están en prueba gratis) se les quita esa marca, de forma que la próxima vez que entren vean el recorrido **una sola vez más**; al abrirlo se vuelve a marcar y no se repite.
- Se excluyen las dos cuentas de Polo Medina (leopoldomedina@me.com y polomedina@gmail.com), que ya lo completaron hoy.
- No se toca a los alumnos con plan de pago, ni a los familiares sin cuenta propia (nunca inician sesión).
- Las respuestas que algún alumno ya haya guardado no se borran.

## Detalles técnicos

- Actualización de datos (sin cambios de esquema ni de código): `UPDATE profiles SET onboarding_seen_at = NULL` para perfiles con rol `student`, `coalesce(plan_tier,'free') IN ('free','member')`, sin `manual_plan_override` activo, `coalesce(is_managed,false) = false`, excluyendo los dos ids de Polo Medina.
- La puerta de entrada (`ProtectedRoute`) solo mira `onboarding_seen_at`, así que con eso basta; `onboarding_completed_at` y las respuestas se conservan.
- Alcance estimado: alrededor de 110 alumnos.
