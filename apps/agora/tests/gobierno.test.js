// Tests de actas, obligaciones y subvenciones.
const test = require("node:test");
const assert = require("node:assert/strict");
const Ac = require("../src/js/logica/actas.js");
const O = require("../src/js/logica/obligaciones.js");

const [junta, coord, asamblea] = Ac.organosPorDefecto();

test("plantillas del orden del día según el órgano", () => {
  assert.match(Ac.plantilla(asamblea, "ordinaria").map((p) => p.titulo).join("|"), /cuentas.*presupuesto/);
  assert.match(Ac.plantilla(asamblea, "extraordinaria")[1].titulo, /extraordinaria/);
  assert.match(Ac.plantilla(junta).map((p) => p.titulo).join("|"), /tesorería/);
  assert.ok(Ac.plantilla(coord).length > 0);
  assert.ok(Ac.plantilla({ tipo: "departamento" }).length > 0);
  const p = Ac.plantilla(junta);
  assert.notEqual(p[0].id, p[1].id);
});

test("numeración por órgano: anual o correlativa", () => {
  const actas = [
    { organoId: "junta", numero: "JD-2026-01" }, { organoId: "junta", numero: "JD-2026-03" }, { organoId: "junta", numero: "JD-2025-07" },
    { organoId: "asamblea", numero: "AG-2026-01" }, { organoId: "junta", numero: "" }, { organoId: "junta", numero: "JD-12" },
  ];
  assert.equal(Ac.siguienteNumero(actas, junta, 2026, "anual"), "JD-2026-04");
  assert.equal(Ac.siguienteNumero(actas, junta, 2027, "anual"), "JD-2027-01");
  assert.equal(Ac.siguienteNumero(actas, asamblea, 2026), "AG-2026-02");
  assert.equal(Ac.siguienteNumero(actas, junta, 2026, "correlativa"), "JD-13");
  assert.equal(Ac.siguienteNumero([], { id: "dep", prefijo: "dact" }, 2026, "anual"), "DACT-2026-01");
});

test("revisar un acta y textos de votación", () => {
  const a = Ac.vacia(junta, new Date(2026, 9, 1));
  assert.deepEqual(Ac.revisar(a).length, 2, "faltan presidencia y secretaría");
  a.presidencia = "Lucía"; a.secretaria = "Carmen";
  assert.deepEqual(Ac.revisar(a), []);
  assert.equal(Ac.textoVotacion({ votacion: "unanimidad" }), "Aprobado por unanimidad");
  assert.equal(Ac.textoVotacion({ votacion: "votacion", resultado: "aprobado", favor: 10, contra: 2, abstencion: 1 }), "Aprobado: 10 a favor, 2 en contra y 1 abstención");
  assert.equal(Ac.textoVotacion({ votacion: "votacion", resultado: "rechazado", favor: 3, contra: 5, abstencion: 0 }), "Rechazado: 3 a favor, 5 en contra y 0 abstenciones");
  assert.equal(Ac.textoVotacion({}), "");
});

test("libro de acuerdos y texto del acta", () => {
  const a = Object.assign(Ac.vacia(asamblea, new Date(2026, 5, 20)), { id: "a1", numero: "AG-2026-01", presidencia: "Lucía", secretaria: "Carmen",
    lugar: "Local", asistentes: [{ nombre: "Ana" }, { nombre: "Bea", cargo: "Tesorería" }] });
  a.ordenDelDia[2].acuerdos = [{ texto: "Aprobar las cuentas de 2025", votacion: "unanimidad", resultado: "aprobado" }, { texto: "  " }];
  const b = { id: "a2", numero: "JD-2026-05", fecha: "2026-09-01", organoId: "junta", ordenDelDia: [{ titulo: "X", acuerdos: [{ texto: "Comprar prismáticos" }] }] };
  const l = Ac.acuerdos([a, b], Ac.organosPorDefecto());
  assert.deepEqual(l.map((x) => [x.numero, x.organo, x.texto, x.votacion]), [["JD-2026-05", "Junta Directiva", "Comprar prismáticos", ""],
    ["AG-2026-01", "Asamblea General", "Aprobar las cuentas de 2025", "Aprobado por unanimidad"]]);
  const t = Ac.textoPlano(a, asamblea, { nombre: "Asociación Ejemplo" });
  assert.match(t, /ACTA N\.º AG-2026-01 DE LA REUNIÓN ORDINARIA DE ASAMBLEA GENERAL/);
  assert.match(t, /20 de junio de 2026/);
  assert.match(t, /Asistentes \(2\): Ana, Bea \(Tesorería\)/);
  assert.match(t, /Acuerdo 3\.1: Aprobar las cuentas de 2025 \(Aprobado por unanimidad\)/);
  assert.ok(!/Acuerdo 3\.2/.test(t), "los acuerdos vacíos no salen");
});

