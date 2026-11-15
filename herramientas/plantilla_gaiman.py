"""Genera la plantilla de Gaiman y una prueba visual de calce.

Uso: python herramientas/plantilla_gaiman.py [ruta_de_salida.pdf]
Requiere PyMuPDF: python -m pip install pymupdf
"""

from __future__ import annotations

import argparse
from pathlib import Path

import fitz


# Todas las cotas de diseño están en milímetros y usan origen arriba a la izquierda.
MM_A_PT = 72 / 25.4
HOJA_ANCHO = 297.0
HOJA_ALTO = 210.0
MARGEN = 5.0
EJE = 155.5
BOLETA_X = 43.5
BOLETA_Y = 80.0
BOLETA_ANCHO = 210.0
BOLETA_ALTO = 130.0
CASILLA_LADO = 16.0
CASILLA_PRIMER_X = BOLETA_X + 34.0
CASILLA_PASO = (BOLETA_ANCHO - 34.0 - 20.0 - CASILLA_LADO) / 3.0
CASILLA_Y = HOJA_ALTO - 15.0 - CASILLA_LADO
VENTANA_LADO = 20.0
MARCO_LADO = 30.0
MARCO_Y = 172.0
HOLGURA = (VENTANA_LADO - CASILLA_LADO) / 2.0
COLUMNA_PRIMER_X = 22.5
COLUMNA_ANCHO = 62.0
COLUMNA_SEPARACION = 6.0
COLUMNA_Y = 43.0
COLUMNA_CABECERA_ALTO = 11.0
BANDA_X = COLUMNA_PRIMER_X
BANDA_Y = 135.0
BANDA_ANCHO = 4 * COLUMNA_ANCHO + 3 * COLUMNA_SEPARACION
BANDA_ALTO = 8.0
FLECHA_Y_INICIO = BANDA_Y + BANDA_ALTO
FLECHA_Y_PUNTA = MARCO_Y - 1.0
FLECHA_GROSOR = 1.1
FLECHA_CABEZA_ANCHO = 6.0
FLECHA_CABEZA_ALTO = 5.0
NUMERO_FLECHA_Y = 155.0
NUMERO_RADIO = 5.4
REGLA_X = 98.5
REGLA_Y = 10.0
REGLA_LARGO = 100.0
REGLA_MARCA = 10.0
REGLA_TEXTO_Y = 17.0
CRUZ_LARGO = 4.0
BORDE_BASE_VISIBLE_Y = 209.5  # Cota pedida: excepción al margen inferior.
TOPE_LARGO = 5.0
TOPE_SEPARACION = 0.5
RENDER_ESCALA = 2.0

RAIZ = Path(__file__).resolve().parents[1]
ORIGINAL = RAIZ / "ejemplos" / "plantilla_original_gaiman.pdf"
SALIDA_PDF = RAIZ / "ejemplos" / "plantilla_gaiman_calce_exacto.pdf"
SALIDA_PNG = RAIZ / "docs" / "verificacion_plantilla.png"

DATOS = (
    ("1", "160", ("PARTIDO CHUBUT", "SOMOS TODOS"), "Diego Damián", "BRUNT"),
    ("2", "1005", ("PARTIDO DE RENOVACIÓN", "Y DESARROLLO"), "Wanda Marlen", "RODRIGUEZ"),
    ("3", "502", ("DESPIERTA CHUBUT",), "Raúl Omar", "FERRERO"),
    ("4", "1006", ("FAMILIA CHUBUTENSE",), "Carlos Eduardo", "HUENTELAF"),
)


def pt(mm: float) -> float:
    return mm * MM_A_PT


def rect(x: float, y: float, ancho: float, alto: float) -> fitz.Rect:
    return fitz.Rect(pt(x), pt(y), pt(x + ancho), pt(y + alto))


def punto(x: float, y: float) -> fitz.Point:
    return fitz.Point(pt(x), pt(y))


