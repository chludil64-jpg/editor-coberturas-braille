"""Plantilla de Gaiman: parte superior IDÉNTICA al original y parte inferior rehecha.

Cada embudo negro nace en todo el ancho del borde inferior de la columna de su candidato
y baja hasta el borde superior del marco cuadrado de su ventana. Las ventanas quedan
exactamente sobre los recuadros reales de la boleta (boleta centrada en la A4 apaisada,
apoyada con su borde inferior sobre el borde inferior de la hoja).

Uso:  python herramientas/plantilla_gaiman_embudos.py [salida.pdf]
"""
import os
import sys

import pymupdf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGINAL = os.path.join(RAIZ, "ejemplos", "plantilla_original_gaiman.pdf")
BASE_NUEVA = os.path.join(RAIZ, "ejemplos", "plantilla_gaiman_calce_exacto.pdf")  # su página 2 (base)
SALIDA = os.path.join(RAIZ, "ejemplos", "plantilla_gaiman_embudos.pdf")
VERIFICACION = os.path.join(RAIZ, "docs", "verificacion_plantilla_embudos.png")

MM = 72 / 25.4  # puntos por milímetro

# --- Boleta real (mm) -------------------------------------------------------------
BOLETA_X, BOLETA_Y, BOLETA_W, BOLETA_H = 43.5, 80.0, 210.0, 130.0   # centrada y apoyada abajo
RECUADRO = 16.0                      # lado de cada recuadro de marcar
RECUADRO_IZQ = 34.0                  # del borde izquierdo de la boleta al primer recuadro
RECUADRO_DER = 20.0                  # del último recuadro al borde derecho de la boleta
RECUADRO_ABAJO = 15.0                # del recuadro al borde inferior de la boleta
PASO = (BOLETA_W - RECUADRO_IZQ - RECUADRO_DER - RECUADRO) / 3
CENTROS_X = [BOLETA_X + RECUADRO_IZQ + RECUADRO / 2 + i * PASO for i in range(4)]
CENTRO_Y = BOLETA_Y + BOLETA_H - RECUADRO_ABAJO - RECUADRO / 2      # 187.0

# --- Columnas del original (no se tocan) ---------------------------------------------
COLUMNAS = [(7.0, 74.7), (78.7, 146.5), (150.5, 218.2), (222.2, 290.0)]
PIE_COLUMNA = 142.0                  # borde inferior de las columnas
TRAZO_COLUMNA = 2.2 / MM             # grosor del borde de columna (2,2 pt) en mm

# --- Parte inferior nueva -----------------------------------------------------------
MARCO = 30.0                         # marco negro cuadrado
VENTANA = 20.0                       # ventana blanca (2 mm de holgura alrededor del recuadro)
CRUZ = 4.0                           # cruz guía en el centro de la ventana
NUMERO_Y = 154.0                     # altura del círculo con el número dentro del embudo
NUMERO_R = 5.0                       # radio del círculo blanco
FLECHA_Y = 165.0                     # punta de flecha blanca dentro del embudo


def r(x0, y0, x1, y1):
    return pymupdf.Rect(x0 * MM, y0 * MM, x1 * MM, y1 * MM)


def p(x, y):
    return pymupdf.Point(x * MM, y * MM)


def eje_x(col, ventana_cx, y):
    """x del eje del embudo (de centro de columna a centro de ventana) a la altura y."""
    cx = (col[0] + col[1]) / 2
    marco_y0 = CENTRO_Y - MARCO / 2
    t = (y - PIE_COLUMNA) / (marco_y0 - PIE_COLUMNA)
    return cx + (ventana_cx - cx) * t