test("obligaciones: vencimientos anuales y únicos con su situación", () => {
  const iva = Object.assign(O.desdePlantilla(O.PLANTILLAS.find((p) => p.plantilla === "303")), { id: "iva", desde: "2026-01-01" });
  const seguro = Object.assign(O.vacia(), { id: "seg", titulo: "Seguro", recurrencia: "anual", vencimientos: [{ mes: 2, dia: 29, etiqueta: "" }], diasAviso: 30, desde: "2026-01-01" });
  const cargos = Object.assign(O.vacia(), { id: "car", titulo: "Cargos", recurrencia: "unica", fecha: "2026-11-01" });
  const off = Object.assign(O.vacia(), { id: "off", titulo: "Desactivada", activa: false });
  const oc = O.ocurrencias([iva, seguro, cargos, off], "2026-01-01", "2026-12-31", "2026-10-05");
  assert.deepEqual(oc.map((x) => [x.fecha, x.titulo.slice(0, 6), x.estado]), [
    ["2026-01-30", "IVA tr", "vencida"], ["2026-02-28", "Seguro", "vencida"], ["2026-04-20", "IVA tr", "vencida"],
    ["2026-07-20", "IVA tr", "vencida"], ["2026-10-20", "IVA tr", "proxima"], ["2026-11-01", "Cargos", "pendiente"]]);
  assert.equal(O.fechaEn(2028, 2, 29), "2028-02-29");
  const hecha = O.marcarHecha(iva, "2026-07-20", true, "Presentado", new Date(2026, 6, 15));
  assert.equal(iva.hechas["2026-07-20"], undefined, "no modifica la original");
  const oc2 = O.ocurrencias([hecha], "2026-07-01", "2026-07-31", "2026-10-05");
  assert.deepEqual([oc2[0].estado, oc2[0].hecha.nota, oc2[0].hecha.fecha], ["hecha", "Presentado", "2026-07-15"]);
  assert.equal(O.ocurrencias([O.marcarHecha(hecha, "2026-07-20", false)], "2026-07-01", "2026-07-31", "2026-10-05")[0].estado, "vencida");
  assert.ok(O.PLANTILLAS.every((p) => O.CATEGORIAS.includes(p.categoria)));
});

test("subvenciones: plazos según su estado y documentos", () => {
  const ps = [
    { id: "s1", nombre: "Sub A", tipo: "subvencion", estadoSubvencion: "preparando", plazoSolicitud: "2026-10-20", plazoJustificacion: "2027-03-01" },
    { id: "s2", nombre: "Sub B", tipo: "subvencion", estadoSubvencion: "concedida", plazoSolicitud: "2026-01-10", plazoJustificacion: "2026-12-15",
      requisitos: [{ texto: "Memoria", hecho: true }, { texto: "Facturas", hecho: false }] },
    { id: "s3", nombre: "Sub C", tipo: "subvencion", estadoSubvencion: "justificada", plazoJustificacion: "2026-11-01" },
    { id: "p", nombre: "Proyecto", tipo: "proyecto", plazoSolicitud: "2026-10-10" },
  ];
  const oc = O.ocurrenciasSubvenciones(ps, "2026-01-01", "2027-12-31", "2026-10-05");
  assert.deepEqual(oc.map((x) => [x.proyectoId, x.fecha, x.estado]), [["s1", "2026-10-20", "proxima"], ["s2", "2026-12-15", "pendiente"]]);
  assert.deepEqual(O.progresoRequisitos(ps[1]), { hechos: 1, total: 2 });
});

test("una obligación añadida hoy no arrastra plazos de años anteriores", () => {
  const iva = Object.assign(O.desdePlantilla(O.PLANTILLAS.find((p) => p.plantilla === "303"), new Date(2026, 9, 5)), { id: "iva" });
  assert.equal(iva.desde, "2026-10-05");
  const oc = O.ocurrencias([iva], "2025-01-01", "2027-02-28", "2026-10-05");
  assert.deepEqual(oc.map((x) => [x.fecha, x.estado]), [["2026-10-20", "proxima"], ["2027-01-30", "pendiente"]]);
  // Sin «desde» (datos antiguos) se usa la fecha de creación.
  const viejo = Object.assign({}, iva, { desde: undefined, creado: "2026-07-01T10:00:00Z" });
  assert.equal(O.ocurrencias([viejo], "2025-01-01", "2026-12-31", "2026-10-05")[0].fecha, "2026-07-20");
});
