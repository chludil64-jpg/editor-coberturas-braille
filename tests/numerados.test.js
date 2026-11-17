'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../web/js/grilla.js');
const O = require('../web/js/objetos.js');
const N = require('../web/js/numerados.js');
const perfil = require('../perfiles/everest_v4.json');

let k = 0;
const nuevoId = pre => pre + (++k);
const hoja = () => ({ ancho: 297, alto: 210, cuadros: [], objetos: [], trazos: [], capasVisibles: {} });
const ctx = extra => Object.assign({ medidas: G.medidasDePerfil(perfil, 297, 210), perfil, nuevoId }, extra);

test('siguiente número: empieza en 1 y rellena huecos', () => {
  const p = hoja();
  assert.equal(N.siguienteNumero(p), 1);
  p.cuadros.push(N.nuevoRotulo(1, 20, 20, { nuevoId }), N.nuevoRotulo(2, 40, 20, { nuevoId }), N.nuevoRotulo(4, 60, 20, { nuevoId }));
  assert.equal(N.siguienteNumero(p), 3);
  assert.deepEqual(N.numerosUsados(p), [1, 2, 4]);
});

test('el rótulo es un cuadro braille con el número (signo de número + cifra)', () => {
  const c = N.nuevoRotulo(12, 20.4, 30, { nuevoId });
  assert.equal(c.texto, '12');
  assert.equal(c.capa, 'rotulos');
  assert.equal(c.numerado, 12);
  const calc = G.calcularCuadro(c, ctx().medidas);
  assert.equal(calc.celdas, 3);              // signo de número + 1 + 2
  assert.deepEqual(calc.renglones[0][0], [3, 4, 5, 6]);
});

test('la clave tiene una entrada por número, en la capa claves, con su texto', () => {
  const p = hoja();
  p.cuadros.push(N.nuevoRotulo(1, 20, 20, { nuevoId, descripcion: 'Plaza' }), N.nuevoRotulo(2, 80, 40, { nuevoId, descripcion: 'Escuela' }));
  const r = N.construirClave(p, ctx());
  assert.equal(r.cuadros.length, 2);
  assert.ok(r.cuadros.every(c => c.capa === 'claves' && N.esEntrada(c)));
  assert.equal(r.cuadros[0].texto, '1 Plaza');
  assert.equal(r.cuadros[1].texto, '2 Escuela');
  assert.ok(r.cuadros[1].y > r.cuadros[0].y, 'la entrada 2 va debajo de la 1');
  assert.ok(r.entra);
  N.aplicarClave(p, r);
  assert.equal(p.cuadros.length, 4);
});

test('actualizar la descripción cambia el texto de la entrada y conserva su lugar e id', () => {
  const p = hoja();
  p.cuadros.push(N.nuevoRotulo(1, 20, 20, { nuevoId, descripcion: 'Plaza' }));
  N.aplicarClave(p, N.construirClave(p, ctx()));
  const antes = p.cuadros.find(N.esEntrada);
  antes.x += 10;                           // el usuario la movió
  p.cuadros.find(N.esRotulo).descripcion = 'Plaza principal';
  N.aplicarClave(p, N.construirClave(p, ctx()));
  const despues = p.cuadros.filter(N.esEntrada);
  assert.equal(despues.length, 1);
  assert.equal(despues[0].id, antes.id);
  assert.equal(despues[0].texto, '1 Plaza principal');
  assert.equal(despues[0].x, antes.x);
  N.aplicarClave(p, N.construirClave(p, ctx({ reacomodar: true })));
  assert.notEqual(p.cuadros.find(N.esEntrada).x, antes.x);
});

test('una entrada nueva va debajo de las que ya estaban, sin encimarse', () => {
  const p = hoja();
  p.cuadros.push(N.nuevoRotulo(1, 20, 20, { nuevoId, descripcion: 'Plaza' }));
  N.aplicarClave(p, N.construirClave(p, ctx()));
  p.cuadros.push(N.nuevoRotulo(2, 50, 20, { nuevoId, descripcion: 'Escuela' }));
  p.cuadros.push(N.nuevoRotulo(3, 80, 20, { nuevoId, descripcion: 'Puente' }));
  N.aplicarClave(p, N.construirClave(p, ctx()));
  const e = p.cuadros.filter(N.esEntrada).sort((a, b) => a.claveNumero - b.claveNumero);
  assert.equal(e.length, 3);
  const m = ctx().medidas;
  for (let i = 0; i < 2; i++) assert.ok(e[i + 1].y >= e[i].y + G.calcularCuadro(e[i], m).alto, 'entradas encimadas');
});

test('al quitar un rótulo desaparece su entrada y sin rótulos no queda clave', () => {
  const p = hoja();
  p.cuadros.push(N.nuevoRotulo(1, 20, 20, { nuevoId }), N.nuevoRotulo(2, 40, 20, { nuevoId }));
  N.aplicarClave(p, N.construirClave(p, ctx()));
  p.cuadros = p.cuadros.filter(c => c.numerado !== 2);
  N.aplicarClave(p, N.construirClave(p, ctx()));
  assert.deepEqual(p.cuadros.filter(N.esEntrada).map(c => c.claveNumero), [1]);
  p.cuadros = p.cuadros.filter(c => c.numerado !== 1);
  N.aplicarClave(p, N.construirClave(p, ctx()));
  assert.equal(p.cuadros.length, 0);
});

test('la clave avisa si se encima con el dibujo', () => {
  const p = hoja();
  p.objetos.push(O.crearObjeto('rectangulo', { id: 'r', x: 20, y: 10, ancho: 250, alto: 195 }));
  p.cuadros.push(N.nuevoRotulo(1, 20, 20, { nuevoId, descripcion: 'Plaza' }));
  const r = N.construirClave(p, ctx());
  assert.equal(r.entra, false);
});
