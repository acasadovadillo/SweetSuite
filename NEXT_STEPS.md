# NEXT_STEPS.md — Siguiente paso concreto

## Ahora (esperando al usuario)

1. Que el usuario revise la Fase 4 y dé el OK. Hacer el commit «Fase 4: actividades y calendario».
2. Probar a importar el `.ics` en el calendario que usen (Google, Outlook, móvil).
3. Pendiente desde fases anteriores: Safari y Firefox, abrir el Excel e imprimir a PDF.

## Fase 5 — Gobierno y documentación (siguiente)

**Preguntas para el usuario antes de empezar:**
- Actas: ¿de qué órganos (junta directiva, asamblea general ordinaria y extraordinaria)? ¿Numeración por año o correlativa? ¿Firman presidencia y secretaría?
- Convocatorias: ¿con cuánta antelación según vuestros estatutos? ¿Primera y segunda convocatoria? ¿Se envían por correo (generar el texto para copiar) o se imprimen?
- Obligaciones: ¿cuáles queréis ver con aviso? (Cuentas anuales, modelos 303/390, 111/190, 182 de donaciones, 347, renovación de cargos, seguros, registro de asociaciones…). Las fechas exactas: verificar con asesoría; se podrán editar.
- Subvenciones: ¿qué datos seguís (convocatoria, plazo de solicitud, resolución, importe, plazo de justificación, documentos)? Ya existen «proyectos» con tipo subvención y presupuesto: ampliarlos en vez de duplicarlos.
- ¿Adjuntar documentos (estatutos, actas firmadas)? Sería con IndexedDB y aumentaría el tamaño de las copias de seguridad.

**Primer paso concreto:** colecciones `actas`, `convocatorias` y `obligaciones` (esquema v6); ampliar `proyectos` con los campos de seguimiento de subvenciones (plazos, estado, justificación). Las obligaciones aparecerán también en el calendario de actividades y en Inicio.

## Mejoras anotadas (no urgentes)

- Remesa SEPA en fichero XML (pain.008); prorrateo automático de cuotas; facturas rectificativas.
- Actividades: avisar por correo (generar texto) a quien pasa de la lista de espera; ver en la ficha del socio sus actividades.
- Enlazar la junta directiva con fichas de socio.
- Avisar si `navigator.storage.persist()` devuelve `false`.
- Capturas nuevas para el README de Tesorería, Facturas e IVA.
