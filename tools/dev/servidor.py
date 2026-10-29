#!/usr/bin/env python3
"""
SweetSuite — servidor de DESARROLLO.

Sirve SweetSuite en http://localhost:4500 y hace de GitHub para ella, sin salir
de este ordenador (adaptado del de Solvento):

  /__dev/api/repos/<owner>/<repo>                   el repositorio: si el token llega
  /__dev/api/repos/<owner>/<repo>/contents/<ruta>  como la API de contenidos (GET y PUT)
  /__dev/raw/<owner>/<repo>/<rama>/<ruta>           como raw.githubusercontent
  /__dev/publico/solvento/<archivo>                 prices.json y tickers.json de
                                                    ../solvento, solo para leer

Los repositorios son carpetas de dev-data/ (que git ignora), todos privados:
  solvento-data-dev, ironrack-data-dev   los de SweetSuite
  datos-cifrados-dev                      el de antes, con datos FICTICIOS del
                                          Solvento antiguo (contraseña «desarrollo»)
                                          para probar la mudanza

Imita lo que importa de GitHub: sin token no se lee nada de un repositorio
privado (404), el sha de git, y los 401, 409 y 422 de una escritura mal hecha.
Un token con forma de real (ghp_…, github_pat_…) se rechaza: aquí vale «dev».

  python3 tools/dev/servidor.py               arranca en 127.0.0.1:4500
  python3 tools/dev/servidor.py --red         también desde la wifi (iPhone)
  python3 tools/dev/servidor.py --reiniciar   borra dev-data/ y vuelve a sembrar
"""
import argparse
import base64
import hashlib
import json
import os
import posixpath
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATOS = os.path.join(RAIZ, "dev-data")
SOLVENTO = os.path.abspath(os.path.join(RAIZ, "..", "solvento"))
PUERTO = 4500
CLAVE_DEV = "desarrollo"
LIMITE_API = 1024 * 1024

PERMITIDOS = {"/", "/index.html", "/manifest.json", "/sw.js", "/cuentas.json"}
PREFIJOS = ("/src/", "/img/", "/apps/")
PUBLICOS = {"prices.json", "tickers.json"}
TOKENS_REALES = ("github_pat_", "ghp_", "gho_", "ghs_", "ghu_", "ghr_")


# ── Cifrado: el formato de las apps (PBKDF2-SHA256 310.000 + AES-256-GCM) ──
def cifrar(doc, clave):
    # Con Node (crypto de serie), para no depender de librerías de Python
    node = shutil.which("node") or os.path.expanduser("~/.local/node/bin/node")
    js = (
        "const c=require('crypto');let e='';process.stdin.on('data',d=>e+=d).on('end',()=>{"
        "const {doc,clave}=JSON.parse(e);const sal=c.randomBytes(16),iv=c.randomBytes(12);"
        "const k=c.pbkdf2Sync(clave,sal,310000,32,'sha256');const ci=c.createCipheriv('aes-256-gcm',k,iv);"
        "const ct=Buffer.concat([ci.update(JSON.stringify(doc),'utf8'),ci.final(),ci.getAuthTag()]);"
        "process.stdout.write(JSON.stringify({v:1,kdf:'PBKDF2-SHA256',iter:310000,salt:sal.toString('base64'),"
        "iv:iv.toString('base64'),ct:ct.toString('base64')}))});"
    )
    r = subprocess.run([node, "-e", js], input=json.dumps({"doc": doc, "clave": clave}).encode(), capture_output=True, check=True)
    return json.loads(r.stdout)


def doc_finanzas(nombre):
    """Unas finanzas de mentira: dos cuentas y tres apuntes."""
    return {
        "movimientos": [
            {"id": "m1", "fecha": "05/09/2026", "tipo": "Ingreso", "importe": "1800", "cuenta_destino": "Banco de prueba",
             "tipo_ingreso": "Nómina", "detalle": f"Nómina de {nombre} (ficticio)"},
            {"id": "m2", "fecha": "12/09/2026", "tipo": "Gasto", "importe": "62.4", "cuenta_origen": "Banco de prueba",
             "tipo_gasto": "Supermercado", "detalle": "Compra (ficticio)"},
            {"id": "m3", "fecha": "20/09/2026", "tipo": "Traspaso", "importe": "100", "cuenta_origen": "Banco de prueba",
             "cuenta_destino": "Efectivo", "detalle": "Sacar efectivo (ficticio)"},
        ],
        "inversiones": [], "propiedades": [], "pasivos": [], "cobros": [],
        "config": {"cuentas": [{"cuenta": "Banco de prueba", "accent": "#0ea5e9"},
                               {"cuenta": "Efectivo", "accent": "#2d9e5f", "emoji": "💵"}],
                   "activos": []},
    }


