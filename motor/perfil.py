"""Perfil de impresora: valores por defecto, lectura/escritura y transformación
de los puntos del diseño a la hoja tal como entra en la impresora."""

import copy
import json
import os

DEFECTO = {
    "nombre": "Index Everest-D V4",
    "hoja": {"ancho_max_mm": 297.0, "alto_max_mm": 210.0},
    "carga": {
        # "horizontal": la hoja A4 entra apaisada (297 mm de ancho).
        # "vertical": la hoja entra parada y el diseño se gira 90°.
        "orientacion": "horizontal",
        "sentido_giro": "horario",
        "espejo": "no",           # "no" | "horizontal" | "vertical"
        "desplazamiento_x_mm": 0.0,
        "desplazamiento_y_mm": 0.0,
        "escala_x": 1.0,
        "escala_y": 1.0,
        "copias": 1,
    },
    "margenes_mm": {"izquierdo": 5.0, "derecho": 3.0, "superior": 3.0, "inferior": 3.0},
    "braille": {"entre_puntos_mm": 2.5, "entre_celdas_mm": 6.0, "entre_renglones_mm": 10.0},
    "separacion_minima_mm": 2.0,
    "paso_dibujo_mm": 2.0,
    "separacion_dibujo_braille_mm": 3.0,
    # La Everest-D V4 da error 202 con ESC F (punto libre); acepta la grilla ESC BEL (prueba 7).
    "codificador": "grilla",
    "punto_libre": {
        # Copiado de _basic_functions_graphs.ibe (hoja apaisada) salvo DP,
        # que se toma de la muestra de Everest. Significado no confirmado.
        "encabezado_horizontal": {"DP": 2, "LS": 50, "TM": 0, "BI": 0, "CH": 46, "LP": 27},
        "origen_horizontal": [0.0, 0.0],
        # Copiado tal cual de _everest_functions_graphs.ibe (hoja vertical).
        "encabezado_vertical": {"DP": 2, "LS": 50, "TM": 0, "BI": 0, "CH": 34, "LP": 29},
        "origen_vertical": [3.0, 0.0],
        "terminador": "\n",
        # ';' al final de la lista de puntos (basic/geometry lo traen, everest no).
        "cierre_punto_y_coma": True,
    },
    # Paso calibrado en la Everest-D V4 real con el marco A4 (prueba 9, hoja parada):
    # 2,05 mm de lado a lado y 2,02 mm en el sentido de avance del papel.
    "grilla": {"paso_mm": 2.05, "paso_x_mm": 2.05, "paso_y_mm": 2.02, "TM": 0, "BI": 0, "MI": 1,
               "DP": 1, "TD": 0, "GD": 0, "CH": "auto", "LP": "auto", "LS": 50, "BT": 0},
    "red": {"ip": "", "puerto": 9100},
    "impresora_windows": "",
}


def _fusionar(base, extra):
    salida = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(salida.get(k), dict):
            salida[k] = _fusionar(salida[k], v)
        else:
            salida[k] = v
    return salida


def completar(perfil):
    """Completa un perfil con los valores por defecto que falten."""
    return _fusionar(DEFECTO, perfil or {})


def _num(valor, nombre, minimo, maximo):
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or valor != valor:
        raise ValueError(f"Perfil inválido: «{nombre}» debe ser un número.")
    if not minimo <= valor <= maximo:
        raise ValueError(f"Perfil inválido: «{nombre}» debe estar entre {minimo} y {maximo}.")


def _bloque(perfil, clave):
    b = perfil.get(clave)
    if not isinstance(b, dict):
        raise ValueError(f"Perfil inválido: «{clave}» debe ser un objeto.")
    return b


