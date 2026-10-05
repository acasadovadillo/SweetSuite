# HANDOFF.md — Estado actual

*Última actualización: 2026-10-05 · Fase 3 (Tesorería) terminada, **sin commit**; pendiente del OK del usuario.*

El proyecto está ahora en `~/ACV/PROYECTOS/IA/ABIES/webkit_asociaciones` (antes estuvo en `~/ACV/Claude_Directories/ABIES/`).

## Fases anteriores (con commit)

- `6622e1f` Fase 1: base, datos de la asociación, copias cifradas.
- `a952c19` Fase 2: socios y cuotas.

## Fase 3: tesorería

- **Esquema v4:** en `config`, cuentas con saldo inicial e IBAN, categorías de ingreso y gasto (con su IVA habitual), IVA (presenta, prorrata, saldo a compensar inicial, devoluciones pedidas), facturación (serie, motivo de exención, forma de pago, pie), reglas de clasificación y presupuestos anuales. Nuevas colecciones: `movimientos`, `facturas`, `anticipos` y `proyectos`. Migración 3→4 con test.
- **Lógica con tests:**
  - `logica/facturas.js`: totales por tipo, retención, numeración, revisión y estado de cobro.
  - `logica/iva.js`: trimestres, liquidaciones encadenadas con compensación, avisos y resumen anual.
  - `logica/tesoreria.js`: libro con cuotas sin duplicar, saldos, resultados, ejecución de presupuesto, anticipos y conciliación con cuotas.
  - `logica/extracto.js`: columnas, conversión, duplicados, reglas y sugerencias.
  - `nucleo/xlsx.js`: escribir y leer Excel.
- **Módulos:**
  - **Tesorería:**
    - Resumen: saldos, ingresos y gastos del año, pendientes y descarga del Excel.
    - Movimientos: filtros, alta y edición con conciliación, importar extracto con mapeo de columnas y vista previa.
    - Anticipos y reembolsos: explicación en letra pequeña, gastos justificados, entregas, devoluciones y pagos.
    - Ajustes: cuentas, categorías, reglas, IVA y facturación.
  - **Facturas:**
    - Emitidas: borrador → emitir → cobrar → imprimir o PDF, más anular, desbloquear y duplicar.
    - Recibidas: con retención y «deducible».
    - Autocompletado de clientes y proveedores conocidos.
  - **IVA:** trimestres con resultado y aviso «a compensar» o «a devolver», casilla para pedir la devolución en el 4.º trimestre, detalle por tipo, exentas, no sujetas y retenciones, y resumen anual.
  - **Presupuestos:** presupuesto anual editable (copiar del año anterior) y proyectos o subvenciones con presupuesto por partidas, ejecución y movimientos.
- **Inicio:** tarjeta de saldo y aviso de movimientos sin clasificar.
- **Demostración:** cuentas, movimientos (algunos «del banco» sin clasificar), 2 facturas emitidas y 3 recibidas, un anticipo, un reembolso, un proyecto subvencionado y el presupuesto de 2026.

## Verificado

- `npm test`: 87 tests en verde. `npm run probar-file` (Brave, `file://`) en verde.
- En el navegador, con la demostración:
  - Las 23 pantallas se pintan sin errores.
  - Importar un extracto: 2 nuevos, 1 duplicado saltado y la regla aplicada.
  - Conciliar una transferencia con su cuota: queda pagada y el saldo no cambia, sin doble cómputo.
  - Clasificar un movimiento.
  - Factura completa: avisos al emitir vacía, autocompletado del cliente, línea exenta con motivo, emisión con el número 2026-0003, cobro, estado «Cobrada» e impresión.
  - Cifras del IVA comprobadas a mano: T1 a ingresar 25,20 €; T2 −10,50 € a compensar, arrastrados.
  - Excel descargado y vuelto a leer: 7 hojas; ZIP y XML válidos.
  - Pago de un reembolso, que queda liquidado.
  - Guardar el presupuesto anual.
- **Móvil:** ninguna pantalla desborda. Se corrigió que los textos solo para lectores de pantalla ensanchaban la página: `position: relative` en `.tabla-envoltorio` y `.pestanas`.
- **Fallos encontrados y corregidos en esta fase:**
  - Nombres de hoja de Excel repetidos.
  - La primera línea de una factura nueva salía «no sujeta».
  - Las sugerencias de cuotas proponían socios que solo compartían un apellido.
  - El concepto aparecía duplicado en los movimientos importados.
  - La factura impresa desbordaba en el móvil.

## Sin verificar

- Safari y Firefox con `file://`.
- Abrir el Excel en Excel o LibreOffice reales: solo se validó su estructura.
- Imprimir de verdad (solo el CSS de impresión).
- Lectores de pantalla reales.

## Decisiones del usuario

- Licencia privativa. Si se sube a GitHub, repositorio privado.
- IVA: presentan el 303 trimestral y el resumen anual, pero no todo está sujeto (cuotas y donaciones no). Cada línea puede ser sujeta, exenta o no sujeta.
- Facturas: emiten y reciben.
- Anticipos y reembolsos: las dos vías, explicadas en letra pequeña.
- Banco: importar el extracto y apuntar a mano.
