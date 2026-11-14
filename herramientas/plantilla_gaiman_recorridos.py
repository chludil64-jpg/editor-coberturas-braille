"""Plantilla de Gaiman: parte superior IDÉNTICA al original y parte inferior con recorridos.

Debajo de cada candidato sale un recorrido negro grueso (baja, gira y baja) que termina en
una flecha vertical idéntica apuntando al CENTRO de su ventana. Los cuatro marcos negros
son idénticos y cada uno está centrado en su ventana (mismo margen negro en los cuatro).
Las ventanas quedan exactamente sobre los recuadros reales de la boleta, que va centrada
en la A4 apaisada y apoyada con su borde inferior sobre el borde inferior de la hoja.

Uso:  python herramientas/plantilla_gaiman_recorridos.py [salida.pdf]
"""
import os
import sys

import pymupdf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGINAL = os.path.join(RAIZ, "ejemplos", "plantilla_original_gaiman.pdf")
BASE_NUEVA = os.path.join(RAIZ, "ejemplos", "plantilla_gaiman_calce_exacto.pdf")  # su página 2 (base)
SALIDA = os.path.join(RAIZ, "ejemplos", "plantilla_gaiman_recorridos.pdf")
VERIFICACION = os.path.join(RAIZ, "docs", "verificacion_plantilla_recorridos.png")

MM = 72 / 25.4  # puntos por milímetro

# --- Boleta real (mm), centrada en la hoja y apoyada abajo ------------------------------
BOLETA_X, BOLETA_Y, BOLETA_W, BOLETA_H = 43.5, 80.0, 210.0, 130.0
RECUADRO = 16.0          # lado de cada recuadro de marcar
RECUADRO_IZQ = 34.0      # borde izquierdo de la boleta -> primer recuadro
RECUADRO_DER = 20.0      # último recuadro -> borde derecho de la boleta
RECUADRO_ABAJO = 15.0    # recuadro -> borde inferior de la boleta
PASO = (BOLETA_W - RECUADRO_IZQ - RECUADRO_DER - RECUADRO) / 3
CENTROS_X = [BOLETA_X + RECUADRO_IZQ + RECUADRO / 2 + i * PASO for i in range(4)]
CENTRO_Y = BOLETA_Y + BOLETA_H - RECUADRO_ABAJO - RECUADRO / 2   # 187

# --- Columnas del original (no se tocan) --------------------------------------------------
COLUMNAS = [(7.0, 74.7), (78.7, 146.5), (150.5, 218.2), (222.2, 290.0)]
PIE_COLUMNA = 142.0
TRAZO_COLUMNA = 2.2 / MM

# --- Parte inferior ------------------------------------------------------------------
MARCO = 30.0             # marco negro, igual en los cuatro
VENTANA = 20.0           # ventana blanca (2 mm de holgura alrededor del recuadro)
CRUZ = 4.0               # cruz guía en el centro de la ventana
PIE_MARCO = 205.0        # el marco se alarga hacia abajo hasta acá para alojar el número
NUMERO_PT = 18           # número debajo de cada ventana (blanco, dentro del marco)
NUMERO_ALTO = NUMERO_PT * 0.72 / MM   # altura de los números de Helvetica en mm
GROSOR = 3.5             # grosor del recorrido negro
NUMERO_Y = 151.5         # centro del círculo con el número
NUMERO_R = 5.5
GIRO_Y = 160.5           # altura del tramo horizontal (igual para los cuatro)
PUNTA_ALTO = 7.0         # alto de la punta de flecha
PUNTA_ANCHO = 11.0       # ancho de la punta de flecha
SEPARACION = 1.2         # aire entre la punta de flecha y el marco


def p(x, y):
    return pymupdf.Point(x * MM, y * MM)


def r(x0, y0, x1, y1):
    return pymupdf.Rect(x0 * MM, y0 * MM, x1 * MM, y1 * MM)


