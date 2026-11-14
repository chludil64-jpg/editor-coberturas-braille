"""Pruebas del lector/escritor .ibe, del codificador de grilla (plan B),
de la transformación del perfil y de los PDF de salida.

Ejecutar desde la carpeta del proyecto:  python -m unittest discover -s tests -v
"""

import glob
import os
import socket
import sys
import threading
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from motor import impresion, index_v4, perfil  # noqa: E402
import app  # noqa: E402

MUESTRAS = sorted(glob.glob(os.path.join(BASE, "ejemplos", "ibe", "*.ibe")))
PDF_GAIMAN = os.path.join(BASE, "ejemplos", "plantilla_boleta_gaiman_A4.pdf")


class TestPuntoLibre(unittest.TestCase):
    def test_hay_muestras(self):
        self.assertEqual(len(MUESTRAS), 4, "Faltan las 4 muestras .ibe en ejemplos/ibe")

    def test_encabezado_muestra_everest(self):
        with open(os.path.join(BASE, "ejemplos", "ibe", "_everest_functions_graphs.ibe"), "rb") as f:
            leido = index_v4.leer_ibe(f.read())
        self.assertEqual(leido["encabezado"], {"DP": 2, "LS": 50, "TM": 0, "BI": 0, "CH": 34, "LP": 29})
        pag = leido["paginas"][0]
        self.assertEqual(pag["origen"], (3.0, 0.0))
        self.assertAlmostEqual(pag["ancho"], 197.07)
        self.assertAlmostEqual(pag["alto"], 280.75)
        self.assertGreater(len(pag["puntos"]), 700)

    def test_ida_y_vuelta_muestras(self):
        for ruta in MUESTRAS:
            with self.subTest(muestra=os.path.basename(ruta)):
                with open(ruta, "rb") as f:
                    original = f.read()
                leido = index_v4.leer_ibe(original)
                pag = leido["paginas"][0]
                escrito = index_v4.codificar_punto_libre(
                    pag["puntos"], pag["ancho"], pag["alto"], leido["encabezado"], pag["origen"],
                    pag["terminador"])
                releido = index_v4.leer_ibe(escrito)
                self.assertEqual(releido["encabezado"], leido["encabezado"])
                p2 = releido["paginas"][0]
                self.assertEqual(p2["puntos"], pag["puntos"])  # mismos puntos, mismo orden
                self.assertEqual((p2["ancho"], p2["alto"], p2["origen"]),
                                 (pag["ancho"], pag["alto"], pag["origen"]))
                # Los números escritos son idénticos al original (2 decimales).
                def cuerpo(datos):
                    texto = datos.decode("latin-1")
                    texto = texto[texto.index(";", texto.index("\x1bF")) + 1:]
                    texto = texto.split(";")[0]  # las muestras de Everest no cierran con ';'
                    return [l.strip() for l in texto.replace("\r", "").split("\n") if l.strip()]
                self.assertEqual(cuerpo(escrito), cuerpo(original))

    def test_formato_exacto(self):
        datos = index_v4.codificar_punto_libre([(1, 2), (10.256, 3.004)], 297, 210,
                                               {"DP": 2, "LS": 50, "TM": 0, "BI": 0, "CH": 46, "LP": 27})
        self.assertEqual(datos, b"\x1bDDP2,LS50,TM0,BI0,CH46,LP27;\x1bFOR0.00:0.00,WX297.00,HY210.00;"
                                b"1.00:2.00\n10.26:3.00;\n")

    def test_no_es_ibe(self):
        with self.assertRaises(ValueError):
            index_v4.leer_ibe(b"hola")


