/* Ventana «Historial de cambios»: lista los pasos hechos (con el nombre de la acción) y permite volver
   a uno anterior —o avanzar a uno deshecho— con un clic. Se abre desde Inicio → Edición. */
(function () {
  'use strict';
  const App = window.App, $ = id => document.getElementById(id);
  const dlg = $('dlg-historial'), lista = $('historial-lista');
  if (!dlg || !lista) return;

  function pintar(enfocarActual) {
    const t = App.lineaDeTiempo();
    lista.replaceChildren();
    t.estados.forEach((e, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const futuro = i > t.actual;
      b.textContent = i === 0 ? e.nombre : `${i}. ${e.nombre}`;
      b.dataset.paso = String(i);
      if (futuro) { b.classList.add('historial-futuro'); b.textContent += ' (deshecho)'; }
      if (i === t.actual) { b.setAttribute('aria-current', 'step'); b.textContent += ' (estás acá)'; }
      b.addEventListener('click', () => {
        if (i === t.actual) { App.anunciar('Ya estás en ese paso.'); return; }
        const nombre = e.nombre;
        App.irAPaso(i);
        pintar(true);
        App.anunciar(`${i < t.actual ? 'Se volvió' : 'Se avanzó'} al paso ${i}: ${nombre}. Control+Z y Control+Y siguen funcionando.`);
      });
      li.append(b);
      lista.append(li);
    });
    const hay = t.estados.length > 1;
    $('historial-vacio').hidden = hay;
    const actual = lista.querySelector('[aria-current="step"]');
    if (actual) { if (enfocarActual) actual.focus(); actual.scrollIntoView({ block: 'nearest' }); }
  }

  function abrir() {
    pintar(false);
    dlg.showModal();
    const actual = lista.querySelector('[aria-current="step"]') || lista.querySelector('button');
    if (actual) actual.focus();
    App.anunciar(`Historial de cambios: ${App.lineaDeTiempo().estados.length - 1} pasos. Elegí uno para volver a ese punto.`);
  }

  if (App.grupoCinta) {
    const g = document.querySelector('#cinta-panel-inicio [aria-label="Edición"] .cinta-grupo-cuerpo');
    const b = App.botonCinta({ id: 'btn-historial', texto: 'Historial', icono: 'history',
      titulo: 'Ver la lista de pasos y volver a uno anterior', alClic: abrir });
    if (g) { g.append(b); if (window.Iconos) window.Iconos.aplicar(g); }
  }
  App.Historial = { abrir };
})();
