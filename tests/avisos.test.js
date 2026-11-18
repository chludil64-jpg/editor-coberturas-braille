// Pruebas del agrupado de avisos.  Ejecutar:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../web/js/grilla.js');

test('agruparAvisos: idénticos se suman con la cantidad', () => {
  const lista = [];
  for (let i = 0; i < 37; i++) lista.push({ nivel: 'aviso', id: 'c' + i, mensaje: 'Puntos de objetos distintos a menos de dos pasos de grilla.' });
  const g = G.agruparAvisos(lista);
  assert.equal(g.length, 1);
  assert.equal(g[0].mensaje, 'Puntos de objetos distintos a menos de dos pasos de grilla (37 casos).');
  assert.equal(g[0].cuenta, 37);
  assert.equal(g[0].id, undefined);
});

test('agruparAvisos: un solo caso conserva id y texto', () => {
  const g = G.agruparAvisos([{ nivel: 'error', id: 'x', mensaje: 'Algo malo.' }]);
  assert.deepEqual(g, [{ nivel: 'error', mensaje: 'Algo malo.', cuenta: 1, id: 'x' }]);
});

test('agruparAvisos: mismo texto en distinto nivel no se mezcla', () => {
  const g = G.agruparAvisos([
    { nivel: 'aviso', mensaje: 'Igual.' },
    { nivel: 'info', mensaje: 'Igual.' },
    { nivel: 'aviso', mensaje: 'Igual.' }
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].nivel, 'aviso');
  assert.equal(g[0].mensaje, 'Igual (2 casos).');
  assert.equal(g[1].nivel, 'info');
  assert.equal(g[1].mensaje, 'Igual.');
});

test('agruparAvisos: ordena por gravedad y conserva el orden dentro de cada nivel', () => {
  const g = G.agruparAvisos([
    { nivel: 'info', mensaje: 'I1.' },
    { nivel: 'aviso', mensaje: 'A1.' },
    { nivel: 'error', mensaje: 'E1.' },
    { nivel: 'aviso', mensaje: 'A2.' },
    { nivel: 'error', mensaje: 'E2.' },
    { nivel: 'info', mensaje: 'I2.' }
  ]);
  assert.deepEqual(g.map(a => a.mensaje), ['E1.', 'E2.', 'A1.', 'A2.', 'I1.', 'I2.']);
});

test('agruparAvisos: lista vacía o ausente', () => {
  assert.deepEqual(G.agruparAvisos([]), []);
  assert.deepEqual(G.agruparAvisos(undefined), []);
});
