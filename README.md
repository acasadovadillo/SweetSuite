# Ironrack

App web para apuntar los entrenos del gimnasio: ejercicios, series, repeticiones y kilos. Pensada para el móvil (se instala en la pantalla de inicio) y para funcionar sin cobertura.

- **Entrenar**: entreno vacío, desde una rutina o repitiendo uno anterior. Cada serie muestra lo que hiciste la última vez y propone los kilos y las repeticiones; al marcarla con ✓ arranca el descanso.
- **Temporizador de descanso**: cuenta hasta una hora de fin, así que sigue bien aunque bloquees el móvil. ±15 s, pitido y vibración al terminar.
- **Rutinas**: plantillas con series, repeticiones y kilos objetivo. Un entreno terminado se puede guardar como rutina.
- **Historial**: entrenos por meses, detalle con 1RM estimado por serie, repetir y borrar.
- **Progreso**: entrenos por semana y, por ejercicio, récords (peso máximo, 1RM estimado, volumen, repeticiones) y gráfica. Al terminar un entreno avisa de los récords nuevos.
- **Ejercicios**: unos 85 en el catálogo, por grupo muscular, y los tuyos propios.

Las series de calentamiento (toca el número de la serie) no cuentan para récords ni volumen.

## Dónde están los datos

Igual que Solvento: todo lo de cada usuario es **un documento cifrado en el navegador** (AES-256-GCM, clave derivada de la contraseña con PBKDF2-SHA256 y 310.000 iteraciones, mismo formato de bloque) y se guarda en el repositorio **privado** `acasadovadillo/datos-cifrados`:

```
datos-cifrados/Ironrack/<usuario>-ironrack.enc
```

- La contraseña nunca se guarda ni sale del navegador. GitHub solo ve texto cifrado.
- Hace falta un token **fine-grained** con acceso solo a `datos-cifrados` y permiso *Contents: Read and write* (vale el de Solvento). Se pide la primera vez en cada dispositivo y se guarda cifrado.
- Cada cambio se guarda al momento en el dispositivo (cifrado) y se sube a GitHub unos segundos después, o en cuanto vuelve la conexión.
- **Varios dispositivos**: si el móvil y el portátil guardan a la vez, los documentos se fusionan elemento a elemento (gana la versión más reciente de cada entreno, rutina o ejercicio; lo borrado no resucita).
- «Recordar en este dispositivo» guarda la clave derivada (no la contraseña) como `CryptoKey` no exportable en IndexedDB, para no teclear la contraseña en cada entreno.
- En Ajustes se puede descargar una copia en JSON **sin cifrar**, e importarla (se fusiona, no pisa).

## Estructura

Sin build ni dependencias: HTML, CSS y JS que se sirven tal cual (GitHub Pages).

```
index.html            la página
sw.js                 caché para abrir sin conexión (subir VERSION al cambiar archivos)
manifest.json, img/   instalación como app
src/css/app.css
src/js/
  util.js             formato, 1RM (Epley), volumen
  cripto.js           cifrado y clave recordada
  github.js           leer/escribir el bloque en datos-cifrados (y repositorio de mentira en local)
  almacen.js          el documento, fusión, copia local, sincronización, entrar/salir
  biblioteca.js       catálogo de ejercicios (los id no se cambian nunca)
  analisis.js         historial por ejercicio, récords, semanas
  ui.js               hoja inferior, menús, selector de ejercicios, gráficas SVG
  descanso.js         temporizador
  entrenar.js, rutinas.js, historial.js, progreso.js, ejercicios.js   las vistas
  app.js              arranque, entrada, navegación y ajustes
tools/servir.py       servidor local sin caché
```

## Probar en local

```bash
python3 tools/servir.py
```

Abre <http://localhost:8771>. En `localhost` la app **no habla con GitHub**: usa un repositorio de mentira dentro del navegador, y cualquier texto vale como token. Para probar contra GitHub de verdad: <http://localhost:8771/?real>.

## Publicar

En GitHub Pages desde la rama `main` (raíz). Al publicar cambios, sube `VERSION` en `sw.js` para que los móviles se actualicen.
