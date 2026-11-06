#!/usr/bin/env python3
"""
SweetSuite — servidor de DESARROLLO.

Sirve SweetSuite en http://localhost:4500 y hace de GitHub para ella, sin salir
de este ordenador (adaptado del de Solvento):

  /__dev/api/repos/<owner>/<repo>                   el repositorio: si el token llega
  /__dev/api/repos/<owner>/<repo>/contents/<ruta>  como la API de contenidos (GET, PUT y DELETE)
  /__dev/raw/<owner>/<repo>/<rama>/<ruta>           como raw.githubusercontent
  /__dev/publico/solvento/<archivo>                 prices.json y tickers.json de
                                                    ../solvento, solo para leer

Los repositorios son carpetas de dev-data/ (que git ignora), todos privados:
  solvento-data-dev, ironrack-data-dev,
  agora-data-dev                          los de SweetSuite

Imita lo que importa de GitHub: sin token no se lee nada de un repositorio
privado (404), el sha de git, y los 401, 409 y 422 de una escritura mal hecha.
Un token con forma de real (ghp_…, github_pat_…) se rechaza: aquí vale «dev».

  python3 tools/dev/servidor.py               arranca en 127.0.0.1:4500
  python3 tools/dev/servidor.py --red         también desde la wifi (iPhone)
  python3 tools/dev/servidor.py --reiniciar   borra dev-data/ y empieza de cero
"""
import argparse
import base64
import hashlib
import json
import os
import posixpath
import shutil
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATOS = os.path.join(RAIZ, "dev-data")
SOLVENTO = os.path.abspath(os.path.join(RAIZ, "..", "solvento"))
PUERTO = 4500
LIMITE_API = 1024 * 1024

CUENTAS = None     # otra lista de cuentas en vez de cuentas.json (--cuentas)
PERMITIDOS = {"/", "/index.html", "/manifest.json", "/sw.js", "/cuentas.json", "/version.json"}
PREFIJOS = ("/src/", "/img/", "/apps/")
PUBLICOS = {"prices.json", "tickers.json"}
TOKENS_REALES = ("github_pat_", "ghp_", "gho_", "ghs_", "ghu_", "ghr_")


def crear_repositorios():
    """Una carpeta por repositorio, vacía."""
    for repo in ("solvento-data-dev", "ironrack-data-dev", "solvento-dev", "sweetsuite-dev", "sweetsuite-admin-dev"):
        os.makedirs(os.path.join(DATOS, repo), exist_ok=True)


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
            # Los repositorios de las apps (solvento-dev, sweetsuite-dev) son públicos, como los de verdad
            if partes[4].lower() not in ("solvento-dev", "sweetsuite-dev") and not self._token_valido():
                return self._bytes(404, b"404: Not Found")
            if not os.path.isfile(f):
                return self._bytes(404, b"404: Not Found")
            return self._bytes(200, open(f, "rb").read())
        if p == "/cuentas.json" and CUENTAS:
            return self._bytes(200, open(CUENTAS, "rb").read(), "application/json; charset=utf-8")
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

    def do_DELETE(self):
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
        try:
            f = ruta_datos(repo, ruta)
            largo = int(self.headers.get("Content-Length") or 0)
            cuerpo = json.loads(self.rfile.read(largo) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"message": "petición no válida"})
        if not os.path.isfile(f):
            return self._json(404, {"message": "Not Found"})
        if cuerpo.get("sha") != sha_git(open(f, "rb").read()):
            return self._json(409, {"message": f"{ruta} does not match {cuerpo.get('sha')}"})
        os.remove(f)
        apuntar(repo, ruta, cuerpo.get("message", ""), 0)
        return self._json(200, {"content": None, "commit": {"message": cuerpo.get("message", "")}})


def main():
    ap = argparse.ArgumentParser(description="Servidor de desarrollo de SweetSuite")
    ap.add_argument("--red", action="store_true", help="escuchar también en la wifi (para el iPhone)")
    ap.add_argument("--puerto", type=int, default=PUERTO)
    ap.add_argument("--reiniciar", action="store_true", help="borrar dev-data/ y empezar de cero")
    ap.add_argument("--datos", help="otra carpeta en vez de dev-data/ (las pruebas automáticas usan una propia)")
    ap.add_argument("--cuentas", help="otra lista de cuentas en vez de cuentas.json (las pruebas automáticas usan la suya)")
    args = ap.parse_args()

    global DATOS, CUENTAS
    if args.cuentas:
        CUENTAS = os.path.abspath(args.cuentas)
    if args.datos:
        DATOS = os.path.abspath(args.datos)

    if args.reiniciar and os.path.isdir(DATOS):
        shutil.rmtree(DATOS)
    os.makedirs(DATOS, exist_ok=True)
    crear_repositorios()

    host = "0.0.0.0" if args.red else "127.0.0.1"
    srv = ThreadingHTTPServer((host, args.puerto), Manejador)
    print(f"SweetSuite · DESARROLLO en http://localhost:{args.puerto}" + ("  (también en la wifi)" if args.red else ""))
    print(f"  datos: {DATOS}")
    print("  token de GitHub para probar: «dev» (y «malo» para probar uno que no vale)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
