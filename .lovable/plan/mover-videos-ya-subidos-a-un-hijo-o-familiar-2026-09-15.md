# Mover videos ya subidos a un hijo o familiar

En el perfil del alumno (pestaña Videos) podrás seleccionar varios videos y moverlos a un familiar del alumno —incluyendo hijos sin cuenta propia—. A partir de ahí el video le pertenece al hijo: deja de contar en los reportes y en la galería del papá, y el papá lo sigue viendo entrando a su familiar desde la sección Familia.

## Qué verás

- En la pestaña Videos del perfil del alumno: un botón "Seleccionar"; al activarlo cada tarjeta muestra una casilla y aparece una barra con "N seleccionados" y el botón "Mover a…".
- "Mover a…" abre una lista con el propio alumno y sus familiares vinculados (con la etiqueta "Sin cuenta" en los hijos gestionados). Eliges a quién y confirmas.
- Si un video seleccionado está ligado a una clase del papá, se desliga al moverlo (la clase sigue igual); se avisa en la confirmación.
- Resumen al terminar: cuántos se movieron.
- Si el alumno no tiene familia vinculada, la pestaña se ve como hoy.

## Detalles técnicos

- Nueva función de servidor `move-videos-to-family`:
  - Valida que quien la llama sea dueño/admin o el coach asignado, y que el destinatario esté vinculado al alumno actual por `family_links`.
  - Para cada id recibido: actualiza `videos.student_id` (y `student_media.student_id` cuando el id venga de esa tabla), pone `lesson_id = null` si la clase pertenece a otra persona, mueve el archivo y su miniatura de la carpeta del alumno a la del destinatario en `lesson-videos` / `golf-media`, y reescribe `file_url` / `thumbnail_url`. Es idempotente: repetir no duplica ni rompe nada (misma mecánica que ya usa el merge de alumnos).
  - Devuelve `{ moved, files_moved, skipped }`.
- Migración: añadir a `storage.objects` una política de lectura para `golf-media` equivalente a la que ya existe en `lesson-videos`, para que un papá vinculado pueda ver las fotos/videos de su hijo (`is_family_parent_of(auth.uid(), carpeta)`).
- `src/pages/AdminStudentDetail.tsx` (pestaña `videos`): modo selección (`selectMode`, `selectedIds`), casillas en las tarjetas, barra de acciones y diálogo `MoveVideosToFamilyDialog`.
- Nuevo `src/components/family/MoveVideosToFamilyDialog.tsx`: usa el hook existente `useFamilyTargets` para listar destinatarios, llama a la función y refresca `['student-videos', studentId]` y la galería de medios.
- Portal del alumno: no requiere cambios — al cambiar de dueño, el video desaparece de "Mis videos" del papá y aparece dentro de su familiar en la sección Familia.

No se tocan: el flujo de subida recién hecho, reportes, precios, Stripe, ni las políticas existentes de `lesson-videos`.