def dentro_de_margen(caja: fitz.Rect) -> None:
    eps = pt(0.001)
    assert caja.x0 >= pt(MARGEN) - eps, f"Elemento fuera del margen izquierdo: {caja}"
    assert caja.y0 >= pt(MARGEN) - eps, f"Elemento fuera del margen superior: {caja}"
    assert caja.x1 <= pt(HOJA_ANCHO - MARGEN) + eps, f"Elemento fuera del margen derecho: {caja}"
    assert caja.y1 <= pt(HOJA_ALTO - MARGEN) + eps, f"Elemento fuera del margen inferior: {caja}"


def caja_controlada(x: float, y: float, ancho: float, alto: float) -> fitz.Rect:
    caja = rect(x, y, ancho, alto)
    dentro_de_margen(caja)
    return caja


def texto_centrado(
    pagina: fitz.Page, contenido: str, centro_x: float, base_y: float,
    tamano: float, *, negrita: bool = False, color: tuple[float, float, float] = (0, 0, 0),
    max_ancho_mm: float | None = None,
) -> None:
    fuente = "hebo" if negrita else "helv"
    if max_ancho_mm is not None:
        while fitz.get_text_length(contenido, fontname=fuente, fontsize=tamano) > pt(max_ancho_mm):
            tamano -= 0.2
            assert tamano >= 6, f"Texto demasiado largo: {contenido}"
    ancho = fitz.get_text_length(contenido, fontname=fuente, fontsize=tamano)
    x0 = pt(centro_x) - ancho / 2
    # La caja incluye ascendentes y descendentes; evita ubicar letras en el margen.
    dentro_de_margen(fitz.Rect(x0, pt(base_y) - tamano, x0 + ancho, pt(base_y) + tamano * 0.25))
    pagina.insert_text(fitz.Point(x0, pt(base_y)), contenido, fontname=fuente, fontsize=tamano, color=color)


def linea(pagina: fitz.Page, x1: float, y1: float, x2: float, y2: float, **kwargs: object) -> None:
    dentro_de_margen(rect(min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1)))
    pagina.draw_line(punto(x1, y1), punto(x2, y2), **kwargs)


def regla(pagina: fitz.Page) -> None:
    linea(pagina, REGLA_X, REGLA_Y, REGLA_X + REGLA_LARGO, REGLA_Y, width=pt(0.35))
    for indice in range(11):
        x = REGLA_X + indice * REGLA_MARCA
        alto = 3.0 if indice in (0, 5, 10) else 1.8
        linea(pagina, x, REGLA_Y - alto / 2, x, REGLA_Y + alto / 2, width=pt(0.3))
    texto_centrado(pagina, "Medí: debe medir 10 cm (imprimir al 100 %, tamaño real)",
                    REGLA_X + REGLA_LARGO / 2, REGLA_TEXTO_Y, 7.5)


def geometria() -> tuple[list[float], list[float], list[float]]:
    casillas = [CASILLA_PRIMER_X + i * CASILLA_PASO for i in range(4)]
    centros = [x + CASILLA_LADO / 2 for x in casillas]
    columnas = [COLUMNA_PRIMER_X + i * (COLUMNA_ANCHO + COLUMNA_SEPARACION) for i in range(4)]
    centros_columnas = [x + COLUMNA_ANCHO / 2 for x in columnas]
    centros_ventanas = [x + CASILLA_LADO / 2 for x in casillas]
    assert all(abs(a - b) < 0.05 for a, b in zip(centros_ventanas, centros))
    assert abs(sum(centros_ventanas) / 4 - EJE) < 0.05
    assert abs(BANDA_X + BANDA_ANCHO / 2 - EJE) < 0.0001
    assert abs(sum(centros_columnas) / 4 - EJE) < 0.0001
    assert all(abs((centros[i + 1] - centros[i]) - CASILLA_PASO) < 0.0001 for i in range(3))
    assert all(abs((columnas[i + 1] - columnas[i]) - COLUMNA_ANCHO - COLUMNA_SEPARACION) < 0.0001 for i in range(3))
    assert abs(HOLGURA - 2.0) < 0.0001
    assert abs(CASILLA_Y + CASILLA_LADO / 2 - (MARCO_Y + MARCO_LADO / 2)) < 0.0001
    assert MARCO_Y + MARCO_LADO <= HOJA_ALTO - MARGEN
    return casillas, centros, columnas


