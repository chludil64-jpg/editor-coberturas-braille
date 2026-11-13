// Pruebas de transcripción y del modelo de puntos.  Ejecutar:  node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../web/js/braille_es.js');
const G = require('../web/js/grilla.js');

const L = B.LETRAS;
const MAY = [4, 6], NUM = [3, 4, 5, 6];
const celdas = t => B.transcribir(t).renglones[0];

test('LISTA 160: palabra en mayúsculas y número', () => {
  assert.deepEqual(celdas('LISTA 160'),
    [MAY, MAY, L.l, L.i, L.s, L.t, L.a, [], NUM, [1], [1, 2, 4], [2, 4, 5]]);
});

test('Renovación: mayúscula inicial y ó', () => {
  assert.deepEqual(celdas('Renovación'),
    [MAY, L.r, L.e, L.n, L.o, L.v, L.a, L.c, L.i, [3, 4, 6], L.n]);
});

test('Raúl: ú', () => {
  assert.deepEqual(celdas('Raúl'), [MAY, L.r, L.a, [2, 3, 4, 5, 6], L.l]);
});

test('vocales acentuadas, ü y ñ', () => {
  assert.deepEqual(celdas('áéíóúüñ'),
    [[1, 2, 3, 5, 6], [2, 3, 4, 6], [3, 4], [3, 4, 6], [2, 3, 4, 5, 6], [1, 2, 5, 6], [1, 2, 4, 5, 6]]);
});

test('mayúscula acentuada en palabra en mayúsculas', () => {
  assert.deepEqual(celdas('ÑANDÚ'), [MAY, MAY, L['ñ'], L.a, L.n, L.d, [2, 3, 4, 5, 6]]);
});

test('letra suelta en mayúscula lleva un solo signo', () => {
  assert.deepEqual(celdas('Y DESARROLLO').slice(0, 3), [MAY, L.y, []]);
});

test('opción todo mayúsculas sin signo', () => {
  assert.deepEqual(B.transcribir('LISTA', { mayusculas: 'sin_signo' }).renglones[0],
    [L.l, L.i, L.s, L.t, L.a]);
});

test('opción signo en cada letra', () => {
  assert.deepEqual(B.transcribir('AB', { palabraMayusculas: 'cada_letra' }).renglones[0],
    [MAY, L.a, MAY, L.b]);
});

test('puntuación española', () => {
  assert.deepEqual(celdas('¿Sí? ¡No!'),
    [[2, 6], MAY, L.s, [3, 4], [2, 6], [], [2, 3, 5], MAY, L.n, L.o, [2, 3, 5]]);
  assert.deepEqual(celdas('a, b; c: d. (e) -f "g"'),
    [L.a, [2], [], L.b, [2, 3], [], L.c, [2, 5], [], L.d, [3], [], [1, 2, 6], L.e, [3, 4, 5], [],
      [3, 6], L.f, [], [2, 3, 6], L.g, [2, 3, 6]]);
});

test('números: punto de miles, coma decimal y fecha con barra', () => {
  assert.deepEqual(celdas('1.000'), [NUM, [1], [3], [2, 4, 5], [2, 4, 5], [2, 4, 5]]);
  assert.deepEqual(celdas('2,5'), [NUM, [1, 2], [2], [1, 5]]);
  assert.deepEqual(celdas('13/12'), [NUM, [1], [1, 4], [4, 5, 6], [2, 5, 6], NUM, [1], [1, 2]]);
  // Punto final después de un número: no sigue el modo número
  assert.deepEqual(celdas('3.'), [NUM, [1, 4], [3]]);
});

test('letra a-j después de número lleva interruptor (punto 5)', () => {
  assert.deepEqual(celdas('2a'), [NUM, [1, 2], [5], L.a]);
  assert.deepEqual(celdas('2x'), [NUM, [1, 2], L.x]);
  assert.deepEqual(celdas('2A'), [NUM, [1, 2], MAY, L.a]);
});

test('varios renglones y caracteres desconocidos', () => {
  const t = B.transcribir('PARTIDO CHUBUT\nSOMOS TODOS €');
  assert.equal(t.renglones.length, 2);
  assert.deepEqual(t.sinTranscribir, ['€']);
  assert.equal(t.unicode.split('\n')[0][0], '⠨'); // 46 = bits 8+32 = 0x28
});

test('cuadro: posiciones de los puntos con la celda estándar', () => {
  const c = G.calcularCuadro({ texto: 'l', x: 10, y: 20 }, G.MEDIDAS);
  assert.deepEqual(c.puntos, [[10, 20], [10, 22.5], [10, 25]]);
  const d = G.calcularCuadro({ texto: 'ab\nc', x: 0, y: 0 }, G.MEDIDAS);
  assert.deepEqual(d.puntos, [[0, 0], [6, 0], [6, 2.5], [0, 10], [2.5, 10]]);
  assert.equal(d.ancho, 8.5);
  assert.equal(d.alto, 15);
});

