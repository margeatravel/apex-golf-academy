# Ajustes puntuales al onboarding

## Cambios
- Mover el selector EN/ES fuera de la tarjeta, en una fila superior alineada a la derecha y compartida por todas las pantallas.
- Corregir la gráfica de contraste para que ambas barras tengan el mismo ancho, partan de la misma base y representen visualmente 9% frente a 91%.
- En Plan reveal, retirar el párrafo del trial y cambiar el botón a “Seguir con mi plan” / “Continue with my plan”, conservando su navegación actual.

## Archivos
- `src/pages/StudentOnboarding.tsx`: disposición del selector, barras comparativas y contenido de Plan reveal.
- `src/i18n/extra/onboarding.ts`: texto bilingüe del botón principal.

## Validación
- Comprobar compilación y revisar visualmente el onboarding en tamaño móvil, incluyendo alineación del selector y ambas barras.
