/* Rótulos numerados: un clic pone un número braille (1, 2, 3…) como cuadro braille y arma una lista
   de referencias (la «clave de números») en la capa «claves», con un texto editable por número.
   Sirve para mapas con muchos lugares y poco espacio: en el mapa solo va el número y la clave dice qué es.
   El cálculo es puro (sirve en Node y en el navegador); abajo está la interfaz del panel. */
(function (raiz) {
  'use strict';
  const nodo = typeof module !== 'undefined' && module.exports;
  const Grilla = nodo ? require('./grilla.js') : raiz.Grilla;

  const OPCIONES = { mayusculas: 'signo', palabraMayusculas: 'doble' };
  const ANCHO_CLAVE = 140;      // mm: ancho máximo de un renglón de la clave
  const DESPEJE = 6;            // mm entre la clave y lo demás (como la clave de muestras)
  const techoGrilla = (v, paso) => Math.ceil(v / paso - 1e-9) * paso;
  const pisoGrilla = (v, paso) => Math.floor(v / paso + 1e-9) * paso;
  const red = n => Math.round(n * 1000) / 1000;

  const esRotulo = c => !!c && Number.isInteger(c.numerado) && c.numerado > 0;
  const esEntrada = c => !!c && Number.isInteger(c.claveNumero) && c.claveNumero > 0;

  /** Números en uso en la página, ordenados (un número repetido cuenta una vez). */
  function numerosUsados(pagina) {
    return [...new Set((pagina.cuadros || []).filter(esRotulo).map(c => c.numerado))].sort((a, b) => a - b);
  }
  /** El primer número libre empezando desde 1 (rellena huecos). */
  function siguienteNumero(pagina) {
    const usados = new Set(numerosUsados(pagina));
    let n = 1;
    while (usados.has(n)) n++;
    return n;
  }

  /** Cuadro braille del rótulo: solo el número, que ya sale con su signo de número. */
  function nuevoRotulo(n, x, y, ctx) {
    return { id: ctx.nuevoId('c'), texto: String(n), x: red(x), y: red(y), tinta: null, alineacion: 'libre',
      capa: 'rotulos', numerado: n, descripcion: ctx.descripcion != null ? ctx.descripcion : 'Lugar ' + n,
      nombre: 'Rótulo ' + n, opciones: Object.assign({}, OPCIONES) };
  }

  /** Lista (n, descripción) de los rótulos, para mostrar y editar. */
  function referencias(pagina) {
    const vistos = new Set(), lista = [];
    for (const c of pagina.cuadros || []) {
      if (!esRotulo(c) || vistos.has(c.numerado)) continue;
      vistos.add(c.numerado);
      lista.push({ n: c.numerado, id: c.id, descripcion: c.descripcion || '' });
    }
    return lista.sort((a, b) => a.n - b.n);
  }

  /**
   * Arma las entradas de la clave: un cuadro braille por número («1 Plaza»), en la capa «claves».
   * Las entradas que ya existen conservan su posición salvo que `reacomodar` sea verdadero.
   * ctx: { medidas, perfil, nuevoId, reacomodar }
   * Devuelve { cuadros (entradas), entra, y0, alto }; `entra` es falso si la clave se encima con el dibujo.
   */
  function construirClave(pagina, ctx) {
    const medidas = ctx.medidas, g = medidas.grilla || { px: 2, py: 2 }, px = g.px, py = g.py;
    const refs = referencias(pagina);
    if (!refs.length) return { cuadros: [], entra: true, y0: 0, alto: 0 };
    const viejas = new Map((pagina.cuadros || []).filter(esEntrada).map(c => [c.claveNumero, c]));
    const items = refs.map(r => {
      const previa = viejas.get(r.n);
      const texto = Grilla.partirEnRenglones(`${r.n} ${r.descripcion}`.trim(), ANCHO_CLAVE, medidas);
      const cuadro = { id: previa ? previa.id : ctx.nuevoId('c'), texto, x: 0, y: 0, tinta: null, alineacion: 'izquierda',
        capa: 'claves', claveNumero: r.n, nombre: 'Clave ' + r.n, opciones: Object.assign({}, OPCIONES) };
      return { r, previa, cuadro, calc: Grilla.calcularCuadro(cuadro, medidas) };
    });
    const mg = Grilla.margenesDeDiseno(ctx.perfil, pagina.ancho, pagina.alto);
    const x0 = techoGrilla(mg.izquierdo, px), gap = techoGrilla(py * 2, py);
    const alto = items.reduce((s, i) => s + i.calc.alto, 0) + gap * (items.length - 1);

    // Zona libre: arriba de la clave de muestras (si hay) y debajo de todo lo demás.
    const sinClaves = Object.assign({}, pagina, {
      objetos: (pagina.objetos || []).filter(o => !o.leyenda),
      cuadros: (pagina.cuadros || []).filter(c => !c.leyenda && !esEntrada(c))
    });
    let ocupadoHasta = -Infinity;
    for (const p of Grilla.calcularPagina(sinClaves, { medidas, separacionDibujo: 0 }).puntos) ocupadoHasta = Math.max(ocupadoHasta, p.y);
    let limite = pagina.alto - mg.inferior;
    const muestras = [...(pagina.cuadros || []).filter(c => c.leyenda).map(c => c.y), ...(pagina.objetos || []).filter(o => o.leyenda).map(o => (o.vertices && o.vertices[0] ? o.vertices[0][1] : o.y))];
    if (muestras.length) limite = Math.min(limite, Math.min(...muestras) - DESPEJE);
    const minimoY = Math.max(mg.superior, ocupadoHasta === -Infinity ? mg.superior : ocupadoHasta + DESPEJE);
    let y0 = pisoGrilla(limite - alto, py);
    const entra = y0 >= minimoY - 1e-6;
    if (y0 < mg.superior) y0 = techoGrilla(mg.superior, py);

    const distribuir = () => {   // todas juntas, de arriba hacia abajo
      let y = y0;
      return items.map(it => { it.cuadro.x = red(x0); it.cuadro.y = red(y); y = techoGrilla(y + it.calc.alto + gap, py); return it.cuadro; });
    };
    if (ctx.reacomodar || !items.some(i => i.previa)) return { cuadros: distribuir(), entra, y0, alto };
    // Las entradas que ya estaban conservan su lugar; las nuevas van debajo de la última.
    let base = Math.max(...items.filter(i => i.previa).map(i => i.previa.y + i.calc.alto)) + gap;
    base = techoGrilla(base, py);
    for (const it of items.filter(i => !i.previa)) {
      it.cuadro.x = red(items.find(i => i.previa).previa.x); it.cuadro.y = red(base);
      base = techoGrilla(base + it.calc.alto + gap, py);
    }
    for (const it of items.filter(i => i.previa)) { it.cuadro.x = it.previa.x; it.cuadro.y = it.previa.y; }
    if (base - gap > limite + 1e-6) return { cuadros: distribuir(), entra, y0, alto };   // no cabe: se reordena todo
    return { cuadros: items.map(i => i.cuadro), entra, y0, alto };
  }

  /** Aplica la clave a la página: reemplaza las entradas viejas por las nuevas. */
  function aplicarClave(pagina, r) {
    pagina.cuadros = (pagina.cuadros || []).filter(c => !esEntrada(c)).concat(r.cuadros);
    return pagina;
  }

  const api = { esRotulo, esEntrada, numerosUsados, siguienteNumero, nuevoRotulo, referencias, construirClave, aplicarClave, OPCIONES };
  if (nodo) { module.exports = api; return; }
  raiz.Numerados = api;

  // ------------------------------------------------------------ interfaz
  const App = raiz.App;
  if (!App || !raiz.document) return;
  const doc = raiz.document, $ = id => doc.getElementById(id);
  const lista = $('lista-numerados');
  if (!lista) return;
  const ctxBase = () => ({ medidas: App.medidas(), perfil: App.perfil, nuevoId: pre => App.nuevoId(pre) });

  function sincronizar(reacomodar) {
    const p = App.pagina();
    const r = construirClave(p, Object.assign(ctxBase(), { reacomodar: !!reacomodar }));
    aplicarClave(p, r);
    if (p.capasVisibles && p.capasVisibles.claves === false) delete p.capasVisibles.claves;
    return r;
  }

  function colocar(mm) {
    const p = App.pagina();
    const n = siguienteNumero(p), g = App.medidas().grilla || { px: 2, py: 2 };
    const x = Math.round(mm[0] / g.px) * g.px, y = Math.round(mm[1] / g.py) * g.py;
    App.registrar('Rótulo numerado ' + n);
    const c = nuevoRotulo(n, x, y, { nuevoId: pre => App.nuevoId(pre) });
    p.cuadros.push(c);
    const r = sincronizar(false);
    App.seleccionar('cuadro', c.id);
    App.cambio('numerados');
    const campo = lista.querySelector(`input[data-n="${n}"]`);
    if (campo) { campo.focus(); campo.select(); }
    App.anunciar(`Rótulo ${n} colocado en x ${x.toFixed(1)}, y ${y.toFixed(1)} mm. Escribí qué significa en el campo «Rótulo ${n}» del panel Rótulos numerados; se agrega a la clave.` +
      (r.entra ? '' : ' Atención: la clave de números se encima con el dibujo; movela o tocá «Acomodar clave».'));
    return c;
  }

  function quitar(n) {
    const p = App.pagina();
    App.registrar('Quitar rótulo ' + n);
    p.cuadros = p.cuadros.filter(c => c.numerado !== n && c.claveNumero !== n);
    sincronizar(false);
    App.ui.sel = null; App.ui.seleccion = [];
    App.cambio('numerados');
    App.anunciar(`Rótulo ${n} quitado de la hoja y de la clave.`);
  }

  function pintar() {
    const foco = doc.activeElement && doc.activeElement.dataset && doc.activeElement.dataset.n && lista.contains(doc.activeElement) ? doc.activeElement.dataset.n : null;
    const refs = referencias(App.pagina());
    lista.replaceChildren();
    if (!refs.length) {
      const li = doc.createElement('li');
      li.className = 'nota';
      li.textContent = 'Todavía no hay rótulos numerados en esta página.';
      lista.append(li);
      return;
    }
    for (const r of refs) {
      const li = doc.createElement('li');
      const et = doc.createElement('label');
      et.append(`Rótulo ${r.n} `);
      const inp = doc.createElement('input');
      inp.type = 'text'; inp.value = r.descripcion; inp.dataset.n = String(r.n);
      inp.setAttribute('aria-label', `Qué significa el rótulo ${r.n} (aparece en la clave)`);
      inp.addEventListener('change', () => {
        const p = App.pagina();
        App.registrar('Texto del rótulo ' + r.n);
        p.cuadros.filter(c => c.numerado === r.n).forEach(c => { c.descripcion = inp.value.trim(); });
        const k = sincronizar(false);
        App.cambio('numerados');
        App.anunciar(`Clave actualizada: ${r.n} ${inp.value.trim()}.` + (k.entra ? '' : ' Atención: la clave se encima con el dibujo.'));
      });
      et.append(inp);
      const q = doc.createElement('button');
      q.type = 'button'; q.textContent = 'Quitar';
      q.setAttribute('aria-label', `Quitar el rótulo ${r.n}`);
      q.addEventListener('click', () => quitar(r.n));
      li.append(et, q);
      lista.append(li);
    }
    if (foco) { const nuevo = lista.querySelector(`input[data-n="${foco}"]`); if (nuevo) nuevo.focus(); }
  }

  $('btn-numerado-centro').addEventListener('click', () => {
    const c = App.Lienzo && App.Lienzo.centroVisibleMm ? App.Lienzo.centroVisibleMm() : [App.pagina().ancho / 2, App.pagina().alto / 2];
    colocar(c);
  });
  $('btn-numerados-acomodar').addEventListener('click', () => {
    if (!referencias(App.pagina()).length) { App.anunciar('No hay rótulos numerados en esta página.'); return; }
    App.registrar('Acomodar la clave de números');
    const r = sincronizar(true);
    App.cambio('numerados');
    App.anunciar(`Clave de números acomodada abajo de la hoja.` + (r.entra ? '' : ' Atención: no hay lugar libre: se encima con el dibujo.'));
  });

  App.alCambiar(motivo => { if (motivo !== 'arrastre') pintar(); });
  pintar();

  if (App.grupoCinta) {
    App.grupoCinta('insertar', 'Rótulos numerados', [
      App.botonCinta({ id: 'btn-herr-numerar', texto: 'Rótulo numerado', icono: 'hash', atajo: 'N',
        titulo: 'Un clic en la hoja pone el próximo número braille y lo agrega a la clave (N)',
        alClic: () => App.elegirHerramienta('numerar') }),
      App.botonCinta({ id: 'btn-clave-numeros', texto: 'Acomodar clave', icono: 'list-ordered',
        titulo: 'Ordena la clave de números abajo de la hoja', alClic: () => $('btn-numerados-acomodar').click() })
    ]);
    const b = $('btn-herr-numerar');
    b.dataset.herramienta = 'numerar';
    b.setAttribute('aria-pressed', String(App.ui.herramienta === 'numerar'));
  }
  App.Numerados = { colocar, quitar, sincronizar };
})(typeof self !== 'undefined' ? self : this);