def validar(perfil):
    """Comprueba tipos y rangos de un perfil ya completado. Lanza ValueError."""
    if not isinstance(perfil, dict):
        raise ValueError("Perfil inválido: debe ser un objeto.")
    if not isinstance(perfil.get("nombre", ""), str) or len(perfil.get("nombre", "")) > 120:
        raise ValueError("Perfil inválido: «nombre» debe ser un texto corto.")
    if perfil.get("codificador") not in ("grilla", "punto_libre"):
        raise ValueError("Perfil inválido: «codificador» debe ser «grilla» o «punto_libre».")
    hoja = _bloque(perfil, "hoja")
    _num(hoja.get("ancho_max_mm"), "hoja.ancho_max_mm", 10, 400)
    _num(hoja.get("alto_max_mm"), "hoja.alto_max_mm", 10, 400)
    carga = _bloque(perfil, "carga")
    if carga.get("orientacion") not in ("horizontal", "vertical"):
        raise ValueError("Perfil inválido: «carga.orientacion» no es válida.")
    if carga.get("sentido_giro") not in ("horario", "antihorario"):
        raise ValueError("Perfil inválido: «carga.sentido_giro» no es válido.")
    if carga.get("espejo") not in ("no", "horizontal", "vertical"):
        raise ValueError("Perfil inválido: «carga.espejo» no es válido.")
    _num(carga.get("desplazamiento_x_mm"), "carga.desplazamiento_x_mm", -50, 50)
    _num(carga.get("desplazamiento_y_mm"), "carga.desplazamiento_y_mm", -50, 50)
    _num(carga.get("escala_x"), "carga.escala_x", 0.5, 2)
    _num(carga.get("escala_y"), "carga.escala_y", 0.5, 2)
    _num(carga.get("copias"), "carga.copias", 1, 50)
    mg = _bloque(perfil, "margenes_mm")
    for lado in ("izquierdo", "derecho", "superior", "inferior"):
        _num(mg.get(lado), f"margenes_mm.{lado}", 0, 100)
    br = _bloque(perfil, "braille")
    _num(br.get("entre_puntos_mm"), "braille.entre_puntos_mm", 1, 10)
    _num(br.get("entre_celdas_mm"), "braille.entre_celdas_mm", 2, 20)
    _num(br.get("entre_renglones_mm"), "braille.entre_renglones_mm", 4, 40)
    _num(perfil.get("separacion_minima_mm"), "separacion_minima_mm", 0, 10)
    _num(perfil.get("paso_dibujo_mm"), "paso_dibujo_mm", 1, 5)
    _num(perfil.get("separacion_dibujo_braille_mm"), "separacion_dibujo_braille_mm", 0, 30)
    g = _bloque(perfil, "grilla")
    for k in ("paso_mm", "paso_x_mm", "paso_y_mm"):
        if g.get(k) not in (None, ""):
            _num(g[k], f"grilla.{k}", 1, 5)
    red = _bloque(perfil, "red")
    if not isinstance(red.get("ip", ""), str) or len(red.get("ip", "")) > 64:
        raise ValueError("Perfil inválido: «red.ip» no es válida.")
    _num(red.get("puerto"), "red.puerto", 1, 65535)
    if not isinstance(perfil.get("impresora_windows", ""), str) or len(perfil.get("impresora_windows", "")) > 260:
        raise ValueError("Perfil inválido: «impresora_windows» no es válida.")
    return perfil


def cargar(ruta):
    if os.path.exists(ruta):
        with open(ruta, "r", encoding="utf-8") as f:
            return completar(json.load(f))
    return completar({})


def guardar(ruta, perfil):
    perfil = validar(completar(perfil))
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(perfil, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    return perfil


def transformar(puntos, ancho, alto, perfil, solo_ajuste=False):
    """Pasa los puntos del diseño (mm, origen arriba-izquierda) a la hoja de
    la impresora. Orden: espejo -> giro 90° -> escala -> desplazamiento.

    ``solo_ajuste``: aplica solo escala y desplazamiento (hoja de calibración,
    que ya se arma en el marco de la impresora).

    Devuelve ``(puntos, ancho_hoja, alto_hoja, avisos)``.
    """
    perfil = completar(perfil)
    carga = perfil["carga"]
    avisos = []
    pts = [(float(x), float(y)) for x, y in puntos]
    w, h = float(ancho), float(alto)
    if not solo_ajuste:
        espejo = carga.get("espejo", "no")
        if espejo == "horizontal":
            pts = [(w - x, y) for x, y in pts]
        elif espejo == "vertical":
            pts = [(x, h - y) for x, y in pts]
        if carga.get("orientacion") == "vertical" and w > h or \
                carga.get("orientacion") == "horizontal" and h > w:
            # Girar 90° para que el lado largo quede en el sentido pedido.
            if carga.get("sentido_giro", "horario") == "horario":
                pts = [(h - y, x) for x, y in pts]
            else:
                pts = [(y, w - x) for x, y in pts]
            w, h = h, w
    sx = float(carga.get("escala_x", 1.0) or 1.0)
    sy = float(carga.get("escala_y", 1.0) or 1.0)
    dx = float(carga.get("desplazamiento_x_mm", 0.0) or 0.0)
    dy = float(carga.get("desplazamiento_y_mm", 0.0) or 0.0)
    pts = [(x * sx + dx, y * sy + dy) for x, y in pts]
    dentro = [(x, y) for x, y in pts if -0.005 <= x <= w + 0.005 and -0.005 <= y <= h + 0.005]
    fuera = len(pts) - len(dentro)
    if fuera:
        avisos.append(f"Se descartaron {fuera} puntos que quedaban fuera de la hoja tras el ajuste.")
    dentro = [(min(max(x, 0.0), w), min(max(y, 0.0), h)) for x, y in dentro]
    hmax = perfil["hoja"]
    if max(w, h) > max(hmax["ancho_max_mm"], hmax["alto_max_mm"]) + 0.5 or \
            min(w, h) > min(hmax["ancho_max_mm"], hmax["alto_max_mm"]) + 0.5:
        avisos.append(f"La hoja ({w:.1f} × {h:.1f} mm) supera el máximo A4 del perfil.")
    return dentro, w, h, avisos


def encabezado_para(perfil, ancho, alto):
    """Elige encabezado y origen del modo punto libre según la hoja de salida."""
    pl = completar(perfil)["punto_libre"]
    if ancho >= alto:
        return dict(pl["encabezado_horizontal"]), tuple(pl["origen_horizontal"])
    return dict(pl["encabezado_vertical"]), tuple(pl["origen_vertical"])
