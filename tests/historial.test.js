'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../web/js/historial.js');

/** Simula un documento de texto: cada acción lo cambia y se registra antes. */
function sesion() {
  const est = H.nuevo();
  let doc = 'A';
  return {
    est,
    get doc() { return doc; },
    hacer(nombre, nuevo) { H.registrar(est, doc, nombre); doc = nuevo; },
    deshacer() { const j = H.deshacer(est, doc); if (j !== null) doc = j; return j; },
    rehacer() { const j = H.rehacer(est, doc); if (j !== null) doc = j; return j; },
    irA(q) { const j = H.irA(est, q, doc); if (j !== null) doc = j; return j; },
    tiempo() { return H.lineaDeTiempo(est, doc); }
  };
}

test('la línea de tiempo lista estado inicial y cada acción con su nombre', () => {
  const s = sesion();
  assert.deepEqual(s.tiempo().estados.map(e => e.nombre), ['Estado inicial']);
  s.hacer('Crear línea', 'B');
  s.hacer('Pegar', 'C');
  const t = s.tiempo();
  assert.deepEqual(t.estados.map(e => e.nombre), ['Estado inicial', 'Crear línea', 'Pegar']);
  assert.deepEqual(t.estados.map(e => e.json), ['A', 'B', 'C']);
  assert.equal(t.actual, 2);
});

test('deshacer y rehacer siguen el historial y conservan los nombres', () => {
  const s = sesion();
  s.hacer('Crear línea', 'B');
  s.hacer('Pegar', 'C');
  assert.equal(s.deshacer(), 'B');
  assert.equal(s.doc, 'B');
  let t = s.tiempo();
  assert.deepEqual(t.estados.map(e => e.nombre), ['Estado inicial', 'Crear línea', 'Pegar']);
  assert.equal(t.actual, 1);
  assert.equal(s.rehacer(), 'C');
  assert.equal(s.doc, 'C');
  assert.equal(s.tiempo().actual, 2);
  assert.equal(s.rehacer(), null);
  s.deshacer(); s.deshacer();
  assert.equal(s.deshacer(), null);
  assert.equal(s.doc, 'A');
});

test('irA vuelve a un paso anterior y se puede avanzar de nuevo', () => {
  const s = sesion();
  s.hacer('uno', 'B'); s.hacer('dos', 'C'); s.hacer('tres', 'D');
  assert.equal(s.irA(1), 'B');
  assert.equal(s.doc, 'B');
  assert.deepEqual(s.tiempo().estados.map(e => e.json), ['A', 'B', 'C', 'D']);
  assert.equal(s.tiempo().actual, 1);
  assert.equal(s.est.pasados.length, 1);
  assert.equal(s.est.futuros.length, 2);
  assert.equal(s.irA(3), 'D');
  assert.equal(s.tiempo().actual, 3);
  assert.equal(s.est.futuros.length, 0);
  assert.equal(s.irA(0), 'A');
  assert.equal(s.rehacer(), 'B');
  assert.equal(s.irA(0), 'A');
  assert.equal(s.irA(0), null);          // ya está ahí
  assert.equal(s.irA(9), null);
  assert.equal(s.irA(-1), null);
});

test('después de volver atrás, un cambio nuevo descarta lo deshecho', () => {
  const s = sesion();
  s.hacer('uno', 'B'); s.hacer('dos', 'C');
  s.irA(1);
  s.hacer('otro', 'X');
  assert.deepEqual(s.tiempo().estados.map(e => e.json), ['A', 'B', 'X']);
  assert.deepEqual(s.tiempo().estados.map(e => e.nombre), ['Estado inicial', 'uno', 'otro']);
  assert.equal(s.est.futuros.length, 0);
});

test('mantiene las mismas listas en el lugar (otras partes las referencian)', () => {
  const s = sesion();
  const p = s.est.pasados, f = s.est.futuros;
  s.hacer('uno', 'B'); s.hacer('dos', 'C');
  s.irA(0);
  assert.equal(s.est.pasados, p);
  assert.equal(s.est.futuros, f);
  assert.equal(f.length, 2);
});

test('nombrar completa solo una vez el nombre que faltaba', () => {
  const est = H.nuevo();
  const e = H.registrar(est, 'A');
  assert.equal(H.nombrar(e, H.nombrePorMotivo('mover')), true);
  assert.equal(H.nombrar(e, 'otro'), false);
  assert.equal(e.nombre, 'Mover');
  assert.equal(H.nombrePorMotivo('inexistente'), 'Cambio');
  const t = H.lineaDeTiempo(est, 'B');
  assert.equal(t.estados[1].nombre, 'Mover');
  const sinNombre = H.nuevo();
  H.registrar(sinNombre, 'A');
  assert.equal(H.lineaDeTiempo(sinNombre, 'B').estados[1].nombre, 'Cambio');
});

test('el historial guarda como mucho MAX pasos', () => {
  const est = H.nuevo();
  for (let i = 0; i < H.MAX + 20; i++) H.registrar(est, 'd' + i, 'n' + i);
  assert.equal(est.pasados.length, H.MAX);
  assert.equal(est.pasados[0].json, 'd20');
});
