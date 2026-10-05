# HANDOFF.md — Estado actual

*Última actualización: 2026-10-05 · Fase 5 (Gobierno y documentación) terminada salvo las convocatorias, **sin commit**; pendiente del OK del usuario.*

El proyecto está en `~/ACV/PROYECTOS/IA/ABIES/webkit_asociaciones`.

## Commits

`6622e1f` Fase 1 · `a952c19` Fase 2 · `f31c56c` Fase 3 · `fd58330` Fase 4: actividades y calendario.

## Fase 5: gobierno y documentación

- **Esquema v6:** colecciones `actas`, `obligaciones` y `documentos`; en `config`, `organos`, `actas.numeracion` y `limiteArchivoMB`. Migración 5→6 con test.
- **Adjuntos cifrados:**
  - bytes en un almacén aparte de IndexedDB (base de datos versión 2), cifrados con la misma llave;
  - van en la copia de seguridad, se recifran al cambiar la contraseña y al restaurar, y se borran con «borrar del navegador»;
  - en la demostración viven en memoria.
- **Lógica con tests:**
  - `logica/actas.js`: órganos por defecto, plantillas del orden del día por tipo de órgano, numeración anual o correlativa, revisión, texto de votación, libro de acuerdos y texto plano del acta;
  - `logica/obligaciones.js`: plantillas habituales con fechas orientativas, vencimientos con situación (hecha, vencida, próxima, pendiente), `desde` y plazos de subvenciones según su estado.
- **Módulos:**
  - **Actas:**
    - lista con filtros;
    - editor con datos de la sesión, asistentes (junta, socios con buscador u otras personas), orden del día editable (añadir, quitar, reordenar), acuerdos con votación (unanimidad, asentimiento o recuento) y resultado, ruegos y aprobación;
    - versión para firmar, copiar texto, libro de acuerdos con buscador;
    - órganos (añadir departamentos) y numeración;
    - documentos del acta (acta firmada).
  - **Obligaciones:** calendario de 12 meses más los vencidos, marcar como hecha con nota, elegir de las habituales, editar (anual con varias fechas o única), lista. Los vencimientos aparecen también en el calendario de Actividades y en Inicio («Plazos que vencen»).
  - **Documentos:** adjuntar (límite configurable), ver, descargar, editar, borrar, categorías, aviso si faltan los estatutos y espacio usado. Componente `WA.DocsUI.seccion` dentro de actas y proyectos.
  - **Presupuestos → subvenciones:** seguimiento (estado, importe solicitado, plazos, fechas, bases), requisitos con casillas, cobrado frente a concedido, documentos.
- **Inicio:** plazos que vencen y nuevos pasos («Adjunta los estatutos», «Elige las obligaciones»).
- **Demostración:** 2 actas, departamento de ejemplo, 9 obligaciones (una vencida), 2 subvenciones (una concedida y otra preparándose) y 3 documentos de texto inventados.

## Verificado

- `npm test`: 107 tests en verde. `npm run comprobar` en verde.
- `npm run probar-file` (Brave, `file://`) ampliado y en verde:
  - actualización de IndexedDB de la versión 1 a la 2 conservando los datos;
  - adjunto cifrado;
  - cambio de contraseña y recarga;
  - copia con el adjunto;
  - borrar del navegador;
  - restaurar con otra contraseña y recuperar el adjunto.
- En el navegador, con la demostración:
  - todas las pantallas nuevas sin errores;
  - acta nueva con su plantilla, número correlativo, votación con recuento, reordenar puntos sin perder lo escrito, asistentes y libro de acuerdos;
  - obligaciones: marcar la vencida como hecha, añadir habituales, editar fechas y validar fechas mal escritas;
  - adjuntar, leer y descargar un documento;
  - seguimiento de una subvención con requisitos.
- **Móvil:** ninguna pantalla nueva desborda.
- **Fallos encontrados y corregidos:**
  - los plazos de años anteriores salían como vencidos al añadir una obligación (ahora existe `desde`);
  - `.map(O.desdePlantilla)` recibía el índice como fecha y la segunda obligación fallaba en silencio;
  - los campos sin `type` quedaban sin estilo;
  - riesgo de dar los datos por perdidos si la actualización de IndexedDB queda bloqueada por otra pestaña.

## Pendiente (decisión del usuario)

- **Convocatorias de asamblea:** sin definir todavía (antelación, primera y segunda convocatoria, envío).

## Sin verificar

- Safari y Firefox; impresión real (actas, facturas, hoja de asistencia); el .ics en un calendario real; el Excel en Excel o LibreOffice.
- Adjuntos grandes (varios MB) en móviles: el límite de espacio depende del navegador.
