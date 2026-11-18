/* Inspector de los paneles laterales: controles segmentados.
   Cada <select data-segmentado="iconos|texto|muestras"> se reemplaza a la vista por un grupo de
   botones (role="radiogroup"). El select queda oculto pero sigue siendo la fuente de verdad:
   el resto del programa lo lee y lo escribe como siempre (value y evento "change").
   Teclado: flechas, Inicio y Fin mueven y eligen (como un grupo de radios); solo un botón entra con Tab. */
(function () {
  'use strict';
  const App = window.App;
  const NS = 'http://www.w3.org/2000/svg';
  const grupos = [];

  // ---------------------------------------------------------------- muestras de patrones
  function el(nombre, atr) {
    const e = document.createElementNS(NS, nombre);
    for (const k in atr) e.setAttribute(k, atr[k]);
    return e;
  }
  function recorteDiagonal(x0, y0, x1, y1, c) {
    // Diagonales de pendiente -1 (y = c - x) recortadas al rectángulo.
    const xa = Math.max(x0, c - y1), xb = Math.min(x1, c - y0);
    return xa < xb ? [xa, c - xa, xb, c - xb] : null;
  }
  function muestra(tipo, valor) {
    const svg = el('svg', { viewBox: '0 0 28 14', width: 28, height: 14, 'aria-hidden': 'true', focusable: 'false', class: 'muestra-svg' });
    const trazo = { stroke: 'currentColor', fill: 'none', 'stroke-linecap': 'round' };
    if (tipo === 'linea') {
      if (valor === 'ninguna') {
        svg.append(el('line', Object.assign({ x1: 8, y1: 3, x2: 20, y2: 11, 'stroke-width': 1.6, opacity: .7 }, trazo)));
        svg.append(el('line', Object.assign({ x1: 20, y1: 3, x2: 8, y2: 11, 'stroke-width': 1.6, opacity: .7 }, trazo)));
      } else {
        const dash = { continua: null, punteada: '0.1 5', rayada: '5 3', puntoraya: '5 3 0.1 3' }[valor];
        const a = Object.assign({ x1: 3, y1: 7, x2: 25, y2: 7, 'stroke-width': valor === 'punteada' ? 3 : 2.4 }, trazo);
        if (dash) a['stroke-dasharray'] = dash;
        svg.append(el('line', a));
      }
      return svg;
    }
    // relleno
    const caja = { x: 4, y: 1.5, width: 20, height: 11, rx: 1.5, 'stroke-width': 1.4, stroke: 'currentColor', fill: 'none' };
    svg.append(el('rect', Object.assign({}, caja, valor === 'ninguno' ? { opacity: .55, 'stroke-dasharray': '2 2' } : {})));
    const fino = Object.assign({ 'stroke-width': 1.2 }, trazo);
    if (valor === 'ninguno') {
      svg.append(el('line', Object.assign({ x1: 9, y1: 11, x2: 19, y2: 3, opacity: .7 }, fino)));
    } else if (valor === 'reticula') {
      for (let x = 8; x < 24; x += 4) svg.append(el('line', Object.assign({ x1: x, y1: 1.5, x2: x, y2: 12.5 }, fino)));
      for (let y = 4.5; y < 12.5; y += 3) svg.append(el('line', Object.assign({ x1: 4, y1: y, x2: 24, y2: y }, fino)));
    } else if (valor === 'horizontales') {
      for (let y = 4.2; y < 12; y += 2.7) svg.append(el('line', Object.assign({ x1: 4, y1: y, x2: 24, y2: y }, fino)));
    } else if (valor === 'diagonales') {
      for (let c = 9; c < 36; c += 4.5) {
        const r = recorteDiagonal(4, 1.5, 24, 12.5, c);
        if (r) svg.append(el('line', Object.assign({ x1: r[0], y1: r[1], x2: r[2], y2: r[3] }, fino)));
      }
    } else if (valor === 'disperso') {
      [[8, 4], [13, 3.5], [19, 4.5], [10, 8], [16, 7.5], [21, 9], [7, 11], [14, 11], [18, 11.5]].forEach(p =>
        svg.append(el('circle', { cx: p[0], cy: p[1], r: 1.1, fill: 'currentColor' })));
    }
    return svg;
  }

  // ---------------------------------------------------------------- grupo segmentado
  function construir(select) {
    const modo = select.dataset.segmentado;
    const opciones = Array.from(select.options).filter(o => !o.hidden);
    const grupo = document.createElement('div');
    grupo.className = 'segmentado segmentado-' + modo;
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-label', select.dataset.rotuloGrupo || select.getAttribute('aria-label') || '');
    grupo.style.setProperty('--cols', String(opciones.length));
    const botones = opciones.map(o => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-boton';
      b.setAttribute('role', 'radio');
      b.dataset.valor = o.value;
      const nombre = o.title || o.textContent.trim();
      b.title = nombre;
      b.setAttribute('aria-label', nombre);
      if (modo === 'muestras') {
        b.append(muestra(select.dataset.patron, o.value));
      } else {
        if (o.dataset.ic && window.Iconos) b.insertAdjacentHTML('afterbegin', window.Iconos.svg(o.dataset.ic, 16));
        const t = document.createElement('span');
        t.className = 'seg-texto';
        t.textContent = o.dataset.corto || o.textContent.trim();
        t.setAttribute('aria-hidden', 'true');
        b.append(t);
      }
      b.addEventListener('click', () => elegir(b.dataset.valor));
      return b;
    });
    grupo.append(...botones);
    select.after(grupo);
    select.hidden = true;

    function elegir(valor) {
      if (select.disabled) return;
      if (select.value !== valor) {
        select.value = valor;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sincronizar();
    }
    function sincronizar() {
      const valor = select.value;
      const hay = botones.some(b => b.dataset.valor === valor);
      botones.forEach((b, i) => {
        const marcado = b.dataset.valor === valor;
        b.setAttribute('aria-checked', String(marcado));
        b.tabIndex = marcado || (!hay && i === 0) ? 0 : -1;
        b.disabled = select.disabled;
      });
      grupo.classList.toggle('desactivado', select.disabled);
    }
    grupo.addEventListener('keydown', ev => {
      const i = botones.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') j = (i + 1) % botones.length;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') j = (i - 1 + botones.length) % botones.length;
      else if (ev.key === 'Home') j = 0;
      else if (ev.key === 'End') j = botones.length - 1;
      if (j === null) return;
      ev.preventDefault();
      botones[j].focus();
      elegir(botones[j].dataset.valor);
    });
    select.addEventListener('change', sincronizar);
    grupos.push(sincronizar);
    sincronizar();
  }

  document.querySelectorAll('select[data-segmentado]').forEach(construir);
  const sincronizarTodos = () => grupos.forEach(f => f());
  if (App && App.alCambiar) App.alCambiar(() => { sincronizarTodos(); });
  // Los paneles se pintan en otros oyentes del mismo cambio: repetir al terminar el turno.
  if (App && App.alCambiar) App.alCambiar(() => { Promise.resolve().then(sincronizarTodos); });
  if (window.Iconos) window.Iconos.aplicar(document);
})();
