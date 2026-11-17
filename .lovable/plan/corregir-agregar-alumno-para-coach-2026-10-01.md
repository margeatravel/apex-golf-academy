# Corregir “Agregar alumno” para Coach

## Cambio
- Permitir que un usuario con rol Coach use la función existente de crear alumnos.
- Mantener la validación de sesión y asignar el alumno únicamente al Coach autenticado.
- No cambiar permisos de Admin/Staff ni otras funciones.

## Verificación
- Publicar la función corregida.
- Probar el flujo autenticado con Javier y confirmar que el alumno queda asignado a él.
