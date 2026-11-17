# Ver también los videos de los familiares en la vista de coach

Hoy, en el perfil de un alumno, la pestaña Videos solo muestra lo que está a nombre de ese alumno. Si moviste un video a su hijo, desaparece de ahí. Como coach quieres seguir viendo todo lo que subiste a ese alumno y a su familia.

## Qué verás

- En la pestaña Videos del perfil, debajo de los videos del alumno, una sección nueva: **"Videos de su familia"**, con los videos y fotos que pertenecen a sus familiares vinculados (hijos con o sin cuenta, pareja).
- Cada tarjeta muestra de quién es (por ejemplo "Mauro · sin cuenta") y se abre igual que los demás.
- El modo "Seleccionar" también funciona ahí, así que puedes mover un video de regreso al alumno o a otro familiar si te equivocaste.
- Si el alumno no tiene familia vinculada, la pestaña se ve exactamente como hoy.
- Los conteos, reportes y estadísticas del alumno **no cambian**: los videos de la familia se muestran aparte y no se suman a sus números.

## Detalles técnicos

- `src/pages/AdminStudentDetail.tsx`: nueva consulta `['student-family-videos', studentId]` que, a partir de los familiares que ya devuelve el hook `useFamilyTargets`, lee `videos` y `student_media` de esos ids (con el nombre del dueño) y los ordena por fecha. Las consultas actuales `['student-videos']` y de `student_media` quedan intactas, igual que `allVideos`, `analysisVideos` y `lessonVideos`, para no alterar reportes.
- La sección nueva reutiliza el mismo diseño de tarjeta y el modo de selección existente; el diálogo `MoveVideosToFamilyDialog` recibe el dueño actual del archivo para poder moverlo de vuelta al alumno (la función de servidor ya valida que origen y destino estén vinculados por `family_links`).
- El acceso de lectura ya existe: como coach asignado/admin puedes ver los archivos de ambos en los depósitos `lesson-videos` y `golf-media`.

No se tocan: la subida de videos, los reportes, la sección Familia del portal del alumno, precios ni Stripe.
