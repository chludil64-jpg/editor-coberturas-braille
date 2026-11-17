/* Cinta de opciones al estilo Word: pestañas Archivo, Inicio, Insertar, Formato, Dibujar, Ver e Impresora.
   No crea funciones nuevas: MUEVE los botones y controles que ya existen (con sus mismos ids y
   manejadores) a grupos dentro de cada pestaña. Las herramientas de dibujo se muestran como
   botones que activan los radios «herramienta» de siempre. */
(function () {
  'use strict';
  const App = window.App, $ = id => document.getElementById(id);
  const header = document.querySelector('header.barra');
  if (!header) return;

  const HERRAMIENTAS = [
    ['seleccionar', 'Elegir y mover', 'V'], ['linea', 'Línea'], ['polilinea', 'Polilínea'], ['poligono', 'Polígono'],
    ['rectangulo', 'Rectángulo'], ['elipse', 'Elipse'], ['punto', 'Punto'], ['mano', 'Mano alzada'],
    ['lazo', 'Lazo magnético', 'L'], ['editar-vertices', 'Editar vértices'], ['borrar-linea', 'Borrar línea'],
    ['tijera', 'Tijera'], ['goma', 'Goma'], ['medir', 'Medir', 'M']
  ];

  // Pestañas: [id, título, grupos]; cada grupo: [nombre, [ids de elementos existentes o marcadores]]
  const PESTANAS = [
    ['archivo', 'Archivo', [
      ['Documento', ['btn-abrir-pdf', 'btn-abrir-proyecto', 'btn-guardar-proyecto']],
      ['Disposición braille', ['btn-exportar-disposicion', 'btn-importar-disposicion']],
      ['Exportar', ['btn-exp-pdf', 'btn-exp-png', 'btn-exp-prn', 'btn-exp-ibe', 'btn-abrir-ibe']],
      ['Programa', ['btn-salir']]
    ]],
    ['inicio', 'Inicio', [
      ['Edición', ['btn-deshacer', 'btn-rehacer']],
      ['Herramienta', ['@seleccionar', '@lazo', '@medir']],
      ['Revisar', ['btn-comprobar']],
      ['Imprimir', ['btn-imprimir']]
    ]],
    ['insertar', 'Insertar', [
      ['Braille', ['btn-nuevo-cuadro']],
      ['Imágenes y mapas', ['btn-imagen', 'btn-svg', 'btn-calcar']]
    ]],
    ['formato', 'Formato', [
      ['Página nueva', ['btn-nueva-horizontal', 'btn-nueva-vertical']]
    ]],
    ['dibujar', 'Dibujar', [
      ['Elegir', ['@seleccionar']],
      ['Formas', ['@linea', '@polilinea', '@poligono', '@rectangulo', '@elipse', '@punto', '@mano']],
      ['Mapas', ['@lazo']],
      ['Medir', ['@medir']],
      ['Corregir', ['@editar-vertices', '@borrar-linea', '@tijera', '@goma', 'btn-unir-lineas']]
    ]],
    ['ver', 'Ver', [
      ['Fondo y marcas', ['#grupo-fondo']]
    ]],
    ['impresora', 'Impresora', [
      ['Imprimir', ['+imprimir']],
      ['Configuración', ['btn-perfil', 'btn-calibracion']]
    ]]
  ];

  const cinta = document.createElement('div');
  cinta.className = 'cinta';
  const lista = document.createElement('div');
  lista.className = 'cinta-pestanas';
  lista.setAttribute('role', 'tablist');
  lista.setAttribute('aria-label', 'Cinta de opciones');
  cinta.append(lista);

  function botonHerramienta(valor) {
    const def = HERRAMIENTAS.find(h => h[0] === valor);
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.herramienta = valor;
    b.textContent = def ? def[1] : valor;
    if (def && def[2]) b.setAttribute('aria-keyshortcuts', def[2]);
    b.setAttribute('aria-pressed', String(App.ui.herramienta === valor));
    b.addEventListener('click', () => App.elegirHerramienta && App.elegirHerramienta(valor));
    return b;
  }

  function elemento(ref) {
    if (ref.startsWith('@')) return botonHerramienta(ref.slice(1));
    if (ref === '+imprimir') {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Imprimir…';
      b.className = 'destacado';
      b.addEventListener('click', () => $('btn-imprimir') && $('btn-imprimir').click());
      return b;
    }
    const el = ref.startsWith('#') ? document.querySelector(`[data-cinta="${ref.slice(1)}"]`) : $(ref);
    if (!el) return null;
    // Los ítems venían de menús desplegables: vuelven a ser botones comunes.
    if (el.getAttribute('role') === 'menuitem') { el.removeAttribute('role'); el.removeAttribute('tabindex'); }
    return el;
  }

  const paneles = [];
  PESTANAS.forEach(([id, titulo, grupos], i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `cinta-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `cinta-panel-${id}`);
    tab.textContent = titulo;
    lista.append(tab);
    const panel = document.createElement('div');
    panel.id = `cinta-panel-${id}`;
    panel.className = 'cinta-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    for (const [nombre, refs] of grupos) {
      const g = document.createElement('div');
      g.className = 'cinta-grupo';
      g.setAttribute('role', 'group');
      g.setAttribute('aria-label', nombre);
      const cuerpo = document.createElement('div');
      cuerpo.className = 'cinta-grupo-cuerpo';
      for (const ref of refs) { const el = elemento(ref); if (el) cuerpo.append(el); }
      const etiqueta = document.createElement('div');
      etiqueta.className = 'cinta-grupo-nombre';
      etiqueta.setAttribute('aria-hidden', 'true');
      etiqueta.textContent = nombre;
      g.append(cuerpo, etiqueta);
      if (cuerpo.children.length) panel.append(g);
    }
    cinta.append(panel);
    paneles.push({ tab, panel, id });
    tab.addEventListener('click', () => activar(i, true));
  });

  function activar(i, enfocar) {
    paneles.forEach((p, j) => {
      const sel = i === j;
      p.tab.setAttribute('aria-selected', String(sel));
      p.tab.tabIndex = sel ? 0 : -1;
      p.panel.hidden = !sel;
    });
    if (enfocar) paneles[i].tab.focus();
    try { localStorage.setItem('cinta-pestana', paneles[i].id); } catch (e) { /* sin almacenamiento */ }
  }
  lista.addEventListener('keydown', ev => {
    const i = paneles.findIndex(p => p.tab === document.activeElement);
    if (i < 0) return;
    let j = null;
    if (ev.key === 'ArrowRight') j = (i + 1) % paneles.length;
    else if (ev.key === 'ArrowLeft') j = (i - 1 + paneles.length) % paneles.length;
    else if (ev.key === 'Home') j = 0;
    else if (ev.key === 'End') j = paneles.length - 1;
    if (j !== null) { ev.preventDefault(); activar(j, true); }
  });

  // La cinta reemplaza a la vieja fila de menús y botones del encabezado.
  const vieja = header.querySelector('.herramientas');
  if (vieja) vieja.hidden = true;
  header.append(cinta);
  // Rótulos cortos en la cinta; el nombre completo queda para el lector de pantalla y la ayuda emergente.
  const CORTOS = {
    'btn-abrir-proyecto': 'Abrir', 'btn-guardar-proyecto': 'Guardar', 'btn-nueva-horizontal': 'Horizontal',
    'btn-nueva-vertical': 'Vertical', 'btn-exportar-disposicion': 'Exportar', 'btn-importar-disposicion': 'Importar',
    'btn-exp-pdf': 'PDF 1:1', 'btn-exp-prn': '.prn', 'btn-exp-ibe': '.ibe', 'btn-abrir-ibe': 'Abrir .ibe', 'btn-salir': 'Cerrar'
  };
  for (const [id, corto] of Object.entries(CORTOS)) {
    const b = $(id);
    if (!b) continue;
    const completo = b.textContent.trim().replace(/\s+/g, ' ');
    b.setAttribute('aria-label', completo);
    b.title = completo;
    const nodos = [...b.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if (nodos.length) { nodos.forEach((n, i) => { n.textContent = i ? '' : corto; }); }
    else { const s = b.querySelector('span:not(.icono)'); if (s) s.textContent = corto; }
  }
  // Título y pestañas en un mismo renglón, para ganar alto de pantalla.
  const titulo = header.querySelector('h1');
  if (titulo) {
    const fila = document.createElement('div');
    fila.className = 'cinta-cabecera';
    cinta.insertBefore(fila, lista);
    fila.append(titulo, lista);
  }
  // Las herramientas ya están en la cinta: el grupo de radios del panel Crear queda oculto
  // (sigue existiendo: guarda qué herramienta está activa).
  const radios = document.querySelector('fieldset.herr-dibujo');
  if (radios) radios.hidden = true;

  let inicial = 1;
  try { const g = localStorage.getItem('cinta-pestana'); const k = paneles.findIndex(p => p.id === g); if (k >= 0) inicial = k; } catch (e) { /* nada */ }
  activar(inicial, false);

  // Ayudas para que otros módulos agreguen grupos y botones a la cinta (Portapapeles, Símbolos, Plantillas...).
  App.botonCinta = function (o) {
    const b = document.createElement('button');
    b.type = 'button';
    if (o.id) b.id = o.id;
    b.textContent = o.texto;
    if (o.icono) b.dataset.icono = o.icono;
    if (o.titulo) b.title = o.titulo;
    if (o.atajo) b.setAttribute('aria-keyshortcuts', o.atajo);
    if (o.alClic) b.addEventListener('click', o.alClic);
    return b;
  };
  App.grupoCinta = function (pestana, nombre, elementos, antesDe) {
    const panel = $(`cinta-panel-${pestana}`);
    if (!panel) return null;
    const g = document.createElement('div');
    g.className = 'cinta-grupo';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', nombre);
    const cuerpo = document.createElement('div');
    cuerpo.className = 'cinta-grupo-cuerpo';
    elementos.filter(Boolean).forEach(el => cuerpo.append(el));
    const et = document.createElement('div');
    et.className = 'cinta-grupo-nombre';
    et.setAttribute('aria-hidden', 'true');
    et.textContent = nombre;
    g.append(cuerpo, et);
    const ref = antesDe ? panel.querySelector(`.cinta-grupo[aria-label="${antesDe}"]`) : null;
    if (ref) panel.insertBefore(g, ref); else panel.append(g);
    if (window.Iconos) window.Iconos.aplicar(g);
    return g;
  };

  // Mantener marcado el botón de la herramienta activa (aunque se cambie con el teclado o Escape).
  document.querySelectorAll('input[name="herramienta"]').forEach(r => r.addEventListener('change', () => {
    document.querySelectorAll('[data-herramienta]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herramienta === r.value)));
  }));
  // Atajos de una letra (fuera de campos de texto): V = elegir y mover, L = lazo.
  document.addEventListener('keydown', ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || App.atajosBloqueados(ev)) return;
    if (ev.key === 'v' || ev.key === 'V') { App.elegirHerramienta('seleccionar'); }
    else if (ev.key === 'l' || ev.key === 'L') { App.elegirHerramienta('lazo'); }
    else if (ev.key === 'm' || ev.key === 'M') { App.elegirHerramienta('medir'); }
    else if (ev.key === 'n' || ev.key === 'N') { App.elegirHerramienta('numerar'); }
  });
})();