CENTRO_HOJA = 148.5                  # eje de simetría: centro de la hoja y de la boleta
BANDA_Y0 = CENTRO_Y - MARCO / 2      # 172: banda negra donde terminan los embudos
BANDA_Y1 = CENTRO_Y + MARCO / 2      # 202
# Salidas de los embudos: simétricas respecto del centro de la hoja, con el mismo paso
# que las ventanas. (Las ventanas reales quedan ~7 mm a la derecha de cada salida porque
# los recuadros de la boleta no están centrados en ella.)
DESVIO = sum(CENTROS_X) / 4 - CENTRO_HOJA
SALIDAS_X = [c - DESVIO for c in CENTROS_X]
# Banda simétrica que cubre todas las ventanas con 5 mm de margen.
BANDA_MEDIO_ANCHO = max(abs(c - CENTRO_HOJA) for c in CENTROS_X) + VENTANA / 2 + 5.0


def rehacer_inferior(pagina):
    # 1) Borrar todo lo que había debajo de las columnas (embudos, ventanas y números viejos).
    limite = PIE_COLUMNA + TRAZO_COLUMNA / 2 + 0.05
    pagina.draw_rect(r(0, limite, 297, 210), color=None, fill=(1, 1, 1), overlay=True)
    # 2) Banda negra simétrica.
    pagina.draw_rect(r(CENTRO_HOJA - BANDA_MEDIO_ANCHO, BANDA_Y0, CENTRO_HOJA + BANDA_MEDIO_ANCHO, BANDA_Y1),
                     color=None, fill=(0, 0, 0))
    for i, (col, sx) in enumerate(zip(COLUMNAS, SALIDAS_X), start=1):
        # 3) Embudo: del ancho completo del pie de la columna a una salida de 30 mm sobre la banda.
        #    Columnas y salidas son simétricas, así que los embudos quedan en espejo (1-4 y 2-3).
        x0 = col[0] - TRAZO_COLUMNA / 2
        x1 = col[1] + TRAZO_COLUMNA / 2
        forma = pagina.new_shape()
        forma.draw_polyline([p(x0, PIE_COLUMNA), p(x1, PIE_COLUMNA),
                             p(sx + MARCO / 2, BANDA_Y0 + 0.2), p(sx - MARCO / 2, BANDA_Y0 + 0.2),
                             p(x0, PIE_COLUMNA)])
        forma.finish(color=None, fill=(0, 0, 0), closePath=True)
        forma.commit()
        # 4) Número en círculo blanco y flecha blanca sobre el eje del embudo (también en espejo).
        cx = (col[0] + col[1]) / 2
        def eje(y):
            return cx + (sx - cx) * (y - PIE_COLUMNA) / (BANDA_Y0 - PIE_COLUMNA)
        nx = eje(NUMERO_Y)
        pagina.draw_circle(p(nx, NUMERO_Y), NUMERO_R * MM, color=None, fill=(1, 1, 1))
        ancho_txt = pymupdf.get_text_length(str(i), fontname="hebo", fontsize=17)
        pagina.insert_text(pymupdf.Point(nx * MM - ancho_txt / 2, (NUMERO_Y + 2.1) * MM), str(i),
                           fontsize=17, fontname="hebo", color=(0, 0, 0))
        # Flecha alineada con el eje del embudo: base perpendicular a la dirección del eje.
        dx, dy = sx - cx, BANDA_Y0 - PIE_COLUMNA
        largo = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / largo, dy / largo          # dirección del eje (hacia abajo)
        nxp, nyp = -uy, ux                        # perpendicular
        # Flecha completa (cuerpo + punta) desde debajo del círculo hacia la banda.
        inicio_y = NUMERO_Y + NUMERO_R + 1.5
        ix, iy = eje(inicio_y), inicio_y
        tx, ty = eje(BANDA_Y0 - 2.0), BANDA_Y0 - 2.0
        largo_f = ((tx - ix) ** 2 + (ty - iy) ** 2) ** 0.5
        cuerpo, punta_l, medio_cuerpo, medio_punta = largo_f - 5.0, 5.0, 1.4, 4.0
        hx, hy = ix + ux * cuerpo, iy + uy * cuerpo   # donde termina el cuerpo y empieza la punta
        puntos = [(ix + nxp * medio_cuerpo, iy + nyp * medio_cuerpo),
                  (hx + nxp * medio_cuerpo, hy + nyp * medio_cuerpo),
                  (hx + nxp * medio_punta, hy + nyp * medio_punta),
                  (tx, ty),
                  (hx - nxp * medio_punta, hy - nyp * medio_punta),
                  (hx - nxp * medio_cuerpo, hy - nyp * medio_cuerpo),
                  (ix - nxp * medio_cuerpo, iy - nyp * medio_cuerpo)]
        forma = pagina.new_shape()
        forma.draw_polyline([p(x, y) for x, y in puntos + puntos[:1]])
        forma.finish(color=None, fill=(1, 1, 1), closePath=True)
        forma.commit()
    # 5) Ventanas blancas exactamente sobre los recuadros reales de la boleta.
    for cx in CENTROS_X:
        pagina.draw_rect(r(cx - VENTANA / 2, CENTRO_Y - VENTANA / 2, cx + VENTANA / 2, CENTRO_Y + VENTANA / 2),
                         color=(0.55, 0.55, 0.55), fill=(1, 1, 1), width=0.4, dashes="[2 2] 0")
        pagina.draw_line(p(cx - CRUZ / 2, CENTRO_Y), p(cx + CRUZ / 2, CENTRO_Y), color=(0.6, 0.6, 0.6), width=0.4)
        pagina.draw_line(p(cx, CENTRO_Y - CRUZ / 2), p(cx, CENTRO_Y + CRUZ / 2), color=(0.6, 0.6, 0.6), width=0.4)


