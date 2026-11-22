"""Preparar la impresora Index por USB sin instalar los controladores de Index.

La Everest-D V4 por USB usa la clase de impresora estándar de Windows (usbprint.sys) y el
programa envía los datos en crudo (RAW), así que alcanza con una cola creada con el
controlador «Generic / Text Only» que ya trae Windows.

- Detección: solo lectura, sin administrador (PowerShell fijo, salida JSON).
- Preparación: lanza ``preparar_impresora.ps1`` elevado (un pedido de UAC) y espera su resultado.
- Nunca se interpolan datos del usuario en comandos: los valores validados viajan por variables
  de entorno y el script elevado tiene nombre de cola y controlador fijos.
"""

import json
import os
import re
import socket
import subprocess
import sys
import time

NOMBRE_COLA = "Braille Index (Editor Braille)"
CONTROLADOR = "Generic / Text Only"
URL_DESCARGAS = "https://www.indexbraille.com/support/downloads"
RE_PUERTO_USB = re.compile(r"^USB\d{3}$")
RE_COLA_INDEX = re.compile(r"index|everest|braille", re.IGNORECASE)
CREAR_SIN_VENTANA = 0x08000000 if sys.platform == "win32" else 0
ARCHIVO_RESULTADO = "preparar_impresora.json"

_PS_COMUN = ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]

# Detección: solo lectura. Salida: un único JSON.
GUION_DETECTAR = r"""
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$disp = @()
$base = 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\USB Monitor\Ports'
foreach ($d in (Get-PnpDevice -Class Printer)) {
  if ($d.InstanceId -notlike 'USBPRINT\*') { continue }
  $padre = (Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_Parent').Data
  $esIndex = ($d.InstanceId -match 'INDEX_BRAILLE|ENABLING_TECHNOLOGIE|AMERICAN_PRINTING_HO') -or ($padre -like '*VID_1868*')
  if (-not $esIndex) { continue }
  $puerto = $null
  if (Test-Path $base) {
    foreach ($k in (Get-ChildItem $base)) {
      if ((Get-ItemProperty $k.PSPath).'Device Id' -eq $padre) { $puerto = $k.PSChildName; break }
    }
  }
  $disp += [pscustomobject]@{ nombre = [string]$d.FriendlyName; estado = [string]$d.Status; instancia = [string]$d.InstanceId; padre = [string]$padre; puerto = [string]$puerto }
}
$colas = @()
foreach ($p in (Get-Printer)) {
  $colas += [pscustomobject]@{ nombre = [string]$p.Name; driver = [string]$p.DriverName; puerto = [string]$p.PortName; datatype = [string]$p.Datatype }
}
$res = [pscustomobject]@{ dispositivos = $disp; colas = $colas }
ConvertTo-Json -InputObject $res -Depth 4 -Compress
"""

# Lanzador elevado: los valores llegan por variables de entorno (ya validados), no por texto.
GUION_LANZAR_ELEVADO = r"""
$ErrorActionPreference = 'Stop'
$a = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $env:EB_SCRIPT + '" -Puerto ' + $env:EB_PUERTO
try {
  $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $a -PassThru
} catch {
  'CANCELADO'
  exit 0
}
'LANZADO'
try { $p.WaitForExit() } catch { }
"""


class ErrorImpresora(Exception):
    pass


# ------------------------------------------------------------------ validación
def validar_puerto_usb(valor):
    """Devuelve el puerto USB (p. ej. «USB004») o lanza ValueError."""
    texto = str(valor or "").strip().upper()
    if not RE_PUERTO_USB.match(texto):
        raise ValueError("El puerto USB no es válido (se esperaba algo como USB004).")
    return texto


def ruta_resultado():
    """Donde el script elevado deja su resultado: %ProgramData%\\EditorBraille (legible por cualquier usuario)."""
    base = os.environ.get("PROGRAMDATA") or r"C:\ProgramData"
    return os.path.join(base, "EditorBraille", ARCHIVO_RESULTADO)


def argumentos_lanzador(ruta_guion, puerto):
    """Comando y entorno extra para lanzar el script elevado. Devuelve (comando, entorno_extra)."""
    puerto = validar_puerto_usb(puerto)
    if not isinstance(ruta_guion, str) or not ruta_guion or "\x00" in ruta_guion or '"' in ruta_guion:
        raise ValueError("Ruta no válida.")
    comando = _PS_COMUN + ["-Command", GUION_LANZAR_ELEVADO]
    return comando, {"EB_SCRIPT": ruta_guion, "EB_PUERTO": puerto}


