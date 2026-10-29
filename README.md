# SweetSuite

Las apps de Alberto en un solo sitio: **Solvento** (finanzas), **Ironrack** (gimnasio) y **Agora** (la asociación ABIES), con una sola entrada, una sola contraseña y los datos de cada app guardados aparte.

Web: <https://acasadovadillo.github.io/SweetSuite/> (se instala en el móvil con «Añadir a pantalla de inicio»).

## Cómo funciona

- **Una entrada.** Usuario y contraseña. Según la cuenta (`cuentas.json`) se ven unas apps u otras: Alberto y Hafsa, Solvento e Ironrack; ABIES, Solvento y Agora; Paula, solo Solvento (con una sola app se entra directamente en ella).
- **Particular o Empresa.** La entrada tiene un selector. Una empresa (ABIES) entra en dos pasos: la empresa y su contraseña, y después el representante con su usuario y su contraseña personales de SweetSuite. **Hacen falta las dos** para abrir sus datos: la clave maestra de la empresa va envuelta una vez por representante, con las dos contraseñas a la vez. Quién es representante lo dice `cuentas.json` (`"representantes"`): la app no da de alta a nadie. Un representante nuevo, o uno que cambió su contraseña personal, entra la primera vez con la clave de recuperación de la empresa («¿Has olvidado una contraseña?»), que crea su entrada. Cada representante usa su propio token (p. ej. «ABIES-Alberto-Solvento») y lo que guarda queda firmado: en el commit (`… · Alberto`) y en Solvento → Ajustes → Registro de cambios.
- **La cuenta Admin** (`admin`, la única de tipo `admin` en `cuentas.json`) no tiene apps: al entrar ve la **Administración**, donde da de alta personas, empresas y sus representantes (y, en una empresa con Agora, el cargo de cada uno), cambia sus apps y da de baja. Por debajo edita `cuentas.json` y lo sube a este repositorio con un commit (se publica en un minuto). Para guardar hace falta su token, `Admin-SweetSuite`, con *Contents: Read and write* sobre `SweetSuite` y `SweetSuite-Admin` (donde va su llavero, privado). Dar de baja no borra datos: eso solo se hace desde GitHub. Al dar de alta, dice qué tokens hay que crear en GitHub (`Nombre-App`, `EMPRESA-Nombre-App`).
- **Una contraseña por cuenta y una clave de recuperación.** La contraseña abre el *llavero* de la cuenta, que guarda una clave maestra aleatoria envuelta con la contraseña (PBKDF2-SHA256, 600.000 iteraciones) y con la clave de recuperación (160 bits, se enseña una vez). De la clave maestra sale el secreto de cada app (HMAC-SHA256), con el que cada app cifra su archivo como antes lo cifraba con su contraseña. Cambiar o recuperar la contraseña solo vuelve a envolver la clave maestra. Ni la contraseña ni la clave maestra se guardan nunca: la sesión vive en memoria.
- **Cada app aparte.** Cada una guarda su archivo cifrado en su repositorio **privado**, con el llavero de la cuenta al lado:

  | App | Repositorio | Archivos |
  |---|---|---|
  | Solvento | `Solvento-Data` | `<usuario>-solvento.enc`, `<usuario>.llavero.json` |
  | Ironrack | `Ironrack-Data` | `<usuario>-ironrack.enc`, `<usuario>.llavero.json` |
  | Agora | `Agora-Data` | `<usuario>-agora.enc`, `adjuntos/<id>.enc`, `<usuario>.llavero.json` |

- **Un token por cuenta y app.** *Fine-grained*, con *Contents: Read and write* solo sobre su repositorio (el de Solvento, además, sobre `Solvento`, donde publica la lista de precios). Se pega en los Ajustes de cada app, nunca al entrar, y se guarda cifrado en el dispositivo. Cambiarlo no toca los datos.
- **Guardado.** Cada cambio se guarda al momento en el dispositivo, cifrado. El **autoguardado** (encendido de serie) lo sube a GitHub; también **Guardar**, **⌘S / Ctrl+S** y **volver al inicio de SweetSuite**, que sube lo pendiente de la app de la que sales.
- **Cambios a la vez.** Si dos dispositivos (o dos representantes de una empresa) guardan a la vez, no se pierde nada: Ironrack mezcla elemento a elemento, y Solvento y Agora registro a registro (`apps/solvento/src/js/mezcla.js`, `apps/agora/src/js/datos/mezcla.js`). Gana el último cambio de cada registro y lo borrado no resucita.
- **Otro dispositivo.** Se entra con «Ya uso SweetSuite en otro dispositivo». Al pegar el token de una app, SweetSuite trae el llavero de GitHub; si allí la contraseña es otra, la pide (o la clave de recuperación).
- **Los datos de antes.** En los Ajustes de Solvento, «Traer tus datos del Solvento de antes» abre con la contraseña de entonces lo que guardaba en este dispositivo y en `datos-cifrados`, y lo pasa a SweetSuite. `datos-cifrados` solo se lee. Ironrack no lo necesita: nadie tenía entrenos. En Agora, Presidencia trae la copia `.json` de «ABIES · Gestión» desde Ajustes › Seguridad.

