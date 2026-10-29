/*
 * SweetSuite — En qué entorno se está y dónde vive cada cosa.
 *
 * Producción es UNA dirección: acasadovadillo.github.io. Cualquier otra
 * (localhost, la IP del Mac…) es desarrollo, y en desarrollo nada habla con
 * GitHub: el servidor de tools/dev/ hace de GitHub con datos de prueba.
 *
 * Las apps de dentro (apps/solvento, apps/ironrack) preguntan aquí, a través
 * de window.SweetSuite.entorno, en vez de decidirlo cada una.
 */
(function () {
  "use strict";
  const prod = location.hostname === "acasadovadillo.github.io";
  const origen = location.origin;

  const entorno = {
    prod,
    nombre: prod ? "produccion" : "desarrollo",
    // La API de contenidos de GitHub (o la que la imita en desarrollo)
    api: prod ? "https://api.github.com" : origen + "/__dev/api",
    // El repositorio privado de cada app: un archivo cifrado por cuenta y, al
    // lado, el llavero de la cuenta (<usuario>.llavero.json)
    repos: prod
      ? { solvento: { owner: "acasadovadillo", repo: "Solvento-Data", branch: "main" },
          ironrack: { owner: "acasadovadillo", repo: "Ironrack-Data", branch: "main" } }
      : { solvento: { owner: "dev", repo: "solvento-data-dev", branch: "main" },
          ironrack: { owner: "dev", repo: "ironrack-data-dev", branch: "main" } },
    // Donde guardaban las apps antes de SweetSuite. Solo se lee, para traer
    // los datos de cada cuenta la primera vez.
    antiguo: prod
      ? { owner: "acasadovadillo", repo: "datos-cifrados", branch: "main" }
      : { owner: "dev", repo: "datos-cifrados-dev", branch: "main" },
    // Los precios públicos de Solvento (prices.json, tickers.json). Al
    // renombrar el repositorio Solvento a Solvento-Price-Update (fase 8), esto
    // pasa a "/Solvento-Price-Update/".
    precios: prod ? "/Solvento/" : "/__dev/publico/solvento/",
  };

  // Que se vea siempre dónde se está
  if (!prod) {
    document.documentElement.setAttribute("data-entorno", "desarrollo");
    document.addEventListener("DOMContentLoaded", () => {
      const b = document.createElement("div");
      b.className = "banda-entorno";
      b.textContent = "DESARROLLO · datos de prueba";
      document.body.appendChild(b);
    });
  }

  window.SweetEntorno = entorno;
})();
