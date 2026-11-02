/*
 * SweetSuite — El llavero de cada cuenta: la clave maestra, la contraseña y la
 * clave de recuperación.
 *
 * Cada cuenta tiene una CLAVE MAESTRA aleatoria (256 bits) que no cambia nunca.
 * De ella sale el secreto de cada app (HMAC-SHA256 con el nombre de la app),
 * que es con lo que cada app cifra su archivo, como antes lo cifraba con la
 * contraseña. La clave maestra va guardada en el llavero, envuelta dos veces:
 *
 *   · con la contraseña  (PBKDF2-SHA256, 600.000 iteraciones → AES-256-GCM)
 *   · con la clave de recuperación (160 bits aleatorios, 32 caracteres)
 *
 * Así, cambiar la contraseña o recuperarla con la clave de recuperación solo
 * vuelve a envolver la clave maestra: los archivos de las apps no se tocan.
 *
 * El llavero no tiene nada en claro que sirva sin la contraseña o la clave de
 * recuperación. Se guarda en este dispositivo y, en GitHub, al lado del archivo
 * de cada app (<usuario>.llavero.json en Solvento-Data e Ironrack-Data), para
 * que un dispositivo nuevo lo encuentre en cuanto tenga el token de una app.
 *
 * Una EMPRESA (ABIES) no tiene contraseña propia: su clave maestra va envuelta
 * una vez por cada representante, con una clave que sale de la contraseña de
 * la empresa Y de la del representante a la vez. Sin las dos no se abre nada.
 * Quién es representante lo dice cuentas.json; la app no da de alta a nadie.
 * Un representante nuevo (o uno que olvidó algo) entra la primera vez con la
 * clave de recuperación de la empresa, que le crea su entrada.
 *
 * Si alguna vez una cuenta acaba con dos llaveros distintos (se estrenó en dos
 * dispositivos sin conexión), se quedan los dos: gana el más antiguo y la
 * clave del otro pasa a «anteriores», cifrada con la ganadora. Las apps
 * intentan abrir con la actual y, si no, con las anteriores, y al guardar ya
 * cifran con la actual: nada se queda sin poder abrirse.
 */
