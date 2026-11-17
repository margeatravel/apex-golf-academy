# Arreglar los videos de familia y los videos ajenos en "Mis videos"

Revisé los datos y son dos fallas distintas.

## 1) Los videos de Mauro no se ven en Familia

Los 9 videos que moviste sí quedaron a nombre de Mauro. La vista de un familiar solo lee la tabla de "fotos y medios" del alumno y nunca la de videos, y además un papá no tiene permiso de lectura sobre los videos de su familiar: por eso la sección sale vacía.

Arreglo:
- La vista del familiar mostrará también los videos (tabla `videos`), mezclados con los medios y ordenados por fecha, con su miniatura firmada para que se abran bien (hoy usa el enlace directo, que en archivos privados no abre).
- Permiso de lectura nuevo: quien esté vinculado por `family_links` (en cualquiera de las dos direcciones) podrá ver las filas de `videos` y `student_media` de su familiar. Es solo lectura; nadie gana permisos de edición ni de borrado. Los permisos de archivos ya existen.

## 2) En "Mis videos" de Alejandro aparecen videos de Rafa Obregón y Santiago Benito

La página de videos del alumno trae "mis videos **o** cualquier video ligado a una de mis clases". Hay videos que pertenecen a Rafa Obregón y a Santiago Benito pero están ligados a clases de Alejandro (clases compartidas), así que se cuelan en su galería. Confirmado en los datos: 12 videos de esas dos personas apuntan a clases de Alejandro.

Arreglo: la galería del alumno mostrará únicamente los videos que son suyos. Un video ligado a una clase compartida se seguirá viendo con su dueño real, no con los demás participantes. Esto aplica igual al conteo del teaser de plan gratis.

No se cambian datos: las filas de Rafa y Santiago se quedan como están, solo dejan de aparecer en la galería de Alejandro.

## Detalles técnicos

- `src/components/family/ChildOverview.tsx`: la consulta de medios pasa a leer `student_media` y `videos` del familiar, unifica campos (`file_url`, `thumbnail_url`, fecha), ordena descendente y limita a 8; las tarjetas usan la miniatura firmada y abren el archivo con URL firmada en vez del `href` público.
- Migración: políticas `SELECT` en `public.videos` y `public.student_media` para usuarios vinculados por `family_links` en cualquier dirección (función `SECURITY DEFINER` auxiliar que evalúa ambos sentidos, para evitar recursión). Sin cambios en `INSERT`/`UPDATE`/`DELETE`.
- `src/pages/StudentVideos.tsx`: `buildStudentVideoOr` deja de agregar `lesson_id.in.(...)`; las consultas de la galería y de `fetchLockedVideoInventory` filtran por `student_id` del alumno.

No se tocan: la subida de videos, el mover videos a un familiar, la vista de coach, reportes, precios ni Stripe.
