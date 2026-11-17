# Familia: el acceso lo abre quien paga, no el coach

Hoy, si el coach liga dos cuentas gratis desde el admin, ambas ven de inmediato el contenido de Familia. Eso cambia: ligar desde el admin ya no da acceso. El acceso se abre solo cuando alguien de la familia tiene membresía de pago (o prueba vigente).

## Reglas nuevas

- **Tienes plan pagado (o prueba vigente)**: todo igual que hoy — lista, invitar, crear familiar sin cuenta, quitar vínculos.
- **Eres gratis pero alguien de tu familia ligada paga**: ves la lista y puedes entrar a tus familiares (solo lectura), con la tarjeta de suscripción que ya existe.
- **Eres gratis y nadie de tu familia paga** (caso del coach ligando cuentas): ves el teaser de venta, aunque ya tengas vínculos.

## El teaser muestra cuántos familiares tienes ligados

Igual que el teaser de videos ("Tienes 12 videos esperándote"), el de Familia mostrará el número en grande:

- "Tienes **3** familiares ligados" / "You have **3** linked family members", con una línea corta invitando a suscribirse para verlos.
- Si no hay ningún vínculo, se queda el título actual ("Bring your family into your game").
- El muro decorativo, los 3 beneficios y el botón "Suscríbete" a /plans no cambian.

## Detalles técnicos

- Nueva función de base de datos `family_access_status()` (SECURITY DEFINER, solo lectura): para el usuario autenticado devuelve `linked_count` (vínculos en ambas direcciones, sin duplicar, excluyendo a uno mismo) y `has_paid_relative` (si alguno de esos familiares tiene plan de pago). "Pagado" se resuelve contra `billing_plans` (price_amount > 0, activo) comparando contra `plan_tier` / `manual_plan_override` vigente / `trial_ends_at` de cada familiar — sin listas de planes escritas a mano. Es necesaria porque las políticas de `profiles` no permiten a un alumno leer el plan de otra cuenta.
- Nuevo hook `src/hooks/useFamilyAccess.ts`: combina `useHasPaidPlan()` con esa función y devuelve `{ canUseFamily, canInvite, linkedCount, loading }`.
  - `canInvite` = plan pagado propio.
  - `canUseFamily` = plan pagado propio **o** `has_paid_relative`.
- `src/pages/StudentFamily.tsx`: el gate deja de usar `accounts.length > 0` y pasa a usar `canUseFamily`; los bloques de invitar / crear familiar sin cuenta siguen condicionados a `canInvite` (comportamiento actual con `hasPaidPlan`).
- `src/components/family/FamilyTeaser.tsx`: acepta `linkedCount` opcional y, cuando es > 0, pinta el número grande con el color del plan de quien mira (dorado si es gratis), igual que el teaser de videos.
- i18n ES/EN: `misc.familyTeaserCountTitle` ("Tienes {n} familiares ligados") y `misc.familyTeaserCountSubtitle`.

No se tocan: `family_links` ni sus políticas, el vínculo del coach en el admin, las invitaciones, los videos de familia, precios ni Stripe.
