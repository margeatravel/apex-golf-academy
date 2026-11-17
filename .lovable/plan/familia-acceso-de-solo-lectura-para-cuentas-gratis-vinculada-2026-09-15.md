# Familia: acceso de solo lectura para cuentas gratis vinculadas

Hoy la página Familia muestra el teaser de suscripción a quien no tiene plan de pago, pero la vista individual de un familiar no está limitada, así que una cuenta gratis vinculada por alguien de pago sí puede ver contenido. La regla queda clara: si te agregaron, puedes ver; para invitar, hay que pagar.

## Comportamiento nuevo (solo en la página Familia)

Cuenta con plan de pago o prueba vigente: todo igual que hoy (invitar, invitaciones enviadas, lista, quitar familiares).

Cuenta gratis:
- Si tiene al menos un familiar vinculado: ve la lista de esos familiares y puede entrar a cada uno, igual que hoy. En lugar del bloque "Invitar a un familiar" aparece una tarjeta breve de suscripción (misma estética glass, acento dorado) con el botón "Suscríbete" hacia la página de planes.
- No puede invitar, ni cancelar/enviar invitaciones (esa sección queda oculta).
- Sí puede quitar a un familiar de su propia lista (ya existe y no depende del plan).
- Si no tiene ningún familiar vinculado: sigue viendo el teaser completo actual, sin cambios.

El resto del portal (tarjeta de familia en el inicio y la vista individual de un familiar) queda como está hoy.

## Detalles técnicos

- `src/pages/StudentFamily.tsx`: la decisión deja de ser `hasPaidPlan ? contenido : FamilyTeaser`. Pasa a tres casos, esperando a que carguen tanto `useHasPaidPlan` como la query `['family-accounts', user.id]`:
  - `hasPaidPlan` → render actual completo.
  - `!hasPaidPlan && accounts.length > 0` → render de la lista actual + botón de quitar, ocultando la sección de invitar y la de "Invitaciones enviadas", y anteponiendo una tarjeta compacta de upsell.
  - `!hasPaidPlan && accounts.length === 0` → `FamilyTeaser` actual, sin cambios.
- Nuevo componente ligero de upsell (o variante `compact` de `FamilyTeaser`) con `glass-card`, acento `#F0C040` y CTA `Link` a `/plans`, reutilizando el copy existente; se agregan solo las claves i18n nuevas que hagan falta en `src/i18n/extra/misc.ts` (ES/EN).
- Sin cambios en base de datos, RLS, edge functions, precios ni Stripe. La lista ya es legible por política existente (`parent_user_id = auth.uid() OR child_user_id = auth.uid()`).
