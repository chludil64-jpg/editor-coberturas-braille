"""Codificadores para la Index Everest-D V4.

Dos formatos:

1. ``punto_libre`` (principal, archivos ``.ibe``): texto plano latin-1 copiado de
   las muestras gráficas de Index::

       ESC D DP2,LS50,TM0,BI0,CH34,LP29;
       ESC F OR3.00:0.00,WX197.07,HY280.75;
       x:y            <- una línea por punto, en mm con 2 decimales
       ...
       x:y;           <- el último punto cierra con ';'

   El significado exacto de DP, CH, LP y OR no está confirmado por Index:
   se toman del perfil (ver LEEME.md).

2. ``grilla`` (plan B, archivos ``.prn``): modo gráfico por grilla del driver
   libre de OpenPrinting (cups-filters) para Index V4. Cada bloque de 2x4
   puntos son 2 bytes (columna izquierda y derecha), cada renglón de bloques
   termina con CR.

Todo trabaja con una lista de puntos ``(x, y)`` en milímetros, origen arriba a
la izquierda de la hoja tal como entra a la impresora.
"""

import math
import re

ESC = b"\x1b"
ORDEN_ENCABEZADO = ["DP", "LS", "TM", "BI", "CH", "LP"]


def _mm(valor):
    """Formatea milímetros con 2 decimales, como en las muestras de Index."""
    return f"{float(valor):.2f}"


# ---------------------------------------------------------------- punto libre

def codificar_punto_libre(puntos, ancho, alto, encabezado=None, origen=(0.0, 0.0),
                          terminador="\n", cierre=True):
    """Devuelve los bytes de un archivo .ibe con los puntos dados.

    ``encabezado``: dict con claves DP, LS, TM, BI, CH, LP (otras claves extra
    se agregan al final en el orden en que vienen).
    ``cierre``: agrega el ';' final (las muestras basic y geometry lo traen;
    las de Everest y BrailleBox terminan sin él).
    """
    encabezado = dict(encabezado or {"DP": 2, "LS": 50, "TM": 0, "BI": 0, "CH": 34, "LP": 29})
    claves = [k for k in ORDEN_ENCABEZADO if k in encabezado]
    claves += [k for k in encabezado if k not in ORDEN_ENCABEZADO]
    linea_d = ",".join(f"{k}{encabezado[k]}" for k in claves)
    linea_f = f"OR{_mm(origen[0])}:{_mm(origen[1])},WX{_mm(ancho)},HY{_mm(alto)}"
    cuerpo = terminador.join(f"{_mm(x)}:{_mm(y)}" for x, y in puntos)
    texto = "\x1bD" + linea_d + ";" + "\x1bF" + linea_f + ";" + cuerpo + (";" if cierre else "") + terminador
    return texto.encode("latin-1")


_RE_D = re.compile(r"\x1bD([^;]*);")
_RE_F = re.compile(r"\x1bF([^;]*);([^;]*);?")
_RE_PAR = re.compile(r"^([A-Za-z]+)(.*)$")


def _a_numero(texto):
    try:
        return float(texto) if "." in texto else int(texto)
    except ValueError:
        return texto


def leer_ibe(datos):
    """Lee un archivo .ibe (bytes o str) y devuelve un dict.

    ``{"encabezado": {...}, "paginas": [{"origen": (x, y), "ancho", "alto",
    "puntos": [(x, y), ...], "terminador"}]}``
    """
    if isinstance(datos, bytes):
        datos = datos.decode("latin-1")
    encabezado = {}
    m = _RE_D.search(datos)
    if m:
        for parte in m.group(1).split(","):
            parte = parte.strip()
            mp = _RE_PAR.match(parte)
            if mp:
                encabezado[mp.group(1).upper()] = _a_numero(mp.group(2))
    paginas = []
    for mf in _RE_F.finditer(datos):
        params = {}
        for parte in mf.group(1).split(","):
            mp = _RE_PAR.match(parte.strip())
            if mp:
                params[mp.group(1).upper()] = mp.group(2)
        ox, oy = 0.0, 0.0
        if "OR" in params and ":" in params["OR"]:
            a, b = params["OR"].split(":", 1)
            ox, oy = float(a), float(b)
        cuerpo = mf.group(2)
        terminador = "\r\n" if "\r\n" in cuerpo else "\n"
        puntos = []
        for linea in re.split(r"[\r\n]+", cuerpo):
            linea = linea.strip()
            if not linea or ":" not in linea:
                continue
            a, b = linea.split(":", 1)
            try:
                puntos.append((float(a), float(b)))
            except ValueError:
                continue
        paginas.append({
            "origen": (ox, oy),
            "ancho": float(params.get("WX", 0) or 0),
            "alto": float(params.get("HY", 0) or 0),
            "puntos": puntos,
            "terminador": terminador,
        })
    if not paginas:
        raise ValueError("No parece un archivo .ibe de Index (falta la orden ESC F).")
    return {"encabezado": encabezado, "paginas": paginas}


# ---------------------------------------------------------------- plan B: grilla