def extraer_imagenes(original: fitz.Document) -> list[tuple[bytes, bytes]]:
    """Obtiene logo y foto de cada columna según la posición en la página 1."""
    pagina = original[0]
    registros = [i for i in pagina.get_image_info(xrefs=True) if i.get("xref", 0) > 0]
    # Un mismo recurso puede estar listado dos veces con igual posición.
    unicos = {(i["xref"], tuple(round(v, 2) for v in i["bbox"])): i for i in registros}
    imagenes = list(unicos.values())
    if len(imagenes) != 8:
        raise ValueError(f"Se esperaban 8 imágenes en la página 1; se encontraron {len(imagenes)}")
    imagenes.sort(key=lambda i: (i["bbox"][0] + i["bbox"][2]) / 2)
    pares: list[tuple[bytes, bytes]] = []
    for i in range(0, 8, 2):
        par = sorted(imagenes[i:i + 2], key=lambda item: item["bbox"][1])
        logo = original.extract_image(par[0]["xref"])["image"]
        foto = original.extract_image(par[1]["xref"])["image"]
        pares.append((logo, foto))
    return pares


def imagen_ajustada(pagina: fitz.Page, datos: bytes, x: float, y: float, ancho: float, alto: float) -> None:
    caja = caja_controlada(x, y, ancho, alto)
    pagina.insert_image(caja, stream=datos, keep_proportion=True)


