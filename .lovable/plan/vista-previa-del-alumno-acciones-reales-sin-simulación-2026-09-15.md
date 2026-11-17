# Vista previa del alumno: acciones reales, sin simulación

Hoy, dentro de la vista previa de un alumno, casi todo lo que haces se "simula": aparece el aviso "Modo preview: acción simulada" y nada se guarda. Por eso no pudiste quitar un familiar vinculado.

## Qué cambia

- Se retira por completo el modo simulación de la vista previa: guardar, borrar, subir archivos, llamar funciones del servidor y también pagos/suscripciones se ejecutan de verdad.
- Quitar un familiar vinculado desde la vista previa funciona: borra el vínculo en ambos sentidos del alumno previsualizado (no del tuyo).
- El aviso amarillo de "estás viendo como alumno" se queda, y además advierte que los cambios sí se guardan, para que no haya confusión.

## Advertencias importantes

- Todo lo que hagas ahí queda guardado en la cuenta del alumno, sin deshacer.
- Los cobros dejan de ser de mentira: si abres un checkout y lo completas, se cobra de verdad.

## Detalles técnicos

- `src/lib/previewWriteGuard.ts`: `setPreviewWriteGuard` deja de activar el parcheo (el guard queda inerte, sin interceptar `from().insert/update/delete`, `rpc`, `functions.invoke`, `storage` ni `auth.updateUser`). Se conserva el archivo y su API para no romper imports.
- `src/pages/StudentFamily.tsx`: `removeMut` borra los `family_links` usando el id del alumno previsualizado (que ya es `user.id` dentro de `PreviewStudentAuth`) en ambas direcciones; como la vista previa es solo para el dueño (admin), las políticas de administrador permiten el borrado.
- `src/components/StudentPreviewBanner.tsx`: se añade una línea corta indicando que los cambios se guardan de verdad.
- Nota conocida: las acciones que el servidor atribuye a quien está firmado (`auth.uid()`) seguirán registrándose a tu cuenta de administrador, salvo en los flujos que ya aceptan actuar en nombre del alumno (familiares sin cuenta). Si aparece alguno concreto mal atribuido, se ajusta en ese flujo.

No se tocan: precios, IDs de Stripe, políticas de acceso (RLS), permisos por plan ni el comportamiento fuera de la vista previa.
