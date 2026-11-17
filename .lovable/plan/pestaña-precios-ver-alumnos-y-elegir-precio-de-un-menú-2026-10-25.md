# Pestaña Precios: ver alumnos y elegir precio de un menú

## Qué cambia (solo en la pestaña Precios)
1. **"N alumnos" se puede abrir**: al tocar el texto (o pasar el mouse en computadora) aparece la lista de nombres de ese grupo.
2. **Menús de precio en lugar de escribir**:
   - La casilla "Nuevo" de cada grupo pasa a ser un menú con precios en pasos de $50 MXN.
   - "Precio por clase" (el de "Subir todos") también pasa a ser un menú.
   - El menú va de $50 a $3,000 e incluye "Sin cambio" para quitar el precio nuevo.

Todo lo demás se queda igual.

## Detalles técnicos
- `src/components/revenue/RevenueProjectionChart.tsx`: agrupar los nombres de `students` por tier y mostrarlos en un Popover que abre con clic y con hover. Cambiar los dos `Input` por `Select` con opciones de 50 en 50 (50 a 3000), y añadir "Sin cambio" en el menú de cada grupo.
