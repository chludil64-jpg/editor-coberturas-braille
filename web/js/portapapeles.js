/* Copiar, cortar y pegar objetos y cuadros braille (Ctrl+C, Ctrl+X, Ctrl+V y menú de clic derecho),
   también entre páginas. El cálculo es puro (sirve en Node y en el navegador); abajo está la interfaz. */
(function (raiz) {
  'use strict';
  const nodo = typeof module !== 'undefined' && module.exports;
  const Objetos = nodo ? require('./objetos.js') : raiz.Objetos;
  const copiar = o => JSON.parse(JSON.stringify(o));
  const red = n => Math.round(n * 1000) / 1000;

  /** Arma el contenido del portapapeles con copias de los objetos y cuadros elegidos. */
  function capturar(pagina, idsObjetos, idsCuadros, indicePagina) {
    const objetos = (pagina.objetos || []).filter(o => (idsObjetos || []).includes(o.id)).map(copiar);
    const cuadros = (pagina.cuadros || []).filter(c => (idsCuadros || []).includes(c.id)).map(copiar);
    return { objetos, cuadros, origen: indicePagina == null ? -1 : indicePagina, pegadosEn: {} };
  }

  function vacio(b) { return !b || (!(b.objetos || []).length && !(b.cuadros || []).length); }

  /**
   * Cuánto se corre lo pegado. En la misma página que se copió, se desplaza dos pasos de grilla por
   * cada pegado (para que no se encimen); en otra página, el primero queda en la misma posición
   * (b.pegadosEn cuenta los pegados ya hechos en cada página).
   */
  function desplazamiento(b, indicePagina, paso) {
    const veces = (b.origen === indicePagina ? 1 : 0) + ((b.pegadosEn || {})[indicePagina] || 0);
    return [red(veces * 2 * paso[0]), red(veces * 2 * paso[1])];
  }

  /**
   * Copias nuevas listas para agregar a una página: ids nuevos, grupos renombrados (los que se
   * copiaron juntos siguen agrupados entre sí) y todo movido [dx, dy].
   * ctx: { nuevoId(prefijo), dx, dy, ordenBase }
   */
  function preparar(b, ctx) {
    const grupos = new Map();
    let orden = ctx.ordenBase || 0;
    const objetos = (b.objetos || []).map(o => {
      const n = Objetos.mover(o, ctx.dx || 0, ctx.dy || 0);
      n.id = ctx.nuevoId('o');
      if (n.grupo) {
        if (!grupos.has(n.grupo)) grupos.set(n.grupo, ctx.nuevoId('g'));
        n.grupo = grupos.get(n.grupo);
      }
      n.orden = orden++;
      return n;
    });
    const cuadros = (b.cuadros || []).map(c => {
      const n = copiar(c);
      n.id = ctx.nuevoId('c');
      if (ctx.dx || ctx.dy) { n.x = red((n.x || 0) + (ctx.dx || 0)); n.y = red((n.y || 0) + (ctx.dy || 0)); n.alineacion = 'libre'; }
      return n;
    });
    return { objetos, cuadros };
  }

  const api = { capturar, vacio, desplazamiento, preparar };
  if (nodo) { module.exports = api; return; }
  raiz.Portapapeles = api;

  // ------------------------------------------------------------ interfaz
  const App = raiz.App;
  if (!App || !raiz.document) return;
  const $ = id => raiz.document.getElementById(id);
  let buffer = null;

  const enCampo = t => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

  function idsElegidos() {
    const p = App.pagina();
    const objetos = (App.ui.seleccion || []).filter(id => (p.objetos || []).some(o => o.id === id));
    const cuadros = App.ui.sel && App.ui.sel.tipo === 'cuadro' && p.cuadros.some(c => c.id === App.ui.sel.id) ? [App.ui.sel.id] : [];
    return { objetos, cuadros };
  }

  function copiarSeleccion(cortar) {
    const ids = idsElegidos();
    if (!ids.objetos.length && !ids.cuadros.length) { App.anunciar(cortar ? 'No hay nada elegido para cortar.' : 'No hay nada elegido para copiar.'); return false; }
    const p = App.pagina();
    let aviso = '';
    if (cortar) {
      const bloqueados = (p.objetos || []).filter(o => ids.objetos.includes(o.id) && o.bloqueado).length
        + p.cuadros.filter(c => ids.cuadros.includes(c.id) && c.bloqueado).length;
      ids.objetos = ids.objetos.filter(id => !p.objetos.find(o => o.id === id).bloqueado);
      ids.cuadros = ids.cuadros.filter(id => !p.cuadros.find(c => c.id === id).bloqueado);
      if (!ids.objetos.length && !ids.cuadros.length) { App.anunciar('Los elementos elegidos están bloqueados: no se pueden cortar. Copiá o desbloqueá.'); return false; }
      if (bloqueados) aviso = ` ${bloqueados} elemento(s) bloqueado(s) no se cortaron.`;
    }
    buffer = capturar(p, ids.objetos, ids.cuadros, App.ui.pagina);
    const n = buffer.objetos.length + buffer.cuadros.length;
    if (cortar) {
      App.registrar('Cortar');
      p.objetos = p.objetos.filter(o => !ids.objetos.includes(o.id));
      p.cuadros = p.cuadros.filter(c => !ids.cuadros.includes(c.id));
      App.ui.sel = null; App.ui.seleccion = [];
      App.cambio('objetos');
    }
    App.anunciar(`${n} elemento(s) ${cortar ? 'cortados' : 'copiados'}.${aviso} Pegá con Control+V, también en otra página.`);
    return true;
  }

  function pegar() {
    if (vacio(buffer)) { App.anunciar('No hay nada para pegar. Copiá o cortá un elemento primero.'); return false; }
    const p = App.pagina();
    const d = desplazamiento(buffer, App.ui.pagina, Objetos.pasos(App.medidas()));
    App.registrar('Pegar');
    const r = preparar(buffer, { nuevoId: pre => App.nuevoId(pre), dx: d[0], dy: d[1], ordenBase: (p.objetos || []).length });
    p.objetos.push(...r.objetos);
    p.cuadros.push(...r.cuadros);
    buffer.pegadosEn = buffer.pegadosEn || {};
    buffer.pegadosEn[App.ui.pagina] = (buffer.pegadosEn[App.ui.pagina] || 0) + 1;
    if (r.objetos.length) {
      App.ui.seleccion = r.objetos.map(o => o.id);
      App.ui.sel = { tipo: 'objeto', id: r.objetos.at(-1).id };
    } else { App.ui.seleccion = [r.cuadros[0].id]; App.ui.sel = { tipo: 'cuadro', id: r.cuadros[0].id }; }
    App.cambio('objetos');
    const n = r.objetos.length + r.cuadros.length;
    App.anunciar(`${n} elemento(s) pegados en la página ${App.ui.pagina + 1}${d[0] || d[1] ? ', corridos un poco' : ', en la misma posición'}. Control+Z los deshace.`);
    return true;
  }

  raiz.document.addEventListener('keydown', ev => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || enCampo(ev.target)) return;
    const k = ev.key.toLowerCase();
    if (!['c', 'x', 'v'].includes(k)) return;
    if (App.Lienzo && App.Lienzo.lazoActivo && App.Lienzo.lazoActivo()) return;
    // Si hay texto seleccionado en la página (por ejemplo en un aviso), se deja el copiado normal.
    if (k !== 'v' && String(raiz.getSelection ? raiz.getSelection() : '').trim()) return;
    ev.preventDefault();
    if (k === 'v') pegar(); else copiarSeleccion(k === 'x');
  });

  // Menú de clic derecho
  const menu = $('menu-contextual');
  if (menu) {
    menu.querySelectorAll('[data-portapapeles]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.portapapeles;
      if (a === 'pegar') pegar(); else copiarSeleccion(a === 'cortar');
    }));
    // Sin nada elegido (clic derecho en un lugar vacío) solo queda «Pegar».
    const ajustar = () => {
      const sinSel = !(App.ui.seleccion || []).length && !App.ui.sel;
      for (const el of menu.children) {
        if (el.classList.contains('solo-cuadro')) continue;
        const propio = el.hasAttribute('data-portapapeles') || el.classList.contains('sep-portapapeles');
        el.hidden = sinSel && !propio;
      }
      menu.querySelectorAll('[data-portapapeles="copiar"],[data-portapapeles="cortar"],.sep-portapapeles').forEach(b => { b.hidden = sinSel; });
    };
    if (App.MenuContextual) App.MenuContextual.alAbrir.push(ajustar);
  }

  // Botones de la cinta (Inicio)
  if (App.grupoCinta) {
    const mk = (id, texto, icono, titulo, f) => App.botonCinta({ id, texto, icono, titulo, alClic: f });
    App.grupoCinta('inicio', 'Portapapeles', [
      mk('btn-cortar', 'Cortar', 'scissors', 'Cortar los elementos elegidos (Control+X)', () => copiarSeleccion(true)),
      mk('btn-copiar', 'Copiar', 'copy', 'Copiar los elementos elegidos (Control+C)', () => copiarSeleccion(false)),
      mk('btn-pegar', 'Pegar', 'clipboard-paste', 'Pegar en la página actual (Control+V)', pegar)
    ], 'Edición');
  }

  App.Portapapeles = { copiarSeleccion, pegar, hayContenido: () => !vacio(buffer) };
})(typeof self !== 'undefined' ? self : this);
