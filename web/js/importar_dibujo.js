/* Inserta en la página un dibujo ya calculado (contornos y zonas en mm) como objetos vectoriales
   editables: todos quedan en un mismo grupo, en la capa «dibujo», y un solo Ctrl+Z los deshace.
   Lo usan «Importar SVG» y «Imagen a dibujo (vectorizar)». */
(function () {
  'use strict';
  const App = window.App;

  /**
   * dibujo: { contornos:[{puntos,cerrado}], zonas:[{puntos,claro,orden}] } (mm, origen en la esquina del dibujo)
   * opciones: { x, y (mm), relleno (bool), textura, nombre, etiqueta, cuadros: [cuadro braille ya armados] }
   * Los cuadros (p. ej. textos del SVG) entran en la misma acción: un solo Ctrl+Z deshace todo.
   */
  function insertar(dibujo, opciones) {
    const op = Object.assign({ x: 0, y: 0, relleno: false, textura: 'reticula', nombre: 'Dibujo', etiqueta: 'Importar dibujo' }, opciones);
    const grupo = App.nuevoId('g'), grupoSvg = App.nuevoId('g'), base = App.pagina().objetos.length;
    const mover = pts => pts.map(p => [p[0] + op.x, p[1] + op.y]);
    const objs = [];
    if (op.relleno) {
      // Zonas rellenas: sin línea propia; sirven de textura y de «tapa» entre sí, según el orden de pintado.
      for (const z of dibujo.zonas || []) {
        if (z.puntos.length < 3) continue;
        objs.push(window.Objetos.crearObjeto('poligono', { id: App.nuevoId('o'), nombre: op.nombre + ' (relleno)', capa: 'dibujo',
          grupo, grupoSvg, vertices: mover(z.puntos), cerrado: true, linea: 'ninguna',
          relleno: z.claro ? 'ninguno' : op.textura, orden: base + objs.length }));
      }
    }
    for (const c of dibujo.contornos || []) {
      if (c.puntos.length < 2) continue;
      objs.push(window.Objetos.crearObjeto(c.cerrado ? 'poligono' : 'polilinea', { id: App.nuevoId('o'), nombre: op.nombre, capa: 'dibujo',
        grupo, vertices: mover(c.puntos), cerrado: !!c.cerrado, linea: 'continua', relleno: 'ninguno', orden: base + objs.length }));
    }
    const cuadros = op.cuadros || [];
    if (!objs.length && !cuadros.length) return 0;
    App.registrar(op.etiqueta);
    App.pagina().objetos.push(...objs);
    if (cuadros.length) App.pagina().cuadros.push(...cuadros);
    if (objs.length) App.EditorObjetos.seleccionar(objs[0].id, false);
    else App.seleccionar('cuadro', cuadros[0].id);
    App.cambio('objetos');
    if (cuadros.length) App.cambio('cuadros');
    return objs.length + cuadros.length;
  }

  /** Dibuja una vista previa de los contornos en un canvas (fondo blanco, línea oscura). */
  function vistaPrevia(canvas, dibujo, anchoMm, altoMm, rotulos) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const k = Math.min((W - 8) / anchoMm, (H - 8) / altoMm), ox = (W - anchoMm * k) / 2, oy = (H - altoMm * k) / 2;
    g.strokeStyle = '#aaa'; g.lineWidth = 1; g.strokeRect(ox, oy, anchoMm * k, altoMm * k);
    g.strokeStyle = '#111'; g.lineWidth = 1.5; g.lineJoin = 'round';
    for (const c of dibujo.contornos) {
      g.beginPath();
      c.puntos.forEach((p, i) => i ? g.lineTo(ox + p[0] * k, oy + p[1] * k) : g.moveTo(ox + p[0] * k, oy + p[1] * k));
      if (c.cerrado) g.closePath();
      g.stroke();
    }
    // Textos que pasarán a braille: rectángulo de tinta con el texto adentro.
    if (rotulos && rotulos.length) {
      g.strokeStyle = '#0b6e6e'; g.fillStyle = '#0b6e6e'; g.lineWidth = 1; g.setLineDash([4, 3]);
      for (const r of rotulos) {
        g.strokeRect(ox + r.x0 * k, oy + r.y0 * k, Math.max(2, (r.x1 - r.x0) * k), Math.max(2, (r.y1 - r.y0) * k));
        g.font = `${Math.max(8, Math.min(14, (r.y1 - r.y0) * k * 0.8))}px sans-serif`;
        g.textBaseline = 'top';
        g.fillText(String(r.texto).replace(/\n/g, ' / '), ox + r.x0 * k + 2, oy + r.y0 * k + 1, Math.max(20, (r.x1 - r.x0) * k - 3));
      }
      g.setLineDash([]);
    }
  }

  App.ImportarDibujo = { insertar, vistaPrevia };
})();
