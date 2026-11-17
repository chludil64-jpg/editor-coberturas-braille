/* Calco de vectores del PDF: convierte cada trazado en un objeto vectorial independiente. Lógica pura. */
(function (raiz) {
  'use strict';
  const red = n => Math.round(n * 1000) / 1000;
  const TOL_UNION = 0.05;   // mm: extremos que se consideran el mismo punto
  const LARGO_NULO = 0.2;   // mm: segmentos más cortos se descartan
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* Quita vértices repetidos o a menos de LARGO_NULO del anterior (conserva siempre el último). */
  function limpiar(pts, cerrado) {
    const s = [];
    for (const q of pts) if (!s.length || dist(s[s.length - 1], q) >= LARGO_NULO) s.push([q[0], q[1]]);
    if (pts.length && s.length > 1 && dist(s[s.length - 1], pts[pts.length - 1]) > 0) s[s.length - 1] = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
    if (cerrado && s.length > 1 && dist(s[0], s[s.length - 1]) < TOL_UNION) s.pop();
    return s;
  }
  /* Douglas-Peucker: simplifica las curvas muestreadas sin cambiar la forma visible. */
  function simplificar(pts, tol) {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    let max = -1, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((pts[i][0] - a[0]) * dx + (pts[i][1] - a[1]) * dy) / l2)) : 0;
      const d = Math.hypot(pts[i][0] - a[0] - t * dx, pts[i][1] - a[1] - t * dy);
      if (d > max) { max = d; idx = i; }
    }
    if (max <= tol) return [a, b];
    return simplificar(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplificar(pts.slice(idx), tol));
  }
  function caja(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return { x0, y0, x1, y1 };
  }
  function esRectangulo(p) {
    if (p.length !== 4) return false;
    const eps = 0.05;
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4];
      if (Math.abs(a[0] - b[0]) > eps && Math.abs(a[1] - b[1]) > eps) return false;
    }
    return true;
  }
  const clave = (pts, cerrado) => {
    const f = pts.map(q => Math.round(q[0] * 10) + ',' + Math.round(q[1] * 10));
    const a = f.join(';'), b = f.slice().reverse().join(';');
    return (cerrado ? 'c' : 'a') + (a < b ? a : b);
  };

  /* Une trazados abiertos cuyos extremos coinciden (solo cuando el empalme es de a dos, sin bifurcaciones). */
  function unirAbiertos(lista) {
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (let i = 0; i < lista.length && !cambio; i++) {
        for (let j = i + 1; j < lista.length && !cambio; j++) {
          const A = lista[i], B = lista[j];
          for (const [ea, eb] of [[1, 0], [1, 1], [0, 0], [0, 1]]) {
            const pa = ea ? A[A.length - 1] : A[0], pb = eb ? B[B.length - 1] : B[0];
            if (dist(pa, pb) > TOL_UNION) continue;
            // bifurcación: otro extremo cae en el mismo punto, no se une
            const otros = lista.filter((_, k) => k !== i && k !== j)
              .some(C => dist(C[0], pa) <= TOL_UNION || dist(C[C.length - 1], pa) <= TOL_UNION);
            if (otros) continue;
            const a = ea ? A.slice() : A.slice().reverse();
            const b = eb ? B.slice().reverse() : B.slice();
            lista.splice(j, 1);
            lista[i] = a.concat(b.slice(1));
            cambio = true;
            break;
          }
        }
      }
    }
    return lista;
  }

  /* vectores: salida de /api/pdf/<id>/vectores/<n>. opc: { rellenos, minimo }. Devuelve [{ tipo, nombre, datos }]. */
  function trazadosAObjetos(vectores, opc) {
    const o = opc || {};
    const minimo = Number(o.minimo) || 0;
    const vistos = new Set();
    const cerrados = [], abiertos = [];
    const aceptar = (pts, cerrado) => {
      const b = caja(pts);
      if (Math.max(b.x1 - b.x0, b.y1 - b.y0) < Math.max(minimo, LARGO_NULO)) return;
      const k = clave(pts, cerrado);
      if (vistos.has(k)) return;
      vistos.add(k);
      (cerrado ? cerrados : abiertos).push(pts);
    };
    for (const v of vectores || []) {
      if (v.tipo === 'relleno' && !o.rellenos) continue;
      let cerrado = !!v.cerrado;
      let pts = limpiar((v.puntos || []).map(q => [Number(q[0]) || 0, Number(q[1]) || 0]), cerrado);
      if (pts.length < 2) continue;
      if (cerrado && pts.length < 3) cerrado = false;
      if (cerrado) pts = simplificar(pts.concat([pts[0]]), 0.05).slice(0, -1);
      else pts = simplificar(pts, 0.05);
      if (pts.length < 2) continue;
      if (cerrado) aceptar(pts, true); else abiertos.push(pts);
    }
    // Los abiertos se unen antes de filtrar y de quitar duplicados.
    const previos = abiertos.splice(0).filter(p => { const k = clave(p, false); if (vistos.has(k)) return false; vistos.add(k); return true; });
    for (let p of unirAbiertos(previos)) {
      p = limpiar(p, false);
      if (p.length >= 3 && dist(p[0], p[p.length - 1]) < TOL_UNION) { p.pop(); const b = caja(p); if (Math.max(b.x1 - b.x0, b.y1 - b.y0) >= Math.max(minimo, LARGO_NULO) && p.length >= 3) cerrados.push(p); continue; }
      const b = caja(p);
      if (p.length >= 2 && Math.max(b.x1 - b.x0, b.y1 - b.y0) >= Math.max(minimo, LARGO_NULO)) abiertos.push(simplificar(p, 0.05));
    }
    const salida = [];
    let nRec = 0, nLin = 0, nPol = 0, nFor = 0;
    for (const p of cerrados) {
      if (esRectangulo(p)) {
        const b = caja(p);
        salida.push({ tipo: 'rectangulo', nombre: 'Recuadro ' + (++nRec), datos: { x: red(b.x0), y: red(b.y0), ancho: red(b.x1 - b.x0), alto: red(b.y1 - b.y0) } });
      } else {
        salida.push({ tipo: 'poligono', nombre: 'Forma ' + (++nFor), datos: { vertices: p.map(q => [red(q[0]), red(q[1])]), cerrado: true } });
      }
    }
    for (const p of abiertos) {
      const vs = p.map(q => [red(q[0]), red(q[1])]);
      if (vs.length === 2) salida.push({ tipo: 'linea', nombre: 'Línea ' + (++nLin), datos: { vertices: vs } });
      else salida.push({ tipo: 'polilinea', nombre: 'Polilínea ' + (++nPol), datos: { vertices: vs } });
    }
    return salida;
  }

  const api = { trazadosAObjetos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Calco = api;
})(typeof self !== 'undefined' ? self : this);
