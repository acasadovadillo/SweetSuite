/*
 * Ironrack — Biblioteca de ejercicios: buscar, filtrar por grupo muscular y
 * crear los propios. Tocar uno lleva a su progreso.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u, A = IR.almacen, esc = U.esc;

  // El filtro se queda mientras dura la sesión de la app
  let texto = "", grupo = "";

  function filas() {
    const usados = new Map(IR.analisis.usados().map((x) => [x.id, x]));
    const xs = IR.bib.buscar(texto, grupo);
    if (!xs.length) return `<p class="vacio">Nada con «${esc(texto)}».</p>`;
    let g = "";
    return xs.slice().sort((a, b) => IR.bib.GRUPOS.indexOf(a.grupo) - IR.bib.GRUPOS.indexOf(b.grupo)).map((x) => {
      const cab = !grupo && x.grupo !== g ? `<h2>${esc((g = x.grupo))}</h2>` : "";
      const u = usados.get(x.id);
      return cab + `<a class="fila-ej" href="#progreso/${esc(x.id)}">
        <span><b>${esc(x.nombre)}</b><small>${esc(x.equipo)}${x.propio ? " · propio" : ""}</small></span>
        <span class="dato">${u ? u.sesiones : ""}<small>${u ? (u.sesiones === 1 ? "sesión" : "sesiones") : ""}</small></span></a>`;
    }).join("");
  }

  IR.vistas.ejercicios = {
    html: () => `<section class="cabeza"><h1>Ejercicios</h1><p>El catálogo por grupo muscular y los que crees tú. Toca uno para ver tu progreso.</p></section>
      <input class="buscador" type="search" placeholder="Buscar ejercicio" value="${esc(texto)}" data-on="buscarBib" autocomplete="off">
      <div class="chips desliza">${["", ...IR.bib.GRUPOS].map((x) =>
        `<button class="chip ${x === grupo ? "activo" : ""}" data-a="grupoBib" data-g="${esc(x)}">${x || "Todos"}</button>`).join("")}</div>
      <button class="btn ancho" data-a="nuevoEj">+ Crear ejercicio propio</button>
      <div id="lista-bib">${filas()}</div>`,
  };

  Object.assign(IR.acc, {
    buscarBib(el) { texto = el.value; IR.ui.$("#lista-bib").innerHTML = filas(); },
    grupoBib(el) { grupo = el.dataset.g; IR.app.render(true); },
    async nuevoEj() {
      const r = await IR.ui.formEjercicio(null);
      if (!r || r.borrar) return;
      const ej = Object.assign({ id: "p-" + U.uid() }, r);
      A.anadir("ejercicios", ej);
      IR.ui.aviso("Ejercicio creado");
    },
  });

  // El buscador de la barra lateral busca aquí: pone el texto, abre esta
  // página si no lo estaba y, si ya lo estaba, solo cambia la lista.
  function buscar(t) {
    texto = t;
    if (!/^#ejercicios$/.test(location.hash)) { location.hash = "#ejercicios"; return; }
    const caja = IR.ui.$("#lista-bib"), campo = IR.ui.$("#vista .buscador");
    if (caja) caja.innerHTML = filas();
    if (campo && campo !== document.activeElement) campo.value = t;
  }
  IR.ejercicios = { buscar };
})();
