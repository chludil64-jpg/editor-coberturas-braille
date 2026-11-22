"""Pruebas de motor/instalar_impresora.py (sin ejecutar PowerShell real).

Ejecutar desde la carpeta del proyecto:  python tests/test_instalar_impresora.py
"""

import json
import os
import re
import sys
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from motor import instalar_impresora as ip  # noqa: E402
import app  # noqa: E402

COLA_V4 = {"nombre": "Index Everest-D V4", "driver": "Index Everest-D V4", "puerto": "USB004", "datatype": "RAW"}
OTRA = {"nombre": "HP Smart Tank", "driver": "HP PCL-3", "puerto": "USB001", "datatype": "RAW"}


def salida(dispositivos, colas):
    return json.dumps({"dispositivos": dispositivos, "colas": colas})


DISP_OK = {"nombre": "Index Everest-D V4", "estado": "OK", "instancia": "USBPRINT\\X", "padre": "USB\\VID_1868&PID_0002\\1", "puerto": "USB004"}


class Deteccion(unittest.TestCase):
    def test_ya_lista(self):
        d = ip.parsear_deteccion(salida([dict(DISP_OK, estado="Unknown")], [COLA_V4, OTRA]))
        self.assertEqual(d["estado"], "lista")
        self.assertEqual(d["dispositivos"][0]["colas"][0]["nombre"], "Index Everest-D V4")
        self.assertFalse(d["dispositivos"][0]["conectada"])
        self.assertIsNone(ip.puerto_para_preparar(d))

    def test_falta_cola(self):
        d = ip.parsear_deteccion(salida([DISP_OK], [OTRA]))
        self.assertEqual(d["estado"], "falta_cola")
        self.assertEqual(ip.puerto_para_preparar(d), "USB004")

    def test_desconectada_sin_cola(self):
        d = ip.parsear_deteccion(salida([dict(DISP_OK, estado="Unknown")], [OTRA]))
        self.assertEqual(d["estado"], "desconectada")

    def test_no_encontrada(self):
        d = ip.parsear_deteccion(salida([], [OTRA]))
        self.assertEqual(d["estado"], "no_encontrada")

    def test_cola_index_sobre_otro_puerto(self):
        d = ip.parsear_deteccion(salida([], [dict(COLA_V4, puerto="USB009"), OTRA]))
        self.assertEqual(d["estado"], "lista")
        self.assertEqual(len(d["otras_colas"]), 1)

    def test_powershell_un_solo_elemento_no_es_lista(self):
        # ConvertTo-Json devuelve objetos sueltos cuando hay uno solo.
        txt = json.dumps({"dispositivos": DISP_OK, "colas": COLA_V4})
        d = ip.parsear_deteccion(txt.encode("utf-8-sig"))
        self.assertEqual(d["estado"], "lista")

    def test_vacio_y_nulos(self):
        d = ip.parsear_deteccion('{"dispositivos": null, "colas": null}')
        self.assertEqual(d["estado"], "no_encontrada")

    def test_puerto_invalido_se_descarta(self):
        d = ip.parsear_deteccion(salida([dict(DISP_OK, puerto="USB4; calc")], []))
        self.assertEqual(d["dispositivos"][0]["puerto"], "")
        self.assertIsNone(ip.puerto_para_preparar(d))

    def test_basura(self):
        with self.assertRaises(ip.ErrorImpresora):
            ip.parsear_deteccion("esto no es json")


class Validacion(unittest.TestCase):
    def test_puerto_usb(self):
        self.assertEqual(ip.validar_puerto_usb("usb004"), "USB004")
        for malo in ("", None, "USB4", "USB0041", "LPT1", "USB004; calc", "USB004 ", "USB00\n4", "../USB004"):
            if malo == "USB004 ":
                self.assertEqual(ip.validar_puerto_usb(malo), "USB004")  # los espacios se recortan
                continue
            with self.assertRaises(ValueError):
                ip.validar_puerto_usb(malo)

    def test_ip_y_puerto_tcp_del_servidor(self):
        self.assertEqual(app.validar_ip("192.168.0.50"), "192.168.0.50")
        for mala in ("", "192.168.0.50; calc", "a.b.c.d", "0.0.0.0"):
            with self.assertRaises(ValueError):
                app.validar_ip(mala)
        self.assertEqual(app.validar_puerto(None), 9100)
        with self.assertRaises(ValueError):
            app.validar_puerto(70000)


