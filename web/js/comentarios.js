/* Enviar un comentario, sugerencia o error por correo (Archivo > Programa y enlace en la ayuda F1).
   Abre el programa de correo con mailto: o copia la dirección si la PC no tiene uno configurado.
   Todo el texto se inserta con textContent. */
(function () {
  'use strict';
  const App = window.App, $ = id => document.getElementById(id);
  const CORREO = 'cienciachubut@gmail.com';
  const el = (tag, props, hijos) => {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    (hijos || []).forEach(h => e.append(h));
    return e;
  };

  let versionActual = '';
  const pedirVersion = () => App.api('/api/version')
    .then(r => { versionActual = r.version || ''; return versionActual; })
    .catch(() => versionActual);

  // Navegador y sistema en una línea corta (sin el userAgent completo).
  function navegadorCorto() {
    const ua = navigator.userAgent || '';
    const marcas = [['Edge', /Edg\/([\d.]+)/], ['Opera', /OPR\/([\d.]+)/], ['Firefox', /Firefox\/([\d.]+)/],
      ['Chrome', /Chrome\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/]];
    let nombre = 'Navegador desconocido';
    for (const [n, re] of marcas) {
      const m = ua.match(re);
      if (m) { nombre = `${n} ${m[1].split('.')[0]}`; break; }
    }
    const so = ((ua.match(/\(([^)]*)\)/) || [])[1] || '').split(';')[0].trim();
    return so ? `${nombre} (${so})` : nombre;
  }

  async function armarMailto() {
    const version = await pedirVersion();
    const asunto = version
      ? `Editor Braille ${version} – Comentario o sugerencia`
      : 'Editor Braille – Comentario o sugerencia';
    const cuerpo = 'Contanos tu comentario o sugerencia:\n\n\n---\n' +
      (version ? `Versión: ${version}\n` : '') +
      `Navegador: ${navegadorCorto()}`;
    return `mailto:${CORREO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  const titulo = el('h2', { id: 't-comentario', textContent: 'Envianos tu comentario' });
  const texto = el('p', { id: 'com-texto' }, [
    document.createTextNode('¿Tenés un comentario, una sugerencia o encontraste un error? Escribinos a '),
    el('strong', { textContent: CORREO }),
    document.createTextNode('.')
  ]);
  const btnCorreo = el('button', { type: 'button', className: 'destacado', textContent: 'Escribir correo' });
  const btnCopiar = el('button', { type: 'button', textContent: 'Copiar dirección' });
  const btnCerrar = el('button', { type: 'button', textContent: 'Cerrar' });
  const filaBotones = el('div', { className: 'fila botones' }, [btnCorreo, btnCopiar, btnCerrar]);
  const cuerpoDlg = el('div', { className: 'editor ancho-dlg' }, [titulo, texto, filaBotones]);
  const dlg = el('dialog', {}, [cuerpoDlg]);
  dlg.id = 'dlg-comentario';
  dlg.setAttribute('aria-labelledby', 't-comentario');
  document.body.append(dlg);

  function abrir() {
    if (dlg.open) return;
    dlg.showModal();
    btnCorreo.focus();
    pedirVersion();
    App.anunciar('Enviar un comentario. ¿Tenés un comentario, una sugerencia o encontraste un error? Escape para cerrar.');
  }

  btnCorreo.addEventListener('click', async () => {
    const href = await armarMailto();
    window.location.href = href;
    App.anunciar('Se abrió el programa de correo. Si no se abrió, usá Copiar dirección.');
  });

  btnCopiar.addEventListener('click', async () => {
    let copiado = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(CORREO);
        copiado = true;
      }
    } catch (e) { copiado = false; }
    if (!copiado) {
      // Alternativa para navegadores sin portapapeles asincrónico.
      const area = el('textarea', { value: CORREO });
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      try { copiado = document.execCommand('copy'); } catch (e) { copiado = false; }
      area.remove();
    }
    App.anunciar(copiado ? 'Dirección copiada' : `No se pudo copiar. La dirección es ${CORREO}`);
  });

  btnCerrar.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', ev => { if (ev.target === dlg) dlg.close(); });

  // Botón en Archivo > Programa, antes de «Cerrar».
  if (App.botonCinta) {
    const g = document.querySelector('#cinta-panel-archivo [aria-label="Programa"] .cinta-grupo-cuerpo');
    if (g) {
      const b = App.botonCinta({ id: 'btn-comentario', texto: 'Comentario', icono: 'message-square',
        titulo: 'Enviar un comentario, una sugerencia o reportar un error', alClic: abrir });
      g.insertBefore(b, g.querySelector('#btn-salir'));
      if (window.Iconos) window.Iconos.aplicar(g);
    }
  }

  // Enlace en la ayuda de atajos (F1).
  const ayuda = $('dlg-atajos');
  if (ayuda && !$('ayuda-comentario')) {
    const enlace = el('a', { id: 'ayuda-comentario', href: '#', textContent: 'Envianos tu comentario' });
    enlace.addEventListener('click', ev => {
      ev.preventDefault();
      ayuda.close();
      abrir();
    });
    const p = el('p', { className: 'nota' }, [document.createTextNode('¿Tenés una sugerencia o encontraste un error? '), enlace]);
    const botones = ayuda.querySelector('.botones');
    if (botones) botones.before(p); else ayuda.firstElementChild.append(p);
  }

  App.Comentarios = { abrir };
})();
