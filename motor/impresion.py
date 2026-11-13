"""Envío de trabajos a la impresora braille.

- Windows: envío RAW al spooler con ``winspool.drv`` vía ctypes (sin pywin32).
- Red: socket TCP directo (puerto 9100 por defecto).

El servidor solo llama a estas funciones cuando la interfaz manda la
confirmación explícita del usuario.
"""

import ctypes
import socket
import sys

PRINTER_ENUM_LOCAL = 0x2
PRINTER_ENUM_CONNECTIONS = 0x4


def _winspool():
    if sys.platform != "win32":
        raise OSError("La impresión directa por el spooler solo funciona en Windows.")
    from ctypes import wintypes  # noqa: F401  (se importa solo en Windows)
    return ctypes.WinDLL("winspool.drv", use_last_error=True)


class _PRINTER_INFO_4(ctypes.Structure):
    _fields_ = [("pPrinterName", ctypes.c_wchar_p),
                ("pServerName", ctypes.c_wchar_p),
                ("Attributes", ctypes.c_uint32)]


class _DOC_INFO_1(ctypes.Structure):
    _fields_ = [("pDocName", ctypes.c_wchar_p),
                ("pOutputFile", ctypes.c_wchar_p),
                ("pDatatype", ctypes.c_wchar_p)]


def listar_impresoras():
    """Nombres de las impresoras instaladas en Windows (lista vacía si no hay)."""
    try:
        ws = _winspool()
    except OSError:
        return []
    flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
    necesarios = ctypes.c_uint32(0)
    cantidad = ctypes.c_uint32(0)
    ws.EnumPrintersW(flags, None, 4, None, 0, ctypes.byref(necesarios), ctypes.byref(cantidad))
    if necesarios.value == 0:
        return []
    buf = ctypes.create_string_buffer(necesarios.value)
    ok = ws.EnumPrintersW(flags, None, 4, buf, necesarios, ctypes.byref(necesarios),
                          ctypes.byref(cantidad))
    if not ok:
        return []
    arreglo = ctypes.cast(buf, ctypes.POINTER(_PRINTER_INFO_4))
    return [arreglo[i].pPrinterName for i in range(cantidad.value) if arreglo[i].pPrinterName]


def enviar_windows(nombre_impresora, datos, nombre_trabajo="Braille"):
    """Envía ``datos`` en crudo (RAW) a una impresora de Windows."""
    ws = _winspool()
    manejador = ctypes.c_void_p()
    if not ws.OpenPrinterW(nombre_impresora, ctypes.byref(manejador), None):
        raise OSError(f"No se pudo abrir la impresora «{nombre_impresora}» "
                      f"(error {ctypes.get_last_error()}).")
    try:
        info = _DOC_INFO_1(nombre_trabajo, None, "RAW")
        trabajo = ws.StartDocPrinterW(manejador, 1, ctypes.byref(info))
        if not trabajo:
            raise OSError(f"No se pudo iniciar el trabajo (error {ctypes.get_last_error()}).")
        try:
            if not ws.StartPagePrinter(manejador):
                raise OSError("No se pudo iniciar la página.")
            escritos = ctypes.c_uint32(0)
            buf = ctypes.create_string_buffer(bytes(datos), len(datos))
            ok = ws.WritePrinter(manejador, buf, len(datos), ctypes.byref(escritos))
            ws.EndPagePrinter(manejador)
            if not ok or escritos.value != len(datos):
                raise OSError(f"Solo se enviaron {escritos.value} de {len(datos)} bytes.")
        finally:
            ws.EndDocPrinter(manejador)
    finally:
        ws.ClosePrinter(manejador)
    return trabajo


def enviar_red(ip, puerto, datos, espera=15.0):
    """Envía ``datos`` por TCP (impresoras de red, normalmente puerto 9100)."""
    with socket.create_connection((ip, int(puerto)), timeout=espera) as s:
        s.sendall(bytes(datos))
        s.shutdown(socket.SHUT_WR)
    return len(datos)
