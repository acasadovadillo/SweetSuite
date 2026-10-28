# NEXT_STEPS.md — Siguiente paso concreto

## Ahora (esperando al usuario)

1. Que el usuario revise la Fase 7a y dé el OK. Commit «Fase 7a: ABIES — marca, usuarios por cargo, permisos y registro».
2. Para la 7b, el usuario tiene que:
   - crear un **repositorio privado** para los datos (por ejemplo `abies-datos`); lo puedo crear con `gh` si me da permiso;
   - crear un **token de GitHub de grano fino** con permiso de lectura y escritura sobre el contenido, solo para ese repositorio, e introducirlo él.

## Fase 7b — Sincronización con GitHub y cola

- **Adaptador remoto** `{ leer() → { contenido, sha }, escribir(contenido, sha) }`:
  - para GitHub, la API de contenidos con `Accept: application/vnd.github.raw` para leer sin el límite de 1 MB;
  - uno falso, en memoria, para los tests, que simule varias personas escribiendo a la vez.
- **Archivos en el repositorio:**
  - `datos.enc` (la bóveda);
  - `adjuntos/<id>.enc` (cada adjunto cifrado con la clave de datos).
- **Token:** se guarda en el dispositivo, cifrado con la contraseña del archivo. Se pide una vez por dispositivo.
- **Cola de operaciones persistente** (IndexedDB), con cada `guardar` / `borrar` / `escribir` / `anotar`:
  1. Al subir: bajar la última versión, descifrarla, aplicar la cola en orden y subir con el `sha`.
  2. Si GitHub responde 409, repetir.
  3. Si otra persona cambió el mismo registro desde que se leyó (comparar `modificado`), se queda la versión propia y se avisa a los dos.
- **Traer los cambios de los demás:** al abrir, al volver a la pestaña y cada pocos minutos.
- **Sin conexión:** la cola espera.
- **Al terminar:** comprobar lo subido descargándolo y descifrándolo, como hace Solvento.

## Mejoras anotadas (no urgentes)

- Remesa SEPA en XML (pain.008); prorrateo de cuotas; facturas rectificativas.
- Actividades: avisar a quien pasa de la lista de espera; ver en la ficha del socio sus actividades.
- Varios archivos a la vez al adjuntar; vista previa de imágenes.
- Enlazar la junta directiva con los usuarios y con las fichas de socio.
- Usuarios en el móvil: tarjetas en vez de tabla.
- Informes: memoria con fotos o anexos; comparar varios años en el panel.
- Capturas nuevas para el README.