def pagina_plantilla(doc: fitz.Document, imagenes: list[tuple[bytes, bytes]],
                     centros: list[float], columnas: list[float]) -> None:
    pagina = doc.new_page(width=pt(HOJA_ANCHO), height=pt(HOJA_ALTO))
    regla(pagina)
    texto_centrado(pagina, "GAIMAN", EJE, 23.5, 17, negrita=True)
    texto_centrado(pagina, "INTENDENTE", EJE, 29.5, 11, negrita=True)
    texto_centrado(pagina, "Marcá UNA sola opción dentro del recuadro", EJE, 34.7, 9)
    texto_centrado(pagina, "PLANTILLA DE AYUDA · No es boleta · Elecciones 13/12/2026", EJE, 39.2, 8.5, negrita=True)

    for indice, ((numero, lista, partido, nombre, apellido), columna_x, imagen_par) in enumerate(zip(DATOS, columnas, imagenes)):
        centro = columna_x + COLUMNA_ANCHO / 2
        pagina.draw_rect(caja_controlada(columna_x, COLUMNA_Y, COLUMNA_ANCHO, COLUMNA_CABECERA_ALTO),
                         fill=(0, 0, 0), color=(0, 0, 0))
        circulo_x = columna_x + 7.0
        pagina.draw_circle(punto(circulo_x, COLUMNA_Y + COLUMNA_CABECERA_ALTO / 2), pt(4.2),
                           fill=(1, 1, 1), color=(1, 1, 1))
        texto_centrado(pagina, numero, circulo_x, COLUMNA_Y + 7.35, 11, negrita=True)
        texto_centrado(pagina, f"LISTA {lista}", centro + 4.0, COLUMNA_Y + 7.25, 12,
                       negrita=True, color=(1, 1, 1), max_ancho_mm=47)
        for renglon, contenido in enumerate(partido):
            texto_centrado(pagina, contenido, centro, 60.0 + renglon * 4.5, 9,
                           negrita=True, max_ancho_mm=COLUMNA_ANCHO - 2)
        imagen_ajustada(pagina, imagen_par[0], centro - 18, 68, 36, 17)
        imagen_ajustada(pagina, imagen_par[1], centro - 14, 87, 28, 29)
        texto_centrado(pagina, nombre, centro, 121, 10, max_ancho_mm=COLUMNA_ANCHO - 2)
        texto_centrado(pagina, apellido, centro, 129, 13, negrita=True,
                       max_ancho_mm=COLUMNA_ANCHO - 2)

    pagina.draw_rect(caja_controlada(BANDA_X, BANDA_Y, BANDA_ANCHO, BANDA_ALTO),
                     fill=(0, 0, 0), color=(0, 0, 0))
    formas_flechas = []
    for indice, centro in enumerate(centros):
        forma = (centro, FLECHA_Y_INICIO, FLECHA_Y_PUNTA,
                 FLECHA_GROSOR, FLECHA_CABEZA_ANCHO, FLECHA_CABEZA_ALTO)
        formas_flechas.append(forma)
        linea(pagina, centro, FLECHA_Y_INICIO, centro, FLECHA_Y_PUNTA - FLECHA_CABEZA_ALTO,
              width=pt(FLECHA_GROSOR), color=(0, 0, 0))
        cabeza = [punto(centro - FLECHA_CABEZA_ANCHO / 2, FLECHA_Y_PUNTA - FLECHA_CABEZA_ALTO),
                  punto(centro + FLECHA_CABEZA_ANCHO / 2, FLECHA_Y_PUNTA - FLECHA_CABEZA_ALTO),
                  punto(centro, FLECHA_Y_PUNTA)]
        pagina.draw_polyline(cabeza + [cabeza[0]], fill=(0, 0, 0), color=(0, 0, 0))
        pagina.draw_circle(punto(centro, NUMERO_FLECHA_Y), pt(NUMERO_RADIO),
                           fill=(1, 1, 1), color=(0, 0, 0), width=pt(0.45))
        texto_centrado(pagina, str(indice + 1), centro, NUMERO_FLECHA_Y + 1.35, 12, negrita=True)

        marco_x = centro - MARCO_LADO / 2
        ventana_x = centro - VENTANA_LADO / 2
        ventana_y = MARCO_Y + (MARCO_LADO - VENTANA_LADO) / 2
        pagina.draw_rect(caja_controlada(marco_x, MARCO_Y, MARCO_LADO, MARCO_LADO),
                         fill=(0, 0, 0), color=(0, 0, 0))
        pagina.draw_rect(caja_controlada(ventana_x, ventana_y, VENTANA_LADO, VENTANA_LADO),
                         fill=(1, 1, 1), color=(1, 1, 1))
        pagina.draw_rect(caja_controlada(ventana_x, ventana_y, VENTANA_LADO, VENTANA_LADO),
                         color=(0.45, 0.45, 0.45), width=pt(0.2), dashes="[2 2] 0")
        linea(pagina, centro - CRUZ_LARGO / 2, MARCO_Y + MARCO_LADO / 2,
              centro + CRUZ_LARGO / 2, MARCO_Y + MARCO_LADO / 2,
              color=(0.7, 0.7, 0.7), width=pt(0.2))
        linea(pagina, centro, MARCO_Y + MARCO_LADO / 2 - CRUZ_LARGO / 2,
              centro, MARCO_Y + MARCO_LADO / 2 + CRUZ_LARGO / 2,
              color=(0.7, 0.7, 0.7), width=pt(0.2))

    # Las seis cotas de cada flecha son iguales; sólo cambia su centro x.
    assert all(f[1:] == formas_flechas[0][1:] for f in formas_flechas)
    assert all(abs(f[0] - c) < 0.0001 for f, c in zip(formas_flechas, centros))