class Argumentos(unittest.TestCase):
    def test_los_valores_viajan_por_entorno_no_por_texto(self):
        guion = "C:\\Mi carpeta\\O'Brien\\preparar_impresora.ps1"
        cmd, env = ip.argumentos_lanzador(guion, "USB004")
        self.assertEqual(env["EB_PUERTO"], "USB004")
        self.assertEqual(env["EB_SCRIPT"], guion)
        texto = " ".join(cmd)
        for valor in (guion, "USB004"):
            self.assertNotIn(valor, texto)
        self.assertEqual(cmd[0], "powershell.exe")
        for bandera in ("-NoProfile", "-NonInteractive"):
            self.assertIn(bandera, cmd)

    def test_rechaza_entradas_peligrosas(self):
        guion = "C:\\x\\preparar_impresora.ps1"
        with self.assertRaises(ValueError):
            ip.argumentos_lanzador(guion, "USB004 & calc")
        with self.assertRaises(ValueError):
            ip.argumentos_lanzador('C:\\x" -Command calc "', "USB004")

    def test_resultado(self):
        r = ip.parsear_resultado('\ufeff{"ok": true, "mensaje": "Cola creada.", "cola": "Braille Index (Editor Braille)", "puerto": "USB004"}')
        self.assertTrue(r["ok"])
        self.assertEqual(r["cola"], "Braille Index (Editor Braille)")
        self.assertIsNone(ip.parsear_resultado("{roto"))
        self.assertFalse(ip.parsear_resultado('{"ok": "true"}')["ok"])


class Respaldo(unittest.TestCase):
    def test_ruta_resultado_en_programdata(self):
        r = ip.ruta_resultado().lower()
        self.assertTrue(r.endswith(os.path.join("editorbraille", "preparar_impresora.json")))
        self.assertNotIn("appdata\\local", r)

    def test_cola_en_puerto(self):
        d = ip.parsear_deteccion(salida([DISP_OK], [OTRA]))
        self.assertIsNone(ip.cola_en_puerto(d, "USB004"))
        d = ip.parsear_deteccion(salida([DISP_OK], [OTRA, COLA_V4]))
        self.assertEqual(ip.cola_en_puerto(d, "USB004"), "Index Everest-D V4")
        d = ip.parsear_deteccion(salida([], [dict(COLA_V4, nombre="Otra")]))
        self.assertEqual(ip.cola_en_puerto(d, "USB004"), "Otra")


class ScriptElevado(unittest.TestCase):
    """El .ps1 elevado no debe aceptar comandos: solo dos parámetros y valores fijos."""

    def setUp(self):
        with open(ip.guion_preparar(), encoding="utf-8") as f:
            self.texto = f.read()

    def test_parametros(self):
        bloque = re.search(r"param\((.*?)\n\)", self.texto, re.S).group(1)
        self.assertEqual(re.findall(r"\]\$(\w+)", bloque), ["Puerto"])

    def test_valida_y_no_evalua(self):
        self.assertIn("^USB\\d{3}$", self.texto)
        self.assertIn("preparar_impresora.json", self.texto)
        self.assertIn("$env:ProgramData", self.texto)
        self.assertNotIn("$env:LOCALAPPDATA", self.texto)
        self.assertNotIn("Invoke-Expression", self.texto)
        self.assertNotIn("iex ", self.texto.lower())
        self.assertIn(ip.NOMBRE_COLA, self.texto)
        self.assertIn(ip.CONTROLADOR, self.texto)

    def test_incluido_en_el_spec(self):
        with open(os.path.join(BASE, "EditorBraille.spec"), encoding="utf-8") as f:
            self.assertIn("preparar_impresora.ps1", f.read())


if __name__ == "__main__":
    unittest.main()
