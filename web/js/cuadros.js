/* Textos detectados del PDF y cuadros braille: lista, creación y edición. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);

  const listaTextos = $('lista-textos');
  const listaCuadros = $('lista-cuadros');
  const editor = $('editor-cuadro');
  let grupos = [];

  /** Agrupa renglones vecinos (uno debajo del otro y alineados) en un solo texto. */
  function agruparRenglones(renglones, agrupar) {
    const lista = renglones.map(r => ({ lineas: [r], x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }));
    if (!agrupar) return lista;
    const salida = [];
    for (const g of lista.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
      const r = g.lineas[0];
      const h = r.y1 - r.y0;
      const destino = salida.find(s => {
        const u = s.lineas[s.lineas.length - 1];
        const hu = u.y1 - u.y0;
        const hueco = r.y0 - u.y1;
        if (hueco < -0.6 * Math.min(h, hu) || hueco > 0.3 * Math.min(h, hu)) return false;
        const cr = (r.x0 + r.x1) / 2, cu = (u.x0 + u.x1) / 2;
        const anchoMax = Math.max(r.x1 - r.x0, u.x1 - u.x0);
        const centrados = Math.abs(cr - cu) < 0.15 * anchoMax;
        const izq = Math.abs(r.x0 - u.x0) < 1;
        const der = Math.abs(r.x1 - u.x1) < 1;
        return centrados || izq || der;
      });
      if (destino) {
        destino.lineas.push(r);
        destino.x0 = Math.min(destino.x0, r.x0); destino.y0 = Math.min(destino.y0, r.y0);
        destino.x1 = Math.max(destino.x1, r.x1); destino.y1 = Math.max(destino.y1, r.y1);
      } else {
        salida.push(g);
      }
    }
    return salida;
  }

  function textoGrupo(g) { return g.lineas.map(l => l.texto).join('\n'); }

  function infoPaginaPdf() {
    const p = App.pagina();
    if (!App.pdf.id || p.pdfPagina == null) return null;
    return App.pdf.info[p.pdfPagina] || null;
  }

  function mismaTinta(a, b) {
    return a && b && Math.abs(a.x0 - b.x0) < 0.05 && Math.abs(a.y0 - b.y0) < 0.05 &&
      Math.abs(a.x1 - b.x1) < 0.05 && Math.abs(a.y1 - b.y1) < 0.05;
  }

  function mostrarTextos() {
    const info = infoPaginaPdf();
    const marcados = new Set([...listaTextos.querySelectorAll('input:checked')].map(i => i.dataset.clave));
    listaTextos.innerHTML = '';
    if (!info || !info.renglones.length) {
      grupos = [];
      $('textos-vacio').hidden = false;
      $('textos-vacio').textContent = info
        ? 'Esta página no tiene texto extraíble (puede ser un escaneo). Creá los cuadros a mano.'
        : 'Abrí un PDF para ver sus textos. Si es un escaneo sin texto, creá los cuadros a mano.';
      return;
    }
    $('textos-vacio').hidden = true;
    grupos = agruparRenglones(info.renglones, $('agrupar').checked);
    const cuadros = App.pagina().cuadros;
    grupos.forEach((g, i) => {
      const clave = [g.x0, g.y0, g.x1, g.y1].map(v => v.toFixed(1)).join(',');
      const li = document.createElement('li');
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.i = i;
      cb.dataset.clave = clave;
      cb.checked = marcados.has(clave);
      const span = document.createElement('span');
      const texto = document.createElement('span');
      texto.className = 'lineas';
      texto.textContent = textoGrupo(g);
      const pos = document.createElement('small');
      pos.textContent = `x ${g.x0.toFixed(1)} · y ${g.y0.toFixed(1)} mm · ancho ${(g.x1 - g.x0).toFixed(1)} mm`;
      span.append(texto, pos);
      if (cuadros.some(c => mismaTinta(c.tinta, g))) {
        const ya = document.createElement('span');
        ya.className = 'ya';
        ya.textContent = 'ya tiene cuadro';
        span.append(ya);
      }
      label.append(cb, span);
      li.append(label);
      const resaltar = () => { App.ui.resaltado = g; App.Lienzo.dibujar(); };
      const apagar = () => { App.ui.resaltado = null; App.Lienzo.dibujar(); };
      label.addEventListener('mouseenter', resaltar);
      label.addEventListener('mouseleave', apagar);
      cb.addEventListener('focus', resaltar);
      cb.addEventListener('blur', apagar);
      listaTextos.append(li);
    });
  }

  function opcionesCuadro() {
    return { mayusculas: 'signo', palabraMayusculas: 'doble' };
  }

  function crearDesdeElegidos() {
    const elegidos = [...listaTextos.querySelectorAll('input:checked')].map(i => grupos[Number(i.dataset.i)]);
    if (!elegidos.length) { App.anunciar('Elegí al menos un texto de la lista.'); return; }
    App.registrar();
    const p = App.pagina();
    const alin = $('alin-defecto').value;
    let ultimo = null;
    for (const g of elegidos) {
      const c = {
        id: App.nuevoId('c'), texto: textoGrupo(g), x: g.x0, y: g.y0,
        tinta: { x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }, alineacion: alin, opciones: opcionesCuadro()
      };
      Grilla.ubicarSegunTinta(c, App.medidas());
      p.cuadros.push(c);
      ultimo = c;
    }
    listaTextos.querySelectorAll('input:checked').forEach(i => { i.checked = false; });
    App.ui.sel = { tipo: 'cuadro', id: ultimo.id };
    App.cambio('cuadros');
    App.anunciar(`Se crearon ${elegidos.length} cuadros braille.`);
  }

  function nuevoCuadro() {
    App.registrar();
    const p = App.pagina();
    const c = { id: App.nuevoId('c'), texto: 'Texto', x: 20, y: 20, tinta: null, alineacion: 'libre', opciones: opcionesCuadro() };
    p.cuadros.push(c);
    App.seleccionar('cuadro', c.id);
    $('cuadro-texto').focus();
    $('cuadro-texto').select();
    App.anunciar('Cuadro nuevo en x 20, y 20 mm. Escribí el texto.');
  }

  function mostrarCuadros() {
    const p = App.pagina();
    const calc = App.calculo();
    const sel = App.ui.sel;
    const enfocado = document.activeElement && document.activeElement.closest('#lista-cuadros') ? document.activeElement.dataset.id : null;
    listaCuadros.innerHTML = '';
    if (!p.cuadros.length) {
      const li = document.createElement('li');
      li.className = 'nota';
      li.textContent = 'Todavía no hay cuadros en esta página.';
      listaCuadros.append(li);
    }
    p.cuadros.forEach(c => {
      const cc = calc.cuadros.get(c.id);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = c.id;
      const elegido = sel && sel.tipo === 'cuadro' && sel.id === c.id;
      b.setAttribute('aria-pressed', elegido ? 'true' : 'false');
      b.textContent = c.texto || '(vacío)';
      const s = document.createElement('small');
      s.textContent = `x ${c.x.toFixed(1)} · y ${c.y.toFixed(1)} mm · ${cc ? cc.celdas : 0} celdas`;
      b.append(s);
      b.addEventListener('click', () => App.seleccionar('cuadro', c.id));
      b.addEventListener('keydown', ev => {
        if (ev.key === 'Delete') { App.seleccionar('cuadro', c.id); borrarSeleccion(); ev.preventDefault(); }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          const botones = [...listaCuadros.querySelectorAll('button[data-id]')];
          const i = botones.indexOf(b) + (ev.key === 'ArrowDown' ? 1 : -1);
          if (botones[i]) botones[i].focus();
          ev.preventDefault();
        }
      });
      li.append(b);
      listaCuadros.append(li);
    });
    if (enfocado) {
      const b = listaCuadros.querySelector(`button[data-id="${enfocado}"]`);
      if (b) b.focus();
    }
    mostrarEditor();
  }

  let editando = false; // ¿ya se registró el historial en esta edición de texto?

  function mostrarEditor() {
    const el = App.ui.sel && App.ui.sel.tipo === 'cuadro' ? App.buscarSel() : null;
    editor.hidden = !el;
    if (!el) return;
    const calc = App.calculo().cuadros.get(el.id);
    const activo = document.activeElement;
    if (activo !== $('cuadro-texto')) $('cuadro-texto').value = el.texto;
    if (activo !== $('cuadro-x')) $('cuadro-x').value = el.x.toFixed(2);
    if (activo !== $('cuadro-y')) $('cuadro-y').value = el.y.toFixed(2);
    $('cuadro-alin').value = el.alineacion || 'libre';
    const op = el.opciones || {};
    $('cuadro-mayus').value = op.mayusculas === 'sin_signo' ? 'sin_signo' : (op.palabraMayusculas === 'cada_letra' ? 'cada_letra' : 'signo');
    if (activo !== $('cuadro-ancho-max')) {
      $('cuadro-ancho-max').value = el.tinta ? Math.max(10, Math.round(el.tinta.x1 - el.tinta.x0)) : 100;
    }
    $('cuadro-braille').textContent = calc ? calc.unicode : '';
    let info = calc ? `${calc.celdas} celdas, ${calc.renglones.length} renglón(es): ${calc.ancho.toFixed(1)} × ${calc.alto.toFixed(1)} mm.` : '';
    if (el.tinta) info += ` Texto impreso: ${(el.tinta.x1 - el.tinta.x0).toFixed(1)} mm de ancho.`;
    $('cuadro-info').textContent = info;
    $('btn-ubicar').disabled = !el.tinta;
  }

  function cuadroElegido() {
    return App.ui.sel && App.ui.sel.tipo === 'cuadro' ? App.buscarSel() : null;
  }

  function recolocar(c) {
    if (c.tinta && c.alineacion && c.alineacion !== 'libre') Grilla.ubicarSegunTinta(c, App.medidas());
  }

  $('cuadro-texto').addEventListener('focus', () => { editando = false; });
  $('cuadro-texto').addEventListener('input', () => {
    const c = cuadroElegido();
    if (!c) return;
    if (!editando) { App.registrar(); editando = true; }
    c.texto = $('cuadro-texto').value;
    recolocar(c);
    App.cambio('texto');
  });
  for (const eje of ['x', 'y']) {
    $('cuadro-' + eje).addEventListener('change', () => {
      const c = cuadroElegido();
      const v = Number($('cuadro-' + eje).value);
      if (!c || !Number.isFinite(v)) return;
      App.registrar();
      c[eje] = Math.round(v * 1000) / 1000;
      c.alineacion = 'libre';
      App.cambio('mover');
    });
  }
  $('cuadro-alin').addEventListener('change', () => {
    const c = cuadroElegido();
    if (!c) return;
    App.registrar();
    c.alineacion = $('cuadro-alin').value;
    recolocar(c);
    App.cambio('cuadros');
  });
  $('cuadro-mayus').addEventListener('change', () => {
    const c = cuadroElegido();
    if (!c) return;
    App.registrar();
    const v = $('cuadro-mayus').value;
    c.opciones = v === 'sin_signo' ? { mayusculas: 'sin_signo', palabraMayusculas: 'doble' }
      : { mayusculas: 'signo', palabraMayusculas: v === 'cada_letra' ? 'cada_letra' : 'doble' };
    recolocar(c);
    App.cambio('cuadros');
  });
  $('btn-ubicar').addEventListener('click', () => {
    const c = cuadroElegido();
    if (!c || !c.tinta) return;
    App.registrar();
    if (!c.alineacion || c.alineacion === 'libre') c.alineacion = 'centro';
    Grilla.ubicarSegunTinta(c, App.medidas());
    App.cambio('cuadros');
    App.anunciar(App.Lienzo.describirSel());
  });
  $('btn-partir').addEventListener('click', () => {
    const c = cuadroElegido();
    if (!c) return;
    const ancho = Number($('cuadro-ancho-max').value) || 100;
    App.registrar();
    c.texto = Grilla.partirEnRenglones(c.texto.replace(/\n/g, ' '), ancho, App.medidas());
    recolocar(c);
    App.cambio('cuadros');
    App.anunciar(`Texto partido en ${c.texto.split('\n').length} renglones.`);
  });
  $('btn-duplicar').addEventListener('click', () => {
    const c = cuadroElegido();
    if (!c) return;
    App.registrar();
    const copia = JSON.parse(JSON.stringify(c));
    copia.id = App.nuevoId('c');
    copia.x += 5; copia.y += 12;
    copia.alineacion = 'libre';
    App.pagina().cuadros.push(copia);
    App.seleccionar('cuadro', copia.id);
    App.anunciar('Cuadro duplicado 5 mm a la derecha y 12 mm abajo.');
  });
  $('btn-borrar-cuadro').addEventListener('click', () => borrarSeleccion());

  function borrarSeleccion() {
    const el = App.buscarSel();
    if (!el) return;
    App.registrar();
    const p = App.pagina();
    if (App.ui.sel.tipo === 'cuadro') p.cuadros = p.cuadros.filter(c => c.id !== el.id);
    else p.trazos = p.trazos.filter(t => t.id !== el.id);
    App.ui.sel = null;
    App.cambio('borrar');
    App.anunciar('Elemento borrado. Ctrl+Z para deshacer.');
  }

  $('btn-crear-cuadros').addEventListener('click', crearDesdeElegidos);
  $('btn-nuevo-cuadro').addEventListener('click', nuevoCuadro);
  $('btn-elegir-todos').addEventListener('click', () => listaTextos.querySelectorAll('input').forEach(i => { i.checked = true; }));
  $('btn-elegir-ninguno').addEventListener('click', () => listaTextos.querySelectorAll('input').forEach(i => { i.checked = false; }));
  $('agrupar').addEventListener('change', mostrarTextos);

  App.alCambiar(motivo => {
    if (motivo !== 'arrastre' && motivo !== 'seleccion' && motivo !== 'texto') mostrarTextos();
    mostrarCuadros();
  });

  App.Cuadros = { agruparRenglones, borrarSeleccion, mostrarTextos };
})();
