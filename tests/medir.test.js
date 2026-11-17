'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../web/js/medir.js');

test('número con coma y un decimal', () => {
  assert.equal(M.num(42.5), '42,5');
  assert.equal(M.num(40), '40');
  assert.equal(M.num(-3.24), '-3,2');
  assert.equal(M.num(0.01), '0');
});
test('ángulo: derecha 0, arriba 90, izquierda 180, abajo 270', () => {
  assert.equal(M.angulo([0, 0], [10, 0]), 0);
  assert.equal(M.angulo([0, 0], [0, -10]), 90);
  assert.equal(M.angulo([0, 0], [-10, 0]), 180);
  assert.equal(M.angulo([0, 0], [0, 10]), 270);
  assert.equal(M.angulo([5, 5], [5, 5]), 0);
});
test('segmento 3-4-5', () => {
  const s = M.segmento([0, 0], [3, -4]);
  assert.equal(s.largo, 5);
  assert.equal(s.dx, 3);
  assert.equal(s.dy, -4);
  assert.equal(s.angulo, 53.1);
});
test('describir línea, caja, mover y rotar', () => {
  assert.equal(M.describir('linea', { a: [0, 0], b: [10, 0] }).corto, '10 mm · 0°');
  assert.match(M.describir('linea', { a: [0, 0], b: [0, -12.34] }).largo, /Largo 12,3 milímetros, ángulo 90 grados/);
  assert.equal(M.describir('caja', { ancho: -40, alto: 20.25 }).corto, '40 × 20,3 mm');
  assert.equal(M.describir('mover', { dx: 5, dy: -2 }).corto, 'Δx 5 · Δy -2 mm');
  assert.equal(M.describir('rotar', { grados: 15 }).corto, '15°');
});