test('cuadro centrado sobre el texto en tinta', () => {
  const c = { texto: 'LISTA 160', tinta: { x0: 29.8, y0: 24.8, x1: 63.9, y1: 34.6 }, alineacion: 'centro', x: 0, y: 0 };
  G.ubicarSegunTinta(c, G.MEDIDAS);
  const calc = G.calcularCuadro(c, G.MEDIDAS);
  assert.equal(calc.celdas, 12);
  assert.ok(Math.abs((c.x + calc.ancho / 2) - (29.8 + 63.9) / 2) < 0.01);
  assert.ok(Math.abs((c.y + calc.alto / 2) - (24.8 + 34.6) / 2) < 0.01);
});

test('partir en renglones', () => {
  const t = G.partirEnRenglones('PARTIDO DE RENOVACIÓN', 90, G.MEDIDAS);
  assert.equal(t, 'PARTIDO DE\nRENOVACIÓN');
});

test('muestreo de formas', () => {
  assert.equal(G.muestrearLinea([0, 0], [10, 0], 2).length, 6);
  const r = G.muestrearRectangulo(0, 0, 10, 4, 2);
  assert.equal(r.length, 14);
  const e = G.muestrearElipse(0, 0, 20, 20, 2);
  for (let i = 0; i < e.length; i++) {
    const a = e[i], b = e[(i + 1) % e.length];
    assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - 2) < 0.15);
  }
  const t = G.muestrearTrayecto([[0, 0], [5, 0], [5, 5]], 2, false);
  assert.deepEqual(t[0], [0, 0]);
  assert.deepEqual(t[t.length - 1], [5, 5]);
});

test('ralear y avisos de separación', () => {
  const pts = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
  assert.deepEqual(G.ralear(pts, 2), [[0, 0], [2, 0], [4, 0]]);
  const pagina = {
    ancho: 297, alto: 210,
    cuadros: [{ id: 'a', texto: 'a', x: 50, y: 50 }],
    trazos: [{ id: 't', puntos: [[51, 50], [100, 100], [100.5, 100]] }]
  };
  const calc = G.calcularPagina(pagina, { medidas: G.MEDIDAS });
  const av = G.avisos(pagina, calc, { separacion_minima_mm: 2 });
  assert.ok(av.some(a => /2 pares/.test(a.mensaje) && /1 entre dibujo y braille/.test(a.mensaje)));
  const calc2 = G.calcularPagina(pagina, { medidas: G.MEDIDAS, separacionDibujo: 3 });
  assert.equal(calc2.quitados, 1);
});

test('avisos: fuera de hoja y choque de cuadros', () => {
  const pagina = {
    ancho: 100, alto: 100,
    cuadros: [{ id: 'a', texto: 'abc', x: 10, y: 10 }, { id: 'b', texto: 'abc', x: 12, y: 12 },
      { id: 'c', texto: 'l', x: 99, y: 99 }],
    trazos: []
  };
  const av = G.avisos(pagina, G.calcularPagina(pagina), {});
  assert.ok(av.some(a => /fuera de la hoja/.test(a.mensaje)));
  assert.ok(av.some(a => /chocan/.test(a.mensaje)));
});

test('grilla de la Everest V4: braille regular sobre el paso medido y puntos ajustados', () => {
  const perfil = { codificador: 'grilla', grilla: { paso_x_mm: 2.05, paso_y_mm: 2.10 }, carga: { orientacion: 'horizontal' } };
  const m = G.medidasDePerfil(perfil, 297, 210);
  assert.equal(m.entrePuntosX, 2.05);
  assert.equal(m.entrePuntosY, 2.1);
  assert.equal(m.entreCeldas, 6.15);
  assert.equal(m.entreRenglones, 10.5);
  const pagina = { ancho: 297, alto: 210, cuadros: [{ id: 'a', texto: 'lista', x: 10.3, y: 20.7 }], trazos: [{ id: 't', puntos: [[49.3, 50.3], [49.6, 50.5]] }] };
  const calc = G.calcularPagina(pagina, { medidas: m });
  for (const p of calc.puntos) {
    assert.ok(Math.abs(p.x / 2.05 - Math.round(p.x / 2.05)) < 1e-6, 'x en la grilla');
    assert.ok(Math.abs(p.y / 2.1 - Math.round(p.y / 2.1)) < 1e-6, 'y en la grilla');
  }
  // Los dos puntos del trazo caen en la misma celda: queda uno solo.
  assert.equal(calc.puntos.filter(p => p.origen === 'dibujo').length, 1);
  // Si la hoja se carga parada y el diseño es apaisado, se intercambian los pasos.
  const mv = G.medidasDePerfil(Object.assign({}, perfil, { carga: { orientacion: 'vertical' } }), 297, 210);
  assert.equal(mv.entrePuntosX, 2.1);
});
