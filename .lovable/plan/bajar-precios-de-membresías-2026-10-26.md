# Bajar precios de membresías

## Precios nuevos (mensuales, MXN)
- Familiar: $299 → **$59**
- Scratch: $599 → **$99**
- Pro: $999 → **$299**
- Apex Level: sin cambio ($14,999)
- Gratis: sin cambio

## Qué pasa
- Se actualiza el precio de cada plan en Planes y crea su precio nuevo en Stripe con la sincronización que ya existe.
- Quienes ya pagan conservan su precio actual hasta que tú decidas moverlos (Stripe no les cambia el cobro solo).
- Los textos de ahorro o comparación de planes se recalculan solos con los precios nuevos.

## Detalles técnicos
- Actualizar `billing_plans.price_amount` (5900, 9900, 29900) de Familiar, Scratch y Pro.
- Ejecutar `sync-stripe-plan` para cada uno: crea un precio nuevo en Stripe y archiva el anterior; los suscriptores actuales no se migran.
- Revisar textos con precios fijos (p. ej. promos o "hasta $1,198 de cortesía") y la fórmula de ahorro de Pro.
