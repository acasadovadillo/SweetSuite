/*
 * SweetSuite — Administración: dar de alta y de baja cuentas.
 *
 * Solo la ve la cuenta de tipo «admin», que es una y solo una (cuentas.json).
 * Da de alta personas y empresas, elige sus apps y los representantes de cada
 * empresa (y, si la empresa tiene Agora, el cargo de cada uno), y da de baja. Por debajo edita cuentas.json y lo sube al
 * repositorio SweetSuite con un commit; GitHub Pages lo publica en un minuto.
 *
 * La seguridad la pone GitHub, no esta pantalla: para guardar hace falta el
 * token de Admin («Admin-SweetSuite»), con permiso de escritura sobre
 * SweetSuite y SweetSuite-Admin (donde va su llavero). Quien se «hiciera» Admin
 * tocando el navegador no podría guardar nada.
 *
 * Lo que no hace, a propósito: crear tokens de GitHub (se crean en GitHub; aquí
 * se dice cuáles), abrir los datos de nadie, ni borrar datos (eso, solo Alberto
 * desde GitHub). Dar de baja quita la cuenta de la lista; sus datos se quedan.
 */
(function () {
  "use strict";
  const TIPOS = ["persona", "organizacion"];
  // Los cargos de una asociación con Agora: cada uno edita lo suyo y todos ven
  // todo (ver apps/agora/src/js/logica/permisos.js). Sin cargo, solo ve.
  const CARGOS = ["Presidencia", "Vicepresidencia", "Secretaría", "Tesorería", "Vocalía", "Coordinación"];
  const limpiarUsuario = (u) => String(u || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]/g, "");
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };

  // ── Lo que se puede y no se puede hacer con la lista (sin pantalla: se prueba) ──
  function validar(cat) {
    const errores = [];
    const cuentas = (cat && cat.cuentas) || [];
    const apps = ((cat && cat.apps) || []).map((a) => a.id);
    const vistos = {};
    if (cuentas.filter((c) => c.tipo === "admin").length !== 1) errores.push("Tiene que haber una cuenta Admin, y solo una");
    cuentas.forEach((c) => {
      if (!c.usuario || c.usuario !== limpiarUsuario(c.usuario)) errores.push(`«${c.usuario}»: el usuario solo puede llevar minúsculas, números y guiones`);
      if (vistos[c.usuario]) errores.push(`«${c.usuario}» está repetido`);
      vistos[c.usuario] = true;
      if (!String(c.nombre || "").trim()) errores.push(`«${c.usuario}» no tiene nombre`);
      if (c.tipo === "admin") return;
      if (TIPOS.indexOf(c.tipo) < 0) errores.push(`«${c.usuario}»: tipo desconocido`);
      (c.apps || []).forEach((a) => { if (apps.indexOf(a) < 0) errores.push(`«${c.usuario}»: la app «${a}» no existe`); });
      if (c.tipo === "organizacion") {
        (c.representantes || []).forEach((r) => {
          const p = cuentas.find((x) => x.usuario === r);
          if (!p || p.tipo !== "persona") errores.push(`${c.nombre}: «${r}» no es una persona dada de alta`);
        });
        Object.keys(c.cargos || {}).forEach((r) => {
          if ((c.representantes || []).indexOf(r) < 0) errores.push(`${c.nombre}: «${r}» tiene cargo pero no es representante`);
          if (CARGOS.indexOf(c.cargos[r]) < 0) errores.push(`${c.nombre}: «${c.cargos[r]}» no es un cargo`);
        });
      }
    });
    return errores;
  }
  // Los cargos, solo de quien sigue representando a la empresa y con un cargo
  // de la lista; sin ninguno, no se escribe la clave
  function ponerCargos(cuenta, cargos) {
    const limpios = {};
    (cuenta.representantes || []).forEach((r) => { if (cargos && CARGOS.indexOf(cargos[r]) >= 0) limpios[r] = cargos[r]; });
    if (Object.keys(limpios).length) cuenta.cargos = limpios; else delete cuenta.cargos;
  }
  function alta(cat, c) {
    const nuevo = copia(cat);
    const cuenta = {
      usuario: limpiarUsuario(c.usuario), nombre: String(c.nombre || "").trim(),
      tipo: c.tipo === "organizacion" ? "organizacion" : "persona", apps: (c.apps || []).slice(),
    };
    if (cuenta.tipo === "organizacion") {
      cuenta.representantes = (c.representantes || []).slice();
      ponerCargos(cuenta, c.cargos);
    }
    if (cuenta.usuario === "admin") throw fallo("«admin» es la cuenta Admin, y solo puede haber una", "ADMIN");
    if (nuevo.cuentas.some((x) => x.usuario === cuenta.usuario)) throw fallo(`Ya hay una cuenta «${cuenta.usuario}»`, "REPETIDA");
    // Antes de la del Admin, que va la última
    const iAdmin = nuevo.cuentas.findIndex((x) => x.tipo === "admin");
    nuevo.cuentas.splice(iAdmin < 0 ? nuevo.cuentas.length : iAdmin, 0, cuenta);
    return nuevo;
  }
  function editar(cat, usuario, cambios) {
    const nuevo = copia(cat);
    const c = nuevo.cuentas.find((x) => x.usuario === usuario);
    if (!c) throw fallo(`No hay ninguna cuenta «${usuario}»`, "NO_EXISTE");
    if (c.tipo === "admin") throw fallo("La cuenta Admin no se toca desde aquí", "ADMIN");
    if (cambios.nombre !== undefined) c.nombre = String(cambios.nombre).trim();
    if (cambios.apps) c.apps = cambios.apps.slice();
    if (c.tipo === "organizacion" && cambios.representantes) c.representantes = cambios.representantes.slice();
    if (c.tipo === "organizacion") ponerCargos(c, cambios.cargos !== undefined ? cambios.cargos : c.cargos);
    return nuevo;
  }
  // Dar de baja: sale de la lista (y de las empresas que representaba). Sus datos se quedan.
  function baja(cat, usuario) {
    const nuevo = copia(cat);
    const c = nuevo.cuentas.find((x) => x.usuario === usuario);
    if (!c) throw fallo(`No hay ninguna cuenta «${usuario}»`, "NO_EXISTE");
    if (c.tipo === "admin") throw fallo("La cuenta Admin no se puede dar de baja", "ADMIN");
    nuevo.cuentas = nuevo.cuentas.filter((x) => x.usuario !== usuario);
    nuevo.cuentas.forEach((x) => {
      if (!x.representantes) return;
      x.representantes = x.representantes.filter((r) => r !== usuario);
      ponerCargos(x, x.cargos);   // y su cargo, fuera
    });
    return nuevo;
  }
  // Los tokens que hay que crear en GitHub para lo que es nuevo
  // Sin tildes ni espacios, que GitHub no los quiere en el nombre de un token
  const sinTildes = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "");
  const nombreToken = (...partes) => partes.map((p, i) => (i === 0 && partes.length === 3 ? sinTildes(p).toUpperCase()
    : sinTildes(p).charAt(0).toUpperCase() + sinTildes(p).slice(1))).join("-");
  function tokensQueCrear(antes, despues, repos) {
    const tiene = (cat, usuario, app, rep) => {
      const c = ((cat && cat.cuentas) || []).find((x) => x.usuario === usuario);
      if (!c || (c.apps || []).indexOf(app) < 0) return false;
      return rep ? (c.representantes || []).indexOf(rep) >= 0 : true;
    };
    const lista = [];
    const appDe = (id) => (despues.apps || []).find((a) => a.id === id) || { id, nombre: id };
    const acceso = (app) => (repos[app] ? [repos[app].repo] : []).concat(app === "solvento" ? ["Solvento"] : []);
    (despues.cuentas || []).forEach((c) => {
      if (c.tipo === "persona") {
        (c.apps || []).forEach((a) => {
          if (!tiene(antes, c.usuario, a)) lista.push({ nombre: nombreToken(c.nombre, appDe(a).nombre), para: c.nombre, app: appDe(a).nombre, acceso: acceso(a) });
        });
      } else if (c.tipo === "organizacion") {
        (c.apps || []).forEach((a) => (c.representantes || []).forEach((r) => {
          if (tiene(antes, c.usuario, a, r)) return;
          const p = (despues.cuentas || []).find((x) => x.usuario === r) || { nombre: r };
          lista.push({ nombre: nombreToken(c.usuario, p.nombre, appDe(a).nombre), para: p.nombre + " (" + c.nombre + ")", app: appDe(a).nombre, acceso: acceso(a) });
        }));
      }
    });
    return lista;
  }
  // cuentas.json como se escribe a mano: cada cuenta en una línea
  function formatear(cat) {
    const linea = (c) => "    " + JSON.stringify(c).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/":/g, '": ').replace(/,"/g, ', "');
    const cab = Object.assign({}, cat);
    delete cab.cuentas;
    const txt = JSON.stringify(cab, null, 2);
    return txt.replace(/\n\}$/, ',\n  "cuentas": [\n' + cat.cuentas.map(linea).join(",\n") + "\n  ]\n}") + "\n";
  }

  // ── GitHub ──
  const b64enc = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64dec = (b) => decodeURIComponent(escape(atob(String(b).replace(/\s/g, ""))));
  const cabeceras = (token) => ({ Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28" });
  function crearGithub(E) {
    const url = (repo, ruta) => `${E.api}/repos/${repo.owner}/${repo.repo}/contents/${ruta}`;
    async function leer(token, repo, ruta) {
      const r = await fetch(url(repo, ruta) + "?ref=" + repo.branch + "&_=" + Date.now(), { headers: cabeceras(token), cache: "no-store" });
      if (r.status === 401) throw fallo("El token no vale o ha caducado", "AUTH");
      if (r.status === 403) throw fallo("El token no tiene permiso sobre " + repo.repo, "AUTH");
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("GitHub respondió " + r.status);
      const j = await r.json();
      return { sha: j.sha, texto: b64dec(j.content || "") };
    }
    async function escribir(token, repo, ruta, texto, sha, mensaje) {
      const body = { message: mensaje, content: b64enc(texto), branch: repo.branch };
      if (sha) body.sha = sha;
      const r = await fetch(url(repo, ruta), { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, cabeceras(token)), body: JSON.stringify(body) });
      if (r.status === 409 || r.status === 422) throw fallo("Alguien guardó otro cambio a la vez", "CONFLICT");
      if (r.status === 401 || r.status === 403 || r.status === 404) throw fallo("El token no puede escribir en " + repo.repo, "AUTH");
      if (!r.ok) throw new Error("GitHub respondió " + r.status);
      return (await r.json()).content.sha;
    }
    async function acceso(token, repo) {
      const r = await fetch(`${E.api}/repos/${repo.owner}/${repo.repo}`, { headers: cabeceras(token), cache: "no-store" });
      if (r.status === 401) throw fallo("El token no vale o ha caducado", "AUTH");
      if (!r.ok) throw fallo("El token no da acceso a " + repo.repo, "AUTH");
      return true;
    }
    return { leer, escribir, acceso };
  }

  // ── La pantalla ──
  // «ctx» lo da suite.js: la sesión, el catálogo y sus diálogos y avisos.
  function crearVista(ctx) {
    const E = ctx.E, L = ctx.L, G = crearGithub(E), esc = ctx.esc;
    const CLAVE_TOKEN = () => "sweetsuite_admin_token:" + ctx.cuenta().usuario;
    const st = { token: null, original: null, borrador: null, sha: null, cargado: false, error: "", guardando: false, conectado: false };

    async function leerToken() {
      const t = ctx.ls.get(CLAVE_TOKEN());
      if (!t) return null;
      try { return (await L.descifrarDato(ctx.maestra(), JSON.parse(t))).token; } catch (e) { return null; }
    }
    async function guardarToken(token) {
      ctx.ls.set(CLAVE_TOKEN(), JSON.stringify(await L.cifrarDato(ctx.maestra(), { token })));
    }
    // El llavero de la cuenta Admin, en SweetSuite-Admin
    async function llavero() {
      await ctx.reconciliar("admin", {
        leer: (r) => G.leer(st.token, E.admin.llavero, r),
        escribir: (r, texto, sha, m) => G.escribir(st.token, E.admin.llavero, r, texto, sha, m),
      });
      await guardarToken(st.token);              // por si la clave de la cuenta cambió
    }
    async function cargar() {
      st.error = "";
      if (!st.token) st.token = await leerToken();
      if (!st.token) { st.cargado = true; return; }
      try {
        if (!st.conectado) { await llavero(); st.conectado = true; }
        const r = await G.leer(st.token, E.admin.cuentas, E.admin.cuentas.ruta);
        st.original = r ? JSON.parse(r.texto) : copia(ctx.catalogo());
        st.sha = r ? r.sha : null;
        st.borrador = copia(st.original);
      } catch (e) {
        st.error = e.code === "LLAVERO_PENDIENTE" ? e.message : (e.message || String(e));
      }
      st.cargado = true;
    }

    const cambios = () => (st.borrador && st.original ? JSON.stringify(st.borrador) !== JSON.stringify(st.original) : false);
    const appsDe = (c) => (c.apps || []).map((a) => ((st.borrador.apps || []).find((x) => x.id === a) || { nombre: a }).nombre).join(" · ") || "Sin apps";
    const nombreDe = (u) => ((st.borrador.cuentas || []).find((x) => x.usuario === u) || { nombre: u }).nombre;

    function html() {
      if (!st.cargado) return '<p class="nota">Cargando…</p>';
      const cab = `<section class="cabeza"><h1>Administración</h1>
        <p>Dar de alta y de baja cuentas de SweetSuite. Dar de baja quita la cuenta de la lista; sus datos se quedan: borrarlos solo puede hacerse desde GitHub.</p></section>`;
      const tokenFila = ctx.fila("Token de Admin", st.token
          ? "Guardado en este dispositivo, cifrado con tu cuenta."
          : "Uno fine-grained, «Admin-SweetSuite», con Contents: Read and write sobre SweetSuite y SweetSuite-Admin. Sin él no se puede cambiar la lista.",
        `<button class="btn ${st.token ? "" : "primario"}" data-adm="token">${st.token ? "Cambiar" : "Pegar token"}</button>`, "apilar");
      if (!st.token) return cab + `<div class="tarjeta filas">${tokenFila}</div>`;
      if (st.error) return cab + `<div class="tarjeta"><p class="error">${esc(st.error)}</p><div class="botones"><button class="btn" data-adm="recargar">Volver a intentarlo</button></div></div><div class="tarjeta filas">${tokenFila}</div>`;
      const cuentas = st.borrador.cuentas || [];
      const personas = cuentas.filter((c) => c.tipo === "persona"), empresas = cuentas.filter((c) => c.tipo === "organizacion");
      const errores = validar(st.borrador);
      const barra = cambios() ? `<div class="tarjeta admin-cambios">
          <span><b>Cambios sin guardar.</b> ${errores.length ? `<span class="error">${esc(errores[0])}</span>` : "Al guardar se publican en un minuto."}</span>
          <span class="botones"><button class="btn" data-adm="descartar">Descartar</button><button class="btn primario" data-adm="guardar" ${errores.length || st.guardando ? "disabled" : ""}>${st.guardando ? "Guardando…" : "Guardar cambios"}</button></span>
        </div>` : "";
      const conCargo = (c, r) => esc(nombreDe(r)) + (c.cargos && c.cargos[r] ? " (" + esc(c.cargos[r]) + ")" : "");
      const filaCuenta = (c) => ctx.fila(`${esc(c.nombre)} <span class="usuario-admin">${esc(c.usuario)}</span>`,
        esc(appsDe(c)) + (c.tipo === "organizacion" ? " · Representantes: " + ((c.representantes || []).map((r) => conCargo(c, r)).join(", ") || "ninguno") : ""),
        `<button class="btn" data-adm="editar" data-u="${esc(c.usuario)}">Editar</button><button class="btn texto-peligro" data-adm="baja" data-u="${esc(c.usuario)}">Dar de baja</button>`, "apilar");
      return cab + barra + `
        <h2>Personas</h2>
        <div class="tarjeta filas">${personas.map(filaCuenta).join("") || ctx.fila("Ninguna", "", "")}</div>
        <div class="botones" style="margin-top:0"><button class="btn" data-adm="nueva" data-tipo="persona">Añadir persona</button></div>
        <h2>Empresas</h2>
        <div class="tarjeta filas">${empresas.map(filaCuenta).join("") || ctx.fila("Ninguna", "", "")}</div>
        <div class="botones" style="margin-top:0"><button class="btn" data-adm="nueva" data-tipo="organizacion">Añadir empresa</button></div>
        <h2>Tu token</h2>
        <div class="tarjeta filas">${tokenFila}</div>`;
    }

    function formulario(c, tipo) {
      const nueva = !c;
      c = c || { usuario: "", nombre: "", tipo, apps: [], representantes: [] };
      const personas = (st.borrador.cuentas || []).filter((x) => x.tipo === "persona");
      const d = ctx.dialogo(`<h3>${nueva ? (tipo === "organizacion" ? "Nueva empresa" : "Nueva persona") : "Editar " + esc(c.nombre)}</h3>
        <form class="form" id="f-cuenta">
          <label>Usuario <input class="campo" name="usuario" value="${esc(c.usuario)}" ${nueva ? "" : "readonly"} autocapitalize="none" spellcheck="false" placeholder="minúsculas, sin espacios"></label>
          <label>Nombre <input class="campo" name="nombre" value="${esc(c.nombre)}" placeholder="${tipo === "organizacion" ? "ABIES" : "Nombre"}"></label>
          <fieldset class="marcas"><legend>Apps</legend>${(st.borrador.apps || []).map((a) =>
            `<label><input type="checkbox" name="app" value="${esc(a.id)}" ${(c.apps || []).indexOf(a.id) >= 0 ? "checked" : ""}> ${esc(a.nombre)}</label>`).join("")}</fieldset>
          ${c.tipo === "organizacion" ? `<fieldset class="marcas marcas-reps"><legend>Representantes</legend>${personas.map((p) => {
            const es = (c.representantes || []).indexOf(p.usuario) >= 0, cargo = (c.cargos || {})[p.usuario] || "";
            return `<div class="rep-fila"><label><input type="checkbox" name="rep" value="${esc(p.usuario)}" ${es ? "checked" : ""}> ${esc(p.nombre)}</label>
              <select class="campo rep-cargo" name="cargo-${esc(p.usuario)}" aria-label="Cargo de ${esc(p.nombre)} en Agora" ${es ? "" : "disabled"}>
                <option value="">Sin cargo (solo ve)</option>${CARGOS.map((x) => `<option ${x === cargo ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`;
          }).join("") || "<p class='nota'>Primero da de alta a las personas.</p>"}</fieldset>
            <p class="nota nota-cargos">En Agora, el cargo decide qué edita cada uno; todos ven todo.</p>
            <p class="nota">Un representante nuevo entra la primera vez con la clave de recuperación de la empresa.</p>` : ""}
          <p class="error" id="cuenta-error"></p>
          <div class="botones"><button type="button" class="btn" data-r="no">Cancelar</button><button class="btn primario">${nueva ? "Añadir" : "Aceptar"}</button></div>
        </form>`);
      d.querySelector('[data-r="no"]').onclick = () => ctx.cerrarDialogo();
      // El cargo solo cuenta con Agora y para quien representa a la empresa
      const fc = d.querySelector("#f-cuenta");
      const verCargos = () => {
        const agora = !!fc.querySelector('input[name="app"][value="agora"]:checked');
        fc.querySelectorAll(".rep-cargo").forEach((sel) => {
          sel.hidden = !agora;
          sel.disabled = !fc.querySelector(`input[name="rep"][value="${sel.name.slice(6)}"]`).checked;
        });
        const n = fc.querySelector(".nota-cargos");
        if (n) n.hidden = !agora;
      };
      fc.addEventListener("change", verCargos);
      verCargos();
      fc.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const f = ev.target;
        const marcadas = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map((i) => i.value);
        const datos = { usuario: f.usuario.value, nombre: f.nombre.value, tipo: c.tipo, apps: marcadas("app"), representantes: marcadas("rep") };
        if (c.tipo === "organizacion") {
          datos.cargos = {};   // (sin Agora, sin cargos)
          if (datos.apps.indexOf("agora") >= 0) datos.representantes.forEach((r) => { const sel = f.querySelector(`select[name="cargo-${r}"]`); if (sel && sel.value) datos.cargos[r] = sel.value; });
        }
        try {
          if (!limpiarUsuario(datos.usuario)) throw new Error("Escribe el usuario");
          if (!datos.nombre.trim()) throw new Error("Escribe el nombre");
          const nuevo = nueva ? alta(st.borrador, datos) : editar(st.borrador, c.usuario, datos);
          const errores = validar(nuevo);
          if (errores.length) throw new Error(errores[0]);
          st.borrador = nuevo;
          ctx.cerrarDialogo();
          ctx.repintar();
        } catch (e) { d.querySelector("#cuenta-error").textContent = e.message; }
      });
    }

    async function guardar() {
      st.guardando = true; ctx.repintar();
      const tokens = tokensQueCrear(st.original, st.borrador, E.repos);
      const antes = (st.original.cuentas || []).map((c) => c.usuario), ahora = (st.borrador.cuentas || []).map((c) => c.usuario);
      const altas = ahora.filter((u) => antes.indexOf(u) < 0), bajas = antes.filter((u) => ahora.indexOf(u) < 0);
      const que = [altas.length ? "alta de " + altas.join(", ") : "", bajas.length ? "baja de " + bajas.join(", ") : ""].filter(Boolean).join(" y ") || "cambios en las cuentas";
      try {
        st.sha = await G.escribir(st.token, E.admin.cuentas, E.admin.cuentas.ruta, formatear(st.borrador), st.sha, "SweetSuite: " + que + " (Admin)");
        st.original = copia(st.borrador);
        ctx.ponerCatalogo(copia(st.borrador));
        ctx.aviso("Guardado. En uno o dos minutos estará publicado", "ok");
        if (tokens.length) mostrarTokens(tokens);
      } catch (e) {
        ctx.aviso(e.code === "CONFLICT" ? "Otro cambio se guardó a la vez: recarga y vuelve a hacerlo" : e.message, "error");
      }
      st.guardando = false; ctx.repintar();
    }

    function mostrarTokens(tokens) {
      const d = ctx.dialogo(`<h3>Tokens que hay que crear</h3>
        <p>En GitHub → Settings → Developer settings → Fine-grained tokens, uno por fila, con <b>Contents: Read and write</b>. Cada uno se pega en los Ajustes de su app.</p>
        <div class="tarjeta filas">${tokens.map((t) => ctx.fila(`<code>${esc(t.nombre)}</code>`, `Para ${esc(t.para)} · solo ${t.acceso.map((r) => "<code>" + esc(r) + "</code>").join(" y ")}`, "", "apilar")).join("")}</div>
        <div class="botones"><button class="btn primario" data-r="ok">Entendido</button></div>`);
      d.querySelector('[data-r="ok"]').onclick = () => ctx.cerrarDialogo();
    }

    function pedirToken() {
      const d = ctx.dialogo(`<h3>Token de Admin</h3>
        <p>Créalo en GitHub como <b>Admin-SweetSuite</b>: fine-grained, con acceso solo a <code>${esc(E.admin.cuentas.repo)}</code> y <code>${esc(E.admin.llavero.repo)}</code> y permiso <b>Contents: Read and write</b>.</p>
        <form class="form" id="f-token-admin">
          <input class="campo" name="token" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…">
          <p class="error" id="token-admin-error"></p>
          <div class="botones"><button type="button" class="btn" data-r="no">Cancelar</button><button class="btn primario">Guardar</button></div>
        </form>`);
      d.querySelector('[data-r="no"]').onclick = () => ctx.cerrarDialogo();
      d.querySelector("#f-token-admin").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const t = ev.target.token.value.trim(), err = d.querySelector("#token-admin-error");
        if (!t) return;
        err.textContent = "Comprobando…";
        try {
          await G.acceso(t, E.admin.cuentas);
          await G.acceso(t, E.admin.llavero);
        } catch (e) { err.textContent = e.message; return; }
        st.token = t; st.conectado = false;
        await guardarToken(t);
        ctx.cerrarDialogo();
        await cargar();
        ctx.repintar();
        ctx.preguntarCaducidad("admin");
      });
    }

    async function accion(el) {
      const a = el.dataset.adm, u = el.dataset.u;
      if (a === "token") pedirToken();
      else if (a === "recargar") { st.conectado = false; st.cargado = false; ctx.repintar(); await cargar(); ctx.repintar(); }
      else if (a === "nueva") formulario(null, el.dataset.tipo);
      else if (a === "editar") formulario(copia(st.borrador.cuentas.find((c) => c.usuario === u)), null);
      else if (a === "descartar") { st.borrador = copia(st.original); ctx.repintar(); }
      else if (a === "guardar") guardar();
      else if (a === "baja") {
        const c = st.borrador.cuentas.find((x) => x.usuario === u);
        const empresas = (st.borrador.cuentas || []).filter((x) => (x.representantes || []).indexOf(u) >= 0).map((x) => x.nombre);
        if (!(await ctx.confirmar(`¿Dar de baja a ${c.nombre}?`, "Sale de la lista y ya no podrá entrar en SweetSuite." +
          (empresas.length ? " También deja de representar a " + esc(empresas.join(", ")) + "." : "") +
          " Sus datos se quedan donde están: borrarlos solo puede hacerse desde GitHub. Recuerda borrar también sus tokens.", "Dar de baja", true))) return;
        st.borrador = baja(st.borrador, u);
        ctx.repintar();
      }
    }

    return { cargar, html, accion, cargado: () => st.cargado, avisoSalir: () => cambios() };
  }

  window.SweetAdmin = { CARGOS, validar, alta, editar, baja, tokensQueCrear, formatear, crearVista, limpiarUsuario };
})();
