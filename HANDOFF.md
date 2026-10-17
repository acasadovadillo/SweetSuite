# HANDOFF.md — Estado actual

*Última actualización: 2026-10-05 · Fase 6 (Informes) terminada, **sin commit**; pendiente del OK del usuario.*

El proyecto está en `~/ACV/PROYECTOS/IA/ABIES/webkit_asociaciones`. Versión 0.6.0.

## Commits

`6622e1f` Fase 1 · `a952c19` Fase 2 · `f31c56c` Fase 3 · `fd58330` Fase 4 · `5119f6a` Fase 5: actas, obligaciones, subvenciones y documentos.

## Fase 6: informes

El usuario pidió «todo» en las tres preguntas (memoria, cuentas y panel).

- **Esquema v7:** `config.memorias[año] = { presentacion, fines, valoracion }`. Migración 6→7 con test.
- **Lógica con tests (`logica/informes.js`):**
  - `memoria(c, año)`:
    - junta a 31/12 y sus cambios;
    - socios: a 1/1, a 31/12, altas, bajas, por tipo, sexo y tramo de edad;
    - actividades con inscritos, asistentes, menores y personas distintas;
    - proyectos con gasto previsto y realizado;
    - reuniones por órgano y acuerdos en orden.
  - `pendientesEn(c, fecha)`: cuotas, inscripciones, facturas emitidas y recibidas, anticipos y reembolsos, e IVA a compensar, según los cobros y pagos hasta esa fecha.
  - `cuentas(c, año)`:
    - resultados frente al año anterior;
    - saldos a 1/1 y 31/12;
    - ejecución del presupuesto;
    - pendientes;
    - estado de situación simplificado;
    - `cuentaEsfl` (partidas del modelo abreviado; `PARTIDA_POR_DEFECTO` y `categoria.partida`).
  - `panel(c, hoy)`: saldo, año en curso, presupuesto, socios, cuotas y deuda, subvenciones en marcha, y series de 12 fines de mes.
- **Módulo Informes (`#/informes`, `#/informes/cuentas`):**
  - selector de ejercicio (desde el primer año con datos);
  - textos editables de la memoria;
  - documento imprimible (fondo blanco, estilos de impresión);
  - aviso de «ejercicio en curso»;
  - nota cuando la variación del saldo no coincide con el resultado (anticipos y reembolsos);
  - avisos «verificar con asesoría» en las cuentas y en el modelo ESFL;
  - firmas;
  - botón de Excel (el de Tesorería).
- **Tesorería → Ajustes:** cada categoría tiene «Partida en el informe de cuentas» (Automática o una del modelo).
- **Inicio rehecho como panel:**
  - Para empezar (si falta algo);
  - Agenda: plazos, próximas actividades y subvenciones en marcha;
  - Dinero: saldo por cuenta, el año, barras de presupuesto y gráfica del saldo;
  - Socios y cuotas: activos, altas y bajas, barra de cuotas cobradas, deuda y gráfica de socios;
  - La asociación: copia, junta e informes.
- **`nucleo/graficas.js`:** líneas y barras en SVG, sin librerías, con texto alternativo y tabla oculta para lectores de pantalla.
- **Demostración:** textos de la memoria de 2026.

## Verificado

- `npm test`: 113 tests en verde (nuevo `tests/informes.test.js`):
  - invariantes de socios;
  - Δsaldo = libro del año;
  - excedente ESFL = resultado;
  - pendientes a una fecha;
  - series del panel;
  - orden de acuerdos.
- `npm run probar-file` (Brave, `file://`) en verde, con una comprobación nueva: Inicio (con gráfica) e Informes (con documento) se pintan.
- En el navegador, con la demostración:
  - panel completo;
  - memoria 2026 y 2025;
  - guardar textos (se escapan);
  - cuentas: el cambio de partida de una categoría se refleja en el modelo ESFL;
  - selector de años.
- **Móvil (375 px):** Inicio, Informes, Cuentas, Tesorería y Ajustes sin desbordar.
- **Fallos encontrados y corregidos:**
  - eje repetido en la gráfica de socios;
  - acuerdos de una misma acta en orden inverso;
  - selector de año que no ofrecía años con solo cuotas;
  - «Sin clasificar» ambiguo (ahora dice ingresos o gastos).

## Pendiente (decisión del usuario)

- **Convocatorias de asamblea:** sin definir todavía (antelación, primera y segunda convocatoria, envío).

## Sin verificar

- Safari y Firefox; impresión real (memoria, cuentas, actas, facturas, hoja de asistencia); el .ics en un calendario real; el Excel en Excel o LibreOffice.
- Adjuntos grandes (varios MB) en móviles: el límite de espacio depende del navegador.
