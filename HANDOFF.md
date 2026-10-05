# HANDOFF.md — Estado actual

*Última actualización: 2026-10-05 · Fase 4 (Actividades) terminada, **sin commit**; pendiente del OK del usuario.*

El proyecto está en `~/ACV/PROYECTOS/IA/ABIES/webkit_asociaciones`.

## Commits

- `6622e1f` Fase 1: base, datos de la asociación, copias cifradas.
- `a952c19` Fase 2: socios y cuotas.
- `f31c56c` Fase 3: tesorería, facturas, IVA y presupuestos.

## Fase 4: actividades y calendario

- **Esquema v5:** colección `actividades` (con sus inscripciones) y `config.zonaHoraria`. Migración 4→5 con test.
- **Lógica con tests** (`logica/actividades.js`):
  - inscribir (solo socios o abierta, precios de socio y general, sin duplicados, aforo, lista de espera);
  - cancelar con subida automática del primero en espera, o darle plaza a mano;
  - cobrar, cambiar importe, asistencia;
  - menores (en socios, por la fecha de nacimiento el día de la actividad) y autorizaciones;
  - resumen, duplicar, calendario del mes (lunes primero, actividades de varios días);
  - balance económico y exportación .ics (RFC 5545, horario peninsular o canario).
- **Tesorería ampliada:**
  - las inscripciones cobradas entran como ingresos («Inscripciones a actividades»), salvo que un movimiento del banco las enlace (`inscripcionIds`);
  - el extracto sugiere inscripciones;
  - `actividadId` en movimientos y en gastos de anticipos;
  - la forma de pago al conciliar se deduce del concepto del banco (BIZUM, RECIBO, TARJETA);
  - el Excel incluye una hoja de actividades.
- **Módulo Actividades:**
  - calendario mensual (en el móvil, lista del mes) y próximas;
  - lista con búsqueda;
  - ficha con datos, cifras (plazas, espera, asistencia, menores sin autorización, cobrado y pendiente) e inscripciones (inscribir socio o no socio, cobrar, autorización, asistencia, cancelar, dar plaza, cambiar importe);
  - balance con «Apuntar un gasto»;
  - hoja de asistencia imprimible con columna de firma;
  - exportar inscritos en CSV, copiar correos, duplicar, .ics de una actividad o de todas.
- **Inicio:** tarjeta de próximas actividades.
- **Demostración:** 6 actividades (2 realizadas con asistencia y cobros, 1 completa con lista de espera y menores, 1 taller, 1 asamblea solo para socios, 1 cancelada).
- **Corregido:** `UI.leerFormulario` leía mal los botones de opción (radio): ahora solo cuenta la marcada.

## Verificado

- `npm test`: 96 tests en verde. `npm run comprobar` y `npm run probar-file` en verde.
- En el navegador, con la demostración:
  - las pantallas nuevas se pintan sin errores;
  - inscribir en una actividad completa → espera; cancelar → sube la primera en espera, con aviso;
  - cobrar en efectivo → caja; marcar autorización y asistencia; cifras correctas (pendiente de cobro calculado a mano);
  - nueva actividad de todo el día y solo para socios (oculta el precio de no socios, cambia los campos a fecha);
  - inscribir a un socio por número; .ics con fechas de día completo;
  - conciliar un Bizum del banco con su inscripción: queda pagada, enlazada a la actividad y contada una sola vez.
- **Móvil:** ninguna pantalla nueva desborda.

## Sin verificar

- Importar el .ics en Google Calendar, Outlook o Apple Calendar reales (solo hay tests de formato).
- Safari y Firefox; impresión real; abrir el Excel en Excel o LibreOffice.

## Decisiones del usuario (Fase 4)

- Cada actividad decide si es abierta a todos o solo para socios.
- La inscripción a veces se cobra, y entonces se apunta en tesorería.
- Aforo, lista de espera, asistencia real, y menores con autorización.
- Sin actividades recurrentes: una a una.
