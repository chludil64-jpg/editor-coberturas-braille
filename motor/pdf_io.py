"""Lectura de PDF (textos con posición, fondo, vectores) y generación del
PDF de prueba 1:1 y del PNG de la matriz de puntos. Todo en milímetros."""

import math

import pymupdf

PT_A_MM = 25.4 / 72.0
MM_A_PT = 72.0 / 25.4
DIAMETRO_PUNTO_MM = 1.5


def abrir(datos):
    """Abre un PDF desde bytes. Quita la rotación de las páginas para que
    textos, vectores y fondo compartan el mismo sistema de coordenadas."""
    doc = pymupdf.open(stream=datos, filetype="pdf")
    if doc.needs_pass:
        raise ValueError("El PDF está protegido con contraseña.")
    for pagina in doc:
        if pagina.rotation:
            pagina.remove_rotation()
    return doc


def _r(v):
    return round(v * PT_A_MM, 2)


def info(doc):
    """Tamaño y textos de cada página, en mm."""
    paginas = []
    for pagina in doc:
        renglones = []
        datos = pagina.get_text("dict", flags=pymupdf.TEXTFLAGS_TEXT)
        for bloque in datos.get("blocks", []):
            if bloque.get("type") != 0:
                continue
            for linea in bloque.get("lines", []):
                spans = [s for s in linea.get("spans", []) if s.get("text", "").strip()]
                if not spans:
                    continue
                texto = "".join(s["text"] for s in linea["spans"]).strip()
                x0, y0, x1, y1 = linea["bbox"]
                tam = max(s["size"] for s in spans)
                negrita = any((s.get("flags", 0) & 16) or "Bold" in s.get("font", "") for s in spans)
                renglones.append({
                    "texto": texto,
                    "x0": _r(x0), "y0": _r(y0), "x1": _r(x1), "y1": _r(y1),
                    "tam_pt": round(tam, 1),
                    "negrita": bool(negrita),
                })
        renglones.sort(key=lambda r: (r["y0"], r["x0"]))
        paginas.append({
            "numero": pagina.number,
            "ancho": _r(pagina.rect.width),
            "alto": _r(pagina.rect.height),
            "renglones": renglones,
            "tiene_texto": bool(renglones),
        })
    return paginas


def render_png(doc, numero, dpi=110):
    dpi = max(36, min(int(dpi), 300))
    pix = doc[numero].get_pixmap(dpi=dpi, alpha=False)
    return pix.tobytes("png")


def _bezier(p0, p1, p2, p3, n=12):
    puntos = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t ** 2
        d = t ** 3
        puntos.append((a * p0.x + b * p1.x + c * p2.x + d * p3.x,
                       a * p0.y + b * p1.y + c * p2.y + d * p3.y))
    return puntos


def vectores(doc, numero):
    """Trazos vectoriales de la página como polilíneas en mm.

    Devuelve una lista de ``{"tipo": "trazo"|"relleno", "cerrado": bool,
    "puntos": [[x, y], ...], "ancho": mm}``."""
    salida = []
    for dibujo in doc[numero].get_drawings():
        tipo = dibujo.get("type", "s")
        clase = "relleno" if tipo == "f" else "trazo"
        ancho = (dibujo.get("width") or 0) * PT_A_MM
        actual = []

        def cerrar(cerrado=False):
            if len(actual) >= 2:
                salida.append({"tipo": clase, "cerrado": cerrado,
                               "puntos": [[_r(x), _r(y)] for x, y in actual],
                               "ancho": round(ancho, 2)})

        for item in dibujo["items"]:
            op = item[0]
            if op == "re":
                cerrar()
                actual = []
                r = item[1]
                salida.append({"tipo": clase, "cerrado": True, "ancho": round(ancho, 2),
                               "puntos": [[_r(r.x0), _r(r.y0)], [_r(r.x1), _r(r.y0)],
                                          [_r(r.x1), _r(r.y1)], [_r(r.x0), _r(r.y1)]]})
            elif op == "qu":
                cerrar()
                actual = []
                q = item[1]
                salida.append({"tipo": clase, "cerrado": True, "ancho": round(ancho, 2),
                               "puntos": [[_r(q.ul.x), _r(q.ul.y)], [_r(q.ur.x), _r(q.ur.y)],
                                          [_r(q.lr.x), _r(q.lr.y)], [_r(q.ll.x), _r(q.ll.y)]]})
            elif op == "l":
                p1, p2 = item[1], item[2]
                if actual and math.dist(actual[-1], (p1.x, p1.y)) < 0.01:
                    actual.append((p2.x, p2.y))
                else:
                    cerrar()
                    actual = [(p1.x, p1.y), (p2.x, p2.y)]
            elif op == "c":
                p0, c1, c2, p3 = item[1], item[2], item[3], item[4]
                curva = _bezier(p0, c1, c2, p3)
                if actual and math.dist(actual[-1], curva[0]) < 0.01:
                    actual.extend(curva[1:])
                else:
                    cerrar()
                    actual = curva
        cerrado = bool(dibujo.get("closePath")) or (
            len(actual) > 2 and math.dist(actual[0], actual[-1]) < 0.01)
        cerrar(cerrado)
    return salida


def _dibujar_puntos(pagina, puntos, diametro=DIAMETRO_PUNTO_MM, color=(0, 0, 0)):
    r = diametro / 2 * MM_A_PT
    forma = pagina.new_shape()
    for x, y in puntos:
        forma.draw_circle(pymupdf.Point(x * MM_A_PT, y * MM_A_PT), r)
    forma.finish(color=None, fill=color, width=0)
    forma.commit()


def pdf_prueba(ancho, alto, puntos, doc_fondo=None, numero=0, regla=True, titulo=""):
    """PDF a tamaño real (1:1) con los puntos sobre el diseño original.

    Se imprime en tinta común al 100 % (sin "ajustar a página") y se
    superpone a la boleta para verificar el calce antes de usar acetato."""
    salida = pymupdf.open()
    pagina = salida.new_page(width=ancho * MM_A_PT, height=alto * MM_A_PT)
    if doc_fondo is not None:
        pagina.show_pdf_page(pagina.rect, doc_fondo, numero)
    _dibujar_puntos(pagina, puntos, color=(0.85, 0, 0.35) if doc_fondo is not None else (0, 0, 0))
    if regla:
        # Barra de 100 mm abajo a la izquierda para comprobar la escala de impresión.
        x0, y = 10 * MM_A_PT, (alto - 4) * MM_A_PT
        pagina.draw_line((x0, y), (x0 + 100 * MM_A_PT, y), color=(0, 0, 0), width=0.8)
        for i in range(11):
            xx = x0 + i * 10 * MM_A_PT
            pagina.draw_line((xx, y - (2.5 if i % 5 == 0 else 1.2) * MM_A_PT), (xx, y),
                             color=(0, 0, 0), width=0.5)
        pagina.insert_text((x0 + 102 * MM_A_PT, y), "100 mm: imprimir al 100 % (tamaño real) " + titulo,
                           fontsize=6, color=(0, 0, 0))
    return salida.tobytes(deflate=True)


def png_puntos(ancho, alto, puntos, px_por_mm=10):
    """PNG de la matriz de puntos sobre fondo blanco."""
    doc = pymupdf.open()
    pagina = doc.new_page(width=ancho * MM_A_PT, height=alto * MM_A_PT)
    _dibujar_puntos(pagina, puntos)
    dpi = px_por_mm * 25.4
    pix = pagina.get_pixmap(dpi=int(round(dpi)), alpha=False)
    return pix.tobytes("png")