def sembrar():
    """El repositorio de antes, con datos ficticios del Solvento antiguo."""
    hechas = []
    antiguos = {
        "Solvento/alberto-solvento.enc": doc_finanzas("Alberto"),
        "Solvento/abies-solvento.enc": doc_finanzas("ABIES"),
        "Solvento/hafsa-solvento.enc": doc_finanzas("Hafsa"),
        "Solvento/paula-solvento.enc": doc_finanzas("Paula"),
    }
    for ruta, doc in antiguos.items():
        destino = ruta_datos("datos-cifrados-dev", ruta)
        if os.path.exists(destino):
            continue
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8") as f:
            json.dump(cifrar(doc, CLAVE_DEV), f)
        hechas.append(ruta)
    for repo in ("solvento-data-dev", "ironrack-data-dev", "solvento-dev"):
        os.makedirs(os.path.join(DATOS, repo), exist_ok=True)
    return hechas


# ── Rutas dentro de dev-data, sin escaparse ──
def ruta_datos(repo, ruta):
    if ".." in str(ruta).replace("\\", "/").split("/"):
        raise ValueError("ruta no válida")
    limpia = posixpath.normpath("/" + ruta).lstrip("/")
    if not limpia or not repo or "/" in repo or repo.startswith(".") or not repo.lower().endswith("-dev"):
        raise ValueError("ruta no válida")
    final = os.path.abspath(os.path.join(DATOS, repo, limpia))
    if not final.startswith(os.path.abspath(DATOS) + os.sep):
        raise ValueError("ruta fuera de dev-data")
    return final


def sha_git(datos):
    return hashlib.sha1(b"blob %d\0" % len(datos) + datos).hexdigest()


