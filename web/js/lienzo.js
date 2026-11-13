/* Lienzo: dibuja la página en milímetros reales (fondo del PDF, reglas,
   márgenes, cuadros y puntos) y maneja el mouse y el teclado. */
(function () {
  'use strict';
  const App = window.App;

  const MARGEN = 30;          // px para las reglas
  const PX_POR_MM = 3;        // a zoom 100 %
  const DIAM_PUNTO = 1.5;     // mm (como se ve el punto en relieve)

  const lienzo = document.getElementById('lienzo');
  const ctx = lienzo.getContext('2d');
  const contenedor = document.getElementById('contenedor-lienzo');
  const fondos = new Map(); // clave -> Image
  let arrastre = null;      // estado del gesto en curso
  let vistaPrevia = null;   // puntos de la forma que se está dibujando

  function escala() { return PX_POR_MM * App.ui.zoom; }
  function aPx(mm) { return MARGEN + mm * escala(); }
  function aMm(px) { return (px - MARGEN) / escala(); }

  function imagenFondo() {
    const p = App.pagina();
    if (!App.pdf.id || p.pdfPagina == null) return null;
    const clave = App.pdf.id + ':' + p.pdfPagina;
    if (!fondos.has(clave)) {
      const img = new Image();
      img.onload = () => dibujar();
      img.onerror = () => App.anunciar('No se pudo cargar el fondo del PDF.');
      img.src = `/api/pdf/${App.pdf.id}/pagina/${p.pdfPagina}.png?dpi=150`;
      fondos.set(clave, img);
    }
    const img = fondos.get(clave);
    return img.complete && img.naturalWidth ? img : null;
  }

  function dimensionar() {
    const p = App.pagina();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.ceil(aPx(p.ancho) + 20), h = Math.ceil(aPx(p.alto) + 20);
    lienzo.style.width = w + 'px';
    lienzo.style.height = h + 'px';
    lienzo.width = Math.round(w * dpr);
    lienzo.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function dibujarReglas(p) {
    const e = escala();
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, lienzo.width, MARGEN);
    ctx.fillRect(0, 0, MARGEN, lienzo.height);
    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#111';
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const paso = e >= 6 ? 1 : (e >= 2.5 ? 2 : 5);
    for (let mm = 0; mm <= p.ancho; mm += paso) {
      const x = Math.round(aPx(mm)) + 0.5;
      const largo = mm % 10 === 0 ? 12 : (mm % 5 === 0 ? 8 : 4);
      ctx.moveTo(x, MARGEN); ctx.lineTo(x, MARGEN - largo);
      if (mm % (e < 2 ? 50 : 10) === 0) ctx.fillText(String(mm), x + 2, 10);
    }
    for (let mm = 0; mm <= p.alto; mm += paso) {
      const y = Math.round(aPx(mm)) + 0.5;
      const largo = mm % 10 === 0 ? 12 : (mm % 5 === 0 ? 8 : 4);
      ctx.moveTo(MARGEN, y); ctx.lineTo(MARGEN - largo, y);
      if (mm % (e < 2 ? 50 : 10) === 0) {
        ctx.save(); ctx.translate(10, y + 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText(String(mm), -ctx.measureText(String(mm)).width - 2, 0); ctx.restore();
      }
    }
    ctx.stroke();
    ctx.fillText('mm', 3, 22);
  }

  function rectPx(r) {
    return [aPx(r.x0), aPx(r.y0), (r.x1 - r.x0) * escala(), (r.y1 - r.y0) * escala()];
  }

  function dibujar() {
    const p = App.pagina();
    if (!p) return;
    dimensionar();
    const e = escala();
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = '#8d8d8d';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    // Hoja
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(aPx(0), aPx(0), p.ancho * e, p.alto * e);
    const img = App.ui.vista === 'boleta' ? imagenFondo() : null;
    if (img) {
      ctx.globalAlpha = App.ui.opacidad;
      ctx.drawImage(img, aPx(0), aPx(0), p.ancho * e, p.alto * e);
      ctx.globalAlpha = 1;
    }
    // Zona no imprimible
    const mg = (App.perfil && App.perfil.margenes_mm) || null;
    if (mg) {
      ctx.fillStyle = 'rgba(200, 30, 30, 0.12)';
      ctx.fillRect(aPx(0), aPx(0), p.ancho * e, mg.superior * e);
      ctx.fillRect(aPx(0), aPx(p.alto - mg.inferior), p.ancho * e, mg.inferior * e);
      ctx.fillRect(aPx(0), aPx(0), mg.izquierdo * e, p.alto * e);
      ctx.fillRect(aPx(p.ancho - mg.derecho), aPx(0), mg.derecho * e, p.alto * e);
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(aPx(0) - 0.5, aPx(0) - 0.5, p.ancho * e + 1, p.alto * e + 1);

    const calc = App.calculo();
    const sel = App.ui.sel;
    // Texto en tinta resaltado desde la lista
    if (App.ui.resaltado) {
      ctx.fillStyle = 'rgba(255, 200, 0, 0.35)';
      ctx.fillRect(...rectPx(App.ui.resaltado));
    }
    // Cuadros
    for (const c of p.cuadros) {
      const cc = calc.cuadros.get(c.id);
      if (!cc) continue;
      if (App.ui.verTinta && c.tinta) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = '#1565c0';
        ctx.lineWidth = 1;
        ctx.strokeRect(...rectPx(c.tinta));
      }
      const elegido = sel && sel.tipo === 'cuadro' && sel.id === c.id;
      const r = Grilla.rectCuadro(c, cc);
      const m = 1.2;
      ctx.setLineDash(elegido ? [] : [5, 3]);
      ctx.strokeStyle = elegido ? '#0047b3' : '#555';
      ctx.lineWidth = elegido ? 2.5 : 1;
      ctx.strokeRect(aPx(r.x0 - m), aPx(r.y0 - m), (r.x1 - r.x0 + 2 * m) * e, (r.y1 - r.y0 + 2 * m) * e);
      if (elegido) {
        ctx.fillStyle = 'rgba(0, 71, 179, 0.08)';
        ctx.fillRect(aPx(r.x0 - m), aPx(r.y0 - m), (r.x1 - r.x0 + 2 * m) * e, (r.y1 - r.y0 + 2 * m) * e);
      }
    }
    ctx.setLineDash([]);
    // Puntos
    const radio = Math.max(1.2, DIAM_PUNTO / 2 * e);
    const lotes = { braille: [], dibujo: [], elegido: [] };
    for (const pt of calc.puntos) {
      const esSel = sel && pt.id === sel.id;
      (esSel && sel.tipo === 'trazo' ? lotes.elegido : lotes[pt.origen]).push(pt);
    }
    const colores = { braille: '#000000', dibujo: '#0b3d91', elegido: '#d35400' };
    for (const k of Object.keys(lotes)) {
      ctx.fillStyle = colores[k];
      ctx.beginPath();
      for (const pt of lotes[k]) {
        const x = aPx(pt.x), y = aPx(pt.y);
        ctx.moveTo(x + radio, y);
        ctx.arc(x, y, radio, 0, Math.PI * 2);
      }
      ctx.fill();
      // Borde blanco para que el punto se vea también sobre fondos oscuros.
      if (img && lotes[k].length) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke(); }
    }
    if (vistaPrevia && vistaPrevia.length) {
      ctx.fillStyle = 'rgba(211, 84, 0, 0.75)';
      ctx.beginPath();
      for (const pt of vistaPrevia) {
        const x = aPx(pt[0]), y = aPx(pt[1]);
        ctx.moveTo(x + radio, y);
        ctx.arc(x, y, radio, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    if (arrastre && arrastre.tipo === 'goma' && arrastre.ultimo) {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(aPx(arrastre.ultimo[0]), aPx(arrastre.ultimo[1]), radioGoma() * e, 0, Math.PI * 2);
      ctx.stroke();
    }
    dibujarReglas(p);
  }

  function radioGoma() {
    return Number(document.getElementById('radio-goma').value) || 2;
  }
  function pasoDibujo() {
    return Math.max(0.5, Number(document.getElementById('paso-dibujo').value) || 2);
  }

  function posicion(ev) {
    const r = lienzo.getBoundingClientRect();
    return [Math.round(aMm(ev.clientX - r.left) * 100) / 100, Math.round(aMm(ev.clientY - r.top) * 100) / 100];
  }

  /** Busca qué hay bajo el puntero: primero cuadros, después trazos. */
  function tocar(mm) {
    const p = App.pagina();
    const calc = App.calculo();
    const dentro = c => {
      const cc = calc.cuadros.get(c.id);
      if (!cc) return false;
      const r = Grilla.rectCuadro(c, cc);
      return mm[0] >= r.x0 - 1.5 && mm[0] <= r.x1 + 1.5 && mm[1] >= r.y0 - 1.5 && mm[1] <= r.y1 + 1.5;
    };
    // Si el elemento ya elegido está bajo el puntero, tiene prioridad (cuadros superpuestos).
    const s = App.ui.sel;
    if (s && s.tipo === 'cuadro') {
      const c = p.cuadros.find(x => x.id === s.id);
      if (c && dentro(c)) return { tipo: 'cuadro', id: c.id };
    }
    for (let i = p.cuadros.length - 1; i >= 0; i--) {
      if (dentro(p.cuadros[i])) return { tipo: 'cuadro', id: p.cuadros[i].id };
    }
    const tol = Math.max(1.5, 6 / escala());
    for (let i = p.trazos.length - 1; i >= 0; i--) {
      const t = p.trazos[i];
      if (t.puntos.some(q => Math.hypot(q[0] - mm[0], q[1] - mm[1]) <= tol)) return { tipo: 'trazo', id: t.id };
    }
    return null;
  }

  function puntosForma(tipo, a, b) {
    const paso = pasoDibujo();
    if (tipo === 'linea') return Grilla.muestrearLinea(a, b, paso);
    if (tipo === 'rectangulo') return Grilla.muestrearRectangulo(a[0], a[1], b[0], b[1], paso);
    if (tipo === 'elipse') return Grilla.muestrearElipse(a[0], a[1], b[0], b[1], paso);
    return [a];
  }

  function borrarConGoma(mm) {
    const p = App.pagina();
    const r = radioGoma();
    let quitados = 0;
    for (const t of p.trazos) {
      const antes = t.puntos.length;
      t.puntos = t.puntos.filter(q => Math.hypot(q[0] - mm[0], q[1] - mm[1]) > r);
      quitados += antes - t.puntos.length;
    }
    p.trazos = p.trazos.filter(t => t.puntos.length > 0);
    return quitados;
  }

  lienzo.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    lienzo.focus();
    const mm = posicion(ev);
    const h = App.ui.herramienta;
    lienzo.setPointerCapture(ev.pointerId);
    if (h === 'seleccionar') {
      const t = tocar(mm);
      App.seleccionar(t && t.tipo, t && t.id);
      if (t) arrastre = { tipo: 'mover', inicio: mm, ultimo: mm, registrado: false };
      else App.anunciar('Nada elegido.');
      return;
    }
    if (h === 'punto') {
      App.registrar();
      App.Dibujo.agregarTrazo('punto', [mm], 'Punto');
      return;
    }
    if (h === 'goma') {
      App.registrar();
      arrastre = { tipo: 'goma', ultimo: mm, quitados: borrarConGoma(mm) };
      App.cambio('dibujo');
      return;
    }
    if (h === 'mano') {
      arrastre = { tipo: 'mano', camino: [mm] };
      vistaPrevia = [mm];
      dibujar();
      return;
    }
    arrastre = { tipo: 'forma', forma: h, inicio: mm };
    vistaPrevia = puntosForma(h, mm, mm);
    dibujar();
  });

  lienzo.addEventListener('pointermove', ev => {
    const mm = posicion(ev);
    document.getElementById('cursor-mm').textContent = `x ${mm[0].toFixed(1)} mm · y ${mm[1].toFixed(1)} mm`;
    if (!arrastre) return;
    if (arrastre.tipo === 'mover') {
      const dx = mm[0] - arrastre.ultimo[0], dy = mm[1] - arrastre.ultimo[1];
      if (!dx && !dy) return;
      if (!arrastre.registrado) { App.registrar(); arrastre.registrado = true; }
      mover(dx, dy, true);
      arrastre.ultimo = mm;
    } else if (arrastre.tipo === 'goma') {
      arrastre.ultimo = mm;
      arrastre.quitados += borrarConGoma(mm);
      App.cambio('dibujo');
    } else if (arrastre.tipo === 'mano') {
      const u = arrastre.camino[arrastre.camino.length - 1];
      if (Math.hypot(u[0] - mm[0], u[1] - mm[1]) >= 0.3) arrastre.camino.push(mm);
      vistaPrevia = Grilla.muestrearTrayecto(arrastre.camino, pasoDibujo(), false);
      dibujar();
    } else if (arrastre.tipo === 'forma') {
      vistaPrevia = puntosForma(arrastre.forma, arrastre.inicio, mm);
      dibujar();
    }
  });

  function terminar(ev) {
    if (!arrastre) return;
    const a = arrastre;
    arrastre = null;
    const mm = ev ? posicion(ev) : null;
    if (a.tipo === 'forma') {
      const pts = puntosForma(a.forma, a.inicio, mm || a.inicio);
      vistaPrevia = null;
      App.registrar();
      const nombres = { linea: 'Línea', rectangulo: 'Rectángulo', elipse: 'Elipse' };
      App.Dibujo.agregarTrazo(a.forma, pts, nombres[a.forma]);
    } else if (a.tipo === 'mano') {
      const pts = Grilla.muestrearTrayecto(a.camino, pasoDibujo(), false);
      vistaPrevia = null;
      App.registrar();
      App.Dibujo.agregarTrazo('mano', pts, 'Mano alzada');
    } else if (a.tipo === 'goma') {
      App.anunciar(`Goma: se borraron ${a.quitados} puntos.`);
      App.cambio('dibujo');
    } else if (a.tipo === 'mover' && a.registrado) {
      const el = App.buscarSel();
      if (el && App.ui.sel.tipo === 'cuadro') App.anunciar(`Cuadro en x ${el.x.toFixed(1)}, y ${el.y.toFixed(1)} mm.`);
      App.cambio('mover');
    }
  }
  lienzo.addEventListener('pointerup', terminar);
  lienzo.addEventListener('pointercancel', () => { arrastre = null; vistaPrevia = null; dibujar(); });

  /** Mueve el elemento elegido. `silencioso` evita anunciar en cada paso del arrastre. */
  function mover(dx, dy, silencioso) {
    const el = App.buscarSel();
    if (!el) return;
    const r = v => Math.round(v * 1000) / 1000;
    if (App.ui.sel.tipo === 'cuadro') {
      el.x = r(el.x + dx);
      el.y = r(el.y + dy);
      el.alineacion = 'libre';
    } else {
      el.puntos = el.puntos.map(q => [r(q[0] + dx), r(q[1] + dy)]);
    }
    App.cambio(silencioso ? 'arrastre' : 'mover');
  }

  function elementosOrdenados() {
    const p = App.pagina();
    return p.cuadros.map(c => ({ tipo: 'cuadro', id: c.id })).concat(p.trazos.map(t => ({ tipo: 'trazo', id: t.id })));
  }

  function describirSel() {
    const el = App.buscarSel();
    if (!el) return 'Nada elegido.';
    if (App.ui.sel.tipo === 'cuadro') {
      return `Cuadro «${el.texto.replace(/\n/g, ' / ')}», x ${el.x.toFixed(1)}, y ${el.y.toFixed(1)} mm.`;
    }
    return `Trazo «${el.nombre}», ${el.puntos.length} puntos.`;
  }

  lienzo.addEventListener('keydown', ev => {
    const flechas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (flechas[ev.key]) {
      if (!App.buscarSel()) { App.anunciar('Elegí un elemento con Av Pág o desde la lista.'); ev.preventDefault(); return; }
      const paso = ev.shiftKey ? 5 : App.ui.pasoTeclado;
      App.registrar();
      mover(flechas[ev.key][0] * paso, flechas[ev.key][1] * paso, false);
      App.anunciar(describirSel());
      ev.preventDefault();
    } else if (ev.key === 'PageDown' || ev.key === 'PageUp') {
      const lista = elementosOrdenados();
      if (!lista.length) { App.anunciar('La página no tiene elementos.'); ev.preventDefault(); return; }
      const s = App.ui.sel;
      let i = s ? lista.findIndex(x => x.id === s.id) : -1;
      i = ev.key === 'PageDown' ? (i + 1) % lista.length : (i - 1 + lista.length) % lista.length;
      App.seleccionar(lista[i].tipo, lista[i].id);
      App.anunciar(describirSel());
      ev.preventDefault();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (App.buscarSel()) {
        App.Cuadros.borrarSeleccion();
        ev.preventDefault();
      }
    } else if (ev.key === 'Escape') {
      App.seleccionar(null);
      App.anunciar('Nada elegido.');
    }
  });

  window.addEventListener('pointerup', () => { if (arrastre) terminar(null); });

  function ajustarZoom() {
    const p = App.pagina();
    const ancho = contenedor.clientWidth - MARGEN - 30;
    const alto = contenedor.clientHeight - MARGEN - 30;
    const z = Math.min(ancho / (p.ancho * PX_POR_MM), alto > 100 ? alto / (p.alto * PX_POR_MM) : 99);
    App.ui.zoom = Math.max(0.3, Math.min(6, Math.round(z * 20) / 20));
    actualizarZoom();
  }
  function actualizarZoom() {
    document.getElementById('zoom-valor').textContent = Math.round(App.ui.zoom * 100) + ' %';
    dibujar();
  }

  App.Lienzo = { dibujar, ajustarZoom, actualizarZoom, mover, describirSel, limpiarFondos: () => fondos.clear() };
  App.alCambiar(() => dibujar());
  window.addEventListener('resize', () => dibujar());
})();
