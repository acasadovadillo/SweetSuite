// Tests de actividades: aforo, lista de espera, solo socios, cobros, menores,
// paso a tesorería sin duplicar, calendario mensual y archivo .ics.
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/js/logica/actividades.js");
const S = require("../src/js/logica/socios.js");
const T = require("../src/js/logica/tesoreria.js");
const E = require("../src/js/logica/extracto.js");

const actividad = (o) => Object.assign(A.vacia(new Date(2026, 9, 1)), { id: "act1", titulo: "Salida de campo", inicio: "2026-10-10T09:00", fin: "2026-10-10T14:00" }, o);
const socio = (id, nombre, o) => S.completar(Object.assign({ id, numero: 1, nombre, apellidos: "Ejemplo", fechaAlta: "2020-01-01" }, o));
let reloj = 0;
const ahora = () => new Date(Date.UTC(2026, 8, 1, 10, 0, reloj++)).toISOString();

test("inscribir con aforo y lista de espera; al cancelar sube el primero en espera", () => {
  let a = actividad({ aforo: 2, listaEspera: true });
  for (const n of ["Ana", "Bea", "Ciro", "Dani"]) a = A.inscribir(a, { nombre: n, contacto: n + "@example.org" }, { ahora: ahora() }).actividad;
  assert.deepEqual(a.inscripciones.map((i) => i.estado), ["inscrita", "inscrita", "espera", "espera"]);
  assert.equal(A.libres(a), 0);
  const r = A.cancelar(a, a.inscripciones[0].id);
  assert.equal(r.promovida.nombre, "Ciro", "sube el primero que se apuntó a la espera");
  assert.deepEqual(r.actividad.inscripciones.map((i) => i.estado), ["cancelada", "inscrita", "inscrita", "espera"]);
  // Cancelar a alguien en espera no sube a nadie.
  assert.equal(A.cancelar(r.actividad, r.actividad.inscripciones[3].id).promovida, null);
});

test("sin lista de espera, una actividad completa no admite más; sin aforo, no hay límite", () => {
  let a = actividad({ aforo: 1, listaEspera: false });
  a = A.inscribir(a, { nombre: "Ana" }).actividad;
  assert.throws(() => A.inscribir(a, { nombre: "Bea" }), /completa/);
  let libre = actividad({ aforo: 0 });
  for (let k = 0; k < 50; k++) libre = A.inscribir(libre, { nombre: "P" + k }).actividad;
  assert.equal(A.ocupadas(libre), 50);
  assert.equal(A.libres(libre), Infinity);
});

test("solo socios, duplicados, actividad cancelada y precio según sea socio o no", () => {
  const s = socio("s1", "Ana");
  const soloSocios = actividad({ abierta: "socios", precioSocio: 500, precioGeneral: 1000 });
  assert.throws(() => A.inscribir(soloSocios, { nombre: "Externa" }), /solo para socios/);
  const r = A.inscribir(soloSocios, { socio: s });
  assert.equal(r.inscripcion.importe, 500);
  assert.equal(r.inscripcion.contacto, s.email);
  assert.throws(() => A.inscribir(r.actividad, { socio: s }), /ya está inscrito/);
  const abierta = actividad({ precioSocio: 500, precioGeneral: 1000 });
  assert.equal(A.inscribir(abierta, { nombre: "Externa", contacto: "x@example.org" }).inscripcion.importe, 1000);
  assert.throws(() => A.inscribir(actividad({ estado: "cancelada" }), { nombre: "X" }), /cancelada/);
  // Volver a apuntarse después de cancelar sí se puede.
  const c = A.cancelar(r.actividad, r.inscripcion.id).actividad;
  assert.equal(A.inscribir(c, { socio: s }).inscripcion.estado, "inscrita");
});

