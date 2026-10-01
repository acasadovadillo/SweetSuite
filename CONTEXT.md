# CONTEXT.md — Decisiones y arquitectura

## Qué es

Aplicación de gestión integral para asociaciones pequeñas en España, que se distribuye como **un único archivo HTML** (HTML + CSS + JavaScript sin dependencias), funciona **sin conexión** abriendo el archivo y guarda los datos **cifrados en el navegador**. **Software privativo, todos los derechos reservados** (decisión del 2026-10-01; podría abrirse más adelante). Código, comentarios e interfaz en español.

Nace de **Solvento** (`../../Solvento`, app de finanzas personales del mismo autor), del que se reutilizan ideas y piezas: el cifrado (`crypto.js`), el tema sin fogonazo (`tema.js`), las variables de color, y más adelante el escritor de .xlsx (`exportar.js`), el lector de .xlsx (`plan.js`), la lógica de presupuesto anual y centros de coste (`model.js`) y la gráfica SVG (`charts.js`). Solvento **no** tenía facturas, IVA ni socios: se construyen desde cero.

## Arquitectura

```
src/index.html            se abre directamente para desarrollar (scripts clásicos, funciona con file://)
src/css/                  tokens (colores) · base (estructura) · componentes · impresión
src/js/nucleo/            dinero · fechas · validar · direccion · cripto · tema · preferencias · ui · app
src/js/datos/             esquema · repositorio · copia · demo · boveda · sesion
src/js/modulos/           acceso · inicio · asociacion · copias · ajustes   (cada fase añade los suyos)
src/js/arranque.js        siempre el último
tools/build.mjs           empaqueta todo en dist/webkit_asociaciones.html (sin dependencias)
tests/*.test.js           node --test (incluido en Node, sin instalar nada)
```

### Decisiones y por qué

| Decisión | Por qué |
|---|---|
| Código en módulos + build sin dependencias que lo junta en un HTML | Un HTML de más de 10.000 líneas sería imposible de revisar y daría conflictos entre colaboradores. Vite o esbuild obligarían a usar npm. El build son unas 60 líneas de Node |
| Scripts clásicos (no módulos ES) envueltos en función: `window.WA.X` en el navegador y `module.exports` en Node | Los módulos ES no cargan desde `file://`. Así `src/index.html` se abre sin build y la lógica se prueba en Node |
| Lógica pura (sin DOM) separada de la interfaz | Se puede probar. Los módulos de `logica/` llegarán con las fases 2 y 3 (cuotas, IVA…) |
| **IndexedDB**, con localStorage de respaldo | Más capacidad (adjuntos en el futuro), API asíncrona como la de un servidor. localStorage solo cuando IndexedDB falla |
| Todo es **un documento JSON** con `esquema` (versión) y migraciones | Copias de seguridad triviales, cambios atómicos y copias antiguas siempre legibles. Con 150 socios ocupa poco |
| **Cifrado en reposo** (AES-256-GCM, PBKDF2-SHA256 con 310.000 iteraciones). La misma contraseña cifra el navegador y la copia | Decisión del usuario. En Chromium todos los HTML locales comparten el origen `file://`, así que sin cifrado otro archivo local podría leer los datos |
| Clave derivada una vez al entrar y reutilizada con un IV nuevo en cada guardado | Derivar tarda unos 0,3 s, a propósito |
| Opción «borrar al cerrar sesión» (preferencia del dispositivo) | Pensada para ordenadores compartidos. Al pulsar «Cerrar sesión» ofrece descargar la copia antes de borrar |
| Bloqueo por inactividad (15 min por defecto) | Suelta la clave y los datos de la memoria |
| **Importes en céntimos enteros**, redondeo «la mitad se aleja del cero» | Evita los errores de coma flotante. El formato es manual (no `Intl`) para que sea idéntico en todos los navegadores |
| Fechas ISO `aaaa-mm-dd`, siempre locales | Se ordenan como texto y evitan el desfase de UTC |
| Direcciones por partes (tipo de vía, nombre, número, km, bloque, portal, escalera, planta, puerta, complemento, CP, municipio, provincia) | Para escribirlas bien en documentos y comprobar CP ↔ provincia. `Direccion.formatear()` las compone; se reutilizará para socios |
| Sin «fines» en los datos de la asociación | Decisión del usuario: los fines vendrán de los estatutos, que se adjuntarán al archivo local más adelante |
| Navegación por `#/modulo` | Funciona con `file://` sin servidor |
| Capa de datos (`Repositorio`) asíncrona y como única puerta a los datos | **Preparada para la versión con servidor**: bastará con otro repositorio con las mismas funciones que use `fetch` contra una API |
| `dist/` se versiona y la integración continua comprueba que está al día | Quien no programa puede descargar el HTML directamente desde el repositorio |

### Capa de datos (contrato que debe respetar una futura API)

`leer(clave)`, `escribir(clave, valor)`, `listar(coleccion)`, `obtener(coleccion, id)`, `guardar(coleccion, registro)`, `borrar(coleccion, id)`, `documento()`, `estadoCopia()` y `marcarCopiaHecha()`. Todas devuelven promesas y **copias** de los datos.

Para la versión con servidor (no implementada) bastaría con:
- un `RepositorioAPI` con esas funciones, contra una API REST (`GET/PUT /asociacion`, `GET/POST/PUT/DELETE /junta/:id`…);
- en `Sesion`, sustituir el cifrado local por inicio de sesión (tokens) y mantener el modo local como opción;
- pagos en línea mediante enlaces de pago de una pasarela, que se generan en el servidor (nunca con claves en el navegador).

### Cómo añadir un módulo

Ver el comentario de cabecera de `src/js/nucleo/app.js`. En resumen: crear `src/js/modulos/x.js` con `WA.App.registrar({...})`, enlazarlo en `index.html` antes de `arranque.js` y, si añade colecciones, subir `VERSION` en `esquema.js` con su migración y su test.

## Normativa

No se presenta nada como asesoramiento legal. Lo que depende de una ley lleva el comentario «verificar con asesoría» en el código y una nota en la interfaz. Puntos ya marcados: cargos de la junta (según estatutos), algoritmo de control del NIF de entidades y RGPD/LOPDGDD (buenas prácticas orientativas).

## Entorno de desarrollo (en este Mac)

- Node 24 LTS instalado en `~/.local/node` (binario oficial de nodejs.org; Homebrew no tenía versión precompilada y quería compilar LLVM). Usar `export PATH="$HOME/.local/node/bin:$PATH"`.
- Servidor de pruebas: configuración `webkit-src` en `../.claude/launch.json` (puerto 4330). El panel del navegador abre los `file://` como `data:` (sin almacenamiento), así que para probar `file://` de verdad se usó Brave sin interfaz con un perfil temporal (ver HANDOFF.md).
