/*
 * Ironrack — Rutinas: plantillas de entreno con sus ejercicios, cuántas series
 * y el objetivo de repeticiones y kilos. Empezar una rutina crea la sesión con
 * todo eso ya puesto; editarla no cambia los entrenos que ya hiciste con ella.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u, A = IR.almacen, esc = U.esc;
  const S = A.S;

  function lista() {
    const rs = S.doc.rutinas;
    return `<section class="cabeza"><h1>Rutinas</h1><p>Plantillas con tus ejercicios, series y objetivos para empezar con todo ya puesto.</p></section>
      <button class="btn primario ancho" data-a="nuevaRutina">+ Nueva rutina</button>
      ${rs.length ? rs.map((r) => `<article class="tarjeta">
          <a class="tarjeta-cab enlace-tarjeta" href="#rutinas/${esc(r.id)}"><h3>${esc(r.nombre)}</h3><span class="suave">${r.ejercicios.length} ejercicios ›</span></a>
          <ul class="resumen-ej">${r.ejercicios.map((x) => `<li><span>${esc(IR.bib.nombre(x.ej))}</span><small>${x.series} × ${x.reps || "–"}${x.kg ? " · " + U.kg(x.kg) + " kg" : ""}</small></li>`).join("")}</ul>
          <div class="tarjeta-pie"><span></span><button class="btn primario" data-a="empezarRutina" data-id="${esc(r.id)}" ${r.ejercicios.length ? "" : "disabled"}>Empezar</button></div>
        </article>`).join("")
        : '<p class="vacio">Aún no tienes rutinas. Crea una, o guarda como rutina un entreno al terminarlo.</p>'}`;
  }

  function editor(id) {
    const r = S.doc.rutinas.find((x) => x.id === id);
    if (!r) return '<p class="vacio">Esta rutina ya no existe.</p><a class="btn ancho" href="#rutinas">Volver</a>';
    return `<a class="volver" href="#rutinas">‹ Rutinas</a>
      <input class="titulo-sesion" value="${esc(r.nombre)}" data-on="nombreRutina" data-id="${esc(r.id)}" maxlength="60" aria-label="Nombre de la rutina">
      ${r.ejercicios.map((x, i) => `<article class="ej editor-ej">
        <header><span class="ej-nombre">${esc(IR.bib.nombre(x.ej))}</span>
          <span class="acciones-ej">
            <button class="icono" data-a="moverEjRutina" data-id="${esc(r.id)}" data-i="${i}" data-d="-1" ${i ? "" : "disabled"} aria-label="Subir">↑</button>
            <button class="icono" data-a="moverEjRutina" data-id="${esc(r.id)}" data-i="${i}" data-d="1" ${i < r.ejercicios.length - 1 ? "" : "disabled"} aria-label="Bajar">↓</button>
            <button class="icono" data-a="quitarEjRutina" data-id="${esc(r.id)}" data-i="${i}" aria-label="Quitar">✕</button>
          </span></header>
        <div class="objetivos">
          <div class="campo"><span>Series</span>
            <div class="paso">
              <button class="icono" data-a="seriesRutina" data-id="${esc(r.id)}" data-i="${i}" data-d="-1" aria-label="Menos series">−</button>
              <b>${x.series}</b>
              <button class="icono" data-a="seriesRutina" data-id="${esc(r.id)}" data-i="${i}" data-d="1" aria-label="Más series">+</button>
            </div></div>
          <label class="campo"><span>Reps</span><input inputmode="numeric" value="${x.reps != null ? x.reps : ""}" placeholder="–" data-on="objRutina" data-id="${esc(r.id)}" data-i="${i}" data-campo="reps"></label>
          <label class="campo"><span>Kg</span><input inputmode="decimal" value="${x.kg != null ? esc(String(x.kg).replace(".", ",")) : ""}" placeholder="–" data-on="objRutina" data-id="${esc(r.id)}" data-i="${i}" data-campo="kg"></label>
        </div>
      </article>`).join("") || '<p class="vacio">Añade los ejercicios de esta rutina.</p>'}
      <button class="btn ancho" data-a="anadirEjRutina" data-id="${esc(r.id)}">+ Añadir ejercicios</button>
      <button class="btn primario ancho" data-a="empezarRutina" data-id="${esc(r.id)}" ${r.ejercicios.length ? "" : "disabled"}>Empezar ahora</button>
      <button class="btn ancho texto-peligro" data-a="borrarRutina" data-id="${esc(r.id)}">Borrar rutina</button>`;
  }

  IR.vistas.rutinas = { html: (id) => (id ? editor(id) : lista()) };

  function crear(nombre, ejercicios) {
    const r = { id: U.uid(), nombre, ejercicios: ejercicios || [] };
    A.anadir("rutinas", r, { render: false });
    location.hash = "#rutinas/" + r.id;
    return r;
  }

  // Del entreno recién hecho a una rutina: mismas series, y como objetivo lo
  // que se hizo en la última serie efectiva de cada ejercicio.
  function desdeSesion(ses) {
    const ejercicios = ses.ejercicios.map((e) => {
      const ef = U.efectivas(e.series);
      const ult = ef[ef.length - 1] || e.series[e.series.length - 1];
      return { ej: e.ej, series: Math.max(1, ef.length), reps: ult ? ult.reps : null, kg: ult ? ult.kg : null };
    });
    crear(ses.nombre, ejercicios);
    IR.ui.aviso("Rutina creada");
  }

  const conRutina = (el, fn, opc) => A.cambiarItem("rutinas", el.dataset.id, fn, opc);

  Object.assign(IR.acc, {
    nuevaRutina: () => crear("Nueva rutina"),
    nombreRutina: (el) => conRutina(el, (r) => { r.nombre = el.value; }, { render: false }),
    objRutina(el) {
      let v = U.num(el.value);
      if (v != null && el.dataset.campo === "reps") v = Math.round(v);
      conRutina(el, (r) => { r.ejercicios[+el.dataset.i][el.dataset.campo] = v; }, { render: false });
    },
    seriesRutina: (el) => conRutina(el, (r) => {
      const x = r.ejercicios[+el.dataset.i];
      x.series = Math.min(20, Math.max(1, (x.series || 1) + +el.dataset.d));
    }),
    moverEjRutina: (el) => conRutina(el, (r) => {
      const i = +el.dataset.i, [x] = r.ejercicios.splice(i, 1);
      r.ejercicios.splice(i + +el.dataset.d, 0, x);
    }),
    quitarEjRutina: (el) => conRutina(el, (r) => { r.ejercicios.splice(+el.dataset.i, 1); }),
    async anadirEjRutina(el) {
      const id = el.dataset.id;
      const ids = await IR.ui.elegirEjercicios();
      if (ids.length) A.cambiarItem("rutinas", id, (r) => { r.ejercicios.push(...ids.map((ej) => ({ ej, series: 3, reps: 10, kg: null }))); });
    },
    async borrarRutina(el) {
      const r = S.doc.rutinas.find((x) => x.id === el.dataset.id);
      if (!r || !(await IR.ui.confirmar("¿Borrar «" + r.nombre + "»?", { detalle: "Los entrenos que hiciste con ella se quedan en el historial.", si: "Borrar", peligro: true }))) return;
      A.borrar("rutinas", r.id, { render: false });
      location.hash = "#rutinas";
    },
  });

  IR.rutinas = { crear, desdeSesion };
})();
