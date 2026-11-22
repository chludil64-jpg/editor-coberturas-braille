/* Asistente «Preparar impresora»: detecta la Index por USB, crea la cola de Windows con el
   controlador que ya trae el sistema (un solo pedido de permiso) y ofrece una hoja de prueba.
   Todo el texto que viene del servidor se inserta con textContent. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);
  const dlg = $('dlg-preparar');
  if (!App || !dlg) return;

  let diag = null;
  let ocupado = false;

  function estado(texto) {
    $('prep-estado').textContent = texto;
    App.anunciar(texto);
  }

  function ocupar(si) {
    ocupado = si;
    ['btn-prep-detectar', 'btn-prep-preparar', 'btn-prep-prueba', 'btn-prep-red-probar', 'btn-prep-usar'].forEach(id => {
      const b = $(id);
      if (b) b.disabled = si || b.dataset.bloqueado === '1';
    });
    $('prep-cargando').hidden = !si;
    dlg.setAttribute('aria-busy', String(si));
  }

  function bloquear(id, si) {
    const b = $(id);
    b.dataset.bloqueado = si ? '1' : '0';
    b.disabled = si || ocupado;
  }

  function resultado(texto, clase) {
    const p = $('prep-resultado');
    p.textContent = texto;
    p.className = 'estado ' + (clase || '');
  }

  function mostrarColas(colas) {
    const sel = $('prep-colas');
    sel.innerHTML = '';
    for (const c of colas) {
      const o = document.createElement('option');
      o.value = c.nombre;
      o.textContent = `${c.nombre} (${c.puerto || 'sin puerto'})`;
      sel.append(o);
    }
    $('prep-colas-fila').hidden = colas.length === 0;
  }

  function aplicarDiagnostico(d) {
    diag = d;
    const disp = (d.dispositivos || []).find(x => x.puerto) || (d.dispositivos || [])[0];
    const colas = [].concat(...(d.dispositivos || []).map(x => x.colas || []), d.otras_colas || []);
    mostrarColas(colas);
    bloquear('btn-prep-preparar', true);
    bloquear('btn-prep-prueba', true);
    bloquear('btn-prep-usar', colas.length === 0);
    let texto;
    switch (d.estado) {
      case 'lista':
        texto = `Ya hay una impresora lista en Windows: ${colas[0] ? '«' + colas[0].nombre + '»' : 'la Index'}. No hace falta crear otra. Elegila abajo y probá imprimir.`;
        bloquear('btn-prep-prueba', false);
        break;
      case 'falta_cola':
        texto = `Se encontró la ${disp.nombre} conectada en ${disp.puerto}. Falta crear la impresora en Windows: usá el botón del paso 3.`;
        bloquear('btn-prep-preparar', false);
        break;
      case 'desconectada':
        texto = `Windows conoce una Index${disp && disp.puerto ? ' (' + disp.puerto + ')' : ''}, pero ahora no está conectada o está apagada. Encendela, revisá el cable USB y volvé a buscar.`;
        break;
      case 'error':
        texto = d.mensaje || 'No se pudo consultar a Windows.';
        break;
      default:
        texto = 'No se encontró ninguna Index por USB. Revisá que esté encendida y que el cable esté bien conectado; después buscá de nuevo.';
    }
    resultado(texto, d.estado === 'lista' || d.estado === 'falta_cola' ? 'ok' : 'aviso');
    estado(texto);
  }

  async function detectar() {
    ocupar(true);
    resultado('Buscando la impresora…');
    try {
      aplicarDiagnostico(await App.api('/api/impresora/detectar'));
    } catch (e) {
      resultado('No se pudo buscar: ' + e.message, 'aviso');
    }
    ocupar(false);
  }

  async function recargarPerfil() {
    try { App.perfil = await App.api('/api/perfil'); } catch (e) { /* se sigue */ }
  }

  async function preparar() {
    ocupar(true);
    resultado('Windows va a pedir permiso de administrador. Aceptalo para crear la impresora…');
    App.anunciar('Windows va a pedir permiso de administrador.');
    try {
      const r = await App.api('/api/impresora/preparar', { method: 'POST', json: {} });
      resultado(r.mensaje || (r.ok ? 'Impresora lista.' : 'No se pudo preparar la impresora.'), r.ok ? 'ok' : 'aviso');
      App.anunciar(r.mensaje || '');
      if (r.ok) {
        await recargarPerfil();
        bloquear('btn-prep-preparar', true);
        bloquear('btn-prep-prueba', false);
      }
    } catch (e) {
      resultado('No se pudo preparar la impresora: ' + e.message, 'aviso');
    }
    ocupar(false);
  }

  async function usarCola() {
    const nombre = $('prep-colas').value;
    if (!nombre) return;
    ocupar(true);
    try {
      await App.api('/api/impresora/usar', { method: 'POST', json: { nombre } });
      await recargarPerfil();
      resultado(`Se eligió «${nombre}» como impresora del programa.`, 'ok');
      App.anunciar(`Impresora elegida: ${nombre}.`);
      bloquear('btn-prep-prueba', false);
    } catch (e) {
      resultado('No se pudo elegir la impresora: ' + e.message, 'aviso');
    }
    ocupar(false);
  }

  /* Hoja de prueba chica: una fila de puntos y otra más corta, en 70 × 20 mm. */
  function cargaPrueba() {
    const puntos = [];
    for (let x = 10; x <= 60; x += 4) puntos.push([x, 6]);
    for (let x = 10; x <= 30; x += 4) puntos.push([x, 12]);
    return { puntos, ancho: 70, alto: 20, solo_ajuste: true, nombre: 'hoja_prueba_impresora', perfil: App.perfil };
  }

  function imprimirPrueba() {
    dlg.close();
    App.Principal.abrirImprimir(cargaPrueba(), 'Hoja de prueba de la impresora (una fila de puntos)');
  }

  async function probarRed() {
    const ip = $('prep-ip').value.trim();
    if (!ip) { resultado('Escribí la dirección IP de la impresora.', 'aviso'); return; }
    ocupar(true);
    resultado('Probando la conexión…');
    try {
      const r = await App.api('/api/impresora/probar-red', { method: 'POST', json: { ip, puerto: Number($('prep-puerto').value) || 9100 } });
      resultado(r.mensaje, r.ok ? 'ok' : 'aviso');
      App.anunciar(r.mensaje);
      if (r.ok) {
        try {
          const perfil = Object.assign({}, App.perfil, { red: { ip, puerto: Number($('prep-puerto').value) || 9100 } });
          App.perfil = await App.api('/api/perfil', { method: 'POST', json: perfil });
        } catch (e) { /* la prueba igual sirvió */ }
      }
    } catch (e) {
      resultado('No se pudo probar: ' + e.message, 'aviso');
    }
    ocupar(false);
  }

  async function abrirDescargas() {
    try {
      await App.api('/api/impresora/abrir-descargas', { method: 'POST', json: {} });
      App.anunciar('Se abrió la página oficial de descargas de Index en el navegador.');
    } catch (e) {
      resultado('No se pudo abrir la página: ' + e.message, 'aviso');
    }
  }

  function abrir() {
    if ($('dlg-imprimir').open) $('dlg-imprimir').close();
    $('prep-resultado').textContent = '';
    $('prep-resultado').className = 'estado';
    $('prep-estado').textContent = '';
    $('prep-colas-fila').hidden = true;
    bloquear('btn-prep-preparar', true);
    bloquear('btn-prep-prueba', true);
    bloquear('btn-prep-usar', true);
    ocupar(false);
    dlg.showModal();
    $('btn-prep-detectar').focus();
    detectar();
  }

  $('btn-prep-detectar').addEventListener('click', detectar);
  $('btn-prep-preparar').addEventListener('click', preparar);
  $('btn-prep-usar').addEventListener('click', usarCola);
  $('btn-prep-prueba').addEventListener('click', imprimirPrueba);
  $('btn-prep-red-probar').addEventListener('click', probarRed);
  $('btn-prep-descargas').addEventListener('click', abrirDescargas);
  ['btn-preparar-impresora', 'enlace-preparar-impresora'].forEach(id => {
    const b = $(id);
    if (b) b.addEventListener('click', abrir);
  });
  // No se cierra con Escape mientras Windows está trabajando.
  dlg.addEventListener('cancel', ev => { if (ocupado) ev.preventDefault(); });

  App.PrepararImpresora = { abrir, cargaPrueba };
})();
