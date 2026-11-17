# Prueba gratis = acceso completo

Hoy la prueba gratis solo abre una parte del portal. Verificado en el código:

- Videos (Mis Videos) y las categorías de Pro Zone SÍ se abren durante la prueba.
- Pro Zone (pantalla principal, estadísticas, comparar swings, análisis, registrar ronda, avisos) NO se abre: la función de acceso ignora la prueba a propósito.
- Apex AI NO se abre durante la prueba (ni en la app ni en la validación del servidor).
- La página Familia NO se abre: su control considera "pagado" solo por el plan, sin mirar la prueba.

## Qué se va a cambiar

Durante una prueba vigente (fecha de fin en el futuro), el alumno verá todo el portal como un plan de pago:

1. **Pro Zone completo** — pantalla principal, estadísticas, registrar ronda, comparar swings, análisis de swing y el acceso a sus avisos.
2. **Apex AI** — tanto la pantalla del alumno como la autorización del servidor que usan el coach de IA y el plan de entrenamiento.
3. **Familia** — se muestra la página real en vez del teaser de suscripción.
4. **Videos** — ya funciona; queda igual.

Cuando la prueba termina, todo vuelve exactamente al comportamiento actual (teaser/pantalla bloqueada con botón hacia planes). Los menús siguen mostrando las entradas como hoy.

## Detalle técnico

- `src/contexts/AuthContext.tsx`: `hasProZoneAccess` y `hasApexAiAccess` dejan de ignorar `trialEndsAt` y devuelven `true` cuando `isInTrial(trialEndsAt)`. Como todas las pantallas de Pro Zone (`ProZone`, `ProZoneStats`, `ProZoneSwingAnalysis`, `CompareSwings`, `ProZoneGate`, `VideoUploadFAB`, `StudentBottomNav`, `MobileMenu`, `useStudentNavEntries`, `useBroadcastNotifications`, `StudentDashboard`) ya pasan `trialEndsAt`, un solo cambio cubre todas.
- `src/hooks/useApexAiAccess.ts`: agregar `isInTrial(trialEndsAt)` como acceso permitido, junto a la ventana de gracia.
- `src/hooks/useHasPaidPlan.ts`: tratar la prueba vigente como "pagado" para efectos de vista (gate de la página Familia). Solo presentación; no cambia el plan ni el cobro.
- Base de datos (una migración aditiva): `has_apex_ai_access(_user_id)` devuelve `true` también si `profiles.trial_ends_at > now()`, para que el coach de IA y el plan de entrenamiento no rechacen a alumnos en prueba. `has_pro_zone_access` recibe el mismo agregado por consistencia.
- No se tocan: precios, IDs de Stripe, políticas RLS, permisos de staff, `billing_plans`, ni la duración/asignación de la prueba (sigue administrándose desde el panel de admin).
