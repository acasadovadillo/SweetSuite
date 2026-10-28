/*
 * Ironrack — Biblioteca de ejercicios.
 *
 * El catálogo vive en el código: no es un dato personal y así llega a todos
 * los dispositivos con la app. Los ejercicios que crea cada uno van en su
 * documento cifrado (doc.ejercicios) y se suman a estos.
 *
 * Los id del catálogo no deben cambiar nunca: las sesiones guardadas apuntan a
 * ellos. Renombrar un ejercicio es cambiar su nombre, no su id.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});

  const GRUPOS = ["Pecho", "Espalda", "Hombros", "Bíceps", "Tríceps", "Cuádriceps", "Femoral", "Glúteo", "Gemelo", "Core", "Antebrazo", "Otros"];
  const EQUIPOS = ["Barra", "Mancuernas", "Máquina", "Polea", "Peso corporal", "Kettlebell", "Barra Z", "Banda", "Otro"];

  const e = (id, nombre, grupo, equipo) => ({ id, nombre, grupo, equipo });
  const CATALOGO = [
    // Pecho
    e("press-banca", "Press de banca", "Pecho", "Barra"),
    e("press-banca-inclinado", "Press inclinado con barra", "Pecho", "Barra"),
    e("press-banca-declinado", "Press declinado con barra", "Pecho", "Barra"),
    e("press-mancuernas", "Press con mancuernas", "Pecho", "Mancuernas"),
    e("press-inclinado-mancuernas", "Press inclinado con mancuernas", "Pecho", "Mancuernas"),
    e("aperturas-mancuernas", "Aperturas con mancuernas", "Pecho", "Mancuernas"),
    e("cruce-poleas", "Cruce de poleas", "Pecho", "Polea"),
    e("press-pecho-maquina", "Press de pecho en máquina", "Pecho", "Máquina"),
    e("pec-deck", "Contractor de pecho (pec deck)", "Pecho", "Máquina"),
    e("fondos-pecho", "Fondos en paralelas", "Pecho", "Peso corporal"),
    e("flexiones", "Flexiones", "Pecho", "Peso corporal"),
    // Espalda
    e("peso-muerto", "Peso muerto", "Espalda", "Barra"),
    e("dominadas", "Dominadas", "Espalda", "Peso corporal"),
    e("dominadas-supinas", "Dominadas supinas", "Espalda", "Peso corporal"),
    e("jalon-pecho", "Jalón al pecho", "Espalda", "Polea"),
    e("jalon-agarre-estrecho", "Jalón con agarre estrecho", "Espalda", "Polea"),
    e("remo-barra", "Remo con barra", "Espalda", "Barra"),
    e("remo-pendlay", "Remo Pendlay", "Espalda", "Barra"),
    e("remo-mancuerna", "Remo con mancuerna", "Espalda", "Mancuernas"),
    e("remo-polea-baja", "Remo en polea baja", "Espalda", "Polea"),
    e("remo-maquina", "Remo en máquina", "Espalda", "Máquina"),
    e("remo-t", "Remo en T", "Espalda", "Barra"),
    e("pullover-polea", "Pullover en polea", "Espalda", "Polea"),
    e("hiperextensiones", "Hiperextensiones", "Espalda", "Peso corporal"),
    e("encogimientos", "Encogimientos", "Espalda", "Mancuernas"),
    // Hombros
    e("press-militar", "Press militar", "Hombros", "Barra"),
    e("press-hombro-mancuernas", "Press de hombro con mancuernas", "Hombros", "Mancuernas"),
    e("press-arnold", "Press Arnold", "Hombros", "Mancuernas"),
    e("press-hombro-maquina", "Press de hombro en máquina", "Hombros", "Máquina"),
    e("elevaciones-laterales", "Elevaciones laterales", "Hombros", "Mancuernas"),
    e("elevaciones-laterales-polea", "Elevaciones laterales en polea", "Hombros", "Polea"),
    e("elevaciones-frontales", "Elevaciones frontales", "Hombros", "Mancuernas"),
    e("pajaros", "Pájaros (deltoides posterior)", "Hombros", "Mancuernas"),
    e("face-pull", "Face pull", "Hombros", "Polea"),
    e("remo-al-menton", "Remo al mentón", "Hombros", "Barra"),
    // Bíceps
    e("curl-barra", "Curl con barra", "Bíceps", "Barra"),
    e("curl-barra-z", "Curl con barra Z", "Bíceps", "Barra Z"),
    e("curl-mancuernas", "Curl con mancuernas", "Bíceps", "Mancuernas"),
    e("curl-martillo", "Curl martillo", "Bíceps", "Mancuernas"),
    e("curl-predicador", "Curl predicador", "Bíceps", "Barra Z"),
    e("curl-inclinado", "Curl inclinado con mancuernas", "Bíceps", "Mancuernas"),
    e("curl-polea", "Curl en polea", "Bíceps", "Polea"),
    e("curl-concentrado", "Curl concentrado", "Bíceps", "Mancuernas"),
    // Tríceps
    e("press-frances", "Press francés", "Tríceps", "Barra Z"),
    e("extension-polea", "Extensión de tríceps en polea", "Tríceps", "Polea"),
    e("extension-cuerda", "Extensión con cuerda", "Tríceps", "Polea"),
    e("extension-tras-nuca", "Extensión tras nuca", "Tríceps", "Mancuernas"),
    e("press-cerrado", "Press de banca agarre cerrado", "Tríceps", "Barra"),
    e("fondos-banco", "Fondos en banco", "Tríceps", "Peso corporal"),
    e("patada-triceps", "Patada de tríceps", "Tríceps", "Mancuernas"),
    // Cuádriceps
    e("sentadilla", "Sentadilla", "Cuádriceps", "Barra"),
    e("sentadilla-frontal", "Sentadilla frontal", "Cuádriceps", "Barra"),
    e("sentadilla-goblet", "Sentadilla goblet", "Cuádriceps", "Kettlebell"),
    e("sentadilla-hack", "Sentadilla hack", "Cuádriceps", "Máquina"),
    e("sentadilla-bulgara", "Sentadilla búlgara", "Cuádriceps", "Mancuernas"),
    e("prensa", "Prensa de piernas", "Cuádriceps", "Máquina"),
    e("extension-cuadriceps", "Extensión de cuádriceps", "Cuádriceps", "Máquina"),
    e("zancadas", "Zancadas", "Cuádriceps", "Mancuernas"),
    e("subidas-cajon", "Subidas al cajón", "Cuádriceps", "Mancuernas"),
    // Femoral
    e("peso-muerto-rumano", "Peso muerto rumano", "Femoral", "Barra"),
    e("peso-muerto-piernas-rigidas", "Peso muerto piernas rígidas", "Femoral", "Barra"),
    e("curl-femoral-tumbado", "Curl femoral tumbado", "Femoral", "Máquina"),
    e("curl-femoral-sentado", "Curl femoral sentado", "Femoral", "Máquina"),
    e("buenos-dias", "Buenos días", "Femoral", "Barra"),
    // Glúteo
    e("hip-thrust", "Hip thrust", "Glúteo", "Barra"),
    e("puente-gluteo", "Puente de glúteo", "Glúteo", "Peso corporal"),
    e("patada-gluteo-polea", "Patada de glúteo en polea", "Glúteo", "Polea"),
    e("abductores", "Abductores en máquina", "Glúteo", "Máquina"),
    e("aductores", "Aductores en máquina", "Glúteo", "Máquina"),
    // Gemelo
    e("gemelo-de-pie", "Elevación de gemelos de pie", "Gemelo", "Máquina"),
    e("gemelo-sentado", "Elevación de gemelos sentado", "Gemelo", "Máquina"),
    e("gemelo-prensa", "Gemelos en prensa", "Gemelo", "Máquina"),
    // Core
    e("plancha", "Plancha (segundos en reps)", "Core", "Peso corporal"),
    e("crunch", "Crunch abdominal", "Core", "Peso corporal"),
    e("crunch-polea", "Crunch en polea", "Core", "Polea"),
    e("elevacion-piernas", "Elevación de piernas colgado", "Core", "Peso corporal"),
    e("rueda-abdominal", "Rueda abdominal", "Core", "Otro"),
    e("russian-twist", "Russian twist", "Core", "Peso corporal"),
    e("pallof", "Press Pallof", "Core", "Polea"),
    // Antebrazo
    e("curl-muneca", "Curl de muñeca", "Antebrazo", "Barra"),
    e("paseo-granjero", "Paseo del granjero", "Antebrazo", "Mancuernas"),
    // Otros
    e("swing-kettlebell", "Swing con kettlebell", "Otros", "Kettlebell"),
    e("cargada", "Cargada de potencia", "Otros", "Barra"),
    e("thruster", "Thruster", "Otros", "Barra"),
  ];
  const porId = new Map(CATALOGO.map((x) => [x.id, x]));

  // Todos: catálogo + propios del usuario (los propios primero dentro de su grupo)
  function todos() {
    const doc = IR.almacen.S.doc;
    const propios = ((doc && doc.ejercicios) || []).map((x) => Object.assign({ propio: true }, x));
    return propios.concat(CATALOGO);
  }

  // Un ejercicio por id. Si se borró uno propio que aún sale en sesiones viejas,
  // se devuelve un sustituto para no romper el historial.
  function ejercicio(id) {
    const doc = IR.almacen.S.doc;
    const p = doc && doc.ejercicios.find((x) => x.id === id);
    if (p) return Object.assign({ propio: true }, p);
    return porId.get(id) || { id, nombre: "Ejercicio borrado", grupo: "Otros", equipo: "Otro", borrado: true };
  }
  const nombre = (id) => ejercicio(id).nombre;

  // Buscar sin que importen tildes ni mayúsculas
  const plano = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function buscar(texto, grupo) {
    const q = plano(texto).trim();
    return todos().filter((x) =>
      (!grupo || x.grupo === grupo) &&
      (!q || plano(x.nombre + " " + x.grupo + " " + x.equipo).includes(q)));
  }

  IR.bib = { GRUPOS, EQUIPOS, CATALOGO, todos, ejercicio, nombre, buscar };
})();
