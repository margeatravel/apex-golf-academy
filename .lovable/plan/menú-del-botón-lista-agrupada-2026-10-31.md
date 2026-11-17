# Menú del botón + — lista agrupada

Solo cambia el aspecto del menú que sube al picar +. Mismas opciones, mismo orden, mismas acciones.

## Cambios
- Cada grupo (accesos principales y "Más") dentro de su propia tarjeta glass: fondo translúcido, borde sutil, esquinas redondeadas.
- Título pequeño en mayúsculas arriba de cada tarjeta (ej. "Accesos" y "Cuenta").
- Filas separadas por líneas finas dentro de la tarjeta, con flecha › a la derecha.
- Íconos en cuadrito redondeado con su color actual.
- "Cerrar sesión" sola al final, en rojo, separada.
- Ligera animación de subida al abrir.

## Técnico
- Solo `src/components/StudentBottomNav.tsx` (bloque del sheet, líneas ~320–368) y una etiqueta nueva en i18n para el título del primer grupo.
- No se tocan navegación, permisos ni la barra inferior.
