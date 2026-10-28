"""Servidor local para probar Ironrack: como `python3 -m http.server`, pero sin
caché, para que cada recarga traiga el JS recién editado.

    python3 tools/servir.py [puerto]     (por defecto 8771)

En localhost la app no habla con GitHub: usa un repositorio de mentira en el
navegador. Para probar con GitHub de verdad, abre http://localhost:8771/?real
"""
import functools, http.server, os, sys

class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8771
http.server.ThreadingHTTPServer(("127.0.0.1", puerto), functools.partial(SinCache, directory=raiz)).serve_forever()
