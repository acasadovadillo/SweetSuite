/*
 * Ironrack — Entrenar: empezar una sesión (vacía, desde una rutina o repitiendo
 * una anterior) y apuntar series mientras se entrena.
 *
 * La sesión en curso vive en doc.actual y se guarda con cada cambio, así que
 * cerrar la app a mitad de entreno no pierde nada. Al terminar pasa a
 * doc.sesiones solo con las series marcadas como hechas.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u, A = IR.almacen, esc = U.esc;
  const S = A.S;

  // ── Crear la sesión ──
  const serieVacia = (obj) => ({ kg: null, reps: null, hecha: false, tipo: "normal", obj: obj || null });

  function nombreDelDia() {
    const h = new Date().getHours();
    return h < 12 ? "Entreno de mañana" : h < 20 ? "Entreno de tarde" : "Entreno de noche";
  }

  async function empezar({ nombre, rutina = null, ejercicios = [] }) {
    if (S.doc.actual) {
      const ok = await IR.ui.confirmar("Ya tienes un entreno en curso", { detalle: "Termínalo o descártalo antes de empezar otro.", si: "Ir al entreno", no: "Cerrar" });
      if (ok) location.hash = "#entrenar";
      return;
    }
    const actual = { id: U.uid(), nombre: nombre || nombreDelDia(), inicio: Date.now(), rutina, notas: "", ejercicios };
    A.cambiar((d) => { d.actual = actual; d.actualMod = Date.now(); }, { render: false });
    location.hash = "#entrenar";
    IR.app.render(true);
    window.scrollTo(0, 0);
  }

  const desdeRutina = (r) => r.ejercicios.map((x) => ({
    uid: U.uid(), ej: x.ej,
    series: Array.from({ length: Math.max(1, x.series || 1) }, () => serieVacia({ kg: x.kg, reps: x.reps })),
  }));

  const desdeSesion = (ses) => ses.ejercicios.map((e) => ({
    uid: U.uid(), ej: e.ej,
    series: e.series.map((s) => Object.assign(serieVacia({ kg: s.kg, reps: s.reps }), { tipo: s.tipo || "normal" })),
  }));

  function empezarRutina(id) {
    const r = S.doc.rutinas.find((x) => x.id === id);
    if (r) empezar({ nombre: r.nombre, rutina: r.id, ejercicios: desdeRutina(r) });
  }
  function repetirSesion(id) {
    const s = S.doc.sesiones.find((x) => x.id === id);
    if (s) empezar({ nombre: s.nombre, rutina: s.rutina || null, ejercicios: desdeSesion(s) });
  }

  // ── Lo que se propone en cada casilla ──
  // Kilos: los de la última vez en esa serie, si no los del plan, si no los de
  // la serie de arriba. Repeticiones: las del plan primero, que es lo que se
  // quiere hacer hoy.
  //
  // La serie «de la última vez» se busca entre las del mismo tipo: la primera
  // efectiva de hoy se compara con la primera efectiva de entonces, no con el
  // calentamiento que la precedía.
  function previaDe(ej, j, previos) {
    const cal = (s) => s.tipo === "cal";
    const esCal = cal(ej.series[j]);
    const k = ej.series.slice(0, j).filter((s) => cal(s) === esCal).length;
    return previos.filter((s) => cal(s) === esCal)[k];
  }
  function sugerencia(ej, j, previos) {
    const s = ej.series[j], p = previaDe(ej, j, previos) || {}, o = s.obj || {};
    const arriba = j > 0 ? valorO(ej, j - 1, previos) : {};
    return {
      kg: p.kg != null ? p.kg : o.kg != null ? o.kg : arriba.kg,
      reps: o.reps != null ? o.reps : p.reps != null ? p.reps : arriba.reps,
    };
  }
  function valorO(ej, j, previos) {
    const s = ej.series[j], sug = sugerencia(ej, j, previos);
    return { kg: s.kg != null ? s.kg : sug.kg, reps: s.reps != null ? s.reps : sug.reps };
  }

  // ── Vista ──
  function htmlInicio() {
    const d = S.doc;
    const ultima = d.sesiones[0];
    const estaSemana = d.sesiones.filter((s) => s.inicio >= U.lunes(Date.now())).length;
    const racha = IR.analisis.racha();
    const rutinas = d.rutinas.map((r) => {
      const usadas = d.sesiones.filter((s) => s.rutina === r.id);
      return `<article class="tarjeta">
        <div class="tarjeta-cab"><h3>${esc(r.nombre)}</h3><a class="enlace" href="#rutinas/${esc(r.id)}">Editar</a></div>
        <p class="suave">${r.ejercicios.map((x) => esc(IR.bib.nombre(x.ej))).join(" · ") || "Sin ejercicios"}</p>
        <div class="tarjeta-pie">
          <small class="suave">${usadas.length ? "Última vez: " + U.fecha(usadas[0].inicio) : "Aún sin estrenar"}</small>
          <button class="btn primario" data-a="empezarRutina" data-id="${esc(r.id)}" ${r.ejercicios.length ? "" : "disabled"}>Empezar</button>
        </div></article>`;
    }).join("");

    // Sin token todo funciona, pero solo en este dispositivo: se recuerda aquí,
    // donde se ve, y no en la entrada, que ya pide bastante.
    const sinGitHub = S.token ? "" : `<article class="tarjeta aviso-github">
        <div><b>Tus entrenos están solo en este dispositivo</b>
        <p class="suave">Conecta con GitHub para tener una copia cifrada en datos-cifrados y verlos en tus otros dispositivos.</p></div>
        <button class="btn primario" data-a="ajToken">Conectar</button>
      </article>`;

    return `<section class="cabeza">
        <h1>Entrenar</h1>
        <p class="suave">${esc(U.fechaLarga(Date.now()))}</p>
      </section>
      ${sinGitHub}
      <div class="stats">
        <div class="stat"><b>${estaSemana}</b><span>esta semana</span></div>
        <div class="stat"><b>${racha}</b><span>${racha === 1 ? "semana seguida" : "semanas seguidas"}</span></div>
        <div class="stat"><b>${d.sesiones.length}</b><span>entrenos</span></div>
      </div>
      <button class="btn primario grande ancho" data-a="empezarVacio">Empezar entreno vacío</button>
      <h2>Tus rutinas</h2>
      ${rutinas || `<article class="tarjeta vacia"><p>Guarda tus rutinas (Push, Pull, Pierna…) para empezar con todo ya puesto.</p>
        <button class="btn" data-a="nuevaRutina">Crear rutina</button></article>`}
      ${ultima ? `<h2>Último entreno</h2>
        <article class="tarjeta">
          <a class="tarjeta-cab enlace-tarjeta" href="#historial/${esc(ultima.id)}"><h3>${esc(ultima.nombre)}</h3><small class="suave">${esc(U.fecha(ultima.inicio))}</small></a>
          <p class="suave">${ultima.ejercicios.map((e) => esc(IR.bib.nombre(e.ej))).join(" · ")}</p>
          <div class="tarjeta-pie"><small class="suave">${U.duracion(ultima.fin - ultima.inicio)} · ${U.volumen(U.volSesion(ultima))}</small>
          <button class="btn" data-a="repetirSesion" data-id="${esc(ultima.id)}">Repetir</button></div>
        </article>` : ""}`;
  }

  function htmlSerie(ej, ie, j, previos, numero) {
    const s = ej.series[j];
    const sug = sugerencia(ej, j, previos);
    const p = previaDe(ej, j, previos);
    const ant = p ? `${U.kg(p.kg)} × ${p.reps}` : "–";
    const cal = s.tipo === "cal";
    return `<div class="serie ${s.hecha ? "hecha" : ""} ${cal ? "cal" : ""}">
      <button class="n" data-a="menuSerie" data-ie="${ie}" data-is="${j}" aria-label="Opciones de la serie">${cal ? "C" : numero}</button>
      <span class="ant">${ant}</span>
      <input class="kg" inputmode="decimal" enterkeyhint="next" data-on="valorSerie" data-ie="${ie}" data-is="${j}" data-campo="kg"
        value="${s.kg != null ? esc(String(s.kg).replace(".", ",")) : ""}" placeholder="${sug.kg != null ? esc(U.kg(sug.kg)) : "kg"}" aria-label="Kilos">
      <input class="reps" inputmode="numeric" enterkeyhint="done" data-on="valorSerie" data-ie="${ie}" data-is="${j}" data-campo="reps"
        value="${s.reps != null ? s.reps : ""}" placeholder="${sug.reps != null ? sug.reps : "reps"}" aria-label="Repeticiones">
      <button class="ok" data-a="hecha" data-ie="${ie}" data-is="${j}" aria-label="${s.hecha ? "Desmarcar" : "Marcar hecha"}">✓</button>
    </div>`;
  }

  function htmlEjercicio(ej, ie) {
    const info = IR.bib.ejercicio(ej.ej);
    const previos = IR.analisis.previo(ej.ej);
    let n = 0;
    const filas = ej.series.map((s, j) => htmlSerie(ej, ie, j, previos, s.tipo === "cal" ? 0 : ++n)).join("");
    return `<article class="ej" id="ej-${esc(ej.uid)}">
      <header>
        <a class="ej-nombre" href="#progreso/${esc(ej.ej)}">${esc(info.nombre)}</a>
        <button class="icono" data-a="menuEj" data-ie="${ie}" aria-label="Opciones del ejercicio">⋯</button>
      </header>
      <div class="series">
        <div class="serie cab"><span>Serie</span><span>Anterior</span><span>Kg</span><span>Reps</span><span></span></div>
        ${filas}
      </div>
      <button class="btn fantasma ancho" data-a="masSerie" data-ie="${ie}">+ Añadir serie</button>
    </article>`;
  }

  function meta(a) {
    let hechas = 0, total = 0, vol = 0;
    a.ejercicios.forEach((e) => e.series.forEach((s) => {
      total++;
      if (s.hecha) { hechas++; if (s.tipo !== "cal") vol += (s.kg || 0) * (s.reps || 0); }
    }));
    return { hechas, total, vol };
  }
  const textoMeta = (m) => `${m.hechas}/${m.total} series · ${U.volumen(m.vol)}`;

  function htmlActual() {
    const a = S.doc.actual;
    return `<section class="sesion-cab">
        <input class="titulo-sesion" value="${esc(a.nombre)}" data-on="nombreSesion" aria-label="Nombre del entreno" maxlength="60">
        <div class="fila-meta">
          <span class="reloj" data-reloj="${a.inicio}">${U.reloj(Date.now() - a.inicio)}</span>
          <span class="suave" id="meta-actual">${textoMeta(meta(a))}</span>
          <button class="btn primario" data-a="terminar">Terminar</button>
        </div>
      </section>
      ${a.ejercicios.map(htmlEjercicio).join("") || '<p class="vacio">Añade el primer ejercicio para empezar.</p>'}
      <button class="btn ancho" data-a="anadirEj">+ Añadir ejercicio</button>
      <button class="btn ancho texto-peligro" data-a="descartar">Descartar entreno</button>`;
  }

  IR.vistas.entrenar = { html: () => (S.doc.actual ? htmlActual() : htmlInicio()) };

  // ── Acciones ──
  const serieDe = (el) => S.doc.actual.ejercicios[+el.dataset.ie].series[+el.dataset.is];

  Object.assign(IR.acc, {
    empezarVacio: () => empezar({}),
    empezarRutina: (el) => empezarRutina(el.dataset.id),
    repetirSesion: (el) => repetirSesion(el.dataset.id),

    nombreSesion(el) {
      A.cambiarActual((a) => { a.nombre = el.value; }, { render: false });
    },

    valorSerie(el) {
      const campo = el.dataset.campo;
      let v = U.num(el.value);
      if (v != null && campo === "reps") v = Math.max(0, Math.round(v));
      if (v != null && v < 0) v = null;
      A.cambiarActual(() => { serieDe(el)[campo] = v; }, { render: false });
      const m = IR.ui.$("#meta-actual");
      if (m) m.textContent = textoMeta(meta(S.doc.actual));
    },

    hecha(el) {
      const ie = +el.dataset.ie, is = +el.dataset.is;
      const ej = S.doc.actual.ejercicios[ie];
      const s = ej.series[is];
      if (s.hecha) {
        A.cambiarActual(() => { s.hecha = false; });
        return;
      }
      // Lo que no se ha escrito se toma de lo propuesto en la casilla
      const v = valorO(ej, is, IR.analisis.previo(ej.ej));
      if (!v.reps) { IR.ui.aviso("Escribe las repeticiones"); return; }
      A.cambiarActual(() => {
        s.kg = v.kg != null ? v.kg : 0;
        s.reps = v.reps;
        s.hecha = true;
      });
      if (s.tipo !== "cal") IR.descanso.iniciar(S.doc.ajustes.descanso);
    },

    masSerie(el) {
      const ej = S.doc.actual.ejercicios[+el.dataset.ie];
      const ult = ej.series[ej.series.length - 1];
      const obj = ult ? valorO(ej, ej.series.length - 1, IR.analisis.previo(ej.ej)) : null;
      A.cambiarActual(() => { ej.series.push(serieVacia(obj)); });
    },

    menuSerie(el) {
      const ie = +el.dataset.ie, is = +el.dataset.is;
      const s = serieDe(el);
      IR.ui.menu("Serie", [
        { texto: s.tipo === "cal" ? "Marcar como serie efectiva" : "Marcar como calentamiento",
          fn: () => A.cambiarActual(() => { s.tipo = s.tipo === "cal" ? "normal" : "cal"; }) },
        { texto: "Borrar esta serie", peligro: true,
          fn: () => A.cambiarActual((a) => { a.ejercicios[ie].series.splice(is, 1); }) },
      ]);
    },

    menuEj(el) {
      const ie = +el.dataset.ie;
      const a = S.doc.actual;
      const ej = a.ejercicios[ie];
      const mover = (d) => A.cambiarActual((x) => { const [e] = x.ejercicios.splice(ie, 1); x.ejercicios.splice(ie + d, 0, e); });
      const ops = [{ texto: "Ver progreso", fn: () => { location.hash = "#progreso/" + ej.ej; } }];
      if (ie > 0) ops.push({ texto: "Subir", fn: () => mover(-1) });
      if (ie < a.ejercicios.length - 1) ops.push({ texto: "Bajar", fn: () => mover(1) });
      ops.push({ texto: "Cambiar por otro ejercicio", fn: async () => {
        const [id] = await IR.ui.elegirEjercicios({ titulo: "Cambiar por…", multiple: false });
        if (id) A.cambiarActual(() => { ej.ej = id; });
      } });
      ops.push({ texto: "Quitar ejercicio", peligro: true, fn: async () => {
        if (ej.series.some((s) => s.hecha) && !(await IR.ui.confirmar("¿Quitar " + IR.bib.nombre(ej.ej) + "?", { detalle: "Se pierden sus series hechas.", si: "Quitar", peligro: true }))) return;
        A.cambiarActual((x) => { x.ejercicios.splice(ie, 1); });
      } });
      IR.ui.menu(IR.bib.nombre(ej.ej), ops);
    },

    async anadirEj() {
      const ids = await IR.ui.elegirEjercicios();
      if (!ids.length) return;
      const nuevos = ids.map((id) => {
        const prev = IR.analisis.previo(id);
        const n = Math.max(1, U.efectivas(prev).length || 3);
        return { uid: U.uid(), ej: id, series: Array.from({ length: n }, () => serieVacia()) };
      });
      A.cambiarActual((a) => { a.ejercicios.push(...nuevos); });
      const ult = document.getElementById("ej-" + nuevos[0].uid);
      if (ult) ult.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    async descartar() {
      if (!(await IR.ui.confirmar("¿Descartar este entreno?", { detalle: "No se guardará nada de esta sesión.", si: "Descartar", peligro: true }))) return;
      A.cambiar((d) => { d.actual = null; d.actualMod = Date.now(); });
      IR.descanso.parar();
    },

    terminar() {
      const a = S.doc.actual;
      const m = meta(a);
      if (!m.hechas) {
        IR.ui.confirmar("No has marcado ninguna serie", { detalle: "Marca con ✓ las series que hagas. ¿Descartas el entreno?", si: "Descartar", no: "Seguir", peligro: true })
          .then((ok) => { if (ok) { A.cambiar((d) => { d.actual = null; d.actualMod = Date.now(); }); IR.descanso.parar(); } });
        return;
      }
      const sinMarcar = m.total - m.hechas;
      IR.ui.hoja(`<h3>Terminar entreno</h3>
        <div class="stats">
          <div class="stat"><b>${U.duracion(Date.now() - a.inicio)}</b><span>duración</span></div>
          <div class="stat"><b>${m.hechas}</b><span>series</span></div>
          <div class="stat"><b>${U.volumen(m.vol)}</b><span>volumen</span></div>
        </div>
        ${sinMarcar ? `<p class="suave">${sinMarcar === 1 ? "La serie sin marcar no se guarda." : "Las " + sinMarcar + " series sin marcar no se guardan."}</p>` : ""}
        <label class="form">Notas <textarea id="notas-fin" rows="2" placeholder="Cómo te has sentido, molestias…">${esc(a.notas || "")}</textarea></label>
        <div class="botones">
          <button class="btn" data-a="_seguir">Seguir entrenando</button>
          <button class="btn primario" data-a="_guardarSesion">Guardar entreno</button>
        </div>`);
      IR.acc._seguir = () => IR.ui.cerrarHoja();
      IR.acc._guardarSesion = () => guardarSesion(IR.ui.$("#notas-fin").value.trim());
    },
  });

  function guardarSesion(notas) {
    const a = S.doc.actual;
    const ahora = Date.now();
    const ses = {
      id: a.id, nombre: a.nombre.trim() || nombreDelDia(), inicio: a.inicio, fin: ahora, rutina: a.rutina || null, notas,
      ejercicios: a.ejercicios
        .map((e) => ({ ej: e.ej, series: e.series.filter((s) => s.hecha).map((s) => ({ kg: s.kg || 0, reps: s.reps, tipo: s.tipo === "cal" ? "cal" : "normal" })) }))
        .filter((e) => e.series.length),
      creado: ahora, mod: ahora,
    };
    const prs = IR.analisis.prsDeSesion(ses);
    A.cambiar((d) => {
      d.sesiones.push(ses);
      d.sesiones.sort((x, y) => y.inicio - x.inicio);
      d.actual = null;
      d.actualMod = ahora;
    }, { subirYa: true });
    IR.descanso.parar();
    IR.ui.hoja(`<h3>¡Entreno guardado! 💪</h3>
      <div class="stats">
        <div class="stat"><b>${U.duracion(ses.fin - ses.inicio)}</b><span>duración</span></div>
        <div class="stat"><b>${U.nSeries(ses)}</b><span>series</span></div>
        <div class="stat"><b>${U.volumen(U.volSesion(ses))}</b><span>volumen</span></div>
      </div>
      ${prs.length ? `<h4>🏆 Récords nuevos</h4><ul class="prs">${prs.map((p) =>
        `<li><b>${esc(p.nombre)}</b><span>${esc(p.tipo)}: ${esc(p.valor)}</span></li>`).join("")}</ul>` : ""}
      <div class="botones">
        ${ses.rutina ? "" : '<button class="btn" data-a="_comoRutina">Guardar como rutina</button>'}
        <button class="btn primario" data-a="_verSesion">Ver resumen</button>
      </div>`);
    IR.acc._verSesion = () => { IR.ui.cerrarHoja(); location.hash = "#historial/" + ses.id; };
    IR.acc._comoRutina = () => { IR.ui.cerrarHoja(); IR.rutinas.desdeSesion(ses); };
  }

  IR.entrenar = { empezar, empezarRutina, repetirSesion };
})();
