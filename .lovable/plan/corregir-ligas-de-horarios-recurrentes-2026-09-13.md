# Corregir ligas de horarios recurrentes

## Objetivo
Mantener permanentemente la liga manual entre cada horario recurrente y su paquete, restaurar únicamente las ligas respaldadas por datos inequívocos y registrar cualquier cambio automático futuro.

## Cambios
1. **Generación nocturna**
   - Eliminar del generador la reasignación y el borrado automático de `recurring_lesson_slots.package_id`.
   - Seguir regenerando clases según capacidad, pero sin modificar la liga del horario aunque el paquete esté agotado, pausado o inactivo.

2. **Salvaguarda y auditoría**
   - Crear un historial consultable de cambios de liga con valor anterior/nuevo, origen, actor y fecha.
   - Añadir una protección en base de datos que impida a procesos automáticos cambiar o borrar la liga salvo que declaren explícitamente una operación administrativa autorizada; todo intento/cambio se registra.
   - Mantener disponibles los cambios manuales del panel.

3. **Restauración segura**
   - Restaurar solo horarios activos sin liga cuyo historial de clases generadas identifica de forma inequívoca el último paquete original.
   - No asignar nada cuando existen varios candidatos sin evidencia suficiente; reportar alumno, día y hora para rehacerlo manualmente.

4. **Verificación**
   - Confirmar que “Sin paquete activo” aparece únicamente cuando `package_id` sigue vacío.
   - Desplegar y probar la tarea nocturna corregida sin alterar precios, planes ni suscripciones.
   - Entregar el diff exacto, el resultado de restauración y la lista de casos ambiguos.

## Detalles técnicos
- Cambios previstos en `supabase/functions/generate-recurring-lessons/index.ts` y una migración aditiva para historial/protección/restauración.
- No se eliminan tablas, registros ni políticas existentes.
