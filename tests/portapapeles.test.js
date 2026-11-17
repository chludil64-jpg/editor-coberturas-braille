'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../web/js/objetos.js');
const P = require('../web/js/portapapeles.js');

const pagina = () => ({
  objetos: [
    O.crearObjeto('rectangulo', { id: 'a', x: 10, y: 10, ancho: 20, alto: 10, grupo: 'g1' }),
    O.crearObjeto('linea', { id: 'b', vertices: [[0, 0], [10, 10]], grupo: 'g1' }),
    O.crearObjeto('elipse', { id: 'c', x: 50, y: 50, ancho: 10, alto: 10 })
  ],
  cuadros: [{ id: 'q', texto: 'hola', x: 5, y: 6, alineacion: 'centro' }]
});
let n = 0;
const nuevoId = pre => pre + (++n);

test('capturar copia solo lo elegido y no comparte referencias', () => {
  const p = pagina();
  const b = P.capturar(p, ['a', 'c'], ['q'], 2);
  assert.equal(b.objetos.length, 2);
  assert.equal(b.cuadros.length, 1);
  assert.equal(b.origen, 2);
  b.objetos[0].x = 999;
  assert.equal(p.objetos[0].x, 10);
  assert.ok(!P.vacio(b));
  assert.ok(P.vacio(P.capturar(p, [], [], 0)));
  assert.ok(P.vacio(null));
});

test('desplazamiento: misma página corre y otra página queda en el lugar', () => {
  const b = P.capturar(pagina(), ['a'], [], 0);
  assert.deepEqual(P.desplazamiento(b, 0, [2, 2]), [4, 4]);
  assert.deepEqual(P.desplazamiento(b, 1, [2, 2]), [0, 0]);
  b.pegadosEn = { 0: 1 };
  assert.deepEqual(P.desplazamiento(b, 0, [2, 2]), [8, 8]);
  assert.deepEqual(P.desplazamiento(b, 1, [2, 2]), [0, 0]);
  b.pegadosEn[1] = 1;
  assert.deepEqual(P.desplazamiento(b, 1, [2, 2]), [4, 4]);
  b.pegadosEn = {};
  assert.deepEqual(P.desplazamiento(b, 0, [2.05, 2.02]), [4.1, 4.04]);
});

test('preparar da ids nuevos, mantiene el grupo entre los copiados y mueve todo', () => {
  const b = P.capturar(pagina(), ['a', 'b', 'c'], ['q'], 0);
  const r = P.preparar(b, { nuevoId, dx: 4, dy: 6, ordenBase: 10 });
  assert.equal(r.objetos.length, 3);
  assert.ok(r.objetos.every(o => !['a', 'b', 'c'].includes(o.id)));
  assert.equal(r.objetos[0].x, 14);
  assert.equal(r.objetos[0].y, 16);
  assert.deepEqual(r.objetos[1].vertices, [[4, 6], [14, 16]]);
  assert.equal(r.objetos[0].grupo, r.objetos[1].grupo);
  assert.notEqual(r.objetos[0].grupo, 'g1');
  assert.equal(r.objetos[2].grupo, null);
  assert.deepEqual(r.objetos.map(o => o.orden), [10, 11, 12]);
  assert.equal(r.cuadros[0].x, 9);
  assert.equal(r.cuadros[0].y, 12);
  assert.equal(r.cuadros[0].alineacion, 'libre');
  assert.notEqual(r.cuadros[0].id, 'q');
});

test('pegar en la misma posición no cambia alineación del cuadro', () => {
  const b = P.capturar(pagina(), [], ['q'], 0);
  const r = P.preparar(b, { nuevoId, dx: 0, dy: 0, ordenBase: 0 });
  assert.equal(r.cuadros[0].alineacion, 'centro');
  assert.equal(r.cuadros[0].x, 5);
});
