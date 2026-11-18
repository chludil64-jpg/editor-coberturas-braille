/* Lista textual y propiedades de las formas táctiles. */
(function () {
  'use strict';
  const App=window.App, $=id=>document.getElementById(id), O=window.Objetos;
  const elegidos=()=>App.ui.seleccion||[];
  const objetos=()=>App.pagina().objetos||[];
  function buscar(id) { return objetos().find(o=>o.id===id); }
  function seleccionar(id, sumar) {
    const objeto=id&&buscar(id), conjunto=objeto&&objeto.grupo?objetos().filter(o=>o.grupo===objeto.grupo).map(o=>o.id):(id?[id]:[]);
    if (!sumar) App.ui.seleccion=id?[id]:[];
    else App.ui.seleccion=elegidos().includes(id)?elegidos().filter(x=>!conjunto.includes(x)):[...new Set(elegidos().concat(conjunto))];
    if(!sumar&&conjunto.length)App.ui.seleccion=conjunto;
    App.ui.sel=App.ui.seleccion.length?{tipo:'objeto',id:App.ui.seleccion.at(-1)}:null;
    App.cambio('seleccion');
    App.anunciar(App.ui.seleccion.length?`${App.ui.seleccion.length} elemento(s) elegidos.`:'Nada elegido.');
  }
  function reemplazar(id,nuevo) { const a=objetos(),i=a.findIndex(o=>o.id===id); if(i>=0) a[i]=nuevo; }
  function transformarSeleccion(tipo,valor){
    const a=elegidos().map(buscar).filter(o=>o&&!o.bloqueado);if(!a.length)return;
    App.registrar(tipo==='escalar'?'Cambiar tamaño':'Girar');a.forEach(o=>reemplazar(o.id,tipo==='escalar'?O.escalar(o,valor,valor):O.rotar(o,valor)));
    App.cambio('objetos');App.anunciar(`${a.length} objeto(s): ${tipo==='escalar'?'tamaño '+Math.round(valor*100)+' %':'rotación '+valor+'°'}.`);
  }
  function crear(tipo, datos) {
    App.registrar('Crear '+(({linea:'línea',polilinea:'polilínea',poligono:'polígono',rectangulo:'rectángulo',elipse:'elipse',punto:'punto'})[tipo]||tipo));
    const o=O.crearObjeto(tipo,Object.assign({id:App.nuevoId('o'), nombre:({linea:'Línea',polilinea:'Polilínea',poligono:'Polígono',rectangulo:'Rectángulo',elipse:'Elipse',punto:'Punto'})[tipo]||tipo,
      linea:$('estilo-linea').value,relleno:$('estilo-relleno').value,orden:objetos().length},datos||{}));
    objetos().push(o); seleccionar(o.id,false); App.anunciar(`${o.nombre} creado.`); return o;
  }
  function operar(accion) {
    const ids=elegidos().filter(id=>buscar(id));
    const cuadros=App.ui.sel&&App.ui.sel.tipo==='cuadro'?App.pagina().cuadros.filter(c=>c.id===App.ui.sel.id):[];
    if(!ids.length&&!cuadros.length) return;
    App.registrar(({borrar:'Borrar',duplicar:'Duplicar',agrupar:'Agrupar',desagrupar:'Desagrupar',bloquear:'Bloquear o desbloquear',ocultar:'Ocultar o mostrar',frente:'Traer al frente',atras:'Enviar atrás'})[accion]||'Operación '+accion); const a=objetos();
    if(cuadros.length){const c=cuadros[0],p=App.pagina();
      if(accion==='borrar'){p.cuadros=p.cuadros.filter(q=>q.id!==c.id);App.seleccionar(null);}
      else if(accion==='duplicar'){const n=JSON.parse(JSON.stringify(c));n.id=App.nuevoId('c');n.x+=4;n.y+=4;p.cuadros.push(n);App.seleccionar('cuadro',n.id);}
      else if(accion==='bloquear')c.bloqueado=!c.bloqueado;
      else if(accion==='ocultar')c.oculto=!c.oculto;
      else if(accion==='frente'||accion==='atras'){p.cuadros=p.cuadros.filter(q=>q.id!==c.id);if(accion==='frente')p.cuadros.push(c);else p.cuadros.unshift(c);}
      App.cambio('cuadros');App.anunciar(`Operación ${accion} aplicada al cuadro.`);return;
    }
    if(accion==='borrar') { App.pagina().objetos=a.filter(o=>!ids.includes(o.id)); seleccionar(null,false); }
    else if(accion==='duplicar') { const nuevos=ids.map(id=>O.mover(buscar(id),O.pasos(App.medidas())[0]*2,O.pasos(App.medidas())[1]*2));
      nuevos.forEach(n=>{n.id=App.nuevoId('o');n.nombre+=' copia';n.orden=objetos().length;objetos().push(n);}); seleccionar(nuevos.at(-1).id,false); }
    else if(accion==='agrupar') { const g=App.nuevoId('g');ids.forEach(id=>buscar(id).grupo=g); }
    else if(accion==='desagrupar') ids.forEach(id=>buscar(id).grupo=null);
    else if(accion==='bloquear') { const valor=!ids.every(id=>buscar(id).bloqueado); ids.forEach(id=>buscar(id).bloqueado=valor); }
    else if(accion==='ocultar') { const valor=!ids.every(id=>buscar(id).oculto); ids.forEach(id=>buscar(id).oculto=valor); }
    else if(accion==='frente'||accion==='atras') {
      const ordenes=a.map(o=>o.orden||0), extremo=accion==='frente'?Math.max(0,...ordenes):Math.min(0,...ordenes);
      ids.forEach((id,i)=>buscar(id).orden=extremo+(accion==='frente'?1+i:-1-i));
    }
    App.cambio('objetos'); App.anunciar(`Operación ${accion} aplicada a ${ids.length} elementos.`);
  }
  function alinear(tipo) {
    const a=elegidos().map(buscar).filter(o=>o&&!o.bloqueado); if(a.length<2) return;
    App.registrar('Alinear: '+tipo); const b=a.map(O.caja);
    const horizontal=!['arriba','medio','abajo','distribuir-v'].includes(tipo),c0=horizontal?'x0':'y0',c1=horizontal?'x1':'y1';
    const min=Math.min(...b.map(r=>r[c0])),max=Math.max(...b.map(r=>r[c1]));
    if(tipo.startsWith('distribuir')) {
      const lista=a.map((o,i)=>({o,r:b[i]})).sort((u,v)=>u.r[c0]-v.r[c0]);
      const espacio=(max-min-lista.reduce((s,q)=>s+q.r[c1]-q.r[c0],0))/(lista.length-1), pos={v:min};
      lista.forEach(q=>{reemplazar(q.o.id,O.mover(q.o,horizontal?pos.v-q.r.x0:0,horizontal?0:pos.v-q.r.y0));pos.v+=q.r[c1]-q.r[c0]+espacio;});
    } else a.forEach((o,i)=>{const r=b[i];let d=0;
      if(['izquierda','arriba'].includes(tipo)) d=min-r[c0];
      else if(['derecha','abajo'].includes(tipo)) d=max-r[c1];
      else d=(min+max)/2-(r[c0]+r[c1])/2;
      reemplazar(o.id,O.mover(o,horizontal?d:0,horizontal?0:d)); });
    App.cambio('objetos');App.anunciar(`Selección alineada: ${tipo}.`);
  }
  document.querySelectorAll('[data-accion]').forEach(b=>b.addEventListener('click',()=>operar(b.dataset.accion)));
  document.querySelectorAll('[data-alinear]').forEach(b=>b.addEventListener('click',()=>alinear(b.dataset.alinear)));
  function pintarLista() {
    const p=App.pagina(), capas=$('capas-controles'), lista=$('lista-elementos');
    const foco=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.elemento;
    capas.replaceChildren();lista.replaceChildren();
    O.CAPAS.forEach(capa=>{
      const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=!(p.capasVisibles&&p.capasVisibles[capa]===false);
      box.addEventListener('change',()=>{App.registrar('Capa «'+capa+'» '+(box.checked?'visible':'oculta'));p.capasVisibles=p.capasVisibles||{};p.capasVisibles[capa]=box.checked;App.cambio('capas');App.anunciar(`${capa}: ${box.checked?'visible':'oculta'}.`);});
      label.append(box,document.createTextNode(' '+capa));capas.append(label);
      const titulo=document.createElement('li');titulo.textContent=capa.toUpperCase();lista.append(titulo);
      const items=p.objetos.filter(o=>o.capa===capa).slice().sort((a,b)=>(b.orden||0)-(a.orden||0));
      if(capa==='rotulos') items.push(...p.cuadros.map(c=>({id:c.id,tipo:'cuadro',nombre:c.nombre||c.texto.split('\n')[0],x:c.x,y:c.y})));
      for(const o of items) {
        const li=document.createElement('li'),b=document.createElement('button'),r=o.tipo==='cuadro'?{x0:o.x,y0:o.y}:O.caja(o);
        b.type='button';b.textContent=`${o.nombre} · ${o.tipo} · x ${r.x0.toFixed(1)}, y ${r.y0.toFixed(1)} mm · ${o.linea||'braille'}${o.bloqueado?' · bloqueado':''}${o.oculto?' · oculto':''}`;
        b.dataset.elemento=o.id;
        b.setAttribute('aria-pressed',elegidos().includes(o.id)||App.ui.sel&&App.ui.sel.id===o.id?'true':'false');
        b.addEventListener('click',ev=>{if(o.tipo==='cuadro') App.seleccionar('cuadro',o.id);else seleccionar(o.id,ev.shiftKey);});
        const ren=document.createElement('button');ren.type='button';ren.textContent='Renombrar';ren.setAttribute('aria-label',`Renombrar ${o.nombre}`);
        ren.addEventListener('click',()=>{const valor=prompt('Nuevo nombre del elemento',o.nombre);if(valor===null||!valor.trim())return;App.registrar('Renombrar elemento');
          if(o.tipo==='cuadro'){const c=p.cuadros.find(x=>x.id===o.id);if(c)c.nombre=valor.trim();}
          else o.nombre=valor.trim();App.cambio('nombre');App.anunciar(`Nombre actualizado: ${valor.trim()}.`);});
        li.append(b,ren);lista.append(li);
      }
    });
    if(foco){const nuevo=[...lista.querySelectorAll('button')].find(b=>b.dataset.elemento===foco);if(nuevo)nuevo.focus();}
  }
  const campos={nombre:'obj-nombre',x:'obj-x',y:'obj-y',ancho:'obj-ancho',alto:'obj-alto',rotacion:'obj-rotacion',linea:'obj-linea',relleno:'obj-relleno',capa:'obj-capa'};
  function pintarPropiedades() {
    const o=App.ui.sel&&App.ui.sel.tipo==='objeto'&&buscar(App.ui.sel.id);
    const c=App.ui.sel&&App.ui.sel.tipo==='cuadro'&&App.pagina().cuadros.find(q=>q.id===App.ui.sel.id);
    $('panel-crear').hidden=!!(o||c);$('panel-propiedades').hidden=!(o||c);
    if(!o&&!c) return;
    const b=o?O.caja(o):{x0:c.x,y0:c.y,ancho:App.calculo().cuadros.get(c.id)?.ancho||0,alto:App.calculo().cuadros.get(c.id)?.alto||0};
    const vals={nombre:o?o.nombre:c.nombre||c.texto.split('\n')[0],x:b.x0,y:b.y0,ancho:b.ancho,alto:b.alto,rotacion:o?.rotacion||0,linea:o?.linea||'ninguna',relleno:o?.relleno||'ninguno',capa:o?.capa||'rotulos'};
    Object.entries(campos).forEach(([k,id])=>{if(document.activeElement!==$(id)) $(id).value=typeof vals[k]==='number'?+vals[k].toFixed(2):vals[k];});
    $('obj-ancho').disabled=!!c||o.tipo==='puntos'||o.tipo==='punto';$('obj-alto').disabled=!!c||o.tipo==='puntos'||o.tipo==='punto';
    for(const id of ['obj-proporcion','obj-girar90','obj-voltear-h','obj-voltear-v','obj-restablecer'])$(id).disabled=!!c;
    $('obj-restablecer').disabled=!!c||!['imagen','referencia'].includes(o.tipo);
    $('obj-ref-opacidad-label').hidden=!o||o.tipo!=='referencia';if(o?.tipo==='referencia')$('obj-ref-opacidad').value=Math.round((o.opacidad??.5)*100);
    for(const k of ['rotacion','linea','relleno','capa'])$(campos[k]).disabled=!!c;
  }
  Object.entries(campos).forEach(([k,id])=>$(id).addEventListener('change',()=>{
    const c=App.ui.sel&&App.ui.sel.tipo==='cuadro'&&App.pagina().cuadros.find(q=>q.id===App.ui.sel.id);
    if(c){if(c.bloqueado||!['nombre','x','y'].includes(k))return;
      const valor=k==='nombre'?$(id).value.trim():Number($(id).value);if(!valor&&k==='nombre'||typeof valor==='number'&&!Number.isFinite(valor))return;
      App.registrar('Editar cuadro braille');c[k]=valor;if(k==='x'||k==='y')c.alineacion='libre';App.cambio('cuadro');App.anunciar(`Cuadro: ${k} actualizado.`);return;}
    const o=App.ui.sel&&buscar(App.ui.sel.id);if(!o||o.bloqueado)return;
    const input=$(id),valor=['nombre','linea','relleno','capa'].includes(k)?input.value:Number(input.value);
    if(typeof valor==='number'&&!Number.isFinite(valor))return;
    App.registrar('Cambiar propiedad: '+k);let n=O.crearObjeto(o.tipo,o),b=O.caja(o);
    if(k==='x'||k==='y')n=O.mover(n,k==='x'?valor-b.x0:0,k==='y'?valor-b.y0:0);
    else if(k==='ancho'||k==='alto'){
      const factor=k==='ancho'?(b.ancho?valor/b.ancho:1):(b.alto?valor/b.alto:1);
      n=O.escalar(n,k==='ancho'?factor:($('obj-proporcion').checked?factor:1),k==='alto'?factor:($('obj-proporcion').checked?factor:1),[b.x0,b.y0]);
    }
    else n[k]=valor;
    reemplazar(o.id,n);App.cambio('objetos');App.anunciar(`${o.nombre}: ${k} actualizado.`);
  }));
  $('obj-girar90').addEventListener('click',()=>transformarSeleccion('rotar',90));
  for(const [id,eje] of [['obj-voltear-h','horizontal'],['obj-voltear-v','vertical']])$(id).addEventListener('click',()=>{
    const a=elegidos().map(buscar).filter(o=>o&&!o.bloqueado);if(!a.length)return;
    App.registrar('Voltear '+eje);a.forEach(o=>reemplazar(o.id,O.voltear(o,eje)));App.cambio('objetos');App.anunciar(`Volteo ${eje} aplicado.`);
  });
  $('obj-restablecer').addEventListener('click',()=>{
    const o=App.ui.sel&&buscar(App.ui.sel.id);if(!o||o.tipo!=='imagen'||o.bloqueado)return;
    App.registrar();reemplazar(o.id,Object.assign({},o,{ancho:o.baseAncho,alto:o.baseAlto,rotacion:0,espejoX:false,espejoY:false}));
    App.cambio('objetos');App.anunciar('Tamaño original restablecido.');
  });
  $('obj-ref-opacidad').addEventListener('change',()=>{const o=App.ui.sel&&buscar(App.ui.sel.id);if(o?.tipo!=='referencia')return;App.registrar();o.opacidad=Math.max(0,Math.min(1,Number($('obj-ref-opacidad').value)/100));App.cambio('objetos');App.anunciar('Opacidad de referencia actualizada.');});
  function unirSeleccion(){const a=elegidos().map(buscar).filter(o=>o&&!o.bloqueado&&['linea','polilinea'].includes(o.tipo));if(a.length!==2){App.anunciar('Elegí exactamente dos líneas abiertas con Mayúsculas y clic.');return;}try{const nuevo=O.unirLineas(a[0],a[1],Math.max(...O.pasos(App.medidas()))*1.5);App.registrar();reemplazar(a[0].id,nuevo);App.pagina().objetos=objetos().filter(o=>o.id!==a[1].id);seleccionar(nuevo.id,false);App.cambio('objetos');App.anunciar('Dos líneas unidas.');}catch(e){App.anunciar(e.message);}}
  $('btn-unir-lineas').addEventListener('click',unirSeleccion);$('btn-unir-prop').addEventListener('click',unirSeleccion);
  function muestras() {
    const cont=$('muestras-patrones');
    for(const tipo of Object.keys(O.LINEAS).concat(Object.keys(O.RELLENOS).filter(x=>x!=='ninguno'))){
      const div=document.createElement('div'),c=document.createElement('canvas');div.className='muestra-patron';
      c.width=114;c.height=76;c.style.width='30mm';c.style.height='20mm';div.textContent=tipo;div.append(c);cont.append(div);
      const ctx=c.getContext('2d'),m=App.medidas(),esLinea=Object.hasOwn(O.LINEAS,tipo);
      const muestra=esLinea?O.crearObjeto('linea',{vertices:[[2,10],[28,10]],linea:tipo}):
        O.crearObjeto('rectangulo',{x:2,y:2,ancho:25,alto:16,relleno:tipo});
      const pts=O.objetoAPuntos(muestra,m);ctx.scale(114/30,76/20);
      ctx.fillStyle='#111';for(const p of pts){ctx.beginPath();ctx.arc(p[0],p[1],0.6,0,Math.PI*2);ctx.fill();}
    }
  }
  App.EditorObjetos={crear,seleccionar,operar,alinear,buscar,reemplazar,transformarSeleccion};
  document.addEventListener('keydown',ev=>{
    if(App.atajosBloqueados(ev)||ev.target.id==='lienzo')return;
    if(ev.key==='Delete'){operar('borrar');ev.preventDefault();}
    else if(ev.ctrlKey){const k=ev.key.toLowerCase();
      if(k==='d'){operar('duplicar');ev.preventDefault();}
      else if(k==='g'){operar(ev.shiftKey?'desagrupar':'agrupar');ev.preventDefault();}
      else if(k==='a'){App.ui.seleccion=objetos().map(o=>o.id);App.ui.sel=App.ui.seleccion.length?{tipo:'objeto',id:App.ui.seleccion.at(-1)}:null;App.cambio('seleccion');ev.preventDefault();}
    }
  });
  App.alCambiar(motivo=>{if(motivo!=='arrastre'){pintarLista();pintarPropiedades();}});
  muestras();
})();
