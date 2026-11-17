# Clase individual de cortesía

En **Add Lesson → Single Lesson**, agregar una cuarta opción de pago: **Cortesía** (junto a Pending / Partial / Paid).

## Comportamiento
- Al elegir Cortesía se oculta el campo de monto.
- La clase se guarda con monto 0, sin cobro pendiente ni pago registrado.
- Método de pago guardado como "Courtesy" y nota "🎁 Cortesía" en la clase, para identificarla.
- No aparece como adeudo ni suma ingresos en Revenue.
- No descuenta de ningún paquete.

## Técnico
- `src/components/AddLessonModal.tsx`: `PaymentMode` añade `'courtesy'`; `PaymentBlock` muestra el botón y oculta monto/parcial; en `handleSave` si courtesy → `revenue: 0`, `payment_method: 'Courtesy'`, `paymentLabel` = "🎁 Cortesía".

## No se toca
Stripe, precios, paquetes, triggers, cálculo de ingresos.
