# NEXT_STEPS.md — Siguiente paso concreto

## Ahora (esperando al usuario)

1. Que el usuario revise la Fase 3 y dé el OK. Hacer el commit «Fase 3: tesorería, facturas, IVA y presupuestos».
2. Probar el Excel descargado en Excel o LibreOffice, y la impresión de una factura a PDF.
3. Probar en **Safari y Firefox** con doble clic.

## Fase 4 — Actividades y calendario (siguiente)

**Preguntas para el usuario antes de empezar:**
- ¿Qué datos tiene una actividad? (Fecha y hora, lugar, plazas, precio para socios y no socios, responsable…)
- Inscripciones: ¿también de personas que no son socias? ¿Lista de espera? ¿Cobro de la inscripción (que generaría un ingreso en tesorería con la categoría «Inscripciones»)?
- ¿Tenéis actividades recurrentes (todos los martes…)?

**Primer paso concreto:** colección `actividades` (esquema v5) con `{ id, titulo, descripcion, inicio, fin, lugar, plazas, precioSocio, precioGeneral, proyectoId, responsable, estado, inscripciones: [{ socioId | nombre, contacto, pagado, movimientoId, asistio }] }`.
- Lógica con tests: plazas libres, lista de espera, exportar `.ics` (RFC 5545: escapar comas y puntos y comas, líneas de 75 octetos, fechas en UTC o con TZID).
- Enlazar actividad ↔ proyecto (ya existe `proyectoId` en movimientos) y ↔ gastos e ingresos (añadir `actividadId` a movimientos y gastos de anticipos).
- Calendario mensual en la interfaz, que reúna actividades y, más adelante, obligaciones (Fase 5).

## Mejoras anotadas (no urgentes)

- Remesa SEPA en fichero XML (pain.008) para quien domicilie cuotas.
- Prorrateo automático de cuotas.
- Facturas rectificativas.
- Enlazar la junta directiva con fichas de socio.
- Avisar si `navigator.storage.persist()` devuelve `false`.
- Capturas nuevas para el README (Tesorería, Facturas, IVA): el panel del navegador estaba oculto al terminar.
