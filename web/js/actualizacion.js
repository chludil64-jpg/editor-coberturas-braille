/* Buscar actualizaciones (pestaña Archivo > Programa) y versión actual en la ayuda F1.
   Todo el texto viene del servidor local y se inserta con textContent. */
(function () {
  'use strict';
  const App = window.App;
  const el = (tag, props, hijos) => {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    (hijos || []).forEach(h => e.append(h));
    return e;
  };

  let versionActual = '';
  const cargarVersion = () => App.api('/api/version').then(r => {
    versionActual = r.version;
    const ayuda = document.getElementById('dlg-atajos');
    if (ayuda && !ayuda.querySelector('.version-programa')) {
      const p = el('p', { className: 'nota version-programa', textContent: `Versión del programa: ${r.version}` });
      const botones = ayuda.querySelector('.botones');
      if (botones) botones.before(p); else ayuda.firstElementChild.append(p);
    }
    return r;
  }).catch(() => null);
  cargarVersion();

  const titulo = el('h2', { id: 't-actualizacion', textContent: 'Buscar actualizaciones' });
  const texto = el('p', { id: 'act-texto' });
  const notas = el('p', { id: 'act-notas', className: 'nota' });
  const version = el('p', { id: 'act-version', className: 'nota' });
  const btnInstalar = el('button', { type: 'button', className: 'destacado', textContent: 'Instalar ahora' });
  const btnCerrar = el('button', { type: 'button', textContent: 'Cerrar' });
  const filaBotones = el('div', { className: 'fila botones' }, [btnInstalar, btnCerrar]);
  const cuerpo = el('div', { className: 'editor ancho-dlg' }, [titulo, texto, notas, version, filaBotones]);
  const dlg = el('dialog', {}, [cuerpo]);
  dlg.id = 'dlg-actualizacion';
  dlg.setAttribute('aria-labelledby', 't-actualizacion');
  document.body.append(dlg);

  let estado = 'cerrado', nueva = '';
  function mostrar(msg, { instalar = false, detalle = '', anuncio } = {}) {
    texto.textContent = msg;
    notas.textContent = detalle;
    notas.hidden = !detalle;
    version.textContent = versionActual ? `Versión instalada: ${versionActual}` : '';
    btnInstalar.hidden = !instalar;
    btnInstalar.disabled = false;
    btnCerrar.textContent = instalar ? 'Ahora no' : 'Cerrar';
    App.anunciar(anuncio || msg);
  }
  function abrir() { if (!dlg.open) dlg.showModal(); }

  async function buscar() {
    estado = 'buscando';
    mostrar('Buscando actualizaciones…');
    abrir();
    btnCerrar.focus();
    try {
      await cargarVersion();
      const r = await App.api('/api/actualizacion/buscar');
      if (r.actual) versionActual = r.actual;
      if (r.estado === 'sin_configurar') {
        estado = 'info';
        mostrar('No hay dirección de actualizaciones configurada.');
      } else if (r.estado === 'error') {
        estado = 'info';
        mostrar(/conexi/i.test(r.mensaje) ? 'Sin conexión. Revisá internet y probá de nuevo.' : r.mensaje);
      } else if (r.estado === 'nueva') {
        estado = 'oferta';
        nueva = r.nueva;
        mostrar(`Hay una versión nueva: ${r.nueva}.`, { instalar: true, detalle: r.notas ? `Novedades: ${r.notas}` : '' });
        btnInstalar.focus();
      } else {
        estado = 'info';
        mostrar(`Ya tenés la última versión (${r.actual}).`);
      }
    } catch (e) {
      estado = 'info';
      mostrar('Sin conexión con el programa: ' + e.message);
    }
  }

  btnInstalar.addEventListener('click', async () => {
    if (estado === 'oferta') {
      estado = 'confirmar';
      mostrar(`¿Instalar la versión ${nueva} ahora? El programa se va a cerrar y se vuelve a abrir solo. ` +
        'Conviene guardar el proyecto antes (Ctrl+S): lo que no esté guardado se pierde.',
      { instalar: true, detalle: App.sucio ? 'Atención: hay cambios sin guardar.' : '' });
      btnInstalar.textContent = 'Sí, instalar y reiniciar';
      btnCerrar.textContent = 'Cancelar';
      btnCerrar.focus();
      return;
    }
    if (estado !== 'confirmar') return;
    estado = 'instalando';
    btnInstalar.disabled = true;
    mostrar('Descargando e instalando la actualización… puede tardar unos minutos.');
    try {
      const r = await App.api('/api/actualizacion/instalar', { method: 'POST', json: {} });
      if (r.ok) {
        App.sucio = false;
        dlg.close();
        document.body.innerHTML = '<main style="padding:2rem"><h1>Actualizando…</h1><p>El programa se cierra y se vuelve a abrir solo en unos segundos. Después podés cerrar esta pestaña y usar la nueva ventana.</p></main>';
      } else {
        estado = 'info';
        mostrar(r.mensaje);
      }
    } catch (e) {
      estado = 'info';
      mostrar('No se pudo instalar: ' + e.message);
    }
  });
  btnCerrar.addEventListener('click', () => { if (estado !== 'instalando') dlg.close(); });
  dlg.addEventListener('cancel', ev => { if (estado === 'instalando') ev.preventDefault(); });
  dlg.addEventListener('close', () => { estado = 'cerrado'; btnInstalar.textContent = 'Instalar ahora'; });

  if (App.botonCinta) {
    const g = document.querySelector('#cinta-panel-archivo [aria-label="Programa"] .cinta-grupo-cuerpo');
    if (g) {
      g.insertBefore(App.botonCinta({ id: 'btn-actualizar', texto: 'Actualizar', icono: 'download',
        titulo: 'Buscar actualizaciones', alClic: buscar }), g.querySelector('#btn-atajos, #btn-salir'));
      if (window.Iconos) window.Iconos.aplicar(g);
    }
  }
  App.Actualizacion = { buscar };
})();
