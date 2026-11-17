'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const O=require('../web/js/objetos.js');
const G=require('../web/js/grilla.js');
const m={entrePuntos:2,grilla:{px:2,py:2}};
const obj=(tipo,datos)=>O.crearObjeto(tipo,Object.assign({id:'uno'},datos));

test('ciclos de los cuatro estilos de línea',()=>{
  const base={vertices:[[0,0],[20,0]]};
  const xs=estilo=>O.objetoAPuntos(obj('linea',Object.assign({linea:estilo},base)),m).map(p=>p[0]);
  assert.deepEqual(xs('continua'),[0,2,4,6,8,10,12,14,16,18,20]);
  assert.deepEqual(xs('punteada'),[0,6,12,18]);
  assert.deepEqual(xs('rayada'),[0,2,4,10,12,14,20]);
  assert.deepEqual(xs('ninguna'),[]);
});
test('rectángulo y elipse son contornos cerrados',()=>{
  for(const tipo of ['rectangulo','elipse']){
    const p=O.objetoAPuntos(obj(tipo,{x:0,y:0,ancho:20,alto:12}),m);
    assert.ok(p.length>8);
    assert.ok(p.some(q=>q[0]<3)&&p.some(q=>q[0]>17));
    assert.ok(p.some(q=>q[1]<3)&&p.some(q=>q[1]>9));
  }
});
test('cada relleno deja libre un paso junto al contorno',()=>{
  const borde=O.objetoAPuntos(obj('rectangulo',{x:0,y:0,ancho:24,alto:24,relleno:'ninguno'}),m);
  for(const relleno of ['reticula','horizontales','diagonales','disperso']){
    const pts=O.objetoAPuntos(obj('rectangulo',{x:0,y:0,ancho:24,alto:24,relleno}),m);
    const interiores=pts.slice(borde.length);
    assert.ok(interiores.length>0,relleno);
    assert.ok(interiores.every(q=>q[0]>=4&&q[0]<=20&&q[1]>=4&&q[1]<=20),relleno);
  }
});
test('mover, escalar, rotar y caja contenedora',()=>{
  const a=obj('rectangulo',{x:10,y:20,ancho:20,alto:10});
  assert.deepEqual(O.caja(a),{x0:10,y0:20,x1:30,y1:30,ancho:20,alto:10});
  assert.equal(O.caja(O.mover(a,3,-2)).x0,13);
  assert.equal(O.caja(O.escalar(a,2,2)).ancho,40);
  const b=O.caja(O.rotar(a,90));
  assert.ok(Math.abs(b.ancho-10)<0.001);
  assert.ok(Math.abs(b.alto-20)<0.001);
});
test('trazos de proyecto viejo migran una vez a puntos fijos',()=>{
  const p={trazos:[{id:'viejo',nombre:'Calco',puntos:[[1,2],[3,4]]}]};
  O.migrarTrazos(p);O.migrarTrazos(p);
  assert.equal(p.trazos.length,0);assert.equal(p.objetos.length,1);
  assert.equal(p.objetos[0].tipo,'puntos');assert.equal(p.objetos[0].id,'viejo');
});
test('calcularPagina integra objetos y ajusta a grilla',()=>{
  const p={ancho:100,alto:100,cuadros:[],trazos:[],objetos:[obj('punto',{x:5,y:7})]};
  const calc=G.calcularPagina(p,{medidas:m});
  assert.deepEqual(calc.puntos,[{x:6,y:8,origen:'objeto',id:'uno'}]);
});
test('ocultar un objeto o su capa lo saca de la salida',()=>{
  const p={ancho:100,alto:100,cuadros:[],trazos:[],capasVisibles:{referencia:false},objetos:[
    obj('punto',{id:'a',x:4,y:4,capa:'referencia'}),obj('punto',{id:'b',x:8,y:8,oculto:true}),obj('punto',{id:'c',x:12,y:12})]};
  assert.deepEqual(G.calcularPagina(p,{medidas:m}).puntos.map(q=>q.id),['c']);
});
test('verificador detecta separación, tamaño, margen y texturas excesivas',()=>{
  const rellenos=['reticula','horizontales','diagonales','disperso','nuevo1','nuevo2'];
  const objetos=rellenos.map((r,i)=>obj('rectangulo',{id:'r'+i,x:10+i*20,y:10,ancho:10,alto:10,relleno:r,linea:'linea'+i}));
  objetos.push(obj('punto',{id:'cerca',x:14,y:12}));
  objetos.push(obj('rectangulo',{id:'chico',x:140,y:10,ancho:4,alto:4}));
  const p={ancho:160,alto:100,cuadros:[],objetos,trazos:[]};
  const a=G.avisos(p,G.calcularPagina(p,{medidas:m}),{codificador:'grilla',grilla:{paso_x_mm:2,paso_y_mm:2},margenes_mm:{izquierdo:0,derecho:0,superior:0,inferior:0}});
  assert.ok(a.some(x=>x.id==='cerca'&&x.mensaje.includes('dos pasos')));
  assert.ok(a.some(x=>x.id==='chico'&&x.mensaje.includes('6 mm')));
  assert.ok(a.some(x=>x.mensaje.includes('6 rellenos')));
  assert.ok(a.some(x=>x.mensaje.includes('7 tipos de línea')));
});
test('quitarJuntos ralea objetos vectoriales y puntos fijos contra el braille',()=>{
  const mm={entrePuntos:2,grilla:{px:2,py:2}};
  const p={ancho:100,alto:100,cuadros:[],trazos:[],objetos:[
    obj('linea',{id:'l',vertices:[[0,50],[20,50]]}),obj('puntos',{id:'f',puntos:[[60,60],[61,60.2],[80,80]]})]};
  // Con minimo 3 mm sobre grilla de 2 mm, los puntos contiguos de la línea se raelan.
  const calc=G.calcularPagina(p,{medidas:mm});
  const antes=calc.puntos.length;
  const q=G.quitarJuntos(p,calc,3,mm);
  const despues=G.calcularPagina(p,{medidas:mm}).puntos;
  assert.ok(q>0);assert.equal(despues.length,antes-q);
  for(let i=0;i<despues.length;i++)for(let j=i+1;j<despues.length;j++)
    assert.ok(Math.hypot(despues[i].x-despues[j].x,despues[i].y-despues[j].y)>=3-1e-6);
  // Con la separación mínima de la grilla no hay nada que quitar.
  assert.equal(G.quitarJuntos(p,G.calcularPagina(p,{medidas:mm}),2,mm),0);
});

