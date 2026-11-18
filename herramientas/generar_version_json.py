"""Genera el version.json que lee el botón «Buscar actualizaciones».

Uso:
  python herramientas/generar_version_json.py dist/EditorBraille-portable-2.0.0.zip https://sitio/EditorBraille-portable-2.0.0.zip
  [--notas "Qué cambió"] [--version 2.0.0] [--salida dist/version.json]

Si no se indica --version se toma VERSION de app.py.
"""

import argparse
import hashlib
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def version_de_app():
    with open(os.path.join(RAIZ, "app.py"), encoding="utf-8") as f:
        m = re.search(r'^VERSION\s*=\s*"([^"]+)"', f.read(), re.M)
    if not m:
        raise SystemExit("No se encontró VERSION en app.py")
    return m.group(1)


def sha256_de(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloque)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("zip")
    ap.add_argument("url")
    ap.add_argument("--version", default=None)
    ap.add_argument("--notas", default="")
    ap.add_argument("--salida", default=None)
    a = ap.parse_args()
    if not os.path.isfile(a.zip):
        raise SystemExit(f"No existe el zip: {a.zip}")
    if not a.url.startswith("https://") and "{URL_ZIP}" not in a.url:
        print("Aviso: el programa solo acepta direcciones https.", file=sys.stderr)
    datos = {"version": a.version or version_de_app(), "url": a.url,
             "sha256": sha256_de(a.zip), "notas": a.notas}
    salida = a.salida or os.path.join(os.path.dirname(os.path.abspath(a.zip)), "version.json")
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Escrito {salida}\n  sha256 {datos['sha256']}\n  tamaño {os.path.getsize(a.zip)} bytes")


if __name__ == "__main__":
    main()
