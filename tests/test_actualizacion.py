"""Pruebas de la búsqueda e instalación de actualizaciones (sin internet: archivos locales y
un servidor en 127.0.0.1 solo con EDITOR_BRAILLE_PRUEBAS=1).

Ejecutar desde la carpeta del proyecto:  python tests/test_actualizacion.py
"""

import hashlib
import http.client
import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import zipfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from motor import actualizacion as act  # noqa: E402
import app  # noqa: E402


class Versiones(unittest.TestCase):
    def test_comparacion_semantica(self):
        self.assertTrue(act.es_mas_nueva("2.0.1", "2.0.0"))
        self.assertTrue(act.es_mas_nueva("2.10.0", "2.9.9"))      # no es comparación de texto
        self.assertTrue(act.es_mas_nueva("3", "2.9.9"))
        self.assertTrue(act.es_mas_nueva("v2.1", "2.0.5"))
        self.assertFalse(act.es_mas_nueva("2.0.0", "2.0.0"))
        self.assertFalse(act.es_mas_nueva("2.0", "2.0.0"))
        self.assertFalse(act.es_mas_nueva("1.9.9", "2.0.0"))
        self.assertTrue(act.es_mas_nueva("2.0.0", "2.0.0-beta"))  # la final supera a la preversión
        self.assertFalse(act.es_mas_nueva("2.0.0-beta", "2.0.0"))

    def test_version_invalida(self):
        for mala in ("", "abc", "2..0", "2.0.0.0.0", None, 5, "2.x"):
            with self.assertRaises(ValueError):
                act.parsear_version(mala)


class Urls(unittest.TestCase):
    def setUp(self):
        self._previo = os.environ.pop("EDITOR_BRAILLE_PRUEBAS", None)

    def tearDown(self):
        os.environ.pop("EDITOR_BRAILLE_PRUEBAS", None)
        if self._previo is not None:
            os.environ["EDITOR_BRAILLE_PRUEBAS"] = self._previo

    def test_https_ok(self):
        self.assertEqual(act.validar_url("https://ejemplo.org/version.json"), "https://ejemplo.org/version.json")

    def test_rechazadas(self):
        for mala in ("", None, "http://ejemplo.org/v.json", "ftp://ejemplo.org/v.json", "file:///C:/x.json",
                     "javascript:alert(1)", "https://", "//ejemplo.org/v.json", "https://usuario:clave@ejemplo.org/v.json",
                     "http://127.0.0.1/v.json"):
            with self.subTest(url=mala):
                with self.assertRaises(act.ErrorActualizacion):
                    act.validar_url(mala)

    def test_http_local_solo_en_pruebas(self):
        os.environ["EDITOR_BRAILLE_PRUEBAS"] = "1"
        self.assertEqual(act.validar_url("http://127.0.0.1:8000/v.json"), "http://127.0.0.1:8000/v.json")
        with self.assertRaises(act.ErrorActualizacion):
            act.validar_url("http://ejemplo.org/v.json")        # http remoto nunca


class VersionJson(unittest.TestCase):
    def test_valido(self):
        d = act.leer_version_json(json.dumps({"version": "2.1.0", "url": "https://x/y.zip",
                                              "sha256": "A" * 64, "notas": "Arreglos"}).encode())
        self.assertEqual((d["version"], d["sha256"], d["notas"]), ("2.1.0", "a" * 64, "Arreglos"))

    def test_invalido(self):
        for malo in (b"no es json", b"[]", b'{"version":"x"}', b'{}', b"\xff\xfe"):
            with self.subTest(malo=malo):
                with self.assertRaises(act.ErrorActualizacion):
                    act.leer_version_json(malo)


class Sha256(unittest.TestCase):
    def test_verificacion(self):
        with tempfile.TemporaryDirectory() as t:
            ruta = os.path.join(t, "a.zip")
            with open(ruta, "wb") as f:
                f.write(b"contenido")
            ok = hashlib.sha256(b"contenido").hexdigest()
            act.verificar_sha256(ruta, ok)
            act.verificar_sha256(ruta, ok.upper())
            for malo in ("0" * 64, "", None, "abc", "g" * 64):
                with self.subTest(malo=malo):
                    with self.assertRaises(act.ErrorActualizacion):
                        act.verificar_sha256(ruta, malo)


def _hacer_zip(ruta, entradas):
    with zipfile.ZipFile(ruta, "w") as z:
        for nombre, datos in entradas:
            z.writestr(nombre, datos)