def verificar():
    for cx, i in zip(CENTROS_X, range(4)):
        recuadro_cx = BOLETA_X + RECUADRO_IZQ + RECUADRO / 2 + i * PASO
        assert abs(cx - recuadro_cx) < 0.05
    assert abs(CENTROS_X[-1] + RECUADRO / 2 - (BOLETA_X + BOLETA_W - RECUADRO_DER)) < 0.05
    assert CENTRO_Y + MARCO / 2 <= 205.0, "el marco no debe pasar del margen inferior de impresión"
    # Simetría: columnas y salidas de embudo en espejo respecto del centro de la hoja.
    for (a0, a1), (b0, b1) in zip(COLUMNAS, reversed(COLUMNAS)):
        assert abs((a0 + b1) / 2 - CENTRO_HOJA) < 0.1 and abs((a1 + b0) / 2 - CENTRO_HOJA) < 0.1
    for a, b in zip(SALIDAS_X, reversed(SALIDAS_X)):
        assert abs((a + b) / 2 - CENTRO_HOJA) < 0.01
    assert all(CENTRO_HOJA - BANDA_MEDIO_ANCHO <= c - VENTANA / 2 and c + VENTANA / 2 <= CENTRO_HOJA + BANDA_MEDIO_ANCHO
               for c in CENTROS_X)


def imagen_verificacion(pagina):
    """Página 1 con la boleta y sus recuadros reales superpuestos en rojo."""
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
    original = pymupdf.open(ORIGINAL)
    doc = pymupdf.open()
    doc.insert_pdf(original, from_page=0, to_page=0)       # página 1: el original tal cual
    rehacer_inferior(doc[0])
    if os.path.exists(BASE_NUEVA):                          # página 2: base con la boleta apoyada abajo
        doc.insert_pdf(pymupdf.open(BASE_NUEVA), from_page=1, to_page=1)
    doc.save(salida, garbage=4, deflate=True)
    imagen_verificacion(doc[0])
    print("PDF:", salida)
    print("Verificación:", VERIFICACION)
    print("Centros de ventana (mm):", [round(c, 2) for c in CENTROS_X], "y =", CENTRO_Y)


if __name__ == "__main__":
    main()