def _a_grilla(puntos, ancho, alto, paso, paso_y=None):
    """Ajusta los puntos a la grilla. Devuelve (conjunto de (col, fila), ncols, nfilas, fuera, fusionados)."""
    paso_y = paso_y or paso
    ncols = int(math.floor(ancho / paso + 1e-9)) + 1
    nfilas = int(math.floor(alto / paso_y + 1e-9)) + 1
    celdas = set()
    fuera = 0
    fusionados = 0
    for x, y in puntos:
        c = int(round(x / paso))
        f = int(round(y / paso_y))
        if c < 0 or f < 0 or c >= ncols or f >= nfilas:
            fuera += 1
            continue
        if (c, f) in celdas:
            fusionados += 1
        celdas.add((c, f))
    return celdas, ncols, nfilas, fuera, fusionados


def codificar_grilla(puntos, ancho, alto, paso=2.0, params=None, info=None, paso_y=None):
    """Plan B: modo gráfico por grilla (ESC BEL) del driver libre para Index V4.

    ``paso`` es la distancia horizontal entre puntos y ``paso_y`` la vertical (mm).
    Medido en la Everest-D V4 real: 2,05 mm horizontal y 2,10 mm vertical.
    ``info`` (dict opcional) recibe ``fuera`` y ``fusionados``.
    """
    params = dict(params or {})
    celdas, ncols, nfilas, fuera, fusionados = _a_grilla(puntos, ancho, alto, paso, paso_y)
    bloques_x = (ncols + 1) // 2
    bloques_y = (nfilas + 3) // 4
    if info is not None:
        info.update({"fuera": fuera, "fusionados": fusionados,
                     "bloques_x": bloques_x, "bloques_y": bloques_y})
    # Encabezado probado en la Everest-D V4 real (prueba 16, nov. 2026), igual al de cups-filters:
    #   ESC D TM0,BI0,MI1,DP1,TD0,GD0,CH34,LP29,LS50,BT0;
    # Sin ESC D el modo gráfico da error 202. DP1 = una sola faz; GD0 = puntos gráficos a 2,0 mm
    # (GD1 = 2,5 mm, GD2 = 1,6 mm); MI1 = un golpe por punto; TD0 = texto a 2,5 mm.
    # Una clave con valor None o "" en el perfil se omite.
    # CH y LP en "auto" (por defecto): la V4 cuenta cada renglón gráfico como un renglón de
    # texto, y con LP29 partió en dos hojas un dibujo de 35 renglones (prueba 9). Por eso LP
    # se calcula con la cantidad real de renglones y CH con el renglón más ancho (en bloques).
    orden = (("TM", 0), ("BI", 0), ("MI", 1), ("DP", 1), ("TD", 0), ("GD", 0),
             ("CH", "auto"), ("LP", "auto"), ("LS", 50), ("BT", 0))
    pesos = (1, 2, 4, 8)  # filas 0..2 -> 1,2,4 ; fila 3 -> 8
    renglones = []
    for by in range(bloques_y):
        renglon = bytearray()
        for bx in range(bloques_x):
            for lado in (0, 1):
                col = bx * 2 + lado
                valor = 0
                for fila_rel in range(4):
                    if (col, by * 4 + fila_rel) in celdas:
                        valor |= pesos[fila_rel]
                renglon.append(0x40 | valor)
        # Se quitan bloques vacíos (pares «@@») del final: nunca un byte suelto,
        # para no correr las columnas. Así no se manda ancho de más a la impresora.
        while renglon.endswith(b"@@"):
            del renglon[-2:]
        renglones.append(bytes(renglon))
    # Renglones vacíos del final: no hacen falta y podrían pasar a otra hoja.
    while renglones and not renglones[-1]:
        renglones.pop()
    automaticos = {"CH": max([len(r) // 2 for r in renglones] + [1]), "LP": max(len(renglones), 1)}
    if info is not None:
        info.update({"CH": automaticos["CH"], "LP": automaticos["LP"]})
    partes = []
    for clave, defecto in orden:
        valor = params.get(clave, defecto)
        if valor == "auto":
            valor = automaticos[clave]
        if valor not in (None, ""):
            partes.append(f"{clave}{valor}")
    salida = bytearray()
    salida += ESC + ("D" + ",".join(partes) + ";").encode("ascii")
    salida += b"\x1b\x07"  # entrar al modo gráfico
    # Cada renglón termina en CR + LF: con CR solo, la Everest-D V4 no avanza el papel y
    # superpone todos los renglones (pruebas 12 y 15 fallaron, la 16 con CR LF salió bien).
    for renglon in renglones:
        salida += renglon
        salida += bytes([0x0D, 0x0A])
    salida += b"\x1b\x06"  # salir del modo gráfico
    salida.append(0x0C)    # salto de página (como en la prueba 7)
    salida.append(0x1A)    # fin de documento
    return bytes(salida)


def decodificar_grilla(datos, paso=2.0, paso_y=None):
    """Inverso de ``codificar_grilla`` (para pruebas y vista previa)."""
    inicio = datos.index(b"\x1b\x07") + 2
    fin = datos.index(b"\x1b\x06", inicio)
    puntos = []
    cuerpo = datos[inicio:fin].replace(bytes([0x0D, 0x0A]), bytes([0x0D]))
    for by, renglon in enumerate(cuerpo.split(bytes([0x0D]))[:-1]):
        for i in range(0, len(renglon), 2):
            bx = i // 2
            for lado in (0, 1):
                valor = renglon[i + lado] & 0x0F
                for fila_rel in range(4):
                    if valor & (1 << fila_rel):
                        puntos.append(((bx * 2 + lado) * paso, (by * 4 + fila_rel) * (paso_y or paso)))
    return puntos