class ZipSlip(unittest.TestCase):
    def test_zip_normal(self):
        with tempfile.TemporaryDirectory() as t:
            z = os.path.join(t, "ok.zip")
            _hacer_zip(z, [("Editor Braille/Editor Braille.exe", b"MZ"), ("Editor Braille/_internal/x.dll", b"1")])
            destino = os.path.join(t, "salida")
            act.descomprimir_seguro(z, destino)
            self.assertTrue(os.path.isfile(os.path.join(destino, "Editor Braille", "_internal", "x.dll")))
            self.assertEqual(act.carpeta_con_exe(destino), os.path.join(destino, "Editor Braille"))

    def test_rutas_peligrosas(self):
        malas = ["../fuera.txt", "a/../../fuera.txt", "..\\fuera.txt", "/abs.txt", "C:/abs.txt", "C:\\abs.txt",
                 "a/b/../../../x"]
        for nombre in malas:
            with self.subTest(nombre=nombre):
                with tempfile.TemporaryDirectory() as t:
                    z = os.path.join(t, "mal.zip")
                    _hacer_zip(z, [("bueno.txt", b"1"), (nombre, b"x")])
                    destino = os.path.join(t, "salida")
                    with self.assertRaises(act.ErrorActualizacion):
                        act.descomprimir_seguro(z, destino)
                    self.assertFalse(os.path.exists(os.path.join(t, "fuera.txt")))
                    self.assertFalse(os.path.exists(os.path.join(destino, "bueno.txt")))  # nada a medias

    def test_no_es_zip(self):
        with tempfile.TemporaryDirectory() as t:
            z = os.path.join(t, "x.zip")
            with open(z, "wb") as f:
                f.write(b"no zip")
            with self.assertRaises(act.ErrorActualizacion):
                act.descomprimir_seguro(z, os.path.join(t, "s"))

    def test_sin_exe(self):
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(act.ErrorActualizacion):
                act.carpeta_con_exe(t)