## Seguridad

- **Bloqueo automático** tras 15 minutos sin usarla (5, 15, 30, 60 o nunca, en Ajustes de la cuenta → Seguridad). Cuenta también el tiempo en segundo plano. Antes de bloquear, cada app sube lo pendiente.
- **Caducidad de los tokens.** GitHub no deja que el navegador lea cuándo caduca un token, así que al pegarlo SweetSuite pregunta la fecha (también en Ajustes de la cuenta → Seguridad) y avisa 15 días antes, en el inicio y al entrar.
- **Política de contenido (CSP)** en cada página: solo se habla con este sitio, con `api.github.com` y `raw.githubusercontent.com` (y la letra de Google Fonts). Si se colara un script ajeno, no podría mandar los datos a otro sitio.
- En el dispositivo solo queda lo cifrado (llaveros, datos y tokens) y preferencias sin datos (tema, grupos del menú, el temporizador de descanso…).

### Dar de baja a un representante de una empresa

1. Quítalo de `"representantes"` en `cuentas.json` y publica. La próxima vez que otro representante sincronice, su entrada desaparece del llavero de la empresa.
2. **Cambia la contraseña de la empresa:** en la entrada, Empresa → «¿Has olvidado una contraseña?», con la clave de recuperación de la empresa y una contraseña nueva. Así, aunque conserve una copia vieja del llavero en su dispositivo, la contraseña de antes ya no vale para la de GitHub.
3. **Borra su token** en GitHub (Settings → Developer settings → Fine-grained tokens, el que se llama `EMPRESA-Nombre-App`): deja de poder leer y escribir.
4. Si quieres más margen, genera también una clave de recuperación nueva de la empresa (Ajustes de la cuenta → Recuperación) y dásela al resto.

Lo que esa persona ya hubiera visto no se puede «desver»: estas medidas cortan su acceso desde ahora.

## Estructura

```
index.html, src/        SweetSuite: entrada, llavero, inicio y ajustes de la cuenta
cuentas.json            quién entra y qué apps tiene
apps/solvento/          Solvento (copia de acasadovadillo/Solvento p218, adaptada)
apps/ironrack/          Ironrack (con su historial, git subtree)
apps/agora/             Agora, antes webkit-asociaciones (con su historial, git subtree); solo ABIES
sw.js, manifest.json    la app instalable y sin conexión
tools/dev/servidor.py   servidor de desarrollo
```

Cada app se carga en su marco (`apps/<id>/index.html`) y pide a `window.SweetSuite` su secreto. Abierta sola, se va a SweetSuite.

## Desarrollo

```bash
python3 tools/dev/servidor.py --reiniciar
```

Abre <http://localhost:4500>. Nada sale del ordenador: el servidor hace de GitHub (`dev-data/`, que git ignora). El token de prueba es `dev`. Hay datos ficticios del Solvento de antes en `datos-cifrados-dev`, con la contraseña `desarrollo`, para probar «Traer tus datos del Solvento de antes». `localhost` y `127.0.0.1` son dos dispositivos distintos.

## Pruebas

```bash
node tools/pruebas/todo.mjs             # todas: piezas y uso real con navegador (un par de minutos)
node tools/pruebas/todo.mjs --rapidas   # solo las piezas (unos segundos)
```

- **Piezas** (`tools/pruebas/piezas.mjs`, sin navegador): el llavero (contraseña, clave de recuperación, empresas con las dos contraseñas, dos llaveros que se juntan), la mezcla de Ironrack, las pruebas de Solvento (`apps/solvento/tools/pruebas/humo.js`, con precios fijos de `precios-ejemplo.json`) y las de Agora (`apps/agora/tests/`).
- **Uso real** (`tools/pruebas/navegador.mjs`): abre Chrome, Brave, Edge o Chromium sin ventana contra el servidor de desarrollo, con datos propios (no toca `dev-data/`). Entra, abre las apps, guarda, prueba dos dispositivos a la vez, una empresa (con Agora: dos representantes a la vez, los cargos, la copia de antes), el bloqueo, la política de contenido y el móvil. Otro navegador: `NAVEGADOR=/ruta`.
- **Antes de publicar:** `git push` pasa solo las rápidas (`.githooks/pre-push`) y no sube nada si alguna falla. En un clon nuevo se activa con `git config core.hooksPath .githooks`.
- **En GitHub:** todas, en cada subida (`.github/workflows/pruebas.yml`). Si falla algo, sale una ✗ junto al commit y llega un correo.

## Publicar una versión

1. Sube el número en los tres sitios: `VERSION` en `src/js/suite.js`, `VERSION` en `sw.js` y `version.json`. Si cambia Solvento, sube también su `?v=pNNN` en `apps/solvento/index.html`.
2. `git push`: GitHub Pages publica en uno o dos minutos.
3. Quien tenga SweetSuite abierta ve «Hay una versión nueva · Actualizar» (se mira cada media hora y al volver a la app). Al actualizar, cada app sube lo pendiente y hay que volver a entrar.

## Estética

La común de Ironrack, Solvento y webkit-asociaciones: ver `../CLAUDE.md`.
