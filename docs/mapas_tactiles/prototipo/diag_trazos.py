"""Diagnóstico: ¿cómo distinguir un trazo real de un halo de antialias/texto?
Mide, por cluster: nº de trazos del esqueleto y longitud de cada trazo."""
import sys, math
from tactil import load, kmeans, analyze_cluster, zhang_suen, trace_chains, rdp

for path in ["test_assets/chubut.png", "test_assets/provincias.png"]:
    cw, ch, pixels = load(path)
    mm = 240.0 / cw
    centers, labels = kmeans(pixels, 8)
    print("==", path, f"{cw}x{ch}")
    for cid in range(len(centers)):
        st = analyze_cluster(cw, ch, labels, cid, pixels, mm)
        if st["thick_mm"] > 3:      # sólo capas delgadas
            print(f"  c{cid} {st['hex']} grosor={st['thick_mm']:5.2f} frac={st['frac']*100:4.1f}%  (área, se omite)")
            continue
        sk = zhang_suen(st["mask"], cw, ch)
        chains = trace_chains(sk, cw, ch)
        lens = []
        for c in chains:
            p = rdp([(x * mm, y * mm) for (x, y) in c])
            L = sum(math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]) for k in range(len(p) - 1))
            lens.append(L)
        lens.sort()
        if not lens:
            print(f"  c{cid} {st['hex']}: sin trazos")
            continue
        med = lens[len(lens) // 2]
        p90 = lens[int(0.9 * (len(lens) - 1))]
        big = sum(1 for L in lens if L >= 10)
        print(f"  c{cid} {st['hex']} grosor={st['thick_mm']:5.2f} frac={st['frac']*100:4.1f}% "
              f"trazos={len(lens):3d} long_med={med:6.1f}mm long_p90={p90:6.1f}mm trazos>=10mm={big:3d}")
