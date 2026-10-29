# Cómo contribuir

> **Ahora mismo el proyecto es privado** (todos los derechos reservados, ver [LICENSE](LICENSE)) y no acepta contribuciones externas. Esta guía recoge las normas de trabajo del código y queda preparada por si algún día se abre.

¡Gracias por querer ayudar! Este proyecto quiere que una asociación pequeña pueda llevar su gestión sin pagar plataformas. Cualquier ayuda cuenta: probarlo en tu asociación, avisar de errores, mejorar textos o programar.

## Sin programar

- **¿Algo falla?** Abre un *issue* con la plantilla «Error». **No adjuntes nunca copias de seguridad reales ni datos de socios**: si hace falta, reprodúcelo con los datos de demostración.
- **¿Echas algo en falta?** Abre un *issue* con la plantilla «Propuesta» y cuenta para qué lo necesita tu asociación.
- **¿Un texto no se entiende?** También es un error. La aplicación es para gente no técnica.

## Programando

Requisitos: un navegador y [Node.js](https://nodejs.org) 20 o posterior. No hay que instalar dependencias.

1. Abre `src/index.html` en el navegador: es la versión de desarrollo y no necesita build.
2. Haz el cambio.
3. `npm test`: los tests tienen que pasar.
4. `npm run build`: regenera `dist/webkit_asociaciones.html`. **Incluye ese archivo en tu commit**: la integración continua comprueba que está al día.
5. Abre `dist/webkit_asociaciones.html` con doble clic y prueba lo que has cambiado.

La arquitectura y el porqué de cada decisión están en [CONTEXT.md](CONTEXT.md).

## Normas del código

- **Todo en español**: código, comentarios e interfaz. Comenta el *porqué*, no el *qué*.
- **Sin dependencias externas** ni recursos de internet (fuentes, CDN, analítica…). La aplicación tiene que funcionar sin conexión y sin enviar nada fuera.
- **Dinero siempre en céntimos enteros** (`src/js/nucleo/dinero.js`). Nunca sumes euros con decimales.
- **Fechas siempre `aaaa-mm-dd`** (`src/js/nucleo/fechas.js`).
- **Escapa con `WA.UI.esc()`** todo texto que venga de una persona antes de meterlo en HTML.
- Los módulos de la interfaz **solo acceden a los datos a través del repositorio** (`datos.listar`, `datos.guardar`…), nunca directamente.
- La lógica de negocio (cálculos, validaciones) va en archivos sin DOM y **con tests**.
- Si cambias la forma de los datos: sube `VERSION` en `esquema.js` y añade su migración y su test.
- Textos de la interfaz: cortos, claros y sin jerga técnica.

## Normativa: nada de inventar

Si algo depende de una ley (Ley Orgánica 1/2002 de asociaciones, RGPD, obligaciones contables o fiscales, IVA…):
- no lo presentes como asesoramiento legal;
- deja un comentario en el código con **«verificar con asesoría»**;
- si puedes, enlaza la fuente oficial en el pull request.

## Privacidad

- **Nunca** subas datos reales al repositorio: ni copias de seguridad, ni listados de socios, ni capturas con datos reales. El `.gitignore` bloquea los nombres habituales, pero la responsabilidad es tuya.
- Los datos de ejemplo van en `src/js/datos/demo.js`, son claramente ficticios y usan correos `@example.org`. Un test lo comprueba.
