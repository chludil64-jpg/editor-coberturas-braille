/* Textos de un SVG (<text>, <tspan>, <textPath> simple): lógica pura (sirve en Node y en el navegador).
   Devuelve bloques de texto con su posición en mm dentro del área visible del SVG (respeta
   viewBox/preserveAspectRatio, transformaciones de grupos y del propio texto, x/y/dx/dy y
   text-anchor). La caja de tinta se estima con el tamaño de letra y el largo, o con la función
   `medir` si el navegador la ofrece. Rotaciones: se usa la caja envolvente (el texto se importa horizontal). */
(function (raiz) {
  'use strict';
  const SI = typeof module !== 'undefined' && module.exports ? require('./svg_importar.js') : raiz.SvgImportar;
  const num = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig;
  const N = s => (String(s || '').match(num) || []).map(Number);

  // ---------------------------------------------------------------- lector XML mínimo (con nodos de texto)
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const deco = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/ig, (m, e) => {
    if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) && c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m; }
    return Object.hasOwn(ENT, e) ? ENT[e] : m;
  });

  function leerXml(xml) {
    const raizN = { nombre: '#doc', attrs: {}, hijos: [] }, pila = [raizN];
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/gi;
    let m;
    while ((m = re.exec(String(xml)))) {
      const tope = pila[pila.length - 1];
      if (m[1] !== undefined) { tope.hijos.push(m[1]); continue; }
      if (m[6] !== undefined) { tope.hijos.push(deco(m[6])); continue; }
      if (m[3] === undefined) continue;
      const nombre = m[3].split(':').at(-1);
      if (m[2]) { if (pila.length > 1) pila.pop(); continue; }
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) { const v = deco(a[2] ?? a[3]); attrs[a[1]] = v; const l = a[1].split(':').at(-1); if (!Object.hasOwn(attrs, l)) attrs[l] = v; }
      const el = { nombre, attrs, hijos: [] };
      tope.hijos.push(el);
      if (!m[5]) pila.push(el);
    }
    return raizN.hijos.find(h => typeof h !== 'string' && h.nombre === 'svg') || null;
  }

  // ---------------------------------------------------------------- estilos
  function reglasClase(nodo, r) {
    for (const h of nodo.hijos) {
      if (typeof h === 'string') continue;
      if (h.nombre === 'style') {
        const css = h.hijos.filter(x => typeof x === 'string').join('');
        for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
          const decl = {};
          for (const d of m[2].split(';')) { const i = d.indexOf(':'); if (i > 0) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
          for (const sel of m[1].split(',')) { const c = sel.trim().match(/^\.([\w-]+)$/); if (c) r[c[1]] = Object.assign(r[c[1]] || {}, decl); }
        }
      } else reglasClase(h, r);
    }
    return r;
  }

  const PROPS = ['font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'fill', 'stroke', 'opacity', 'fill-opacity', 'letter-spacing'];
  function estiloDe(nodo, padre, clases) {
    const st = { ...padre };
    for (const k of PROPS) { const a = nodo.attrs[k]; if (a !== undefined) st[k] = a; }
    for (const c of String(nodo.attrs.class || '').split(/\s+/)) if (c && clases[c]) for (const k of PROPS) if (clases[c][k] !== undefined) st[k] = clases[c][k];
    for (const r of String(nodo.attrs.style || '').split(';')) {
      const i = r.indexOf(':');
      if (i > 0) { const k = r.slice(0, i).trim(); if (PROPS.includes(k)) st[k] = r.slice(i + 1).trim(); }
    }
    // font: shorthand sencillo ("bold 12px Arial")
    const f = nodo.attrs.font || (/font\s*:/.test(nodo.attrs.style || '') ? '' : '');
    if (f) {
      const mm = f.match(/(?:(bold|\d{3})\s+)?([\d.]+(?:px|pt|em)?)\s*(?:\/\S+)?\s+(.+)/i);
      if (mm) { if (mm[1]) st['font-weight'] = mm[1]; st['font-size'] = mm[2]; st['font-family'] = mm[3]; }
    }
    return st;
  }

  /** Tamaño de letra en unidades de usuario. Admite px, pt, mm, cm, in, em, %. */
  function tamano(valor, padre) {
    const v = String(valor ?? '').trim();
    if (!v) return padre;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return padre;
    if (/%$/.test(v)) return padre * n / 100;
    if (/em$/i.test(v)) return padre * n;
    if (/ex$/i.test(v)) return padre * n / 2;
    if (/pt$/i.test(v)) return n * 4 / 3;
    if (/mm$/i.test(v)) return n * 96 / 25.4;
    if (/cm$/i.test(v)) return n * 96 / 2.54;
    if (/in$/i.test(v)) return n * 96;
    return n;
  }
  const longitud = (valor, tam) => {
    const n = parseFloat(valor);
    if (!Number.isFinite(n)) return 0;
    return /em$/i.test(String(valor)) ? n * tam : /pt$/i.test(String(valor)) ? n * 4 / 3 : n;
  };

  /** Ancho estimado (en unidades de letra = 1) de un texto, sin fuente real. */
  function anchoEstimado(texto, negrita) {
    let w = 0;
    for (const ch of texto) {
      if (ch === ' ' || ch === ' ') w += 0.28;
      else if ('iljI.,;:!|\''.includes(ch)) w += 0.27;
      else if ('mwMW@'.includes(ch)) w += 0.85;
      else if (/[A-ZÁÉÍÓÚÑÜ]/.test(ch)) w += 0.68;
      else if (/\d/.test(ch)) w += 0.56;
      else w += 0.52;
    }
    return w * (negrita ? 1.08 : 1);
  }

  const esNegrita = p => /^(bold|bolder|[6-9]00)$/i.test(String(p || '').trim());
  const normalizar = s => String(s).replace(/[\s ]+/g, ' ');

  // ---------------------------------------------------------------- extracción
  /**
   * xml: texto del SVG. anchoMm: ancho al que se importa (el mismo que en parsear).
   * opciones: { medir(texto, tamPx, familia, peso) -> ancho en px (opcional) }
   * Devuelve { anchoMm, altoMm, bloques: [{ texto, lineas, chunks, x0,y0,x1,y1 (tinta, mm), alineacion,
   *   tamanoMm, familia, peso, estilo, fill }] }.
   * chunks: [{ texto, x, y (punto de anclaje, mm), anchor, tam (mm), x0,y0,x1,y1 }]
   */
  function extraerTextos(xml, anchoMm, opciones) {
    const op = opciones || {};
    const root = leerXml(xml);
    if (!root) throw Error('No es SVG');
    const area = SI.areaVisible({ getAttribute: k => (Object.hasOwn(root.attrs, k) ? root.attrs[k] : null) });
    const s = anchoMm / area.w, origen = [area.x, area.y], altoMm = area.h * s;
    const clases = reglasClase(root, {});
    const bloques = [];

    const aMm = (m, p) => { const q = SI.aplicar(m, p); return [(q[0] - origen[0]) * s, (q[1] - origen[1]) * s]; };
    const escala = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

    function visitar(nodo, M, estPadre) {
      if (typeof nodo === 'string') return;
      if (/display\s*:\s*none/i.test(nodo.attrs.style || '') || nodo.attrs.display === 'none') return;
      if (/^(defs|clipPath|mask|symbol|marker|pattern|style|script|metadata|title|desc)$/.test(nodo.nombre)) return;
      const m = SI.mult(M, SI.transform(nodo.attrs.transform));
      const est = estiloDe(nodo, estPadre, clases);
      if (nodo.nombre === 'text') { texto(nodo, m, est); return; }
      for (const h of nodo.hijos) visitar(h, m, est);
    }

    function texto(el, M, estT) {
      const sz0 = tamano(estT['font-size'], 16);
      const lista = a => String(a ?? '').trim() ? N(a) : [];
      const xs = lista(el.attrs.x), ys = lista(el.attrs.y);
      let px = xs[0] ?? 0, py = ys[0] ?? 0;      // pluma
      const chunks = [];
      let actual = null;

      const nuevo = (st, x, y) => {
        actual = { texto: '', x, y, anchor: String(st['text-anchor'] || 'start').trim(), st, sz: tamano(st['font-size'], sz0), w: 0 };
        chunks.push(actual);
      };
      const agregar = (cadena, st) => {
        const t = normalizar(cadena);
        if (!actual) { if (!t.trim()) return; nuevo(st, px, py); }
        const sz = tamano(st['font-size'], sz0), neg = esNegrita(st['font-weight']);
        const tt = actual.texto === '' ? t.replace(/^ /, '') : t;
        if (!tt) return;
        const ls = longitud(st['letter-spacing'], sz) * tt.length;
        const w = (op.medir ? op.medir(tt, sz, st['font-family'], st['font-weight']) : anchoEstimado(tt, neg) * sz) + ls;
        actual.texto += tt; actual.w += w; actual.sz = Math.max(actual.sz, sz);
        px += w;
      };
      const visibleSt = st => {
        const fi = String(st.fill ?? 'black').trim().toLowerCase(), tr = String(st.stroke ?? 'none').trim().toLowerCase();
        const op0 = parseFloat(st.opacity ?? 1) * parseFloat(st['fill-opacity'] ?? 1);
        return !((fi === 'none' || fi === 'transparent') && (tr === 'none' || tr === '')) && op0 > 0;
      };
      const primero = a => String(a).trim().split(/[\s,]+/)[0];

      function recorrer(nodo, st) {
        for (const h of nodo.hijos) {
          if (typeof h === 'string') { agregar(h, st); continue; }
          if (/display\s*:\s*none/i.test(h.attrs.style || '') || h.attrs.display === 'none') continue;
          if (!/^(tspan|textPath|a)$/.test(h.nombre)) continue;
          const hs = estiloDe(h, st, clases);
          const hx = lista(h.attrs.x), hy = lista(h.attrs.y);
          const szh = tamano(hs['font-size'], tamano(st['font-size'], sz0));
          const dxv = String(h.attrs.dx ?? '').trim() ? longitud(primero(h.attrs.dx), szh) : 0;
          const dyv = String(h.attrs.dy ?? '').trim() ? longitud(primero(h.attrs.dy), szh) : 0;
          if (h.nombre === 'textPath' && actual && actual.texto) actual = null;   // textPath simple: no se sigue la curva
          if (hx.length || hy.length) {
            if (hx.length) px = hx[0];
            if (hy.length) py = hy[0];
            px += dxv; py += dyv; actual = null;
          } else if (Math.abs(dyv) > 0.5 * szh && actual) {
            px = actual.x + dxv; py += dyv; actual = null;   // salto de renglón: vuelve al inicio del anterior
          } else { px += dxv; py += dyv; }
          recorrer(h, hs);
        }
      }
      recorrer(el, estT);

      if (!visibleSt(estT)) return;
      const salida = [];
      for (const c of chunks) {
        const t = c.texto.replace(/\s+$/, '');
        if (!t.trim()) continue;
        const w = c.anchor === 'middle' ? c.w : c.w;
        const x0 = c.anchor === 'middle' ? c.x - w / 2 : c.anchor === 'end' ? c.x - w : c.x;
        const caja = [[x0, c.y - 0.75 * c.sz], [x0 + w, c.y - 0.75 * c.sz], [x0 + w, c.y + 0.2 * c.sz], [x0, c.y + 0.2 * c.sz]].map(p => aMm(M, p));
        const xs2 = caja.map(p => p[0]), ys2 = caja.map(p => p[1]);
        const [ax, ay] = aMm(M, [c.x, c.y]);
        const ch = { texto: t, x: ax, y: ay, anchor: c.anchor, tam: c.sz * escala(M) * s,
          x0: Math.min(...xs2), y0: Math.min(...ys2), x1: Math.max(...xs2), y1: Math.max(...ys2),
          familia: c.st['font-family'] || '', peso: c.st['font-weight'] || '', estilo: c.st['font-style'] || '', fill: c.st.fill || 'black' };
        if (ch.x1 < 0 || ch.x0 > anchoMm || ch.y1 < 0 || ch.y0 > altoMm) continue;
        salida.push(ch);
      }
      // Agrupar los chunks de este <text> en bloques: renglones alineados y cercanos van juntos.
      const hechos = [];
      for (const c of salida) {
        const b = hechos.find(b => {
          const u = b.chunks[b.chunks.length - 1], paso = c.y - u.y;
          if (c.anchor !== b.chunks[0].anchor || paso < 0.3 * c.tam || paso > 2.2 * Math.max(c.tam, u.tam)) return false;
          const tol = 0.6 * Math.max(c.tam, u.tam) + 0.02 * (u.x1 - u.x0);
          return Math.abs(c.x - u.x) <= tol;
        });
        if (b) b.chunks.push(c); else hechos.push({ chunks: [c] });
      }
      for (const b of hechos) {
        const cs = b.chunks;
        const e0 = cs[0];
        bloques.push({
          texto: cs.map(c => c.texto).join('\n'), lineas: cs.map(c => c.texto), chunks: cs,
          x0: Math.min(...cs.map(c => c.x0)), y0: Math.min(...cs.map(c => c.y0)),
          x1: Math.max(...cs.map(c => c.x1)), y1: Math.max(...cs.map(c => c.y1)),
          alineacion: e0.anchor === 'middle' ? 'centro' : e0.anchor === 'end' ? 'derecha' : 'izquierda',
          tamanoMm: e0.tam, familia: e0.familia, peso: e0.peso, estilo: e0.estilo, fill: e0.fill
        });
      }
    }

    visitar(root, SI.I || [1, 0, 0, 1, 0, 0], { fill: 'black', stroke: 'none', 'font-size': '16' });
    return { anchoMm, altoMm, bloques };
  }

  const api = { extraerTextos, leerXml, anchoEstimado, tamano };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.SvgTexto = api;
})(typeof self !== 'undefined' ? self : this);
