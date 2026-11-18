"""Servidor local del editor de coberturas braille.

Uso:  python app.py [--puerto 8777] [--sin-navegador]

Escucha solo en 127.0.0.1. Sirve la interfaz de ``web/`` y una API JSON.
"""

import argparse
import base64
import ipaddress
import json
import mimetypes
import os
import sys
import socket
import threading
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = "2.0.0"
CONGELADO = bool(getattr(sys, "frozen", False))   # True dentro del .exe de PyInstaller
# Recursos de solo lectura (web/, perfiles/): junto al script o dentro del paquete congelado.
BASE = getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

from motor import impresion, index_v4, pdf_io, perfil as perfil_mod  # noqa: E402

WEB = os.path.join(BASE, "web")
PERFIL_DEFECTO = os.path.join(BASE, "perfiles", "everest_v4.json")
RUTA_PERFIL = PERFIL_DEFECTO
MAX_SUBIDA = 40 * 1024 * 1024     # tope de cualquier cuerpo recibido (PDF incluido)
MAX_PDFS_RETENIDOS = 3            # documentos PDF abiertos en memoria
MAX_DPI = 200
MAX_HOJA_MM = 300.0               # A4 + margen
MAX_PUNTOS = 200000
MAX_PX_POR_MM = 12
CSP = ("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
       "script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; "
       "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
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
        while len(_orden_pdfs) > MAX_PDFS_RETENIDOS:
            viejo = _orden_pdfs.pop(0)
            item = _pdfs.pop(viejo, None)
            if item:
                try:
                    item[1].close()
                except Exception:  # noqa: BLE001
                    pass
    return ident, doc


def carpeta_datos():
    """Carpeta de datos locales: %LOCALAPPDATA%\\EditorBraille (en otros sistemas, ~/.local/share)."""
    base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "EditorBraille")


