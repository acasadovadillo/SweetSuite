# Solvento

Tus finanzas: patrimonio, inversiones, ingresos y gastos, con los precios de los fondos y las acciones al día.

Solvento vive dentro de **SweetSuite** (ver el README de la raíz): la entrada, la contraseña y la clave de recuperación son las de SweetSuite, que le da a Solvento su secreto. Con él se cifra el documento de cada cuenta, que se guarda en el repositorio **privado** `Solvento-Data` (`<usuario>-solvento.enc`). Los precios los publica el repositorio `Solvento` (`prices.json`), con su proceso aparte.

## Una asociación (ABIES)

Una cuenta de tipo «organizacion» tiene además el grupo **Contabilidad**, con lo que antes llevaba Agora (plan en `TESORERIA.md`, en la carpeta de apps):

- **Facturas**, emitidas y recibidas:
  - las emitidas se numeran solas, por año;
  - una emitida no se toca, se corrige con una rectificativa (serie R);
  - se imprimen o se guardan en PDF;
  - su cobro o su pago es un movimiento de Caja enlazado a la factura.
- **IVA**: la ayuda para el 303 de cada trimestre (con lo que queda a compensar) y el resumen del año (390). Es orientativa.
- **Subvenciones y proyectos**:
  - cada una tiene su centro de coste, y lo que se le imputa cuenta en su ejecución frente a su presupuesto;
  - llevan sus plazos y requisitos.
- **Cuentas del ejercicio**: los ingresos y gastos del año en las partidas del modelo abreviado de entidades sin fines lucrativos, y la tesorería a principio y a fin de año. Se imprimen para la asamblea.

En una empresa, Solvento puede ser solo para algunos representantes (Tesorería), con su propia llave de cifrado: ver el README de SweetSuite.

Para cualquiera, en Caja › Movimientos, **Extracto del banco** importa un CSV o Excel del banco:
- no repite lo que ya está;
- la categoría la aprende de lo ya apuntado con el mismo concepto.

## Suelta

Abrir su carpeta, `apps/solvento/` (en la web, <https://acasadovadillo.github.io/SweetSuite/apps/solvento/>), lleva a SweetSuite con `?app=solvento`: la entrada sale con el logo, el nombre y el color de Solvento, y al entrar se abre solo Solvento, sin el inicio ni las demás apps. La cuenta, la contraseña y los datos son los mismos. «Tu cuenta», en su menú, abre la contraseña y la clave de recuperación. Se puede instalar sola en el móvil (`manifest.json`).

## Estructura

```
index.html        la página (SweetSuite la abre en un marco)
manifest.json     para instalarla suelta
perfil.json       dónde guarda cada cuenta (y perfil.dev.json, el de desarrollo); una cuenta
                  que no está aquí usa <usuario>-solvento.enc en Solvento-Data
img/              logos de bancos y activos, e iconos de la app (img/app/)
src/css/          estilos
src/js/
  suite-puente.js el enlace con SweetSuite (abierta suelta, se va a SweetSuite con ?app=solvento)
  boot.js         arranque, sesión y ajustes
  sync.js         guardar en Solvento-Data y traer lo de otros dispositivos
  mezcla.js       mezclar registro a registro
  model.js, render.js, charts.js, plan.js, forms.js, nav.js…   el resto
  asociacion/     la contabilidad de una asociación: dinero, fechas, facturas, iva,
                  extracto, csv y xlsx vienen de Agora tal cual; contabilidad.js las une
                  a los datos de Solvento y paginas.js pinta sus páginas
tests/            las pruebas de la contabilidad (node --test), con las de Agora que vinieron
tools/pruebas/    las pruebas de humo (humo.js), con precios de ejemplo
```

Se prueba y se publica con SweetSuite (ver su README).
