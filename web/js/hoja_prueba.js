/* Hoja de prueba táctil: muestras rotuladas en braille para comprobar con lectores qué se distingue.
   Incluye pares de líneas (continua, punteada, rayada) a 1, 2 y 3 pasos de grilla de separación
   (≈ 2, 4 y 6 mm: la grilla de la impresora no permite 3 mm exactos), los cuatro rellenos y un rótulo
   braille a 1, 2 y 3 pasos de una línea. La parte de cálculo es pura; abajo está el botón de la
   pestaña Impresora. */
(function (raiz) {
  'use strict';
  const nodo = typeof module !== 'undefined' && module.exports;
  const Objetos = nodo ? require('./objetos.js') : raiz.Objetos;
  const Grilla = nodo ? require('./grilla.js') : raiz.Grilla;

  const LINEAS = ['continua', 'punteada', 'rayada'];
  const RELLENOS = ['reticula', 'horizontales', 'diagonales', 'disperso'];
  const PASOS = [1, 2, 3];
  const LARGO_LINEA = 36;      // mm de cada línea de prueba
  const DESPEJE = 6;           // mm libres entre los rótulos y las muestras
  const red = n => Math.round(n * 1000) / 1000;

  /**
   * Arma los objetos y cuadros de la hoja. ctx: { medidas, nuevoId(prefijo), ancho, alto }.
   * Devuelve { objetos, cuadros, separaciones: [mm reales] }.
   */
  function construir(ctx) {
    const medidas = ctx.medidas, g = medidas.grilla || { px: 2, py: 2 };
    const px = g.px, py = g.py;
    const techoX = v => Math.ceil(v / px - 1e-9) * px, techoY = v => Math.ceil(v / py - 1e-9) * py;
    const objetos = [], cuadros = [];
    let orden = 0;

    function cuadro(texto, x, y) {
      const c = { id: ctx.nuevoId('c'), texto, x: red(techoX(x)), y: red(techoY(y)), tinta: null, alineacion: 'izquierda',
        capa: 'rotulos', opciones: { mayusculas: 'signo', palabraMayusculas: 'doble' } };
      const calc = Grilla.calcularCuadro(c, medidas);
      cuadros.push(c);
      return { x: c.x, y: c.y, ancho: calc.ancho, alto: calc.alto };
    }
    function linea(x0, y, x1, estilo, nombre) {
      objetos.push(Objetos.crearObjeto('linea', { id: ctx.nuevoId('o'), nombre, capa: 'dibujo', linea: estilo,
        vertices: [[red(x0), red(y)], [red(x1), red(y)]], orden: orden++ }));
    }
    function rect(x, y, w, h, relleno, nombre) {
      objetos.push(Objetos.crearObjeto('rectangulo', { id: ctx.nuevoId('o'), nombre, capa: 'dibujo', linea: 'continua',
        relleno, x: red(x), y: red(y), ancho: red(w), alto: red(h), orden: orden++ }));
    }
    const mm = pasos => String(Math.round(pasos * py)) + ' mm';

    const x0 = techoX(10), y0 = techoY(10);
    const titulo = cuadro('Hoja de prueba', x0, y0);
    // Anchos de los rótulos de fila: la columna de líneas empieza 6 mm después del más ancho.
    const filas = ['continua', 'punteada', 'rayada', 'rotulo'];
    const anchoFilas = Math.max(...filas.map(t => Grilla.calcularCuadro({ texto: t, x: 0, y: 0, opciones: { mayusculas: 'signo', palabraMayusculas: 'doble' } }, medidas).ancho));
    const xLinea = techoX(x0 + anchoFilas + DESPEJE);
    const pitchCol = techoX(LARGO_LINEA + 8);
    const altoRot = Grilla.calcularCuadro({ texto: 'a', x: 0, y: 0 }, medidas).alto;

    // A) Pares de líneas: encabezados con la separación real y una fila por tipo de línea.
    const yEnc = techoY(titulo.y + titulo.alto + DESPEJE);
    PASOS.forEach((n, i) => cuadro(mm(n), xLinea + i * pitchCol, yEnc));
    const yPrimera = techoY(yEnc + altoRot + DESPEJE);
    const pitchFila = techoY(3 * py + 10);
    LINEAS.forEach((estilo, f) => {
      const y = yPrimera + f * pitchFila;
      const ro = cuadro(estilo, x0, y + Math.floor((3 * py - altoRot) / 2 / py) * py);
      void ro;
      PASOS.forEach((n, i) => {
        const x = xLinea + i * pitchCol;
        linea(x, y, x + LARGO_LINEA, estilo, `Par ${estilo} a ${mm(n)} (1)`);
        linea(x, y + n * py, x + LARGO_LINEA, estilo, `Par ${estilo} a ${mm(n)} (2)`);
      });
    });

    // B) Rótulo braille a 1, 2 y 3 pasos arriba de una línea continua.
    const yRot = techoY(yPrimera + 2 * pitchFila + 3 * py + DESPEJE + altoRot + 3 * py);
    cuadro('rotulo', x0, yRot - Math.floor(altoRot / 2 / py) * py);
    PASOS.forEach((n, i) => {
      const x = xLinea + i * pitchCol;
      linea(x, yRot, x + LARGO_LINEA, 'continua', `Línea con rótulo a ${mm(n)}`);
      cuadro(mm(n), x, yRot - n * py - altoRot);
    });

    // C) Rellenos: muestra de 25 × 12,5 mm (o más, hasta la grilla) y su nombre a 6 mm.
    const w = techoX(25), h = techoY(12.5);
    const yRell = techoY(yRot + DESPEJE + 2 * py);
    let xr = x0, yr = yRell, altoFila = h;
    const tamanos = RELLENOS.map(r => Grilla.calcularCuadro({ texto: r, x: 0, y: 0, opciones: { mayusculas: 'signo', palabraMayusculas: 'doble' } }, medidas));
    const itemAncho = techoX(w + DESPEJE + Math.max(...tamanos.map(t => t.ancho)) + DESPEJE);
    RELLENOS.forEach((r, i) => {
      if (xr + itemAncho > ctx.ancho - 10 && xr > x0) { xr = x0; yr = techoY(yr + altoFila + DESPEJE); }
      rect(xr, yr, w, h, r, `Relleno ${r}`);
      cuadro(r, xr + w + DESPEJE, yr + Math.floor((h - altoRot) / 2 / py) * py);
      xr += itemAncho;
    });
    return { objetos, cuadros, separaciones: PASOS.map(n => red(n * py)) };
  }

  const api = { construir, LINEAS, RELLENOS, PASOS };
  if (nodo) { module.exports = api; return; }
  raiz.HojaPrueba = api;

  // ------------------------------------------------------------ interfaz (botón en Impresora)
  const App = raiz.App;
  if (!App || !raiz.document) return;
  const $ = id => raiz.document.getElementById(id);

  function crearHoja() {
    App.registrar();
    const hoja = App.paginaVacia(297, 210, { nombre: 'Hoja de prueba de texturas', sinSeparacion: true });
    const m = Grilla.medidasDePerfil(App.perfil, hoja.ancho, hoja.alto);
    const r = construir({ medidas: m, nuevoId: pre => App.nuevoId(pre), ancho: hoja.ancho, alto: hoja.alto });
    hoja.objetos = r.objetos;
    hoja.cuadros = r.cuadros;
    App.doc.paginas.push(hoja);
    App.ui.pagina = App.doc.paginas.length - 1;
    App.ui.sel = null;
    App.cambio('pagina');
    if (App.Lienzo && App.Lienzo.ajustarZoom) App.Lienzo.ajustarZoom();
    App.anunciar(`Hoja de prueba creada en la página ${App.ui.pagina + 1}: líneas continua, punteada y rayada en pares a ${r.separaciones.map(s => s.toFixed(1)).join(', ')} mm, los cuatro rellenos y rótulos braille a esas mismas distancias de una línea.`);
  }

  const panel = $('cinta-panel-impresora');
  if (panel) {
    const btn = raiz.document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-hoja-prueba';
    btn.textContent = 'Hoja de prueba de texturas';
    btn.title = 'Crea una página con líneas, rellenos y rótulos braille a distintas distancias para probar con lectores';
    btn.dataset.icono = 'ruler';
    btn.addEventListener('click', crearHoja);
    const g = raiz.document.createElement('div');
    g.className = 'cinta-grupo';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', 'Pruebas');
    const cuerpo = raiz.document.createElement('div');
    cuerpo.className = 'cinta-grupo-cuerpo';
    cuerpo.append(btn);
    const et = raiz.document.createElement('div');
    et.className = 'cinta-grupo-nombre';
    et.setAttribute('aria-hidden', 'true');
    et.textContent = 'Pruebas';
    g.append(cuerpo, et);
    panel.append(g);
    if (raiz.Iconos) raiz.Iconos.aplicar(g);
  }
})(typeof self !== 'undefined' ? self : this);