def preparar_datos_congelado():
    """En el .exe los datos escribibles (perfil editado, log) van a %LOCALAPPDATA%\EditorBraille.
    Copia el perfil por defecto la primera vez y redirige la salida de errores a log.txt."""
    global RUTA_PERFIL
    carpeta = carpeta_datos()
    os.makedirs(carpeta, exist_ok=True)
    RUTA_PERFIL = os.path.join(carpeta, "everest_v4.json")
    if not os.path.isfile(RUTA_PERFIL) and os.path.isfile(PERFIL_DEFECTO):
        import shutil
        shutil.copyfile(PERFIL_DEFECTO, RUTA_PERFIL)
    ruta_log = os.path.join(carpeta, "log.txt")
    try:
        if os.path.isfile(ruta_log) and os.path.getsize(ruta_log) > 512 * 1024:
            os.replace(ruta_log, ruta_log + ".1")
        log = open(ruta_log, "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log
        print(f"--- Editor Braille {VERSION} ---", flush=True)
    except OSError:
        pass


def _doc(ident):
    with _candado:
        item = _pdfs.get(ident)
    if not item:
        raise KeyError("El PDF ya no está cargado en el servidor; volvé a abrirlo.")
    return item[1]


def _puntos(cuerpo):
    pts = cuerpo.get("puntos") or []
    if not isinstance(pts, list):
        raise ValueError("«puntos» debe ser una lista.")
    if len(pts) > MAX_PUNTOS:
        raise ValueError(f"Demasiados puntos ({len(pts)}); el máximo es {MAX_PUNTOS}.")
    return [(float(p[0]), float(p[1])) for p in pts]


def _hoja(cuerpo):
    """Ancho y alto de la hoja en mm, validados."""
    try:
        w, h = float(cuerpo["ancho"]), float(cuerpo["alto"])
    except (TypeError, ValueError):
        raise ValueError("El tamaño de la hoja no es válido.") from None
    if not (0 < w <= MAX_HOJA_MM and 0 < h <= MAX_HOJA_MM):
        raise ValueError(f"La hoja debe medir entre 0 y {MAX_HOJA_MM:.0f} mm por lado.")
    return w, h


def validar_ip(texto):
    """Devuelve la IP como texto o lanza ValueError."""
    try:
        ip = ipaddress.ip_address((texto or "").strip())
    except ValueError:
        raise ValueError("La dirección IP de la impresora no es válida.") from None
    if ip.is_unspecified or ip.is_multicast:
        raise ValueError("La dirección IP de la impresora no es válida.")
    return str(ip)


def validar_puerto(valor):
    try:
        puerto = int(valor if valor not in (None, "") else 9100)
    except (TypeError, ValueError):
        raise ValueError("El puerto no es válido.") from None
    if not 1 <= puerto <= 65535:
        raise ValueError("El puerto debe estar entre 1 y 65535.")
    return puerto


def _perfil_de(cuerpo):
    return perfil_mod.completar(cuerpo.get("perfil") or perfil_mod.cargar(RUTA_PERFIL))


def generar_archivo(cuerpo):
    """Arma el archivo de impresión (.ibe o .prn). Devuelve (bytes, extension, avisos, info)."""
    perfil = perfil_mod.validar(_perfil_de(cuerpo))
    formato = cuerpo.get("formato") or perfil["codificador"]
    ancho, alto = _hoja(cuerpo)
    pts, w, h, avisos = perfil_mod.transformar(
        _puntos(cuerpo), ancho, alto, perfil,
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
    server_version = "EditorBraille/" + VERSION

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
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(datos)

    def _error(self, codigo, mensaje):
        self._responder(codigo, {"error": mensaje})

    def _leer_cuerpo(self):
        bruto = self.headers.get("Content-Length")
        if bruto is None or not bruto.strip().isdigit():
            raise ValueError("Content-Length ausente o no válido.")
        largo = int(bruto)
        if largo > MAX_SUBIDA:
            raise ValueError("El archivo es demasiado grande (máximo 40 MB).")
        return self.rfile.read(largo) if largo else b""

    def _error_interno(self, e):
        import traceback
        sys.stderr.write("Error interno:\n" + traceback.format_exc())
        return self._error(500, "Error interno del servidor. El detalle está en la ventana del programa.")

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
                    if not 0 <= n < len(doc):
                        return self._error(400, "Página inexistente.")
                    dpi = max(36, min(int(parse_qs(url.query).get("dpi", ["110"])[0]), MAX_DPI))
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
        except (ValueError, IndexError):
            return self._error(400, "Pedido no válido.")
        except Exception as e:  # noqa: BLE001
            return self._error_interno(e)

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
                cuerpo = self._json()
                if not isinstance(cuerpo, dict):
                    return self._error(400, "Perfil inválido: debe ser un objeto.")
                return self._responder(200, perfil_mod.guardar(RUTA_PERFIL, cuerpo))
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
                ancho, alto = _hoja(cuerpo)
                doc = _doc(cuerpo["pdf_id"]) if cuerpo.get("pdf_id") and cuerpo.get("fondo", True) else None
                datos = pdf_io.pdf_prueba(ancho, alto, _puntos(cuerpo),
                                          doc, int(cuerpo.get("pagina", 0)), True,
                                          cuerpo.get("titulo", ""))
                return self._archivo_json((cuerpo.get("nombre") or "braille") + "_prueba.pdf", datos)
            if ruta == "/api/exportar/png":
                cuerpo = self._json()
                ancho, alto = _hoja(cuerpo)
                ppm = max(1, min(int(cuerpo.get("px_por_mm", 10)), MAX_PX_POR_MM))
                datos = pdf_io.png_puntos(ancho, alto, _puntos(cuerpo), ppm)
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
            return self._error_interno(e)

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
        # Va a %LOCALAPPDATA%, fuera de la carpeta del proyecto (que puede estar en OneDrive).
        try:
            carpeta = carpeta_datos()
            os.makedirs(carpeta, exist_ok=True)
            with open(os.path.join(carpeta, "ultimo_trabajo." + ext), "wb") as f:
                f.write(datos)
        except OSError:
            pass
        sys.stderr.write(f"Imprimiendo {len(datos)} bytes ({ext}); encabezado: {datos[:70]!r}\n")
        if destino.get("tipo") == "red":
            ip = (destino.get("ip") or "").strip()
            if not ip:
                return self._error(400, "Falta la dirección IP de la impresora.")
            ip = validar_ip(ip)
            puerto = validar_puerto(destino.get("puerto"))
            for _ in range(copias):
                impresion.enviar_red(ip, puerto, datos)
            lugar = f"{ip}:{puerto}"
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


class ServidorExclusivo(ThreadingHTTPServer):
    """En Windows, SO_REUSEADDR deja que dos programas escuchen el mismo puerto.
    Se desactiva y se pide uso exclusivo, para que un puerto ocupado dé error y se pruebe otro."""
    allow_reuse_address = False

    def server_bind(self):
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def crear_servidor(puerto):
    for intento in range(puerto, puerto + 20):
        try:
            return ServidorExclusivo(("127.0.0.1", intento), Manejador)
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
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    ap = argparse.ArgumentParser(description="Editor de coberturas braille (servidor local)")
    ap.add_argument("--puerto", type=int,
                    default=int(os.environ.get("EDITOR_BRAILLE_PUERTO") or 8777))
    ap.add_argument("--sin-navegador", action="store_true")
    args = ap.parse_args()
    if CONGELADO:
        preparar_datos_congelado()
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
