/* Diálogo «Importar SVG»: por defecto lo importa como DIBUJO (contornos visibles, respetando el orden
   de pintado). El agrupado por colores queda como «Modo mapa», plegado. */
(function () {
  'use strict';
  const App = window.App, $ = id => document.getElementById(id);
  let svgTexto = '', svg = null, dibujo = null, textos = [], contornosTexto = [];

  const significados = ['agua', 'tierra', 'costa', 'río', 'límite', 'ruta', 'símbolo', 'texto', 'ignorar'];
  const lineas = ['continua', 'punteada', 'rayada', 'puntoraya', 'ninguna'];
  const areas = ['ninguno', 'reticula', 'horizontales', 'diagonales', 'disperso'];
  const opcion = v => { const e = document.createElement('option'); e.value = e.textContent = v; return e; };
  const modoMapa = () => $('svg-modo-mapa').checked;

  function tabla() {
    const body = $('svg-tabla').tBodies[0];
    body.replaceChildren();
    svg.capas.forEach((c, i) => {
      const row = document.createElement('tr'), head = document.createElement('th'), sw = document.createElement('span');
      sw.className = 'img-muestra-color';
      sw.style.backgroundColor = `rgb(${c.color.join(',')})`;
      sw.setAttribute('aria-label', `Color ${c.color.join(', ')}`);
      head.append(sw, document.createTextNode(' ' + (c.kind === 'fill' ? 'Relleno' : c.kind === 'text' ? 'Texto' : 'Trazo')));
      row.append(head);
      const count = document.createElement('td');
      count.textContent = String(c.elementos.length);
      row.append(count);
      const mini = document.createElement('canvas');
      mini.width = 80; mini.height = 55; mini.setAttribute('role', 'img'); mini.setAttribute('aria-label', `Miniatura de capa ${i + 1}`);
      const g = mini.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 80, 55);
      const k = Math.min(78 / svg.anchoMm, 53 / svg.altoMm);
      g.strokeStyle = `rgb(${c.color.join(',')})`; g.lineWidth = 1.5;
      for (const e of c.elementos) {
        g.beginPath();
        e.puntos.forEach((p, j) => j ? g.lineTo(1 + p[0] * k, 1 + p[1] * k) : g.moveTo(1 + p[0] * k, 1 + p[1] * k));
        g.stroke();
      }
      const td = document.createElement('td');
      td.append(mini); row.append(td);
      const sig = document.createElement('select');
      sig.setAttribute('aria-label', `Significado de capa ${i + 1}`);
      sig.append(...significados.map(opcion)); sig.value = c.significado;
      const sty = document.createElement('select');
      sty.setAttribute('aria-label', `Estilo de capa ${i + 1}`);
      const refresh = () => {
        const list = ['agua', 'tierra'].includes(sig.value) ? areas : lineas;
        sty.replaceChildren(...list.map(opcion));
        sty.value = list.includes(c.estilo) ? c.estilo : list[0];
        c.estilo = sty.value;
      };
      sig.addEventListener('change', () => {
        c.significado = sig.value;
        c.estilo = window.SvgImportar.estiloInicial(sig.value, ['agua', 'tierra'].includes(sig.value) ? 'fill' : 'stroke');
        refresh();
      });
      sty.addEventListener('change', () => { c.estilo = sty.value; });
      refresh();
      const a = document.createElement('td'); a.append(sig); row.append(a);
      const b = document.createElement('td'); b.append(sty); row.append(b);
      body.append(row);
    });
  }


  // ------------------------------------------------------------ textos del SVG
  const modoTextos = () => $('svg-textos').value;
  let ctxMedir = null;
  const fuente = (px, fam, peso, estilo) => `${/italic|oblique/i.test(estilo || '') ? 'italic ' : ''}${peso || 'normal'} ${px}px ${fam ? fam + ', ' : ''}sans-serif`;
  function medir(texto, tam, fam, peso) {
    ctxMedir = ctxMedir || document.createElement('canvas').getContext('2d');
    ctxMedir.font = fuente(Math.max(1, tam), fam, peso);
    return ctxMedir.measureText(texto).width;
  }

  /** Dibuja los textos en un canvas oculto y los convierte a contornos (mm) con el vectorizador. */
  function textoAContornos(bloques) {
    const salida = [];
    for (const b of bloques) {
      const tam = Math.max(0.5, Math.min(...b.chunks.map(c => c.tam)));
      const marg = 0.4 * Math.max(...b.chunks.map(c => c.tam));
      const bx = b.x0 - marg, by = b.y0 - marg, bw = b.x1 - b.x0 + 2 * marg, bh = b.y1 - b.y0 + 2 * marg;
      const k = Math.min(Math.max(4, 64 / tam), 2400 / Math.max(bw, bh));
      const W = Math.max(8, Math.ceil(bw * k)), H = Math.max(8, Math.ceil(bh * k));
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
      for (const c of b.chunks) {
        g.font = fuente(c.tam * k, c.familia, c.peso, c.estilo);
        g.textAlign = c.anchor === 'middle' ? 'center' : c.anchor === 'end' ? 'right' : 'left';
        g.fillText(c.texto, (c.x - bx) * k, (c.y - by) * k);
      }
      const res = window.Vectorizar.vectorizar(g.getImageData(0, 0, W, H).data, W, H, { modo: 'contornos', areaMin: 4, suavizado: 0 });
      for (const t of res.trazos) salida.push({ puntos: t.puntos.map(p => [bx + p[0] / k, by + p[1] / k]), cerrado: true, orden: 0 });
    }
    return salida;
  }

  function opcionesCuadro() { return { mayusculas: 'signo', palabraMayusculas: 'doble' }; }

  /** Un cuadro braille por bloque de texto, en la capa «rotulos», ubicado sobre la tinta del SVG. */
  function cuadrosDeTextos(bloques, x, y) {
    const cuadros = []; let anchos = 0;
    for (const b of bloques) {
      const c = { id: App.nuevoId('c'), texto: b.texto, x: 0, y: 0, capa: 'rotulos', alineacion: b.alineacion, opciones: opcionesCuadro(),
        tinta: { x0: b.x0 + x, y0: b.y0 + y, x1: b.x1 + x, y1: b.y1 + y } };
      Grilla.ubicarSegunTinta(c, App.medidas());
      if (Grilla.calcularCuadro(c, App.medidas()).ancho > (b.x1 - b.x0) + 1) anchos++;
      cuadros.push(c);
    }
    return { cuadros, anchos };
  }

  function resumenTextos(cuadros, anchos) {
    return `${cuadros.length} ${cuadros.length === 1 ? 'texto convertido' : 'textos convertidos'} a braille` +
      (anchos ? `; ${anchos} ${anchos === 1 ? 'queda más ancho' : 'quedan más anchos'} que la tinta` : '') + '.';
  }

  function dibujoConTextos() {
    return modoTextos() === 'contorno' && contornosTexto.length ? { contornos: dibujo.contornos.concat(contornosTexto), zonas: dibujo.zonas } : dibujo;
  }

  const abrir = () => $('dlg-svg').showModal();
  $('btn-svg').addEventListener('click', abrir);
  if ($('btn-svg-menu')) $('btn-svg-menu').addEventListener('click', abrir);
  $('svg-cerrar').addEventListener('click', () => $('dlg-svg').close());

  function procesar() {
    if (!svgTexto) return;
    try {
      svg = window.SvgImportar.parsear(svgTexto, Number($('svg-ancho').value) || 100);
      dibujo = window.SvgDibujo.aDibujo(svg.elementos, { ancho: svg.anchoMm, alto: svg.altoMm });
      textos = modoTextos() === 'ignorar' ? [] : window.SvgTexto.extraerTextos(svgTexto, svg.anchoMm, { medir }).bloques;
      contornosTexto = modoTextos() === 'contorno' ? textoAContornos(textos) : [];
      App.ImportarDibujo.vistaPrevia($('svg-previa'), dibujoConTextos(), svg.anchoMm, svg.altoMm, modoTextos() === 'braille' ? textos : null);
      tabla();
      $('svg-agregar').disabled = false;
      $('svg-estado').textContent = modoMapa()
        ? `${svg.elementos.length} elementos en ${svg.capas.length} capas. Revisá significado y estilo.`
        : `Vista previa: ${dibujo.contornos.length} contornos visibles. Lo que queda tapado por una forma de arriba no se importa.`;
      if (textos.length) $('svg-estado').textContent += modoTextos() === 'braille' ? ` ${textos.length} ${textos.length === 1 ? 'texto pasará' : 'textos pasarán'} a braille (rectángulos punteados).` : ` ${textos.length} ${textos.length === 1 ? 'texto pasará' : 'textos pasarán'} a contornos de letras.`;
    } catch (e) {
      $('svg-estado').textContent = 'No se pudo leer el SVG: ' + e.message;
      $('svg-agregar').disabled = true;
    }
  }
  $('svg-archivo').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; svgTexto = await f.text(); procesar(); });
  $('svg-ancho').addEventListener('change', procesar);
  $('svg-modo-mapa').addEventListener('change', procesar);
  $('svg-textos').addEventListener('change', procesar);
  $('svg-rellenar').addEventListener('change', () => { $('svg-textura').disabled = !$('svg-rellenar').checked; });

  function agregarMapa() {
    const grupoSvg = App.nuevoId('g'), grupos = new Map(), x = Number($('svg-x').value) || 0, y = Number($('svg-y').value) || 0, objs = [];
    for (const c of svg.capas) {
      if (['ignorar', 'texto'].includes(c.significado)) continue;
      if (!grupos.has(c.significado)) grupos.set(c.significado, App.nuevoId('g'));
      for (const e of c.elementos) {
        if (e.puntos.length < 2) continue;
        const cerrado = e.cerrado && c.kind === 'fill', puntos = e.puntos.map(p => [p[0] + x, p[1] + y]);
        if (cerrado && Math.hypot(puntos[0][0] - puntos.at(-1)[0], puntos[0][1] - puntos.at(-1)[1]) < .001) puntos.pop();
        objs.push(window.Objetos.crearObjeto(cerrado ? 'poligono' : 'polilinea', { id: App.nuevoId('o'),
          nombre: c.significado[0].toUpperCase() + c.significado.slice(1), grupo: grupos.get(c.significado), grupoSvg, vertices: puntos, cerrado,
          linea: c.kind === 'stroke' ? c.estilo : 'ninguna', relleno: cerrado ? c.estilo : 'ninguno', orden: App.pagina().objetos.length + objs.length }));
      }
    }
    // Textos: «contorno» se suma como capa «Texto»; «braille» crea cuadros en la capa «rotulos».
    if (modoTextos() === 'contorno' && contornosTexto.length) {
      const g = App.nuevoId('g');
      for (const c of contornosTexto) objs.push(window.Objetos.crearObjeto('poligono', { id: App.nuevoId('o'), nombre: 'Texto', grupo: g, grupoSvg,
        vertices: c.puntos.map(p => [p[0] + x, p[1] + y]), cerrado: true, linea: 'continua', relleno: 'ninguno', orden: App.pagina().objetos.length + objs.length }));
    }
    const tb = modoTextos() === 'braille' ? cuadrosDeTextos(textos, x, y) : { cuadros: [], anchos: 0 };
    if (!objs.length && !tb.cuadros.length) { $('svg-estado').textContent = 'No hay capas para agregar.'; return; }
    App.registrar('Importar SVG (mapa)');
    App.pagina().objetos.push(...objs);
    if (tb.cuadros.length) App.pagina().cuadros.push(...tb.cuadros);
    if (objs.length) App.EditorObjetos.seleccionar(objs[0].id, false); else App.seleccionar('cuadro', tb.cuadros[0].id);
    App.cambio('objetos');
    if (tb.cuadros.length) App.cambio('cuadros');
    App.anunciar(`${objs.length} elementos SVG en ${grupos.size} capas editables.` + (tb.cuadros.length ? ' ' + resumenTextos(tb.cuadros, tb.anchos) : ''));
    $('dlg-svg').close();
  }

  $('svg-agregar').addEventListener('click', () => {
    if (!svg) return;
    if (modoMapa()) { agregarMapa(); return; }
    const x = Number($('svg-x').value) || 0, y = Number($('svg-y').value) || 0;
    const tb = modoTextos() === 'braille' ? cuadrosDeTextos(textos, x, y) : { cuadros: [], anchos: 0 };
    const n = App.ImportarDibujo.insertar(dibujoConTextos(), { cuadros: tb.cuadros, x, y,
      relleno: $('svg-rellenar').checked, textura: $('svg-textura').value, nombre: 'Dibujo SVG', etiqueta: 'Importar SVG como dibujo' });
    if (!n) { $('svg-estado').textContent = 'No hay formas visibles ni textos para importar.'; return; }
    App.anunciar(`Dibujo importado: ${n - tb.cuadros.length} objetos agrupados, editables.` + (tb.cuadros.length ? ' ' + resumenTextos(tb.cuadros, tb.anchos) : '') + ' Con un solo Deshacer se quita todo.');
    $('dlg-svg').close();
  });
})();