def cola_en_puerto(diagnostico, puerto):
    """Nombre de una cola existente sobre ese puerto USB, o None."""
    for d in diagnostico.get("dispositivos", []):
        if d["puerto"] == puerto and d["colas"]:
            return d["colas"][0]["nombre"]
    for c in diagnostico.get("colas", []):
        if c["puerto"].upper() == puerto:
            return c["nombre"]
    return None


# ------------------------------------------------------------------ detección
def _lista(valor):
    if valor is None:
        return []
    return valor if isinstance(valor, list) else [valor]


def _texto(d, clave):
    v = d.get(clave) if isinstance(d, dict) else None
    return "" if v is None else str(v)


def parsear_deteccion(salida):
    """Convierte la salida JSON de PowerShell en un diagnóstico para la interfaz."""
    if isinstance(salida, bytes):
        salida = salida.decode("utf-8", "replace")
    salida = (salida or "").strip().lstrip("﻿")
    try:
        datos = json.loads(salida) if salida else {}
    except ValueError:
        raise ErrorImpresora("No se pudo leer la respuesta de Windows.") from None
    if not isinstance(datos, dict):
        datos = {}
    colas = [{"nombre": _texto(c, "nombre"), "driver": _texto(c, "driver"),
              "puerto": _texto(c, "puerto"), "datatype": _texto(c, "datatype")}
             for c in _lista(datos.get("colas")) if isinstance(c, dict) and _texto(c, "nombre")]
    dispositivos = []
    for d in _lista(datos.get("dispositivos")):
        if not isinstance(d, dict):
            continue
        puerto = _texto(d, "puerto").upper()
        if not RE_PUERTO_USB.match(puerto):
            puerto = ""
        estado = _texto(d, "estado")
        dispositivos.append({
            "nombre": _texto(d, "nombre") or "Impresora Index", "estado": estado,
            "conectada": estado.upper() == "OK", "puerto": puerto,
            "colas": [c for c in colas if puerto and c["puerto"].upper() == puerto]})
    puertos = {d["puerto"] for d in dispositivos if d["puerto"]}
    otras = [c for c in colas
             if c["puerto"].upper() not in puertos and (RE_COLA_INDEX.search(c["nombre"])
                                                        or "index" in c["driver"].lower())]
    if any(d["colas"] for d in dispositivos):
        estado_gen = "lista"
    elif any(d["puerto"] and d["conectada"] for d in dispositivos):
        estado_gen = "falta_cola"
    elif otras:
        estado_gen = "lista"
    elif dispositivos:
        estado_gen = "desconectada"
    else:
        estado_gen = "no_encontrada"
    return {"estado": estado_gen, "dispositivos": dispositivos, "otras_colas": otras,
            "colas": colas, "cola_nueva": NOMBRE_COLA}


def puerto_para_preparar(diagnostico):
    """Puerto USB de la primera Index conectada y sin cola; None si no hay."""
    for d in diagnostico.get("dispositivos", []):
        if d["puerto"] and d["conectada"] and not d["colas"]:
            return d["puerto"]
    return None


def _ejecutar(comando, timeout, entorno=None):
    if sys.platform != "win32":
        raise ErrorImpresora("Preparar la impresora solo funciona en Windows.")
    env = dict(os.environ)
    env.update(entorno or {})
    try:
        r = subprocess.run(comando, capture_output=True, timeout=timeout, env=env,
                           stdin=subprocess.DEVNULL, creationflags=CREAR_SIN_VENTANA)
    except subprocess.TimeoutExpired:
        raise ErrorImpresora("Windows tardó demasiado en responder.") from None
    except OSError as e:
        raise ErrorImpresora(f"No se pudo ejecutar PowerShell: {e}") from None
    return r.returncode, r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")


def detectar(timeout=40):
    _, salida, _ = _ejecutar(_PS_COMUN + ["-Command", GUION_DETECTAR], timeout)
    if not salida.strip():
        raise ErrorImpresora("Windows no devolvió información de impresoras.")
    return parsear_deteccion(salida)


# ------------------------------------------------------------------ preparación
def parsear_resultado(texto):
    try:
        d = json.loads((texto or "").strip().lstrip("﻿"))
    except ValueError:
        return None
    if not isinstance(d, dict):
        return None
    return {"ok": d.get("ok") is True, "mensaje": str(d.get("mensaje") or ""),
            "cola": str(d.get("cola") or ""), "puerto": str(d.get("puerto") or "")}


