/* Hoja de calibración: cruces de puntos, regla de 100 mm y la palabra
   «calibración» en braille. Se arma en el marco de la hoja tal como entra a la
   impresora (sin giro ni espejo) y se le aplica solo escala y desplazamiento. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);
  const C = 20; // distancia de las cruces a los bordes (mm)

  function hoja() {
    const vertical = App.perfil && App.perfil.carga && App.perfil.carga.orientacion === 'vertical';
    return vertical ? { ancho: 210, alto: 297 } : { ancho: 297, alto: 210 };
  }

  function cruz(cx, cy, brazo, paso) {
    const pts = Grilla.muestrearLinea([cx - brazo, cy], [cx + brazo, cy], paso);
    for (const q of Grilla.muestrearLinea([cx, cy - brazo], [cx, cy + brazo], paso)) {
      if (Math.hypot(q[0] - cx, q[1] - cy) > 0.01) pts.push(q);
    }
    return pts;
  }

  /** Puntos de la hoja de calibración. */
  function puntosHoja() {
    const { ancho: W, alto: H } = hoja();
    const paso = 2;
    let pts = [];
    for (const [x, y] of [[C, C], [W - C, C], [C, H - C], [W - C, H - C], [W / 2, H / 2]]) {
      pts = pts.concat(cruz(x, y, 10, paso));
    }
    // Regla de 100 mm con marcas cada 10 mm.
    const y0 = C + 30;
    pts = pts.concat(Grilla.muestrearLinea([C, y0], [C + 100, y0], paso));
    for (let mm = 0; mm <= 100; mm += 10) {
      pts.push([C + mm, y0 - 2.5]);
      if (mm % 50 === 0) pts.push([C + mm, y0 - 5]);
    }
    // Palabra en braille para reconocer la esquina superior izquierda.
    const c = Grilla.calcularCuadro({ texto: 'calibración', x: C + 16, y: C - 3, alineacion: 'izquierda' }, App.medidas());
    pts = pts.concat(c.puntos);
    return { puntos: Grilla.quitarDuplicados(pts, 0.05), ancho: W, alto: H };
  }

  function cargaUtil() {
    const h = puntosHoja();
    return { puntos: h.puntos, ancho: h.ancho, alto: h.alto, solo_ajuste: true, nombre: 'hoja_calibracion', perfil: App.perfil };
  }

  function abrir() {
    const { ancho: W, alto: H } = hoja();
    $('cal-margen').textContent = C;
    $('cal-esp-h').textContent = (W - 2 * C) + ' mm';
    $('cal-esp-v').textContent = (H - 2 * C) + ' mm';
    $('cal-mx').value = C;
    $('cal-my').value = C;
    $('cal-dh').value = W - 2 * C;
    $('cal-dv').value = H - 2 * C;
    $('cal-estado').textContent = `Hoja de ${W} × ${H} mm (según el perfil: ${W > H ? 'apaisada' : 'parada'}).`;
    $('dlg-calibracion').showModal();
  }

  /**
   * Nuevos valores de ajuste. Con escala s y desplazamiento d actuales, un punto
   * p sale en k·(s·p + d) + e (k y e son el error real de la impresora).
   * Se mide la cruz (posición m) y la distancia entre cruces (D medida).
   */
  function calcular(actual, esperadoPos, medidoPos, distEsperada, distMedida) {
    const s = actual.escala, d = actual.desplazamiento;
    const s2 = s * distEsperada / distMedida;
    const d2 = s2 * (esperadoPos - medidoPos) + s * esperadoPos + d - s2 * esperadoPos;
    return { escala: s2, desplazamiento: d2 };
  }

  async function aplicar() {
    const { ancho: W, alto: H } = hoja();
    const v = ['cal-mx', 'cal-my', 'cal-dh', 'cal-dv'].map(id => Number($(id).value));
    if (v.some(n => !Number.isFinite(n) || n <= 0)) { $('cal-estado').textContent = 'Completá las cuatro medidas.'; return; }
    const carga = App.perfil.carga;
    const x = calcular({ escala: Number(carga.escala_x) || 1, desplazamiento: Number(carga.desplazamiento_x_mm) || 0 }, C, v[0], W - 2 * C, v[2]);
    const y = calcular({ escala: Number(carga.escala_y) || 1, desplazamiento: Number(carga.desplazamiento_y_mm) || 0 }, C, v[1], H - 2 * C, v[3]);
    const r4 = n => Math.round(n * 10000) / 10000;
    carga.escala_x = r4(x.escala);
    carga.escala_y = r4(y.escala);
    carga.desplazamiento_x_mm = Math.round(x.desplazamiento * 100) / 100;
    carga.desplazamiento_y_mm = Math.round(y.desplazamiento * 100) / 100;
    try {
      App.perfil = await App.api('/api/perfil', { method: 'PUT', json: App.perfil });
      $('cal-estado').textContent = `Guardado: escala X ${carga.escala_x}, escala Y ${carga.escala_y}, desplazamiento X ${carga.desplazamiento_x_mm} mm, Y ${carga.desplazamiento_y_mm} mm. Imprimí otra hoja para comprobar.`;
      App.cambio('perfil');
    } catch (e) {
      $('cal-estado').textContent = 'No se pudo guardar el perfil: ' + e.message;
    }
  }

  $('btn-calibracion').addEventListener('click', abrir);
  $('btn-cal-aplicar').addEventListener('click', aplicar);
  $('btn-cal-ibe').addEventListener('click', async () => {
    try {
      const r = await App.api('/api/exportar/ibe', { method: 'POST', json: cargaUtil() });
      App.descargarBase64(r.nombre, r.base64);
      $('cal-estado').textContent = `Descargado ${r.nombre} (${r.info.puntos} puntos).`;
    } catch (e) { $('cal-estado').textContent = 'Error: ' + e.message; }
  });
  $('btn-cal-pdf').addEventListener('click', async () => {
    try {
      const h = puntosHoja();
      const r = await App.api('/api/exportar/pdf', { method: 'POST', json: { puntos: h.puntos, ancho: h.ancho, alto: h.alto, nombre: 'hoja_calibracion', titulo: 'Hoja de calibración' } });
      App.descargarBase64(r.nombre, r.base64, 'application/pdf');
      $('cal-estado').textContent = `Descargado ${r.nombre}.`;
    } catch (e) { $('cal-estado').textContent = 'Error: ' + e.message; }
  });
  $('btn-cal-ver').addEventListener('click', () => {
    const h = puntosHoja();
    App.registrar();
    App.doc.paginas.push(App.paginaVacia(h.ancho, h.alto, {
      nombre: 'Hoja de calibración',
      trazos: [{ id: App.nuevoId('t'), tipo: 'calibracion', nombre: 'Hoja de calibración', puntos: h.puntos }]
    }));
    App.ui.pagina = App.doc.paginas.length - 1;
    App.ui.sel = null;
    $('dlg-calibracion').close();
    App.cambio('pagina');
    App.Lienzo.ajustarZoom();
    App.anunciar('Se agregó una página con la hoja de calibración.');
  });
  $('btn-cal-imprimir').addEventListener('click', () => {
    $('dlg-calibracion').close();
    App.Principal.abrirImprimir(cargaUtil(), 'Hoja de calibración');
  });

  App.Calibracion = { puntosHoja, calcular, hoja };
})();
