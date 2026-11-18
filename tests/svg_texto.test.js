'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const T = require('../web/js/svg_texto.js');

const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'texto.svg'), 'utf8');
const res = T.extraerTextos(xml, 200);          // 1 unidad = 1 mm
const por = t => res.bloques.find(b => b.texto === t);
const cerca = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('texto: extrae solo los textos visibles (no defs ni fill none)', () => {
  assert.deepEqual(res.bloques.map(b => b.texto), ['Hola mundo', 'Primera línea\nSegunda línea', 'Grupo & escala', 'Centrado']);
});

test('texto simple: posición, anclaje start y tamaño', () => {
  const b = por('Hola mundo');
  assert.equal(b.alineacion, 'izquierda');
  cerca(b.x0, 20); cerca(b.tamanoMm, 10);
  assert.ok(b.x1 > b.x0 + 30 && b.x1 < b.x0 + 70, 'ancho estimado razonable');
  assert.ok(b.y0 < 30 && b.y1 > 30, 'la línea base cae dentro de la caja');
});

test('tspan multilínea: un solo bloque con dos renglones', () => {
  const b = por('Primera línea\nSegunda línea');
  assert.equal(b.lineas.length, 2);
  cerca(b.chunks[0].y, 60); cerca(b.chunks[1].y, 70);
  cerca(b.x0, 20);
});

test('grupo con transform: traslación y escala se aplican a posición y tamaño', () => {
  const b = por('Grupo & escala');
  cerca(b.chunks[0].x, 120); cerca(b.chunks[0].y, 50);
  cerca(b.tamanoMm, 10);
});

test('text-anchor middle: la caja queda centrada en x y alinea al centro', () => {
  const b = por('Centrado');
  assert.equal(b.alineacion, 'centro');
  cerca((b.x0 + b.x1) / 2, 100, 0.01);
  assert.ok(b.x0 < 100 && b.x1 > 100);
});

test('escala al ancho de importación y viewBox con preserveAspectRatio', () => {
  const a = T.extraerTextos(xml, 100).bloques.find(b => b.texto === 'Hola mundo');
  cerca(a.x0, 10); cerca(a.tamanoMm, 5);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="100"><text x="0" y="50" font-size="10">A</text></svg>';
  const r = T.extraerTextos(svg, 200).bloques[0];      // meet: el área visible se amplía hacia los lados (50 u a cada lado)
  cerca(r.chunks[0].x, 50);
});

test('dx/dy, entidades y textPath simple', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="20" font-size="10"><tspan dx="5">M&#225;s</tspan></text>' +
    '<text font-size="10"><textPath href="#p" xmlns:xlink="x">Ruta</textPath></text></svg>';
  const r = T.extraerTextos(svg, 100).bloques;
  assert.equal(r[0].texto, 'Más'); cerca(r[0].chunks[0].x, 15);
  assert.equal(r[1].texto, 'Ruta');
});

test('medir inyectado reemplaza la estimación', () => {
  const r = T.extraerTextos(xml, 200, { medir: (t, sz) => t.length * sz }).bloques.find(b => b.texto === 'Hola mundo');
  cerca(r.x1 - r.x0, 100);
});