test('despeje braille-dibujo se mide sobre puntos ajustados a la grilla y el mapa táctil usa 6 mm',()=>{
  const g={entrePuntos:2,entrePuntosX:2,entrePuntosY:2,entreCeldas:6,entreRenglones:10,grilla:{px:2,py:2}};
  assert.equal(G.despejeEfectivo({separarDibujo:true,separacionDibujo:3}),3);
  assert.equal(G.despejeEfectivo({separarDibujo:true,separacionDibujo:3,mapaTactil:true}),6);
  assert.equal(G.despejeEfectivo({separarDibujo:false,mapaTactil:true}),6);
  const pag=()=>({ancho:100,alto:60,capasVisibles:{},trazos:[],
    cuadros:[{id:'c',texto:'a',x:20,y:20,capa:'rotulos'}],
    objetos:[O.crearObjeto('punto',{id:'p',x:25.9,y:20})]});
  // braille «a»: un punto en (20,20); el objeto se ajusta a x=26 (6 mm de distancia)
  const r3=G.calcularPagina(pag(),{medidas:g,separacionDibujo:3});
  assert.ok(r3.puntos.some(p=>p.id==='p'));
  const r6=G.calcularPagina(pag(),{medidas:g,separacionDibujo:G.despejeEfectivo({mapaTactil:true})});
  assert.ok(r6.puntos.some(p=>p.id==='p'),'a 6 mm exactos se conserva');
  const r7=G.calcularPagina(pag(),{medidas:g,separacionDibujo:7});
  assert.ok(!r7.puntos.some(p=>p.id==='p'));
  assert.equal(r7.quitados,1);
});
