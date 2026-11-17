# Teaser de Apex AI para cuentas free

Hoy un alumno free que entra a "Apex AI" (/ai-coach) recibe un toast y un redireccionamiento automático a la página de planes; la página nunca se muestra. Vamos a mostrar en su lugar un teaser de venta dentro de la propia página, con botón "Suscríbete" hacia la página de planes existente (/plans).

## Qué se va a cambiar

1. **Nuevo componente `src/components/apex-ai/ApexAiTeaser.tsx`**, con el mismo lenguaje visual que el teaser de Familia y Pro Zone:
   - Pantalla oscura tipo chat (mismo fondo que la página real de Apex AI).
   - Capa decorativa de fondo: burbujas de conversación de ejemplo (pregunta del alumno / respuesta de Apex AI) difuminadas y de baja opacidad, NO interactivas (`pointer-events: none`), sugeridas con los temas que la IA responde (swing, rondas, planes). Puro placeholder, sin datos reales ni consultas.
   - Tarjeta glass al centro con el **acento del plan de quien mira** (leído de la tabla de planes vía `usePlanColors`/`resolvePlanColor`; dorado #F0C040 por defecto si es free — mismo patrón que FamilyTeaser).
   - Copy: título, subtítulo y 3 beneficios (pregúntale a tu coach de IA sobre tu swing, recibe planes de entrenamiento personalizados, revisa disponibilidad y agenda clases).
   - CTA "Suscríbete" con `Link` a `/plans` (página de planes existente; sin inventar checkout).
2. **`src/pages/StudentAiCoach.tsx`**: quitar el toast + `navigate("/plans")` del efecto de bloqueo. Si no hay acceso, la página renderiza `<ApexAiTeaser />` (con botón de regreso al dashboard); el chat solo se renderiza con acceso. El override de staff y la lógica de acceso (`useApexAiAccess`) se reutilizan tal cual, sin cambios.
3. **i18n (ES/EN)**: claves nuevas para título, subtítulo, beneficios y CTA del teaser.
4. La ruta del preview de admin (`/admin/student-preview/.../ai-coach`) ya apunta a esta misma página, así que el teaser también funciona en la vista previa.

## No se toca

- `useApexAiAccess`, `hasApexAiAccess` del servidor, edge functions (ai-golf-coach, apex-ai-training-plan, apex-ai-availability), planes, precios, Stripe ni RLS.
- El modal `AiCoachChatModal` y el acceso de planes pagados (idéntico).
