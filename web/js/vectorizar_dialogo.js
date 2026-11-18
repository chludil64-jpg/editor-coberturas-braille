/* Diálogo «Imagen a dibujo (vectorizar)»: de una foto o escaneo de un dibujo de libro a objetos
   vectoriales editables, con vista previa en vivo. Si la imagen es grande, procesa en un Web Worker. */
(function () {
  'use strict';
  const App = window.App, $ = id => document.getElementById(id);
  const MAX_LADO = 1500, PX_WORKER = 150000;
  let rgba = null, W = 0, H = 0, resultado = null, worker = null, secuencia = 0, temporizador = 0;

  const abrir = () => $('dlg-vectorizar').showModal();
  $('btn-vectorizar').addEventListener('click', abrir);
  $('vec-cerrar').addEventListener('click', () => $('dlg-vectorizar').close());

  function opciones() {
    return { umbral: $('vec-auto').checked ? null : Number($('vec-umbral').value), modo: $('vec-modo').value,
      areaMin: Math.max(0, Number($('vec-area').value) || 0), suavizado: Number($('vec-suave').value) || 0 };
  }

  function mostrar(res) {
    resultado = res;
    App.ImportarDibujo.vistaPrevia($('vec-previa'), { contornos: res.trazos }, res.ancho, res.alto);
    if ($('vec-auto').checked) $('vec-umbral').value = res.umbral;
    $('vec-umbral-valor').textContent = String(res.umbral);
    $('vec-importar').disabled = !res.trazos.length;
    $('vec-estado').textContent = res.trazos.length
      ? `Vista previa: ${res.trazos.length} trazos. Umbral ${res.umbral}.`
      : 'No se encontró ningún trazo con estos ajustes: probá subir el umbral o bajar el área mínima.';
  }

  function crearWorker() {
    if (worker || typeof Worker === 'undefined') return worker;
    try {
      worker = new Worker('js/vectorizar_worker.js');
      worker.onmessage = ev => {
        if (ev.data.id !== secuencia) return;          // llegó tarde: ya hay un pedido más nuevo
        $('vec-previa').removeAttribute('aria-busy');
        if (ev.data.error) { $('vec-estado').textContent = 'No se pudo vectorizar: ' + ev.data.error; return; }
        mostrar(ev.data.res);
      };
      worker.onerror = () => { worker = null; };
    } catch (e) { worker = null; }
    return worker;
  }

  function procesar() {
    if (!rgba) return;
    const id = ++secuencia, op = opciones();
    $('vec-estado').textContent = 'Calculando…';
    if (W * H > PX_WORKER && crearWorker()) {
      $('vec-previa').setAttribute('aria-busy', 'true');
      worker.postMessage({ id, buf: rgba.slice().buffer, ancho: W, alto: H, opciones: op });
      return;
    }
    try { mostrar(window.Vectorizar.vectorizar(rgba, W, H, op)); }
    catch (e) { $('vec-estado').textContent = 'No se pudo vectorizar: ' + e.message; }
  }
  function pedir() { clearTimeout(temporizador); temporizador = setTimeout(procesar, 150); }

  $('vec-archivo').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
      W = Math.max(1, Math.round(img.naturalWidth * k)); H = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.drawImage(img, 0, 0, W, H);
      rgba = g.getImageData(0, 0, W, H).data;
      URL.revokeObjectURL(url);
      $('vec-estado').textContent = `${f.name}: ${W} × ${H} px${k < 1 ? ' (reducida para procesarla)' : ''}.`;
      procesar();
    };
    img.onerror = () => { $('vec-estado').textContent = 'No se pudo abrir la imagen.'; };
    img.src = url;
  });
  for (const id of ['vec-umbral', 'vec-modo', 'vec-area', 'vec-suave']) $(id).addEventListener('input', () => { if (id === 'vec-umbral') $('vec-auto').checked = false; pedir(); });
  $('vec-auto').addEventListener('change', pedir);

  $('vec-importar').addEventListener('click', () => {
    if (!resultado || !resultado.trazos.length) return;
    const ancho = Number($('vec-ancho').value) || 100, k = ancho / resultado.ancho;
    const contornos = resultado.trazos.map(t => ({ puntos: t.puntos.map(p => [p[0] * k, p[1] * k]), cerrado: t.cerrado }));
    const n = App.ImportarDibujo.insertar({ contornos }, { x: Number($('vec-x').value) || 0, y: Number($('vec-y').value) || 0,
      nombre: 'Dibujo vectorizado', etiqueta: 'Imagen a dibujo (vectorizar)' });
    if (!n) { $('vec-estado').textContent = 'No hay trazos para importar.'; return; }
    App.anunciar(`Dibujo vectorizado: ${n} objetos agrupados, editables. Con un solo Deshacer se quitan.`);
    $('dlg-vectorizar').close();
  });
})();