class Configuracion(unittest.TestCase):
    def test_config_json_gana_sobre_constante(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(act.url_configurada("", t), "")
            self.assertEqual(act.url_configurada("https://a/v.json", t), "https://a/v.json")
            with open(os.path.join(t, "config.json"), "w", encoding="utf-8") as f:
                json.dump({"url_actualizaciones": "https://b/v.json"}, f)
            self.assertEqual(act.url_configurada("https://a/v.json", t), "https://b/v.json")
            with open(os.path.join(t, "config.json"), "w", encoding="utf-8") as f:
                f.write("roto{")
            self.assertEqual(act.url_configurada("https://a/v.json", t), "https://a/v.json")


class Actualizador(unittest.TestCase):
    def test_guion(self):
        with tempfile.TemporaryDirectory() as t:
            g = act.escribir_actualizador(os.path.join(t, "nuevo"), os.path.join(t, "app"), 1234, t)
            texto = open(g, encoding="cp1252").read()
            self.assertIn("PID eq 1234", texto)
            self.assertIn("robocopy", texto)
            self.assertIn("Editor Braille.exe", texto)


class _Servidor(http.server.BaseHTTPRequestHandler):
    archivos = {}

    def do_GET(self):
        datos = self.archivos.get(self.path)
        if datos is None:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def log_message(self, *a):
        pass


class ConServidorLocal(unittest.TestCase):
    """Descarga real contra 127.0.0.1 (modo pruebas), sin salir a internet."""

    @classmethod
    def setUpClass(cls):
        os.environ["EDITOR_BRAILLE_PRUEBAS"] = "1"
        cls.tmp = tempfile.mkdtemp()
        cls.zip = os.path.join(cls.tmp, "nuevo.zip")
        _hacer_zip(cls.zip, [("Editor Braille/Editor Braille.exe", b"MZ"), ("Editor Braille/dato.txt", b"hola")])
        zbytes = open(cls.zip, "rb").read()
        cls.sha = hashlib.sha256(zbytes).hexdigest()
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Servidor)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        _Servidor.archivos = {"/nuevo.zip": zbytes, "/grande.json": b"x" * (act.MAX_VERSION_JSON + 10)}
        cls.hilo = threading.Thread(target=cls.srv.serve_forever, daemon=True)
        cls.hilo.start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        os.environ.pop("EDITOR_BRAILLE_PRUEBAS", None)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def _publicar(self, **extra):
        d = {"version": "9.9.9", "url": self.base + "/nuevo.zip", "sha256": self.sha, "notas": "n"}
        d.update(extra)
        _Servidor.archivos["/version.json"] = json.dumps(d).encode()
        return self.base + "/version.json"

    def test_buscar(self):
        r, _ = act.buscar(self._publicar(), "2.0.0")
        self.assertEqual((r["hay"], r["actual"], r["nueva"]), (True, "2.0.0", "9.9.9"))
        r, _ = act.buscar(self._publicar(), "9.9.9")
        self.assertFalse(r["hay"])

    def test_sin_url(self):
        with self.assertRaises(act.ErrorActualizacion):
            act.buscar("", "2.0.0")

    def test_json_demasiado_grande(self):
        with self.assertRaises(act.ErrorActualizacion):
            act.buscar(self.base + "/grande.json", "2.0.0")

    def test_sin_conexion(self):
        with self.assertRaises(act.ErrorActualizacion):
            act.buscar(self.base + "/no_existe.json", "2.0.0")

    def test_preparar_instalacion(self):
        datos = tempfile.mkdtemp()
        try:
            info, origen = act.preparar_instalacion(self._publicar(), "2.0.0", datos)
            self.assertTrue(os.path.isfile(os.path.join(origen, "Editor Braille.exe")))
            self.assertEqual(info["version"], "9.9.9")
            self.assertFalse(os.path.exists(os.path.join(datos, "actualizacion", "9.9.9.zip")))  # zip borrado
        finally:
            shutil.rmtree(datos, ignore_errors=True)

    def test_sha_incorrecto_no_instala(self):
        datos = tempfile.mkdtemp()
        try:
            with self.assertRaises(act.ErrorActualizacion):
                act.preparar_instalacion(self._publicar(sha256="0" * 64), "2.0.0", datos)
            self.assertFalse(os.path.exists(os.path.join(datos, "actualizacion", "9.9.9")))
        finally:
            shutil.rmtree(datos, ignore_errors=True)

    def test_sin_sha_no_instala(self):
        datos = tempfile.mkdtemp()
        try:
            with self.assertRaises(act.ErrorActualizacion):
                act.preparar_instalacion(self._publicar(sha256=""), "2.0.0", datos)
        finally:
            shutil.rmtree(datos, ignore_errors=True)

    def test_zip_con_http_remoto_rechazado(self):
        datos = tempfile.mkdtemp()
        try:
            with self.assertRaises(act.ErrorActualizacion):
                act.preparar_instalacion(self._publicar(url="http://ejemplo.org/x.zip"), "2.0.0", datos)
        finally:
            shutil.rmtree(datos, ignore_errors=True)

    def test_api_del_servidor(self):
        """Endpoints reales: sin configurar, nueva versión y negativa a instalar fuera del .exe."""
        previa = app.URL_ACTUALIZACIONES
        carpeta = tempfile.mkdtemp()
        app.carpeta_datos = lambda: carpeta
        srv = app.crear_servidor(8795)
        hilo = threading.Thread(target=srv.serve_forever, daemon=True)
        hilo.start()
        puerto = srv.server_address[1]

        def pedir(metodo, ruta):
            c = http.client.HTTPConnection("127.0.0.1", puerto, timeout=10)
            c.request(metodo, ruta, body=b"{}" if metodo == "POST" else None,
                      headers={"X-Editor-Braille": "1", "Content-Length": "2"} if metodo == "POST" else {})
            r = c.getresponse()
            return r.status, json.loads(r.read())
        try:
            app.URL_ACTUALIZACIONES = ""
            self.assertEqual(pedir("GET", "/api/actualizacion/buscar")[1]["estado"], "sin_configurar")
            app.URL_ACTUALIZACIONES = self._publicar()
            st, r = pedir("GET", "/api/actualizacion/buscar")
            self.assertEqual((st, r["estado"], r["nueva"], r["actual"]), (200, "nueva", "9.9.9", app.VERSION))
            st, r = pedir("POST", "/api/actualizacion/instalar")
            self.assertFalse(r["ok"])
            self.assertIn("git pull", r["mensaje"])
            c = http.client.HTTPConnection("127.0.0.1", puerto, timeout=10)    # sin cabecera propia
            c.request("POST", "/api/actualizacion/instalar", body=b"{}", headers={"Content-Length": "2"})
            self.assertEqual(c.getresponse().status, 403)
        finally:
            app.URL_ACTUALIZACIONES = previa
            srv.shutdown()
            srv.server_close()
            shutil.rmtree(carpeta, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
