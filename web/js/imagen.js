/* Importar una imagen (PNG/JPG) y convertirla en puntos:
   umbral (todo lo oscuro), contornos, o contorno con relleno raleado. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);
  let imagen = null;
  let puntos = [];

  /**
   * Convierte la imagen en puntos. Muestrea la imagen en una grilla de `paso` mm.
   * Devuelve [[x, y], ...] en mm de la página.
   */
  /** Modos «bordes» y «lineas»: detección de bordes a buena resolución (ver bordes.js). */
  function convertirBordes(img, op) {
    const ancho = op.ancho;
    const alto = ancho * img.naturalHeight / img.naturalWidth;
    // Resolución de trabajo: hasta ~1400 px de lado, entre 2 y 8 px por mm.
    const pxPorMm = Math.max(2, Math.min(8, 1400 / Math.max(ancho, alto)));
    const W = Math.max(8, Math.round(ancho * pxPorMm));
    const H = Math.max(8, Math.round(alto * pxPorMm));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    const datos = g.getImageData(0, 0, W, H).data;
    const res = window.Bordes.detectar(datos, W, H, {
      modo: op.modo, umbral: op.umbral, invertir: op.invertir,
      // Sensibilidad 0..100 -> diferencia de color 120..6 (más sensible = umbral más bajo).
      umbralBorde: 120 - op.sens * 1.14,
      suavizado: op.suavizado, pxPorMm: W / ancho, detalleMinMm: op.detalle,
      paso: op.paso, quitarSueltos: op.sueltos, quitarTexto: op.texto, textoMaxMm: 30
    });
    const r = v => Math.round(v * 1000) / 1000;
    const puntos = res.nodos.map(([col, fila]) => [r(op.x + col * op.paso), r(op.y + fila * op.paso)]);
    return { puntos, alto, quitados: res.quitados };
  }

  function convertir(img, op) {
    if (op.modo === 'bordes' || op.modo === 'lineas') return convertirBordes(img, op);
    const ancho = op.ancho, paso = op.paso;
    const alto = ancho * img.naturalHeight / img.naturalWidth;
    const cols = Math.max(1, Math.floor(ancho / paso) + 1);
    const filas = Math.max(1, Math.floor(alto / paso) + 1);
    const c = document.createElement('canvas');
    c.width = cols; c.height = filas;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cols, filas);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cols, filas);
    const datos = g.getImageData(0, 0, cols, filas).data;
    const oscuro = new Uint8Array(cols * filas);
    for (let i = 0; i < cols * filas; i++) {
      const lum = 0.299 * datos[i * 4] + 0.587 * datos[i * 4 + 1] + 0.114 * datos[i * 4 + 2];
      let o = lum < op.umbral;
      if (op.invertir) o = !o;
      oscuro[i] = o ? 1 : 0;
    }
    const en = (x, y) => x >= 0 && y >= 0 && x < cols && y < filas && oscuro[y * cols + x] === 1;
    const salida = [];
    const r = v => Math.round(v * 1000) / 1000;
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        if (!en(x, y)) continue;
        const borde = !en(x - 1, y) || !en(x + 1, y) || !en(x, y - 1) || !en(x, y + 1);
        let poner = false;
        if (op.modo === 'umbral') poner = true;
        else if (op.modo === 'contornos') poner = borde;
        else poner = borde || (x % 2 === 0 && y % 2 === (x % 4 === 0 ? 0 : 1)); // relleno ralo intercalado
        if (poner) salida.push([r(op.x + x * paso), r(op.y + y * paso)]);
      }
    }
    return { puntos: salida, alto };
  }

  function opciones() {
    return {
      modo: $('img-modo').value,
      umbral: Number($('img-umbral').value),
      invertir: $('img-invertir').checked,
      ancho: Math.max(5, Number($('img-ancho').value) || 60),
      x: Number($('img-x').value) || 0,
      y: Number($('img-y').value) || 0,
      paso: Math.max(1, Number($('img-paso').value) || 2),
      sens: Number($('img-sens').value),
      suavizado: Number($('img-suavizado').value),
      detalle: Math.max(0, Number($('img-detalle').value) || 0),
      sueltos: $('img-sueltos').checked,
      texto: $('img-texto').checked
    };
  }

  /** Muestra las opciones de bordes solo en los modos que las usan. */
  function mostrarOpciones() {
    const m = $('img-modo').value;
    $('img-opciones-mapa').hidden = !(m === 'bordes' || m === 'lineas');
  }

  function actualizar() {
    const vista = $('img-vista');
    const g = vista.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, vista.width, vista.height);
    if (!imagen) { $('btn-img-agregar').disabled = true; return; }
    const op = opciones();
    const res = convertir(imagen, op);
    puntos = res.puntos;
    const esc = Math.min((vista.width - 10) / op.ancho, (vista.height - 10) / res.alto);
    g.globalAlpha = 0.25;
    g.drawImage(imagen, 5, 5, op.ancho * esc, res.alto * esc);
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    const rad = Math.max(1, 0.75 * esc);
    g.beginPath();
    for (const p of puntos) {
      const x = 5 + (p[0] - op.x) * esc, y = 5 + (p[1] - op.y) * esc;
      g.moveTo(x + rad, y);
      g.arc(x, y, rad, 0, Math.PI * 2);
    }
    g.fill();
    const pag = App.pagina();
    const fuera = op.x + op.ancho > pag.ancho || op.y + res.alto > pag.alto;
    $('img-estado').textContent = `${puntos.length} puntos, ${op.ancho.toFixed(0)} × ${res.alto.toFixed(0)} mm.` +
      (res.quitados ? ` Se ignoraron ${res.quitados} detalles chicos (letras, manchas).` : '') +
      (fuera ? ' Atención: la imagen se sale de la hoja.' : '');
    $('btn-img-agregar').disabled = puntos.length === 0;
  }

  $('btn-imagen').addEventListener('click', () => {
    $('img-paso').value = $('paso-dibujo').value;
    mostrarOpciones();
    actualizar();
    $('dlg-imagen').showModal();
  });

  // Usar el fondo de la página del PDF (por ejemplo, un mapa) en su tamaño y lugar reales.
  $('btn-img-fondo').addEventListener('click', () => {
    const p = App.pagina();
    if (!App.pdf || !App.pdf.id || p.pdfPagina == null) {
      $('img-estado').textContent = 'Esta página no tiene un PDF de fondo. Cargá un PDF o elegí una imagen.';
      return;
    }
    $('img-estado').textContent = 'Cargando el fondo de la página…';
    const img = new Image();
    img.onload = () => {
      imagen = img;
      imagen.nombre = 'fondo de la página ' + (p.pdfPagina + 1);
      $('img-ancho').value = p.ancho;
      $('img-x').value = 0;
      $('img-y').value = 0;
      if ($('img-modo').value !== 'lineas') $('img-modo').value = 'bordes';
      mostrarOpciones();
      actualizar();
    };
    img.onerror = () => { $('img-estado').textContent = 'No se pudo cargar el fondo de la página.'; };
    img.src = `/api/pdf/${App.pdf.id}/pagina/${p.pdfPagina}.png?dpi=200`;
  });
  $('img-archivo').addEventListener('change', () => {
    const f = $('img-archivo').files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { imagen = img; imagen.nombre = f.name; actualizar(); };
    img.onerror = () => { $('img-estado').textContent = 'No se pudo leer la imagen.'; };
    img.src = url;
  });
  // Recalcular con una pequeña espera: la detección de bordes tarda un poco en mapas grandes.
  let espera = null;
  function actualizarPronto() {
    clearTimeout(espera);
    espera = setTimeout(actualizar, 150);
  }
  $('img-modo').addEventListener('change', mostrarOpciones);
  ['img-modo', 'img-umbral', 'img-invertir', 'img-ancho', 'img-x', 'img-y', 'img-paso',
   'img-sens', 'img-suavizado', 'img-detalle', 'img-sueltos', 'img-texto'].forEach(id => {
    $(id).addEventListener('input', actualizarPronto);
    $(id).addEventListener('change', actualizarPronto);
  });
  $('btn-img-agregar').addEventListener('click', () => {
    if (!puntos.length) return;
    App.registrar();
    App.Dibujo.agregarTrazo('imagen', puntos, 'Imagen ' + (imagen.nombre || ''));
    $('img-estado').textContent = `Se agregaron ${puntos.length} puntos al dibujo.`;
  });

  App.Imagen = { convertir, cargarImagen: img => { imagen = img; actualizar(); } };
})();
