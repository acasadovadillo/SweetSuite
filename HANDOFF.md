# HANDOFF.md — Estado actual

*Última actualización: 2026-10-29 · Fase 7a confirmada (`db7dafb`) y estética común con Ironrack y Solvento.*

El proyecto está en `~/ACV/DEVELOPER/Apps/webkit-asociaciones`. Versión 0.7.0. La aplicación se llama **ABIES · Gestión**.

## Commits

- `6622e1f` Fase 1
- `a952c19` Fase 2
- `f31c56c` Fase 3
- `fd58330` Fase 4
- `5119f6a` Fase 5
- `1338e6f` Fase 6
- `297cf0f` Estética de Solvento
- `db7dafb` Fase 7a: ABIES (marca, usuarios, permisos y registro)
- Estética común con Ironrack y Solvento (ver abajo)

## Estética común con Ironrack y Solvento

La misma interfaz que las otras dos apps del autor (que vienen de OpenClaw):

- **Estructura:** barra lateral de 288 px (marca, «Gestión», la cuenta con avatar y menú —Ajustes, Bloquear, Cerrar sesión—, un buscador que filtra las secciones, las secciones por grupos —Gente, Dinero, Gobierno, Cuenta— y al pie el estado de la copia con su punto y la versión). Fija desde 1.024 px; por debajo, cajón con la hamburguesa de la barra de arriba (64 px); hasta 640 px, cinco secciones abajo (Inicio, Socios, Cuotas, Actividades, Tesorería). Los grupos están en `GRUPOS` de `nucleo/app.js`.
- **Colores y medidas:** `css/tokens.css` (fondo #0e1015, tarjetas #161920, radios 12/10/8). Fuente **Albert Sans incrustada** en `css/fuentes.css` (OFL, sin conectar a Google) y las curvas de nivel del fondo incrustadas en `css/fondo.css` (se usan de máscara; el color lo pone el tema).
- **Acento por usuario:** Ajustes › Apariencia, paleta de OpenClaw más el verde de ABIES (el de siempre) y un color propio. Se guarda cifrado en `config.acentos[id del usuario]` (cuenta como un cambio, y queda en el registro como «Configuración»). Al salir y en la pantalla de acceso, siempre el verde. Lo aplica `WA.Tema.acento()` inyectando los tonos derivados para los dos temas.
- **Ajustes:** lista de secciones (200 px) y tarjeta con filas, como Ironrack; `#/ajustes/<sección>`.
- **Avisos** arriba con un punto de color; **diálogos** que suben desde abajo en el teléfono; **acceso** con las medidas del de Solvento.

## Fase 7a: ABIES

El usuario decidió que la aplicación es **solo para ABIES**, con su logo desde la pantalla de acceso, una cuenta de administración (ABIES) y un usuario por cargo. Para entrar hacen falta nombre, cargo, contraseña personal y contraseña del archivo. Respuestas a las preguntas de diseño:

- **Sincronización** como Solvento, con cola de cambios: queda para la **7b**.
- **Permisos:** cada cargo ve todo y edita lo suyo.
- **Contraseña del archivo:** se pide siempre.
- **Estilo:** el de Solvento con la marca de ABIES (hoy, la estética común con Ironrack y Solvento).

### Marca

- `nucleo/marca.js`:
  - el logotipo con la palabra (de `03_Comunicacion/Marca/logos/Group 3.svg`);
  - la hoja (`path1-3-1.svg`), en `currentColor`.
- **Colores:**
  - el logotipo, en naranja `#e6431f`;
  - los acentos, en el verde de ABIES (`#004b49` en el tema claro, `#3fb0a0` en el oscuro, por contraste);
  - el icono de la pestaña: la hoja blanca sobre el verde.
- Título «ABIES · Gestión».

### Usuarios y doble llave

- `cripto.js`: clave de datos, cifrar con ella (bloque v2), par ECDH por usuario, proteger y abrir la privada, envolver y desenvolver la clave de datos.
- `datos/cuentas.js` (con tests):
  - formato de la bóveda, crear, sellar y abrir;
  - alta, edición, contraseña provisional y reactivación;
  - cambio de la contraseña propia;
  - desactivar (cambia la clave de datos);
  - cambio de la contraseña del archivo.
- `datos/sesion.js`, rehecha:
  - `entrar`, `crear`;
  - `actualizarAntigua` (datos de una sola contraseña);
  - `restaurar` (copias nuevas, antiguas y sin cifrar);
  - gestión de usuarios;
  - demostración con cargo elegible;
  - copias v2.
- `modulos/acceso.js`, rehecho:
  - configurar por primera vez;
  - entrar (rellena nombre y cargo tras bloquear);
  - convertir los datos antiguos;
  - recuperar copias;
  - demostración por cargos.
- `modulos/usuarios.js` (solo administración):
  - alta (propone los permisos del cargo);
  - editar;
  - contraseña provisional, reactivar y desactivar;
  - contraseña del archivo;
  - explicación de la seguridad.
- **Ajustes → Mi cuenta:** cambiar la contraseña personal. Quien entra con una provisional tiene que cambiarla antes de seguir.

### Permisos

- `logica/permisos.js`, con los valores por defecto:

  | Cargo | Edita |
  |---|---|
  | Presidencia y vicepresidencia | Todo |
  | Secretaría | Asociación, socios, actas, obligaciones, documentos e informes |
  | Tesorería | Cuotas, tesorería, facturas, IVA y presupuestos |
  | Vocalía | Actividades |
  | Otros cargos | Nada (solo ver) |

- El repositorio rechaza las escrituras con el código `PERMISO` según el módulo abierto, y se avisa al usuario.
- En la interfaz:
  - candado en el menú;
  - franja «Solo lectura»;
  - se ocultan los botones de modificar (los de solo mirar llevan `.lectura-ok`);
  - el menú «Usuarios» solo lo ve la cuenta ABIES.

### Registro de cambios

- Esquema v8: colección `registro` y la firma `creadoPor` / `modificadoPor` en cada registro.
- Página **Actividad** (`#/registro`), con filtros por quién, dónde y texto.
- La firma aparece bajo el título de las fichas de socio, actividad, acta, factura y proyecto.
- La gestión de usuarios también se apunta.

### Copias

- La copia cifrada es la bóveda tal cual (`abies-copia` v2) y se abre con las mismas credenciales.
- Copia sin cifrar y recuperar copias en sesión: solo administración.
- Las copias v1, cifradas o sin cifrar, se convierten al recuperarlas.

## Verificado

- `npm test`: 123 en verde. Nuevos:
  - `tests/cuentas.test.js`:
    - los cuatro campos y el error genérico;
    - la contraseña provisional y su cambio;
    - que solo la administración gestiona usuarios;
    - desactivar con cambio de clave;
    - el cambio de la contraseña del archivo;
    - que no queda nada legible;
    - los permisos.
  - En `datos.test.js`: la migración a v8, la firma y el registro, el rechazo por permisos y las copias de ABIES.
- `npm run probar-file` (`file://` en un navegador sin interfaz), 18 comprobaciones en verde:
  - conversión de datos antiguos;
  - usuarios que sobreviven a recargar;
  - registro;
  - páginas;
  - un cargo con su contraseña provisional y sus permisos;
  - IndexedDB v1;
  - adjunto cifrado y vuelto a cifrar al desactivar a alguien;
  - un desactivado que no entra;
  - copia sin nada legible;
  - la copia no se recupera sin sus credenciales.
- En el navegador:
  - configurar, alta de un usuario, error de acceso genérico, cambio obligatorio de la contraseña provisional;
  - solo lectura en Actas y Socios para Tesorería, y escritura denegada;
  - desactivar;
  - actividad;
  - demostración por cargos;
  - firma en una ficha;
  - móvil sin desbordes (acceso, usuarios, actividad y todas las secciones).
  - La bóveda de prueba se borró del navegador al terminar.

## Pendiente

- **7b, sincronización con GitHub y cola** (ver NEXT_STEPS.md). Hace falta que el usuario cree el repositorio privado y un token de grano fino.
- **Convocatorias de asamblea:** sin definir todavía.

## Sin verificar

- Safari y Firefox.
- Impresión real.
- El `.ics` en un calendario real.
- El Excel en Excel o LibreOffice.
- Las capturas del README son anteriores a la estética de Solvento y a la marca de ABIES.
