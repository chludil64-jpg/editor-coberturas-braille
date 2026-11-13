"""Servidor local del editor de coberturas braille.

Uso:  python app.py [--puerto 8765] [--sin-navegador]

Escucha solo en 127.0.0.1. Sirve la interfaz de ``web/`` y una API JSON.
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
import threading
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

from motor import impresion, index_v4, pdf_io, perfil as perfil_mod  # noqa: E402

WEB = os.path.join(BASE, "web")
RUTA_PERFIL = os.path.join(BASE, "perfiles", "everest_v4.json")
MAX_SUBIDA = 80 * 1024 * 1024
CABECERA_PROPIA = "X-Editor-Braille"

_pdfs = {}          # id -> (bytes, documento)
_orden_pdfs = []
_candado = threading.Lock()


def _guardar_pdf(datos):
    doc = pdf_io.abrir(datos)
    ident = uuid.uuid4().hex[:12]
    with _candado:
        _pdfs[ident] = (datos, doc)
        _orden_pdfs.append(ident)
        while len(_orden_pdfs) > 6:
            viejo = _orden_pdfs.pop(0)
            _pdfs.pop(viejo, None)
    return ident, doc


def _doc(ident):
    with _candado:
        item = _pdfs.get(ident)
    if not item:
        raise KeyError("El PDF ya no está cargado en el servidor; volvé a abrirlo.")
    return item[1]


def _puntos(cuerpo):
    pts = cuerpo.get("puntos") or []
    return [(float(p[0]), float(p[1])) for p in pts]


def _perfil_de(cuerpo):
    return perfil_mod.completar(cuerpo.get("perfil") or perfil_mod.cargar(RUTA_PERFIL))


def generar_archivo(cuerpo):
    """Arma el archivo de impresión (.ibe o .prn). Devuelve (bytes, extension, avisos, info)."""
    perfil = _perfil_de(cuerpo)
    formato = cuerpo.get("formato") or perfil["codificador"]
    pts, w, h, avisos = perfil_mod.transformar(
        _puntos(cuerpo), cuerpo["ancho"], cuerpo["alto"], perfil,
        solo_ajuste=bool(cuerpo.get("solo_ajuste")))
    info = {"ancho_hoja": round(w, 2), "alto_hoja": round(h, 2), "puntos": len(pts)}
    if formato == "grilla":
        g = perfil["grilla"]
        extra = {}
        px = float(g.get("paso_x_mm") or g["paso_mm"])
        py = float(g.get("paso_y_mm") or g["paso_mm"])
        datos = index_v4.codificar_grilla(pts, w, h, px, g, info=extra, paso_y=py)
        info.update(extra)
        if extra.get("fusionados"):
            avisos.append(f"{extra['fusionados']} puntos coincidieron en la misma celda de la "
                          f"grilla de {px} × {py} mm y se unieron.")
        return datos, "prn", avisos, info
    encabezado, origen = perfil_mod.encabezado_para(perfil, w, h)
    datos = index_v4.codificar_punto_libre(pts, w, h, encabezado, origen,
                                           perfil["punto_libre"].get("terminador", "\n"),
                                           bool(perfil["punto_libre"].get("cierre_punto_y_coma", True)))
    return datos, "ibe", avisos, info


class Manejador(BaseHTTPRequestHandler):
    server_version = "EditorBraille/1.0"

    def log_message(self, formato, *args):  # registro breve en consola
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), formato % args))

    # ------------------------------------------------------------ utilidades
    def _host_valido(self):
        host = (self.headers.get("Host") or "").split(":")[0].strip("[]").lower()
        return host in ("127.0.0.1", "localhost", "::1")

    def _responder(self, codigo, datos, tipo="application/json; charset=utf-8", extra=None):
        if isinstance(datos, (dict, list)):
            datos = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        elif isinstance(datos, str):
            datos = datos.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(datos)

    def _error(self, codigo, mensaje):
        self._responder(codigo, {"error": mensaje})

    def _leer_cuerpo(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > MAX_SUBIDA:
            raise ValueError("El archivo es demasiado grande.")
        return self.rfile.read(largo) if largo else b""

    def _json(self):
        datos = self._leer_cuerpo()
        return json.loads(datos.decode("utf-8") or "{}")

    def _archivo_json(self, nombre, datos, avisos=None, info=None):
        self._responder(200, {"nombre": nombre, "base64": base64.b64encode(datos).decode("ascii"),
                              "bytes": len(datos), "avisos": avisos or [], "info": info or {}})

    # ------------------------------------------------------------ GET
    def do_GET(self):
        if not self._host_valido():
            return self._error(403, "Host no permitido.")
        url = urlparse(self.path)
        ruta = url.path
        try:
            if ruta == "/api/perfil":
                return self._responder(200, perfil_mod.cargar(RUTA_PERFIL))
            if ruta == "/api/perfil/defecto":
                return self._responder(200, perfil_mod.completar({}))
            if ruta == "/api/impresoras":
                return self._responder(200, {"impresoras": impresion.listar_impresoras()})
            if ruta.startswith("/api/pdf/"):
                partes = ruta.split("/")  # ['', 'api', 'pdf', id, recurso, n]
                if len(partes) == 6 and partes[4] == "pagina" and partes[5].endswith(".png"):
                    doc = _doc(partes[3])
                    n = int(partes[5][:-4])
                    dpi = int(parse_qs(url.query).get("dpi", ["110"])[0])
                    return self._responder(200, pdf_io.render_png(doc, n, dpi), "image/png")
                if len(partes) == 6 and partes[4] == "vectores":
                    doc = _doc(partes[3])
                    return self._responder(200, {"vectores": pdf_io.vectores(doc, int(partes[5]))})
                return self._error(404, "Recurso inexistente.")
            if ruta.startswith("/api/"):
                return self._error(404, "Recurso inexistente.")
            return self._estatico(ruta)
        except KeyError as e:
            return self._error(410, str(e.args[0]))
        except Exception as e:  # noqa: BLE001
            return self._error(500, f"Error interno: {e}")

    def _estatico(self, ruta):
        if ruta in ("", "/"):
            ruta = "/index.html"
        destino = os.path.normpath(os.path.join(WEB, ruta.lstrip("/")))
        if not destino.startswith(WEB + os.sep) or not os.path.isfile(destino):
            return self._error(404, "No encontrado.")
        tipo = mimetypes.guess_type(destino)[0] or "application/octet-stream"
        if tipo.startswith("text/") or tipo in ("application/javascript", "text/javascript"):
            tipo += "; charset=utf-8"
        with open(destino, "rb") as f:
            self._responder(200, f.read(), tipo)

    # ------------------------------------------------------------ POST / PUT
    def do_PUT(self):
        self.do_POST()

    def do_POST(self):
        if not self._host_valido():
            return self._error(403, "Host no permitido.")
        if self.headers.get(CABECERA_PROPIA) != "1":
            # Evita que otra página web le mande órdenes al servidor local.
            return self._error(403, "Falta la cabecera de la aplicación.")
        ruta = urlparse(self.path).path
        try:
            if ruta == "/api/pdf":
                datos = self._leer_cuerpo()
                if not datos.startswith(b"%PDF"):
                    return self._error(400, "El archivo no es un PDF.")
                ident, doc = _guardar_pdf(datos)
                return self._responder(200, {"id": ident, "paginas": pdf_io.info(doc)})
            if ruta == "/api/perfil":
                return self._responder(200, perfil_mod.guardar(RUTA_PERFIL, self._json()))
            if ruta == "/api/ibe/abrir":
                leido = index_v4.leer_ibe(self._leer_cuerpo())
                return self._responder(200, {
                    "encabezado": leido["encabezado"],
                    "paginas": [{"ancho": p["ancho"], "alto": p["alto"], "origen": p["origen"],
                                 "puntos": p["puntos"]} for p in leido["paginas"]]})
            if ruta == "/api/exportar/ibe" or ruta == "/api/exportar/prn":
                cuerpo = self._json()
                cuerpo["formato"] = "punto_libre" if ruta.endswith("ibe") else "grilla"
                datos, ext, avisos, info = generar_archivo(cuerpo)
                nombre = (cuerpo.get("nombre") or "braille") + "." + ext
                return self._archivo_json(nombre, datos, avisos, info)
            if ruta == "/api/exportar/pdf":
                cuerpo = self._json()
                doc = _doc(cuerpo["pdf_id"]) if cuerpo.get("pdf_id") and cuerpo.get("fondo", True) else None
                datos = pdf_io.pdf_prueba(float(cuerpo["ancho"]), float(cuerpo["alto"]), _puntos(cuerpo),
                                          doc, int(cuerpo.get("pagina", 0)), True,
                                          cuerpo.get("titulo", ""))
                return self._archivo_json((cuerpo.get("nombre") or "braille") + "_prueba.pdf", datos)
            if ruta == "/api/exportar/png":
                cuerpo = self._json()
                datos = pdf_io.png_puntos(float(cuerpo["ancho"]), float(cuerpo["alto"]), _puntos(cuerpo),
                                          int(cuerpo.get("px_por_mm", 10)))
                return self._archivo_json((cuerpo.get("nombre") or "braille") + ".png", datos)
            if ruta == "/api/imprimir":
                return self._imprimir(self._json())
            if ruta == "/api/apagar":
                self._responder(200, {"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return None
            return self._error(404, "Recurso inexistente.")
        except KeyError as e:
            return self._error(410 if "PDF" in str(e) else 400, f"Falta un dato: {e.args[0]}")
        except (ValueError, OSError) as e:
            return self._error(400, str(e))
        except Exception as e:  # noqa: BLE001
            return self._error(500, f"Error interno: {e}")

    def _imprimir(self, cuerpo):
        if cuerpo.get("confirmado") is not True:
            return self._error(400, "Falta la confirmación del usuario para imprimir.")
        datos, ext, avisos, info = generar_archivo(cuerpo)
        copias = max(1, min(int(cuerpo.get("copias", 1)), 50))
        destino = cuerpo.get("destino") or {}
        if ext == "ibe" and "V4" in (destino.get("nombre") or ""):
            return self._error(400, "La Everest-D V4 no acepta el formato punto libre (.ibe, da error 202). "
                                    "Elegí el formato «Grilla ESC BEL» en el diálogo de impresión.")
        # Copia del último trabajo enviado, para diagnóstico (se sobrescribe en cada envío).
        try:
            with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   "ultimo_trabajo." + ext), "wb") as f:
                f.write(datos)
        except OSError:
            pass
        sys.stderr.write(f"Imprimiendo {len(datos)} bytes ({ext}); encabezado: {datos[:70]!r}\n")
        if destino.get("tipo") == "red":
            ip = (destino.get("ip") or "").strip()
            if not ip:
                return self._error(400, "Falta la dirección IP de la impresora.")
            for _ in range(copias):
                impresion.enviar_red(ip, int(destino.get("puerto") or 9100), datos)
            lugar = f"{ip}:{destino.get('puerto') or 9100}"
        elif destino.get("tipo") == "windows":
            nombre = destino.get("nombre") or ""
            if nombre not in impresion.listar_impresoras():
                return self._error(400, f"La impresora «{nombre}» no está instalada.")
            for _ in range(copias):
                impresion.enviar_windows(nombre, datos, cuerpo.get("nombre") or "Braille")
            lugar = nombre
        else:
            return self._error(400, "Elegí un destino de impresión.")
        return self._responder(200, {"ok": True, "destino": lugar, "bytes": len(datos),
                                     "copias": copias, "formato": ext, "avisos": avisos, "info": info})


def crear_servidor(puerto):
    for intento in range(puerto, puerto + 20):
        try:
            return ThreadingHTTPServer(("127.0.0.1", intento), Manejador)
        except OSError:
            continue
    raise OSError("No hay puertos libres para el servidor.")


def abrir_navegador(url):
    """Abre el navegador predeterminado; en Windows usa el shell, que es más confiable."""
    try:
        if os.name == "nt":
            os.startfile(url)
            return
    except OSError:
        pass
    if not webbrowser.open(url):
        print(f"No se pudo abrir el navegador. Abrí a mano: {url}", flush=True)


def ya_esta_abierto(puerto):
    """True si ya hay un editor braille escuchando en ese puerto."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{puerto}/", timeout=1.5) as r:
            return b"braille" in r.read(4000).lower()
    except OSError:
        return False


def main():
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    ap = argparse.ArgumentParser(description="Editor de coberturas braille (servidor local)")
    ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--sin-navegador", action="store_true")
    args = ap.parse_args()
    if ya_esta_abierto(args.puerto):
        url = f"http://127.0.0.1:{args.puerto}/"
        print(f"El editor ya estaba abierto. Abriendo {url}", flush=True)
        if not args.sin_navegador:
            abrir_navegador(url)
        return
    servidor = crear_servidor(args.puerto)
    url = f"http://127.0.0.1:{servidor.server_address[1]}/"
    print("=" * 60, flush=True)
    print(" EDITOR DE COBERTURAS BRAILLE", flush=True)
    print(f" Abrí en el navegador: {url}", flush=True)
    print(" No cierres esta ventana mientras uses el programa.", flush=True)
    print("=" * 60, flush=True)
    if not args.sin_navegador:
        threading.Timer(0.6, lambda: abrir_navegador(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
