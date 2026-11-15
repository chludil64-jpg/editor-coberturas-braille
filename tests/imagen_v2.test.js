'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../web/js/vectorizar.js');
const B=require('../web/js/bordes.js');
const O=require('../web/js/objetos.js');
const G=require('../web/js/grilla.js');
const D=require('../web/js/disposicion.js');
const m={grilla:{px:2,py:2}};
function mascara(W,H,puntos){const b=new Uint8Array(W*H);for(const [x,y] of puntos)b[y*W+x]=1;return b;}
test('traza una L, un círculo y una cruz en cadenas',()=>{
  const L=mascara(9,9,[[1,1],[1,2],[1,3],[2,3],[3,3]]);
  assert.ok(V.trazar(L,9,9).some(v=>v.length>=5));
  const circulo=mascara(9,9,[[3,1],[4,1],[5,1],[6,2],[6,3],[6,4],[5,5],[4,5],[3,5],[2,4],[2,3],[2,2]]);
  assert.ok(V.trazar(circulo,9,9).some(v=>v.length>=8&&v[0][0]===v.at(-1)[0]&&v[0][1]===v.at(-1)[1]));
  const cruz=mascara(9,9,[[4,1],[4,2],[4,3],[4,4],[4,5],[4,6],[4,7],[1,4],[2,4],[3,4],[5,4],[6,4],[7,4]]);
  assert.equal(V.trazar(cruz,9,9).length,4);
});
test('Douglas Peucker conserva esquinas y elimina ruido',()=>{
  assert.deepEqual(V.simplificar([[0,0],[1,.1],[2,0],[2,2]],.2),[[0,0],[2,0],[2,2]]);
});
test('imagen al doble regenera puntos sin huecos',()=>{
  const a=O.crearObjeto('imagen',{x:10,y:10,ancho:20,alto:10,baseAncho:20,baseAlto:10,polilineas:[[[0,5],[20,5]]]});
  const b=O.escalar(a,2,2),p=O.objetoAPuntos(b,m);
  assert.ok(p.length>=20);
  for(let i=1;i<p.length;i++)assert.ok(Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1])<=3);
  const pag={ancho:100,alto:100,cuadros:[],trazos:[],objetos:[b]};
  assert.ok(G.calcularPagina(pag,{medidas:m}).puntos.length>=20);
});
test('rotación y volteo de imagen cambian la geometría',()=>{
  const a=O.crearObjeto('imagen',{x:10,y:10,ancho:20,alto:10,baseAncho:20,baseAlto:10,polilineas:[[[0,0],[20,0]]]});
  const girada=O.objetoAPuntos(O.rotar(a,90),m),volteada=O.objetoAPuntos(O.voltear(a,'vertical'),m);
  assert.ok(Math.abs(girada[0][0]-girada.at(-1)[0])<.01);
  assert.ok(volteada[0][1]>O.objetoAPuntos(a,m)[0][1]);
});
test('regiones de color detecta límite de igual brillo',()=>{
  const W=20,H=12,rgb=new Float32Array(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*3,c=x<10?[255,0,0]:[0,130,0];rgb.set(c,i);}
  const b=B.regionesColor(rgb,W,H,2,0);
  assert.ok([...b].reduce((s,v)=>s+v,0)>=8);
});
test('Canny adelgaza un borde grueso',()=>{
  const W=24,H=16,rgb=new Float32Array(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)rgb.fill(x<12?0:255,(y*W+x)*3,(y*W+x)*3+3);
  const b=B.canny(rgb,W,H,20);
  for(let y=2;y<H-2;y++)assert.ok(b.slice(y*W,(y+1)*W).reduce((s,v)=>s+v,0)<=2);
});
test('proyecto JSON y disposición conservan imagen y receta',()=>{
  const o=O.crearObjeto('imagen',{id:'im',x:4,y:5,ancho:20,alto:10,baseAncho:20,baseAlto:10,
    polilineas:[[[0,0],[20,10]]],original:'data:image/jpeg;base64,AA==',receta:{modo:'regiones',colores:4}});
  const doc={paginas:[{ancho:100,alto:100,cuadros:[],trazos:[],objetos:[o]}]};
  assert.deepEqual(JSON.parse(JSON.stringify({formato:'editor-coberturas-braille',doc})).doc.paginas[0].objetos[0],o);
  const datos=D.extraer(doc,'mapa.pdf'),destino={paginas:[{ancho:100,alto:100,cuadros:[],trazos:[],objetos:[]}]};
  D.aplicar(destino,JSON.parse(JSON.stringify(datos)),'agregar',()=> 'nuevo',(w,h)=>({ancho:w,alto:h,cuadros:[],trazos:[],objetos:[]}));
  assert.deepEqual(destino.paginas[0].objetos[0].polilineas,o.polilineas);
  assert.deepEqual(destino.paginas[0].objetos[0].receta,o.receta);
});
