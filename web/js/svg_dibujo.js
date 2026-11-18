/* SVG como dibujo: convierte los elementos que lee svg_importar.js en contornos visibles.
   Respeta el orden de pintado del SVG: lo que queda tapado por una forma rellena y opaca que
   está ENCIMA no aparece (los contornos ocultos se recortan). Es geometría pura (sirve en Node
   y en el navegador). Las coordenadas son milímetros. */
(function (raiz) {
  'use strict';
  const EPS = 1e-9;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /** Caja de un conjunto de puntos. */
  function caja(puntos) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of puntos) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1 };
  }

  /** ¿El punto está dentro de las formas? Regla nonzero de SVG (por defecto) o par-impar si evenodd. */
  function dentro(p, anillos, evenodd) {
    let par = false, giro = 0;
    const x = p[0], y = p[1];
    for (const a of anillos) {
      for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
        const ax = a[j][0], ay = a[j][1], bx = a[i][0], by = a[i][1];
        if ((ay > y) !== (by > y)) {
          const xc = (bx - ax) * (y - ay) / (by - ay) + ax;
          if (x < xc) { par = !par; giro += by > ay ? 1 : -1; }
        }
      }
    }
    return evenodd ? par : giro !== 0;
  }

  /** Parámetro t (0..1) del segmento a-b donde cruza al segmento c-d, o null. */
  function cruce(a, b, c, d) {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < EPS) return null;
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
    const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
    return t > EPS && t < 1 - EPS && u >= 0 && u <= 1 ? t : null;
  }

  /**
   * Recorta una polilínea: devuelve los tramos que NO quedan dentro de las formas tapadoras.
   * tapadores: [{ anillos: [[x,y]...][], caja }]. Cada tramo: arreglo de puntos.
   */
  function recortarPolilinea(puntos, tapadores) {
    if (!tapadores.length) return [puntos.slice()];
    const trozos = [];
    let actual = null;
    const cerrarTramo = () => { if (actual && actual.length > 1) trozos.push(actual); actual = null; };
    for (let i = 0; i < puntos.length - 1; i++) {
      const a = puntos[i], b = puntos[i + 1];
      const sx0 = Math.min(a[0], b[0]), sx1 = Math.max(a[0], b[0]), sy0 = Math.min(a[1], b[1]), sy1 = Math.max(a[1], b[1]);
      const cercanos = tapadores.filter(t => !(sx1 < t.caja.x0 || sx0 > t.caja.x1 || sy1 < t.caja.y0 || sy0 > t.caja.y1));
      if (!cercanos.length) {
        if (!actual) actual = [a];
        actual.push(b);
        continue;
      }
      const ts = [0, 1];
      for (const t of cercanos) {
        for (const anillo of t.anillos) {
          for (let k = 0, m = anillo.length - 1; k < anillo.length; m = k++) {
            const v = cruce(a, b, anillo[m], anillo[k]);
            if (v !== null) ts.push(v);
          }
        }
      }
      ts.sort((p, q) => p - q);
      const en = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let k = 0; k < ts.length - 1; k++) {
        if (ts[k + 1] - ts[k] < 1e-7) continue;
        const p0 = en(ts[k]), p1 = en(ts[k + 1]), medio = en((ts[k] + ts[k + 1]) / 2);
        const tapado = cercanos.some(t => dentro(medio, t.anillos, t.evenodd));
        if (tapado) { cerrarTramo(); continue; }
        if (!actual) actual = [p0];
        else if (dist(actual[actual.length - 1], p0) > 1e-6) { cerrarTramo(); actual = [p0]; }
        actual.push(p1);
      }
    }
    cerrarTramo();
    return trozos;
  }

  /** Une el último tramo con el primero cuando son continuos (anillo cortado justo en su costura). */
  function unirCostura(trozos, anillo) {
    if (trozos.length < 2) return trozos;
    const primero = trozos[0], ultimo = trozos[trozos.length - 1];
    if (dist(primero[0], anillo[0]) < 1e-6 && dist(ultimo[ultimo.length - 1], anillo[anillo.length - 1]) < 1e-6) {
      return [ultimo.concat(primero.slice(1))].concat(trozos.slice(1, -1));
    }
    return trozos;
  }

  const largo = v => { let s = 0; for (let i = 1; i < v.length; i++) s += dist(v[i - 1], v[i]); return s; };
  const claro = rgb => !!rgb && rgb[0] >= 245 && rgb[1] >= 245 && rgb[2] >= 245;

  /**
   * elementos: lista de svg_importar.parsear().elementos (en orden de pintado).
   * opciones: { ancho, alto (mm del área), relleno: false|true, minLargo (mm) }
   * Devuelve { contornos: [{puntos, cerrado, orden}], zonas: [{puntos, orden, claro}] }.
   *  - contornos: líneas visibles (ya recortadas por lo que las tapa).
   *  - zonas: formas rellenas opacas, en orden (para la textura opcional).
   */
  function aDibujo(elementos, opciones) {
    const op = Object.assign({ ancho: 0, alto: 0, relleno: false, minLargo: 0.3 }, opciones || {});
    // 1) Agrupar los subtrazados de un mismo elemento (agujeros por par-impar).
    const items = [];
    const porId = new Map();
    elementos.forEach((e, n) => {
      if (e.tag === 'text' || !e.puntos || e.puntos.length < 2) return;
      const id = e.idx !== undefined ? 'i' + e.idx : 'n' + n;
      let it = porId.get(id);
      if (!it) { it = { id, anillos: [], fill: e.fill || null, stroke: e.stroke || null, opaco: e.opaco !== false, evenodd: !!e.evenodd, orden: items.length }; porId.set(id, it); items.push(it); }
      it.anillos.push({ puntos: e.puntos, cerrado: !!e.cerrado });
    });
    // 2) Qué formas rellenas tapan (y se ven como zona).
    for (const it of items) {
      // Un relleno cierra implícitamente los subtrazados abiertos de 3 o más puntos.
      it.rellenos = it.fill ? it.anillos.filter(a => a.cerrado || a.puntos.length >= 3).map(a => {
        const v = a.puntos.slice();
        if (dist(v[0], v[v.length - 1]) > 1e-7) v.push(v[0]);
        return v;
      }) : [];
      it.tapa = it.rellenos.length > 0 && it.opaco;
      it.caja = it.tapa ? caja([].concat(...it.rellenos)) : null;
      // Fondo: relleno claro que cubre casi toda el área; tapa pero no se dibuja.
      it.fondo = it.tapa && !it.stroke && claro(it.fill) && op.ancho > 0 &&
        (it.caja.x1 - it.caja.x0) >= op.ancho * 0.95 && (it.caja.y1 - it.caja.y0) >= op.alto * 0.95;
    }
    const contornos = [], zonas = [];
    items.forEach((it, i) => {
      const tapadores = [];
      for (let j = i + 1; j < items.length; j++) {
        const t = items[j];
        if (t.tapa) tapadores.push({ anillos: t.rellenos.map(r => r.slice(0, -1)), caja: t.caja, evenodd: t.evenodd });
      }
      if (it.tapa && !it.fondo) {
        for (const r of it.rellenos) zonas.push({ puntos: r.slice(0, -1), orden: it.orden, claro: claro(it.fill) });
      }
      if (it.fondo) return;
      const dibujar = it.stroke || it.fill;
      if (!dibujar) return;
      for (const a of it.anillos) {
        let v = a.puntos;
        let cerrado = a.cerrado;
        if (!it.stroke && !cerrado) {
          if (v.length < 3) continue;           // línea sin trazo y con relleno: no se ve
          v = v.concat([v[0]]); cerrado = true;
        }
        const trozos = unirCostura(recortarPolilinea(v, tapadores), v);
        if (trozos.length === 1 && cerrado && trozos[0].length === v.length && dist(trozos[0][0], trozos[0][trozos[0].length - 1]) < 1e-6) {
          contornos.push({ puntos: v.slice(0, -1), cerrado: true, orden: it.orden });
          continue;
        }
        for (const t of trozos) {
          if (largo(t) < op.minLargo) continue;
          const cierra = cerrado && t.length > 2 && dist(t[0], t[t.length - 1]) < 1e-6;
          contornos.push({ puntos: cierra ? t.slice(0, -1) : t, cerrado: cierra, orden: it.orden });
        }
      }
    });
    return { contornos, zonas };
  }

  const api = { aDibujo, recortarPolilinea, dentro, cruce };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.SvgDibujo = api;
})(typeof self !== 'undefined' ? self : this);
