/* Menú contextual de elementos: clic derecho sobre la hoja o sobre la lista de elementos
   (con teclado: tecla de menú o Mayús+F10). Las acciones son los mismos botones
   data-accion / data-alinear que maneja editor_objetos.js. */
(function () {
  'use strict';
  const App = window.App, menu = document.getElementById('menu-contextual');
  if (!menu) return;
  let origen = null;
  const alAbrir = [];   // funciones que ajustan qué ítems se muestran, antes de enfocar el primero
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')].filter(b => !b.hidden && !b.closest('[hidden]:not(#menu-contextual)'));

  function abrir(x, y, desde) {
    origen = desde || document.activeElement;
    menu.hidden = false;
    for (const f of alAbrir) { try { f(); } catch (e) { console.error(e); } }
    // Que no se salga de la ventana.
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
    const primero = items()[0];
    if (primero) primero.focus();
    App.anunciar('Menú de acciones abierto. Flechas para elegir, Enter para aplicar, Escape para cerrar.');
  }
  function cerrar(devolverFoco) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (devolverFoco && origen && origen.focus) origen.focus();
  }

  menu.addEventListener('keydown', ev => {
    const lista = items(), i = lista.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { lista[(i + 1) % lista.length].focus(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { lista[(i - 1 + lista.length) % lista.length].focus(); ev.preventDefault(); }
    else if (ev.key === 'Home') { lista[0].focus(); ev.preventDefault(); }
    else if (ev.key === 'End') { lista.at(-1).focus(); ev.preventDefault(); }
    else if (ev.key === 'Escape' || ev.key === 'Tab') { cerrar(true); ev.preventDefault(); }
  });
  // Al elegir una acción (el botón ya hace su trabajo), se cierra el menú.
  menu.addEventListener('click', ev => { if (ev.target.closest('[role="menuitem"]')) cerrar(true); });
  document.addEventListener('pointerdown', ev => { if (!menu.hidden && !menu.contains(ev.target)) cerrar(false); });
  window.addEventListener('blur', () => cerrar(false));

  // Lista de elementos del panel: clic derecho sobre un elemento lo elige y abre el menú.
  const lista = document.getElementById('lista-elementos');
  if (lista) {
    lista.addEventListener('contextmenu', ev => {
      const b = ev.target.closest('[data-elemento]');
      if (!b) return;
      ev.preventDefault();
      b.click();
      abrir(ev.clientX, ev.clientY, b);
    });
  }
  // Teclado: tecla de menú o Mayús+F10 sobre el lienzo o la lista.
  document.addEventListener('keydown', ev => {
    if (!(ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10'))) return;
    const en = document.activeElement;
    if (!en || !(en.id === 'lienzo' || en.closest('#lista-elementos'))) return;
    if (!(App.ui.seleccion || []).length && !App.ui.sel) { App.anunciar('Primero elegí un elemento.'); return; }
    ev.preventDefault();
    const r = en.getBoundingClientRect();
    abrir(r.left + 20, r.top + 20, en);
  });

  App.MenuContextual = { abrir, cerrar, alAbrir };
})();
