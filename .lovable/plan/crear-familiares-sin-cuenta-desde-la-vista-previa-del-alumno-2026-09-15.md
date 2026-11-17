# Crear familiares sin cuenta desde la vista previa del alumno

## Qué está pasando

Sí se crearon, pero quedaron en la familia equivocada. Al crearlos desde la vista previa de Alejandro Andrade, el sistema los registró como familiares de **Santiago Castilla** (la cuenta con la que estás dentro de la app), no de Alejandro. Por eso no aparecen en su página de Familia.

Hoy existen dos registros creados así:
- "Mauro Andrade" (creado 17:24)
- "Mauro" (creado 17:25, duplicado)

Ambos están ligados a Santiago.

## Qué se va a hacer

1. **Crear y editar en nombre del alumno previsualizado.** Cuando el coach/dueño está dentro de la vista previa de un alumno, el familiar sin cuenta se crea para ese alumno: queda ligado a él y a su pareja, hereda su coach, y el límite de 3 se cuenta sobre el alumno, no sobre el coach. Lo mismo al editar nombre, fecha o foto.
2. **Permiso verificado del lado del servidor**, no solo en pantalla: solo el dueño o el coach asignado a ese alumno puede hacerlo (la misma comprobación que ya autoriza la vista previa). Un alumno cualquiera no puede crear familiares en la familia de otro.
3. **Requisito de membresía**: en este caso se revisa el plan/prueba del alumno previsualizado, no el del coach.
4. **La vista previa deja pasar esta acción de verdad** (crear/editar familiar sin cuenta), en lugar de simularla como el resto de las escrituras; es una acción que el coach realiza legítimamente por el alumno.
5. **Limpieza de los dos registros ya creados**: se reasigna "Mauro Andrade" a la familia de Alejandro Andrade y se elimina el duplicado "Mauro". Si prefieres conservar ambos o mover ambos, dímelo antes de aplicar.

## Detalles técnicos

- `create-managed-family-member` y `update-managed-family-member`: nuevo parámetro opcional `onBehalfOf`. Si viene, se valida con la función `can_preview_student(_student_id)` usando el JWT del caller; el "owner" efectivo pasa a ser ese id para `managed_by`, `hasPaidAccess`, el conteo de `MAX_MANAGED`, `assigned_coach_id` heredado y los `family_links` (incluida la pareja). Sin el parámetro, el comportamiento actual no cambia.
- `update-managed-family-member`: además del vínculo familiar directo, acepta al caller autorizado por `can_preview_student(managed_by)`.
- `src/components/family/ManagedMemberDialog.tsx`: lee `useStudentPreview()`; si `isStudentPreview`, envía `onBehalfOf: studentId` y sube la foto a la carpeta del alumno previsualizado.
- `src/lib/previewWriteGuard.ts`: añadir `create-managed-family-member` y `update-managed-family-member` a la lista de funciones que sí se ejecutan dentro de la vista previa.
- Limpieza de datos (consultas puntuales, sin migración): `family_links` de "Mauro Andrade" y `profiles.managed_by` apuntando a Alejandro Andrade; borrado del perfil duplicado "Mauro" y su vínculo.

No se tocan: precios, Stripe, RLS existentes, permisos por plan, ni el flujo normal (fuera de vista previa) de la página Familia.
