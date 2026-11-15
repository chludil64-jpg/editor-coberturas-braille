"""Vuelca una imagen por cluster: sirve para que el docente vea qué es cada color."""
import sys
from tactil import load, kmeans, analyze_cluster
from pngio import write_png

path = sys.argv[1] if len(sys.argv) > 1 else "test_assets/chubut.png"
cw, ch, pixels = load(path)
mm = 240.0 / cw
centers, labels = kmeans(pixels, 8)
tiles = []
for cid, c in enumerate(centers):
    st = analyze_cluster(cw, ch, labels, cid, pixels, mm)
    rows = []
    for y in range(ch):
        row = []
        for x in range(cw):
            row.append(st["mean"] if labels[y][x] == cid else (255, 255, 255))
        rows.append(row)
    tiles.append((cid, st, rows))
# mosaico 4x2
per_row = 4
th = (ch + 4) * 2
tw = (cw + 4) * per_row
img = [[(240, 240, 240)] * tw for _ in range(th)]
for k, (cid, st, rows) in enumerate(tiles):
    ox = (k % per_row) * (cw + 4)
    oy = (k // per_row) * (ch + 4)
    for y in range(ch):
        for x in range(cw):
            img[oy + y][ox + x] = rows[y][x]
    print(f"cluster{cid} {st['hex']} frac={st['frac']*100:.1f}% grosor={st['thick_mm']:.2f}mm "
          f"-> mosaico pos ({k%per_row},{k//per_row})")
write_png(path.replace(".png", "_mosaico.png"), tw, th, img)
print("escrito", path.replace(".png", "_mosaico.png"))
