"""Genera los archivos de ejemplo sintéticos de tests/fixtures (propios, sin material de terceros).

Uso:  python tests/fixtures/generar_fixtures.py
"""

import math
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
ESC = "\x1b"


def puntos_demo(ancho, alto, paso=2.05):
    """Un marco, una diagonal y un círculo de puntos: más de 700 en una hoja de 197 x 281 mm."""
    pts = []
    x = 0.0
    while x <= ancho - 1:
        pts += [(x, 0.0), (x, alto - 1)]
        x += paso * 2
    y = 0.0
    while y <= alto - 1:
        pts += [(0.0, y), (ancho - 1, y)]
        y += paso * 2
    for i in range(60):
        pts.append((i * ancho / 60, i * alto / 60))
    cx, cy, r = ancho / 2, alto / 2, min(ancho, alto) / 4
    for i in range(90):
        a = 2 * math.pi * i / 90
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return [(round(x, 2), round(y, 2)) for x, y in pts]


def escribir_ibe(nombre, d, origen, ancho, alto, fin_linea, cierre):
    cab = f"{ESC}D{d};{ESC}FOR{origen[0]:.2f}:{origen[1]:.2f},WX{ancho:.2f},HY{alto:.2f};"
    cuerpo = fin_linea.join(f"{x:.2f}:{y:.2f}" for x, y in puntos_demo(ancho, alto)) + fin_linea
    texto = cab + cuerpo + (";" + fin_linea if cierre else "")
    with open(os.path.join(AQUI, "ibe", nombre), "wb") as f:
        f.write(texto.encode("latin-1"))


def pdf_demo():
    import pymupdf
    doc = pymupdf.open()
    for n in range(2):
        pag = doc.new_page(width=841.89, height=595.28)          # A4 horizontal
        pag.insert_text((84.5, 120), "LISTA 160", fontsize=24, fontname="helv")
        pag.insert_text((84.5, 170), "PARTIDO DE RENOVACIÓN", fontsize=14, fontname="helv")
        pag.insert_text((84.5, 200), "Raúl Omar", fontsize=12, fontname="helv")
        if n == 1:
            pag.draw_rect(pymupdf.Rect(60, 250, 120, 300), color=(0, 0, 0), width=1)
    doc.save(os.path.join(AQUI, "plantilla_sintetica.pdf"))


if __name__ == "__main__":
    os.makedirs(os.path.join(AQUI, "ibe"), exist_ok=True)
    escribir_ibe("sintetico_basic.ibe", "DP1,LS50,TM0,BI0,CH46,LP27", (0, 0), 280.75, 197.07, "\n", True)
    escribir_ibe("sintetico_braillebox.ibe", "DP4,LS50,TM0,BI1,CH33,LP29", (0, 0), 197.07, 280.75, "\n", False)
    escribir_ibe("sintetico_everest.ibe", "DP2,LS50,TM0,BI0,CH34,LP29", (3, 0), 197.07, 280.75, "\n", False)
    escribir_ibe("sintetico_geometry.ibe", "DP2,LS50,TM0,BI0,CH45,LP27", (0, 0), 287.5, 275.0, "\r\n", True)
    pdf_demo()
