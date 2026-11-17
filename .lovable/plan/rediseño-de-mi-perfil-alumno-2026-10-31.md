# Rediseño de "Mi perfil" (alumno)

Hoy: foto, 2 tarjetas de plan repetidas, accesos, invitar, y 3 formularios largos siempre abiertos. Nuevo: limpio, accesos rápidos arriba y un feed cronológico motivador.

## Nueva estructura (de arriba a abajo)

1. **Encabezado compacto**: foto (cambiar foto), nombre, chip del plan (una sola vez, con "Administrar" o "Mejorar"), handicap actual → meta.
2. **Accesos rápidos** (fila de 4 íconos): Reservar, Mis videos, Reporte de avances, Invitar amigo.
3. **Meta en progreso**: barra de handicap actual vs meta y fecha objetivo, con mini gráfica de historial.
4. **Mi recorrido (feed cronológico)**: lo más reciente arriba, mezcla de:
   - Clases completadas (fecha, tipo)
   - Videos subidos
   - Rondas registradas (score, torneo · lugar)
   - Cambios de handicap / nuevo mejor score (destacado en dorado)
   Muestra 10 y botón "Ver más".
5. **Editar perfil** (colapsado): datos personales, golf (GHIN, TheGrint, meta) y objetivos, con botón Guardar dentro.
6. Vincular coach solo si no tiene coach (igual que hoy).

## Qué se quita
- Tarjeta de plan duplicada (queda una).
- Formularios siempre abiertos (pasan a la sección colapsada).

## No se toca
Planes/precios, Stripe, permisos, datos guardados, Inicio del alumno.

## Detalles técnicos
- Archivo: `src/pages/StudentProfile.tsx`; feed en componente nuevo `ProfileTimeline` leyendo lessons (completed), student_media/videos y golf_rounds del alumno, ordenado por fecha (Cancún).
- Formulario existente se reutiliza dentro de un Collapsible; misma lógica de guardado.
- Textos nuevos en ES/EN en translations; colores con tokens del tema.
