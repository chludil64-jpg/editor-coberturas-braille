'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../web/js/objetos.js');
const P = require('../web/js/plantillas.js');

const pagina = () => ({
  ancho: 210, alto: 297, pdfPagina: 3, nombre: 'Boleta', trazos: [], capasVisibles: { claves: false },
  cuadros: [{ id: 'q1', texto: 'Nombre:', x: 10, y: 10, alineacion: 'izquierda' }],
  objetos: [
    O.crearObjeto('rectangulo', { id: 'r1', x: 5, y: 5, ancho: 200, alto: 40, grupo: 'g1' }),
    O.crearObjeto('linea', { id: 'l1', vertices: [[5, 50], [200, 50]], grupo: 'g1' }),
    O.crearObjeto('referencia', { id: 'ref', src: 'data:image/png;base64,AAAA', x: 0, y: 0, ancho: 210, alto: 297 })
  ]
});
const memoria = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
let n = 0;
const nuevoId = pre => pre + (++n);

test('crear plantilla: copia la página sin el PDF ni la imagen de referencia', () => {
  const p = pagina();
  const pl = P.crearPlantilla(p, '  Boleta A4  ');
  assert.equal(pl.nombre, 'Boleta A4');
  assert.equal(pl.formato, P.FORMATO);
  assert.equal(pl.ancho, 210);
  assert.equal(pl.cuadros.length, 1);
  assert.equal(pl.objetos.length, 2);
  assert.ok(!pl.objetos.some(o => o.tipo === 'referencia'));
  assert.ok(!('pdfPagina' in pl));
  pl.cuadros[0].texto = 'otro';
  assert.equal(p.cuadros[0].texto, 'Nombre:');
  assert.throws(() => P.crearPlantilla(p, '   '), /nombre/);
});

test('validar rechaza archivos que no son plantillas', () => {
  assert.throws(() => P.validar({ formato: 'otra-cosa' }), /no es una plantilla/);
  assert.throws(() => P.validar(null));
  assert.throws(() => P.validar({ formato: P.FORMATO, nombre: 'x', ancho: 0, alto: 10, cuadros: [], objetos: [] }), /tamaño/);
  assert.doesNotThrow(() => P.validar(P.crearPlantilla(pagina(), 'ok')));
});

test('página desde plantilla: ids nuevos, grupo renombrado y misma hoja', () => {
  const pl = P.crearPlantilla(pagina(), 'Boleta');
  const nueva = P.paginaDesdePlantilla(pl, nuevoId);
  assert.equal(nueva.ancho, 210);
  assert.equal(nueva.alto, 297);
  assert.equal(nueva.nombre, 'Boleta');
  assert.equal(nueva.pdfPagina, null);
  assert.deepEqual(nueva.capasVisibles, { claves: false });
  assert.ok(nueva.objetos.every(o => !['r1', 'l1'].includes(o.id)));
  assert.equal(nueva.objetos[0].grupo, nueva.objetos[1].grupo);
  assert.notEqual(nueva.objetos[0].grupo, 'g1');
  assert.notEqual(nueva.cuadros[0].id, 'q1');
  const otra = P.paginaDesdePlantilla(pl, nuevoId);
  assert.notEqual(otra.objetos[0].id, nueva.objetos[0].id);
});

test('guardar, listar, reemplazar y quitar en el almacenamiento', () => {
  const st = memoria();
  assert.deepEqual(P.leerLista(st), []);
  assert.equal(P.guardarEnLista(st, P.crearPlantilla(pagina(), 'Boleta')), false);
  assert.equal(P.guardarEnLista(st, P.crearPlantilla(pagina(), 'Otra')), false);
  assert.equal(P.guardarEnLista(st, P.crearPlantilla(pagina(), 'boleta')), true);   // mismo nombre: reemplaza
  assert.deepEqual(P.leerLista(st).map(p => p.nombre), ['boleta', 'Otra']);
  assert.deepEqual(P.quitarDeLista(st, 'Otra').map(p => p.nombre), ['boleta']);
  assert.equal(P.leerLista(st).length, 1);
});

test('leerLista ignora datos rotos o inválidos', () => {
  const st = memoria();
  st.setItem(P.CLAVE, '{no es json');
  assert.deepEqual(P.leerLista(st), []);
  st.setItem(P.CLAVE, JSON.stringify([{ formato: 'x' }, P.crearPlantilla(pagina(), 'Buena')]));
  assert.deepEqual(P.leerLista(st).map(p => p.nombre), ['Buena']);
});

test('nombre de archivo y resumen', () => {
  assert.equal(P.nombreArchivo({ nombre: 'Boleta: año 1/2' }), 'Boleta_año_1_2.plantilla.json');
  assert.match(P.resumen(P.crearPlantilla(pagina(), 'x')), /1 cuadros braille, 2 objetos, hoja de 210 × 297 mm/);
});
