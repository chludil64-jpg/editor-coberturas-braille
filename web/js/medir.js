/* Medidas en milímetros para mostrar mientras se dibuja o se mueve algo: largo, ancho, alto,
   desplazamiento y ángulo. Cálculo puro (sirve en Node y en el navegador).
   Convención del ángulo: 0° hacia la derecha, 90° hacia arriba (como se ve en la hoja). */
(function (raiz) {
  'use strict';
  const red = (n, d) => { const f = Math.pow(10, d == null ? 1 : d); return Math.round(n * f) / f; };
  /** Número con coma decimal y un decimal como máximo: 42,5 · 40 · -3,2 */
  function num(n) {
    const v = red(Math.abs(n) < 0.05 ? 0 : n, 1);
    return String(v).replace('.', ',');
  }
  function distancia(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  /** Ángulo de a hacia b en grados (0 a 359,9): derecha 0°, arriba 90°, izquierda 180°, abajo 270°. */
  function angulo(a, b) {
    const dx = b[0] - a[0], dy = a[1] - b[1];
    if (!dx && !dy) return 0;
    let g = Math.atan2(dy, dx) * 180 / Math.PI;
    if (g < 0) g += 360;
    g = red(g, 1);
    return g >= 360 ? 0 : g;
  }
  /** Medidas del segmento a-b. */
  function segmento(a, b) {
    return { largo: red(distancia(a, b), 2), angulo: angulo(a, b), dx: red(b[0] - a[0], 2), dy: red(b[1] - a[1], 2) };
  }
  /**
   * Texto de una medida. tipo:
   *  'linea'  -> datos { a, b }         largo y ángulo
   *  'caja'   -> datos { ancho, alto }  ancho × alto
   *  'mover'  -> datos { dx, dy }       desplazamiento
   *  'rotar'  -> datos { grados }       giro
   * Devuelve { corto, largo }: `corto` para la etiqueta y la barra; `largo` para leerlo en voz alta.
   */
  function describir(tipo, d) {
    if (tipo === 'linea') {
      const s = segmento(d.a, d.b);
      return { corto: `${num(s.largo)} mm · ${num(s.angulo)}°`,
        largo: `Largo ${num(s.largo)} milímetros, ángulo ${num(s.angulo)} grados, desplazamiento horizontal ${num(s.dx)} y vertical ${num(s.dy)} milímetros.` };
    }
    if (tipo === 'caja') {
      const w = Math.abs(d.ancho), h = Math.abs(d.alto);
      return { corto: `${num(w)} × ${num(h)} mm`, largo: `Ancho ${num(w)} milímetros, alto ${num(h)} milímetros.` };
    }
    if (tipo === 'mover') {
      return { corto: `Δx ${num(d.dx)} · Δy ${num(d.dy)} mm`,
        largo: `Desplazado ${num(d.dx)} milímetros en horizontal y ${num(d.dy)} en vertical.` };
    }
    if (tipo === 'rotar') {
      const g = red(d.grados, 1);
      return { corto: `${num(g)}°`, largo: `Giro de ${num(g)} grados.` };
    }
    return { corto: '', largo: '' };
  }
  const api = { num, distancia, angulo, segmento, describir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Medir = api;
})(typeof self !== 'undefined' ? self : this);
