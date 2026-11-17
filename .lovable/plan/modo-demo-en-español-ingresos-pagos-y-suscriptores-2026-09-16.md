# Modo demo en español: Ingresos, Pagos y Suscriptores

Cuando pones el portal en español, buena parte de las pantallas de dinero del coach siguen en inglés porque su texto está escrito directo en pantalla y no pasa por el sistema de idiomas. Esto lo arregla en las tres pantallas que elegiste.

## Qué se va a hacer

1. **Ingresos** — títulos, tarjetas de totales, filtros, pestañas, tablas, botones y mensajes vacíos pasan al sistema de idiomas, con su versión en español.
2. **Pagos (Stripe)** — misma conversión: encabezados de tabla, estados de pago, filtros y textos de "sin resultados".
3. **Suscriptores** — la página y su vista de lista: columnas, estados de suscripción, acciones y avisos.
4. **Textos inventados del demo** — los conceptos y notas de ejemplo (por ejemplo "Playing lesson", "Clase individual") se muestran en español o inglés según el idioma activo; los nombres de personas inventadas se quedan igual.

## Lo que no se toca

- El acceso al alumno inventado del demo (lo dejamos fuera, como pediste).
- Los números, cálculos, precios, cobros ni nada del backend.
- El resto del portal de coach (Inicio, Alumnos, Clases) queda para después si lo quieres.

## Detalles técnicos

- Nuevas claves en `src/i18n/` (archivo extra dedicado, p. ej. `src/i18n/extra/adminMoney.ts`) con pares en/es, registradas en `src/i18n/extra/index.ts`.
- `useLanguage()` + `t()` en `src/pages/AdminRevenue.tsx`, `src/pages/AdminStripePayments.tsx`, `src/pages/AdminSubscribers.tsx` y `src/components/AdminSubscribersView.tsx`, sustituyendo literales en JSX y en los mapas de etiquetas de estado.
- En `src/data/demoData.ts` los conceptos/descripciones de ejemplo pasan a claves de traducción resueltas en el punto de render (no se cambian montos, IDs ni fechas).
- Solo cambios de presentación: ninguna consulta, mutación ni lógica de negocio se modifica.
