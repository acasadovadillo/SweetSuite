# CONTEXT.md — Decisiones y arquitectura

## Qué es

**ABIES · Gestión** (desde la Fase 7a, solo para la asociación ABIES; antes era un «webkit» genérico, y el repositorio conserva el nombre `webkit_asociaciones`). Aplicación de gestión integral, que se distribuye como **un único archivo HTML** (HTML + CSS + JavaScript sin dependencias), funciona **sin conexión** abriendo el archivo y guarda los datos **cifrados en el navegador**. **Software privativo, todos los derechos reservados** (decisión del 2026-10-01; podría abrirse más adelante). Código, comentarios e interfaz en español.

Nace de **Solvento** (`../../Solvento`, app de finanzas personales del mismo autor), del que se reutilizan ideas y piezas: el cifrado (`crypto.js`), el tema sin fogonazo (`tema.js`), las variables de color, y más adelante el escritor de .xlsx (`exportar.js`), el lector de .xlsx (`plan.js`), la lógica de presupuesto anual y centros de coste (`model.js`) y la gráfica SVG (`charts.js`). Solvento **no** tenía facturas, IVA ni socios: se construyen desde cero.

## Arquitectura

```
src/index.html            se abre directamente para desarrollar (scripts clásicos, funciona con file://)
src/css/                  fuentes (Albert Sans incrustada) · tokens (colores) · fondo (curvas incrustadas) · base (estructura) · componentes · impresión
src/js/nucleo/            dinero · fechas · validar · direccion · csv · xlsx · cripto · tema · preferencias · ui · form-direccion · app
src/js/logica/            socios · cuotas · actividades · actas · obligaciones · facturas · iva · tesoreria · extracto   (lógica de negocio pura, sin DOM, con tests)
src/js/datos/             esquema · repositorio · copia · demo · boveda · sesion
src/js/modulos/           acceso · inicio · asociacion · socios · cuotas · tesoreria-comun · actividades · tesoreria · facturas · iva · proyectos · actas · obligaciones · documentos · copias · ajustes
src/js/arranque.js        siempre el último
tools/build.mjs           empaqueta todo en dist/webkit_asociaciones.html (sin dependencias)
tests/*.test.js           node --test (incluido en Node, sin instalar nada)
tools/probar-file.mjs     prueba el HTML distribuido con file:// en un Chromium sin interfaz
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
| Socios: todos los campos opcionales salvo nombre y alta; número de socio que nunca se reutiliza (contador en `config`) | Webkit genérico: cada asociación rellena lo que necesite. El usuario pidió «todo lo posible» |
| Tipos de socio configurables (cuota + periodicidad anual/semestral/trimestral/mensual) en `config.tiposSocio` | Webkit genérico; por defecto un tipo «Socio» anual sin importe |
| Cuotas como registros propios con estado (pendiente, pagada, devuelta, anulada) y pago `{fecha, forma, cuentaId, referencia}` | Cada socio paga a su manera. **Contrato con la Fase 3:** `Cuotas.aMovimientos()` convierte las pagadas en ingresos (categoría «Cuotas de socios», con su cuenta) para que la tesorería las refleje sin apuntarlas dos veces |
| La cuota copia número y nombre del socio | Si se elimina un socio (derecho de supresión), las cuotas pagadas siguen teniendo sentido en la contabilidad |
| Sin prorrateo automático ni remesas SEPA en XML | El usuario cobra sobre todo por transferencia. El importe de una cuota se puede cambiar a mano; el fichero SEPA (pain.008) queda para más adelante |
| Ruta con subrutas (`#/socios/ficha/<id>`) | Las páginas de detalle tienen dirección propia (se pueden recargar) |
| Tesorería por **criterio de caja**, con IVA incluido | Lo práctico para una asociación pequeña. Las facturas no cuentan por sí mismas: cuenta su cobro o pago (movimiento enlazado con `facturaId`). Las cuentas formales pueden pedir otro criterio (verificar con asesoría) |
| Movimientos: ingreso, gasto, traspaso y «anticipo» (entregas y devoluciones a personas) | Traspasos y anticipos mueven dinero pero no son ingresos ni gastos. El gasto de un anticipo o reembolso son sus tickets justificados (`anticipos[].gastos`) |
| Cuotas cobradas = ingresos «virtuales» del libro, salvo que un movimiento del banco las enlace (`cuotaIds`) | Así una cuota cobrada en efectivo cuenta sola y una transferencia importada del banco no se cuenta dos veces (`Tesoreria.libro`) |
| IVA: tratamiento por línea (sujeto con tipo, exento, no sujeto); cuota sobre la suma de bases de cada tipo; liquidación encadenada con arrastre de lo que queda a compensar | Ayuda para el 303 y el resumen anual. Negativo en T1–T3 → «a compensar»; en T4 se puede marcar «a devolver» (regla general, salvo REDEME; verificar con asesoría). La prorrata no se calcula: se indica el porcentaje |
| Facturas emitidas: borrador → emitida (número correlativo por año y serie, bloqueada) → anulada | No se reutilizan números. Corregir una emitida suele requerir rectificativa (verificar); hay «desbloquear» con aviso |
| Importar extracto: detección de columnas, duplicados por (cuenta, fecha, importe, concepto), reglas de categoría y sugerencias de conciliación | Los bancos exportan cada uno a su manera; la persona puede corregir qué columna es cada cosa |
| Excel (.xlsx) escrito y leído sin librerías (`nucleo/xlsx.js`, portado de Solvento y sin DOMParser para poder probarlo en Node) | Funciona sin conexión y sin dependencias |
| Presupuestos: anual en `config.presupuestos[año]` y por proyecto en `proyectos[].presupuesto`, por categoría | Las categorías son las partidas. Lo realizado sale de `Tesoreria.partidas` |
| Actividades con inscripciones dentro (`actividades[].inscripciones`) | Una actividad y su lista se guardan juntas. Estado de cada inscripción: inscrita, espera o cancelada. La lista de espera se ordena por la marca de tiempo de inscripción y sube sola al cancelar |
| Inscripciones cobradas = ingresos «virtuales» del libro (categoría `inscripciones`), salvo que un movimiento las enlace (`inscripcionIds: ["actividadId:inscripcionId"]`) | El mismo mecanismo que las cuotas: nada se cuenta dos veces. La forma de pago al conciliar se deduce del concepto del banco (BIZUM, RECIBO…) |
| `actividadId` en movimientos y en gastos de anticipos | Para el balance económico de cada actividad (`Actividades.balance` sobre `Tesoreria.partidas`) |
| Menores: en socios se calcula con su fecha de nacimiento el día de la actividad; en no socios se marca a mano | Autorización firmada solo si la actividad lo pide |
| .ics propio (RFC 5545) con VTIMEZONE Europe/Madrid o Atlantic/Canary, líneas plegadas a 75 octetos | Sin librerías; se elige el horario (peninsular o canario) y se guarda en `config.zonaHoraria` |
| Sin actividades recurrentes | Decisión del usuario: se crean una a una (hay «Duplicar») |
| Adjuntos: la ficha va en la colección `documentos`; los bytes, en un almacén aparte de IndexedDB (`archivos`, BD versión 2), cifrados con la misma llave (`Cripto.cifrarBytes`, AES-GCM con iv nuevo) | No se recifran varios MB en cada guardado. La copia los lleva en `archivos` (base64, cifrados o en claro según la copia). Al cambiar la contraseña o restaurar se recifran (primero todos en memoria, luego se escriben). `Repositorio` recibe un adaptador `{guardar, leer, borrar}`: la futura API podría implementarlo con subida de archivos |
| IndexedDB versión 1 → 2 | Al actualizar, si otra pestaña tiene la base abierta, se espera (y se avisa) en vez de dar los datos por perdidos. Probado en `tools/probar-file.mjs` |
| Actas por órgano configurable (`config.organos`: junta, coordinación, asamblea, departamento, otro), numeración por año o correlativa (`config.actas.numeracion`) | Decisión del usuario: actas de Junta Directiva, Coordinación, Asambleas y Departamentos. La app anota el resultado de cada acuerdo, no lo decide (mayorías según estatutos) |
| Obligaciones: plantillas habituales (fiscales, asociativas, renovaciones) que se eligen, no se añaden solas; `desde` para no arrastrar plazos anteriores a cuando se empezó a llevarla | Fechas orientativas y editables («verificar con asesoría») |
| Subvenciones = proyectos con `tipo: "subvencion"` ampliados (estado, plazos, requisitos); sus plazos se suman al calendario de obligaciones según el estado | No se duplica con «proyectos» (que ya tiene presupuesto y ejecución) |
| Informes calculados en `logica/informes.js` (memoria, cuentas, pendientes a una fecha, panel) y pintados en `modulos/informes.js` e `inicio.js` | La lógica se prueba en Node; la vista solo enseña. Los textos que no se calculan (presentación, fines, valoración) se guardan por año en `config.memorias[año]` (esquema v7) |
| Cuentas del ejercicio por criterio de caja, con «pendiente a 31/12» calculado con los cobros y pagos hasta esa fecha | Así se ve lo que se debía al cerrar el año aunque se cobrara después. Estado de situación simplificado = tesorería + pendientes de cobro − pendientes de pago (no es el balance oficial) |
| Modelo de entidades sin fines lucrativos: cada categoría lleva una `partida` (por defecto según `PARTIDA_POR_DEFECTO`; editable en Tesorería → Ajustes) | Aproximación orientativa al modelo abreviado; las que no tienen partida van a «otros ingresos/gastos» y se avisa. Verificar con asesoría |
| Gráficas en SVG propio (`nucleo/graficas.js`), colores del tema, con texto alternativo y tabla oculta con los datos | Sin librerías y accesibles. Los recuentos (socios) empiezan en cero para no exagerar cambios pequeños |
| Convocatorias de asamblea | Pendientes: el usuario aún no ha definido cómo convocan |
| Sin «fines» en los datos de la asociación | Decisión del usuario: los fines vendrán de los estatutos, que se adjuntarán al archivo local más adelante |
| Estética común con Ironrack y Solvento (la de OpenClaw: fondo #0e1015, tarjetas con radio 12, Albert Sans, títulos en el acento, barra lateral de 288 px con cuenta y buscador, cajón por debajo de 1.024 px, cinco secciones abajo en el teléfono, acento elegible por usuario) | Decisión del usuario (2026-10-29): las tres apps con la misma estética. Todo sale de `css/tokens.css` (nombres por función, no por color). La fuente y las curvas del fondo van incrustadas: la aplicación no conecta con ningún servidor |
| Solo para ABIES (Fase 7a): marca (logotipo vectorial de su identidad visual en `nucleo/marca.js`, naranja #e6431f; acentos en su verde #004b49) | Decisión del usuario: «no es un software para todas las asociaciones, es solo para ABIES» |
| Bóveda con doble llave (`datos/cuentas.js`): clave de datos AES aleatoria; cada usuario con un par ECDH P-256 (privada cifrada con su contraseña, PBKDF2 310.000); la clave de datos envuelta para cada pública; la cabecera (usuarios) cifrada con la contraseña del archivo | Entrar exige nombre + cargo + contraseña personal + contraseña del archivo (decisión del usuario). Con claves públicas la cuenta ABIES da acceso, restablece y cambia la clave de datos sin conocer contraseñas ajenas. El error de acceso no dice qué falla |
| Desactivar a un usuario cambia la clave de datos (`generacion` + 1) y vuelve a cifrar los adjuntos | Quien se va no lee nada guardado después aunque conserve el archivo |
| Permisos por cargo (`logica/permisos.js`): todos ven todo; cada usuario edita las secciones de su lista (por defecto según el cargo; editable por la cuenta ABIES). El repositorio rechaza escrituras (código `PERMISO`) según el módulo abierto; la interfaz esconde los botones de modificar (`body.solo-lectura`, salvo `.lectura-ok`) y pone una franja y candados | Decisión del usuario («ve todo, edita lo suyo»). Sin servidor lo hace cumplir la aplicación, no el cifrado: está dicho en la interfaz y en el README |
| Registro de cambios en la colección `registro` (esquema v8) y firma `creadoPor` / `modificadoPor` en cada registro; la gestión de usuarios también se apunta (`repo.anotar`) | Saber quién hizo cada cambio; base para la sincronización con cola de la 7b |
| Copia cifrada = la bóveda tal cual + adjuntos cifrados (`abies-copia` v2); se abre con las mismas credenciales. Sin cifrar y recuperar copias: solo la cuenta ABIES. Las copias v1 y los datos de una sola contraseña se convierten | Nada en claro en la copia; compatibilidad con lo anterior |
| Navegación por `#/modulo` | Funciona con `file://` sin servidor |
| Capa de datos (`Repositorio`) asíncrona y como única puerta a los datos | **Preparada para la versión con servidor**: bastará con otro repositorio con las mismas funciones que use `fetch` contra una API |
| `dist/` se versiona y la integración continua comprueba que está al día | Quien no programa puede descargar el HTML directamente desde el repositorio |

### Capa de datos (contrato que debe respetar una futura API)

`leer(clave)`, `escribir(clave, valor)`, `listar(coleccion)`, `obtener(coleccion, id)`, `guardar(coleccion, registro)`, `guardarVarios`, `borrar(coleccion, id)`, `documento()`, `anotar(accion, donde, resumen)`, `estadoCopia()` y `marcarCopiaHecha()`, más los adjuntos (`guardarArchivo`, `leerArchivo`, `borrarArchivo`). Todas devuelven promesas y **copias** de los datos. Las escrituras pueden fallar con el código `PERMISO`.

Para la versión con servidor (no implementada) bastaría con:
- un `RepositorioAPI` con esas funciones, contra una API REST (`GET/PUT /asociacion`, `GET/POST/PUT/DELETE /junta/:id`…);
- en `Sesion`, sustituir el cifrado local por inicio de sesión (tokens) y mantener el modo local como opción;
- pagos en línea mediante enlaces de pago de una pasarela, que se generan en el servidor (nunca con claves en el navegador).

### Cómo añadir un módulo

Ver el comentario de cabecera de `src/js/nucleo/app.js`. En resumen: crear `src/js/modulos/x.js` con `WA.App.registrar({...})`, enlazarlo en `index.html` antes de `arranque.js` y, si añade colecciones, subir `VERSION` en `esquema.js` con su migración y su test.

## Normativa

No se presenta nada como asesoramiento legal. Lo que depende de una ley lleva el comentario «verificar con asesoría» en el código y una nota en la interfaz. Puntos ya marcados: cargos de la junta (según estatutos), algoritmo de control del NIF de entidades, RGPD/LOPDGDD (buenas prácticas orientativas), tratamiento del IVA, plazos de obligaciones y criterio y modelo de las cuentas anuales de entidades sin fines lucrativos.

## Entorno de desarrollo (en este Mac)

- Node 24 LTS instalado en `~/.local/node` (binario oficial de nodejs.org; Homebrew no tenía versión precompilada y quería compilar LLVM). Usar `export PATH="$HOME/.local/node/bin:$PATH"`.
- Servidor de pruebas: configuración `webkit-src` en `../.claude/launch.json` (puerto 4330). El panel del navegador abre los `file://` como `data:` (sin almacenamiento), así que para probar `file://` de verdad se usó Brave sin interfaz con un perfil temporal (ver HANDOFF.md).
