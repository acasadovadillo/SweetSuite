# NEXT_STEPS.md — Siguiente paso concreto

## Ahora (esperando al usuario)

1. Que el usuario revise la Fase 5 y dé el OK. Hacer el commit «Fase 5: actas, obligaciones, subvenciones y documentos».
2. Pendiente de decidir: **convocatorias de asamblea** (antelación mínima según estatutos, primera y segunda convocatoria, texto para correo con los correos en CCO, versión imprimible). Cuando se decida: colección `convocatorias` enlazada con el acta que la sigue.
3. Pendiente de probar desde fases anteriores: Safari y Firefox, impresión real, .ics y Excel en sus programas.

## Fase 6 — Informes (siguiente)

**Preguntas para el usuario antes de empezar:**
- Memoria anual: ¿qué apartados? (Datos de la entidad, junta, número de socios, actividades con asistentes, proyectos y subvenciones, resumen económico…) ¿Con texto libre de presentación?
- Cuentas: ¿basta con el resumen de ingresos y gastos por categoría y los saldos (criterio de caja) o queréis algo más formal? Lo formal depende del plan contable aplicable: verificar con asesoría.
- Panel de resumen: ¿qué cifras queréis ver de un vistazo en Inicio?

**Primer paso concreto:** `logica/informes.js` (con tests), que reúna los datos de un ejercicio (socios a 31/12, altas y bajas, cuotas, actividades y asistentes, menores, proyectos, ingresos y gastos, saldos, IVA, actas y acuerdos) en un objeto. Después, la vista imprimible (`#/informes/memoria/<año>`) con estilos de impresión, como el acta y la factura.

## Mejoras anotadas (no urgentes)

- Remesa SEPA en XML (pain.008); prorrateo de cuotas; facturas rectificativas.
- Actividades: avisar a quien pasa de la lista de espera; ver en la ficha del socio sus actividades.
- Varios archivos a la vez al adjuntar; vista previa de imágenes.
- Enlazar la junta directiva con las fichas de socio.
- Capturas nuevas para el README (Tesorería, Actas).
