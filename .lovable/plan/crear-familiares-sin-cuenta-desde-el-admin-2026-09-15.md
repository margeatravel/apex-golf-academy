# Crear familiares sin cuenta desde el admin

Hoy el botón "Agregar familiar sin cuenta" solo existe en la página Familia del portal del alumno (y funciona en la vista previa). Desde el perfil del alumno en el admin no está, así que como coach no puedes crear al hijo de un cliente sin entrar a su vista previa.

## Qué cambia

En el perfil del alumno en el admin, dentro del bloque de vínculos familiares, se agrega un botón **"Agregar familiar sin cuenta"** que abre la misma ventana que usa el alumno: nombre, fecha de nacimiento y foto opcional.

- El familiar queda a nombre del alumno que estás viendo (no tuyo), ligado a él y a su pareja si ya tiene una vinculada, igual que cuando lo crea el propio alumno.
- Aparece en la lista de vínculos con la etiqueta "Sin cuenta" y se puede editar desde ahí.
- Sigue el límite de 3 familiares sin cuenta por alumno.
- Como coach o admin puedes crearlo aunque el alumno todavía no tenga membresía; el alumno lo verá en su sección Familia cuando tenga acceso (lo que ya definimos: paga él o alguien de su familia).

## Detalles técnicos

- `src/components/family/ManagedMemberDialog.tsx`: nueva prop opcional `ownerId`. Cuando viene, se envía como `onBehalfOf` en la llamada a `create-managed-family-member` / `update-managed-family-member` (hoy solo se manda dentro de la vista previa). La foto se sigue subiendo a la carpeta del usuario realmente autenticado.
- `src/components/FamilyLinksManager.tsx`: botón nuevo que abre `ManagedMemberDialog` con `ownerId = studentId`, botón de editar en las filas cuyo perfil tiene `is_managed`, y refresco de las consultas de vínculos al guardar. Requiere añadir `is_managed` al select de perfiles que ya hace el componente.
- `supabase/functions/create-managed-family-member/index.ts`: cuando el caller actúa `onBehalfOf` de otro usuario y pasa la validación `can_preview_student` (es decir, es admin o el coach asignado), se omite el requisito de plan pagado; para el propio alumno el requisito sigue igual. El límite de 3 y el resto de la lógica no cambian. Redeploy de la función.
