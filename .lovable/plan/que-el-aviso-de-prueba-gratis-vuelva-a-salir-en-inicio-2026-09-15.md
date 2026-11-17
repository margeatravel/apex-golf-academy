# Que el aviso de prueba gratis vuelva a salir en Inicio

## Lo que encontré (solo lectura)

- Las extensiones sí quedaron guardadas: hay 24 cuentas con prueba vigente, varias extendidas hoy 7 días (Alejandro Andrade, Santiago Benito, Paola, Paula Fernández, Paulo Gómez, Rafa Obregón...). El dato está bien.
- El aviso hoy vive en tres pantallas (Inicio, Videos y Pro Zone).
- Hay dos razones por las que no reaparece:
  1. Cuando el alumno cierra el aviso una vez, queda marcado como "ya cerrado" para toda la visita y **no distingue si la prueba cambió**. Quien lo cerró durante su prueba anterior de 30 días no lo vuelve a ver aunque le extiendas otros 7.
  2. Si el alumno ya tenía la app abierta, su perfil quedó cargado con la prueba vieja; hasta que recarga, la app cree que la prueba terminó.

## Qué cambia

- El aviso queda **solo en Inicio**; se quita de Videos y de Pro Zone.
- Cada vez que le extiendes o reinicias la prueba a alguien, el aviso **vuelve a aparecer**, aunque antes lo hubiera cerrado (el "ya lo cerré" se ata a esa fecha de fin concreta).
- Al volver a la app o cambiar de pestaña, el perfil se refresca, así que la prueba extendida se ve sin tener que cerrar sesión.
- El texto dice los días reales que quedan y deja de decir "30 días": "Prueba gratis — te quedan 7 días" y, en las últimas 24 horas, "Tu prueba termina en X horas". En español o inglés según el idioma del portal.
- Se mantienen los colores de urgencia (verde, dorado, rojo), el botón "Ver planes" y el poder cerrarlo.
- Quien ya paga sigue sin verlo.

## Detalles técnicos

- `src/components/TrialBanner.tsx`: la clave de descarte pasa de `apex_trial_banner_dismissed` fijo a una por fecha de fin (`apex_trial_banner_dismissed:<trial_ends_at>`), de modo que una prueba extendida genera una clave nueva y el aviso reaparece. Titular y cuerpo pasan a claves i18n nuevas en `src/i18n/extra/misc.ts` (ES/EN) con el número de días/horas interpolado; se elimina el literal "30-day". Lógica de `isInTrial` y de urgencia sin cambios.
- Quitar `<TrialBanner />` de `src/pages/StudentVideos.tsx` y `src/pages/ProZone.tsx`; se conserva en `src/pages/StudentDashboard.tsx`.
- `src/contexts/AuthContext.tsx`: refrescar el perfil al volver el foco a la ventana (`visibilitychange`/`focus`) reutilizando la carga de perfil existente, para que un cambio de prueba se refleje sin re-login. Sin tocar la simulación de prueba en la vista previa de admin.

No se tocan: `trial_ends_at` ni datos de alumnos, la herramienta de extender prueba del admin, la lógica de acceso durante la prueba, planes, precios, Stripe ni RLS.
