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

test('avisos: paralelas cercanas, formas chicas, tramos de 1-2 celdas y exceso de estilos',()=>{
  const perfil={codificador:'grilla',grilla:{paso_x_mm:2,paso_y_mm:2},carga:{orientacion:'horizontal'}};
  const pag=objetos=>({ancho:297,alto:210,cuadros:[],trazos:[],capasVisibles:{},objetos});
  const L=(id,y,extra)=>O.crearObjeto('linea',Object.assign({id,nombre:id,vertices:[[30,y],[90,y]]},extra));
  const medidas=G.medidasDePerfil(perfil,297,210);
  const av=(p,op)=>G.avisos(p,G.calcularPagina(p,{medidas}),perfil,op).map(a=>a.mensaje);
  // dos líneas a 4 mm: aviso solo en la comprobación completa
  let p=pag([L('a',50),L('b',54)]);
  assert.ok(av(p,{completo:true}).some(m=>/casi paralelas a \d/.test(m)));
  assert.ok(!av(p,{}).some(m=>/casi paralelas a \d/.test(m)));
  // a 8 mm: no avisa
  p=pag([L('a',50),L('b',58)]);
  assert.ok(!av(p,{completo:true}).some(m=>/casi paralelas a \d/.test(m)));
  // forma cerrada de 4 mm
  p=pag([O.crearObjeto('rectangulo',{id:'r',nombre:'cuadradito',x:100,y:100,ancho:4,alto:20})]);
  assert.ok(av(p,{}).some(m=>/cuadradito.*diámetro/.test(m)));
  // línea de 1-2 celdas
  p=pag([O.crearObjeto('linea',{id:'c',nombre:'corta',vertices:[[100,100],[102,100]]})]);
  assert.ok(av(p,{}).some(m=>/corta.*celda/.test(m)));
  // 6 estilos entre líneas y rellenos
  p=pag([L('a',20,{linea:'continua'}),L('b',40,{linea:'punteada'}),L('c',60,{linea:'rayada'}),
    O.crearObjeto('rectangulo',{id:'r1',x:100,y:100,ancho:20,alto:20,relleno:'reticula'}),
    O.crearObjeto('rectangulo',{id:'r2',x:130,y:100,ancho:20,alto:20,relleno:'diagonales'}),
    O.crearObjeto('rectangulo',{id:'r3',x:160,y:100,ancho:20,alto:20,relleno:'disperso'})]);
  assert.ok(av(p,{}).some(m=>/combina 3 estilos de línea y 3 texturas/.test(m)));
});

test('clave: una muestra de al menos 12,5 x 25 mm por combinación, con rótulo braille y sin pisar el dibujo',()=>{
  const L=require('../web/js/leyenda.js');
  const perfil={codificador:'grilla',grilla:{paso_x_mm:2.05,paso_y_mm:2.02},carga:{orientacion:'horizontal'}};
  const medidas=G.medidasDePerfil(perfil,297,210);
  let n=0;const ctx={medidas,perfil,nuevoId:p=>p+(++n)};
  const pag={ancho:297,alto:210,cuadros:[],trazos:[],capasVisibles:{},objetos:[
    O.crearObjeto('polilinea',{id:'a',nombre:'Ruta',linea:'rayada',vertices:[[20,20],[100,20]]}),
    O.crearObjeto('polilinea',{id:'b',nombre:'Polilínea',linea:'rayada',vertices:[[20,30],[100,30]]}),
    O.crearObjeto('rectangulo',{id:'c',nombre:'Parque',x:120,y:20,ancho:30,alto:30,relleno:'reticula'})]};
  const r=L.construir(pag,ctx);
  assert.equal(r.combos,2);
  assert.ok(r.entra);
  assert.equal(r.objetos.length,2);assert.equal(r.cuadros.length,2);
  const rect=r.objetos.find(o=>o.tipo==='rectangulo');
  assert.ok(rect.ancho>=25&&rect.alto>=12.5);
  assert.ok(Math.abs(rect.ancho/2.05-Math.round(rect.ancho/2.05))<1e-6);
  assert.ok(r.objetos.every(o=>o.capa==='claves')&&r.cuadros.every(c=>c.capa==='claves'));
  assert.ok(r.cuadros.some(c=>/Ruta/.test(c.texto))&&r.cuadros.some(c=>/Parque/.test(c.texto)));
  // todo cae dentro de la hoja y a más de 6 mm del dibujo existente
  pag.objetos.push(...r.objetos);pag.cuadros.push(...r.cuadros);
  const calc=G.calcularPagina(pag,{medidas,separacionDibujo:0});
  const claves=calc.puntos.filter(p=>p.id&&(r.objetos.some(o=>o.id===p.id)||r.cuadros.some(c=>c.id===p.id)));
  const resto=calc.puntos.filter(p=>!claves.includes(p));
  assert.ok(claves.length>0&&claves.every(p=>p.x<=297&&p.y<=210));
  assert.ok(Math.min(...claves.map(p=>p.y))-Math.max(...resto.map(p=>p.y))>=6-1e-6);
  // regenerar no duplica
  const r2=L.construir(pag,ctx);
  assert.equal(r2.objetos.length,2);
  // sin lugar abajo: no entra
  const llena={ancho:297,alto:210,cuadros:[],trazos:[],capasVisibles:{},objetos:[
    O.crearObjeto('rectangulo',{id:'g',nombre:'Mar',x:10,y:10,ancho:270,alto:185,relleno:'diagonales'})]};
  assert.equal(L.construir(llena,ctx).entra,false);
});
