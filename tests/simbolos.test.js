'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../web/js/objetos.js');
const S = require('../web/js/simbolos.js');

const m = { entrePuntos: 2, grilla: { px: 2.05, py: 2.02 } };
let n = 0;
const nuevoId = pre => pre + (++n);
const op = extra => Object.assign({ x: 100, y: 80, tam: 8, nuevoId, ordenBase: 0, medidas: m }, extra);

test('están los símbolos pedidos', () => {
  const ids = S.LISTA.map(s => s.id);
  for (const id of ['flecha-norte', 'escala', 'capital', 'ciudad', 'interes', 'escuela', 'puente', 'rio', 'ruta']) assert.ok(ids.includes(id), id);
});

test('cada símbolo mide al menos 6 mm aunque se pida más chico', () => {
  for (const s of S.LISTA) {
    const r = S.construir(s.id, op({ tam: 1 }));
    assert.equal(r.tam, 6, s.id);
    assert.ok(Math.max(r.caja.ancho, r.caja.alto) >= 6, `${s.id}: ${r.caja.ancho} x ${r.caja.alto}`);
  }
  for (const id of ['capital', 'ciudad', 'interes', 'escuela']) {
    const r = S.construir(id, op({ tam: 6 }));
    assert.ok(r.caja.ancho >= 6 && r.caja.alto >= 6, id);
  }
});

test('son objetos editables comunes, agrupados y con ids distintos', () => {
  for (const s of S.LISTA) {
    const r = S.construir(s.id, op());
    assert.ok(r.objetos.length >= 1);
    const grupos = new Set(r.objetos.map(o => o.grupo));
    assert.equal(grupos.size, 1);
    assert.ok([...grupos][0]);
    assert.equal(new Set(r.objetos.map(o => o.id)).size, r.objetos.length);
    for (const o of r.objetos) {
      assert.ok(['linea', 'polilinea', 'poligono', 'rectangulo', 'elipse', 'punto'].includes(o.tipo));
      assert.equal(o.capa, 'dibujo');
      assert.equal(o.nombre, S.LISTA.find(q => q.id === s.id).nombre);
      assert.ok(O.objetoAPuntos(o, m).length >= 1, `${s.id} ${o.tipo} no genera puntos`);
    }
  }
});

test('queda centrado en el punto pedido (ajustado a la grilla)', () => {
  const r = S.construir('capital', op({ x: 100, y: 80, tam: 10 }));
  const cx = (r.caja.x0 + r.caja.x1) / 2, cy = (r.caja.y0 + r.caja.y1) / 2;
  assert.ok(Math.abs(cx - 100) <= 2.05, String(cx));
  assert.ok(Math.abs(cy - 80) <= 2.02, String(cy));
});

test('con la hoja como límite, el símbolo no se sale', () => {
  for (const s of S.LISTA) {
    for (const [x, y] of [[-50, -50], [1000, 1000], [0, 0], [297, 210]]) {
      const r = S.construir(s.id, op({ x, y, hoja: [297, 210] }));
      assert.ok(r.caja.x0 >= 0 && r.caja.y0 >= 0, `${s.id} ${x},${y}`);
      assert.ok(r.caja.x1 <= 297 && r.caja.y1 <= 210, `${s.id} ${x},${y}: ${r.caja.x1},${r.caja.y1}`);
    }
  }
});

test('el tamaño escala las medidas y la ruta usa punto y raya', () => {
  const a = S.construir('escala', op({ tam: 8 })), b = S.construir('escala', op({ tam: 16 }));
  assert.ok(b.caja.ancho > a.caja.ancho * 1.8);
  assert.equal(S.construir('ruta', op()).objetos[0].linea, 'puntoraya');
  assert.throws(() => S.construir('inexistente', op()));
  assert.equal(S.tamValido(''), 8);
  assert.equal(S.tamValido(3), 6);
});
