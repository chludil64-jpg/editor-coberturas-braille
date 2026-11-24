'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../web/js/autoguardado.js');

const copia = (fecha, extra) => Object.assign({ id: fecha, fecha, nombre: '', paginas: 1, texto: '{}' }, extra);

test('rotarCopias: conserva las 3 más nuevas y manda a borrar el resto', () => {
  let lista = [];
  for (const f of [100, 200, 300]) lista = A.rotarCopias(lista, copia(f)).conservar;
  assert.deepEqual(lista.map(c => c.fecha), [300, 200, 100]);
  const r = A.rotarCopias(lista, copia(400));
  assert.deepEqual(r.conservar.map(c => c.fecha), [400, 300, 200]);
  assert.deepEqual(r.borrar.map(c => c.fecha), [100]);
});

test('rotarCopias: una copia con el mismo id reemplaza a la anterior y no suma', () => {
  const r = A.rotarCopias([copia(100), copia(200)], copia(200, { texto: 'nuevo' }));
  assert.equal(r.conservar.length, 2);
  assert.equal(r.conservar[0].texto, 'nuevo');
  assert.equal(r.borrar.length, 0);
});

test('rotarCopias: una copia más vieja que las 3 existentes se descarta a sí misma', () => {
  const r = A.rotarCopias([copia(200), copia(300), copia(400)], copia(100));
  assert.deepEqual(r.conservar.map(c => c.fecha), [400, 300, 200]);
  assert.deepEqual(r.borrar.map(c => c.fecha), [100]);
});

test('rotarCopias: no modifica la lista original', () => {
  const lista = [copia(1), copia(2)];
  A.rotarCopias(lista, copia(3));
  assert.equal(lista.length, 2);
});

test('copiaParaOfrecer: sin copias o con todas anteriores al último guardado no ofrece nada', () => {
  assert.equal(A.copiaParaOfrecer([], { ultimoGuardado: 0 }), null);
  assert.equal(A.copiaParaOfrecer([copia(100), copia(200)], { ultimoGuardado: 200 }), null);
});

test('copiaParaOfrecer: ofrece la más nueva si es posterior al último guardado', () => {
  const c = A.copiaParaOfrecer([copia(100), copia(500), copia(300)], { ultimoGuardado: 250 });
  assert.equal(c.fecha, 500);
});

test('copiaParaOfrecer: sin guardado previo ofrece la copia más nueva', () => {
  assert.equal(A.copiaParaOfrecer([copia(10), copia(20)], {}).fecha, 20);
  assert.equal(A.copiaParaOfrecer([copia(10), copia(20)]).fecha, 20);
});

test('copiaParaOfrecer: una copia descartada no se vuelve a ofrecer, pero sí una más nueva', () => {
  assert.equal(A.copiaParaOfrecer([copia(500)], { ultimoGuardado: 100, ignorarHasta: 500 }), null);
  assert.equal(A.copiaParaOfrecer([copia(500), copia(600)], { ultimoGuardado: 100, ignorarHasta: 500 }).fecha, 600);
});

test('hayQueAutoguardar: solo con cambios sin guardar y distintos de la última copia', () => {
  assert.equal(A.hayQueAutoguardar({ sucio: false, version: 3, versionAuto: 1 }), false);
  assert.equal(A.hayQueAutoguardar({ sucio: true, version: 3, versionAuto: 3 }), false);
  assert.equal(A.hayQueAutoguardar({ sucio: true, version: 4, versionAuto: 3 }), true);
  assert.equal(A.hayQueAutoguardar({ sucio: true, version: 1, versionAuto: undefined }), true);
  assert.equal(A.hayQueAutoguardar(null), false);
});

test('formatoHora y formatoFecha: dos dígitos y fecha en orden día/mes/año', () => {
  const ms = new Date(2026, 10, 4, 9, 5).getTime();
  assert.equal(A.formatoHora(ms), '09:05');
  assert.equal(A.formatoFecha(ms), '04/11/2026 a las 09:05');
});

test('constantes: 3 copias y cada 2 minutos', () => {
  assert.equal(A.MAX_COPIAS, 3);
  assert.equal(A.INTERVALO_MS, 120000);
});