def guion_preparar():
    """Ruta del .ps1 elevado: en motor/ (código fuente) o dentro del paquete congelado."""
    base = getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "motor", "preparar_impresora.ps1")


def preparar(puerto, espera=120.0, sondeo=2.0, gracia=15.0):
    """Pide administrador (UAC) y crea la cola. Devuelve el dict de resultado o lanza ErrorImpresora.

    El script elevado puede correr como otro usuario (técnico), por eso deja el resultado en
    %ProgramData%. Mientras espera, el programa también mira (solo lectura) si ya existe una cola
    sobre el puerto: si aparece, da la preparación por lograda aunque falte el JSON."""
    ruta_guion = guion_preparar()
    if not os.path.isfile(ruta_guion):
        raise ErrorImpresora("Falta el archivo preparar_impresora.ps1 del programa.")
    puerto = validar_puerto_usb(puerto)
    ruta_res = ruta_resultado()
    comando, entorno = argumentos_lanzador(ruta_guion, puerto)
    if sys.platform != "win32":
        raise ErrorImpresora("Preparar la impresora solo funciona en Windows.")
    try:
        os.remove(ruta_res)   # puede fallar si lo creó otro usuario: se compara la fecha del archivo
    except OSError:
        pass
    inicio = time.time() - 2
    env = dict(os.environ)
    env.update(entorno)
    try:
        proc = subprocess.Popen(comando, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env,
                                stdin=subprocess.DEVNULL, creationflags=CREAR_SIN_VENTANA)
    except OSError as e:
        raise ErrorImpresora(f"No se pudo ejecutar PowerShell: {e}") from None

    def resultado_fresco():
        try:
            if os.path.getmtime(ruta_res) < inicio:
                return None
            with open(ruta_res, "r", encoding="utf-8") as f:
                r = parsear_resultado(f.read())
            return r if r and r["puerto"] in ("", puerto) else None
        except OSError:
            return None

    def cola_lograda():
        try:
            cola = cola_en_puerto(detectar(timeout=30), puerto)
        except ErrorImpresora:
            return None
        return {"ok": True, "mensaje": "Cola creada.", "cola": cola, "puerto": puerto} if cola else None

    limite = time.monotonic() + espera
    fin_proc = None
    try:
        while time.monotonic() < limite:
            r = resultado_fresco()
            if r:
                return r
            if proc.poll() is not None:
                if fin_proc is None:
                    fin_proc = time.monotonic()
                    salida = proc.stdout.read().decode("utf-8", "replace")
                    if "LANZADO" not in salida:
                        return {"ok": False, "cancelado": True, "mensaje": (
                            "Cancelaste el permiso de Windows. No se creó nada; podés volver a intentarlo.")}
                elif time.monotonic() - fin_proc > gracia:
                    break
            r = cola_lograda()
            if r:
                return r
            time.sleep(sondeo)
    finally:
        if proc.poll() is None:
            if time.monotonic() >= limite:
                proc.kill()
    if fin_proc is not None:
        raise ErrorImpresora("El proceso con permisos de administrador terminó, pero no se creó la impresora "
                             "ni dejó un resultado. Probá de nuevo o pedí ayuda al técnico.")
    raise ErrorImpresora("Windows no confirmó a tiempo que la impresora quedó lista.")


# ------------------------------------------------------------------ red y descargas
def probar_red(ip, puerto, espera=4.0):
    """Abre y cierra una conexión TCP (sin enviar datos). ip y puerto ya validados."""
    try:
        with socket.create_connection((ip, int(puerto)), timeout=espera):
            return True, f"La impresora respondió en {ip}:{puerto}."
    except socket.timeout:
        return False, f"No hubo respuesta de {ip}:{puerto}. Revisá la IP y que esté encendida y en la misma red."
    except OSError:
        return False, f"No se pudo conectar con {ip}:{puerto}. Revisá la IP, el cable de red y el puerto."


def abrir_descargas():
    """Abre en el navegador la página oficial de descargas de Index (no descarga nada)."""
    if os.name == "nt":
        os.startfile(URL_DESCARGAS)  # URL fija del programa
    else:
        import webbrowser
        webbrowser.open(URL_DESCARGAS)
