# SweetSuite

Las apps de Alberto en un solo sitio: **Solvento** (finanzas) e **Ironrack** (gimnasio), con una sola entrada, una sola contraseña y los datos de cada app guardados aparte.

Web: <https://acasadovadillo.github.io/SweetSuite/> (se instala en el móvil con «Añadir a pantalla de inicio»).

## Cómo funciona

- **Una entrada.** Usuario y contraseña. Según la cuenta (`cuentas.json`) se ven unas apps u otras: Alberto y Hafsa, Solvento e Ironrack; ABIES y Paula, solo Solvento (con una sola app se entra directamente en ella).
- **Particular o Empresa.** La entrada tiene un selector. Una empresa (ABIES) entra en dos pasos: la empresa y su contraseña, y después el representante con su usuario y su contraseña personales de SweetSuite. **Hacen falta las dos** para abrir sus datos: la clave maestra de la empresa va envuelta una vez por representante, con las dos contraseñas a la vez. Quién es representante lo dice `cuentas.json` (`"representantes"`): la app no da de alta a nadie. Un representante nuevo, o uno que cambió su contraseña personal, entra la primera vez con la clave de recuperación de la empresa («¿Has olvidado una contraseña?»), que crea su entrada. Cada representante usa su propio token (p. ej. «ABIES-Alberto-Solvento») y lo que guarda queda firmado: en el commit (`… · Alberto`) y en Solvento → Ajustes → Registro de cambios.
- **Una contraseña por cuenta y una clave de recuperación.** La contraseña abre el *llavero* de la cuenta, que guarda una clave maestra aleatoria envuelta con la contraseña (PBKDF2-SHA256, 600.000 iteraciones) y con la clave de recuperación (160 bits, se enseña una vez). De la clave maestra sale el secreto de cada app (HMAC-SHA256), con el que cada app cifra su archivo como antes lo cifraba con su contraseña. Cambiar o recuperar la contraseña solo vuelve a envolver la clave maestra. Ni la contraseña ni la clave maestra se guardan nunca: la sesión vive en memoria.
- **Cada app aparte.** Cada una guarda su archivo cifrado en su repositorio **privado**, con el llavero de la cuenta al lado:

  | App | Repositorio | Archivos |
  |---|---|---|
  | Solvento | `Solvento-Data` | `<usuario>-solvento.enc`, `<usuario>.llavero.json` |
  | Ironrack | `Ironrack-Data` | `<usuario>-ironrack.enc`, `<usuario>.llavero.json` |

- **Un token por cuenta y app.** *Fine-grained*, con *Contents: Read and write* solo sobre su repositorio (el de Solvento, además, sobre `Solvento`, donde publica la lista de precios). Se pega en los Ajustes de cada app, nunca al entrar, y se guarda cifrado en el dispositivo. Cambiarlo no toca los datos.
- **Guardado.** Cada cambio se guarda al momento en el dispositivo, cifrado. El **autoguardado** (encendido de serie) lo sube a GitHub; también **Guardar**, **⌘S / Ctrl+S** y **volver al inicio de SweetSuite**, que sube lo pendiente de la app de la que sales.
- **Cambios a la vez.** Si dos dispositivos (o dos representantes de una empresa) guardan a la vez, no se pierde nada: Ironrack mezcla elemento a elemento y Solvento registro a registro (`apps/solvento/src/js/mezcla.js`). Gana el último cambio de cada registro y lo borrado no resucita.
- **Otro dispositivo.** Se entra con «Ya uso SweetSuite en otro dispositivo». Al pegar el token de una app, SweetSuite trae el llavero de GitHub; si allí la contraseña es otra, la pide (o la clave de recuperación).
- **Los datos de antes.** En los Ajustes de Solvento, «Traer tus datos del Solvento de antes» abre con la contraseña de entonces lo que guardaba en este dispositivo y en `datos-cifrados`, y lo pasa a SweetSuite. `datos-cifrados` solo se lee. Ironrack no lo necesita: nadie tenía entrenos.

## Estructura

```
index.html, src/        SweetSuite: entrada, llavero, inicio y ajustes de la cuenta
cuentas.json            quién entra y qué apps tiene
apps/solvento/          Solvento (copia de acasadovadillo/Solvento p218, adaptada)
apps/ironrack/          Ironrack (con su historial, git subtree)
sw.js, manifest.json    la app instalable y sin conexión
tools/dev/servidor.py   servidor de desarrollo
```

Cada app se carga en su marco (`apps/<id>/index.html`) y pide a `window.SweetSuite` su secreto. Abierta sola, se va a SweetSuite.

## Desarrollo

```bash
python3 tools/dev/servidor.py --reiniciar
```

Abre <http://localhost:4500>. Nada sale del ordenador: el servidor hace de GitHub (`dev-data/`, que git ignora). El token de prueba es `dev`. Hay datos ficticios del Solvento de antes en `datos-cifrados-dev`, con la contraseña `desarrollo`, para probar «Traer tus datos del Solvento de antes». `localhost` y `127.0.0.1` son dos dispositivos distintos.

Pruebas de Solvento (necesitan la carpeta `../solvento` al lado para los precios):

```bash
cd apps/solvento && jsc tools/pruebas/humo.js
```

## Estética

La común de Ironrack, Solvento y webkit-asociaciones: ver `../CLAUDE.md`.
