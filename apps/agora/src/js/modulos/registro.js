/*
 * Agora — Módulo «Actividad»: el registro de cambios.
 *
 * Cada alta, cambio o baja queda apuntada con quién la hizo («Alberto ·
 * Tesorería»), cuándo y sobre qué. Lo apunta el repositorio: aquí solo se lee,
 * con filtros por persona y por sección. Lo ven todos los usuarios.
 */
(function (raiz) {
  "use strict";
  var WA = raiz.WA, UI = WA.UI, esc = UI.esc, F = WA.Fechas;

  var DONDE = {
    socios: "Socios", cuotas: "Cuotas", remesas: "Remesas", movimientos: "Movimientos", facturas: "Facturas",
    anticipos: "Anticipos y reembolsos", proyectos: "Presupuestos y subvenciones", actividades: "Actividades", actas: "Actas",
    obligaciones: "Obligaciones", documentos: "Documentos", junta: "Junta directiva", config: "Configuración", asociacion: "Asociación", usuarios: "Usuarios",
  };
  var ACCION = { alta: "Alta", cambio: "Cambio", baja: "Baja", varios: "Varios" };
  var filtro = { autor: "", donde: "", texto: "", limite: 100 };

  async function pintar(cont, datos) {
    var todo = (await datos.listar("registro")).reverse(); // lo más reciente primero
    var autores = {}, sitios = {};
    todo.forEach(function (r) { autores[r.autor] = true; sitios[r.donde] = true; });
    cont.innerHTML =
      "<h1>Actividad</h1>" +
      '<p class="intro">Quién ha cambiado qué y cuándo. Se guardan los últimos ' + WA.Repositorio.MAX_REGISTRO.toLocaleString("es-ES") + " cambios.</p>" +
      '<div class="barra-filtros">' +
      '<label>Quién <select id="r-autor"><option value="">Todos</option>' + Object.keys(autores).sort().map(function (a) {
        return '<option value="' + esc(a) + '"' + (filtro.autor === a ? " selected" : "") + ">" + esc(a) + "</option>";
      }).join("") + "</select></label>" +
      '<label>Dónde <select id="r-donde"><option value="">Todo</option>' + Object.keys(sitios).sort().map(function (d) {
        return '<option value="' + esc(d) + '"' + (filtro.donde === d ? " selected" : "") + ">" + esc(DONDE[d] || d) + "</option>";
      }).join("") + "</select></label>" +
      '<div class="filtro-texto"><input type="search" id="r-texto" placeholder="Buscar…" aria-label="Buscar en la actividad" value="' + esc(filtro.texto) + '"></div>' +
      "</div><div id=\"r-lista\"></div>";

    function lista() {
      var q = WA.Permisos.normalizar(filtro.texto);
      var vista = todo.filter(function (r) {
        return (!filtro.autor || r.autor === filtro.autor) && (!filtro.donde || r.donde === filtro.donde) &&
          (!q || WA.Permisos.normalizar(r.resumen + " " + r.autor).indexOf(q) >= 0);
      });
      var caja = cont.querySelector("#r-lista");
      if (!vista.length) { caja.innerHTML = '<p class="vacio">' + (todo.length ? "Nada con esos filtros." : "Todavía no hay cambios apuntados.") + "</p>"; return; }
      caja.innerHTML = '<p class="detalle">' + vista.length + (vista.length === 1 ? " cambio" : " cambios") + ".</p>" +
        '<section class="tarjeta"><div class="tabla-envoltorio"><table class="tabla"><thead><tr><th scope="col">Cuándo</th><th scope="col">Quién</th>' +
        '<th scope="col">Qué</th><th scope="col">Dónde</th></tr></thead><tbody>' +
        vista.slice(0, filtro.limite).map(function (r) {
          return "<tr><td>" + esc(F.corta(r.fecha.slice(0, 10))) + ' <span class="detalle">' + esc(r.fecha.slice(11, 16)) + "</span></td>" +
            "<td>" + esc(r.autor) + "</td><td><span class=\"estado " + (r.accion === "baja" ? "estado-error" : r.accion === "alta" ? "estado-ok" : "estado-neutro") + "\">" +
            esc(ACCION[r.accion] || r.accion) + "</span> " + esc(r.resumen || "") + "</td><td>" + esc(DONDE[r.donde] || r.donde) + "</td></tr>";
        }).join("") + "</tbody></table></div></section>" +
        (vista.length > filtro.limite ? '<div class="acciones"><button type="button" class="btn btn-secundario lectura-ok" id="r-mas">Ver más</button></div>' : "");
      var mas = caja.querySelector("#r-mas");
      if (mas) mas.addEventListener("click", function () { filtro.limite += 200; lista(); });
    }
    cont.querySelector("#r-autor").addEventListener("change", function (e) { filtro.autor = e.target.value; filtro.limite = 100; lista(); });
    cont.querySelector("#r-donde").addEventListener("change", function (e) { filtro.donde = e.target.value; filtro.limite = 100; lista(); });
    cont.querySelector("#r-texto").addEventListener("input", function (e) { filtro.texto = e.target.value; filtro.limite = 100; lista(); });
    lista();
  }

  WA.App.registrar({
    id: "registro", titulo: "Actividad", orden: 88, pintar: pintar,
    icono: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
  });
})(typeof self !== "undefined" ? self : this);