test("resumen: asistencia, menores sin autorización, cobrado y pendiente", () => {
  const menorSocio = socio("s2", "Leo", { fechaNacimiento: "2015-05-05" });
  let a = actividad({ precioSocio: 300, precioGeneral: 600, autorizacionMenores: true });
  a = A.inscribir(a, { socio: menorSocio }).actividad;                                    // menor (socio), sin autorización
  a = A.inscribir(a, { nombre: "Niña", contacto: "t@example.org", esMenor: true, autorizacion: true }).actividad; // menor con autorización
  a = A.inscribir(a, { nombre: "Adulto", contacto: "a@example.org" }).actividad;
  const [i1, i2, i3] = a.inscripciones;
  a = A.cobrar(a, i3.id, { fecha: "2026-10-01", forma: "Bizum", cuentaId: "banco" });
  a = A.cambiarInscripcion(a, i1.id, { asistio: true });
  a = A.cambiarInscripcion(a, i2.id, { asistio: false });
  const r = A.resumen(a, [menorSocio]);
  assert.deepEqual([r.inscritas, r.asistentes, r.noAsistieron, r.menores, r.menoresSinAutorizacion, r.recaudado, r.pendienteCobro],
    [3, 1, 1, 2, 1, 600, 900]);
  assert.throws(() => A.cobrar(a, i1.id, { fecha: "", forma: "Bizum" }), /fecha/);
  assert.throws(() => A.cobrar(actividad(), "nada", { fecha: "2026-10-01", forma: "Bizum" }), /No existe/);
});

test("las inscripciones cobradas entran en tesorería una sola vez", () => {
  let a = actividad({ precioGeneral: 1500, proyectoId: "p1" });
  a = A.inscribir(a, { nombre: "Marta Ejemplo Prueba", contacto: "m@example.org" }).actividad;
  a = A.inscribir(a, { nombre: "Luis Otro", contacto: "l@example.org" }).actividad;
  const [i1, i2] = a.inscripciones;
  a = A.cobrar(a, i1.id, { fecha: "2026-10-02", forma: "Efectivo", cuentaId: "caja" });
  const cuentas = [{ id: "banco", saldoInicial: 0 }, { id: "caja", saldoInicial: 0 }];
  // Cobrada en efectivo: cuenta como ingreso virtual de «Inscripciones», con su proyecto y actividad.
  const l = T.libro([], [], [a]);
  assert.deepEqual(l.map((m) => [m.id, m.importe, m.cuentaId, m.categoriaId, m.proyectoId, m.actividadId]),
    [["inscripcion:act1:" + i1.id, 1500, "caja", "inscripciones", "p1", "act1"]]);
  assert.equal(T.saldos(cuentas, [], [], undefined, [a]).porCuenta.caja, 1500);
  // La otra llega por el banco: el extracto la sugiere y al conciliar ya no se cuenta dos veces.
  const mov = { id: "m1", fecha: "2026-10-05", cuentaId: "banco", tipo: "ingreso", importe: 1500, conceptoBanco: "TRANSF LUIS OTRO SALIDA" };
  const sug = E.sugerencias(mov, { cuotas: [], facturas: [], actividades: [a] });
  assert.deepEqual(sug.map((x) => [x.tipo, x.id]), [["inscripcion", "act1:" + i2.id]]);
  const con = T.conciliarInscripciones(mov, [{ actividadId: "act1", inscripcionId: i2.id }], [a]);
  assert.equal(con.diferencia, 0);
  assert.equal(con.movimiento.categoriaId, "inscripciones");
  assert.equal(con.movimiento.actividadId, "act1");
  const a2 = con.actividades[0];
  assert.equal(a2.inscripciones[1].pago.cuentaId, "banco");
  const s = T.saldos(cuentas, [con.movimiento], [], undefined, [a2]);
  assert.deepEqual(s.porCuenta, { banco: 1500, caja: 1500 });
  // Balance de la actividad: 30 € de ingresos y un gasto de anticipo de 12 € enlazado.
  const anticipos = [{ id: "x", gastos: [{ fecha: "2026-10-10", importe: 1200, categoriaId: "actividades", actividadId: "act1" }] }];
  const b = A.balance("act1", T.partidas([con.movimiento], [], anticipos, [a2]));
  assert.deepEqual([b.ingresos, b.gastos, b.resultado], [3000, 1200, 1800]);
});

