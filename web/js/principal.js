/* Arranque y conexión de la barra: archivos, exportar, imprimir, perfil,
   páginas, zoom, avisos y atajos de teclado. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);

  function paraExportar() {
    const p = App.pagina();
    return {
      puntos: Grilla.listaParaExportar(App.calculo()),
      ancho: p.ancho, alto: p.alto,
      nombre: App.nombreBase(),
      perfil: App.perfil
    };
  }

  function avisarResultado(r, que) {
    const extra = (r.avisos || []).join(' ');
    const info = r.info && r.info.puntos != null ? ` ${r.info.puntos} puntos, hoja ${r.info.ancho_hoja} × ${r.info.alto_hoja} mm.` : '';
    App.anunciar(`${que}: ${r.nombre} descargado.${info} ${extra}`.trim());
  }

  async function exportar(tipo) {
    const datos = paraExportar();
    if (!datos.puntos.length && tipo !== 'pdf') { App.anunciar('La página no tiene puntos para exportar.'); return; }
    try {
      if (tipo === 'ibe' || tipo === 'prn') {
        const r = await App.api('/api/exportar/' + tipo, { method: 'POST', json: datos });
        App.descargarBase64(r.nombre, r.base64);
        avisarResultado(r, tipo === 'ibe' ? 'Archivo de impresión' : 'Archivo plan B');
      } else if (tipo === 'pdf') {
        const p = App.pagina();
        const r = await App.api('/api/exportar/pdf', {
          method: 'POST',
          json: Object.assign(datos, { pdf_id: p.pdfPagina != null ? App.pdf.id : null, pagina: p.pdfPagina || 0, fondo: true, titulo: App.nombreBase() })
        });
        App.descargarBase64(r.nombre, r.base64, 'application/pdf');
        avisarResultado(r, 'PDF de prueba 1:1 (imprimir al 100 %)');
      } else if (tipo === 'png') {
        const r = await App.api('/api/exportar/png', { method: 'POST', json: Object.assign(datos, { px_por_mm: 10 }) });
        App.descargarBase64(r.nombre, r.base64, 'image/png');
        avisarResultado(r, 'Imagen PNG (10 píxeles por mm)');
      }
    } catch (e) {
      App.anunciar('No se pudo exportar: ' + e.message);
    }
  }

  // ------------------------------------------------------------ imprimir
  let cargaImpresion = null;

  async function abrirImprimir(carga, titulo) {
    cargaImpresion = carga || null;
    const d = carga || paraExportar();
    const advertencias = carga ? [] : Grilla.avisos(App.pagina(),App.calculo(),App.perfil);
    $('imprimir-resumen').textContent = `${titulo || 'Página ' + (App.ui.pagina + 1)}: ${d.puntos.length} puntos, diseño de ${d.ancho} × ${d.alto} mm. ${advertencias.length ? advertencias.length + ' avisos antes de imprimir: ' + advertencias.map(a=>a.mensaje).join(' ') : 'Sin avisos.'}`;
    $('imp-confirmo').checked = false;
    $('imprimir-estado').textContent = 'Buscando impresoras…';
    $('imp-formato').value = App.perfil.codificador || 'grilla';
    // Perfil fresco del servidor: una pestaña abierta desde antes puede tener uno viejo.
    try {
      App.perfil = await App.api('/api/perfil');
      $('imp-formato').value = App.perfil.codificador || 'grilla';
    } catch (e) { /* se sigue con el perfil en memoria */ }
    $('imp-copias').value = (App.perfil.carga && App.perfil.carga.copias) || 1;
    $('imp-ip').value = (App.perfil.red && App.perfil.red.ip) || '';
    $('imp-puerto').value = (App.perfil.red && App.perfil.red.puerto) || 9100;
    actualizarBotonImprimir();
    $('dlg-imprimir').showModal();
    try {
      const r = await App.api('/api/impresoras');
      const sel = $('sel-impresora');
      sel.innerHTML = '';
      for (const n of r.impresoras) {
        const o = document.createElement('option');
        o.value = o.textContent = n;
        sel.append(o);
      }
      const preferida = App.perfil.impresora_windows || r.impresoras.find(n => /index|everest|braille/i.test(n));
      if (preferida && r.impresoras.includes(preferida)) sel.value = preferida;
      formatoSegunImpresora();
      $('imprimir-estado').textContent = r.impresoras.length
        ? `${r.impresoras.length} impresoras instaladas. Elegí la Index.`
        : 'No hay impresoras instaladas en Windows. Podés usar la opción por red o exportar el archivo.';
    } catch (e) {
      $('imprimir-estado').textContent = 'No se pudo listar las impresoras: ' + e.message;
    }
    actualizarBotonImprimir();
  }

  /** La Everest-D V4 solo acepta la grilla ESC BEL (el punto libre .ibe da error 202). */
  function formatoSegunImpresora() {
    const destino = document.querySelector('input[name="destino"]:checked').value;
    if (destino === 'windows' && /V4/i.test($('sel-impresora').value || '')) {
      $('imp-formato').value = 'grilla';
    }
  }
  $('sel-impresora').addEventListener('change', formatoSegunImpresora);

  function actualizarBotonImprimir() {
    const destino = document.querySelector('input[name="destino"]:checked').value;
    const okDestino = destino === 'windows' ? !!$('sel-impresora').value : !!$('imp-ip').value.trim();
    $('btn-enviar-impresion').disabled = !($('imp-confirmo').checked && okDestino);
  }
  ['imp-confirmo', 'sel-impresora', 'imp-ip'].forEach(id => {
    $(id).addEventListener('input', actualizarBotonImprimir);
    $(id).addEventListener('change', actualizarBotonImprimir);
  });
  document.querySelectorAll('input[name="destino"]').forEach(r => r.addEventListener('change', actualizarBotonImprimir));

  $('btn-enviar-impresion').addEventListener('click', async () => {
    if (!$('imp-confirmo').checked) return;
    const destinoTipo = document.querySelector('input[name="destino"]:checked').value;
    const cuerpo = Object.assign({}, cargaImpresion || paraExportar(), {
      confirmado: true,
      formato: $('imp-formato').value,
      copias: Number($('imp-copias').value) || 1,
      destino: destinoTipo === 'windows'
        ? { tipo: 'windows', nombre: $('sel-impresora').value }
        : { tipo: 'red', ip: $('imp-ip').value.trim(), puerto: Number($('imp-puerto').value) || 9100 }
    });
    $('btn-enviar-impresion').disabled = true;
    $('imprimir-estado').textContent = 'Enviando…';
    try {
      const r = await App.api('/api/imprimir', { method: 'POST', json: cuerpo });
      $('imprimir-estado').textContent = `Enviado a ${r.destino}: ${r.copias} copia(s), ${r.bytes} bytes (${r.formato}). ${(r.avisos || []).join(' ')}`;
      $('imp-confirmo').checked = false;
    } catch (e) {
      $('imprimir-estado').textContent = 'No se pudo imprimir: ' + e.message;
    }
    actualizarBotonImprimir();
  });

  // ------------------------------------------------------------ perfil
  function leerRuta(obj, ruta) {
    return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function escribirRuta(obj, ruta, valor) {
    const partes = ruta.split('.');
    let o = obj;
    for (let i = 0; i < partes.length - 1; i++) {
      if (o[partes[i]] == null) o[partes[i]] = {};
      o = o[partes[i]];
    }
    o[partes[partes.length - 1]] = valor;
  }
  function llenarPerfil(perfil) {
    document.querySelectorAll('#form-perfil [data-ruta]').forEach(el => {
      let v = leerRuta(perfil, el.dataset.ruta);
      if (el.dataset.ruta === 'punto_libre.terminador') v = v === '\r\n' ? 'CRLF' : 'LF';
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    });
  }
  function leerPerfil() {
    const perfil = JSON.parse(JSON.stringify(App.perfil));
    document.querySelectorAll('#form-perfil [data-ruta]').forEach(el => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') v = el.value === '' ? 0 : Number(el.value);
      else v = el.value;
      if (el.dataset.ruta === 'punto_libre.terminador') v = v === 'CRLF' ? '\r\n' : '\n';
      escribirRuta(perfil, el.dataset.ruta, v);
    });
    return perfil;
  }
  $('btn-perfil').addEventListener('click', () => {
    llenarPerfil(App.perfil);
    $('perfil-estado').textContent = '';
    $('dlg-perfil').showModal();
  });
  $('btn-perfil-defecto').addEventListener('click', async () => {
    try {
      llenarPerfil(await App.api('/api/perfil/defecto'));
      $('perfil-estado').textContent = 'Se cargaron los valores por defecto. Tocá «Guardar perfil» para conservarlos.';
    } catch (e) { $('perfil-estado').textContent = 'Error: ' + e.message; }
  });
  $('btn-perfil-guardar').addEventListener('click', async () => {
    try {
      const p = leerPerfil();
      if (!(p.braille.entre_puntos_mm > 0 && p.braille.entre_celdas_mm > 0 && p.braille.entre_renglones_mm > 0)) {
        $('perfil-estado').textContent = 'Las medidas del braille tienen que ser mayores que cero.';
        return;
      }
      App.perfil = await App.api('/api/perfil', { method: 'PUT', json: p });
      $('perfil-estado').textContent = 'Perfil guardado en perfiles/everest_v4.json.';
      aplicarPerfilUi();
      App.cambio('perfil');
    } catch (e) { $('perfil-estado').textContent = 'No se pudo guardar: ' + e.message; }
  });

  function aplicarPerfilUi() {
    const paso = App.perfil.paso_dibujo_mm || 2;
    $('paso-dibujo').value = paso;
    App.ui.pasoTeclado = App.perfil.codificador === 'grilla' ? (App.perfil.grilla.paso_x_mm || App.perfil.grilla.paso_mm || 2) : 0.5;
  }

  // ------------------------------------------------------------ archivos
  async function abrirPdf(archivo) {
    if (App.sucio && !confirm('Hay cambios sin guardar. ¿Abrir otro PDF de todos modos?')) return;
    try {
      App.anunciar('Abriendo el PDF…');
      const r = await App.cargarPdf(await archivo.arrayBuffer(), archivo.name, false);
      App.Lienzo.limpiarFondos();
      App.Lienzo.ajustarZoom();
      const textos = r.paginas.reduce((s, p) => s + p.renglones.length, 0);
      App.anunciar(`PDF abierto: ${r.paginas.length} páginas, ${textos} renglones de texto detectados.`);
    } catch (e) {
      App.anunciar('No se pudo abrir el PDF: ' + e.message);
    }
  }

  async function abrirIbe(archivo) {
    try {
      const r = await App.api('/api/ibe/abrir', { method: 'POST', body: await archivo.arrayBuffer(), headers: { 'Content-Type': 'application/octet-stream' } });
      App.registrar();
      r.paginas.forEach((pg, i) => {
        const ancho = pg.ancho || 297, alto = pg.alto || 210;
        App.doc.paginas.push(App.paginaVacia(ancho, alto, {
          nombre: `${archivo.name}${r.paginas.length > 1 ? ' ' + (i + 1) : ''}`,
          objetos: [Objetos.crearObjeto('puntos', { id: App.nuevoId('t'), nombre: archivo.name, puntos: pg.puntos })]
        }));
      });
      App.ui.pagina = App.doc.paginas.length - r.paginas.length;
      App.ui.sel = null;
      App.cambio('pagina');
      App.Lienzo.ajustarZoom();
      const enc = Object.entries(r.encabezado).map(([k, v]) => k + v).join(',');
      App.anunciar(`Se abrió ${archivo.name} en una página nueva: ${r.paginas[0].puntos.length} puntos, hoja ${r.paginas[0].ancho} × ${r.paginas[0].alto} mm, encabezado ${enc}.`);
    } catch (e) {
      App.anunciar('No se pudo abrir el .ibe: ' + e.message);
    }
  }

  $('btn-abrir-pdf').addEventListener('click', () => $('archivo-pdf').click());
  $('btn-abrir-proyecto').addEventListener('click', () => $('archivo-proyecto').click());
  $('btn-abrir-ibe').addEventListener('click', () => $('archivo-ibe').click());
  $('archivo-pdf').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) abrirPdf(f); });
  $('archivo-ibe').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) abrirIbe(f); });
  $('archivo-proyecto').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (App.sucio && !confirm('Hay cambios sin guardar. ¿Abrir el proyecto de todos modos?')) return;
    try {
      await App.abrirProyecto(await f.text());
      App.Lienzo.limpiarFondos();
      aplicarPerfilUi();
      App.Lienzo.ajustarZoom();
      App.anunciar(`Proyecto ${f.name} abierto: ${App.doc.paginas.length} páginas. Se usa el perfil guardado en el proyecto (no se cambió el perfil por defecto).`);
    } catch (err) {
      App.anunciar('No se pudo abrir el proyecto: ' + err.message);
    }
  });
  $('btn-guardar-proyecto').addEventListener('click', () => App.guardarProyecto());

  $('btn-deshacer').addEventListener('click', () => App.deshacer());
  $('btn-rehacer').addEventListener('click', () => App.rehacer());
  $('btn-exp-ibe').addEventListener('click', () => exportar('ibe'));
  $('btn-exp-prn').addEventListener('click', () => exportar('prn'));
  $('btn-exp-pdf').addEventListener('click', () => exportar('pdf'));
  $('btn-exp-png').addEventListener('click', () => exportar('png'));
  $('btn-imprimir').addEventListener('click', () => abrirImprimir(null));
  $('btn-comprobar').addEventListener('click',()=>{mostrarAvisos();$('t-avisos').scrollIntoView({behavior:'instant'});$('lista-avisos').setAttribute('tabindex','-1');$('lista-avisos').focus();App.anunciar(`${Grilla.avisos(App.pagina(),App.calculo(),App.perfil).length} avisos.`);});
  $('btn-salir').addEventListener('click', async () => {
    if (App.sucio && !confirm('Hay cambios sin guardar. ¿Cerrar el programa igual?')) return;
    try { await App.api('/api/apagar', { method: 'POST', json: {} }); } catch (e) { /* ya cerrado */ }
    App.sucio = false;
    document.body.innerHTML = '<main style="padding:2rem"><h1>El programa se cerró.</h1><p>Ya podés cerrar esta pestaña. Para volver a usarlo, abrí <strong>iniciar.bat</strong>.</p></main>';
  });

  // ------------------------------------------------------------ vista
  $('sel-pagina').addEventListener('change', () => {
    App.ui.pagina = Number($('sel-pagina').value);
    App.ui.sel = null;
    App.cambio('pagina');
    App.Lienzo.ajustarZoom();
  });
  $('btn-zoom-mas').addEventListener('click', () => { App.ui.zoom = Math.min(6, App.ui.zoom * 1.25); App.Lienzo.actualizarZoom(); });
  $('btn-zoom-menos').addEventListener('click', () => { App.ui.zoom = Math.max(0.3, App.ui.zoom / 1.25); App.Lienzo.actualizarZoom(); });
  $('btn-zoom-ajustar').addEventListener('click', () => App.Lienzo.ajustarZoom());
  $('opacidad').addEventListener('input', () => { App.ui.opacidad = Number($('opacidad').value) / 100; App.Lienzo.dibujar(); });
  $('vista').addEventListener('change', () => { App.ui.vista = $('vista').value; App.Lienzo.dibujar(); });
  $('ver-tinta').addEventListener('change', () => { App.ui.verTinta = $('ver-tinta').checked; App.Lienzo.dibujar(); });

  function mostrarPaginas() {
    const sel = $('sel-pagina');
    sel.innerHTML = '';
    App.doc.paginas.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `${i + 1}: ${p.nombre || 'página'} (${p.ancho.toFixed(0)} × ${p.alto.toFixed(0)} mm)`;
      sel.append(o);
    });
    sel.value = App.ui.pagina;
  }

  function mostrarAvisos() {
    const calc = App.calculo();
    const lista = Grilla.avisos(App.pagina(), calc, App.perfil);
    const ul = $('lista-avisos');
    ul.innerHTML = '';
    for (const a of lista) {
      const li = document.createElement('li');
      li.className = a.nivel;
      const pre = { error: 'Error: ', aviso: 'Atención: ', info: '' }[a.nivel] || '';
      li.textContent = pre + a.mensaje;
      if (a.id) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Ir al elemento';
        b.addEventListener('click', () => {
          const tipo=App.pagina().cuadros.some(c=>c.id===a.id)?'cuadro':'objeto';
          App.seleccionar(tipo,a.id);
          if(tipo==='cuadro')$('cuadro-texto').focus();
          else {const fila=[...$('lista-elementos').querySelectorAll('button')].find(x=>x.getAttribute('aria-pressed')==='true');if(fila)fila.focus();}
        });
        li.append(document.createElement('br'), b);
      }
      ul.append(li);
    }
    if (!lista.length) {
      const li = document.createElement('li');
      li.textContent = 'Sin avisos.';
      ul.append(li);
    }
    const errores = lista.filter(a => a.nivel === 'error').length;
    $('avisos-cuenta').textContent = `(${lista.length}${errores ? `, ${errores} errores` : ''})`;
    const nb = calc.puntos.filter(p => p.origen === 'braille').length;
    $('total-puntos').textContent = `Total: ${calc.puntos.length} puntos (${nb} de braille, ${calc.puntos.length - nb} de dibujo).`;
  }

  App.alCambiar(motivo => {
    if (motivo !== 'arrastre') { mostrarPaginas(); mostrarAvisos(); }
    $('btn-deshacer').disabled = !App._historial.length;
    $('btn-rehacer').disabled = !App._rehacer.length;
  });

  // ------------------------------------------------------------ atajos
  document.addEventListener('keydown', ev => {
    const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const k = ev.key.toLowerCase();
      if (k === 'z' && !enCampo) { ev.preventDefault(); ev.shiftKey ? App.rehacer() : App.deshacer(); }
      else if (k === 'y' && !enCampo) { ev.preventDefault(); App.rehacer(); }
      else if (k === 's') { ev.preventDefault(); App.guardarProyecto(); }
    }
  });

  // ------------------------------------------------------------ inicio
  async function iniciar() {
    try {
      App.perfil = await App.api('/api/perfil');
    } catch (e) {
      App.perfil = null;
      App.anunciar('No se pudo leer el perfil de impresora: ' + e.message);
    }
    if (App.perfil) aplicarPerfilUi();
    App.cambio('inicio');
    App.Lienzo.ajustarZoom();
    App.anunciar('Listo. Abrí un PDF de la boleta para empezar.');
  }

  App.Principal = { abrirImprimir, exportar, paraExportar };
  iniciar();
})();