def rehacer_inferior(pagina):
    limite = PIE_COLUMNA + TRAZO_COLUMNA / 2 + 0.05
    pagina.draw_rect(r(0, limite, 297, 210), color=None, fill=(1, 1, 1), overlay=True)
    marco_y0 = CENTRO_Y - MARCO / 2
    punta_y = marco_y0 - SEPARACION                 # punta de la flecha
    base_punta_y = punta_y - PUNTA_ALTO
    for i, (col, vx) in enumerate(zip(COLUMNAS, CENTROS_X), start=1):
        # Marco negro idéntico centrado en la ventana, y ventana blanca sobre el recuadro real.
        pagina.draw_rect(r(vx - MARCO / 2, CENTRO_Y - MARCO / 2, vx + MARCO / 2, PIE_MARCO),
                         color=None, fill=(0, 0, 0))
        pagina.draw_rect(r(vx - VENTANA / 2, CENTRO_Y - VENTANA / 2, vx + VENTANA / 2, CENTRO_Y + VENTANA / 2),
                         color=(0.55, 0.55, 0.55), fill=(1, 1, 1), width=0.4, dashes="[2 2] 0")
        pagina.draw_line(p(vx - CRUZ / 2, CENTRO_Y), p(vx + CRUZ / 2, CENTRO_Y), color=(0.6, 0.6, 0.6), width=0.4)
        pagina.draw_line(p(vx, CENTRO_Y - CRUZ / 2), p(vx, CENTRO_Y + CRUZ / 2), color=(0.6, 0.6, 0.6), width=0.4)
        # Número blanco centrado debajo de la ventana, en el margen inferior del marco.
        ancho = pymupdf.get_text_length(str(i), fontname="hebo", fontsize=NUMERO_PT)
        base_y = (CENTRO_Y + VENTANA / 2 + PIE_MARCO) / 2 + NUMERO_ALTO / 2
        pagina.insert_text(pymupdf.Point(vx * MM - ancho / 2, base_y * MM), str(i),
                           fontsize=NUMERO_PT, fontname="hebo", color=(1, 1, 1))


def verificar():
    assert abs(CENTROS_X[-1] + RECUADRO / 2 - (BOLETA_X + BOLETA_W - RECUADRO_DER)) < 0.05
    assert PIE_MARCO <= 205.0
    # Los tramos horizontales no se pisan entre sí.
    tramos = sorted((min((c[0] + c[1]) / 2, v), max((c[0] + c[1]) / 2, v)) for c, v in zip(COLUMNAS, CENTROS_X))
    assert all(a[1] + GROSOR < b[0] for a, b in zip(tramos, tramos[1:])), tramos
    # Marcos separados entre sí.
    assert PASO > MARCO


def imagen_verificacion(pagina):
    doc = pymupdf.open()
    nueva = doc.new_page(width=pagina.rect.width, height=pagina.rect.height)
    nueva.show_pdf_page(nueva.rect, pagina.parent, pagina.number)
    nueva.draw_rect(r(BOLETA_X, BOLETA_Y, BOLETA_X + BOLETA_W, BOLETA_Y + BOLETA_H),
                    color=(1, 0, 0), fill=(1, 0, 0), fill_opacity=0.08, width=1)
    for cx in CENTROS_X:
        nueva.draw_rect(r(cx - RECUADRO / 2, CENTRO_Y - RECUADRO / 2, cx + RECUADRO / 2, CENTRO_Y + RECUADRO / 2),
                        color=(1, 0, 0), width=1.2)
    nueva.get_pixmap(dpi=144).save(VERIFICACION)


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else SALIDA
    verificar()
    doc = pymupdf.open()
    doc.insert_pdf(pymupdf.open(ORIGINAL), from_page=0, to_page=0)   # página 1: original tal cual
    rehacer_inferior(doc[0])
    if os.path.exists(BASE_NUEVA):
        doc.insert_pdf(pymupdf.open(BASE_NUEVA), from_page=1, to_page=1)  # página 2: base
    doc.save(salida, garbage=4, deflate=True)
    imagen_verificacion(doc[0])
    print("PDF:", salida)
    print("Centros de ventana (mm):", [round(c, 2) for c in CENTROS_X], "y =", CENTRO_Y)


if __name__ == "__main__":
    main()
