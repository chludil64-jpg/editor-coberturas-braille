"""
Prototipo REVERSE-X: separación de capas de un mapa en imagen -> capas táctiles.
Sólo stdlib (colorsys, math). Mide, no inventa: imprime estadísticas reales.

Uso: python tactil.py test_assets/chubut.png 8
"""
import sys, math, json, os
from colorsys import rgb_to_hsv
from pngio import read_png, write_png

# ---------- espacio de color ----------
def srgb_to_lab(rgb):
    def f(u):
        u /= 255.0
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    r, g, b = (f(c) for c in rgb)
    X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    Y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.0
    Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    def g_(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = g_(X), g_(Y), g_(Z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))

def deltaE(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

def hexs(rgb):
    return "#%02x%02x%02x" % rgb

# ---------- carga / reducción ----------
def load(path, max_w=480):
    w, h, rows = read_png(path)
    f = max(1, int(round(w / max_w)))
    cw, ch = w // f, h // f
    px = []
    for y in range(ch):
        row = []
        for x in range(cw):
            r = g = b = 0
            for dy in range(f):
                for dx in range(f):
                    p = rows[y * f + dy][x * f + dx]
                    r += p[0]; g += p[1]; b += p[2]
            n = f * f
            row.append((r // n, g // n, b // n))
        px.append(row)
    return cw, ch, px

# ---------- k-means en Lab ----------
def kmeans(pixels, k=8, iters=14):
    flat = [p for row in pixels for p in row]
    lab = [srgb_to_lab(p) for p in flat]
    step = max(1, len(lab) // 4000)
    sample = lab[::step]
    centers = [sample[(i * len(sample)) // k] for i in range(k)]
    for _ in range(iters):
        acc = [[0.0, 0.0, 0.0, 0] for _ in range(k)]
        for L, a, b in sample:
            best, bd = 0, 1e18
            for i, c in enumerate(centers):
                d = (L - c[0]) ** 2 + (a - c[1]) ** 2 + (b - c[2]) ** 2
                if d < bd:
                    bd, best = d, i
            A = acc[best]
            A[0] += L; A[1] += a; A[2] += b; A[3] += 1
        for i in range(k):
            if acc[i][3]:
                n = acc[i][3]
                centers[i] = (acc[i][0] / n, acc[i][1] / n, acc[i][2] / n)
    # fusionar centros casi idénticos (DeltaE < 4)
    merged = []
    for c in centers:
        if all(deltaE(c, m) > 4 for m in merged):
            merged.append(c)
    labels = []
    for row in pixels:
        lr = []
        for p in row:
            L, a, b = srgb_to_lab(p)
            best, bd = 0, 1e18
            for i, c in enumerate(merged):
                d = (L - c[0]) ** 2 + (a - c[1]) ** 2 + (b - c[2]) ** 2
                if d < bd:
                    bd, best = d, i
            lr.append(best)
        labels.append(lr)
    return merged, labels

# ---------- geometría del cluster ----------
def analyze_cluster(cw, ch, labels, cid, pixels, mm_per_px):
    mask = [[1 if labels[y][x] == cid else 0 for x in range(cw)] for y in range(ch)]
    area = sum(sum(r) for r in mask)
    # perímetro 4-vecinos
    per = 0
    for y in range(ch):
        for x in range(cw):
            if mask[y][x]:
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if yy < 0 or xx < 0 or yy >= ch or xx >= cw or not mask[yy][xx]:
                        per += 1
    # grosor por erosión
    cur = mask
    it = 0
    while True:
        nxt = [[0] * cw for _ in range(ch)]
        anyp = False
        for y in range(1, ch - 1):
            for x in range(1, cw - 1):
                if cur[y][x] and cur[y - 1][x] and cur[y + 1][x] and cur[y][x - 1] and cur[y][x + 1]:
                    nxt[y][x] = 1; anyp = True
        if not anyp:
            break
        cur = nxt
        it += 1
    thick_px = 2 * it
    comp = 4 * math.pi * area / (per * per) if per else 0.0
    # color medio
    r = g = b = 0; n = 0
    for y in range(ch):
        for x in range(cw):
            if mask[y][x]:
                p = pixels[y][x]; r += p[0]; g += p[1]; b += p[2]; n += 1
    mean = (r // n, g // n, b // n) if n else (0, 0, 0)
    hh, ss, vv = rgb_to_hsv(mean[0] / 255, mean[1] / 255, mean[2] / 255)
    return dict(mask=mask, area=area, frac=area / (cw * ch), per=per, comp=comp,
                thick_mm=thick_px * mm_per_px, mean=mean, hex=hexs(mean),
                hue=hh * 360, sat=ss, val=vv)

# ---------- esqueletización Zhang-Suen ----------
def zhang_suen(mask, cw, ch):
    img = [row[:] for row in mask]
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            rm = []
            for y in range(1, ch - 1):
                for x in range(1, cw - 1):
                    if not img[y][x]:
                        continue
                    P = [img[y - 1][x], img[y - 1][x + 1], img[y][x + 1], img[y + 1][x + 1],
                         img[y + 1][x], img[y + 1][x - 1], img[y][x - 1], img[y - 1][x - 1]]
                    B = sum(P)
                    if B < 2 or B > 6:
                        continue
                    A = sum(1 for i in range(8) if P[i] == 0 and P[(i + 1) % 8] == 1)
                    if A != 1:
                        continue
                    if step == 0:
                        if P[0] * P[2] * P[4] or P[2] * P[4] * P[6]:
                            continue
                    else:
                        if P[0] * P[2] * P[6] or P[0] * P[4] * P[6]:
                            continue
                    rm.append((y, x))
            for y, x in rm:
                img[y][x] = 0
            if rm:
                changed = True
    return img

def trace_chains(skel, cw, ch):
    pts = {(x, y) for y in range(ch) for x in range(cw) if skel[y][x]}
    nbrs = {}
    for (x, y) in pts:
        nbrs[(x, y)] = [(x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                        if (dx or dy) and (x + dx, y + dy) in pts]
    ends = [p for p in pts if len(nbrs[p]) == 1]
    visited = set()
    chains = []
    def walk(start):
        chain = [start]
        visited.add(start)
        cur = start
        while True:
            nxt = [q for q in nbrs[cur] if q not in visited]
            if not nxt:
                break
            # preferir continuación recta
            cur = nxt[0]
            visited.add(cur)
            chain.append(cur)
        return chain
    for e in ends:
        if e not in visited:
            c = walk(e)
            if len(c) > 4:
                chains.append(c)
    for p in pts:
        if p not in visited:
            c = walk(p)
            if len(c) > 4:
                chains.append(c)
    return chains

def rdp(pts, eps=1.2):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
        den = math.hypot(y2 - y1, x2 - x1) or 1
        d = num / den
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]

# ---------- estilos táctiles ----------
STYLES = {
    "solida":   dict(dash=(99, 0), rows=1),     # continua
    "guiones":  dict(dash=(3, 2), rows=1),      # 6 mm / 4 mm  (BANA 3.4.3.3)
    "punteada": dict(dash=(1, 2), rows=1),      # 2 mm / 4 mm
    "doble":    dict(dash=(99, 0), rows=2),     # 2 hileras de puntos
}

def render_lines(chains, mm_per_px, pitch_mm, style, grid, gw, gh, ox, oy):
    """Devuelve celdas (i,j) a marcar; guiones por longitud de arco acumulada (mm)."""
    on, off = STYLES[style]["dash"]
    nrows = STYLES[style]["rows"]
    period = pitch_mm * (on + off)
    cells = set()
    for ch_ in chains:
        p = rdp([(x * mm_per_px, y * mm_per_px) for (x, y) in ch_])
        s = 0.0
        for k in range(len(p) - 1):
            (x1, y1), (x2, y2) = p[k], p[k + 1]
            seg = math.hypot(x2 - x1, y2 - y1)
            if seg <= 0:
                continue
            t = 0.0
            while t <= seg:
                u = t / seg
                X, Y = x1 + (x2 - x1) * u, y1 + (y2 - y1) * u
                phase = (s + t) % period if period > 0 else 0.0
                if on >= 99 or phase < pitch_mm * on:
                    i, j = int((X + ox) / pitch_mm), int((Y + oy) / pitch_mm)
                    for r in range(nrows):
                        ii = i + r
                        if 0 <= ii < gw and 0 <= j < gh:
                            cells.add((ii, j))
                t += pitch_mm * 0.5
            s += seg
    return cells

def render_area(mask, cw, ch, mm_per_px, pitch_mm, step, grid, gw, gh, ox, oy):
    """Relleno por retícula: marca celda si >=50% de la celda está en la máscara."""
    cells = set()
    for j in range(gh):
        for i in range(gw):
            if ((i + j) % step) != 0:
                continue
            x0 = int(((i * pitch_mm) - ox) / mm_per_px); x1 = int((((i + 1) * pitch_mm) - ox) / mm_per_px)
            y0 = int(((j * pitch_mm) - oy) / mm_per_px); y1 = int((((j + 1) * pitch_mm) - oy) / mm_per_px)
            tot = hit = 0
            for y in range(max(0, y0), min(ch, y1 + 1)):
                for x in range(max(0, x0), min(cw, x1 + 1)):
                    tot += 1
                    hit += mask[y][x]
            if tot and hit / tot >= 0.5:
                cells.add((i, j))
    return cells

# ---------- main ----------
def main(path, K=8, pitch=2.0, paper_mm=(240, 160)):
    cw, ch, pixels = load(path)
    mm_per_px = paper_mm[0] / cw
    print(f"# {os.path.basename(path)}: analisis {cw}x{ch} px, {mm_per_px:.3f} mm/px, K={K}")
    centers, labels = kmeans(pixels, K)
    gw, gh = int(paper_mm[0] / pitch), int(paper_mm[1] / pitch)
    info = []
    for cid, c in enumerate(centers):
        st = analyze_cluster(cw, ch, labels, cid, pixels, mm_per_px)
        # ¿es un color de halo (antialias) entre dos centros reales?
        near = min((deltaE(c, o) for i, o in enumerate(centers) if i != cid), default=999)
        st.update(cid=cid, de_min=near)
        st["role"] = "ruido" if (st["frac"] < 0.03 and near < 12) else ("linea" if st["thick_mm"] <= 1.2 else "area")
        st["water"] = (165 <= st["hue"] <= 265) and st["sat"] >= 0.10 and st["val"] >= 0.35
        info.append(st)
        print(f"  cluster{cid} {st['hex']} hue={st['hue']:5.1f} sat={st['sat']:.2f} "
              f"frac={st['frac']*100:5.1f}% grosor={st['thick_mm']:5.2f}mm comp={st['comp']:.3f} "
              f"dEmin={near:4.1f} -> {st['role']}{' +AGUA' if st['water'] else ''}")
    total = 0
    out = [[(255, 255, 255)] * gw for _ in range(gh)]
    chains_by_cluster = {}
    for st in sorted(info, key=lambda s: -s["area"]):
        if st["role"] == "ruido":
            print(f"  . cluster{st['cid']} descartado como halo/antialias (dE={st['de_min']:.1f}, frac={st['frac']*100:.1f}%)")
            continue
        cells = set()
        if st["role"] == "area" and st["water"]:
            cells = render_area(st["mask"], cw, ch, mm_per_px, pitch, 2, None, gw, gh, 0, 0)
            mark = (0, 90, 160)
        elif st["role"] == "area":
            continue
        else:
            sk = zhang_suen(st["mask"], cw, ch)
            chains = trace_chains(sk, cw, ch)
            chains_by_cluster[st["cid"]] = chains
            pts = [[(x * mm_per_px, y * mm_per_px) for (x, y) in ch_] for ch_ in chains]
            simp = [rdp(c) for c in pts]
            lens, straights = [], []
            for c in simp:
                L = sum(math.hypot(c[k + 1][0] - c[k][0], c[k + 1][1] - c[k][1]) for k in range(len(c) - 1))
                if L > 0:
                    lens.append(L)
                    straights.append(math.hypot(c[-1][0] - c[0][0], c[-1][1] - c[0][1]) / L)
            st["n_chains"] = len(lens)
            st["len_mm"] = round(sum(lens), 1)
            if straights:
                pairs = sorted(zip(straights, lens))
                tot_l = sum(lens)
                acc = 0.0
                wmed = pairs[-1][0]
                for sv, lv in pairs:
                    acc += lv
                    if acc >= tot_l / 2:
                        wmed = sv
                        break
                st["straight_wmed"] = round(wmed, 3)
                st["chains_straight"] = sum(1 for s_ in straights if s_ >= 0.97)
                st["chains_wiggle"] = sum(1 for s_ in straights if s_ < 0.90)
                st["len_straight_mm"] = round(sum(l for s_, l in zip(straights, lens) if s_ >= 0.97), 1)
                st["len_wiggle_mm"] = round(sum(l for s_, l in zip(straights, lens) if s_ < 0.90), 1)
            style = "guiones" if st["thick_mm"] > 0.8 else "punteada"
            cells = render_lines(chains, mm_per_px, pitch, style, None, gw, gh, 0, 0)
            st["style"] = style
            mark = (0, 0, 0)
            print(f"  . cluster{st['cid']}: {st['n_chains']} trazos, {st['len_mm']} mm; "
                  f"rectitud (pond. x long)={st.get('straight_wmed')}; "
                  f"trazos rectos>=0.97: {st.get('chains_straight')} ({st.get('len_straight_mm')} mm); "
                  f"sinuosos<0.90: {st.get('chains_wiggle')} ({st.get('len_wiggle_mm')} mm)")
        st["cells"] = len(cells)
        for (i, j) in cells:
            if 0 <= i < gw and 0 <= j < gh:
                out[j][i] = mark
                total += 1
        print(f"  -> capa cluster{st['cid']} ({st['hex']}): {len(cells)} puntos, estilo={st.get('style','reticula')}")
    print(f"# total puntos en la grilla {gw}x{gh} = {gw*gh} celdas; ocupadas {total} "
          f"({100*total/(gw*gh):.1f}%)")
    Z = 8
    img = []
    for j in range(gh * Z):
        row = []
        for i in range(gw * Z):
            ii, jj = i // Z, j // Z
            c = out[jj][ii]
            if c != (255, 255, 255):
                px = c if (3 <= i % Z <= 4 and 3 <= j % Z <= 4) else tuple(int(v * 0.45 + 140) for v in c)
            elif i % Z == 0 and j % Z == 0:
                px = (232, 232, 232)
            else:
                px = (255, 255, 255)
            row.append(px)
        img.append(row)
    outp = path.replace(".png", "_tactil.png")
    write_png(outp, gw * Z, gh * Z, img)
    print("# preview:", outp)
    with open(path.replace(".png", "_capas.json"), "w", encoding="utf-8") as fh:
        json.dump([{k: v for k, v in s.items() if k != "mask"} for s in info], fh, indent=1, ensure_ascii=False)
    return info

if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "test_assets/chubut.png"
    k = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    main(p, k)
