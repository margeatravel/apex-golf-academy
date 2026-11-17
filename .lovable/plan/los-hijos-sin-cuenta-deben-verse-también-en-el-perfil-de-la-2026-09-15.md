# Los hijos sin cuenta deben verse también en el perfil de la pareja

## Qué pasa hoy (verificado)

En la base de datos, Mauro Andrade está ligado **solo** a Alejandro Andrade (relación "hijo"). Marcella Thurm sí está ligada a Alejandro como "pareja", pero no existe ningún vínculo entre Marcella y Mauro, por eso su sección Familia no lo muestra.

Dos causas:

1. Mauro se creó/reparó en su momento con un arreglo manual, que insertó un único vínculo y no lo compartió con la pareja.
2. Cuando el vínculo de pareja se crea **desde el panel de admin**, no se comparten los hijos sin cuenta que ya existían. (Cuando la pareja se acepta desde el portal del alumno sí se comparten; ese camino ya funciona.)

## Cambios

1. **Compartir hijos al ligar una pareja desde el admin**: al crear un vínculo "pareja" entre dos cuentas, cada hijo sin cuenta que ya tenga una de las dos queda automáticamente ligado también a la otra, igual que ya ocurre cuando la pareja se acepta desde el portal del alumno.
2. **Corregir los casos existentes**: revisar todas las parejas ya ligadas y crear los vínculos faltantes hacia los hijos sin cuenta (esto incluye Mauro → Marcella). Es solo agregar vínculos; no se borra ni se modifica nada.
3. **Reflejarlo en la vista**: confirmar que en Familia de Marcella aparece Mauro con su etiqueta "Sin cuenta" y que al entrar se ven sus videos, igual que en el perfil de Alejandro.

## Detalles técnicos

- Tabla `family_links` (`parent_user_id`, `child_user_id`, `relationship`), hijos sin cuenta = `profiles.is_managed = true`.
- Propagación en el alta de pareja de `src/components/FamilyLinksManager.tsx`: tras insertar las filas "pareja", insertar filas "hijo" faltantes (parent = nueva pareja, child = cada managed member de la otra cuenta), ignorando duplicados por la restricción única.
- Backfill puntual con una consulta de inserción sobre parejas existentes (`insert ... select ... on conflict do nothing`), sin tocar filas existentes.
- No se modifica: la lógica de acceso/gating de Familia, precios, Stripe, ni las funciones de crear/editar familiar sin cuenta (esa ya propaga a la pareja al momento de crear).