test("duplicar y calendario del mes (lunes primero, actividades de varios días)", () => {
  const d = A.duplicar(Object.assign(actividad({ estado: "realizada" }), { creado: "x", inscripciones: [{ id: "i" }] }));
  assert.deepEqual([d.id, d.inscripciones.length, d.estado, d.titulo], [undefined, 0, "prevista", "Salida de campo (copia)"]);
  const acts = [actividad({ id: "a", inicio: "2026-10-01T18:00" }), actividad({ id: "b", inicio: "2026-10-30T10:00", fin: "2026-11-01T12:00" })];
  const semanas = A.mes(acts, 2026, 10);
  assert.equal(semanas[0][0].fecha, "2026-09-28", "octubre de 2026 empieza en jueves: la primera fila arranca el lunes 28");
  assert.equal(semanas[0][3].actividades[0].id, "a");
  const ultima = semanas[semanas.length - 1];
  assert.deepEqual(ultima.map((d2) => d2.actividades.length), [0, 0, 0, 0, 1, 1, 1]);
  assert.equal(semanas.length, 5);
});

test(".ics: escapado, plegado a 75 octetos, todo el día, zona horaria y cancelada", () => {
  const txt = A.ics([
    actividad({ id: "a1", titulo: "Charla: aves, insectos; y más", lugar: "Centro cívico, sala 2", descripcion: "Línea 1\nLínea 2" }),
    actividad({ id: "a2", titulo: "Jornada", todoElDia: true, inicio: "2026-10-12T00:00", fin: "2026-10-13T00:00", estado: "cancelada" }),
    actividad({ id: "a3", titulo: "Ñandú ".repeat(20) }),
  ], { nombreCalendario: "Asociación", ahora: new Date(Date.UTC(2026, 9, 1, 8, 0, 0)) });
  const lineas = txt.split("\r\n");
  assert.equal(lineas[0], "BEGIN:VCALENDAR");
  assert.ok(txt.endsWith("END:VCALENDAR\r\n"));
  assert.ok(lineas.includes("SUMMARY:Charla: aves\\, insectos\\; y más"));
  assert.ok(lineas.includes("LOCATION:Centro cívico\\, sala 2"));
  assert.ok(lineas.includes("DESCRIPTION:Línea 1\\nLínea 2"));
  assert.ok(lineas.includes("DTSTART;TZID=Europe/Madrid:20261010T090000"));
  assert.ok(lineas.includes("DTEND;TZID=Europe/Madrid:20261010T140000"));
  assert.ok(lineas.includes("BEGIN:VTIMEZONE"));
  assert.ok(lineas.includes("DTSTART;VALUE=DATE:20261012"));
  assert.ok(lineas.includes("DTEND;VALUE=DATE:20261014"), "DTEND de un día completo es el día siguiente al último");
  assert.ok(lineas.includes("STATUS:CANCELLED"));
  assert.ok(lineas.includes("DTSTAMP:20261001T080000Z"));
  assert.ok(lineas.includes("UID:a1@agora.sweetsuite"));
  // Ninguna línea pasa de 75 octetos y las de continuación empiezan con un espacio.
  for (const l of lineas) assert.ok(Buffer.byteLength(l, "utf8") <= 75, l);
  const desplegado = txt.replace(/\r\n /g, "");
  assert.ok(desplegado.includes("SUMMARY:" + "Ñandú ".repeat(20).trim() + " "), "al desplegar se recupera el texto entero");
  assert.equal(A.ics([], { zona: "Atlantic/Canary" }).includes("VTIMEZONE"), false);
  assert.ok(A.ics([actividad()], { zona: "Atlantic/Canary" }).includes("TZOFFSETFROM:+0000"));
});
