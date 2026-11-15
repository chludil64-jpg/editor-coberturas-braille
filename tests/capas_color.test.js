'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../web/js/capas_color.js');
const O=require('../web/js/objetos.js');

function imagen(W,H,pintar){const d=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*4;d.set([...pintar(x,y),255],p);}return d;}
test('reducción usa media de bloque y limita el lado mayor',()=>{
  const d=imagen(4,2,(x)=>x<2?[0,0,0]:[200,200,200]),r=C.reducir(d,4,2,2);
  assert.equal(r.W,2);assert.equal(r.H,1);assert.equal(r.datos[0],0);assert.equal(r.datos[4],200);
});
test('Lab distingue áreas de brillo similar con matices diferentes',()=>{
  const r=C.kmedias(imagen(40,20,(x)=>x<20?[180,100,100]:[100,140,100]),40,20,4);
  assert.notEqual(r.ids[5],r.ids[35]);
});
test('fusiona centros casi iguales con ΔE menor a cuatro',()=>{
  const a=C.rgbLab(198,236,255),b=C.rgbLab(198,235,255);
  assert.ok(C.delta(a,b)<4);assert.equal(C.fusionar([a,b]).length,1);
});
test('clasifica línea fina larga y relleno grande',()=>{
  const W=80,H=50,ancho=40;
  const linea=new Uint8Array(W*H);for(let x=4;x<75;x++)linea[20*W+x]=1;
  const s1=C.estadisticas(linea,W,H,ancho);assert.equal(C.clasificar(s1,[20,20,20],5).rol,'LÍNEA');
  const area=new Uint8Array(W*H);for(let y=5;y<45;y++)for(let x=5;x<70;x++)area[y*W+x]=1;
  assert.equal(C.clasificar(C.estadisticas(area,W,H,ancho),[180,190,100],40).rol,'ÁREA');
});
test('mancha chica compacta es símbolo',()=>{
  const W=30,H=30,m=new Uint8Array(W*H);for(let y=10;y<14;y++)for(let x=10;x<14;x++)m[y*W+x]=1;
  assert.equal(C.clasificar(C.estadisticas(m,W,H,15),[40,40,40],1).rol,'SÍMBOLO');
});
test('prior de agua únicamente en áreas azules',()=>{
  const azul=[100,190,230];assert.equal(C.clasificar({area:200,grosor:8,p90:0,compacidad:.4},azul,30).agua,true);
  assert.equal(C.clasificar({area:200,grosor:1,p90:40,compacidad:.1},azul,2).agua,false);
});
test('muchos trazos de texto cortos no forman una capa de línea',()=>{
  const W=100,H=60,m=new Uint8Array(W*H);for(let y=5;y<55;y+=8)for(let x=5;x<95;x+=9)for(let dx=0;dx<4;dx++)m[y*W+x+dx]=1;
  const s=C.estadisticas(m,W,H,50);assert.ok(s.p90<20);assert.notEqual(C.clasificar(s,[20,20,20],2).rol,'LÍNEA');
});
test('separa rectas, curvas y trazos intermedios',()=>{
  const r=C.separar([[[0,0],[10,0],[20,0]],[[0,0],[10,10],[20,0]],[[0,0],[10,4],[20,0]]]);
  assert.equal(r.rectas.length,1);assert.equal(r.curvas.length,1);assert.equal(r.revisar.length,1);
});
test('capa agrupada al doble se remuestrea sin huecos',()=>{
  const o=O.crearObjeto('imagen',{grupo:'g1',mapaCapa:true,tipoMapa:'linea',estiloMapa:'continua',x:0,y:0,ancho:20,alto:10,baseAncho:20,baseAlto:10,polilineas:[[[0,5],[20,5]]]});
  const p=O.objetoAPuntos(O.escalar(o,2,2),{grilla:{px:2,py:2}});
  assert.ok(p.length>=20);for(let i=1;i<p.length;i++)assert.ok(Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1])<=3);
});
