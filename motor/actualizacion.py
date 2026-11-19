"""Búsqueda e instalación de actualizaciones del portable.

Todo es de la biblioteca estándar. Reglas de seguridad:
- redirecciones solo a https; el zip, además, solo en el mismo dominio que version.json;
- el Content-Type de version.json no se exige, pero el cuerpo debe ser JSON válido;
- solo https (http://127.0.0.1 únicamente con EDITOR_BRAILLE_PRUEBAS=1);
- version.json de 64 KB como máximo y zip de 300 MB como máximo;
- SHA256 obligatorio antes de descomprimir;
- el zip se descomprime validando que no haya rutas absolutas ni «..» (zip slip).
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.request
import zipfile
from urllib.parse import urlparse

MAX_VERSION_JSON = 64 * 1024
MAX_ZIP = 300 * 1024 * 1024
MAX_DESCOMPRIMIDO = 1024 * 1024 * 1024
TIMEOUT = 10
NOMBRE_EXE = "Editor Braille.exe"
_RE_VERSION = re.compile(r"^v?(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.\-]+))?$")
_RE_SHA = re.compile(r"^[0-9a-fA-F]{64}$")


class ErrorActualizacion(Exception):
    """Error con mensaje listo para mostrar al usuario."""


# ------------------------------------------------------------------ versiones
def parsear_version(texto):
    """'2.0.1' -> ((2, 0, 1), True). El segundo valor es False si es una preversión (2.1.0-beta)."""
    m = _RE_VERSION.match(texto.strip()) if isinstance(texto, str) else None
    if not m:
        raise ValueError(f"Versión no válida: {texto!r}")
    nums = [int(x) for x in m.group(1).split(".")]
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums), m.group(2) is None


def es_mas_nueva(nueva, actual):
    """Comparación semántica: True si «nueva» es posterior a «actual»."""
    (a, final_a), (b, final_b) = parsear_version(nueva), parsear_version(actual)
    largo = max(len(a), len(b))
    a, b = a + (0,) * (largo - len(a)), b + (0,) * (largo - len(b))
    return (a, final_a) > (b, final_b)


# ------------------------------------------------------------------ URL
def pruebas_activas():
    return os.environ.get("EDITOR_BRAILLE_PRUEBAS") == "1"


def validar_url(url):
    """Devuelve la URL o lanza ErrorActualizacion. Solo https (http local en modo pruebas)."""
    if not isinstance(url, str) or not url.strip():
        raise ErrorActualizacion("La dirección no es válida.")
    url = url.strip()
    try:
        p = urlparse(url)
        host = p.hostname
    except ValueError:
        raise ErrorActualizacion("La dirección no es válida.") from None
    if p.username or p.password or not host:
        raise ErrorActualizacion("La dirección no es válida.")
    if p.scheme == "https":
        return url
    if p.scheme == "http" and pruebas_activas() and host in ("127.0.0.1", "localhost", "::1"):
        return url
    raise ErrorActualizacion("La dirección de actualizaciones tiene que ser https.")


def _origen(url):
    p = urlparse(url)
    return (p.hostname or "").lower(), p.port or (443 if p.scheme == "https" else 80)


def mismo_dominio(url_a, url_b):
    return _origen(url_a) == _origen(url_b)


class _Redireccion(urllib.request.HTTPRedirectHandler):
    """Redirecciones solo a https (o http local en pruebas) y, si se pide, al mismo dominio."""

    def __init__(self, referencia=None):
        super().__init__()
        self.referencia = referencia

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validar_url(newurl)
        if self.referencia and not mismo_dominio(newurl, self.referencia):
            raise ErrorActualizacion("El servidor redirige a otro dominio: no se descarga.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _abrir(url, referencia=None):
    validar_url(url)
    opener = urllib.request.build_opener(_Redireccion(referencia))
    req = urllib.request.Request(url, headers={"User-Agent": "EditorBraille-actualizador"})
    return opener.open(req, timeout=TIMEOUT)


def descargar_bytes(url, maximo, tipos=None):
    """Descarga en memoria. Si «tipos» es una lista, se le agrega el Content-Type recibido."""
    try:
        with _abrir(url) as r:
            if tipos is not None:
                tipos.append((r.headers.get_content_type() or "").lower())
            largo = r.headers.get("Content-Length")
            if largo and largo.isdigit() and int(largo) > maximo:
                raise ErrorActualizacion("El archivo es demasiado grande.")
            datos = r.read(maximo + 1)
    except ErrorActualizacion:
        raise
    except (urllib.error.URLError, OSError, ValueError):
        raise ErrorActualizacion("Sin conexión o la dirección no responde.") from None
    if len(datos) > maximo:
        raise ErrorActualizacion("El archivo es demasiado grande.")
    return datos


def descargar_archivo(url, destino, maximo=MAX_ZIP, referencia=None):
    """Descarga a disco en bloques, con tope de tamaño. Devuelve el SHA256 calculado."""
    h = hashlib.sha256()
    total = 0
    try:
        with _abrir(url, referencia) as r, open(destino, "wb") as f:
            largo = r.headers.get("Content-Length")
            if largo and largo.isdigit() and int(largo) > maximo:
                raise ErrorActualizacion("El archivo de actualización es demasiado grande.")
            while True:
                bloque = r.read(1024 * 256)
                if not bloque:
                    break
                total += len(bloque)
                if total > maximo:
                    raise ErrorActualizacion("El archivo de actualización es demasiado grande.")
                h.update(bloque)
                f.write(bloque)
    except ErrorActualizacion:
        _borrar(destino)
        raise
    except (urllib.error.URLError, OSError, ValueError):
        _borrar(destino)
        raise ErrorActualizacion("Sin conexión o la descarga se cortó.") from None
    return h.hexdigest()


def _borrar(ruta):
    try:
        os.remove(ruta)
    except OSError:
        pass


# ------------------------------------------------------------------ version.json
def leer_version_json(datos, tipo=""):
    """Valida el contenido de version.json y devuelve {version, url, sha256, notas}.

    El Content-Type no se exige (algunos servidores sirven text/plain u octet-stream): lo que
    importa es que el cuerpo sea JSON válido. «tipo» solo mejora el mensaje de error."""
    try:
        d = json.loads(datos.decode("utf-8-sig"))
    except (ValueError, UnicodeDecodeError):
        if "html" in (tipo or ""):
            raise ErrorActualizacion("La dirección de actualizaciones devolvió una página web "
                                     "en lugar del archivo de versiones.") from None
        raise ErrorActualizacion("El archivo de versiones no es un JSON válido.") from None
    if not isinstance(d, dict):
        raise ErrorActualizacion("El archivo de versiones no es válido.")
    try:
        parsear_version(d.get("version"))
    except ValueError:
        raise ErrorActualizacion("El archivo de versiones no es válido.") from None
    notas = d.get("notas", "")
    url = d.get("url")
    sha = d.get("sha256")
    return {"version": d["version"].strip().lstrip("v"), "url": url if isinstance(url, str) else "",
            "sha256": sha.strip().lower() if isinstance(sha, str) else "",
            "notas": notas[:2000] if isinstance(notas, str) else ""}


def buscar(url_version, version_actual):
    """Devuelve ({hay, actual, nueva, notas}, info). Lanza ErrorActualizacion si falla."""
    if not url_version:
        raise ErrorActualizacion("No hay dirección de actualizaciones configurada.")
    tipos = []
    datos = descargar_bytes(url_version, MAX_VERSION_JSON, tipos)
    info = leer_version_json(datos, tipos[0] if tipos else "")
    return {"hay": es_mas_nueva(info["version"], version_actual), "actual": version_actual,
            "nueva": info["version"], "notas": info["notas"]}, info


# ------------------------------------------------------------------ sha256 y zip
def sha256_de(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1024 * 256), b""):
            h.update(bloque)
    return h.hexdigest()


def verificar_sha256(ruta, esperado):
    if not isinstance(esperado, str) or not _RE_SHA.match(esperado):
        raise ErrorActualizacion("Falta la huella SHA256 de la actualización: no se instala.")
    if sha256_de(ruta) != esperado.lower():
        raise ErrorActualizacion("La huella SHA256 no coincide: el archivo está dañado o fue alterado.")


def descomprimir_seguro(ruta_zip, destino):
    """Descomprime validando cada entrada contra zip slip. Devuelve la lista de rutas escritas."""
    destino_abs = os.path.realpath(destino)
    os.makedirs(destino_abs, exist_ok=True)
    escritas = []
    try:
        with zipfile.ZipFile(ruta_zip) as z:
            miembros = z.infolist()
            if sum(m.file_size for m in miembros) > MAX_DESCOMPRIMIDO:
                raise ErrorActualizacion("La actualización descomprimida es demasiado grande.")
            for m in miembros:                       # primero se valida todo
                nombre = m.filename.replace("\\", "/")
                partes = nombre.split("/")
                if (nombre.startswith("/") or re.match(r"^[A-Za-z]:", nombre)
                        or ".." in partes or "\x00" in nombre):
                    raise ErrorActualizacion("El zip tiene rutas no permitidas; no se instala.")
                if (m.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ErrorActualizacion("El zip tiene enlaces simbólicos; no se instala.")
                objetivo = os.path.realpath(os.path.join(destino_abs, *partes))
                if objetivo != destino_abs and not objetivo.startswith(destino_abs + os.sep):
                    raise ErrorActualizacion("El zip tiene rutas no permitidas; no se instala.")
            for m in miembros:
                partes = m.filename.replace("\\", "/").split("/")
                objetivo = os.path.join(destino_abs, *partes)
                if m.is_dir() or m.filename.endswith("/"):
                    os.makedirs(objetivo, exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(objetivo), exist_ok=True)
                with z.open(m) as origen, open(objetivo, "wb") as f:
                    shutil.copyfileobj(origen, f)
                escritas.append(objetivo)
    except zipfile.BadZipFile:
        raise ErrorActualizacion("El archivo descargado no es un zip válido.") from None
    return escritas


def carpeta_con_exe(raiz):
    """Carpeta (la raíz o una subcarpeta directa) que contiene «Editor Braille.exe»."""
    if os.path.isfile(os.path.join(raiz, NOMBRE_EXE)):
        return raiz
    for nombre in sorted(os.listdir(raiz)):
        sub = os.path.join(raiz, nombre)
        if os.path.isfile(os.path.join(sub, NOMBRE_EXE)):
            return sub
    raise ErrorActualizacion(f"La actualización no trae «{NOMBRE_EXE}».")


# ------------------------------------------------------------------ configuración
def url_configurada(constante, carpeta_datos):
    """config.json en la carpeta de datos tiene prioridad sobre la constante de app.py."""
    try:
        with open(os.path.join(carpeta_datos, "config.json"), encoding="utf-8") as f:
            u = json.load(f).get("url_actualizaciones")
        if isinstance(u, str) and u.strip():
            return u.strip()
    except (OSError, ValueError, AttributeError):
        pass
    return (constante or "").strip()


# ------------------------------------------------------------------ instalación
def carpeta_escribible(carpeta):
    prueba = os.path.join(carpeta, ".prueba_escritura")
    try:
        with open(prueba, "w") as f:
            f.write("x")
        os.remove(prueba)
        return True
    except OSError:
        return False


def escribir_actualizador(origen, destino, pid, carpeta_temporal):
    """Crea el .cmd que espera a que termine el programa, copia los archivos y lo reabre."""
    os.makedirs(carpeta_temporal, exist_ok=True)
    guion = os.path.join(carpeta_temporal, "actualizar_editor_braille.cmd")
    exe = os.path.join(destino, NOMBRE_EXE)
    pid = int(pid)
    lineas = [
        "@echo off",
        "setlocal",
        "set /a intentos=0",
        ":esperar",
        f'tasklist /FI "PID eq {pid}" 2>nul | find "{pid}" >nul',
        "if not errorlevel 1 (",
        "  set /a intentos+=1",
        "  if %intentos% GEQ 60 goto copiar",
        "  timeout /t 1 /nobreak >nul",
        "  goto esperar",
        ")",
        ":copiar",
        f'robocopy "{origen}" "{destino}" /E /R:5 /W:1 /NFL /NDL /NJH /NJS >nul',
        "if %errorlevel% GEQ 8 exit /b 1",
        f'start "" "{exe}"',
        "endlocal",
    ]
    with open(guion, "w", encoding="cp1252", newline="") as f:
        f.write("\r\n".join(lineas) + "\r\n")
    return guion


def lanzar_actualizador(guion):
    flags = 0
    if os.name == "nt":
        flags = (subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
                 | subprocess.CREATE_NEW_PROCESS_GROUP)
    subprocess.Popen(["cmd.exe", "/c", guion], creationflags=flags, close_fds=True,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def preparar_instalacion(url_version, version_actual, carpeta_datos):
    """Descarga y verifica la actualización. Devuelve (info, carpeta_origen)."""
    _, info = buscar(url_version, version_actual)
    if not es_mas_nueva(info["version"], version_actual):
        raise ErrorActualizacion(f"Ya tenés la última versión ({version_actual}).")
    url_zip = validar_url(info["url"])
    if not mismo_dominio(url_zip, url_version):
        raise ErrorActualizacion("El zip de la actualización tiene que estar en el mismo dominio "
                                 "que el archivo de versiones: no se instala.")
    if not _RE_SHA.match(info["sha256"]):
        raise ErrorActualizacion("Falta la huella SHA256 de la actualización: no se instala.")
    base = os.path.join(carpeta_datos, "actualizacion")
    carpeta = os.path.join(base, info["version"])
    if os.path.isdir(carpeta):
        shutil.rmtree(carpeta, ignore_errors=True)
    os.makedirs(base, exist_ok=True)
    ruta_zip = os.path.join(base, f"{info['version']}.zip")
    descargar_archivo(url_zip, ruta_zip, referencia=url_version)
    try:
        verificar_sha256(ruta_zip, info["sha256"])
        descomprimir_seguro(ruta_zip, carpeta)
    finally:
        _borrar(ruta_zip)
    return info, carpeta_con_exe(carpeta)
