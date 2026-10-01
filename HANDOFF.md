# HANDOFF.md — Estado actual

*Última actualización: 2026-10-01 · Fase 2 (Socios) terminada; pendiente del OK del usuario para pasar a la Fase 3 (Tesorería).*

## Fase 1: base y datos (commit `6622e1f`)

- Un único HTML (`npm run build` → `dist/webkit_asociaciones.html`), sin dependencias.
- Datos cifrados en IndexedDB con la misma contraseña que las copias. Esquema versionado con migraciones.
- Módulos: Inicio, Asociación (datos, domicilio por partes, junta directiva), Copia de seguridad y Ajustes.
- Licencia privativa: todos los derechos reservados.

## Fase 2: socios y cuotas (todavía sin commit)

- **Esquema v3:** `config` (tipos de socio, cuentas de cobro y contador de número de socio) y las colecciones `socios`, `cuotas` y `remesas`. Migración v2→v3 y una «red de seguridad» (`asegurarForma`) que completa lo que falte en cualquier documento.
- **Lógica con tests:**
  - `logica/socios.js`: estado, edad, búsqueda, validación, duplicados e importación CSV con columnas flexibles.
  - `logica/cuotas.js`: periodos, emisión, pago, deshacer, devolución, anulación, resúmenes, deudores y `aMovimientos` para la contabilidad.
  - `nucleo/csv.js`: formato de Excel en español y protección contra fórmulas.
- **Módulo Socios:**
  - Listado con búsqueda (sin tildes) y filtros por estado, tipo y orden.
  - Ficha completa: datos personales, contacto, dirección por partes (componente compartido `FormDireccion`), tutor si es menor, condición de socio, domiciliación SEPA, consentimientos de datos e imagen y notas.
  - Alta, que ofrece emitir la cuota del periodo si ya se emitieron. Baja, que anula sus cuotas pendientes. Reactivar. Eliminar (las cuotas pagadas se conservan).
  - Importar CSV, con vista previa, avisos por fila y salto de duplicados. Exportar CSV, con aviso de datos sin cifrar.
  - Libro de registro imprimible.
- **Módulo Cuotas:**
  - Por periodo: emitir con vista previa de a quién no se emite y por qué; resumen de emitido, cobrado, pendiente y desglose por forma de pago; cobrar una o varias a la vez (forma de pago y cuenta, con el efectivo a caja); «Más…» para deshacer el pago, marcar como devuelta, anular, reactivar, cambiar el importe o borrar, con historial; exportar CSV.
  - Impagados: deudores, copiar sus correos para enviarlos en copia oculta y exportar.
  - Tipos de socio: añadir, editar y borrar si no se usa.
- **Inicio:** socios activos, cuotas sin cobrar y nuevos pasos de «Para empezar».
- **Datos de demostración:** 40 socios ficticios (incluidos menores y bajas) y cuotas de 2025 y 2026.
- `tools/probar-file.mjs` (`npm run probar-file`): prueba automática con `file://` real en un Chromium sin interfaz.

## Verificado

- `npm test`: 65 tests en verde. `npm run comprobar` en verde.
- `npm run probar-file` (Brave, `file://`): migración de datos v2 → v3, guardado en IndexedDB y persistencia tras recargar. Esta prueba destapó un fallo (un documento sin `meta` rompía el guardado), ya corregido y con test.
- En el navegador sobre localhost, con la demostración: búsqueda y filtros; alta con validación, edad, tutor, SEPA y provincia automática; oferta de la cuota del periodo; cobro individual (desde la ficha sin perder lo que se está editando) y múltiple; deshacer el pago; baja con anulación de cuotas; emisión de un periodo nuevo; impagados; alta de un tipo semestral; importación CSV con un duplicado saltado y numeración correcta; libro de registro.

## Sin verificar

- Safari y Firefox con `file://`.
- Impresión real del libro de registro (solo revisado el CSS de impresión).
- Lectores de pantalla reales.

## Decisiones del usuario

- Licencia privativa (2026-10-01). Si se sube a GitHub, repositorio privado.
- Socios: genérico y configurable. Un tipo por defecto («Socio», anual). La forma de pago se elige en cada cuota y debe reflejarse en la contabilidad. Datos del socio: «todo lo posible».
