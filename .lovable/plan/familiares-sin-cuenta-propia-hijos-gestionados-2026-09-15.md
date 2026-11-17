# Familiares sin cuenta propia (hijos gestionados)

Un papá o mamá con plan de pago podrá crear a un hijo que no tiene cuenta: se le pone nombre, fecha de nacimiento y foto opcional, aparece como una persona más en Familia, y el coach puede subirle videos eligiéndolo como alumno. Ambos padres (la pareja ligada) lo ven.

La app ya sabe manejar alumnos sin correo real: cuando el coach da de alta a alguien desde el admin, se crea un alumno que nunca inicia sesión. Reutilizamos ese mismo mecanismo, marcándolo además como "familiar sin cuenta" para que no se comporte como una cuenta normal.

## Qué verá el usuario

Página Familia (solo con plan de pago o prueba vigente):
- Botón "Agregar familiar sin cuenta" junto al bloque de invitar.
- Formulario: nombre (obligatorio), fecha de nacimiento (obligatoria), foto (opcional).
- Al guardar aparece en la lista con una etiqueta "Sin cuenta" y se puede entrar a su vista para ver videos, clases y progreso, igual que con cualquier familiar.
- Límite de 3 familiares sin cuenta por cuenta de pago; al llegar al tope el botón se desactiva con un mensaje claro.
- Quien lo creó (y su pareja) puede editar nombre, fecha y foto, y quitarlo de su familia.

Pareja:
- Al crearlo, queda ligado automáticamente a la pareja ya vinculada.
- Si más adelante se acepta una nueva invitación de pareja, los hijos sin cuenta de ambos se comparten automáticamente en ese momento.

Coach/admin:
- El familiar sin cuenta aparece en el buscador de alumnos como hasta ahora, así que el coach le sube videos y le agenda clases sin cambiar nada de su flujo.
- En el perfil del alumno en admin se muestra que es un familiar sin cuenta y quién lo creó.

## Detalles técnicos

Base de datos (migración aditiva):
- `profiles`: nuevas columnas `is_managed boolean not null default false`, `managed_by uuid` (creador) y `birth_date date`.
- Índice en `profiles(managed_by)`.
- `search_family_candidates` excluye perfiles con `is_managed = true` (no se invitan, se crean).
- Sin cambios en RLS de `family_links` (el vínculo ya se lee en ambas direcciones); la escritura de los vínculos la hace la edge function con service role.

Edge function nueva `create-managed-family-member` (verify_jwt = true), molde `create-student`:
- Valida el JWT del caller y que tenga plan de pago o prueba vigente (misma lógica de `billing_plans` + `trial_ends_at` que usa el portal).
- Valida nombre y fecha de nacimiento; cuenta cuántos `profiles` tienen `managed_by = caller` y rechaza a partir de 3.
- Crea el usuario placeholder igual que `create-student` (correo `nombre.timestamp@placeholder.sc`, contraseña aleatoria, sin acceso real), y marca `is_managed = true`, `managed_by = caller`, `birth_date`, `assigned_coach_id` heredado del creador, `plan_tier = 'free'`.
- Inserta `family_links` (creador como padre, hijo como `child_user_id`, `relationship = 'hijo'`) y el mismo vínculo para cada pareja ligada del creador.
- Devuelve el id creado.

Edge function nueva `update-managed-family-member`: permite a quien está ligado al hijo gestionado editar nombre, fecha de nacimiento y foto (solo perfiles con `is_managed = true`). La foto se sube desde el cliente al bucket que ya usa el portal para fotos de perfil.

Propagación a la pareja: en `accept-family-request`, cuando la relación aceptada es `pareja`, después de crear las dos filas simétricas se copian los vínculos de los hijos gestionados de cada uno hacia el otro (sin duplicar).

Front-end:
- `src/components/family/AddManagedMemberDialog.tsx`: formulario y llamada a la función; invalida `['family-accounts', user.id]`.
- `src/pages/StudentFamily.tsx`: botón + diálogo (solo con plan de pago), etiqueta "Sin cuenta" en las tarjetas de la lista (la query de cuentas trae también `is_managed`), y botón de editar en esas tarjetas.
- i18n ES/EN nuevas en `src/i18n/extra/misc.ts`.
- `src/integrations/supabase/types.ts` se regenera con la migración.

No se tocan: precios, Stripe, `computePackageCounts`, permisos por plan existentes, ni el flujo actual de alta de alumnos del coach.
