# NEXT_STEPS.md — Siguiente paso concreto

## Ahora (esperando al usuario)

1. Que el usuario revise la Fase 2 y dé el OK. Hacer el commit «Fase 2: socios y cuotas».
2. Probar el archivo en **Safari y Firefox** con doble clic (crear, recargar, desbloquear). Si alguno no guarda en IndexedDB con `file://`, comprobar que entra el respaldo de localStorage y documentarlo.

## Fase 3 — Tesorería (siguiente)

**Preguntas para el usuario antes de empezar:**
- ¿La asociación está dada de alta en IVA (presenta el modelo 303) o está exenta en todo? ¿Tiene actividades sujetas y exentas a la vez? Si las tiene, se aplica la **prorrata**, que no se calculará: solo se avisará.
- ¿Qué cuentas tiene (bancos, caja)? ¿Un saldo inicial por cuenta?
- ¿Emite facturas (a entidades, por servicios) o solo recibe facturas de gasto?
- ¿Cómo funcionan los anticipos y los reembolsos? (Alguien de la junta paga de su bolsillo y luego se le devuelve.)
- Categorías de ingreso y gasto: proponer unas por defecto y que se puedan editar. En Solvento, la asociación usa un árbol cuyo primer nivel es la partida presupuestaria.

**Primer paso concreto:** diseñar en `esquema.js` (v4) las colecciones `movimientos`, `facturas` (emitidas y recibidas, con líneas y tipos de IVA), `anticipos`, `proyectos` y `presupuestos`, más `config.cuentas` (con saldo inicial) y `config.categorias`.

- **Las cuotas pagadas entran en la contabilidad mediante `Cuotas.aMovimientos()`** (origen `{tipo: "cuota", id}`): mostrarlas en el libro de movimientos como ingresos de solo lectura, sin duplicarlas.
- Reutilizar de Solvento: el escritor de .xlsx (`Solvento/src/js/exportar.js`) y la lógica de presupuesto anual y centros de coste (`model.js`, `presupuestoAnual`).
- IVA: cálculo en céntimos por línea y totales por trimestre, con tests. Aviso «a compensar» frente a «a devolver» cuando el resultado es negativo: verificar con asesoría en qué periodos se puede pedir la devolución.

## Mejoras anotadas (no urgentes)

- Remesa SEPA en fichero XML (pain.008) para quien domicilie cuotas.
- Prorrateo automático de la cuota para quien entra a mitad de periodo (hoy se cambia el importe a mano).
- Enlazar la junta directiva con fichas de socio.
- Avisar si `navigator.storage.persist()` devuelve `false`.
- En desarrollo (`src/index.html` servido por http), el navegador puede servir JS en caché. Valorar añadir `?v=` en los `<script>` de `src/index.html`; el build ya los empaqueta, así que no afecta a `dist/`.
