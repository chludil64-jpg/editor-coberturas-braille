/* Modelo único de puntos, en milímetros (origen arriba a la izquierda de la página).
   De acá sale la lista de puntos que usan la pantalla, el PDF de prueba y el
   archivo de impresión: no hay otro cálculo que pueda diferir.
   Funciona en el navegador (window.Grilla) y en Node (require). */
(function (raiz) {
  'use strict';

  const BrailleES = (typeof module !== 'undefined' && module.exports)
    ? require('./braille_es.js') : raiz.BrailleES;
  const Objetos = (typeof module !== 'undefined' && module.exports)
    ? require('./objetos.js') : raiz.Objetos;

  const MEDIDAS = { entrePuntos: 2.5, entreCeldas: 6.0, entreRenglones: 10.0 };

  /**
   * Medidas del braille según el perfil.
   * Con el codificador «grilla» (Everest-D V4) la impresora solo pone puntos en una
   * grilla fija (medida real: 2,05 mm transversal y 2,02 mm en el avance). Entonces el braille
   * se arma sobre esa grilla —1 paso entre puntos, 3 entre celdas, 5 entre renglones—
   * y todos los puntos se ajustan a ella, para que la pantalla muestre lo que sale.
   * `ancho`/`alto` (mm de la página) sirven para saber si el diseño se gira al imprimir.
   */
  function medidasDePerfil(perfil, ancho, alto) {
    const b = (perfil && perfil.braille) || {};
    const ep = Number(b.entre_puntos_mm) || MEDIDAS.entrePuntos;
    const m = {
      entrePuntos: ep, entrePuntosX: ep, entrePuntosY: ep,
      entreCeldas: Number(b.entre_celdas_mm) || MEDIDAS.entreCeldas,
      entreRenglones: Number(b.entre_renglones_mm) || MEDIDAS.entreRenglones
    };
    if (perfil && perfil.codificador === 'grilla') {
      const g = perfil.grilla || {};
      let px = Number(g.paso_x_mm) || Number(g.paso_mm) || 2;
      let py = Number(g.paso_y_mm) || Number(g.paso_mm) || 2;
      const carga = perfil.carga || {};
      const gira = ancho && alto &&
        ((carga.orientacion === 'vertical' && ancho > alto) || (carga.orientacion === 'horizontal' && alto > ancho));
      if (gira) [px, py] = [py, px];
      m.grilla = { px, py };
      m.entrePuntos = m.entrePuntosX = px;
      m.entrePuntosY = py;
      m.entreCeldas = redondear(3 * px);
      m.entreRenglones = redondear(5 * py);
    }
    return m;
  }

  /** Ajusta un punto a la grilla de la impresora (si la hay). */
  function ajustarAGrilla(x, y, g) {
    if (!g) return [x, y];
    return [redondear(Math.round(x / g.px) * g.px), redondear(Math.round(y / g.py) * g.py)];
  }

  function anchoRenglon(nCeldas, m) {
    return nCeldas > 0 ? (nCeldas - 1) * m.entreCeldas + m.entrePuntos : 0;
  }

  /** Quita celdas vacías del final de cada renglón (espacios sobrantes). */
  function recortar(renglon) {
    let n = renglon.length;
    while (n > 0 && renglon[n - 1].length === 0) n--;
    return renglon.slice(0, n);
  }

  /**
   * Calcula un cuadro braille: renglones, tamaño y puntos.
   * cuadro: { texto, x, y, alineacion, opciones }  (x, y = punto 1 de la primera celda)
   */
  function calcularCuadro(cuadro, m) {
    m = m || MEDIDAS;
    const t = BrailleES.transcribir(cuadro.texto || '', cuadro.opciones || {});
    const renglones = t.renglones.map(recortar);
    const anchos = renglones.map(r => anchoRenglon(r.length, m));
    const ancho = Math.max(0, ...anchos);
    const epx = m.entrePuntosX || m.entrePuntos;
    const epy = m.entrePuntosY || m.entrePuntos;
    const alto = renglones.length ? (renglones.length - 1) * m.entreRenglones + 2 * epy : 0;
    const puntos = [];
    const alin = cuadro.alineacion || 'izquierda';
    renglones.forEach((celdas, j) => {
      let dx = 0;
      if (alin === 'centro') dx = (ancho - anchos[j]) / 2;
      else if (alin === 'derecha') dx = ancho - anchos[j];
      celdas.forEach((celda, i) => {
        for (const p of celda) {
          const col = p >= 4 ? 1 : 0;
          const fila = (p - 1) % 3;
          puntos.push([
            redondear(cuadro.x + dx + i * m.entreCeldas + col * epx),
            redondear(cuadro.y + j * m.entreRenglones + fila * epy)
          ]);
        }
      });
    });
    return {
      renglones, ancho, alto, puntos,
      sinTranscribir: t.sinTranscribir,
      unicode: renglones.map(BrailleES.aUnicode).join('\n'),
      celdas: Math.max(0, ...renglones.map(r => r.length))
    };
  }

  function redondear(v) {
    return Math.round(v * 1000) / 1000;
  }

  /**
   * Ubica el cuadro respecto del texto en tinta (cuadro.tinta = {x0,y0,x1,y1}).
   * Horizontal según la alineación; vertical centrado en el renglón impreso.
   */
  function ubicarSegunTinta(cuadro, m) {
    if (!cuadro.tinta) return cuadro;
    const c = calcularCuadro(Object.assign({}, cuadro, { x: 0, y: 0 }), m);
    const t = cuadro.tinta;
    const alin = cuadro.alineacion || 'centro';
    if (alin === 'izquierda') cuadro.x = t.x0;
    else if (alin === 'derecha') cuadro.x = t.x1 - c.ancho;
    else cuadro.x = (t.x0 + t.x1) / 2 - c.ancho / 2;
    cuadro.y = (t.y0 + t.y1) / 2 - c.alto / 2;
    cuadro.x = redondear(cuadro.x);
    cuadro.y = redondear(cuadro.y);
    return cuadro;
  }

  /** Parte el texto en renglones para que el braille no supere `anchoMax` mm. */
  function partirEnRenglones(texto, anchoMax, m) {
    m = m || MEDIDAS;
    const maxCeldas = Math.max(1, Math.floor((anchoMax - m.entrePuntos) / m.entreCeldas) + 1);
    const salida = [];
    for (const linea of String(texto).split('\n')) {
      let actual = '';
      for (const palabra of linea.split(/\s+/).filter(Boolean)) {
        const prueba = actual ? actual + ' ' + palabra : palabra;
        const n = BrailleES.transcribir(prueba).renglones[0].length;
        if (n <= maxCeldas || !actual) actual = prueba;
        else { salida.push(actual); actual = palabra; }
      }
      salida.push(actual);
    }
    return salida.join('\n');
  }

  // ------------------------------------------------------------ muestreo de formas

  function muestrearLinea(a, b, paso) {
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(largo / paso));
    const pts = [];
    for (let k = 0; k <= n; k++) {
      pts.push([redondear(a[0] + (b[0] - a[0]) * k / n), redondear(a[1] + (b[1] - a[1]) * k / n)]);
    }
    return largo < 1e-6 ? [pts[0]] : pts;
  }

  /** Polígono cerrado o abierto con un punto en cada vértice. */
  function muestrearPoligono(vertices, paso, cerrado) {
    const pts = [];
    const n = vertices.length;
    const tramos = cerrado ? n : n - 1;
    for (let i = 0; i < tramos; i++) {
      const seg = muestrearLinea(vertices[i], vertices[(i + 1) % n], paso);
      pts.push(...seg.slice(0, -1));
    }
    if (!cerrado && n) pts.push([redondear(vertices[n - 1][0]), redondear(vertices[n - 1][1])]);
    return quitarDuplicados(pts, 0.01);
  }

  function muestrearRectangulo(x0, y0, x1, y1, paso) {
    const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
    return muestrearPoligono([[a, c], [b, c], [b, d], [a, d]], paso, true);
  }

  /** Recorre una polilínea poniendo un punto cada `paso` mm (espaciado uniforme). */
  function muestrearTrayecto(vertices, paso, cerrado) {
    const v = cerrado ? vertices.concat([vertices[0]]) : vertices.slice();
    if (v.length === 0) return [];
    let largo = 0;
    for (let i = 1; i < v.length; i++) largo += Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]);
    if (largo < paso / 2) return [[redondear(v[0][0]), redondear(v[0][1])]];
    const n = cerrado ? Math.max(3, Math.round(largo / paso)) : Math.max(1, Math.round(largo / paso));
    const paso2 = largo / n;
    const pts = [];
    let objetivo = 0, acum = 0;
    const total = cerrado ? n : n + 1;
    let i = 1;
    for (let k = 0; k < total; k++) {
      objetivo = Math.min(k * paso2, largo);
      while (i < v.length - 1 && acum + Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]) < objetivo) {
        acum += Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]);
        i++;
      }
      const seg = Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]) || 1;
      const t = Math.max(0, Math.min(1, (objetivo - acum) / seg));
      pts.push([redondear(v[i - 1][0] + (v[i][0] - v[i - 1][0]) * t),
        redondear(v[i - 1][1] + (v[i][1] - v[i - 1][1]) * t)]);
    }
    return pts;
  }

  function muestrearElipse(x0, y0, x1, y1, paso) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    if (rx < 0.01 && ry < 0.01) return [[redondear(cx), redondear(cy)]];
    const v = [];
    for (let k = 0; k < 360; k++) {
      const a = k / 360 * Math.PI * 2;
      v.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return muestrearTrayecto(v, paso, true);
  }

  // ------------------------------------------------------------ utilidades de puntos

  function clave(x, y, celda) {
    return Math.floor(x / celda) + ',' + Math.floor(y / celda);
  }

  /** Índice espacial simple para buscar vecinos a menos de `radio`. */
  function indice(puntos, radio) {
    const mapa = new Map();
    puntos.forEach((p, i) => {
      const k = clave(p[0], p[1], radio);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(i);
    });
    return {
      vecinos(x, y) {
        const cx = Math.floor(x / radio), cy = Math.floor(y / radio);
        const out = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const l = mapa.get((cx + dx) + ',' + (cy + dy));
          if (l) out.push(...l);
        }
        return out;
      }
    };
  }

  function quitarDuplicados(puntos, tolerancia) {
    const tol = tolerancia || 0.05;
    const salida = [];
    const vistos = new Map();
    for (const p of puntos) {
      const k = clave(p[0], p[1], tol);
      if (vistos.has(k)) continue;
      vistos.set(k, true);
      salida.push(p);
    }
    return salida;
  }

  /**
   * Ralea: deja solo puntos separados al menos `minimo` mm entre sí.
   * `fijos` (opcional) son puntos que no se tocan (por ejemplo, el braille) y
   * con los que también se respeta la distancia.
   */
  function ralear(puntos, minimo, fijos) {
    const aceptados = (fijos || []).slice();
    const salida = [];
    const mapa = new Map();
    const agregar = p => {
      const k = clave(p[0], p[1], minimo);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(p);
    };
    aceptados.forEach(agregar);
    for (const p of puntos) {
      const cx = Math.floor(p[0] / minimo), cy = Math.floor(p[1] / minimo);
      let ok = true;
      for (let dx = -1; dx <= 1 && ok; dx++) for (let dy = -1; dy <= 1 && ok; dy++) {
        const l = mapa.get((cx + dx) + ',' + (cy + dy));
        if (l) for (const q of l) {
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < minimo - 1e-6) { ok = false; break; }
        }
      }
      if (ok) { salida.push(p); agregar(p); }
    }
    return salida;
  }

  /**
   * Ralea la página tal como se va a imprimir (puntos ya ajustados a la grilla): quita los puntos
   * de dibujo a menos de `minimo` mm del braille o de otro punto ya aceptado. Actúa sobre objetos
   * vectoriales (con la «goma» `borrados`) y sobre puntos fijos. Devuelve cuántos puntos quitó.
   */
  function quitarJuntos(pagina, calculo, minimo, medidas) {
    const g = medidas && medidas.grilla;
    const llave = (x, y) => { const q = g ? ajustarAGrilla(x, y, g) : [x, y]; return redondear(q[0]) + ',' + redondear(q[1]); };
    const braille = calculo.puntos.filter(q => q.origen === 'braille').map(q => [q.x, q.y]);
    const dibujo = calculo.puntos.filter(q => q.origen !== 'braille').map(q => [q.x, q.y]);
    const quedan = new Set(ralear(dibujo, minimo, braille).map(q => llave(q[0], q[1])));
    const sobran = new Set(dibujo.map(q => llave(q[0], q[1])).filter(k => !quedan.has(k)));
    if (!sobran.size) return 0;
    for (const o of pagina.objetos || []) {
      if (o.tipo === 'referencia') continue;
      if (o.tipo === 'puntos') { o.puntos = (o.puntos || []).filter(q => !sobran.has(llave(q[0], q[1]))); continue; }
      for (const q of Objetos.objetoAPuntos(o, medidas)) {
        if (sobran.has(llave(q[0], q[1]))) (o.borrados = o.borrados || []).push([q[0], q[1], 0.01]);
      }
    }
    for (const t of pagina.trazos || []) t.puntos = t.puntos.filter(q => !sobran.has(llave(q[0], q[1])));
    return sobran.size;
  }

  /** Rectángulo ocupado por un cuadro (con su cálculo). */
  function rectCuadro(cuadro, calc) {
    return { x0: cuadro.x, y0: cuadro.y, x1: cuadro.x + calc.ancho, y1: cuadro.y + calc.alto };
  }

  function distanciaARect(x, y, r) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dy = Math.max(r.y0 - y, 0, y - r.y1);
    return Math.hypot(dx, dy);
  }

  /**
   * Lista final de puntos de una página.
   * opciones: { medidas, separacionDibujo (mm; 0 = no separar) }
   * Devuelve { puntos: [{x, y, origen:'braille'|'dibujo', id}], cuadros: Map(id -> calc), quitados }
   */
  /** Punto dentro de polígono (regla par-impar). */
  function dentroPoligono(x, y, v) {
    let adentro = false;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      const a = v[i], b = v[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0]) adentro = !adentro;
    }
    return adentro;
  }

  function calcularPagina(pagina, opciones) {
    const op = Object.assign({ medidas: MEDIDAS, separacionDibujo: 0 }, opciones || {});
    // Hojas de prueba: las distancias cortas entre braille y dibujo son lo que se quiere probar.
    if (pagina.sinSeparacion) op.separacionDibujo = 0;
    const cuadros = new Map();
    const puntos = [];
    const rects = [];
    for (const c of pagina.cuadros || []) {
      if (c.oculto || pagina.capasVisibles && pagina.capasVisibles[c.capa || 'rotulos'] === false) continue;
      const calc = calcularCuadro(c, op.medidas);
      cuadros.set(c.id, calc);
      rects.push(rectCuadro(c, calc));
      for (const p of calc.puntos) puntos.push({ x: p[0], y: p[1], origen: 'braille', id: c.id });
    }
    let quitados = 0;
    const visibles = (pagina.objetos || []).filter(o => !o.oculto &&
      !(pagina.capasVisibles && pagina.capasVisibles[o.capa] === false))
      .slice().sort((a,b) => (a.orden || 0) - (b.orden || 0));
    // Zonas importadas de un SVG: como en el SVG original, lo que está dibujado ENCIMA tapa lo de
    // abajo. Por ejemplo, el mar suele ser un rectángulo de fondo con la tierra encima: el relleno
    // del mar no tiene que aparecer sobre la tierra.
    const zonasSvg = visibles.filter(o => o.grupoSvg && o.tipo === 'poligono')
      .map(o => ({ o, v: Objetos.geometria(o), caja: Objetos.caja(o) }));
    function tapado(o, x, y) {
      if (!o.grupoSvg || o.tipo !== 'poligono' || !o.relleno || o.relleno === 'ninguno') return false;
      return zonasSvg.some(z => z.o !== o && z.o.grupoSvg === o.grupoSvg && (z.o.orden || 0) > (o.orden || 0) &&
        x >= z.caja.x0 && x <= z.caja.x1 && y >= z.caja.y0 && y <= z.caja.y1 && dentroPoligono(x, y, z.v));
    }
    for (const o of visibles) {
      for (const p of Objetos.objetoAPuntos(o, op.medidas)) {
        if (tapado(o, p[0], p[1])) continue;
        puntos.push({ x:p[0], y:p[1], origen:'objeto', id:o.id });
      }
    }
    for (const t of pagina.trazos || []) {
      for (const p of t.puntos) puntos.push({ x: p[0], y: p[1], origen: 'dibujo', id: t.id });
    }
    const g = op.medidas && op.medidas.grilla;
    // Ajuste a la grilla de la impresora: lo que se ve es lo que se imprime.
    const ajustados = g ? puntos.map(p => {
      const [x, y] = ajustarAGrilla(p.x, p.y, g);
      return { x, y, origen: p.origen, id: p.id };
    }) : puntos;
    // El despeje se mide sobre los puntos YA ajustados a la grilla (el braille también),
    // para que los milímetros de separación sean los del relieve impreso.
    let lista = ajustados;
    if (op.separacionDibujo > 0 && rects.length) {
      const zonas = new Map();
      for (const p of ajustados) {
        if (p.origen !== 'braille') continue;
        const z = zonas.get(p.id);
        if (!z) zonas.set(p.id, { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        else { z.x0 = Math.min(z.x0, p.x); z.y0 = Math.min(z.y0, p.y); z.x1 = Math.max(z.x1, p.x); z.y1 = Math.max(z.y1, p.y); }
      }
      const cajas = [...zonas.values()];
      lista = ajustados.filter(p => {
        if (p.origen === 'braille') return true;
        if (cajas.some(r => distanciaARect(p.x, p.y, r) < op.separacionDibujo - 1e-6)) { quitados++; return false; }
        return true;
      });
    }
    if (g) {
      const vistos = new Set();
      const salida = [];
      for (const p of lista) {
        const k = Math.round(p.x / g.px) + ',' + Math.round(p.y / g.py);
        if (vistos.has(k)) continue;
        vistos.add(k);
        salida.push(p);
      }
      return { puntos: salida, cuadros, quitados };
    }
    return { puntos: lista, cuadros, quitados };
  }

  /** Despeje braille-dibujo (mm) según las opciones del proyecto: «Mapa táctil» exige al menos 6 mm. */
  function despejeEfectivo(o) {
    o = o || {};
    const base = o.separarDibujo ? Number(o.separacionDibujo) || 0 : 0;
    return o.mapaTactil ? Math.max(6, base) : base;
  }

  /** Lista simple [[x, y], ...] para exportar. */
  function listaParaExportar(calculo) {
    return calculo.puntos.map(p => [p.x, p.y]);
  }

  /** Margen en el diseño correspondiente al borde de entrada de la hoja cargada. */
  function margenesDeDiseno(perfil, ancho, alto) {
    const mg = (perfil && perfil.margenes_mm) || {};
    const carga = (perfil && perfil.carga) || {};
    const base = Math.min(...['izquierdo', 'derecho', 'superior', 'inferior'].map(k => Number(mg[k]) || 0));
    const salida = Object.fromEntries(['izquierdo', 'derecho', 'superior', 'inferior']
      .map(k => [k, Number(mg[k]) || 0]));
    // El perfil histórico guarda los 5 mm de entrada en «izquierdo»; al cambiar
    // de orientación, ese valor debe acompañar al borde físico de entrada.
    const franja = Math.max(salida.izquierdo, -(Number(carga.desplazamiento_y_mm) || 0));
    const gira = (carga.orientacion === 'vertical' && ancho > alto) ||
      (carga.orientacion === 'horizontal' && alto > ancho);
    const borde = !gira ? 'superior' :
      carga.sentido_giro === 'antihorario' ? 'derecho' : 'izquierdo';
    if (borde !== 'izquierdo') salida.izquierdo = base;
    salida[borde] = Math.max(salida[borde], franja);
    return salida;
  }

  /**
   * Avisos de una página: desbordes, fuera de hoja, zona no imprimible,
   * choques entre cuadros, puntos demasiado juntos y caracteres sin transcribir.
   */
  /** Distancia mínima entre dos segmentos (0 si se cruzan). */
  function distSegmentos(a, b, c, d) {
    const cruza = (p, q, r, s) => {
      const o = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
      return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
    };
    if (cruza(a, b, c, d)) return 0;
    const f = Objetos.distanciaSegmento;
    return Math.min(f(a[0], a[1], c, d), f(b[0], b[1], c, d), f(c[0], c[1], a, b), f(d[0], d[1], a, b));
  }

  /** Segmentos (ya ajustados a la grilla) del contorno de un objeto con línea. */
  function segmentosAjustados(o, grilla) {
    if (!['linea', 'polilinea', 'poligono', 'rectangulo', 'elipse'].includes(o.tipo)) return [];
    if (!o.linea || o.linea === 'ninguna') return [];
    const v = Objetos.geometria(o).map(q => ajustarAGrilla(q[0], q[1], grilla));
    const cerrado = o.tipo === 'poligono' || o.tipo === 'rectangulo' || o.tipo === 'elipse' || !!o.cerrado;
    const segs = [];
    for (let i = 0; i < v.length - (cerrado ? 0 : 1); i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) segs.push([a, b]);
    }
    return segs;
  }

  /** Pares de objetos distintos con tramos casi paralelos a menos de `maximo` mm (costoso: solo al comprobar). */
  function paralelasCercanas(objetos, grilla, minimo, maximo) {
    const items = objetos.map(o => {
      const segs = segmentosAjustados(o, grilla);
      if (!segs.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [a, b] of segs) for (const q of [a, b]) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      return { o, segs, x0, y0, x1, y1 };
    }).filter(Boolean);
    const pares = [];
    let presupuesto = 400000;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.x0 > B.x1 + maximo || B.x0 > A.x1 + maximo || A.y0 > B.y1 + maximo || B.y0 > A.y1 + maximo) continue;
      let hallado = null;
      buscar: for (const [a, b] of A.segs) {
        const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (const [c, d] of B.segs) {
          if (--presupuesto < 0) return pares;
          const lb = Math.hypot(d[0] - c[0], d[1] - c[1]);
          const seno = Math.abs((b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])) / (la * lb);
          if (seno > 0.26) continue; // más de ~15 grados: no son paralelas
          const dist = distSegmentos(a, b, c, d);
          if (dist < minimo || dist >= maximo - 1e-6) continue;
          // que realmente corran lado a lado: proyección común de al menos 4 mm
          const ux = (b[0] - a[0]) / la, uy = (b[1] - a[1]) / la;
          const t = q => (q[0] - a[0]) * ux + (q[1] - a[1]) * uy;
          const comun = Math.min(la, Math.max(t(c), t(d))) - Math.max(0, Math.min(t(c), t(d)));
          if (comun < 4) continue;
          hallado = dist; break buscar;
        }
      }
      if (hallado !== null) pares.push({ a: A.o, b: B.o, dist: hallado });
    }
    return pares;
  }

  function despejeAviso(o) { return o && o.mapaTactil ? 6 : 3; }

  function avisos(pagina, calculo, perfil, opciones) {  // opciones: { mapaTactil, completo }
    const despeje = despejeAviso(opciones);
    const lista = [];
    const minimo = (perfil && Number(perfil.separacion_minima_mm)) || 2.0;
    const W = pagina.ancho, H = pagina.alto;
    const mg = margenesDeDiseno(perfil, W, H);
    const hoja = (perfil && perfil.hoja) || { ancho_max_mm: 297, alto_max_mm: 210 };
    const lmax = Math.max(hoja.ancho_max_mm, hoja.alto_max_mm), lmin = Math.min(hoja.ancho_max_mm, hoja.alto_max_mm);
    if (Math.max(W, H) > lmax + 0.5 || Math.min(W, H) > lmin + 0.5) {
      lista.push({ nivel: 'error', mensaje: `La página mide ${W.toFixed(1)} × ${H.toFixed(1)} mm y supera A4. Reducí el diseño antes de imprimir.` });
    }
    const porCuadro = new Map();
    for (const c of pagina.cuadros || []) {
      const calc = calculo.cuadros.get(c.id);
      if (!calc) continue;
      const nombre = `«${(c.texto || '').split('\n')[0].slice(0, 30)}»`;
      if (calc.sinTranscribir.length) {
        lista.push({ nivel: 'aviso', id: c.id, mensaje: `${nombre}: caracteres sin transcripción (${[...new Set(calc.sinTranscribir)].join(' ')}); se omiten.` });
      }
      if (c.tinta && calc.ancho > (c.tinta.x1 - c.tinta.x0) + 1) {
        lista.push({ nivel: 'info', id: c.id, mensaje: `${nombre}: el braille ocupa ${calc.ancho.toFixed(1)} mm y el texto impreso ${(c.tinta.x1 - c.tinta.x0).toFixed(1)} mm. Podés abreviar o partir en renglones.` });
      }
      porCuadro.set(c.id, rectCuadro(c, calc));
    }
    let fuera = 0, enMargen = 0;
    for (const p of calculo.puntos) {
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) fuera++;
      else if (p.x < mg.izquierdo || p.x > W - mg.derecho || p.y < mg.superior || p.y > H - mg.inferior) enMargen++;
    }
    if (fuera) lista.push({ nivel: 'error', mensaje: `${fuera} puntos quedan fuera de la hoja.` });
    if (enMargen) lista.push({ nivel: 'aviso', mensaje: `${enMargen} puntos caen en la zona no imprimible (márgenes del perfil).` });
    // Choques entre cuadros
    const cs = pagina.cuadros || [];
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = porCuadro.get(cs[i].id), b = porCuadro.get(cs[j].id);
      if (!a || !b) continue;
      const sep = 1.5;
      if (a.x0 < b.x1 + sep && b.x0 < a.x1 + sep && a.y0 < b.y1 + sep && b.y0 < a.y1 + sep) {
        lista.push({ nivel: 'error', id: cs[i].id, mensaje: `Se chocan los cuadros «${cs[i].texto.split('\n')[0].slice(0, 20)}» y «${cs[j].texto.split('\n')[0].slice(0, 20)}».` });
      }
    }
    // Puntos demasiado juntos
    const arr = calculo.puntos.map(p => [p.x, p.y]);
    const idx = indice(arr, minimo);
    let juntos = 0, mixtos = 0;
    for (let i = 0; i < arr.length; i++) {
      for (const j of idx.vecinos(arr[i][0], arr[i][1])) {
        if (j <= i) continue;
        const d = Math.hypot(arr[i][0] - arr[j][0], arr[i][1] - arr[j][1]);
        if (d < minimo - 1e-6) {
          juntos++;
          if (calculo.puntos[i].origen !== calculo.puntos[j].origen) mixtos++;
        }
      }
    }
    if (juntos) {
      lista.push({ nivel: 'aviso', mensaje: `${juntos} pares de puntos están a menos de ${minimo} mm${mixtos ? ` (${mixtos} entre dibujo y braille)` : ''}. Usá «Ralear puntos» o separá los elementos.` });
    }
    if (calculo.quitados) {
      lista.push({ nivel: 'info', mensaje: `Se omitieron ${calculo.quitados} puntos de dibujo pegados al braille (separación automática).` });
    }
    const objetos = (pagina.objetos || []).filter(o => !o.oculto && !(pagina.capasVisibles && pagina.capasVisibles[o.capa] === false));
    const medidas = medidasDePerfil(perfil, pagina.ancho, pagina.alto);
    const paso = Math.min(...Objetos.pasos(medidas));
    const lineas = new Set(), rellenos = new Set();
    for (const o of objetos) {
      if (o.tipo !== 'puntos') { if (o.linea && o.linea !== 'ninguna') lineas.add(o.linea); if (o.relleno && o.relleno !== 'ninguno') rellenos.add(o.relleno); }
      const b = Objetos.caja(o);
      const cerrado = ['rectangulo','elipse','poligono'].includes(o.tipo) || o.cerrado;
      if (cerrado) {
        const aj = Objetos.geometria(o).map(q => ajustarAGrilla(q[0], q[1], medidas.grilla));
        const xs = aj.map(q => q[0]), ys = aj.map(q => q[1]);
        const ancho = Math.max(...xs) - Math.min(...xs), alto = Math.max(...ys) - Math.min(...ys);
        if (Math.min(ancho, alto) < 6 - 1e-6) lista.push({ nivel:'aviso', id:o.id, mensaje:`${o.nombre}: forma cerrada o símbolo de ${Math.min(ancho, alto).toFixed(1)} mm de diámetro sobre la grilla; se recomienda al menos 6 mm para que se reconozca al tacto.` });
      }
      if (b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H) lista.push({ nivel:'error', id:o.id, mensaje:`${o.nombre}: queda fuera de la hoja.` });
      else if (b.x0 < mg.izquierdo || b.y0 < mg.superior || b.x1 > W-mg.derecho || b.y1 > H-mg.inferior)
        lista.push({ nivel:'aviso', id:o.id, mensaje:`${o.nombre}: invade la zona no imprimible.` });
    }
    if (lineas.size + rellenos.size > 5 && lineas.size <= 5 && rellenos.size <= 5) {
      lista.push({ nivel:'aviso', mensaje:`La página combina ${lineas.size} estilos de línea y ${rellenos.size} texturas (${lineas.size + rellenos.size} distintos); conviene no pasar de 5 para que se distingan.` });
    }
    if (lineas.size > 5) lista.push({ nivel:'aviso', mensaje:`La página usa ${lineas.size} tipos de línea; conviene usar hasta 5.` });
    if (rellenos.size > 5) lista.push({ nivel:'aviso', mensaje:`La página usa ${rellenos.size} rellenos; conviene usar hasta 5.` });
    const grilla=medidas.grilla;
    const ptsObjetos=objetos.flatMap(o=>Objetos.objetoAPuntos(o,medidas).map(q=>{
      const [x,y]=ajustarAGrilla(q[0],q[1],grilla);return {x,y,id:o.id};
    }));
    const ptsBraille=(pagina.cuadros||[]).filter(c=>!c.oculto&&!(pagina.capasVisibles&&pagina.capasVisibles[c.capa||'rotulos']===false)).flatMap(c=>calcularCuadro(c,medidas).puntos.map(q=>{
      const [x,y]=ajustarAGrilla(q[0],q[1],grilla);return {x,y,id:c.id};
    }));
    let cercanos = new Set(), brailleCerca = new Set();
    const idxObjetos=indice(ptsObjetos.map(p=>[p.x,p.y]),Math.max(2*paso,despeje));
    ptsObjetos.forEach((a,i)=>{for(const j of idxObjetos.vecinos(a.x,a.y)) {if(j<=i)continue;const b=ptsObjetos[j];
      if(a.id!==b.id&&Math.hypot(a.x-b.x,a.y-b.y)<2*paso-1e-6){cercanos.add(a.id);cercanos.add(b.id);}}});
    for (const p of ptsBraille) for (const j of idxObjetos.vecinos(p.x,p.y)) {
      const q=ptsObjetos[j];if(Math.hypot(p.x-q.x,p.y-q.y)<despeje-1e-6)brailleCerca.add(p.id);
    }
    // Tramos de línea de 1 o 2 celdas: se confunden con puntos sueltos.
    const gx = grilla ? grilla.px : paso, gy = grilla ? grilla.py : paso;
    const porObjeto = new Map();
    for (const p of ptsObjetos) { if (!porObjeto.has(p.id)) porObjeto.set(p.id, new Set()); porObjeto.get(p.id).add(Math.round(p.x / gx) + ',' + Math.round(p.y / gy)); }
    for (const o of objetos) {
      if (!['linea', 'polilinea'].includes(o.tipo) || !o.linea || o.linea === 'ninguna') continue;
      const n = porObjeto.get(o.id) ? porObjeto.get(o.id).size : 0;
      if (n >= 1 && n <= 2) lista.push({ nivel:'aviso', id:o.id, mensaje:`${o.nombre}: la línea ocupa solo ${n} celda${n > 1 ? 's' : ''} de la grilla y se confunde con puntos sueltos.` });
    }
    // Líneas casi paralelas de objetos distintos a menos de 5 mm (costoso: solo al apretar «Comprobar»).
    if (opciones && opciones.completo) {
      // Líneas discontinuas con tramos casi verticales u horizontales, apenas inclinados (3° a 12° del eje): el patrón se deforma.
      for (const o of objetos) {
        if (!['linea', 'polilinea', 'poligono', 'rectangulo'].includes(o.tipo) || !o.linea || o.linea === 'continua' || o.linea === 'ninguna') continue;
        const g = Objetos.geometria(o), cerr = o.tipo === 'poligono' || o.tipo === 'rectangulo' || !!o.cerrado;
        let peor = null;
        for (let i = 0; i < g.length - (cerr ? 0 : 1); i++) {
          const a = g[i], b = g[(i + 1) % g.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
          if (Math.hypot(dx, dy) < 12) continue;
          const ang = Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180 / Math.PI;
          if (ang >= 3 && ang <= 12 && (!peor || ang < peor)) peor = ang;
        }
        if (peor !== null) lista.push({ nivel:'info', id:o.id, mensaje:`${o.nombre}: línea discontinua con un tramo casi recto pero inclinado unos ${Math.round(peor)}°; en la grilla el patrón de trazos y huecos se deforma. Conviene enderezarla o usar línea continua.` });
      }
      for (const par of paralelasCercanas(objetos, grilla, 1.0, 5)) {
        lista.push({ nivel:'aviso', id:par.a.id, mensaje:`${par.a.nombre} y ${par.b.nombre}: líneas casi paralelas a ${par.dist.toFixed(1)} mm; conviene separarlas al menos 5 mm para distinguirlas.` });
      }
    } else if (objetos.filter(o => segmentosAjustados(o, grilla).length).length > 1) {
      lista.push({ nivel:'info', mensaje:'Apretá «Comprobar» para revisar también líneas casi paralelas a menos de 5 mm.' });
    }
    for (const id of cercanos) lista.push({ nivel:'aviso', id, mensaje:`Puntos de objetos distintos a menos de dos pasos de grilla.` });
    for (const id of brailleCerca) lista.push({ nivel:'aviso', id, mensaje:`Braille a menos de ${despeje} mm de un objeto.` });
    if (pagina.sinSeparacion) {
      // Hoja de prueba: las cercanías y la variedad de estilos son intencionales.
      const quedan = lista.filter(a => a.nivel === 'error' || !/casi paralelas|a menos de|estilos de línea|texturas|Apretá/.test(a.mensaje));
      quedan.push({ nivel:'info', mensaje:'Hoja de prueba: las distancias cortas y la variedad de estilos son intencionales y no se avisan.' });
      return quedan;
    }
    return lista;
  }

  /**
   * Agrupa avisos idénticos (mismo nivel y mismo texto) en uno solo con la cantidad.
   * Devuelve la lista ordenada por gravedad (error, aviso, info), conservando el orden
   * de aparición dentro de cada nivel. Si un aviso se repite, el texto gana «(N casos)»
   * y pierde el «id» (ya no apunta a un único elemento).
   */
  function agruparAvisos(lista) {
    const orden = { error: 0, aviso: 1, info: 2 };
    const mapa = new Map();
    for (const a of lista || []) {
      const k = a.nivel + '\u0001' + a.mensaje;
      if (!mapa.has(k)) mapa.set(k, { nivel: a.nivel, mensaje: a.mensaje, cuenta: 0, id: a.id });
      mapa.get(k).cuenta++;
    }
    const salida = [...mapa.values()].map(g => {
      if (g.cuenta > 1) {
        g.mensaje = g.mensaje.replace(/\.$/, '') + ` (${g.cuenta} casos).`;
        delete g.id;
      }
      return g;
    });
    return salida.sort((x, y) => (orden[x.nivel] ?? 9) - (orden[y.nivel] ?? 9));
  }

  const api = {
    MEDIDAS, medidasDePerfil, agruparAvisos, ajustarAGrilla, calcularCuadro, ubicarSegunTinta, partirEnRenglones,
    muestrearLinea, muestrearPoligono, muestrearRectangulo, muestrearTrayecto, muestrearElipse,
    paralelasCercanas, quitarDuplicados, ralear, quitarJuntos, calcularPagina, despejeEfectivo, listaParaExportar, margenesDeDiseno, avisos, rectCuadro, anchoRenglon
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Grilla = api;
})(typeof self !== 'undefined' ? self : this);
