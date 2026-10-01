# NEXT_STEPS.md — Siguiente paso concreto

## Antes de la Fase 2 (esperando al usuario)

1. Que el usuario revise la Fase 1 y dé el OK.
2. Decidir si se hace el primer commit (y, más adelante, si se sube a GitHub: en ese caso, repositorio **privado**).
3. Probar el archivo en **Safari y Firefox** con doble clic: crear, recargar, desbloquear. Si alguno no guarda en IndexedDB con `file://`, comprobar que entra el respaldo de localStorage y documentarlo en el README.

## Fase 2 — Socios (siguiente)

Primer paso concreto: **diseñar la colección `socios`** en `esquema.js` (subir `VERSION` a 3 con su migración y su test; la v2 fue el domicilio por partes):
`{ id, numero, nombre, apellidos, nif, email, telefono, direccion (misma forma que nucleo/direccion.js), tipo, fechaAlta, fechaBaja, motivoBaja, iban, mandatoSepa, consentimientos, notas }`.
Antes de implementarlo, **preguntar al usuario**: qué tipos de socio hay (ordinario, juvenil, honorario…), si las cuotas son anuales o periódicas y si quiere remesas SEPA en fichero (es formato XML pain.008 y conviene acotarlo).

Después:
- `src/js/logica/socios.js` (puro, con tests): numeración, filtros, estado de la cuota.
- `src/js/nucleo/csv.js` (con tests): leer y escribir CSV con `;` y comillas, como lo abre Excel en español.
- Módulo «Socios»: tabla con búsqueda y filtros, ficha, alta y baja (la baja conserva el registro), importar y exportar CSV.
- Cuotas: generar una remesa (año o periodo), marcar pagadas y listado de impagados. Repartir importes con `Dinero.repartir`.

## Mejoras anotadas (no urgentes)

- Guardar en `tools/` una prueba automática con `file://` (Chromium sin interfaz por CDP). Existe un prototipo que funcionó, pero depende de la ruta del navegador.
- Avisar si `navigator.storage.persist()` devuelve `false` (el navegador podría borrar los datos si falta espacio).
