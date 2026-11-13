/* Herramientas de dibujo en puntos, lista de trazos, ralear y calcar vectores del PDF. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);
  const nombresHerr = {
    seleccionar: 'Elegir y mover', punto: 'Punto', linea: 'Línea', rectangulo: 'Rectángulo',
    elipse: 'Elipse', mano: 'Mano alzada', goma: 'Goma'
  };

  function agregarTrazo(tipo, puntos, nombre) {
    const pts = Grilla.quitarDuplicados(puntos, 0.05);
    if (!pts.length) return null;
    const p = App.pagina();
    // Los puntos sueltos se juntan en un mismo trazo para no llenar la lista.
    if (tipo === 'punto') {
      let t = p.trazos.find(x => x.tipo === 'punto');
      if (!t) { t = { id: App.nuevoId('t'), tipo: 'punto', nombre: 'Puntos sueltos', puntos: [] }; p.trazos.push(t); }
      t.puntos.push(...pts);
      App.cambio('dibujo');
      App.anunciar(`Punto en x ${pts[0][0].toFixed(1)}, y ${pts[0][1].toFixed(1)} mm.`);
      return t;
    }
    const t = { id: App.nuevoId('t'), tipo, nombre: nombre || tipo, puntos: pts };
    p.trazos.push(t);
    App.cambio('dibujo');
    App.anunciar(`${t.nombre}: ${pts.length} puntos agregados.`);
    return t;
  }

  function mostrarTrazos() {
    const lista = $('lista-trazos');
    const p = App.pagina();
    const sel = App.ui.sel;
    lista.innerHTML = '';
    if (!p.trazos.length) {
      const li = document.createElement('li');
      li.className = 'nota';
      li.textContent = 'Sin dibujos en esta página.';
      lista.append(li);
      return;
    }
    for (const t of p.trazos) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${t.nombre} (${t.puntos.length} puntos)`;
      b.setAttribute('aria-pressed', sel && sel.tipo === 'trazo' && sel.id === t.id ? 'true' : 'false');
      b.addEventListener('click', () => App.seleccionar('trazo', t.id));
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = 'Borrar';
      x.className = 'peligro';
      x.setAttribute('aria-label', `Borrar ${t.nombre}`);
      x.addEventListener('click', () => {
        App.registrar();
        p.trazos = p.trazos.filter(o => o.id !== t.id);
        if (sel && sel.id === t.id) App.ui.sel = null;
        App.cambio('dibujo');
        App.anunciar(`${t.nombre} borrado.`);
      });
      li.append(b, x);
      lista.append(li);
    }
  }

  // Herramientas
  document.querySelectorAll('input[name="herramienta"]').forEach(r => {
    r.addEventListener('change', () => {
      App.ui.herramienta = r.value;
      $('lienzo').style.cursor = r.value === 'seleccionar' ? 'default' : 'crosshair';
      App.anunciar(`Herramienta: ${nombresHerr[r.value]}.`);
    });
  });

  // Forma por coordenadas (alternativa de teclado al mouse)
  $('btn-agregar-forma').addEventListener('click', () => {
    const tipo = $('forma-tipo').value;
    const v = ['x1', 'y1', 'x2', 'y2'].map(k => Number($('forma-' + k).value));
    if (v.some(n => !Number.isFinite(n))) { App.anunciar('Revisá las coordenadas.'); return; }
    const paso = Math.max(0.5, Number($('paso-dibujo').value) || 2);
    let pts;
    if (tipo === 'linea') pts = Grilla.muestrearLinea([v[0], v[1]], [v[2], v[3]], paso);
    else if (tipo === 'rectangulo') pts = Grilla.muestrearRectangulo(v[0], v[1], v[2], v[3], paso);
    else if (tipo === 'elipse') pts = Grilla.muestrearElipse(v[0], v[1], v[2], v[3], paso);
    else pts = [[v[0], v[1]]];
    App.registrar();
    agregarTrazo(tipo, pts, { linea: 'Línea', rectangulo: 'Rectángulo', elipse: 'Elipse', punto: 'Punto' }[tipo]);
  });

  // Separación automática dibujo-braille
  function leerSeparacion() {
    App.registrar();
    App.doc.opciones.separarDibujo = $('separar-dibujo').checked;
    App.doc.opciones.separacionDibujo = Math.max(0, Number($('separacion-dibujo').value) || 0);
    App.cambio('opciones');
  }
  $('separar-dibujo').addEventListener('change', leerSeparacion);
  $('separacion-dibujo').addEventListener('change', leerSeparacion);

  // Ralear: deja los puntos de dibujo a la separación mínima entre sí y del braille.
  $('btn-ralear').addEventListener('click', () => {
    const p = App.pagina();
    const minimo = Number(App.perfil && App.perfil.separacion_minima_mm) || 2;
    const calc = App.calculo();
    const braille = calc.puntos.filter(q => q.origen === 'braille').map(q => [q.x, q.y]);
    const antes = p.trazos.reduce((s, t) => s + t.puntos.length, 0);
    if (!antes) { App.anunciar('No hay puntos de dibujo para ralear.'); return; }
    App.registrar();
    let fijos = braille;
    for (const t of p.trazos) {
      t.puntos = Grilla.ralear(t.puntos, minimo, fijos);
      fijos = fijos.concat(t.puntos);
    }
    p.trazos = p.trazos.filter(t => t.puntos.length);
    const despues = p.trazos.reduce((s, t) => s + t.puntos.length, 0);
    App.cambio('dibujo');
    App.anunciar(`Raleo: se quitaron ${antes - despues} puntos a menos de ${minimo} mm.`);
  });

  // Calcar vectores del PDF
  $('btn-calcar').addEventListener('click', () => {
    const p = App.pagina();
    if (!App.pdf.id || p.pdfPagina == null) { App.anunciar('Esta página no viene de un PDF.'); return; }
    $('calcar-paso').value = $('paso-dibujo').value;
    $('calcar-estado').textContent = '';
    $('dlg-calcar').showModal();
  });
  $('btn-calcar-ok').addEventListener('click', async () => {
    const p = App.pagina();
    const est = $('calcar-estado');
    try {
      est.textContent = 'Leyendo los vectores…';
      const r = await App.api(`/api/pdf/${App.pdf.id}/vectores/${p.pdfPagina}`);
      const paso = Math.max(0.5, Number($('calcar-paso').value) || 2);
      const minimo = Number($('calcar-min').value) || 0;
      const rellenos = $('calcar-rellenos').checked;
      let pts = [];
      let usados = 0;
      for (const v of r.vectores) {
        if (v.tipo === 'relleno' && !rellenos) continue;
        const xs = v.puntos.map(q => q[0]), ys = v.puntos.map(q => q[1]);
        const tam = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        if (tam < minimo) continue;
        usados++;
        pts = pts.concat(v.puntos.length <= 8
          ? Grilla.muestrearPoligono(v.puntos, paso, v.cerrado)
          : Grilla.muestrearTrayecto(v.puntos, paso, v.cerrado));
      }
      pts = Grilla.ralear(pts, paso * 0.75);
      if (!pts.length) { est.textContent = 'No se encontraron vectores con esas opciones.'; return; }
      App.registrar();
      agregarTrazo('calco', pts, 'Calco del PDF');
      est.textContent = `Se calcaron ${usados} formas: ${pts.length} puntos.`;
    } catch (e) {
      est.textContent = 'Error: ' + e.message;
    }
  });

  App.alCambiar(motivo => {
    if (motivo !== 'arrastre') mostrarTrazos();
    const o = App.doc.opciones || {};
    $('separar-dibujo').checked = !!o.separarDibujo;
    if (document.activeElement !== $('separacion-dibujo')) $('separacion-dibujo').value = o.separacionDibujo;
  });

  App.Dibujo = { agregarTrazo, mostrarTrazos };
})();
