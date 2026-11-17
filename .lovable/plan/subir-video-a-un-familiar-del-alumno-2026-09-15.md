# Subir video a un familiar del alumno

Cuando el coach sube un video y elige a un alumno, si ese alumno tiene familia vinculada (hijos con o sin cuenta, o pareja) aparecerá un segundo selector: "¿De quién es este video?" con el propio alumno (marcado por defecto) y sus familiares. El video se guarda en la cuenta de quien elijas, y los papás lo ven en su vista de familia.

Si el alumno no tiene familia vinculada, la pantalla se ve exactamente como hoy.

## Dónde aparece

- Botón flotante de subir video del coach (la forma principal de subir).
- Página de subir video del panel de administración.
- Subida de fotos/videos desde el perfil del alumno.

En los flujos que cuelgan de una clase (agregar clase con media), el video sigue perteneciendo al alumno de esa clase; ahí no se agrega el selector, porque cambiar el dueño rompería la liga con la clase.

## Detalles técnicos

- Nuevo hook `src/hooks/useFamilyTargets.ts`: para un `studentId`, lee `family_links` en ambas direcciones, resuelve los perfiles del otro extremo (`id, full_name, photo_url, is_managed, relationship`) y devuelve una lista `[alumno, ...familiares]`. Sin vínculos devuelve lista de un solo elemento.
- Nuevo componente `src/components/family/FamilyTargetSelect.tsx`: se renderiza solo si hay más de un destinatario; chips/select con el nombre, etiqueta "Sin cuenta" en los gestionados, y `onChange(targetId)`.
- `src/components/CoachFAB.tsx` (`CoachVideoUploadSheet`): estado nuevo `targetStudentId`, inicializado con `selectedStudentId` y reseteado cuando cambia el alumno. Todo lo que hoy usa `selectedStudentId` para la subida (ruta en storage, `videos.student_id`, notificación y puntos) pasa a usar `targetStudentId`; la lista de clases para ligar el video sigue leyéndose del alumno elegido, y si el destinatario es un familiar el video se sube como video suelto (sin `lesson_id`) para no ligar la clase de otra persona.
- `src/pages/AdminUploadVideo.tsx`: mismo patrón — selector extra bajo el de alumno y `targetStudentId` como dueño del archivo y de la fila en `videos`.
- `src/components/MediaUploadModal.tsx`: acepta un `studentId` efectivo elegido en el modal cuando se abre fuera del contexto de una clase (perfil del alumno); en contexto de clase mantiene el alumno de la clase.
- i18n ES/EN nuevas en `src/i18n/extra/media.ts` (título del selector, opción "Este alumno", etiqueta "Sin cuenta").

No se tocan: permisos de storage, RLS, la estructura de `videos`/`student_media`, precios ni Stripe.
