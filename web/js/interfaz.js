/* Reorganización de la interfaz (se ejecuta después de cinta.js):
   - Paneles laterales desplegables (se recuerda cuáles están abiertos).
   - «Crear» pasa a «Opciones de la herramienta»: muestra solo lo que usa la herramienta activa.
   - Estilo de línea y relleno van a la pestaña Formato; las capas visibles, a la pestaña Ver.
   - Íconos de Lucide en la cinta y en el menú contextual.
   - Menú contextual ampliado para cuadros braille (partir en renglones, ubicar sobre la tinta).
   No crea funciones nuevas: mueve y muestra/oculta los controles existentes. */
(function () {
  'use strict';
  const App = window.App, $ = id => document.getElementById(id);
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const leer = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const contenedor = el => el && (el.closest('label') || el);

  // ------------------------------------------------------------ íconos
  const ICONOS = {
    'btn-nuevo-proyecto': 'file-plus', 'btn-guardar-como': 'save-all',
    'btn-abrir-pdf': 'file-up', 'btn-abrir-proyecto': 'folder-open', 'btn-guardar-proyecto': 'save',
    'btn-nueva-horizontal': 'rectangle-horizontal', 'btn-nueva-vertical': 'rectangle-vertical',
    'btn-exportar-disposicion': 'download', 'btn-importar-disposicion': 'upload',
    'btn-exp-pdf': 'file-down', 'btn-exp-png': 'image', 'btn-exp-prn': 'file-output', 'btn-exp-ibe': 'file-code',
    'btn-abrir-ibe': 'folder-input', 'btn-salir': 'power', 'btn-deshacer': 'undo-2', 'btn-rehacer': 'redo-2',
    'btn-comprobar': 'shield-check', 'btn-imprimir': 'printer', 'btn-nuevo-cuadro': 'type',
    'btn-imagen': 'image', 'btn-svg': 'shapes', 'btn-vectorizar': 'pen-tool', 'btn-calcar': 'scan-line', 'btn-perfil': 'settings',
    'btn-calibracion': 'ruler', 'btn-unir-lineas': 'link-2', 'btn-ralear': 'wand-sparkles',
    'btn-textos-pdf': 'text-cursor-input'
  };
  const ICONOS_HERR = {
    seleccionar: 'mouse-pointer-2', linea: 'minus', polilinea: 'spline', poligono: 'pentagon', rectangulo: 'square',
    elipse: 'circle', punto: 'dot', mano: 'pencil', lazo: 'lasso', 'editar-vertices': 'pen-tool',
    'borrar-linea': 'trash-2', tijera: 'scissors', goma: 'eraser', medir: 'ruler'
  };
  const ICONOS_MENU = {
    frente: 'arrow-up-to-line', atras: 'arrow-down-to-line', bloquear: 'lock', ocultar: 'eye-off', agrupar: 'group',
    desagrupar: 'ungroup', duplicar: 'copy', borrar: 'trash-2', izquierda: 'align-start-vertical',
    centro: 'align-center-vertical', derecha: 'align-end-vertical', arriba: 'align-start-horizontal',
    medio: 'align-center-horizontal', abajo: 'align-end-horizontal',
    'distribuir-h': 'align-horizontal-distribute-center', 'distribuir-v': 'align-vertical-distribute-center'
  };
  for (const [id, ic] of Object.entries(ICONOS)) { const el = $(id); if (el) el.dataset.icono = ic; }
  document.querySelectorAll('[data-herramienta]').forEach(b => { b.dataset.icono = ICONOS_HERR[b.dataset.herramienta] || 'dot'; });
  document.querySelectorAll('#menu-contextual [data-accion], #menu-contextual [data-alinear]').forEach(b => {
    b.dataset.icono = ICONOS_MENU[b.dataset.accion || b.dataset.alinear] || 'dot';
  });

  // ------------------------------------------------------------ cinta: grupos nuevos
  function grupoCinta(pestana, nombre, elementos, antesDe) {
    const panel = $(`cinta-panel-${pestana}`);
    if (!panel) return null;
    const g = document.createElement('div');
    g.className = 'cinta-grupo';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', nombre);
    const cuerpo = document.createElement('div');
    cuerpo.className = 'cinta-grupo-cuerpo';
    elementos.filter(Boolean).forEach(e => cuerpo.append(e));
    const et = document.createElement('div');
    et.className = 'cinta-grupo-nombre';
    et.setAttribute('aria-hidden', 'true');
    et.textContent = nombre;
    g.append(cuerpo, et);
    const ref = antesDe ? panel.querySelector(`[aria-label="${antesDe}"]`) : null;
    if (ref) panel.insertBefore(g, ref); else panel.append(g);
    return g;
  }
  // Formato → Estilo del dibujo: contorno y relleno (como «Contorno de forma» y «Relleno» de Word).
  const lineaLbl = contenedor($('estilo-linea')), rellenoLbl = contenedor($('estilo-relleno'));
  if (lineaLbl) lineaLbl.classList.add('cinta-campo');
  if (rellenoLbl) rellenoLbl.classList.add('cinta-campo');
  grupoCinta('formato', 'Estilo del dibujo', [lineaLbl, rellenoLbl]);
  // Formato → Puntos: ralear puntos demasiado juntos.
  grupoCinta('formato', 'Puntos', [$('btn-ralear')]);
  // Ver → Capas visibles.
  const capas = $('capas-controles');
  if (capas) { capas.classList.add('cinta-capas'); grupoCinta('ver', 'Capas visibles', [capas]); }
  // Insertar → acceso a los textos del PDF.
  const btnTextos = document.createElement('button');
  btnTextos.type = 'button';
  btnTextos.id = 'btn-textos-pdf';
  btnTextos.textContent = 'Braille desde los textos del PDF';
  btnTextos.dataset.icono = ICONOS['btn-textos-pdf'];
  btnTextos.addEventListener('click', () => {
    const sec = document.querySelector('[aria-labelledby="t-textos"]');
    const det = sec && sec.closest('details');
    if (det) det.open = true;
    if (sec) { sec.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    const primero = sec && sec.querySelector('input, button, select');
    if (primero) primero.focus();
  });
  const braille = $('cinta-panel-insertar') && $('cinta-panel-insertar').querySelector('[aria-label="Braille"] .cinta-grupo-cuerpo');
  if (braille) braille.append(btnTextos);
  if ($('btn-nuevo-cuadro')) $('btn-nuevo-cuadro').textContent = 'Cuadro braille';
  if ($('btn-unir-lineas')) { $('btn-unir-lineas').textContent = 'Unir líneas'; $('btn-unir-lineas').title = 'Unir dos líneas elegidas (Mayúscula + clic para elegir la segunda)'; }

  // ------------------------------------------------------------ opciones según la herramienta
  const crear = $('panel-crear');
  if (crear) {
    const h2 = crear.querySelector('h2');
    if (h2) h2.textContent = 'Opciones de la herramienta';
    // Qué herramientas usan cada bloque.
    const filaDe = id => $(id) && $(id).closest('.fila');
    const marcar = (el, herramientas) => { if (el) el.dataset.solo = herramientas.join(' '); };
    marcar(filaDe('lazo-significado'), ['lazo']);
    marcar(filaDe('lazo-intensidad'), ['lazo']);
    marcar(contenedor($('paso-dibujo')), ['linea', 'polilinea', 'poligono', 'rectangulo', 'elipse', 'mano']);
    marcar(contenedor($('radio-goma')), ['goma']);
    // Muestras a escala real: plegadas en un desplegable.
    const muestras = $('muestras-patrones');
    if (muestras) {
      const det = document.createElement('details');
      det.className = 'plegable-chico';
      const s = document.createElement('summary');
      s.textContent = 'Ver muestras de líneas y rellenos';
      muestras.before(det);
      det.append(s, muestras);
    }
    // Ayuda cuando la herramienta no tiene opciones.
    const ayuda = document.createElement('p');
    ayuda.className = 'nota';
    ayuda.id = 'ayuda-herramienta';
    crear.querySelector('h2').after(ayuda);
    const TEXTOS = {
      seleccionar: 'Hacé clic en un elemento para elegirlo; arrastralo para moverlo. Clic derecho: más acciones. Atajos: V elegir y mover, L lazo, M medir, Escape vuelve acá.',
      lazo: 'Hacé clic sobre el mapa de fondo: la línea se pega al borde. Arrastrá un punto para corregirlo; Ctrl+Z borra el último. Para terminar sin cerrar el circuito: Enter, doble clic, o clic derecho y «Terminar línea aquí» (hacen falta 2 puntos como mínimo). Para cerrar la forma: clic en el primer punto o «Cerrar forma» en el menú. Escape cancela. Con teclado: las flechas mueven el cursor y Enter fija un punto; Enter sin mover el cursor termina.',
      'editar-vertices': 'Arrastrá un vértice para moverlo; doble clic en un tramo agrega uno; Suprimir borra el elegido.',
      'borrar-linea': 'Clic sobre una línea para borrarla (Alt+clic borra solo ese tramo).',
      tijera: 'Clic sobre una línea para cortarla en dos en ese punto.',
      goma: 'Arrastrá sobre los puntos para borrarlos.',
      medir: 'Arrastrá sobre la hoja: se muestran la distancia (mm) y el ángulo. No crea nada. Con teclado: flechas mueven el cursor, Enter fija el primer y el segundo punto. M activa esta herramienta.'
    };
    function actualizar() {
      const h = App.ui.herramienta;
      crear.querySelectorAll('[data-solo]').forEach(el => { el.hidden = !el.dataset.solo.split(' ').includes(h); });
      ayuda.textContent = TEXTOS[h] || 'Elegí el estilo de línea y el relleno en la pestaña Dibujar.';
    }
    document.querySelectorAll('input[name="herramienta"]').forEach(r => r.addEventListener('change', actualizar));
    actualizar();
  }

  // ------------------------------------------------------------ paneles desplegables
  document.querySelectorAll('aside.panel > section').forEach((sec, i) => {
    const h = sec.querySelector(':scope > h2');
    if (!h || sec.id === 'panel-propiedades') return;
    const clave = 'panel-abierto-' + (sec.id || sec.getAttribute('aria-labelledby') || i);
    const det = document.createElement('details');
    det.className = 'plegable';
    const guardado = leer(clave);
    // Abierto por defecto la primera vez (después se recuerda lo que elija la persona).
    det.open = guardado === null ? true : guardado === '1';
    const sum = document.createElement('summary');
    sum.append(h);
    sec.before(det);
    det.append(sum, sec);
    det.addEventListener('toggle', () => guardar(clave, det.open ? '1' : '0'));
    // Si se oculta la sección (por ejemplo, «Crear» cuando hay algo elegido), se oculta el desplegable.
    new MutationObserver(() => { det.hidden = sec.hidden; }).observe(sec, { attributes: true, attributeFilter: ['hidden'] });
    det.hidden = sec.hidden;
  });

  // ------------------------------------------------------------ menú contextual para cuadros braille
  const menu = $('menu-contextual');
  if (menu) {
    const sep = document.createElement('div');
    sep.setAttribute('role', 'separator');
    sep.className = 'menu-separador solo-cuadro';
    const items = [['btn-partir', 'Partir en renglones', 'text-cursor-input'], ['btn-ubicar', 'Ubicar sobre la tinta', 'map']]
      .filter(([id]) => $(id)).map(([id, texto, ic]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.tabIndex = -1;
        b.className = 'solo-cuadro';
        b.dataset.icono = ic;
        b.textContent = texto;
        b.addEventListener('click', () => $(id).click());
        return b;
      });
    menu.prepend(...items, sep);
    // Al abrir: las opciones de cuadro solo se muestran si lo elegido es un cuadro braille.
    const ajustarCuadro = () => {
      const esCuadro = App.ui.sel && App.ui.sel.tipo === 'cuadro';
      menu.querySelectorAll('.solo-cuadro').forEach(el => { el.hidden = !esCuadro; });
    };
    if (App.MenuContextual) App.MenuContextual.alAbrir.push(ajustarCuadro);
  }

  // ------------------------------------------------------------ barra de estado (como en Fusion)
  // Una sola línea fina abajo: mensaje, coordenadas, total de puntos y botón «Avisos (n)»
  // que despliega la lista solo cuando se la pide.
  const pie = document.querySelector('footer.pie-avisos');
  const seccion = pie && pie.querySelector('section');
  if (pie && seccion) {
    const barra = document.createElement('div');
    barra.className = 'barra-estado';
    const izq = document.createElement('div');
    izq.className = 'barra-estado-mensaje';
    const medio = document.createElement('div');
    medio.className = 'barra-estado-datos';
    ['estado-lienzo'].forEach(id => $(id) && izq.append($(id)));
    ['cursor-mm', 'total-puntos'].forEach(id => $(id) && medio.append($(id)));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-avisos';
    btn.className = 'barra-estado-avisos';
    btn.dataset.icono = 'triangle-alert';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'panel-avisos');
    const txt = document.createElement('span');
    txt.textContent = 'Avisos ';
    btn.append(txt);
    if ($('avisos-cuenta')) btn.append($('avisos-cuenta'));
    seccion.id = 'panel-avisos';
    seccion.classList.add('panel-avisos');
    seccion.hidden = true;
    const titulo = $('t-avisos');
    if (titulo) titulo.textContent = 'Avisos';
    barra.append(izq, medio, btn);
    pie.append(barra);
    const abrir = abrirlo => {
      seccion.hidden = !abrirlo;
      btn.setAttribute('aria-expanded', String(abrirlo));
      if (abrirlo) { const f = seccion.querySelector('button, [tabindex]'); if (f) f.focus(); }
    };
    btn.addEventListener('click', () => abrir(seccion.hidden));
    seccion.addEventListener('keydown', ev => { if (ev.key === 'Escape') { abrir(false); btn.focus(); } });
    if ($('btn-comprobar')) $('btn-comprobar').addEventListener('click', () => abrir(true));
    // El botón se pinta según haya avisos o errores.
    const marcar = () => {
      const c = ($('avisos-cuenta') && $('avisos-cuenta').textContent) || '';
      const n = parseInt((c.match(/\d+/) || ['0'])[0], 10);
      btn.dataset.estado = /error/.test(c) ? 'error' : n > 0 ? 'aviso' : 'ok';
    };
    if ($('avisos-cuenta')) new MutationObserver(marcar).observe($('avisos-cuenta'), { childList: true, characterData: true, subtree: true });
    marcar();
  }

  if (window.Iconos) window.Iconos.aplicar(document);
})();
