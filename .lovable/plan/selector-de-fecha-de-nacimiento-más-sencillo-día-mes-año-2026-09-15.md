# Selector de fecha de nacimiento más sencillo (día / mes / año)

## Problema
En el diálogo "Agregar familiar sin cuenta" (`src/components/family/ManagedMemberDialog.tsx`), la fecha de nacimiento es un `<Input type="date">` nativo: para hijos hay que retroceder muchos años mes a mes, lo cual es lento y tedioso.

## Cambio
Reemplazar el campo único por **tres selectores separados: Día, Mes y Año**, estilo iOS/Apple (listas desplegables directas, no calendario):

- **Día**: 1–31.
- **Mes**: lista con nombres de meses según el idioma del portal (ES/EN).
- **Año**: lista descendente, desde el año actual hasta ~100 años atrás (ej. 1930), así un hijo se elige en 3 toques.
- Al cambiar cualquiera de los tres se reconstruye el valor interno en formato `YYYY-MM-DD` (el mismo que hoy se envía a las edge functions), conservando día válido según mes/año (clamp: p. ej. 31 de febrero → 28/29).
- En modo edición, los tres selectores se precargan desde `member.birth_date`.
- Validación existente se mantiene: los tres campos obligatorios; sin fecha completa no se puede guardar (mismo check `^\d{4}-\d{2}-\d{2}$`).
- Estilo consistente con el portal: componentes `Select` de shadcn ya usados en la app, en una fila de 3 columnas (apiladas o compactas en móvil), mismas etiquetas i18n actuales (`misc.managedBirthDate`); se agregan etiquetas/placeholder Día/Mes/Año en ES y EN (`misc.managedDay`, `misc.managedMonth`, `misc.managedYear`).

## Alcance
- Solo UI del selector dentro de `ManagedMemberDialog.tsx` (se usa en la página Familia del alumno y en el perfil del alumno en admin, así que el cambio aplica a ambos a la vez).
- Formato de dato enviado al backend (`birthDate` YYYY-MM-DD) **sin cambios**; edge functions, tabla `profiles.birth_date`, validaciones del servidor: sin tocar.
- No se tocan precios, Stripe, RLS ni nada más.

## Verificación
- Typecheck/build.
- Prueba en preview: abrir el diálogo, elegir día/mes/año con pocos clics, guardar; editar un familiar existente y confirmar que los tres selectores vienen precargados.
