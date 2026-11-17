"""Pruebas de las validaciones de seguridad del servidor.

Ejecutar desde la carpeta del proyecto:  python -m unittest discover -s tests -v
"""

import http.client
import json
import os
import sys
import threading
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from motor import perfil  # noqa: E402
import app  # noqa: E402


class ValidacionesPuras(unittest.TestCase):
    def test_ip(self):
        self.assertEqual(app.validar_ip(" 192.168.1.20 "), "192.168.1.20")
        for mala in ("", "abc", "999.1.1.1", "0.0.0.0", "224.0.0.1", "ejemplo.com"):
            with self.assertRaises(ValueError):
                app.validar_ip(mala)

    def test_puerto(self):
        self.assertEqual(app.validar_puerto(None), 9100)
        self.assertEqual(app.validar_puerto("515"), 515)
        for malo in (0, 65536, -1, "x"):
            with self.assertRaises(ValueError):
                app.validar_puerto(malo)

    def test_hoja(self):
        self.assertEqual(app._hoja({"ancho": 210, "alto": 297}), (210.0, 297.0))
        for mala in ({"ancho": 0, "alto": 10}, {"ancho": 5000, "alto": 10}, {"ancho": "x", "alto": 1}):
            with self.assertRaises(ValueError):
                app._hoja(mala)

    def test_puntos_limite(self):
        with self.assertRaises(ValueError):
            app._puntos({"puntos": [[1, 1]] * (app.MAX_PUNTOS + 1)})

    def test_perfil_defecto_valido(self):
        perfil.validar(perfil.completar({}))
        perfil.validar(perfil.cargar(app.RUTA_PERFIL))

    def test_perfil_invalido(self):
        malos = [
            {"grilla": {"paso_mm": 50}},
            {"grilla": {"paso_x_mm": "2"}},
            {"carga": {"desplazamiento_y_mm": 9999}},
            {"carga": {"orientacion": "diagonal"}},
            {"margenes_mm": {"izquierdo": -5}},
            {"red": {"puerto": 70000}},
            {"codificador": "otro"},
        ]
        for extra in malos:
            with self.assertRaises(ValueError, msg=str(extra)):
                perfil.validar(perfil.completar(extra))


class Servidor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = app.crear_servidor(8950)
        cls.puerto = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def pedir(self, metodo, ruta, cuerpo=None, cabeceras=None):
        c = http.client.HTTPConnection("127.0.0.1", self.puerto, timeout=10)
        h = {"X-Editor-Braille": "1"}
        h.update(cabeceras or {})
        c.request(metodo, ruta, body=cuerpo, headers=h)
        r = c.getresponse()
        datos = r.read()
        c.close()
        return r, datos

    def test_cabeceras(self):
        r, _ = self.pedir("GET", "/")
        self.assertEqual(r.getheader("X-Frame-Options"), "DENY")
        self.assertEqual(r.getheader("Referrer-Policy"), "no-referrer")
        self.assertIn("frame-ancestors 'none'", r.getheader("Content-Security-Policy"))

    def test_hoja_enorme(self):
        cuerpo = json.dumps({"ancho": 5000, "alto": 5000, "puntos": []})
        r, _ = self.pedir("POST", "/api/exportar/prn", cuerpo, {"Content-Type": "application/json"})
        self.assertEqual(r.status, 400)

    def test_content_length_invalido(self):
        r, _ = self.pedir("POST", "/api/exportar/prn", None, {"Content-Length": "abc"})
        self.assertEqual(r.status, 400)
        r, _ = self.pedir("POST", "/api/exportar/prn", None, {"Content-Length": "-5"})
        self.assertEqual(r.status, 400)

    def test_ip_invalida_no_imprime(self):
        cuerpo = json.dumps({"confirmado": True, "ancho": 100, "alto": 100, "puntos": [[10, 10]],
                             "destino": {"tipo": "red", "ip": "no-es-ip", "puerto": 9100}})
        r, datos = self.pedir("POST", "/api/imprimir", cuerpo)
        self.assertEqual(r.status, 400)
        self.assertIn("IP", json.loads(datos)["error"])

    def test_perfil_invalido_rechazado(self):
        r, _ = self.pedir("POST", "/api/perfil", json.dumps({"grilla": {"paso_mm": 99}}))
        self.assertEqual(r.status, 400)

    def test_error_500_generico(self):
        original = app.generar_archivo
        app.generar_archivo = lambda cuerpo: 1 / 0
        try:
            cuerpo = json.dumps({"ancho": 100, "alto": 100, "puntos": []})
            r, datos = self.pedir("POST", "/api/exportar/prn", cuerpo)
        finally:
            app.generar_archivo = original
        self.assertEqual(r.status, 500)
        self.assertNotIn("division", datos.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