def apuntar(repo, ruta, mensaje, n):
    with open(os.path.join(DATOS, ".historial.log"), "a", encoding="utf-8") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')}  {repo}/{ruta}  {n} bytes  {mensaje}\n")


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RAIZ, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    def _json(self, codigo, obj):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _bytes(self, codigo, datos, tipo="text/plain; charset=utf-8"):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _token(self):
        t = (self.headers.get("Authorization") or "")
        for p in ("Bearer ", "token "):
            t = t.replace(p, "")
        return t.strip()

    def _token_valido(self):
        t = self._token()
        return bool(t) and t != "malo" and not t.startswith(TOKENS_REALES)

    def _api(self):
        partes = unquote(urlparse(self.path).path).split("/")
        if len(partes) < 8 or partes[3] != "repos" or partes[6] != "contents":
            return None
        return partes[5], "/".join(partes[7:])

    def do_GET(self):
        p = unquote(urlparse(self.path).path)
        if p.startswith("/__dev/publico/solvento/"):
            nombre = p.rsplit("/", 1)[-1]
            f = os.path.join(SOLVENTO, nombre)
            if nombre not in PUBLICOS or not os.path.isfile(f):
                return self._bytes(404, b"404: Not Found")
            return self._bytes(200, open(f, "rb").read(), "application/json; charset=utf-8")
        if p.startswith("/__dev/api/"):
            partes = p.split("/")
            if len(partes) == 6 and partes[3] == "repos":
                repo = partes[5]
                if not self._token_valido():
                    return self._json(404 if self._token() != "malo" else 401, {"message": "Not Found"})
                return self._json(200, {"name": repo, "full_name": f"{partes[4]}/{repo}", "private": True,
                                        "permissions": {"pull": True, "push": True}})
            dest = self._api()
            if not dest:
                return self._json(404, {"message": "Not Found"})
            repo, ruta = dest
            if self._token() == "malo":
                return self._json(401, {"message": "Bad credentials"})
            if not self._token_valido():
                return self._json(404, {"message": "Not Found"})
            try:
                f = ruta_datos(repo, ruta)
            except ValueError:
                return self._json(400, {"message": "ruta no válida"})
            if not os.path.isfile(f):
                return self._json(404, {"message": "Not Found"})
            datos = open(f, "rb").read()
            if "application/vnd.github.raw" in (self.headers.get("Accept") or ""):
                return self._bytes(200, datos, "application/octet-stream")
            grande = len(datos) > LIMITE_API
            return self._json(200, {"name": os.path.basename(f), "path": ruta, "sha": sha_git(datos),
                                    "size": len(datos), "encoding": "none" if grande else "base64",
                                    "content": "" if grande else base64.b64encode(datos).decode()})
        if p.startswith("/__dev/raw/"):
            partes = p.split("/")
            if len(partes) < 7:
                return self._bytes(404, b"404: Not Found")
            try:
                f = ruta_datos(partes[4], "/".join(partes[6:]))
            except ValueError:
                return self._bytes(404, b"404: Not Found")
            # El repositorio de la app de Solvento (solvento-dev) es público, como el de verdad
            if partes[4].lower() != "solvento-dev" and not self._token_valido():
                return self._bytes(404, b"404: Not Found")
            if not os.path.isfile(f):
                return self._bytes(404, b"404: Not Found")
            return self._bytes(200, open(f, "rb").read())
        if p in PERMITIDOS or p.startswith(PREFIJOS):
            if ".." in p.split("/") or "/tools/" in p:
                return self._bytes(404, b"404: Not Found")
            return super().do_GET()
        return self._bytes(404, b"404: Not Found")

    def do_HEAD(self):
        return self.do_GET()

    def do_PUT(self):
        p = unquote(urlparse(self.path).path)
        if not p.startswith("/__dev/api/"):
            return self._json(405, {"message": "Method Not Allowed"})
        dest = self._api()
        if not dest:
            return self._json(404, {"message": "Not Found"})
        repo, ruta = dest
        if not self._token():
            return self._json(401, {"message": "Requires authentication"})
        if not self._token_valido():
            return self._json(401 if self._token() == "malo" else 403, {"message": "En desarrollo vale el token «dev», no uno real."})
        if repo.lower() == "datos-cifrados-dev":
            return self._json(403, {"message": "El repositorio de antes solo se lee."})
        try:
            f = ruta_datos(repo, ruta)
            largo = int(self.headers.get("Content-Length") or 0)
            cuerpo = json.loads(self.rfile.read(largo) or b"{}")
            nuevo = base64.b64decode(cuerpo.get("content", ""))
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"message": "petición no válida"})
        existe = os.path.isfile(f)
        if existe:
            actual = sha_git(open(f, "rb").read())
            if not cuerpo.get("sha"):
                return self._json(422, {"message": "\"sha\" wasn't supplied."})
            if cuerpo["sha"] != actual:
                return self._json(409, {"message": f"{ruta} does not match {cuerpo['sha']}"})
        os.makedirs(os.path.dirname(f), exist_ok=True)
        tmp = f + ".tmp"
        with open(tmp, "wb") as out:
            out.write(nuevo)
        os.replace(tmp, f)
        apuntar(repo, ruta, cuerpo.get("message", ""), len(nuevo))
        return self._json(200 if existe else 201, {
            "content": {"name": os.path.basename(f), "path": ruta, "sha": sha_git(nuevo)},
            "commit": {"message": cuerpo.get("message", "")},
        })


def main():
    ap = argparse.ArgumentParser(description="Servidor de desarrollo de SweetSuite")
    ap.add_argument("--red", action="store_true", help="escuchar también en la wifi (para el iPhone)")
    ap.add_argument("--puerto", type=int, default=PUERTO)
    ap.add_argument("--reiniciar", action="store_true", help="borrar dev-data/ y volver a sembrar")
    args = ap.parse_args()

    if args.reiniciar and os.path.isdir(DATOS):
        shutil.rmtree(DATOS)
    os.makedirs(DATOS, exist_ok=True)
    hechas = sembrar()

    host = "0.0.0.0" if args.red else "127.0.0.1"
    srv = ThreadingHTTPServer((host, args.puerto), Manejador)
    print(f"SweetSuite · DESARROLLO en http://localhost:{args.puerto}" + ("  (también en la wifi)" if args.red else ""))
    print(f"  datos: {DATOS}")
    if hechas:
        print(f"  datos del Solvento antiguo sembrados ({len(hechas)}), contraseña «{CLAVE_DEV}»")
    print("  token de GitHub para probar: «dev» (y «malo» para probar uno que no vale)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
