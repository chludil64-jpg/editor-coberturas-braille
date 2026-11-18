/* Vectorizar un dibujo de libro (foto o escaneo): binarizar, limpiar manchas, trazar contornos
   (marching squares) o líneas (adelgazado de Zhang-Suen), simplificar (Douglas-Peucker) y suavizar.
   Lógica pura: sirve en Node (tests), en el navegador y en el Web Worker (vectorizar_worker.js).
   Las coordenadas de salida están en píxeles de la imagen procesada. */
(function (raiz) {
  'use strict';

  /** RGBA -> grises (0 negro, 255 blanco); lo transparente cuenta como blanco. */
  function aGrises(rgba, W, H) {
    const g = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const a = rgba[j + 3] / 255;
      const y = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
      g[i] = Math.round(y * a + 255 * (1 - a));
    }
    return g;
  }

  /** Umbral automático de Otsu. */
  function umbralOtsu(gris) {
    const h = new Array(256).fill(0);
    for (let i = 0; i < gris.length; i++) h[gris[i]]++;
    const total = gris.length;
    let suma = 0;
    for (let t = 0; t < 256; t++) suma += t * h[t];
    let sB = 0, wB = 0, mejor = 0, umbral = 128;
    for (let t = 0; t < 256; t++) {
      wB += h[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sB += t * h[t];
      const mB = sB / wB, mF = (suma - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v >= mejor) { mejor = v; umbral = t; }
    }
    return umbral;
  }

  /** 1 = tinta (más oscuro que el umbral), 0 = papel. */
  function binarizar(gris, umbral) {
    const b = new Uint8Array(gris.length);
    for (let i = 0; i < gris.length; i++) b[i] = gris[i] < umbral ? 1 : 0;
    return b;
  }

  /** Quita las manchas de tinta (componentes conexas, vecindad de 8) con menos de areaMin píxeles. */
  function limpiarManchas(bin, W, H, areaMin) {
    const sal = Uint8Array.from(bin);
    if (!(areaMin > 1)) return sal;
    const visto = new Uint8Array(W * H), pila = [];
    for (let s = 0; s < sal.length; s++) {
      if (!sal[s] || visto[s]) continue;
      const comp = [s];
      visto[s] = 1; pila.length = 0; pila.push(s);
      while (pila.length) {
        const p = pila.pop(), x = p % W, y = (p - x) / W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (sal[q] && !visto[q]) { visto[q] = 1; pila.push(q); comp.push(q); }
        }
      }
      if (comp.length < areaMin) for (const q of comp) sal[q] = 0;
    }
    return sal;
  }

  // Marching squares: segmentos dirigidos entre puntos medios de aristas, con la tinta a la derecha.
  // Aristas: 0 = arriba, 1 = derecha, 2 = abajo, 3 = izquierda.
  const CASOS = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[1, 0]], 5: [[3, 2], [1, 0]], 6: [[2, 0]], 7: [[3, 0]],
    8: [[0, 3]], 9: [[0, 2]], 10: [[0, 3], [2, 1]], 11: [[0, 1]], 12: [[1, 3]], 13: [[1, 2]], 14: [[2, 3]] };
  const MEDIO = [[1, 0], [2, 1], [1, 2], [0, 1]];   // desplazamiento (en medios píxeles) desde la esquina de la celda

  /** Contornos cerrados de la tinta (anillos). Cada anillo: [[x,y]...] en píxeles (centro de píxel = x, y). */
  function contornos(bin, W, H) {
    const px = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : bin[y * W + x];
    const sig = new Map();   // clave de inicio -> [x2, y2 de fin]
    const clave = (x, y) => (x + 4) * (2 * H + 12) + (y + 4);
    const guardar = (x, y, a, b) => {
      const ia = [2 * x + MEDIO[a][0], 2 * y + MEDIO[a][1]], ib = [2 * x + MEDIO[b][0], 2 * y + MEDIO[b][1]];
      sig.set(clave(ia[0], ia[1]), { desde: ia, hasta: ib });
    };
    for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
      const c = px(x, y) * 8 + px(x + 1, y) * 4 + px(x + 1, y + 1) * 2 + px(x, y + 1);
      const segs = CASOS[c];
      if (segs) for (const s of segs) guardar(x, y, s[0], s[1]);
    }
    const anillos = [];
    const usado = new Set();
    for (const [k, seg0] of sig) {
      if (usado.has(k)) continue;
      const anillo = [];
      let seg = seg0, kk = k;
      while (seg && !usado.has(kk)) {
        usado.add(kk);
        anillo.push([seg.desde[0] / 2, seg.desde[1] / 2]);
        kk = clave(seg.hasta[0], seg.hasta[1]);
        seg = sig.get(kk);
      }
      if (anillo.length >= 3) anillos.push(anillo);
    }
    return anillos;
  }

  /** Área con signo (fórmula del cordón). */
  function area(v) {
    let s = 0;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) s += v[j][0] * v[i][1] - v[i][0] * v[j][1];
    return s / 2;
  }

  /** Douglas-Peucker sobre una polilínea abierta. */
  function simplificar(v, tol) {
    if (v.length < 3 || !(tol > 0)) return v.slice();
    const mantener = new Uint8Array(v.length);
    mantener[0] = mantener[v.length - 1] = 1;
    const pila = [[0, v.length - 1]];
    while (pila.length) {
      const [a, b] = pila.pop();
      let dmax = 0, im = -1;
      const ax = v[a][0], ay = v[a][1], dx = v[b][0] - ax, dy = v[b][1] - ay, l2 = dx * dx + dy * dy;
      for (let i = a + 1; i < b; i++) {
        let d;
        if (!l2) d = Math.hypot(v[i][0] - ax, v[i][1] - ay);
        else d = Math.abs(dx * (ay - v[i][1]) - (ax - v[i][0]) * dy) / Math.sqrt(l2);
        if (d > dmax) { dmax = d; im = i; }
      }
      if (dmax > tol && im > 0) { mantener[im] = 1; pila.push([a, im], [im, b]); }
    }
    return v.filter((_, i) => mantener[i]);
  }

  /** Simplifica un anillo cerrado: parte por los dos puntos más alejados y simplifica cada mitad. */
  function simplificarAnillo(v, tol) {
    if (v.length < 4) return v.slice();
    let i1 = 0, i2 = 0, dmax = -1;
    for (let i = 1; i < v.length; i++) { const d = Math.hypot(v[i][0] - v[0][0], v[i][1] - v[0][1]); if (d > dmax) { dmax = d; i2 = i; } }
    const a = simplificar(v.slice(i1, i2 + 1), tol), b = simplificar(v.slice(i2).concat([v[0]]), tol);
    return a.concat(b.slice(1, -1));
  }

  /** Suavizado: promedio móvil de 3 puntos, n veces (en anillos cerrados; en líneas abiertas se fijan los extremos). */
  function suavizar(v, n, cerrado) {
    let p = v;
    for (let r = 0; r < n; r++) {
      const q = p.map((pt, i) => {
        if (!cerrado && (i === 0 || i === p.length - 1)) return pt;
        const a = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length];
        return [(a[0] + 2 * pt[0] + c[0]) / 4, (a[1] + 2 * pt[1] + c[1]) / 4];
      });
      p = q;
    }
    return p;
  }

  /** Adelgazado de Zhang-Suen: deja la tinta con 1 píxel de grosor. */
  function adelgazar(bin, W, H) {
    const im = Uint8Array.from(bin);
    const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : im[y * W + x];
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (let paso = 0; paso < 2; paso++) {
        const borrar = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!im[y * W + x]) continue;
          const p2 = get(x, y - 1), p3 = get(x + 1, y - 1), p4 = get(x + 1, y), p5 = get(x + 1, y + 1),
            p6 = get(x, y + 1), p7 = get(x - 1, y + 1), p8 = get(x - 1, y), p9 = get(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const sec = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let i = 0; i < 8; i++) if (!sec[i] && sec[i + 1]) A++;
          if (A !== 1) continue;
          if (paso === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          borrar.push(y * W + x);
        }
        if (borrar.length) { cambio = true; for (const i of borrar) im[i] = 0; }
      }
    }
    return im;
  }

  /** Quita los píxeles de «escalón» de un esqueleto: los que se pueden sacar sin cortar nada (sus vecinos siguen conectados). */
  function podarEscalones(esq, W, H) {
    const im = Uint8Array.from(esq);
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!im[y * W + x]) continue;
        const v = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H && im[ny * W + nx]) v.push([nx, ny]);
        }
        if (v.length < 2) continue;
        // ¿Los vecinos forman un solo grupo conectado sin este píxel?
        const grupo = new Array(v.length).fill(false);
        grupo[0] = true;
        const pila = [0];
        while (pila.length) {
          const a = pila.pop();
          for (let b = 0; b < v.length; b++) if (!grupo[b] && Math.max(Math.abs(v[a][0] - v[b][0]), Math.abs(v[a][1] - v[b][1])) <= 1) { grupo[b] = true; pila.push(b); }
        }
        if (grupo.every(Boolean)) { im[y * W + x] = 0; cambio = true; }
      }
    }
    return im;
  }

  /** Recorre un esqueleto de 1 píxel y devuelve las líneas: [{puntos, cerrado}]. */
  function trazarEsqueleto(esq, W, H) {
    const vec = (p) => {
      const x = p % W, y = (p - x) / W, r = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && esq[ny * W + nx]) r.push(ny * W + nx);
      }
      return r;
    };
    const grado = new Map();
    for (let p = 0; p < esq.length; p++) if (esq[p]) grado.set(p, vec(p));
    const xy = p => [p % W, Math.floor(p / W)];
    const lineas = [], visto = new Set(), aristas = new Set();
    const esNodo = p => grado.get(p).length !== 2;
    for (const [p, vs] of grado) {
      if (!esNodo(p)) continue;
      for (const n of vs) {
        if (esNodo(n)) {
          const k = p < n ? p + ',' + n : n + ',' + p;
          if (aristas.has(k)) continue;
          aristas.add(k); lineas.push({ puntos: [xy(p), xy(n)], cerrado: false });
          continue;
        }
        if (visto.has(n)) continue;
        const camino = [p]; let prev = p, cur = n;
        while (true) {
          camino.push(cur);
          if (esNodo(cur)) break;
          visto.add(cur);
          const sig = grado.get(cur).find(q => q !== prev);
          if (sig === undefined) break;
          prev = cur; cur = sig;
          if (visto.has(cur) && !esNodo(cur)) break;
        }
        lineas.push({ puntos: camino.map(xy), cerrado: false });
      }
    }
    // Lazos aislados (todos de grado 2).
    for (const [p] of grado) {
      if (visto.has(p) || esNodo(p)) continue;
      const camino = []; let prev = -1, cur = p;
      while (!visto.has(cur)) {
        visto.add(cur); camino.push(cur);
        const sig = grado.get(cur).find(q => q !== prev && !visto.has(q));
        if (sig === undefined) break;
        prev = cur; cur = sig;
      }
      if (camino.length >= 3) lineas.push({ puntos: camino.map(xy), cerrado: true });
    }
    return lineas;
  }

  /**
   * Vectoriza una imagen RGBA.
   * opciones: { umbral: 0..255 | null (automático), modo: 'contornos' | 'lineas', areaMin: px², suavizado: 0..3 }
   * Devuelve { ancho, alto, umbral, trazos: [{puntos:[[x,y]...], cerrado}] }.
   */
  function vectorizar(rgba, W, H, opciones) {
    const op = Object.assign({ umbral: null, modo: 'contornos', areaMin: 12, suavizado: 1 }, opciones || {});
    const gris = aGrises(rgba, W, H);
    const umbral = op.umbral == null ? umbralOtsu(gris) : op.umbral;
    const bin = limpiarManchas(binarizar(gris, umbral), W, H, op.areaMin);
    const tol = 0.6 + 0.35 * op.suavizado;
    const trazos = [];
    if (op.modo === 'lineas') {
      const minLargo = Math.max(3, Math.sqrt(op.areaMin));
      for (const l of trazarEsqueleto(podarEscalones(adelgazar(bin, W, H), W, H), W, H)) {
        let largo = 0;
        for (let i = 1; i < l.puntos.length; i++) largo += Math.hypot(l.puntos[i][0] - l.puntos[i - 1][0], l.puntos[i][1] - l.puntos[i - 1][1]);
        if (largo < minLargo) continue;
        let v = suavizar(l.puntos, op.suavizado, l.cerrado);
        v = l.cerrado ? simplificarAnillo(v, tol) : simplificar(v, tol);
        if (v.length >= 2) trazos.push({ puntos: v, cerrado: l.cerrado && v.length >= 3 });
      }
    } else {
      for (const a of contornos(bin, W, H)) {
        if (Math.abs(area(a)) < op.areaMin / 2) continue;
        const v = simplificarAnillo(suavizar(a, op.suavizado + 1, true), tol);
        if (v.length >= 3) trazos.push({ puntos: v, cerrado: true });
      }
    }
    return { ancho: W, alto: H, umbral, trazos };
  }

  const api = { aGrises, umbralOtsu, binarizar, limpiarManchas, contornos, area, simplificar, simplificarAnillo, suavizar, adelgazar, podarEscalones, trazarEsqueleto, vectorizar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Vectorizar = api;
})(typeof self !== 'undefined' ? self : this);
