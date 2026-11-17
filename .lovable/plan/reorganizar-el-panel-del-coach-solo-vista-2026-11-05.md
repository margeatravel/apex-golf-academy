# Reorganizar el panel del coach (solo vista)

Mismas funciones, menos scroll y más orden. Nada de datos, permisos ni lógica cambia.

## Nuevo orden
1. **Encabezado compacto**: saludo en una línea + fecha de hoy.
2. **Hoy** (Clases de hoy) igual, pero como tarjeta glass con el punto verde "en vivo".
3. **Indicadores en fila deslizable** (alumnos, ingresos del mes, clases, horarios recurrentes con su botón +): tarjetas más bajas, en el teléfono se deslizan de lado en vez de apilarse.
4. **Calendario semanal** igual, como pieza principal.
5. **Accesos rápidos en cuadrícula 2x2**: Administrar clases, Análisis de swing (con contador de pendientes), Biblioteca Pro Zone, Vista familiar. Reemplazan los 4 banners largos actuales.
6. **Alumnos** al final: buscador siempre visible, lista colapsada por defecto (como hoy).

## En computadora
Dos columnas: izquierda calendario + alumnos; derecha Hoy + indicadores + accesos rápidos.

## No cambia
Botones, menús de cada clase (editar, saltar, borrar), buscador, ordenar, refrescar, notificaciones, menú lateral y todos los enlaces.

## Técnico
Solo `src/pages/AdminDashboard.tsx` (JSX/clases). Reutiliza `.lesson-glass`/`.pro-zone-tile`. Verificación con Playwright en 390px y 1280px.
