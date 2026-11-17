/* Herramientas de dibujo en puntos, lista de trazos, ralear y calcar vectores del PDF. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);
  const nombresHerr = {
    seleccionar: 'Elegir y mover', punto: 'Punto', linea: 'Línea', polilinea: 'Polilínea', poligono: 'Polígono', rectangulo: 'Rectángulo',
    elipse: 'Elipse', mano: 'Mano alzada', goma: 'Goma',lazo:'Lazo magnético','editar-vertices':'Editar vértices','borrar-linea':'Borrar línea',tijera:'Tijera'
  };

  function agregarTrazo(tipo, puntos, nombre) {
    const pts = Grilla.quitarDuplicados(puntos, 0.05);
    if (!pts.length) return null;
    const p = App.pagina();
    const t = Objetos.crearObjeto('puntos', { id: App.nuevoId('t'), nombre: nombre || tipo, puntos: pts, orden:p.objetos.length });
    p.objetos.push(t);
    App.cambio('dibujo');
    App.anunciar(`${t.nombre}: ${pts.length} puntos agregados.`);
    return t;
  }

  function mostrarTrazos() {
    const lista = $('lista-trazos');
    const p = App.pagina();
    const sel = App.ui.sel;
    lista.innerHTML = '';
    const fijos=p.objetos.filter(o=>o.tipo==='puntos');
    if (!fijos.length) {
      const li = document.createElement('li');
      li.className = 'nota';
      li.textContent = 'Sin puntos fijos en esta página.';
      lista.append(li);
      return;
    }
    for (const t of fijos) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${t.nombre} (${t.puntos.length} puntos)`;
      b.setAttribute('aria-pressed', sel && sel.tipo === 'objeto' && sel.id === t.id ? 'true' : 'false');
      b.addEventListener('click', () => App.seleccionar('objeto', t.id));
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = 'Borrar';
      x.className = 'peligro';
      x.setAttribute('aria-label', `Borrar ${t.nombre}`);
      x.addEventListener('click', () => {
        App.registrar();
        p.objetos = p.objetos.filter(o => o.id !== t.id);
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

  /** Cambia de herramienta desde el código (botones de la barra, Escape, nuevo cuadro). */
  App.elegirHerramienta = nombre => {
    const r = document.querySelector(`input[name="herramienta"][value="${nombre}"]`);
    if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change')); }
    document.querySelectorAll('[data-herramienta]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herramienta === nombre)));
  };

  // Forma por coordenadas (alternativa de teclado al mouse)
  $('btn-agregar-forma').addEventListener('click', () => {
    const tipo = $('forma-tipo').value;
    const v = ['x1', 'y1', 'x2', 'y2'].map(k => Number($('forma-' + k).value));
    if(tipo==='polilinea'||tipo==='poligono') {
      const lineas=$('forma-vertices').value.trim().split(/\r?\n/),vertices=lineas.map(l=>l.split(/[;,\s]+/).map(Number));
      if(vertices.length<(tipo==='poligono'?3:2)||vertices.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)))){
        App.anunciar('Ingresá al menos dos vértices (tres para polígono), uno por renglón con X,Y.');return;
      }
      App.EditorObjetos.crear(tipo,{vertices,cerrado:tipo==='poligono'});return;
    }
    if (v.some(n => !Number.isFinite(n))) { App.anunciar('Revisá las coordenadas.'); return; }
    const datos=tipo==='linea'?{vertices:[[v[0],v[1]],[v[2],v[3]]]}:
      tipo==='punto'?{x:v[0],y:v[1]}:{x:Math.min(v[0],v[2]),y:Math.min(v[1],v[3]),ancho:Math.abs(v[2]-v[0]),alto:Math.abs(v[3]-v[1])};
    App.EditorObjetos.crear(tipo,datos);
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

  // Ralear: quita los puntos de dibujo (vectores y puntos fijos) a menos de la separación mínima
  // del braille o de otro punto, midiendo sobre lo que realmente se imprime (ya sobre la grilla).
  $('btn-ralear').addEventListener('click', () => {
    const p = App.pagina();
    const minimo = Number(App.perfil && App.perfil.separacion_minima_mm) || 2;
    const calc = App.calculo();
    const hay = calc.puntos.filter(q => q.origen !== 'braille').length;
    if (!hay) { App.anunciar('No hay puntos de dibujo para ralear.'); return; }
    App.registrar();
    const quitados = Grilla.quitarJuntos(p, calc, minimo, App.medidas());
    if (!quitados) {
      App.anunciar(`Raleo: no se quitó ningún punto; ninguno de los ${hay} puntos de dibujo está a menos de ${minimo} mm de otro ni del braille.`);
      return;
    }
    App.cambio('dibujo');
    App.anunciar(`Raleo: se quitaron ${quitados} de ${hay} puntos de dibujo a menos de ${minimo} mm.`);
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
