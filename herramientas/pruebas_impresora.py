"""Genera archivos de diagnóstico para la Index V4 y, si se pide, envía uno a la impresora.

Cada archivo prueba UNA sola orden, para saber cuál provoca el error 202
("secuencia de escape desconocida"). Todos imprimen muy poco (una línea o un cuadradito).

Uso:
    python herramientas/pruebas_impresora.py                 -> solo genera los archivos
    python herramientas/pruebas_impresora.py enviar 1        -> envía la prueba 1 a la Index
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from motor import impresion  # noqa: E402

CARPETA = os.path.join(RAIZ, "pruebas_impresora")
IMPRESORA = "Index Everest-D V4"
ESC = b"\x1b"
TEXTO = b"LISTA 160\r\n"  # braille ASCII: lo traduce la tabla de la impresora
FF = b"\x0c"


def celda_grafica(puntos):
    """Celda de 8 puntos -> 2 bytes del modo gráfico ESC BEL (driver libre cups-filters)."""
    d = {n: (1 if n in puntos else 0) for n in range(1, 9)}
    b1 = 0x40 | (d[1] + 2 * d[2] + 4 * d[3] + 8 * d[7])
    b2 = 0x40 | (d[4] + 2 * d[5] + 4 * d[6] + 8 * d[8])
    return bytes([b1, b2])


def cuadrado_grafico():
    """Cuadrado de 4 celdas x 2 renglones (contorno) en modo ESC BEL."""
    lleno = celda_grafica({1, 2, 3, 7, 4, 5, 6, 8})
    arriba = celda_grafica({1, 4})
    abajo = celda_grafica({7, 8})
    izq = celda_grafica({1, 2, 3, 7})
    der = celda_grafica({4, 5, 6, 8})
    fila1 = izq + arriba + arriba + der
    fila2 = izq + abajo + abajo + der
    return fila1 + b"\r" + fila2 + b"\r"


def muestra_index():
    # Si tenés la muestra original de Index en ejemplos/ibe/ se usa esa; si no, la sintética del repo.
    ruta = os.path.join(RAIZ, "ejemplos", "ibe", "_everest_functions_graphs.ibe")
    if not os.path.isfile(ruta):
        ruta = os.path.join(RAIZ, "tests", "fixtures", "ibe", "sintetico_everest.ibe")
    with open(ruta, "rb") as f:
        return f.read()


def ibe_minimo(cabecera_d):
    """Punto libre (ESC F) con 4 puntos en cuadrado de 10 mm."""
    puntos = b"20.00:20.00\n30.00:20.00\n20.00:30.00\n30.00:30.00\n"
    return ESC + cabecera_d + ESC + b"FOR0.00:0.00,WX280.75,HY197.07;" + puntos + b";"


def regla_l():
    """L de 41 x 41 puntos (40 intervalos) con marcas cada 10, para medir el paso real."""
    from motor import index_v4
    pts = set()
    for i in range(41):
        pts.add((i, 0))          # brazo horizontal (fila 0)
        pts.add((0, i))          # brazo vertical (columna 0)
        if i % 10 == 0 and i:
            pts.update({(i, 1), (i, 2)})   # marca hacia abajo cada 10 columnas
            pts.update({(1, i), (2, i)})   # marca hacia la derecha cada 10 filas
    return index_v4.codificar_grilla(sorted(pts), 41, 41, 1.0)


def marco_a4():
    """Marco a 10 mm de los bordes de una A4 apaisada + cruz central, por el camino real del programa."""
    import app
    pts = []
    x0, y0, x1, y1 = 10.0, 10.0, 287.0, 200.0
    n = 130
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        pts += [(x, y0), (x, y1)]
    n = 90
    for k in range(n + 1):
        y = y0 + (y1 - y0) * k / n
        pts += [(x0, y), (x1, y)]
    for k in range(-10, 11):  # cruz de 40 mm en el centro (148,5 ; 105)
        pts += [(148.5 + k * 2.05, 105.0), (148.5, 105.0 + k * 2.1)]
    # Marca asimétrica: triángulo lleno en la esquina de ARRIBA A LA IZQUIERDA del diseño
    # (donde en la boleta dice GAIMAN). Sirve para ver hacia dónde gira el diseño.
    for f in range(8):
        for c in range(8 - f):
            pts.append((20.0 + c * 2.05, 20.0 + f * 2.1))
    datos, _ext, _av, _info = app.generar_archivo({"puntos": pts, "ancho": 297, "alto": 210})
    return datos


ANCHOS_PRUEBA = (10, 20, 30, 34, 40, 46, 48, 50)


def anchos_de_renglon(cabecera=b"DTM0,BI0,LS50;"):
    """Un renglón gráfico por ancho de ANCHOS_PRUEBA: fila de puntos de N bloques (2N puntos)
    y un punto suelto debajo cada 10 bloques. Sirve para encontrar el ancho máximo aceptado."""
    salida = bytearray(ESC + cabecera + ESC + b"\x07")
    for n in ANCHOS_PRUEBA:
        renglon = bytearray()
        for b in range(n):
            marca = (b + 1) % 10 == 0
            izq = 0x40 | 1 | (4 if marca else 0)   # fila 0 (+ fila 2 de marca)
            der = 0x40 | 1
            renglon += bytes([izq, der])
        salida += renglon + b"\r"
    salida += ESC + b"\x06" + FF + b"\x1a"
    return bytes(salida)


CABECERA_COMPLETA = b"DTM0,BI0,MI1,DP1,TD0,GD0,CH34,LP29,LS50,BT0;"  # como cups-filters indexv4


def escalera_fija(ancho_bloques, cabecera=b"DTM0,BI0,LS50;", fin_renglon=bytes([13])):
    """4 renglones TODOS de `ancho_bloques` bloques (relleno con @): lleno, mitad, cuarto, lleno."""
    salida = bytearray(ESC + cabecera + ESC + bytes([7]))
    for fraccion in (1.0, 0.5, 0.25, 1.0):
        llenos = max(1, int(ancho_bloques * fraccion))
        renglon = bytes([0x41, 0x41]) * llenos + b"@@" * (ancho_bloques - llenos)
        salida += renglon + fin_renglon
    salida += ESC + bytes([6]) + FF + bytes([0x1A])
    return bytes(salida)


PRUEBAS = [
    ("1_texto_sin_ordenes", "Solo texto, sin ninguna orden ESC", lambda: TEXTO + FF),
    ("2_esc_d_minimo", "ESC D con márgenes en cero", lambda: ESC + b"DTM0,BI0;" + TEXTO + FF),
    ("3_esc_d_como_el_programa", "ESC D con los mismos datos que usa el programa",
     lambda: ESC + b"DDP2,LS50,TM0,BI0,CH46,LP27;" + TEXTO + FF),
    ("4_muestra_original_index", "Archivo de muestra de Index (punto libre ESC F), sin tocar", muestra_index),
    ("5_punto_libre_minimo", "Punto libre ESC F con 4 puntos, cabecera mínima",
     lambda: ibe_minimo(b"DTM0,BI0;")),
    ("6_grafico_grilla_sin_inicio", "Modo gráfico ESC BEL, sin orden inicial",
     lambda: ESC + b"\x07" + cuadrado_grafico() + ESC + b"\x06" + FF + b"\x1a"),
    ("7_grafico_grilla_con_inicio", "Modo gráfico ESC BEL con ESC D de inicio",
     lambda: ESC + b"DTM0,BI0,LS50;" + ESC + b"\x07" + cuadrado_grafico() + ESC + b"\x06" + FF + b"\x1a"),
    ("8_regla_para_medir_paso", "Regla en L de 41 x 41 puntos, marca cada 10 (modo de la prueba 7)", regla_l),
    ("9_marco_a4_apaisada", "Marco a 10 mm de los bordes de A4 apaisada + cruz central (camino real del programa)", marco_a4),
    ("10_anchos_de_renglon", "8 renglones de 10, 20, 30, 34, 40, 46, 48 y 50 bloques, para hallar el ancho máximo",
     anchos_de_renglon),
    ("11_anchos_con_CH48", "Igual que la 10 pero avisando CH48 en el encabezado",
     lambda: anchos_de_renglon(b"DTM0,BI0,LS50,CH48;")),
    ("12_renglones_fijos_21", "4 renglones de 21 bloques (como la 8): lleno, mitad, cuarto, lleno",
     lambda: escalera_fija(21)),
    ("13_renglones_fijos_34", "Igual con 34 bloques (unos 139 mm)", lambda: escalera_fija(34)),
    ("14_renglones_fijos_48", "Igual con 48 bloques (unos 197 mm)", lambda: escalera_fija(48)),
    ("15_cabecera_completa_21", "Como la 12 pero con cabecera completa (DP1 una faz, GD0 2,0 mm, CH, LP, MI1, TD0, BT0)",
     lambda: escalera_fija(21, CABECERA_COMPLETA)),
    ("16_renglones_con_CRLF", "Como la 15 pero cada renglón termina en CR + LF",
     lambda: escalera_fija(21, CABECERA_COMPLETA, bytes([13, 10]))),
    ("17_renglones_con_LF", "Como la 15 pero cada renglón termina solo en LF",
     lambda: escalera_fija(21, CABECERA_COMPLETA, bytes([10]))),
]


def generar():
    os.makedirs(CARPETA, exist_ok=True)
    rutas = []
    for i, (nombre, desc, f) in enumerate(PRUEBAS, 1):
        ruta = os.path.join(CARPETA, nombre + ".prn")
        with open(ruta, "wb") as fh:
            fh.write(f())
        rutas.append(ruta)
        print(f"{i}. {nombre}.prn  ->  {desc}")
    return rutas


def main():
    rutas = generar()
    if len(sys.argv) >= 3 and sys.argv[1] == "enviar":
        n = int(sys.argv[2])
        with open(rutas[n - 1], "rb") as fh:
            datos = fh.read()
        impresion.enviar_windows(IMPRESORA, datos, f"Prueba {n}")
        print(f"Enviada la prueba {n} ({len(datos)} bytes) a «{IMPRESORA}».")


if __name__ == "__main__":
    main()
