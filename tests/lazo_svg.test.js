'use strict';const test=require('node:test'),assert=require('node:assert/strict');const S=require('../web/js/svg_importar.js'),L=require('../web/js/lazo.js'),O=require('../web/js/objetos.js');
test('SVG: comandos absolutos y relativos, curvas y arcos',()=>{for(const d of ['M0 0 L10 0 H20 V10 Z','m0 0 l10 0 h10 v10 z','M0 0 C5 0 5 10 10 10 S15 20 20 10','M0 0 Q5 10 10 0 T20 0','M0 0 A10 10 0 0 1 10 10'])assert.ok(S.path(d).some(p=>p.length>=3),d);});
test('SVG: transformaciones heredadas y viewBox a mm',()=>{const r=S.parsear('<svg viewBox="0 0 100 50"><g transform="translate(10 5)"><g transform="scale(2)"><path d="M0 0 L10 0" style="fill:none;stroke:#000"/></g></g></svg>',200);assert.equal(r.altoMm,100);assert.deepEqual(r.elementos[0].puntos,[[20,10],[60,10]]);});
test('SVG: rectángulo, círculo, elipse, polígono y línea',()=>{const r=S.parsear('<svg viewBox="0 0 100 100"><rect x="1" y="2" width="10" height="5"/><circle cx="20" cy="20" r="5"/><ellipse cx="40" cy="30" rx="5" ry="2"/><polygon points="0,0 5,0 5,5"/><line x1="0" y1="0" x2="10" y2="10" stroke="#000"/></svg>',100);assert.equal(r.elementos.length,5);assert.ok(r.elementos.slice(0,4).every(e=>e.cerrado));});
test('SVG: fusiona colores cercanos y sugiere significados',()=>{const r=S.parsear('<svg viewBox="0 0 20 20"><rect width="10" height="10" fill="#c6ecff"/><rect x="10" width="10" height="10" fill="#c6ebff"/><path d="M0 15 L20 15" style="fill:none;stroke:#000;stroke-width:1"/></svg>',20);assert.equal(r.capas.length,2);assert.equal(r.capas[0].significado,'agua');assert.equal(r.capas[1].significado,'límite');});
test('lazo sigue línea sintética en vez de diagonal vacía',()=>{const W=50,H=50,d=new Uint8ClampedArray(W*H*4);d.fill(255);const dot=(x,y)=>{const i=(y*W+x)*4;d[i]=d[i+1]=d[i+2]=0;};for(let y=5;y<=35;y++)dot(5,y);for(let x=5;x<=40;x++)dot(x,35);const p=L.camino(L.costos(d,W,H),[5,5],[40,35],8,2);assert.ok(p.some(q=>q[0]<10&&q[1]>20));assert.ok(p.some(q=>q[0]>20&&q[1]>30));});
test('Douglas-Peucker conserva quiebres',()=>{const p=L.simplificar([[0,0],[1,0.01],[2,0],[2,2],[2,4]],.1);assert.deepEqual(p,[[0,0],[2,0],[2,4]]);});
test('editar, agregar, quitar, cortar, borrar tramo y unir',()=>{const a=O.crearObjeto('polilinea',{vertices:[[0,0],[10,0],[20,0]]});assert.deepEqual(O.editarVertice(a,1,[10,2]).vertices[1],[10,2]);assert.equal(O.agregarVertice(a,0,[5,0]).vertices.length,4);assert.equal(O.quitarVertice(a,1).vertices.length,2);const [u,v]=O.cortarLinea(a,0,[5,0]);assert.deepEqual(O.unirLineas(u,v,1).vertices,[[0,0],[5,0],[10,0],[20,0]]);assert.equal(O.borrarTramo(a,1).length,1);});
test('grupo SVG escalado ×2 se remuestrea sin huecos',()=>{const o=O.crearObjeto('polilinea',{vertices:[[0,0],[10,0]],grupo:'g'}),p=O.objetoAPuntos(O.escalar(o,2,2,[0,0]),{grilla:{px:2,py:2}});assert.ok(p.every((q,i)=>!i||Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1])<=3));});
test('imagen de referencia nunca produce puntos',()=>{assert.deepEqual(O.objetoAPuntos(O.crearObjeto('referencia',{x:0,y:0,ancho:40,alto:20,src:'data:image/png;base64,a'}),{grilla:{px:2,py:2}}),[]);});
test('goma excluye puntos de una línea vectorial',()=>{const o=O.crearObjeto('linea',{vertices:[[0,0],[20,0]],borrados:[[10,0,2]]}),p=O.objetoAPuntos(o,{grilla:{px:2,py:2}});assert.ok(!p.some(q=>q[0]>=8&&q[0]<=12));assert.ok(p.some(q=>q[0]===0)&&p.some(q=>q[0]===20));});

test('SVG: área visible con preserveAspectRatio (caso mapas de Wikipedia)', () => {
  const S = require('../web/js/svg_importar.js');
  // width/height apaisado y viewBox angosto: «meet» amplía el área visible hacia los costados.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 400 800">' +
    '<rect x="-400" y="0" width="1200" height="800" style="fill:#c6ecff"/>' +
    '<path d="M -400 400 L 800 400" style="fill:none;stroke:#646464"/></svg>';
  const r = S.parsear(svg, 240);
  assert.ok(Math.abs(r.altoMm - 160) < 0.01, 'alto ' + r.altoMm);
  const mar = r.elementos.find(e => e.fill && e.cerrado);
  const xs = mar.puntos.map(p => p[0]), ys = mar.puntos.map(p => p[1]);
  assert.ok(Math.min(...xs) >= -1e-6 && Math.max(...xs) <= 240 + 1e-6);
  assert.ok(Math.min(...ys) >= -1e-6 && Math.max(...ys) <= 160 + 1e-6);
  const linea = r.elementos.find(e => e.stroke && !e.cerrado);
  assert.ok(Math.abs(linea.puntos[0][0]) < 0.01 && Math.abs(linea.puntos.at(-1)[0] - 240) < 0.01);
});

test('SVG: se recortan las líneas que salen del área y se ignoran capas ocultas', () => {
  const S = require('../web/js/svg_importar.js');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
    '<path d="M -50 50 L 150 50" style="fill:none;stroke:#000"/>' +
    '<g style="display:none"><path d="M 10 10 L 90 90" style="stroke:#f00;fill:none"/></g></svg>';
  const r = S.parsear(svg, 100);
  assert.equal(r.elementos.length, 1);
  assert.deepEqual(r.elementos[0].puntos.map(p => p.map(v => Math.round(v))), [[0, 50], [100, 50]]);
});
