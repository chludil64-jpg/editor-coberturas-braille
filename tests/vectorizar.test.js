'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const V = require('../web/js/vectorizar.js');

// Imagen sintética: papel blanco con un cuadrado negro de lado 20 en (10,10) y una mancha de 2x2.
function imagen(W, H, dibujar) {
  const g = new Uint8ClampedArray(W * H * 4).fill(255);
  dibujar((x, y) => { const i = (y * W + x) * 4; g[i] = g[i + 1] = g[i + 2] = 0; });
  return g;
}
const cuadrado = (W, H) => imagen(W, H, p => {
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) p(x, y);
  p(45, 45); p(46, 45); p(45, 46); p(46, 46);
});

test('grises y umbral automático separan tinta y papel', () => {
  const rgba = cuadrado(60, 60), gris = V.aGrises(rgba, 60, 60);
  const u = V.umbralOtsu(gris);
  assert.ok(u > 0 && u < 255);
  const bin = V.binarizar(gris, u);
  assert.equal(bin[15 * 60 + 15], 1);
  assert.equal(bin[2 * 60 + 2], 0);
});

test('lo transparente cuenta como papel', () => {
  const g = V.aGrises(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1);
  assert.equal(g[0], 255);
});

test('limpiar manchas quita lo chico y deja lo grande', () => {
  const bin = V.binarizar(V.aGrises(cuadrado(60, 60), 60, 60), 128);
  const limpio = V.limpiarManchas(bin, 60, 60, 10);
  assert.equal(limpio[45 * 60 + 45], 0);
  assert.equal(limpio[20 * 60 + 20], 1);
});

test('contornos: un cuadrado da un anillo con el área esperada', () => {
  const bin = V.binarizar(V.aGrises(cuadrado(60, 60), 60, 60), 128);
  const limpio = V.limpiarManchas(bin, 60, 60, 10);
  const an = V.contornos(limpio, 60, 60);
  assert.equal(an.length, 1);
  // Entre centros de píxel el cuadrado de 20x20 mide 20x20 entre puntos medios; las esquinas se cortan un poco.
  assert.ok(Math.abs(Math.abs(V.area(an[0])) - 20 * 20) < 12, 'área ' + V.area(an[0]));
});

test('contornos: un anillo (con agujero) da dos contornos', () => {
  const rgba = imagen(60, 60, p => { for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) if (x < 18 || x > 31 || y < 18 || y > 31) p(x, y); });
  const bin = V.binarizar(V.aGrises(rgba, 60, 60), 128);
  assert.equal(V.contornos(bin, 60, 60).length, 2);
});

test('simplificar: Douglas-Peucker deja las esquinas', () => {
  const linea = [[0, 0], [5, 0.1], [10, 0], [10, 5], [10, 10]];
  assert.deepEqual(V.simplificar(linea, 0.5), [[0, 0], [10, 0], [10, 10]]);
});

test('simplificarAnillo: el cuadrado queda en pocos vértices', () => {
  const bin = V.binarizar(V.aGrises(cuadrado(60, 60), 60, 60), 128);
  const an = V.contornos(V.limpiarManchas(bin, 60, 60, 10), 60, 60)[0];
  const s = V.simplificarAnillo(an, 1);
  assert.ok(s.length >= 4 && s.length <= 12, 'vértices ' + s.length);
});

test('líneas: un trazo grueso se adelgaza a una sola línea', () => {
  const rgba = imagen(60, 40, p => { for (let y = 18; y < 23; y++) for (let x = 5; x < 55; x++) p(x, y); });
  const r = V.vectorizar(rgba, 60, 40, { modo: 'lineas', areaMin: 10, suavizado: 1, umbral: 128 });
  assert.equal(r.trazos.length, 1);
  const t = r.trazos[0].puntos;
  assert.ok(Math.abs(t[0][1] - 20) <= 2 && Math.abs(t.at(-1)[1] - 20) <= 2);
  assert.ok(Math.abs(t.at(-1)[0] - t[0][0]) > 40);
});

test('vectorizar contornos: ignora la mancha y devuelve el cuadrado', () => {
  const r = V.vectorizar(cuadrado(60, 60), 60, 60, { modo: 'contornos', areaMin: 12, suavizado: 1 });
  assert.equal(r.trazos.length, 1);
  assert.equal(r.trazos[0].cerrado, true);
  assert.equal(r.ancho, 60);
});

test('un umbral muy bajo no encuentra tinta', () => {
  const r = V.vectorizar(cuadrado(60, 60), 60, 60, { umbral: 0, modo: 'contornos' });
  assert.equal(r.trazos.length, 0);
});

test('líneas: un trazo diagonal grueso da una sola línea (sin escalones)', () => {
  const rgba = imagen(120, 100, p => {
    for (let x = 10; x < 110; x++) { const y = Math.round(10 + (x - 10) * 0.8); for (let dy = -3; dy <= 3; dy++) p(x, y + dy); }
  });
  const r = V.vectorizar(rgba, 120, 100, { modo: 'lineas', areaMin: 12, suavizado: 1, umbral: 128 });
  assert.equal(r.trazos.length, 1);
  assert.ok(r.trazos[0].puntos.length <= 6, 'puntos ' + r.trazos[0].puntos.length);
});