(function () {
  "use strict";
  const ITER_CONTRASENA = 600000;
  const ITER_RECUPERACION = 20000;   // la clave de recuperación es imposible de adivinar
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const fallo = (msg, code) => { const e = new Error(msg); e.code = code; return e; };
  const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));
  function aB64(bytes) {
    let s = "";
    const a = new Uint8Array(bytes);
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s);
  }
  function deB64(b64) {
    const s = atob(b64);
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // ── Piezas de cifrado ──
  async function claveDeTexto(texto, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(texto), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function cifrar(bytes, clave) {
    const iv = aleatorio(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, bytes);
    return { iv: aB64(iv), ct: aB64(ct) };
  }
  async function descifrar(caja, clave) {
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(caja.iv) }, clave, deB64(caja.ct)));
    } catch (e) {
      throw fallo("No se abre con esa clave", "BAD_PASSWORD");
    }
  }
  async function hmac(bytesClave, texto) {
    const k = await crypto.subtle.importKey("raw", bytesClave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(texto)));
  }
  // Para lo que el llavero guarda cifrado con la propia clave maestra
  // (las anteriores y las preferencias), una clave derivada de ella.
  async function claveInterna(maestra) {
    const raw = await hmac(maestra, "SweetSuite/interno");
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  // El secreto de cada app: lo que la app usa como «contraseña» de su archivo
  async function secretoDeApp(maestra, app) {
    const b = await hmac(maestra, "SweetSuite/app/" + app);
    return aB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // ── Clave de recuperación: 160 bits en base32 de Crockford, de 4 en 4 ──
  const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function nuevaRecuperacion() {
    const b = aleatorio(20);
    let bits = "", s = "";
    b.forEach((x) => { bits += x.toString(2).padStart(8, "0"); });
    for (let i = 0; i < bits.length; i += 5) s += ALFABETO[parseInt(bits.slice(i, i + 5), 2)];
    return s.match(/.{4}/g).join("-");
  }
  // Lo escrito a mano: sin guiones ni espacios, en mayúsculas y con las letras
  // que se confunden con números corregidas (O → 0, I y L → 1).
  const normalizarRecuperacion = (s) => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0").replace(/[IL]/g, "1");
  const pareceRecuperacion = (s) => normalizarRecuperacion(s).length === 32;

  // ── El llavero ──
  async function envolver(maestra, texto, iter) {
    const salt = aleatorio(16);
    const caja = await cifrar(maestra, await claveDeTexto(texto, salt, iter));
    return Object.assign({ kdf: "PBKDF2-SHA256", iter, salt: aB64(salt) }, caja);
  }
  async function desenvolver(caja, texto) {
    return descifrar(caja, await claveDeTexto(texto, deB64(caja.salt), caja.iter));
  }

  // Crea un llavero nuevo. Devuelve { llavero, maestra, recuperacion }.
  // Uno «provisional» es el de un dispositivo que dice que la cuenta ya existe
  // en otro: no lleva clave de recuperación, y en cuanto aparezca el de GitHub,
  // gana ese. Con «empresa» ({ representante, contrasenaRep }), la contraseña
  // es la de la empresa y la maestra se envuelve para ese representante.
  async function crear(usuario, contrasena, { provisional = false, empresa = null } = {}) {
    const maestra = aleatorio(32);
    const recuperacion = provisional ? null : nuevaRecuperacion();
    const ahora = Date.now();
    let llavero = {
      v: 1, tipo: "llavero-sweetsuite", usuario,
      id: aB64(aleatorio(9)).replace(/[+/=]/g, "x"),
      creado: ahora, actualizado: ahora,
      provisional: provisional || undefined,
      contrasena: empresa ? null : await envolver(maestra, contrasena, ITER_CONTRASENA),
      recuperacion: recuperacion ? await envolver(maestra, normalizarRecuperacion(recuperacion), ITER_RECUPERACION) : null,
      anteriores: null,
      preferencias: null,
    };
    if (empresa) {
      llavero = await conRepresentante(llavero, maestra, contrasena, empresa.representante, empresa.contrasenaRep);
      if (recuperacion) llavero = await conParRecuperacion(llavero, recuperacion);
      llavero.actualizado = ahora;
    }
    return { llavero, maestra, recuperacion };
  }

  // Abre con la contraseña o con la clave de recuperación. Devuelve la maestra.
  async function abrir(llavero, contrasena) {
    if (!llavero.contrasena) throw fallo("Este llavero es de una empresa", "BAD_PASSWORD");
    return desenvolver(llavero.contrasena, contrasena);
  }

  // ── Empresas ──
  // La clave de cada representante sale de las dos contraseñas juntas
  const textoEmpresa = (empresa, rep, pwEmpresa, pwRep) => ["SweetSuite", empresa, rep, pwEmpresa, pwRep].join("\u0000");
  const esEmpresa = (ll) => !!ll && !!ll.representantes;
  async function conRepresentante(llavero, maestra, pwEmpresa, rep, pwRep) {
    const reps = Object.assign({}, llavero.representantes || {});
    reps[rep] = await envolver(maestra, textoEmpresa(llavero.usuario, rep, pwEmpresa, pwRep), ITER_CONTRASENA);
    // Ya no se abre con una sola contraseña (si era un llavero de antes)
    return Object.assign({}, llavero, { contrasena: null, representantes: reps, actualizado: Date.now() });
  }
  // Abre como representante. Un llavero de antes de ser empresa (con su
  // contraseña sola) se abre con la de la empresa, y quien entra lo convierte.
  async function abrirEmpresa(llavero, rep, pwEmpresa, pwRep) {
    if (llavero.representantes && llavero.representantes[rep]) {
      return desenvolver(llavero.representantes[rep], textoEmpresa(llavero.usuario, rep, pwEmpresa, pwRep));
    }
    if (llavero.contrasena) return abrir(llavero, pwEmpresa);
    throw fallo("Aún no tienes acceso a esta empresa", "SIN_REPRESENTANTE");
  }
  // Solo se quedan los representantes que siguen en cuentas.json
  function soloRepresentantes(llavero, lista) {
    if (!llavero.representantes) return llavero;
    const reps = {};
    Object.keys(llavero.representantes).forEach((r) => { if (lista.indexOf(r) >= 0) reps[r] = llavero.representantes[r]; });
    return Object.assign({}, llavero, { representantes: reps });
  }
  async function abrirConRecuperacion(llavero, codigo) {
    if (!llavero.recuperacion) throw fallo("Esta cuenta no tiene clave de recuperación", "SIN_RECUPERACION");
    return desenvolver(llavero.recuperacion, normalizarRecuperacion(codigo));
  }
  // Una u otra: lo que parezca una clave de recuperación se prueba como tal
  async function abrirConCualquiera(llavero, texto) {
    if (pareceRecuperacion(texto) && llavero.recuperacion) {
      try { return { maestra: await abrirConRecuperacion(llavero, texto), recuperada: true }; } catch (e) { /* sigue */ }
    }
    return { maestra: await abrir(llavero, texto), recuperada: false };
  }

  async function cambiarContrasena(llavero, maestra, nueva) {
    return Object.assign({}, llavero, { contrasena: await envolver(maestra, nueva, ITER_CONTRASENA), actualizado: Date.now() });
  }
  async function cambiarRecuperacion(llavero, maestra) {
    const recuperacion = nuevaRecuperacion();
    let nuevo = Object.assign({}, llavero, {
      recuperacion: await envolver(maestra, normalizarRecuperacion(recuperacion), ITER_RECUPERACION),
      provisional: undefined, actualizado: Date.now(),
    });
    // En una empresa, la clave de recuperación también abre las llaves de sus
    // apps restringidas: lleva su propio par, y quien tenga cada llave se la
    // entrega (ver «Llaves» más abajo)
    if (esEmpresa(nuevo)) nuevo = await conParRecuperacion(nuevo, recuperacion);
    return { llavero: nuevo, recuperacion };
  }

  // Las claves de llaveros que perdieron (ver arriba)
  async function anteriores(llavero, maestra) {
    if (!llavero.anteriores) return [];
    const b = await descifrar(llavero.anteriores, await claveInterna(maestra));
    return JSON.parse(dec.decode(b)).map(deB64);
  }
  async function conAnteriores(llavero, maestra, lista) {
    const unicas = [];
    lista.forEach((k) => { if (!igual(k, maestra) && !unicas.some((u) => igual(u, k))) unicas.push(k); });
    const caja = unicas.length ? await cifrar(enc.encode(JSON.stringify(unicas.map(aB64))), await claveInterna(maestra)) : null;
    return Object.assign({}, llavero, { anteriores: caja });
  }

  // Preferencias de la cuenta en SweetSuite (el color de acento), cifradas
  async function preferencias(llavero, maestra) {
    if (!llavero.preferencias) return {};
    try { return JSON.parse(dec.decode(await descifrar(llavero.preferencias, await claveInterna(maestra)))); }
    catch (e) { return {}; }
  }
  async function conPreferencias(llavero, maestra, prefs) {
    const caja = await cifrar(enc.encode(JSON.stringify(prefs || {})), await claveInterna(maestra));
    return Object.assign({}, llavero, { preferencias: caja, actualizado: Date.now() });
  }

  // Un dato pequeño de la cuenta, cifrado con su clave interna, para guardarlo
  // en el dispositivo (el resumen de cada app en el inicio)
  async function cifrarDato(maestra, obj) {
    return cifrar(enc.encode(JSON.stringify(obj)), await claveInterna(maestra));
  }
  async function descifrarDato(maestra, caja) {
    return JSON.parse(dec.decode(await descifrar(caja, await claveInterna(maestra))));
  }

  // ── Llaves de una app restringida (la de Tesorería: ver TESORERIA.md) ──────
  // En una empresa, todos los representantes abren la misma maestra, y de ella
  // sale el secreto de cada app. Una app que solo usan algunos (Solvento de
  // ABIES, solo Tesorería) cifra con SU PROPIA LLAVE, aleatoria, que no sale de
  // la maestra. La llave va envuelta para cada uno con su clave pública.
  //
  //   pares[destino]  = { kid, publica (JWK), privada (caja cifrada) }
  //                     destino: un representante, o «@recuperacion»
  //   llaves[app]     = [{ id, version, creado, para: { destino: caja }, anteriores }]
  //
  // La privada de un representante va cifrada con las dos contraseñas (como su
  // entrada); la de «@recuperacion», con la clave de recuperación de la empresa.
  // Una app puede tener varias versiones de su llave: la ACTUAL es la de versión
  // más alta (a igualdad, la de menor id, la mire quien la mire). Al rotar, la
  // nueva guarda las de antes en «anteriores», cifradas con ella.
  const RECUPERACION = "@recuperacion";
  const textoPar = (empresa, rep, pwEmpresa, pwRep) => textoEmpresa(empresa, rep, pwEmpresa, pwRep) + "\u0000par";
  const ECDH = { name: "ECDH", namedCurve: "P-256" };
  async function huella(jwk) {
    const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(jwk.x + "." + jwk.y)));
    return aB64(b.slice(0, 12));
  }
  async function cifrarPrivada(jwk, texto, iter) {
    const salt = aleatorio(16);
    const caja = await cifrar(enc.encode(JSON.stringify(jwk)), await claveDeTexto(texto, salt, iter));
    return Object.assign({ kdf: "PBKDF2-SHA256", iter, salt: aB64(salt) }, caja);
  }
  async function nuevoPar(texto, iter) {
    const k = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
    const publica = await crypto.subtle.exportKey("jwk", k.publicKey);
    const privada = await crypto.subtle.exportKey("jwk", k.privateKey);
    const pub = { kty: publica.kty, crv: publica.crv, x: publica.x, y: publica.y };
    return { kid: await huella(pub), publica: pub, privada: await cifrarPrivada(privada, texto, iter), creado: Date.now() };
  }
  async function abrirPrivada(par, texto) {
    const jwk = JSON.parse(dec.decode(await descifrar(par.privada, await claveDeTexto(texto, deB64(par.privada.salt), par.privada.iter))));
    return { kid: par.kid, clave: await crypto.subtle.importKey("jwk", jwk, ECDH, false, ["deriveBits"]) };
  }
  // La clave que envuelve una llave para un destino: ECDH con una clave de un
  // solo uso, y de ahí HKDF a AES-256-GCM
  async function claveCompartida(privada, publicaJwk, salt) {
    const pub = await crypto.subtle.importKey("jwk", publicaJwk, ECDH, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, privada, 256);
    const base = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode("SweetSuite/llave") },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function envolverPara(llave, par) {
    const efimera = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
    const epk = await crypto.subtle.exportKey("jwk", efimera.publicKey);
    const salt = aleatorio(16);
    const caja = await cifrar(llave, await claveCompartida(efimera.privateKey, par.publica, salt));
    return Object.assign({ kid: par.kid, epk: { kty: epk.kty, crv: epk.crv, x: epk.x, y: epk.y }, salt: aB64(salt) }, caja);
  }
  async function desenvolverPara(caja, privada) {
    return descifrar(caja, await claveCompartida(privada.clave, caja.epk, deB64(caja.salt)));
  }

  // El par de un representante: se crea si no lo tiene. Devuelve el llavero
  // (el mismo si no cambia) y su privada, abierta.
  async function conPar(llavero, rep, pwEmpresa, pwRep) {
    const texto = textoPar(llavero.usuario, rep, pwEmpresa, pwRep);
    const par = llavero.pares && llavero.pares[rep];
    if (par) {
      try { return { llavero, privada: await abrirPrivada(par, texto) }; }
      catch (e) { /* cambió alguna contraseña: se le hace uno nuevo, y quien tenga la llave se la vuelve a dar */ }
    }
    const nuevo = await nuevoPar(texto, ITER_CONTRASENA);
    const pares = Object.assign({}, llavero.pares, { [rep]: nuevo });
    return { llavero: Object.assign({}, llavero, { pares, actualizado: Date.now() }), privada: await abrirPrivada(nuevo, texto) };
  }
  // El par de la clave de recuperación de la empresa (al generarla, que es
  // cuando se tiene en la mano)
  async function conParRecuperacion(llavero, codigo) {
    const par = await nuevoPar(normalizarRecuperacion(codigo), ITER_RECUPERACION);
    return Object.assign({}, llavero, { pares: Object.assign({}, llavero.pares, { [RECUPERACION]: par }), actualizado: Date.now() });
  }
  async function abrirParRecuperacion(llavero, codigo) {
    const par = llavero.pares && llavero.pares[RECUPERACION];
    if (!par) return null;
    try { return await abrirPrivada(par, normalizarRecuperacion(codigo)); } catch (e) { return null; }
  }

  // ¿Cuál es la actual de una lista de versiones? Siempre la misma.
  const ordenVersiones = (a, b) => (b.version - a.version) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const versionesDe = (llavero, app) => ((llavero.llaves && llavero.llaves[app]) || []).slice().sort(ordenVersiones);

  // Lo que un destino puede abrir de una app: la llave actual (o null si aún no
  // se la han dado) y todas las anteriores que alcanza (por sus entregas y por
  // las «anteriores» de las que abre).
  async function abrirLlaves(llavero, app, destino, privada) {
    const versiones = versionesDe(llavero, app);
    const abiertas = {};
    for (const v of versiones) {
      const caja = v.para && v.para[destino];
      if (!caja || caja.kid !== privada.kid) continue;
      try { abiertas[v.id] = await desenvolverPara(caja, privada); } catch (e) { /* entrega rota: se rehará */ }
    }
    const extra = [], deLaActual = [];
    for (const v of versiones) {
      if (!abiertas[v.id] || !v.anteriores) continue;
      try {
        const k = await crypto.subtle.importKey("raw", abiertas[v.id], { name: "AES-GCM" }, false, ["decrypt"]);
        JSON.parse(dec.decode(await descifrar(v.anteriores, k))).forEach((b) => {
          extra.push(deB64(b));
          if (v === versiones[0]) deLaActual.push(deB64(b));
        });
      } catch (e) { /* nada */ }
    }
    const actual = versiones.length && abiertas[versiones[0].id] ? abiertas[versiones[0].id] : null;
    const todas = Object.keys(abiertas).map((id) => abiertas[id]).concat(extra);
    const anteriores = [];
    todas.forEach((k) => { if (!(actual && igual(k, actual)) && !anteriores.some((x) => igual(x, k))) anteriores.push(k); });
    // «sueltas»: llaves que este destino abre pero que la actual no lleva
    // dentro (dos dispositivos crearon o rotaron a la vez). Quien las vea, las
    // junta en una nueva: así a quien reciba la actual le basta con ella.
    const sueltas = actual ? anteriores.filter((k) => !deLaActual.some((x) => igual(x, k))).length : 0;
    return { actual, anteriores, hay: versiones.length > 0, sueltas };
  }

  // Una llave nueva para la app, envuelta para esos destinos (pares). Si ya
  // había alguna, es una ROTACIÓN: la nueva lleva dentro las de antes.
  async function nuevaLlave(llavero, app, destinos, deAntes) {
    const llave = aleatorio(32);
    const versiones = versionesDe(llavero, app);
    const para = {};
    for (const d of destinos) para[d] = await envolverPara(llave, llavero.pares[d]);
    let anteriores = null;
    if (deAntes && deAntes.length) {
      const k = await crypto.subtle.importKey("raw", llave, { name: "AES-GCM" }, false, ["encrypt"]);
      anteriores = await cifrar(enc.encode(JSON.stringify(deAntes.map(aB64))), k);
    }
    const v = {
      id: aB64(aleatorio(9)).replace(/[+/=]/g, "x"), version: versiones.length ? versiones[0].version + 1 : 1,
      creado: Date.now(), para, anteriores,
    };
    const llaves = Object.assign({}, llavero.llaves, { [app]: versiones.concat([v]) });
    return { llavero: Object.assign({}, llavero, { llaves, actualizado: Date.now() }), llave };
  }
  // Darle la llave actual a quien tiene acceso y aún no la tiene (o la tiene
  // envuelta para un par que ya no es el suyo)
  async function entregar(llavero, app, llave, destinos) {
    const versiones = versionesDe(llavero, app);
    if (!versiones.length) return llavero;
    const actual = versiones[0];
    const para = Object.assign({}, actual.para);
    let cambio = false;
    for (const d of destinos) {
      const par = llavero.pares && llavero.pares[d];
      if (!par || (para[d] && para[d].kid === par.kid)) continue;
      para[d] = await envolverPara(llave, par);
      cambio = true;
    }
    if (!cambio) return llavero;
    const nuevaActual = Object.assign({}, actual, { para });
    const llaves = Object.assign({}, llavero.llaves, { [app]: versiones.map((v) => (v === actual ? nuevaActual : v)) });
    return Object.assign({}, llavero, { llaves, actualizado: Date.now() });
  }
  // ¿Quién tiene la llave actual sin deber tenerla? (le quitaron el acceso)
  function sobranEn(llavero, app, destinos) {
    const versiones = versionesDe(llavero, app);
    if (!versiones.length) return [];
    return Object.keys(versiones[0].para || {}).filter((d) => destinos.indexOf(d) < 0);
  }
  // Una llave dada en bytes: el secreto de su app, igual que de una maestra
  const secretoDeLlave = (llave, app) => secretoDeApp(llave, app);

  // Juntar las piezas de las llaves de dos llaveros de la misma cuenta. El
  // resto del llavero se decide como siempre (gana uno); esto no se pierde:
  // una llave perdida serían datos que ya no se abren.
  function mezclarLlaves(base, otro) {
    if (!otro || (!otro.pares && !otro.llaves)) return base;
    const pares = Object.assign({}, base.pares);
    Object.keys(otro.pares || {}).forEach((d) => {
      const a = pares[d], b = otro.pares[d];
      // Dos pares del mismo destino (se hicieron a la vez): el más nuevo, que
      // es el de la contraseña de ahora; la llave se le vuelve a entregar.
      if (!a || (b.creado || 0) > (a.creado || 0)) pares[d] = b;
    });
    const llaves = Object.assign({}, base.llaves);
    Object.keys(otro.llaves || {}).forEach((app) => {
      const lista = (llaves[app] || []).slice();
      otro.llaves[app].forEach((v) => {
        const i = lista.findIndex((x) => x.id === v.id);
        if (i < 0) { lista.push(v); return; }
        const para = Object.assign({}, lista[i].para);
        // De cada destino, la entrega hecha para su par de ahora
        Object.keys(v.para || {}).forEach((d) => {
          if (!para[d] || (pares[d] && v.para[d].kid === pares[d].kid && para[d].kid !== pares[d].kid)) para[d] = v.para[d];
        });
        lista[i] = Object.assign({}, lista[i], { para, anteriores: lista[i].anteriores || v.anteriores });
      });
      llaves[app] = lista;
    });
    const r = Object.assign({}, base);
    if (Object.keys(pares).length) r.pares = pares;
    if (Object.keys(llaves).length) r.llaves = llaves;
    return r;
  }

  // Entre dos llaveros distintos de la misma cuenta, cuál se queda. Siempre el
  // mismo, lo mire quien lo mire: si no, dos dispositivos se lo cambiarían el
  // uno al otro sin fin.
  function ganador(a, b) {
    if (!!a.provisional !== !!b.provisional) return a.provisional ? b : a;
    if (a.creado !== b.creado) return a.creado < b.creado ? a : b;
    return a.id < b.id ? a : b;
  }

  const esLlavero = (x) => !!x && x.tipo === "llavero-sweetsuite" && x.v === 1 && !!(x.contrasena || x.representantes);

  window.SweetLlavero = {
    crear, abrir, abrirConRecuperacion, abrirConCualquiera, cambiarContrasena, cambiarRecuperacion,
    anteriores, conAnteriores, preferencias, conPreferencias, secretoDeApp, ganador, esLlavero,
    esEmpresa, conRepresentante, abrirEmpresa, soloRepresentantes, cifrarDato, descifrarDato,
    nuevaRecuperacion, normalizarRecuperacion, pareceRecuperacion, igual,
    RECUPERACION, conPar, conParRecuperacion, abrirParRecuperacion, abrirLlaves, nuevaLlave, entregar, sobranEn,
    secretoDeLlave, mezclarLlaves,
  };
})();
