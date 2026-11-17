# PDF más claro + Pro que baja de precio

Revisé Stripe: hoy **no existe** ningún descuento escalonado (sin calendarios de precio ni cupones). Pro cobra $999 fijo.

## Escalones (baja $100 cada 2 meses)

```text
Meses 1-2   $999
Meses 3-4   $899
Meses 5-6   $799
Meses 7-8   $699
Meses 9-10  $599
Mes 11 en adelante  $499 (se queda así)
```

## 1. PDF para clientes
- Fondo verde más claro (verde salvia/menta suave), sin perder el tono Apex.
- Tarjetas más glass: más translúcidas, borde brillante y reflejo superior.
- En la tarjeta Pro: mini escalera de precios "Tu precio baja cada 2 meses hasta $499/mes" con los 6 escalones.
- Sigue en una página; colores por plan y ahorro Pro se conservan.

## 2. Cobro real en Stripe
- Crear 5 precios mensuales nuevos del Pro ($899, $799, $699, $599, $499), sin borrar el de $999.
- Al suscribirse a Pro, el pago crea automáticamente un calendario en Stripe que aplica cada escalón cada 2 meses y termina fijo en $499.
- Suscriptores Pro actuales: no se cambian (decides después si los migramos).
- Página de planes muestra el mismo texto de la escalera.

## Detalles técnicos
- Edge function del webhook/checkout: tras crear la suscripción Pro, `subscription_schedules.create(from_subscription)` con 6 fases (iterations 2 c/u, última abierta).
- Precios nuevos guardados como referencia en billing_plans (metadata), sin alterar price_amount actual.
- Texto de escalones derivado de una sola lista compartida (PDF + página de planes) con test.
