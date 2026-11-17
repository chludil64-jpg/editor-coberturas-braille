/* Biblioteca de símbolos táctiles vectoriales (flecha norte, escala gráfica, capital, ciudad, punto de
   interés, escuela, puente, río, ruta). Cada símbolo es un conjunto de objetos editables comunes
   (líneas, polígonos, elipses...) agrupados, así que se pueden mover, escalar, rotar o editar vértice a vértice.
   Tamaño mínimo: 6 mm (un símbolo más chico no se distingue al tacto; ver docs/investigacion_graficos_tactiles.md).
   El cálculo es puro (sirve en Node y en el navegador); abajo está la interfaz de la cinta. */
(function (raiz) {
  'use strict';
  const nodo = typeof module !== 'undefined' && module.exports;
  const Objetos = nodo ? require('./objetos.js') : raiz.Objetos;
  const TAM_MIN = 6, TAM_DEFECTO = 8;
  const red = n => Math.round(n * 1000) / 1000;

  const L = (...p) => ({ t: 'linea', p });
  const PL = (...p) => ({ t: 'polilinea', p });
  const PG = (...p) => ({ t: 'poligono', p });
  const RE = (u, v, w, h) => ({ t: 'rectangulo', r: [u, v, w, h] });
  const EL = (u, v, w, h) => ({ t: 'elipse', r: [u, v, w, h] });
  const PU = (u, v) => ({ t: 'punto', p: [[u, v]] });

  // Coordenadas en una caja de 0 a 1 (y hacia abajo); `ancho` y `alto` son múltiplos del tamaño elegido.
  const SIMBOLOS = [
    { id: 'flecha-norte', nombre: 'Flecha norte', corto: 'Norte', ancho: 0.75, alto: 1.25,
      formas: [L([0.5, 1], [0.5, 0]), PL([0.12, 0.38], [0.5, 0], [0.88, 0.38])] },
    { id: 'escala', nombre: 'Escala gráfica', corto: 'Escala', ancho: 2.5, alto: 0.6,
      formas: [L([0, 0.6], [1, 0.6]), L([0, 0.1], [0, 0.9]), L([0.5, 0.3], [0.5, 0.9]), L([1, 0.1], [1, 0.9])] },
    { id: 'capital', nombre: 'Capital', corto: 'Capital', ancho: 1, alto: 1,
      formas: [EL(0, 0, 1, 1), EL(0.25, 0.25, 0.5, 0.5), PU(0.5, 0.5)] },
    { id: 'ciudad', nombre: 'Ciudad', corto: 'Ciudad', ancho: 1, alto: 1,
      formas: [RE(0, 0, 1, 1), PU(0.5, 0.5)] },
    { id: 'interes', nombre: 'Punto de interés', corto: 'Interés', ancho: 1, alto: 1,
      formas: [PG([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]), PU(0.5, 0.5)] },
    { id: 'escuela', nombre: 'Escuela', corto: 'Escuela', ancho: 1, alto: 1,
      formas: [PG([0, 0.45], [0.5, 0], [1, 0.45], [1, 1], [0, 1]), L([0.5, 1], [0.5, 0.62])] },
    { id: 'puente', nombre: 'Puente', corto: 'Puente', ancho: 1.25, alto: 1,
      formas: [L([0.2, 0], [0.2, 1]), L([0.8, 0], [0.8, 1]), L([0, 0.32], [1, 0.32]), L([0, 0.68], [1, 0.68])] },
    { id: 'rio', nombre: 'Río', corto: 'Río', ancho: 1.5, alto: 0.7,
      formas: [PL([0, 0.5], [0.17, 0.1], [0.34, 0.9], [0.5, 0.1], [0.66, 0.9], [0.83, 0.1], [1, 0.5])] },
    { id: 'ruta', nombre: 'Ruta', corto: 'Ruta', ancho: 2, alto: 0.6,
      formas: [Object.assign(PL([0, 0.85], [0.4, 0.5], [0.7, 0.55], [1, 0.1]), { estilo: { linea: 'puntoraya' } })] }
  ];

  const LISTA = SIMBOLOS.map(s => ({ id: s.id, nombre: s.nombre, corto: s.corto }));
  const buscar = id => SIMBOLOS.find(s => s.id === id);
  const tamValido = t => Math.max(TAM_MIN, Number(t) || TAM_DEFECTO);

  /** Formas del símbolo en coordenadas de 0 a 1 (sirve para dibujar una miniatura). */
  function esquema(id) {
    const s = buscar(id);
    if (!s) throw new Error('Símbolo desconocido: ' + id);
    return { ancho: s.ancho, alto: s.alto, formas: s.formas };
  }

  /**
   * Objetos de un símbolo centrado en (x, y) mm.
   * op: { x, y, tam (mm, mínimo 6), nuevoId(prefijo), ordenBase, medidas (para ajustar a la grilla), hoja: [ancho, alto] }
   * Devuelve { objetos, caja: {x0,y0,x1,y1,ancho,alto}, tam }.
   */
  function construir(id, op) {
    const s = buscar(id);
    if (!s) throw new Error('Símbolo desconocido: ' + id);
    const tam = tamValido(op.tam);
    const w = s.ancho * tam, h = s.alto * tam;
    const paso = op.medidas ? Objetos.pasos(op.medidas) : [0, 0];
    const ajustar = (v, p) => (p > 0 ? Math.round(v / p) * p : v);
    let x0 = ajustar((op.x || 0) - w / 2, paso[0]), y0 = ajustar((op.y || 0) - h / 2, paso[1]);
    if (op.hoja) {   // que quede dentro de la hoja
      x0 = Math.max(0, Math.min(x0, ajustar(op.hoja[0] - w, paso[0]) - (paso[0] > 0 && ajustar(op.hoja[0] - w, paso[0]) > op.hoja[0] - w ? paso[0] : 0)));
      y0 = Math.max(0, Math.min(y0, ajustar(op.hoja[1] - h, paso[1]) - (paso[1] > 0 && ajustar(op.hoja[1] - h, paso[1]) > op.hoja[1] - h ? paso[1] : 0)));
    }
    x0 = red(x0); y0 = red(y0);
    const grupo = op.nuevoId('g');
    const px = u => red(x0 + u * w), py = v => red(y0 + v * h);
    let orden = op.ordenBase || 0;
    const objetos = s.formas.map(f => {
      const base = { id: op.nuevoId('o'), nombre: s.nombre, capa: 'dibujo', grupo, orden: orden++,
        linea: (f.estilo && f.estilo.linea) || 'continua', relleno: 'ninguno' };
      if (f.t === 'rectangulo' || f.t === 'elipse') {
        return Objetos.crearObjeto(f.t, Object.assign(base, { x: px(f.r[0]), y: py(f.r[1]), ancho: red(f.r[2] * w), alto: red(f.r[3] * h) }));
      }
      if (f.t === 'punto') return Objetos.crearObjeto('punto', Object.assign(base, { x: px(f.p[0][0]), y: py(f.p[0][1]) }));
      return Objetos.crearObjeto(f.t, Object.assign(base, { vertices: f.p.map(q => [px(q[0]), py(q[1])]), cerrado: f.t === 'poligono' }));
    });
    const cajas = objetos.map(Objetos.caja);
    const caja = { x0: Math.min(...cajas.map(c => c.x0)), y0: Math.min(...cajas.map(c => c.y0)), x1: Math.max(...cajas.map(c => c.x1)), y1: Math.max(...cajas.map(c => c.y1)) };
    caja.ancho = red(caja.x1 - caja.x0); caja.alto = red(caja.y1 - caja.y0);
    return { objetos, caja, tam };
  }

  const api = { TAM_MIN, TAM_DEFECTO, LISTA, esquema, construir, tamValido };
  if (nodo) { module.exports = api; return; }
  raiz.Simbolos = api;

  // ------------------------------------------------------------ interfaz (grupo «Símbolos» en Insertar)
  const App = raiz.App;
  if (!App || !raiz.document || !App.grupoCinta) return;
  const doc = raiz.document;

  /** Miniatura en SVG con el mismo trazo que los demás íconos de la cinta. */
  function miniatura(id) {
    const e = esquema(id), ns = 'http://www.w3.org/2000/svg';
    const sv = doc.createElementNS(ns, 'svg');
    sv.setAttribute('class', 'icono');
    sv.setAttribute('viewBox', '0 0 24 24');
    sv.setAttribute('width', '18'); sv.setAttribute('height', '18');
    sv.setAttribute('fill', 'none'); sv.setAttribute('stroke', 'currentColor');
    sv.setAttribute('stroke-width', '2'); sv.setAttribute('stroke-linecap', 'round'); sv.setAttribute('stroke-linejoin', 'round');
    sv.setAttribute('aria-hidden', 'true'); sv.setAttribute('focusable', 'false');
    const k = 20 / Math.max(e.ancho, e.alto), dx = 2 + (20 - e.ancho * k) / 2, dy = 2 + (20 - e.alto * k) / 2;
    const X = u => (dx + u * e.ancho * k).toFixed(2), Y = v => (dy + v * e.alto * k).toFixed(2);
    for (const f of e.formas) {
      let el;
      if (f.t === 'rectangulo' || f.t === 'elipse') {
        el = doc.createElementNS(ns, f.t === 'rectangulo' ? 'rect' : 'ellipse');
        if (f.t === 'rectangulo') { el.setAttribute('x', X(f.r[0])); el.setAttribute('y', Y(f.r[1])); el.setAttribute('width', (f.r[2] * e.ancho * k).toFixed(2)); el.setAttribute('height', (f.r[3] * e.alto * k).toFixed(2)); }
        else { el.setAttribute('cx', X(f.r[0] + f.r[2] / 2)); el.setAttribute('cy', Y(f.r[1] + f.r[3] / 2)); el.setAttribute('rx', (f.r[2] * e.ancho * k / 2).toFixed(2)); el.setAttribute('ry', (f.r[3] * e.alto * k / 2).toFixed(2)); }
      } else if (f.t === 'punto') {
        el = doc.createElementNS(ns, 'circle');
        el.setAttribute('cx', X(f.p[0][0])); el.setAttribute('cy', Y(f.p[0][1])); el.setAttribute('r', '0.8'); el.setAttribute('fill', 'currentColor');
      } else {
        el = doc.createElementNS(ns, f.t === 'poligono' ? 'polygon' : 'polyline');
        el.setAttribute('points', f.p.map(q => X(q[0]) + ',' + Y(q[1])).join(' '));
        if (f.estilo && f.estilo.linea === 'puntoraya') el.setAttribute('stroke-dasharray', '4 2 1 2');
      }
      sv.append(el);
    }
    return sv;
  }

  function insertar(id) {
    const s = buscar(id);
    const tam = tamValido(doc.getElementById('simbolo-tam').value);
    const c = App.Lienzo && App.Lienzo.centroVisibleMm ? App.Lienzo.centroVisibleMm() : [App.pagina().ancho / 2, App.pagina().alto / 2];
    const p = App.pagina();
    const r = construir(id, { x: c[0], y: c[1], tam, nuevoId: pre => App.nuevoId(pre), ordenBase: (p.objetos || []).length, medidas: App.medidas(), hoja: [p.ancho, p.alto] });
    App.registrar('Insertar símbolo: ' + s.nombre);
    p.objetos.push(...r.objetos);
    App.EditorObjetos.seleccionar(r.objetos[0].id, false);
    const aviso = Number(doc.getElementById('simbolo-tam').value) < TAM_MIN ? ` El tamaño mínimo es ${TAM_MIN} mm, se usó ese.` : '';
    App.anunciar(`${s.nombre} insertado, ${String(r.caja.ancho).replace('.', ',')} por ${String(r.caja.alto).replace('.', ',')} mm, en x ${r.caja.x0.toFixed(1)}, y ${r.caja.y0.toFixed(1)}. Movelo con las flechas o el mouse; Control+Z lo deshace.${aviso}`);
  }

  const botones = LISTA.map(s => {
    const b = App.botonCinta({ texto: s.corto, titulo: `Insertar símbolo táctil: ${s.nombre}`, alClic: () => insertar(s.id) });
    b.setAttribute('aria-label', `Insertar símbolo: ${s.nombre}`);
    b.dataset.simbolo = s.id;
    b.prepend(miniatura(s.id));
    return b;
  });
  const campo = doc.createElement('label');
  campo.className = 'cinta-campo';
  campo.append('Tamaño (mm) ');
  const tam = doc.createElement('input');
  tam.type = 'number'; tam.id = 'simbolo-tam'; tam.min = String(TAM_MIN); tam.max = '60'; tam.step = '1'; tam.value = String(TAM_DEFECTO);
  tam.setAttribute('aria-describedby', 'simbolo-tam-ayuda');
  campo.append(tam);
  const ayuda = doc.createElement('small');
  ayuda.id = 'simbolo-tam-ayuda';
  ayuda.className = 'solo-lector';
  ayuda.textContent = `Mínimo ${TAM_MIN} mm: un símbolo más chico no se distingue al tacto.`;
  campo.append(ayuda);
  const g = App.grupoCinta('insertar', 'Símbolos', [campo, ...botones]);
  if (g) g.classList.add('cinta-grupo-simbolos');
  App.Simbolos = { insertar };
})(typeof self !== 'undefined' ? self : this);
