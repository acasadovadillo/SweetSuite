# Solvento

Tus finanzas: patrimonio, inversiones, ingresos y gastos, con los precios de los fondos y las acciones al día.

Solvento vive dentro de **SweetSuite** (ver el README de la raíz): la entrada, la contraseña y la clave de recuperación son las de SweetSuite, que le da a Solvento su secreto. Con él se cifra el documento de cada cuenta, que se guarda en el repositorio **privado** `Solvento-Data` (`<usuario>-solvento.enc`). Los precios los publica el repositorio `Solvento` (`prices.json`), con su proceso aparte.

## Suelta

Abrir su carpeta, `apps/solvento/` (en la web, <https://acasadovadillo.github.io/SweetSuite/apps/solvento/>), lleva a SweetSuite con `?app=solvento`: la entrada sale con el logo, el nombre y el color de Solvento, y al entrar se abre solo Solvento, sin el inicio ni las demás apps. La cuenta, la contraseña y los datos son los mismos. «Tu cuenta», en su menú, abre la contraseña y la clave de recuperación. Se puede instalar sola en el móvil (`manifest.json`).

## Estructura

```
index.html        la página (SweetSuite la abre en un marco)
manifest.json     para instalarla suelta
perfil.json       qué es cada cuenta y activo (y perfil.dev.json, el de desarrollo)
img/              logos de bancos y activos, e iconos de la app (img/app/)
src/css/          estilos
src/js/
  suite-puente.js el enlace con SweetSuite (abierta suelta, se va a SweetSuite con ?app=solvento)
  boot.js         arranque, sesión y ajustes
  sync.js         guardar en Solvento-Data y traer lo de otros dispositivos
  mezcla.js       mezclar registro a registro
  model.js, render.js, charts.js, plan.js, forms.js, nav.js…   el resto
tools/pruebas/    las pruebas de humo (humo.js), con precios de ejemplo
```

Se prueba y se publica con SweetSuite (ver su README).
