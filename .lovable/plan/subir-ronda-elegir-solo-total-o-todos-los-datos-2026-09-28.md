# Subir ronda: elegir "Solo total" o "Todos los datos"

## Qué cambia
1. Al abrir "Agregar ronda", primero salen dos botones:
   - **Solo el total** — rápido.
   - **Todos los datos** — completo.
2. **Solo el total:** campo, fecha, hoyos (9/18), par y score total. Nada más.
3. **Todos los datos:** el formulario completo de hoy (fairways, greens, putts, penalidades, bolas perdidas, up & downs, desglose de score, notas).
   - Ningún dato extra es obligatorio: lo que deje vacío se guarda vacío y la ronda se sube igual.
   - Solo campo y score total siguen siendo obligatorios (como hoy).
4. Botón "Cambiar" arriba para regresar a la elección sin perder lo escrito.
5. Textos en ES/EN.

## Qué no cambia
- La forma de guardar, las estadísticas, las gráficas y el formulario del Coach.

## Detalles técnicos
- `src/components/LogRoundModal.tsx`: estado `mode: null | 'quick' | 'full'`, se resetea al cerrar. En `quick` se ocultan las secciones de estadísticas y se guardan como `null`. Revisar que ninguna validación extra bloquee en `full` (solo score y campo).
- Nuevas claves en `src/i18n/extra/prozone2.ts` (`logRound.modeQuick`, `modeFull`, descripciones, `changeMode`).