class TestGrilla(unittest.TestCase):
    def test_bytes_esperados(self):
        # Hoja de 4 x 6 mm con paso 2: 3 columnas, 4 filas -> 2 bloques x 1 renglón.
        puntos = [(0, 0), (0, 2), (2, 4), (2, 6), (4, 0)]
        datos = index_v4.codificar_grilla(puntos, 4, 6, 2.0)
        # Encabezado, fin de renglón (CR LF) y cierre iguales a la prueba 16, que imprimió
        # bien en la Everest-D V4.
        # CH y LP automáticos: 2 bloques de ancho y 1 renglón.
        esperado = (b"\x1bDTM0,BI0,MI1,DP1,TD0,GD0,CH2,LP1,LS50,BT0;" + b"\x1b\x07"
                    + bytes([0x40 | 1 | 2, 0x40 | 4 | 8, 0x40 | 1, 0x40]) + b"\r\n"
                    + b"\x1b\x06\x0c\x1a")
        self.assertEqual(datos, esperado)

    def test_recorta_solo_bloques_vacios_completos(self):
        # Punto en la columna 0: el bloque 0 queda «A@» (el segundo byte es @ pero NO se recorta,
        # porque correría las columnas); los 5 bloques vacíos del final («@@») sí se quitan.
        datos = index_v4.codificar_grilla([(0, 0)], 20, 2, 2.0)
        renglon = datos[datos.index(b"\x1b\x07") + 2:datos.index(b"\r")]
        self.assertEqual(renglon, b"A@")

    def test_sin_renglones_vacios_al_final(self):
        datos = index_v4.codificar_grilla([(0, 0)], 297, 210, 2.05, paso_y=2.10)
        cuerpo = datos[datos.index(b"\x1b\x07") + 2:datos.index(b"\x1b\x06")]
        self.assertEqual(cuerpo, b"A@\r\n")

    def test_clave_vacia_se_omite(self):
        datos = index_v4.codificar_grilla([(0, 0)], 4, 4, 2.0, {"CH": None, "LP": ""})
        self.assertTrue(datos.startswith(b"\x1bDTM0,BI0,MI1,DP1,TD0,GD0,LS50,BT0;"))

    def test_ida_y_vuelta(self):
        puntos = [(x * 2.0, y * 2.0) for x in range(0, 30, 3) for y in range(0, 20, 2)]
        datos = index_v4.codificar_grilla(puntos, 100, 60, 2.0)
        self.assertEqual(sorted(index_v4.decodificar_grilla(datos, 2.0)), sorted(puntos))

    def test_paso_configurable_y_fusion(self):
        info = {}
        index_v4.codificar_grilla([(0, 0), (0.4, 0.4), (500, 500)], 10, 10, 2.5, info=info)
        self.assertEqual(info["fusionados"], 1)
        self.assertEqual(info["fuera"], 1)


class TestPerfil(unittest.TestCase):
    def test_sin_cambios(self):
        pts, w, h, av = perfil.transformar([(10, 20)], 297, 210, perfil.completar({}))
        self.assertEqual((pts, w, h, av), ([(10.0, 20.0)], 297.0, 210.0, []))

    def test_giro_espejo_ajuste(self):
        p = perfil.completar({"carga": {"orientacion": "vertical", "sentido_giro": "horario"}})
        pts, w, h, _ = perfil.transformar([(10, 20)], 297, 210, p)
        self.assertEqual((w, h), (210.0, 297.0))
        self.assertEqual(pts, [(190.0, 10.0)])
        p = perfil.completar({"carga": {"orientacion": "vertical", "sentido_giro": "antihorario"}})
        pts, _, _, _ = perfil.transformar([(10, 20)], 297, 210, p)
        self.assertEqual(pts, [(20.0, 287.0)])
        p = perfil.completar({"carga": {"espejo": "horizontal", "desplazamiento_x_mm": 1.5,
                                        "escala_y": 1.01}})
        pts, _, _, _ = perfil.transformar([(10, 100)], 297, 210, p)
        self.assertAlmostEqual(pts[0][0], 288.5)
        self.assertAlmostEqual(pts[0][1], 101.0)

    def test_descarta_fuera(self):
        p = perfil.completar({"carga": {"desplazamiento_x_mm": -5}})
        pts, _, _, av = perfil.transformar([(1, 1), (50, 1)], 297, 210, p)
        self.assertEqual(len(pts), 1)
        self.assertTrue(av)

    def test_encabezado_segun_hoja(self):
        p = perfil.completar({})
        self.assertEqual(perfil.encabezado_para(p, 297, 210)[0]["CH"], 46)
        self.assertEqual(perfil.encabezado_para(p, 210, 297), (
            {"DP": 2, "LS": 50, "TM": 0, "BI": 0, "CH": 34, "LP": 29}, (3.0, 0.0)))

    def test_perfil_real_paginas_vertical_y_apaisada(self):
        real = perfil.cargar(os.path.join(BASE, "perfiles", "everest_v4.json"))
        self.assertEqual(real["carga"]["orientacion"], "vertical")
        self.assertEqual(real["grilla"]["paso_x_mm"], 2.05)
        self.assertEqual(real["grilla"]["paso_y_mm"], 2.02)
        casos = [
            (210, 297, [(10.25, 10.10), (102.5, 202.0)],
             [(10.25, 5.20), (102.5, 197.10)]),
            (297, 210, [(10.10, 10.25), (202.0, 102.5)],
             [(199.75, 5.20), (107.5, 197.10)]),
        ]
        for ancho, alto, entrada, esperado in casos:
            with self.subTest(orientacion=(ancho, alto)):
                pts, w, h, avisos = perfil.transformar(entrada, ancho, alto, real)
                self.assertEqual((w, h), (210.0, 297.0))
                self.assertEqual(len(pts), len(esperado))
                for (x, y), (ex, ey) in zip(pts, esperado):
                    self.assertAlmostEqual(x, ex, places=6)
                    self.assertAlmostEqual(y, ey, places=6)
                self.assertEqual(avisos, [])
                self.assertTrue(all(0 <= x <= w and 0 <= y <= h for x, y in pts))
                datos, ext, avisos, info = app.generar_archivo({
                    "puntos": entrada, "ancho": ancho, "alto": alto, "perfil": real
                })
                self.assertEqual(ext, "prn")
                self.assertEqual((info["ancho_hoja"], info["alto_hoja"], info["puntos"]), (210, 297, 2))
                self.assertEqual(avisos, [])
                vuelta = index_v4.decodificar_grilla(datos, 2.05, 2.02)
                self.assertEqual(len(vuelta), 2)
                for (x, y), (ex, ey) in zip(sorted(vuelta), sorted(esperado)):
                    self.assertAlmostEqual(x, round(ex / 2.05) * 2.05, places=2)
                    self.assertAlmostEqual(y, round(ey / 2.02) * 2.02, places=2)
                    self.assertTrue(0 <= x <= 210 and 0 <= y <= 297)


