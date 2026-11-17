'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../web/js/calco.js');
const rect = (x0, y0, x1, y1) => ({ tipo: 'trazo', cerrado: true, puntos: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
const seg = (a, b) => ({ tipo: 'trazo', cerrado: false, puntos: [a, b] });

test('rectángulo alineado pasa a objeto rectangulo con nombre', () => {
  const r = C.trazadosAObjetos([rect(10, 10, 50, 30)], { minimo: 5 });
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'rectangulo');
  assert.equal(r[0].nombre, 'Recuadro 1');
  assert.deepEqual(r[0].datos, { x: 10, y: 10, ancho: 40, alto: 20 });
});
test('segmentos contiguos se unen en una polilínea y uno suelto queda como línea', () => {
  const r = C.trazadosAObjetos([seg([0, 0], [20, 0]), seg([20, 0], [20, 20]), seg([60, 60], [90, 60])], { minimo: 5 });
  assert.deepEqual(r.map(o => o.tipo).sort(), ['linea', 'polilinea']);
  assert.equal(r.find(o => o.tipo === 'polilinea').datos.vertices.length, 3);
});
test('segmentos que cierran una figura dan un polígono; un rombo no es rectángulo', () => {
  const r = C.trazadosAObjetos([seg([0, 10], [10, 0]), seg([10, 0], [20, 10]), seg([20, 10], [10, 20]), seg([10, 20], [0, 10])], {});
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'poligono');
});
test('descarta duplicados exactos (incluso invertidos) y segmentos casi nulos', () => {
  const r = C.trazadosAObjetos([seg([0, 0], [30, 0]), seg([30, 0], [0, 0]), seg([5, 5], [5.05, 5]), rect(0, 20, 30, 40), rect(0, 20, 30, 40)], {});
  assert.equal(r.length, 2);
});
test('respeta el largo mínimo y el filtro de rellenos', () => {
  const v = [rect(0, 0, 3, 3), { ...rect(0, 0, 40, 40), tipo: 'relleno' }];
  assert.equal(C.trazadosAObjetos(v, { minimo: 5 }).length, 0);
  assert.equal(C.trazadosAObjetos(v, { minimo: 5, rellenos: true }).length, 1);
});
test('los datos sirven para crearObjeto y objetoAPuntos', () => {
  const O = require('../web/js/objetos.js');
  for (const s of C.trazadosAObjetos([rect(0, 0, 20, 20), seg([30, 0], [60, 0])], {})) {
    const o = O.crearObjeto(s.tipo, Object.assign({ id: 'x' }, s.datos));
    assert.ok(O.objetoAPuntos(o, { entrePuntos: 2, grilla: { px: 2, py: 2 } }).length > 5);
  }
});
