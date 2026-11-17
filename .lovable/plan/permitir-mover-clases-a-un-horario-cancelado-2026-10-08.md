# Permitir mover clases a un horario cancelado

## Causa (confirmada)
Hoy cancelaste clases de 7, 8 y 10 am. Las tres vienen de horarios recurrentes. Cuando revisa choques, la app no cuenta las clases canceladas. Por eso tampoco se da cuenta de que esa semana el horario recurrente ya tiene su clase (la cancelada), y sigue viendo ese horario como ocupado. El resultado es que te sale "choque" aunque el lugar esté libre.

## Cambio
- En la revisión de choques (`src/lib/lessonSlotConflicts.ts`, `findSlotConflicts`), un horario recurrente deja de contar como ocupado cuando ese día ya tiene una clase, aunque esté cancelada.
- Las clases canceladas siguen sin bloquear nada.
- Aplica a todas las pantallas que usan esa revisión: agenda de hoy, editar clase, agregar clase y cupos abiertos.

## Detalles técnicos
- Se hace una consulta aparte de las clases del día, incluidas las canceladas, solo para armar `slotsWithLesson`. La lista de choques sigue ignorando las canceladas.
- No se tocan paquetes, `generate-recurring-lessons`, permisos ni el guardado.
- Verificación: probar con la clase cancelada de hoy a las 10 am y confirmar que ya no salga como choque.