class TestPdf(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from motor import pdf_io
        cls.pdf_io = pdf_io
        with open(PDF_GAIMAN, "rb") as f:
            cls.doc = pdf_io.abrir(f.read())

    def test_textos_en_mm(self):
        info = self.pdf_io.info(self.doc)
        self.assertEqual(len(info), 2)
        self.assertAlmostEqual(info[0]["ancho"], 297.0, places=1)
        self.assertAlmostEqual(info[0]["alto"], 210.0, places=1)
        lista = [r for r in info[0]["renglones"] if r["texto"] == "LISTA 160"][0]
        self.assertAlmostEqual(lista["x0"], 84.5 * 25.4 / 72, delta=0.1)
        textos = [r["texto"] for r in info[0]["renglones"]]
        self.assertIn("PARTIDO DE RENOVACIÓN", textos)
        self.assertIn("Raúl Omar", textos)

    def test_vectores(self):
        v = self.pdf_io.vectores(self.doc, 1)
        self.assertTrue(any(x["tipo"] == "trazo" and x["cerrado"] for x in v))

    def test_pdf_prueba_y_png(self):
        import pymupdf
        datos = self.pdf_io.pdf_prueba(297, 210, [(10, 10), (20, 20)], self.doc, 0)
        d = pymupdf.open(stream=datos, filetype="pdf")
        self.assertAlmostEqual(d[0].rect.width * 25.4 / 72, 297, places=1)
        self.assertTrue(self.pdf_io.png_puntos(50, 30, [(5, 5)], 4).startswith(b"\x89PNG"))

    def test_pdf_vertical_y_png(self):
        import pymupdf
        datos = self.pdf_io.pdf_prueba(210, 297, [(10, 10), (100, 200)])
        d = pymupdf.open(stream=datos, filetype="pdf")
        self.assertAlmostEqual(d[0].rect.width * 25.4 / 72, 210, places=1)
        self.assertAlmostEqual(d[0].rect.height * 25.4 / 72, 297, places=1)
        self.assertTrue(self.pdf_io.png_puntos(210, 297, [(10, 10)], 4).startswith(b"\x89PNG"))


class TestImpresion(unittest.TestCase):
    def test_listar_no_falla(self):
        self.assertIsInstance(impresion.listar_impresoras(), list)

    def test_envio_red_a_receptor_local(self):
        # Receptor TCP de prueba en 127.0.0.1 (no es una impresora).
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        recibido = bytearray()

        def recibir():
            c, _ = srv.accept()
            while True:
                b = c.recv(4096)
                if not b:
                    break
                recibido.extend(b)
            c.close()

        t = threading.Thread(target=recibir)
        t.start()
        datos = index_v4.codificar_punto_libre([(1, 1)], 297, 210)
        impresion.enviar_red("127.0.0.1", srv.getsockname()[1], datos)
        t.join(5)
        srv.close()
        self.assertEqual(bytes(recibido), datos)


class TestGrillaPasoReal(unittest.TestCase):
    def test_paso_x_y_distintos(self):
        # Paso medido en la Everest-D V4: 2,05 mm horizontal, 2,10 mm vertical.
        puntos = [(c * 2.05, f * 2.10) for c in range(0, 20, 3) for f in range(0, 12, 2)]
        datos = index_v4.codificar_grilla(puntos, 60, 40, 2.05, paso_y=2.10)
        vuelta = index_v4.decodificar_grilla(datos, 2.05, 2.10)
        self.assertEqual(sorted((round(x, 3), round(y, 3)) for x, y in vuelta),
                         sorted((round(x, 3), round(y, 3)) for x, y in puntos))


if __name__ == "__main__":
    unittest.main()