def pagina_base(doc: fitz.Document, casillas: list[float], centros: list[float]) -> None:
    pagina = doc.new_page(width=pt(HOJA_ANCHO), height=pt(HOJA_ALTO))
    regla(pagina)
    texto_centrado(pagina, "BASE DE POSICIONAMIENTO", EJE, 28, 17, negrita=True)
    texto_centrado(pagina,
                   "Apoyá la boleta con su borde inferior sobre el borde inferior de la hoja y centrala entre las marcas",
                   EJE, 38, 9, max_ancho_mm=HOJA_ANCHO - 2 * MARGEN)
    texto_centrado(pagina, "BOLETA OFICIAL 210 × 130 mm", EJE, 65, 11, negrita=True)
    linea(pagina, EJE, 70, EJE, 204, color=(0.65, 0.65, 0.65), width=pt(0.25), dashes="[2 2] 0")
    # El borde inferior es la excepción explícita al margen de 5 mm.
    pagina.draw_rect(rect(BOLETA_X, BOLETA_Y, BOLETA_ANCHO,
                          BORDE_BASE_VISIBLE_Y - BOLETA_Y),
                     color=(0.35, 0.35, 0.35), width=pt(0.3), dashes="[3 3] 0")
    for x in casillas:
        pagina.draw_rect(caja_controlada(x, CASILLA_Y, CASILLA_LADO, CASILLA_LADO),
                         color=(0.48, 0.48, 0.48), width=pt(0.35))
    for x, lado in ((BOLETA_X, -1), (BOLETA_X + BOLETA_ANCHO, 1)):
        x_tope = x + lado * TOPE_SEPARACION
        linea(pagina, x_tope, BOLETA_Y - TOPE_LARGO, x_tope, BOLETA_Y,
              color=(0, 0, 0), width=pt(1.2))
        linea(pagina, x_tope, BOLETA_Y - TOPE_LARGO, x_tope + lado * TOPE_LARGO,
              BOLETA_Y - TOPE_LARGO, color=(0, 0, 0), width=pt(1.2))
    assert abs(sum(centros) / len(centros) - EJE) < 0.05


def guardar_verificacion(doc: fitz.Document, casillas: list[float]) -> None:
    """Superpone sobre la página 1 la boleta y los recuadros reales en rojo translúcido."""
    prueba = fitz.open()
    pagina = prueba.new_page(width=pt(HOJA_ANCHO), height=pt(HOJA_ALTO))
    pagina.show_pdf_page(pagina.rect, doc, 0)
    pagina.draw_rect(rect(BOLETA_X, BOLETA_Y, BOLETA_ANCHO, BOLETA_ALTO),
                     fill=(1, 0, 0), fill_opacity=0.08,
                     color=(1, 0, 0), stroke_opacity=0.7, width=pt(0.5))
    for x in casillas:
        pagina.draw_rect(rect(x, CASILLA_Y, CASILLA_LADO, CASILLA_LADO),
                         fill=(1, 0, 0), fill_opacity=0.22,
                         color=(1, 0, 0), stroke_opacity=0.95, width=pt(0.6))
    SALIDA_PNG.parent.mkdir(parents=True, exist_ok=True)
    pagina.get_pixmap(matrix=fitz.Matrix(RENDER_ESCALA, RENDER_ESCALA), alpha=False).save(SALIDA_PNG)
    prueba.close()


def main() -> None:
    analizador = argparse.ArgumentParser(description=__doc__)
    analizador.add_argument("salida", nargs="?", type=Path, default=SALIDA_PDF)
    argumentos = analizador.parse_args()
    casillas, centros, columnas = geometria()
    with fitz.open(ORIGINAL) as original:
        assert len(original) == 2, "El original debe tener dos páginas"
        for pagina in original:
            assert abs(pagina.rect.width / MM_A_PT - HOJA_ANCHO) < 0.1
            assert abs(pagina.rect.height / MM_A_PT - HOJA_ALTO) < 0.1
        imagenes = extraer_imagenes(original)
        # El render en memoria permite comprobar que el original es legible sin crear archivos extra.
        assert original[0].get_pixmap(matrix=fitz.Matrix(1, 1)).width > 0
    doc = fitz.open()
    pagina_plantilla(doc, imagenes, centros, columnas)
    pagina_base(doc, casillas, centros)
    argumentos.salida.parent.mkdir(parents=True, exist_ok=True)
    doc.save(argumentos.salida, garbage=4, deflate=True)
    guardar_verificacion(doc, casillas)
    doc.close()
    print(f"PDF: {argumentos.salida}")
    print(f"Verificación: {SALIDA_PNG}")
    print("Calce: 4 centros coincidentes; holgura de 2 mm por lado; flechas iguales; banda simétrica.")


if __name__ == "__main__":
    main()
