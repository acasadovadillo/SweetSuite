/*
 * Ironrack — Historial: los entrenos terminados, por meses, y el detalle de
 * cada uno con sus series, para repetirlo o borrarlo.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u, A = IR.almacen, esc = U.esc;
  const S = A.S;

  function lista() {
    const ss = S.doc.sesiones;
    if (!ss.length) return `<section class="cabeza"><h1>Historial</h1><p>Tus entrenos terminados, del más reciente al más antiguo.</p></section>
      <p class="vacio">Aquí aparecerán tus entrenos cuando termines el primero.</p>`;
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const esteMes = ss.filter((s) => s.inicio >= inicioMes.getTime());
    let mesActual = "";
    const filas = ss.map((s) => {
      const m = U.mes(s.inicio);
      const cab = m !== mesActual ? `<h2>${esc((mesActual = m))}</h2>` : "";
      const ejs = s.ejercicios;
      return cab + `<a class="tarjeta enlace-tarjeta" href="#historial/${esc(s.id)}">
        <div class="tarjeta-cab"><h3>${esc(s.nombre)}</h3><small class="suave">${esc(U.fecha(s.inicio))}</small></div>
        <ul class="resumen-ej">${ejs.slice(0, 4).map((e) =>
          `<li><span>${U.efectivas(e.series).length} × ${esc(IR.bib.nombre(e.ej))}</span><small>${mejorSerie(e.series)}</small></li>`).join("")}
          ${ejs.length > 4 ? `<li class="suave">y ${ejs.length - 4} más</li>` : ""}</ul>
        <div class="tarjeta-pie suave"><small>⏱ ${U.duracion(s.fin - s.inicio)}</small><small>${U.volumen(U.volSesion(s))}</small></div>
      </a>`;
    }).join("");
    return `<section class="cabeza"><h1>Historial</h1><p>Tus entrenos terminados, del más reciente al más antiguo.</p></section>
      <div class="stats">
        <div class="stat"><b>${esteMes.length}</b><span>este mes</span></div>
        <div class="stat"><b>${U.volumen(esteMes.reduce((t, s) => t + U.volSesion(s), 0))}</b><span>volumen del mes</span></div>
        <div class="stat"><b>${ss.length}</b><span>en total</span></div>
      </div>${filas}`;
  }

  // La serie con más 1RM estimado, que es la que mejor resume el ejercicio
  function mejorSerie(series) {
    let m = null;
    U.efectivas(series).forEach((s) => { if (!m || U.e1rm(s.kg, s.reps) > U.e1rm(m.kg, m.reps)) m = s; });
    return m ? `${U.kg(m.kg)} kg × ${m.reps}` : "";
  }

  function detalle(id) {
    const s = S.doc.sesiones.find((x) => x.id === id);
    if (!s) return '<p class="vacio">Este entreno ya no existe.</p><a class="btn ancho" href="#historial">Volver</a>';
    return `<a class="volver" href="#historial">‹ Historial</a>
      <section class="cabeza"><h1>${esc(s.nombre)}</h1>
        <p class="suave">${esc(U.fechaLarga(s.inicio))} · ${esc(U.hora(s.inicio))}–${esc(U.hora(s.fin))}</p></section>
      <div class="stats">
        <div class="stat"><b>${U.duracion(s.fin - s.inicio)}</b><span>duración</span></div>
        <div class="stat"><b>${U.nSeries(s)}</b><span>series</span></div>
        <div class="stat"><b>${U.volumen(U.volSesion(s))}</b><span>volumen</span></div>
      </div>
      ${s.notas ? `<p class="notas">${esc(s.notas)}</p>` : ""}
      ${s.ejercicios.map((e) => {
        let n = 0;
        return `<article class="ej">
          <header><a class="ej-nombre" href="#progreso/${esc(e.ej)}">${esc(IR.bib.nombre(e.ej))}</a></header>
          <table class="tabla-series"><thead><tr><th>Serie</th><th>Kg</th><th>Reps</th><th>1RM est.</th></tr></thead><tbody>
          ${e.series.map((x) => `<tr class="${x.tipo === "cal" ? "cal" : ""}"><td>${x.tipo === "cal" ? "C" : ++n}</td><td>${U.kg(x.kg)}</td><td>${x.reps}</td>
            <td class="suave">${x.tipo === "cal" ? "" : U.kg(Math.round(U.e1rm(x.kg, x.reps) * 10) / 10)}</td></tr>`).join("")}
          </tbody></table></article>`;
      }).join("")}
      <button class="btn primario ancho" data-a="repetirSesion" data-id="${esc(s.id)}">Repetir este entreno</button>
      <button class="btn ancho" data-a="renombrarSesion" data-id="${esc(s.id)}">Cambiar nombre o notas</button>
      <button class="btn ancho texto-peligro" data-a="borrarSesion" data-id="${esc(s.id)}">Borrar entreno</button>`;
  }

  IR.vistas.historial = { html: (id) => (id ? detalle(id) : lista()) };

  Object.assign(IR.acc, {
    async borrarSesion(el) {
      const s = S.doc.sesiones.find((x) => x.id === el.dataset.id);
      if (!s || !(await IR.ui.confirmar("¿Borrar este entreno?", { detalle: s.nombre + " · " + U.fecha(s.inicio) + ". No se puede deshacer.", si: "Borrar", peligro: true }))) return;
      A.borrar("sesiones", s.id, { render: false, subirYa: true });
      location.hash = "#historial";
    },
    renombrarSesion(el) {
      const s = S.doc.sesiones.find((x) => x.id === el.dataset.id);
      if (!s) return;
      IR.ui.hoja(`<h3>Editar entreno</h3>
        <form class="form" id="f-ses">
          <label>Nombre <input name="nombre" value="${esc(s.nombre)}" maxlength="60" required></label>
          <label>Notas <textarea name="notas" rows="3">${esc(s.notas || "")}</textarea></label>
          <div class="botones"><button type="button" class="btn" data-a="_cerrar">Cancelar</button><button class="btn primario">Guardar</button></div>
        </form>`);
      IR.acc._cerrar = () => IR.ui.cerrarHoja();
      IR.ui.$("#f-ses").addEventListener("submit", (ev) => {
        ev.preventDefault();
        const f = ev.target;
        A.cambiarItem("sesiones", s.id, (x) => { x.nombre = f.nombre.value.trim() || x.nombre; x.notas = f.notas.value.trim(); });
        IR.ui.cerrarHoja();
      });
    },
  });
})();
