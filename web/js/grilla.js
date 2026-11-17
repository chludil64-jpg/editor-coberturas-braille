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
        if (op.separacionDibujo > 0 && rects.some(r => distanciaARect(p[0],p[1],r) < op.separacionDibujo)) {
          quitados++; continue;
        }
        if (tapado(o, p[0], p[1])) continue;
        puntos.push({ x:p[0], y:p[1], origen:'objeto', id:o.id });
      }
    }
    for (const t of pagina.trazos || []) {
      for (const p of t.puntos) {
        if (op.separacionDibujo > 0 &&
          rects.some(r => distanciaARect(p[0], p[1], r) < op.separacionDibujo)) {
          quitados++;
          continue;
        }
        puntos.push({ x: p[0], y: p[1], origen: 'dibujo', id: t.id });
      }
    }
    const g = op.medidas && op.medidas.grilla;
    if (g) {
      // Ajuste a la grilla de la impresora: lo que se ve es lo que se imprime.
      const vistos = new Set();
      const ajustados = [];
      for (const p of puntos) {
        const [x, y] = ajustarAGrilla(p.x, p.y, g);
        const k = Math.round(x / g.px) + ',' + Math.round(y / g.py);
        if (vistos.has(k)) continue;
        vistos.add(k);
        ajustados.push({ x, y, origen: p.origen, id: p.id });
      }
      return { puntos: ajustados, cuadros, quitados };
    }
    return { puntos, cuadros, quitados };
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
  function avisos(pagina, calculo, perfil) {
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
      if (cerrado && (b.ancho < 6 || b.alto < 6)) lista.push({ nivel:'aviso', id:o.id, mensaje:`${o.nombre}: forma cerrada menor a 6 mm.` });
      if (b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H) lista.push({ nivel:'error', id:o.id, mensaje:`${o.nombre}: queda fuera de la hoja.` });
      else if (b.x0 < mg.izquierdo || b.y0 < mg.superior || b.x1 > W-mg.derecho || b.y1 > H-mg.inferior)
        lista.push({ nivel:'aviso', id:o.id, mensaje:`${o.nombre}: invade la zona no imprimible.` });
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
    const idxObjetos=indice(ptsObjetos.map(p=>[p.x,p.y]),Math.max(2*paso,3));
    ptsObjetos.forEach((a,i)=>{for(const j of idxObjetos.vecinos(a.x,a.y)) {if(j<=i)continue;const b=ptsObjetos[j];
      if(a.id!==b.id&&Math.hypot(a.x-b.x,a.y-b.y)<2*paso-1e-6){cercanos.add(a.id);cercanos.add(b.id);}}});
    for (const p of ptsBraille) for (const j of idxObjetos.vecinos(p.x,p.y)) {
      const q=ptsObjetos[j];if(Math.hypot(p.x-q.x,p.y-q.y)<3-1e-6)brailleCerca.add(p.id);
    }
    for (const id of cercanos) lista.push({ nivel:'aviso', id, mensaje:`Puntos de objetos distintos a menos de dos pasos de grilla.` });
    for (const id of brailleCerca) lista.push({ nivel:'aviso', id, mensaje:`Braille a menos de 3 mm de un objeto.` });
    return lista;
  }

  const api = {
    MEDIDAS, medidasDePerfil, ajustarAGrilla, calcularCuadro, ubicarSegunTinta, partirEnRenglones,
    muestrearLinea, muestrearPoligono, muestrearRectangulo, muestrearTrayecto, muestrearElipse,
    quitarDuplicados, ralear, quitarJuntos, calcularPagina, listaParaExportar, margenesDeDiseno, avisos, rectCuadro, anchoRenglon
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Grilla = api;
})(typeof self !== 'undefined' ? self : this);
