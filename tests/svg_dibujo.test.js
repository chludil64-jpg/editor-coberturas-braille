'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const S = require('../web/js/svg_importar.js'), D = require('../web/js/svg_dibujo.js');

const casa = () => {
  const r = S.parsear(fs.readFileSync(path.join(__dirname, 'fixtures', 'casa.svg'), 'utf8'), 100);
  return { r, d: D.aDibujo(r.elementos, { ancho: r.anchoMm, alto: r.altoMm }) };
};
const techo = [[10, 55], [50, 15], [90, 55]];
const enBorde = (m) => [[10, 55, 50, 15], [50, 15, 90, 55], [90, 55, 10, 55]].some(([ax, ay, bx, by]) =>
  Math.abs((bx - ax) * (ay - m[1]) - (ax - m[0]) * (by - ay)) < 1e-2);

test('dibujo: lo tapado por una forma rellena de arriba no aparece', () => {
  const { d } = casa();
  for (const c of d.contornos) {
    const v = c.cerrado ? c.puntos.concat([c.puntos[0]]) : c.puntos;
    for (let i = 1; i < v.length; i++) {
      const m = [(v[i][0] + v[i - 1][0]) / 2, (v[i][1] + v[i - 1][1]) / 2];
      if (!enBorde(m)) assert.equal(D.dentro(m, [techo]), false, 'tramo tapado por el techo en ' + m);
    }
  }
});

test('dibujo: puerta y ventanas completas y sin dibujar el fondo blanco', () => {
  const { r, d } = casa();
  const cerrados = d.contornos.filter(c => c.cerrado);
  const caja = c => { const xs = c.puntos.map(p => p[0]), ys = c.puntos.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const hay = (x0, y0, x1, y1) => cerrados.some(c => { const b = caja(c); return [x0, y0, x1, y1].every((v, i) => Math.abs(v - b[i]) < 1e-6); });
  assert.ok(hay(44, 68, 58, 95), 'puerta');
  assert.ok(hay(26, 62, 38, 74), 'ventana izquierda');
  assert.ok(hay(64, 62, 76, 74), 'ventana derecha');
  assert.ok(!hay(0, 0, 100, 100), 'el fondo blanco no es un contorno');
  assert.equal(r.altoMm, 100);
});

test('dibujo: zonas rellenas en orden de pintado', () => {
  const { d } = casa();
  assert.ok(d.zonas.length >= 6);
  assert.ok(d.zonas.every((z, i) => !i || z.orden >= d.zonas[i - 1].orden));
  assert.ok(d.zonas.some(z => z.claro));
});

test('dibujo: un relleno semitransparente no tapa', () => {
  const svg = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="40" height="40" fill="none" stroke="#000"/>' +
    '<rect x="0" y="0" width="60" height="60" fill="#f00" fill-opacity="0.3"/></svg>';
  const r = S.parsear(svg, 100), d = D.aDibujo(r.elementos, { ancho: 100, alto: 100 });
  assert.ok(d.contornos.some(c => c.cerrado && c.puntos.length === 4 && c.puntos.every(p => p[0] >= 10 && p[0] <= 50)));
});

test('dibujo: trazos sueltos son líneas abiertas', () => {
  const r = S.parsear('<svg viewBox="0 0 50 50"><path d="M0 10 L50 10" fill="none" stroke="#000"/></svg>', 50);
  const d = D.aDibujo(r.elementos, { ancho: 50, alto: 50 });
  assert.equal(d.contornos.length, 1);
  assert.equal(d.contornos[0].cerrado, false);
});

test('dibujo: una forma tapada por completo no deja contornos', () => {
  const r = S.parsear('<svg viewBox="0 0 50 50"><rect x="10" y="10" width="10" height="10" fill="#000"/><rect x="5" y="5" width="30" height="30" fill="#888"/></svg>', 50);
  assert.equal(D.aDibujo(r.elementos, { ancho: 50, alto: 50 }).contornos.length, 1);
});

test('dibujo: agujeros de un trazado compuesto no tapan (nonzero con sentido contrario)', () => {
  const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="5" fill="none" stroke="#000"/>' +
    '<path d="M0 0 H100 V100 H0 Z M20 20 V80 H80 V20 Z" fill="#999"/></svg>';
  const r = S.parsear(svg, 100), d = D.aDibujo(r.elementos, { ancho: 100, alto: 100 });
  assert.ok(d.contornos.some(c => c.cerrado && c.puntos.every(p => Math.hypot(p[0] - 50, p[1] - 50) < 6)));
});
