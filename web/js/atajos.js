/* Atajos globales (Ctrl+S guardar, Ctrl+O abrir PDF, Ctrl+P imprimir) y ayuda de atajos (F1 o ?). */
(function () {
  'use strict';
  const App = window.App, $ = id => document.getElementById(id);
  const dlg = $('dlg-atajos');

  function abrirAyuda() {
    if (!dlg || dlg.open) return;
    dlg.showModal();
    const b = dlg.querySelector('button');
    if (b) b.focus();
    App.anunciar('Ayuda de atajos de teclado. Escape para cerrar.');
  }
  if (dlg) dlg.addEventListener('click', ev => { if (ev.target.closest('[data-cerrar]')) dlg.close(); });

  document.addEventListener('keydown', ev => {
    if (ev.key === 'F1') { ev.preventDefault(); abrirAyuda(); return; }
    // Ctrl+S y Ctrl+Mayús+S valen SIEMPRE (también con un trazo pendiente o un diálogo abierto) y
    // nunca dejan que el navegador abra su propio «Guardar página».
    const esS = ev.key.toLowerCase() === 's' || ev.code === 'KeyS';
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.shiftKey && esS) {
      ev.preventDefault(); ev.stopPropagation();
      Promise.resolve(App.guardarComo()).catch(e => App.avisarErrorGuardado('No se pudo guardar el proyecto.', e, null));
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey) {
      const k = ev.key.toLowerCase();
      if (esS) {
        ev.preventDefault(); ev.stopPropagation();
        Promise.resolve(App.guardarProyecto()).catch(e => App.avisarErrorGuardado('No se pudo guardar el proyecto.', e, null));
      }
      else if (k === 'o') { ev.preventDefault(); if (!document.querySelector('dialog[open]')) $('archivo-pdf').click(); }
      else if (k === 'p') {
        ev.preventDefault();   // evita el diálogo de impresión del navegador
        if (!document.querySelector('dialog[open]') && App.Principal) App.Principal.abrirImprimir(null);
      }
      return;
    }
    if (ev.key === '?' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !App.atajosBloqueados(ev)) { ev.preventDefault(); abrirAyuda(); }
  });

  if (App.botonCinta && App.grupoCinta) {
    const g = document.querySelector('#cinta-panel-archivo [aria-label="Programa"] .cinta-grupo-cuerpo');
    if (g) {
      const b = App.botonCinta({ id: 'btn-atajos', texto: 'Atajos', icono: 'keyboard',
        titulo: 'Ver los atajos de teclado (F1)', alClic: abrirAyuda });
      g.insertBefore(b, g.querySelector('#btn-salir'));
      if (window.Iconos) window.Iconos.aplicar(g);
    }
  }
  App.Atajos = { abrirAyuda };
})();
