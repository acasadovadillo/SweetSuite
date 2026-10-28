/*
 * Ironrack — Temporizador de descanso entre series.
 *
 * Se arranca solo al marcar una serie. Cuenta hasta una HORA de fin, no hacia
 * atrás segundo a segundo: si el móvil bloquea la pantalla o la app pasa a
 * segundo plano, al volver marca lo que de verdad queda. Es cosa de este
 * dispositivo, así que vive en localStorage y no en el documento.
 */
(function () {
  "use strict";
  const IR = (window.IR = window.IR || {});
  const U = IR.u;
  const CLAVE = "ironrack_descanso";

  let T = { fin: 0, total: 0, avisado: false };
  try { T = Object.assign(T, JSON.parse(localStorage.getItem(CLAVE)) || {}); } catch (e) { /* sin guardar */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(T)); } catch (e) { /* nada */ } };

  // El sonido necesita que el AudioContext nazca de un toque del usuario; el
  // de marcar la serie sirve.
  let audio = null;
  function desbloquear() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (e) { audio = null; }
  }
  function pitar() {
    if (!audio || !IR.almacen.S.doc || IR.almacen.S.doc.ajustes.sonido === false) return;
    [0, 0.22, 0.44].forEach((t, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.35, audio.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t);
      o.stop(audio.currentTime + t + 0.2);
    });
  }

  function iniciar(seg) {
    desbloquear();
    T = { fin: Date.now() + seg * 1000, total: seg * 1000, avisado: false };
    guardar();
    pintar();
  }
  function sumar(seg) {
    if (!T.fin) return;
    T.fin = Math.max(Date.now() + 1000, T.fin + seg * 1000);
    T.total = Math.max(T.total + seg * 1000, 1000);
    T.avisado = false;
    guardar();
    pintar();
  }
  function parar() {
    T = { fin: 0, total: 0, avisado: false };
    guardar();
    pintar();
  }

  function pintar() {
    const el = document.getElementById("descanso");
    if (!el) return;
    const activo = T.fin && IR.almacen.S.doc && IR.almacen.S.doc.actual;
    if (!activo) { el.hidden = true; document.body.classList.remove("con-descanso"); return; }
    const queda = T.fin - Date.now();
    if (queda <= 0 && !T.avisado) {
      T.avisado = true;
      guardar();
      pitar();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    // Pasados unos segundos del final, se quita solo
    if (queda < -8000) { parar(); return; }
    const fraccion = T.total ? Math.max(0, Math.min(1, queda / T.total)) : 0;
    el.hidden = false;
    document.body.classList.add("con-descanso");
    el.classList.toggle("terminado", queda <= 0);
    // Los botones se crean una vez: rehacerlos cuatro veces por segundo se
    // comería algún toque.
    if (!el.firstChild) {
      el.innerHTML = `<div class="descanso-barra"></div>
        <div class="descanso-fila">
          <button class="icono" data-a="descansoMenos" aria-label="Quitar 15 segundos">−15</button>
          <div class="descanso-tiempo" aria-live="off"><small></small><b></b></div>
          <button class="icono" data-a="descansoMas" aria-label="Añadir 15 segundos">+15</button>
          <button class="btn" data-a="descansoSaltar"></button>
        </div>`;
    }
    el.querySelector(".descanso-barra").style.transform = "scaleX(" + fraccion.toFixed(4) + ")";
    el.querySelector(".descanso-tiempo small").textContent = queda > 0 ? "Descanso" : "¡A por la siguiente!";
    el.querySelector(".descanso-tiempo b").textContent = queda > 0 ? U.reloj(queda + 999) : "00:00";
    el.querySelector("[data-a=descansoSaltar]").textContent = queda > 0 ? "Saltar" : "Cerrar";
  }

  setInterval(pintar, 250);

  Object.assign(IR.acc, {
    descansoMas: () => sumar(15),
    descansoMenos: () => sumar(-15),
    descansoSaltar: () => parar(),
  });

  IR.descanso = { iniciar, parar, pintar, desbloquear };
})();
