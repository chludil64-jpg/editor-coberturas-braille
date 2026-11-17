/* Clave o leyenda táctil: para una página arma, en la capa «claves», una muestra palpable de cada
   combinación de línea y relleno usada, con un cuadro braille al lado que dice qué significa.
   La parte de cálculo es pura (sirve en Node y en el navegador); abajo está el botón de la cinta. */
(function (raiz) {
  'use strict';
  const nodo = typeof module !== 'undefined' && module.exports;
  const Objetos = nodo ? require('./objetos.js') : raiz.Objetos;
  const Grilla = nodo ? require('./grilla.js') : raiz.Grilla;

  const ANCHO_MUESTRA = 25, ALTO_MUESTRA = 12.5;   // mm mínimos (se redondean hacia arriba a la grilla)
  const DESPEJE = 6;                               // mm entre la muestra y su rótulo braille
  const GENERICOS = new Set(['linea', 'polilinea', 'poligono', 'rectangulo', 'elipse', 'punto', 'puntos']);
  const TIPOS = ['linea', 'polilinea', 'poligono', 'rectangulo', 'elipse'];
  const CERRADOS = ['poligono', 'rectangulo', 'elipse'];
  const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const techoGrilla = (v, paso) => Math.ceil(v / paso - 1e-9) * paso;
  const pisoGrilla = (v, paso) => Math.floor(v / paso + 1e-9) * paso;
  const red = n => Math.round(n * 1000) / 1000;

  /** Combinaciones distintas de línea/relleno usadas por los objetos visibles (sin contar la propia clave). */
  function combinaciones(pagina) {
    const mapa = new Map();
    for (const o of pagina.objetos || []) {
      if (o.oculto || o.leyenda || o.capa === 'claves' || !TIPOS.includes(o.tipo)) continue;
      if (pagina.capasVisibles && pagina.capasVisibles[o.capa] === false) continue;
      const cerrado = CERRADOS.includes(o.tipo) || !!o.cerrado;
      const linea = o.linea || 'continua';
      const relleno = cerrado && o.relleno && o.relleno !== 'ninguno' ? o.relleno : 'ninguno';
      if (linea === 'ninguna' && relleno === 'ninguno') continue;
      const clave = relleno === 'ninguno' ? 'L:' + linea : 'R:' + linea + '|' + relleno;
      if (!mapa.has(clave)) mapa.set(clave, { clave, linea, relleno, nombres: [] });
      const nombre = String(o.nombre || '').trim();
      const c = mapa.get(clave);
      if (nombre && !GENERICOS.has(sinTildes(nombre)) && !c.nombres.includes(nombre)) c.nombres.push(nombre);
    }
    return [...mapa.values()];
  }

  function rotulo(c) {
    if (c.nombres.length) return c.nombres.slice(0, 2).join(' / ').slice(0, 30);
    if (c.relleno === 'ninguno') return 'Línea ' + c.linea;
    return c.linea === 'ninguna' ? 'Relleno ' + c.relleno : 'Línea ' + c.linea + ' con relleno ' + c.relleno;
  }

  /** Quita de la página la clave anterior (para regenerarla sin duplicar). */
  function sinLeyenda(pagina) {
    return Object.assign({}, pagina, {
      objetos: (pagina.objetos || []).filter(o => !o.leyenda),
      cuadros: (pagina.cuadros || []).filter(c => !c.leyenda)
    });
  }

  /**
   * Arma la clave de la página.
   * ctx: { medidas, perfil, nuevoId(prefijo) }
   * Devuelve { objetos, cuadros, entra, combos, y0, alto }; si `entra` es falso no cabe abajo de la hoja.
   * Con ctx.enPaginaLibre = true se arma como si la página estuviera vacía (para una hoja aparte).
   */
  function construir(pagina, ctx) {
    const medidas = ctx.medidas, g = medidas.grilla || { px: 2, py: 2 };
    const limpia = sinLeyenda(pagina);
    const combos = combinaciones(limpia);
    const W = pagina.ancho, H = pagina.alto;
    const mg = Grilla.margenesDeDiseno(ctx.perfil, W, H);
    const px = g.px, py = g.py;
    const w = techoGrilla(ANCHO_MUESTRA, px), h = techoGrilla(ALTO_MUESTRA, py);
    const gap = DESPEJE;

    // Cuadros braille (sin ubicar) para saber cuánto miden.
    const items = combos.map(c => {
      const maxBraille = Math.max(30, 60);
      const texto = Grilla.partirEnRenglones(rotulo(c), maxBraille, medidas);
      const cuadro = { id: ctx.nuevoId('c'), texto, x: 0, y: 0, tinta: null, alineacion: 'izquierda', capa: 'claves',
        leyenda: true, opciones: { mayusculas: 'signo', palabraMayusculas: 'doble' } };
      const calc = Grilla.calcularCuadro(cuadro, medidas);
      return { c, cuadro, calc, ancho: w + gap + calc.ancho, alto: Math.max(h, calc.alto) };
    });
    if (!items.length) return { objetos: [], cuadros: [], entra: true, combos: 0, y0: 0, alto: 0 };

    const x0 = techoGrilla(mg.izquierdo, px), disponible = W - mg.derecho - x0;
    const itemAncho = Math.max(...items.map(i => i.ancho)), filaAlto = Math.max(...items.map(i => i.alto));
    const gapX = 2 * px + 2, gapY = DESPEJE;
    const columnas = Math.max(1, Math.floor((disponible + gapX) / (itemAncho + gapX)));
    const filas = Math.ceil(items.length / columnas);
    const alto = filas * filaAlto + (filas - 1) * gapY;

    // Zona libre: debajo de todo lo que ya hay (puntos ya ajustados a la grilla) más 6 mm de despeje.
    let ocupadoHasta = -Infinity;
    if (!ctx.enPaginaLibre) {
      const calc = Grilla.calcularPagina(limpia, { medidas, separacionDibujo: 0 });
      for (const p of calc.puntos) ocupadoHasta = Math.max(ocupadoHasta, p.y);
    }
    const limite = H - mg.inferior;
    const minimoY = Math.max(mg.superior, ocupadoHasta === -Infinity ? mg.superior : ocupadoHasta + DESPEJE);
    let y0 = pisoGrilla(limite - alto, py);                   // pegada al borde inferior
    const entra = y0 >= minimoY - 1e-6 && alto <= limite - mg.superior + 1e-6;
    if (!entra) y0 = techoGrilla(mg.superior, py);

    const objetos = [], cuadros = [], grupoPrefijo = 'g';
    items.forEach((it, i) => {
      const col = i % columnas, fila = Math.floor(i / columnas);
      const sx = red(x0 + col * techoGrilla(itemAncho + gapX, px)), sy = red(y0 + fila * techoGrilla(filaAlto + gapY, py));
      const grupo = ctx.nuevoId(grupoPrefijo);
      const base = { capa: 'claves', leyenda: true, grupo, linea: it.c.linea, relleno: it.c.relleno, orden: 1000 + i, nombre: 'Muestra: ' + rotulo(it.c) };
      if (it.c.relleno === 'ninguno') {
        const ym = red(sy + Math.round((it.alto / 2) / py) * py);
        objetos.push(Objetos.crearObjeto('linea', Object.assign({ id: ctx.nuevoId('o') }, base, { vertices: [[sx, ym], [red(sx + w), ym]] })));
      } else {
        const sy2 = red(sy + pisoGrilla((it.alto - h) / 2, py));
        objetos.push(Objetos.crearObjeto('rectangulo', Object.assign({ id: ctx.nuevoId('o') }, base, { x: sx, y: sy2, ancho: w, alto: h })));
      }
      // Rótulo braille a la derecha de la muestra, centrado en la altura de la fila.
      const bx = red(techoGrilla(sx + w + gap, px));
      const by = red(sy + pisoGrilla((it.alto - it.calc.alto) / 2, py));
      cuadros.push(Object.assign(it.cuadro, { x: bx, y: by }));
    });
    return { objetos, cuadros, entra, combos: items.length, y0, alto };
  }

  const api = { construir, combinaciones, rotulo, sinLeyenda, ANCHO_MUESTRA, ALTO_MUESTRA, DESPEJE };
  if (nodo) { module.exports = api; return; }
  raiz.Leyenda = api;

  // ------------------------------------------------------------ interfaz (botón en Insertar)
  const App = raiz.App;
  if (!App || !raiz.document) return;
  const $ = id => raiz.document.getElementById(id);

  function generar() {
    const p = App.pagina();
    const ctx = { medidas: App.medidas(), perfil: App.perfil, nuevoId: pre => App.nuevoId(pre) };
    const prueba = construir(p, ctx);
    if (!prueba.combos) { App.anunciar('No hay líneas ni rellenos en esta página para armar una clave.'); return; }
    App.registrar();
    if (prueba.entra) {
      const limpia = sinLeyenda(p);
      p.objetos = limpia.objetos.concat(prueba.objetos);
      p.cuadros = limpia.cuadros.concat(prueba.cuadros);
      if (p.capasVisibles && p.capasVisibles.claves === false) delete p.capasVisibles.claves;
      App.cambio('objetos');
      App.anunciar(`Clave armada abajo de la hoja, en la capa «claves»: ${prueba.combos} muestras con su rótulo braille. Ctrl+Z la deshace.`);
      return;
    }
    // No hay zona libre suficiente: la clave va en una hoja aparte, del mismo tamaño.
    const hoja = App.paginaVacia(p.ancho, p.alto, { nombre: 'Clave de ' + (p.nombre || 'la página ' + (App.ui.pagina + 1)) });
    const r = construir(hoja, Object.assign({ enPaginaLibre: true }, ctx));
    hoja.objetos = r.objetos;
    hoja.cuadros = r.cuadros;
    App.doc.paginas.push(hoja);
    App.ui.pagina = App.doc.paginas.length - 1;
    App.ui.sel = null;
    App.cambio('pagina');
    if (App.Lienzo && App.Lienzo.ajustarZoom) App.Lienzo.ajustarZoom();
    App.anunciar(`No hay lugar libre abajo de la hoja: la clave (${r.combos} muestras) se armó en una página nueva. Ctrl+Z la deshace.`);
  }

  const panel = $('cinta-panel-insertar');
  if (panel) {
    const btn = raiz.document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-clave';
    btn.textContent = 'Generar clave';
    btn.title = 'Arma una leyenda con una muestra táctil de cada línea y relleno usados, con su nombre en braille';
    btn.dataset.icono = 'shapes';
    btn.addEventListener('click', generar);
    const g = raiz.document.createElement('div');
    g.className = 'cinta-grupo';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', 'Clave');
    const cuerpo = raiz.document.createElement('div');
    cuerpo.className = 'cinta-grupo-cuerpo';
    cuerpo.append(btn);
    const et = raiz.document.createElement('div');
    et.className = 'cinta-grupo-nombre';
    et.setAttribute('aria-hidden', 'true');
    et.textContent = 'Clave';
    g.append(cuerpo, et);
    panel.append(g);
    if (raiz.Iconos) raiz.Iconos.aplicar(g);
  }
})(typeof self !== 'undefined' ? self : this);
