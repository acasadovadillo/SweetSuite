# Ironrack

App web para apuntar los entrenos del gimnasio: ejercicios, series, repeticiones y kilos. Pensada para el móvil (se instala en la pantalla de inicio) y para funcionar sin cobertura.

- **Entrenar**: entreno vacío, desde una rutina o repitiendo uno anterior. Cada serie muestra lo que hiciste la última vez y propone los kilos y las repeticiones; al marcarla con ✓ arranca el descanso.
- **Temporizador de descanso**: cuenta hasta una hora de fin, así que sigue bien aunque bloquees el móvil. ±15 s, pitido y vibración al terminar.
- **Rutinas**: plantillas con series, repeticiones y kilos objetivo. Un entreno terminado se puede guardar como rutina.
- **Historial**: entrenos por meses, detalle con 1RM estimado por serie, repetir y borrar.
- **Progreso**: entrenos por semana y, por ejercicio, récords (peso máximo, 1RM estimado, volumen, repeticiones) y gráfica. Al terminar un entreno avisa de los récords nuevos.
- **Ejercicios**: unos 85 en el catálogo, por grupo muscular, y los tuyos propios.

Las series de calentamiento (toca el número de la serie) no cuentan para récords ni volumen.

## Aspecto

Copia la estética de la app de OpenClaw para macOS, medida sobre sus capturas: fondo `#0e1015`, tarjetas `#161920` con borde `#1c1f27`, texto `#f4f4f5` y secundario `#8b8b94`, títulos de página en el color de acento, filas con conmutadores.

Comparte con Solvento la estructura —barra lateral con marca, título, cuenta, buscador y, abajo, el estado y la versión; en el móvil, la misma barra como cajón con hamburguesa y cinco pestañas abajo; Ajustes con lista de secciones y tarjeta— y también la fuente (Albert Sans), el botón principal (el acento oscurecido hasta 4,5:1 con blanco), las medidas de la barra lateral y de las etiquetas de sección, el subtítulo de página, el fondo de curvas de nivel, el aviso breve y el formato de la versión.

En **Ajustes › Apariencia** se elige el color de acento: la paleta de OpenClaw (coral, salmón, ámbar, menta, turquesa, azul, lavanda, rosa y pizarra) o cualquier otro con el cuentagotas. Se guarda en el documento cifrado, así que es el mismo en todos tus dispositivos.

## Dónde están los datos

Ironrack vive dentro de **SweetSuite** (ver el README de la raíz): la entrada, la contraseña y la clave de recuperación son las de SweetSuite, que le da a Ironrack su secreto. Con él se cifra todo lo de cada usuario (AES-256-GCM, PBKDF2-SHA256 310.000), que se guarda en el repositorio **privado** `Ironrack-Data`, un archivo por cuenta (`<usuario>-ironrack.enc`).

- El token (*fine-grained*, solo sobre `Ironrack-Data`, *Contents: Read and write*) se pega en Ajustes → Sincronización, no al entrar.
- Cada cambio se guarda al momento en el dispositivo y se sube a GitHub con el autoguardado (encendido de serie), con Guardar, con ⌘S o al volver a SweetSuite.
- **Varios dispositivos**: los documentos se fusionan elemento a elemento (gana la versión más reciente de cada entreno, rutina o ejercicio; lo borrado no resucita).
- En Ajustes se puede descargar una copia en JSON **sin cifrar**, e importarla (se fusiona, no pisa).

## Estructura

Sin build ni dependencias: HTML, CSS y JS que se sirven tal cual, dentro de SweetSuite.

```
index.html            la página (SweetSuite la abre en un marco)
img/                  logo y curvas del fondo
src/css/app.css
src/js/
  suite-puente.js     el enlace con SweetSuite (fuera de ella, se va a SweetSuite)
  util.js             formato, 1RM (Epley), volumen
  tema.js             color de acento (Ajustes › Apariencia)
  cripto.js           cifrado y sesión en memoria
  github.js           leer/escribir el bloque en Ironrack-Data
  almacen.js          el documento, fusión, copia local, sincronización, llavero
  biblioteca.js       catálogo de ejercicios (los id no se cambian nunca)
  analisis.js         historial por ejercicio, récords, semanas
  ui.js               hoja inferior, menús, selector de ejercicios, gráficas SVG
  descanso.js         temporizador
  entrenar.js, rutinas.js, historial.js, progreso.js, ejercicios.js   las vistas
  app.js              arranque desde SweetSuite, navegación y ajustes
```

Se prueba y se publica con SweetSuite (ver su README).
