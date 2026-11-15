/* Importación local de imágenes como vectores táctiles editables. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);
  let imagen = null;
  let resultado = null;
  let reconvertirId = null;
  let trabajo = null,serie=0;
  let mapaCapas=null, lienzoMapa=null, asignaciones=[];
  const significados=['agua','tierra','costa','río','límite','ruta','curva/auxiliar','símbolo','texto','ignorar'];
  const estilosArea=['sin-relleno','reticula6','reticula8','horizontales','diagonales','disperso'];
  const estilosLinea=['continua','punteada','rayada','ultrafina'];
  const estilosSimbolo=['punto','cuadradito'];
  const titulo=s=>({'reticula6':'Retícula 6 mm','reticula8':'Retícula 8 mm','sin-relleno':'Sin relleno','rayada':'Rayada 3-2','ultrafina':'Ultrafina 1-2','punto':'Punto','cuadradito':'Cuadradito'})[s]||s;
  function tipoSignificado(s,rol){return ['agua','tierra'].includes(s)?'area':['costa','río','límite','ruta','curva/auxiliar'].includes(s)?'linea':s==='símbolo'?'simbolo':rol==='ÁREA'?'area':rol==='LÍNEA'?'linea':'simbolo';}
  function estiloInicial(s){return s==='agua'?'reticula6':s==='tierra'?'sin-relleno':s==='costa'?'continua':s==='río'?'punteada':s==='límite'?'rayada':s==='curva/auxiliar'?'ultrafina':s==='símbolo'?'punto':'continua';}
  function sugerir(c){
    // Líneas azules: costa si el azul es fuerte y el trazo largo; si no, río.
    const lineaFina=c.rol==='LÍNEA'||(c.rol==='REVISAR'&&c.grosor<=2.2);
    if(lineaFina&&c.lineaAzul)return c.saturacion>=.55&&c.p90>=20?'costa':'río';
    if(c.ignorar)return 'ignorar';
    if(c.rol==='ÁREA')return c.agua?'agua':'tierra';
    if(c.rol==='LÍNEA')return 'límite';
    if(c.rol==='SÍMBOLO')return 'símbolo';
    // Línea fina dudosa con trazos de cierto largo: mejor sugerirla como límite que perderla.
    if(lineaFina&&c.p90>=5)return 'límite';
    return 'ignorar';}
  function estilosPara(s,rol){const t=tipoSignificado(s,rol);return t==='area'?estilosArea:t==='linea'?estilosLinea:estilosSimbolo;}
  function opcion(valor,texto){const e=document.createElement('option');e.value=valor;e.textContent=texto||valor;return e;}
  function avisoBana(){const lineas=new Set(),areas=new Set();asignaciones.forEach((a,i)=>{if(['ignorar','texto'].includes(a.significado))return;const tipo=tipoSignificado(a.significado,mapaCapas.capas[i].rol);if(tipo==='linea')lineas.add(a.estilo);if(tipo==='area'&&a.estilo!=='sin-relleno')areas.add(a.estilo);});
    $('img-aviso-bana').textContent=lineas.size>5||areas.size>5?`Aviso BANA: ${lineas.size} estilos de línea y ${areas.size} texturas. Se recomiendan como máximo 5 de cada tipo.`:'';}
  function pintarCapas(){const cuerpo=$('img-tabla-capas').tBodies[0],selector=$('img-vista-capa');cuerpo.replaceChildren();selector.replaceChildren(opcion('todas','Todas las capas'));
    mapaCapas.capas.forEach((c,i)=>{const a=asignaciones[i],tr=document.createElement('tr'),head=document.createElement('th');head.scope='row';
      const muestra=document.createElement('span');muestra.className='img-muestra-color';muestra.style.backgroundColor=`rgb(${c.color.join(',')})`;muestra.setAttribute('aria-label',`Color RGB ${c.color.join(', ')}`);
      const mini=document.createElement('canvas');mini.width=72;mini.height=54;mini.setAttribute('role','img');mini.setAttribute('aria-label',`Miniatura aislada de la capa ${i+1}`);
      const ctx=mini.getContext('2d'),foto=ctx.createImageData(72,54);for(let y=0;y<54;y++)for(let x=0;x<72;x++){const sx=Math.min(mapaCapas.W-1,Math.floor(x*mapaCapas.W/72)),sy=Math.min(mapaCapas.H-1,Math.floor(y*mapaCapas.H/54)),p=(y*72+x)*4;
        if(mapaCapas.ids[sy*mapaCapas.W+sx]===c.id){foto.data.set(c.color,p);foto.data[p+3]=255;}else{foto.data[p]=foto.data[p+1]=foto.data[p+2]=255;foto.data[p+3]=255;}}ctx.putImageData(foto,0,0);
      head.append(muestra,document.createTextNode(` Capa ${i+1} `),mini);tr.append(head);
      const pct=document.createElement('td');pct.textContent=c.porcentaje.toFixed(2)+' %';tr.append(pct);
      const medida=document.createElement('td');medida.textContent=`${c.rol}; grosor ${c.grosor.toFixed(1)} mm; p90 ${c.p90.toFixed(1)} mm${c.ignorar?'; sugerida para ignorar':''}`;tr.append(medida);
      const sig=document.createElement('select');sig.setAttribute('aria-label',`Significado de capa ${i+1}`);significados.forEach(s=>sig.append(opcion(s)));sig.value=a.significado;
      const est=document.createElement('select');est.setAttribute('aria-label',`Estilo táctil de capa ${i+1}`);
      function refrescar(){est.replaceChildren(...estilosPara(a.significado,c.rol).map(s=>opcion(s,titulo(s))));if(![...est.options].some(o=>o.value===a.estilo))a.estilo=estiloInicial(a.significado);if(![...est.options].some(o=>o.value===a.estilo))a.estilo=est.options[0].value;est.value=a.estilo;avisoBana();}
      sig.addEventListener('change',()=>{a.significado=sig.value;a.estilo=estiloInicial(sig.value);refrescar();});est.addEventListener('change',()=>{a.estilo=est.value;avisoBana();});refrescar();
      const sc=document.createElement('td');sc.append(sig);tr.append(sc);const ec=document.createElement('td');ec.append(est);tr.append(ec);
      const cont=document.createElement('input');cont.type='checkbox';cont.checked=!!a.contorno;cont.setAttribute('aria-label',`Dibujar contorno de capa ${i+1}`);cont.disabled=tipoSignificado(a.significado,c.rol)!=='area';sig.addEventListener('change',()=>cont.disabled=tipoSignificado(a.significado,c.rol)!=='area');cont.addEventListener('change',()=>a.contorno=cont.checked);
      const cc=document.createElement('td');cc.append(cont);tr.append(cc);cuerpo.append(tr);selector.append(opcion(String(i),`Capa ${i+1}: ${a.significado}`));sig.addEventListener('change',()=>selector.options[i+1].textContent=`Capa ${i+1}: ${a.significado}`);
      if(c.rol==='LÍNEA'){const b=document.createElement('button');b.type='button';b.textContent='Separar rectas y curvas';b.setAttribute('aria-label',`Separar rectas y curvas de capa ${i+1}`);
        b.addEventListener('click',()=>{a.separar=!a.separar;const r=window.CapasColor.separar(c.trazos),cv=$('img-vista'),g=cv.getContext('2d'),esc=Math.min((cv.width-10)/mapaCapas.anchoMm,(cv.height-10)/mapaCapas.altoMm);g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);for(const [tipo,color] of [['rectas','#1b387b'],['curvas','#812518'],['revisar','#333']]){g.strokeStyle=color;g.lineWidth=2;for(const v of r[tipo]){g.beginPath();v.forEach((p,j)=>j?g.lineTo(5+p[0]*esc,5+p[1]*esc):g.moveTo(5+p[0]*esc,5+p[1]*esc));g.stroke();}}
          $('img-estado').textContent=`Capa ${i+1}: ${r.rectas.length} trazos rectos (límites), ${r.curvas.length} curvos (ríos), ${r.revisar.length} para revisar. Separación ${a.separar?'activada':'desactivada'}.`;b.setAttribute('aria-pressed',String(a.separar));});b.setAttribute('aria-pressed',String(!!a.separar));medida.append(document.createElement('br'),b);}
    });avisoBana();}
  async function convertirCapas(img,op){const factor=Math.min(1,600/Math.max(img.naturalWidth,img.naturalHeight)),W=Math.max(1,Math.round(img.naturalWidth*factor)),H=Math.max(1,Math.round(img.naturalHeight*factor));const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);g.drawImage(img,0,0,W,H);
    const fuente=document.createElement('canvas');fuente.width=img.naturalWidth;fuente.height=img.naturalHeight;const fg=fuente.getContext('2d',{willReadFrequently:true});fg.fillStyle='#fff';fg.fillRect(0,0,fuente.width,fuente.height);fg.drawImage(img,0,0);const datos=fg.getImageData(0,0,fuente.width,fuente.height).data;
    if(trabajo)trabajo.terminate();const respuesta=await new Promise((ok,mal)=>{trabajo=new Worker('js/imagen_worker.js');trabajo.onmessage=e=>{if(e.data.progreso){$('img-estado').textContent=e.data.progreso;return;}e.data.error?mal(new Error(e.data.error)):ok(e.data.resultado);};trabajo.onerror=e=>mal(new Error(e.message||'Error al analizar el mapa'));trabajo.postMessage({tipo:'capas',datos,W:fuente.width,H:fuente.height,op:{ancho:op.ancho,K:Number($('img-k').value)}},[datos.buffer]);});
    c.width=respuesta.W;c.height=respuesta.H;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(respuesta.reducido),respuesta.W,respuesta.H),0,0);delete respuesta.reducido;
    lienzoMapa=c;mapaCapas=respuesta;asignaciones=respuesta.capas.map(c=>({significado:sugerir(c),estilo:estiloInicial(sugerir(c)),contorno:false}));return respuesta;}

  /** Detecta bordes y conserva sus trayectos en mm para volver a muestrearlos al escalar. */
  async function convertirBordes(img, op) {
    const ancho = op.ancho;
    const alto = ancho * img.naturalHeight / img.naturalWidth;
    // Resolución de trabajo: hasta ~1400 px de lado, entre 2 y 8 px por mm.
    const pxPorMm = Math.max(2, Math.min(8, 1400 / Math.max(ancho, alto)));
    const W = Math.max(8, Math.round(ancho * pxPorMm));
    const H = Math.max(8, Math.round(alto * pxPorMm));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    const datos = g.getImageData(0, 0, W, H).data;
    const opcionesBorde={
      modo: op.modo, umbral: op.umbral, invertir: op.invertir,
      // Sensibilidad 0..100 -> diferencia de color 120..6 (más sensible = umbral más bajo).
      umbralBorde: 120 - op.sens * 1.14,
      suavizado: op.suavizado, pxPorMm: W / ancho, detalleMinMm: op.detalle,
      paso: op.paso, quitarSueltos: op.sueltos, quitarTexto: op.texto, textoMaxMm: 30,
      colores:op.colores,areaMinMm2:op.area,unirMm:op.modo==='lineas'?0.6:0,
      minLargo:op.minLargo,simplificacion:op.simplificacion,chaikin:op.chaikin
    };
    if(trabajo)trabajo.terminate();
    let procesado;
    if(typeof Worker!=='undefined'){
      procesado=await new Promise((resolver,rechazar)=>{
        trabajo=new Worker('js/imagen_worker.js');
        trabajo.onmessage=e=>e.data.error?rechazar(new Error(e.data.error)):resolver(e.data);
        trabajo.onerror=e=>rechazar(new Error(e.message||'Error del procesador de imagen'));
        trabajo.postMessage({datos,W,H,op:opcionesBorde});
      });
    }else{
      const res=window.Bordes.detectar(datos,W,H,opcionesBorde);
      procesado={polilineas:op.modo==='umbral'?window.Vectorizar.filas(res.pixeles,W,H,W/ancho):window.Vectorizar.convertir(res.pixeles,W,H,W/ancho,
        {minLargoMm:op.minLargo,simplificacionMm:op.simplificacion,pasadas:op.chaikin}),quitados:res.quitados};
    }
    const original=c.toDataURL('image/jpeg',0.78);
    return { polilineas:procesado.polilineas, alto, quitados:procesado.quitados, original };
  }

  async function convertir(img, op) {
    return convertirBordes(img, op);

  }

  function opciones() {
    return {
      modo: $('img-modo').value,
      umbral: Number($('img-umbral').value),
      invertir: $('img-invertir').checked,
      ancho: Math.max(5, Number($('img-ancho').value) || 60),
      x: Number($('img-x').value) || 0,
      y: Number($('img-y').value) || 0,
      paso: Math.max(1, Number($('img-paso').value) || 2),
      sens: Number($('img-sens').value),
      suavizado: Number($('img-suavizado').value),
      detalle: Math.max(0, Number($('img-detalle').value) || 0),
      sueltos: $('img-sueltos').checked,
      texto: $('img-texto').checked,
      colores:Number($('img-colores').value),area:Number($('img-area').value),
      simplificacion:Number($('img-simplificacion').value),chaikin:Number($('img-chaikin').value),
      minLargo:Number($('img-min-largo').value)
    };
  }

  /** Muestra las opciones de bordes solo en los modos que las usan. */
  function mostrarOpciones() {
    const m = $('img-modo').value;
    $('img-opciones-mapa').hidden = m==='capas-color';
    $('img-panel-capas').hidden = m!=='capas-color';
    $('img-regiones-opciones').hidden = m !== 'regiones';
  }

  async function actualizar() {
    const numero=++serie;
    const vista = $('img-vista');
    const g = vista.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, vista.width, vista.height);
    const original=$('img-original'),go=original.getContext('2d');
    go.fillStyle='#fff';go.fillRect(0,0,original.width,original.height);
    if (!imagen) { $('btn-img-agregar').disabled = true; return; }
    const op = opciones();
    $('img-estado').textContent='Procesando imagen…';$('btn-img-agregar').disabled=true;
    if(op.modo==='capas-color'){
      try{await convertirCapas(imagen,op);}catch(e){if(numero===serie)$('img-estado').textContent='No se pudo analizar: '+e.message;return;}
      if(numero!==serie)return;pintarCapas();go.drawImage(imagen,0,0,original.width,original.height);
      $('img-estado').textContent=`${mapaCapas.capas.length} capas detectadas. Revisá significado y estilo antes de agregar.`;
      $('btn-img-agregar').disabled=false;return;
    }
    let res;
    try{res=await convertir(imagen,op);}catch(e){if(numero===serie)$('img-estado').textContent='No se pudo convertir: '+e.message;return;}
    if(numero!==serie)return;
    resultado=res;
    const esc = Math.min((vista.width - 10) / op.ancho, (vista.height - 10) / res.alto);
    go.drawImage(imagen,5,5,op.ancho*esc,res.alto*esc);
    g.strokeStyle='#111';g.lineWidth=1.8;
    g.beginPath();
    for(const linea of res.polilineas)linea.forEach((p,i)=>i?g.lineTo(5+p[0]*esc,5+p[1]*esc):g.moveTo(5+p[0]*esc,5+p[1]*esc));
    g.stroke();
    const muestra=window.Objetos.crearObjeto('imagen',{x:op.x,y:op.y,ancho:op.ancho,alto:res.alto,
      baseAncho:op.ancho,baseAlto:res.alto,polilineas:res.polilineas});
    const total=window.Objetos.objetoAPuntos(muestra,App.medidas()).length;
    const pag = App.pagina();
    const fuera = op.x + op.ancho > pag.ancho || op.y + res.alto > pag.alto;
    $('img-estado').textContent = `${res.polilineas.length} líneas, aproximadamente ${total} puntos, ${op.ancho.toFixed(0)} × ${res.alto.toFixed(0)} mm.` +
      (res.quitados ? ` Se ignoraron ${res.quitados} detalles chicos (letras, manchas).` : '') +
      (fuera ? ' Atención: la imagen se sale de la hoja.' : '');
    $('btn-img-agregar').disabled = !res.polilineas.length;
  }

  $('btn-imagen').addEventListener('click', () => {
    reconvertirId=null;
    $('img-paso').value = $('paso-dibujo').value;
    mostrarOpciones();
    actualizar();
    $('dlg-imagen').showModal();
  });

  // Usar el fondo de la página del PDF (por ejemplo, un mapa) en su tamaño y lugar reales.
  $('btn-img-fondo').addEventListener('click', () => {
    const p = App.pagina();
    if (!App.pdf || !App.pdf.id || p.pdfPagina == null) {
      $('img-estado').textContent = 'Esta página no tiene un PDF de fondo. Cargá un PDF o elegí una imagen.';
      return;
    }
    $('img-estado').textContent = 'Cargando el fondo de la página…';
    const img = new Image();
    img.onload = () => {
      imagen = img;
      imagen.nombre = 'fondo de la página ' + (p.pdfPagina + 1);
      $('img-ancho').value = p.ancho;
      $('img-x').value = 0;
      $('img-y').value = 0;
      if ($('img-modo').value !== 'lineas') $('img-modo').value = 'regiones';
      mostrarOpciones();
      actualizar();
    };
    img.onerror = () => { $('img-estado').textContent = 'No se pudo cargar el fondo de la página.'; };
    img.src = `/api/pdf/${App.pdf.id}/pagina/${p.pdfPagina}.png?dpi=200`;
  });
  $('img-archivo').addEventListener('change', () => {
    const f = $('img-archivo').files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { imagen = img; imagen.nombre = f.name; actualizar(); };
    img.onerror = () => { $('img-estado').textContent = 'No se pudo leer la imagen.'; };
    img.src = url;
  });
  // Recalcular con una pequeña espera: la detección de bordes tarda un poco en mapas grandes.
  let espera = null;
  function actualizarPronto() {
    clearTimeout(espera);
    espera = setTimeout(actualizar, 150);
  }
  $('img-modo').addEventListener('change', mostrarOpciones);
  $('img-k').addEventListener('change',actualizarPronto);
  ['img-modo', 'img-umbral', 'img-invertir', 'img-ancho', 'img-x', 'img-y', 'img-paso',
   'img-sens', 'img-suavizado', 'img-detalle', 'img-sueltos', 'img-texto',
   'img-colores','img-area','img-simplificacion','img-chaikin','img-min-largo'].forEach(id => {
    $(id).addEventListener('input', actualizarPronto);
    $(id).addEventListener('change', actualizarPronto);
  });
  function mascaraDe(id){const {W,H,ids}=mapaCapas,filas=[];for(let y=0;y<H;y++){const runs=[];let inicio=-1;for(let x=0;x<=W;x++){if(x<W&&ids[y*W+x]===id){if(inicio<0)inicio=x;}else if(inicio>=0){runs.push([inicio,x-1]);inicio=-1;}}filas.push(runs);}return {W,H,filas};}
  function contornosDe(id){const {W,H,ids,anchoMm}=mapaCapas;return window.CapasColor.poligonos(Uint8Array.from(ids,v=>v===id?1:0),W,H,anchoMm);}
  function objetosDeCapas(){const op=opciones(),original=lienzoMapa.toDataURL('image/jpeg',.82),grupo=App.nuevoId('g'),salida=[];
    mapaCapas.capas.forEach((c,i)=>{const a=asignaciones[i];if(['ignorar','texto'].includes(a.significado))return;const tipo=tipoSignificado(a.significado,c.rol),mascara=tipo==='area'?mascaraDe(c.id):null;
      let polilineas=tipo==='linea'?c.trazos.filter(v=>window.Vectorizar.largo(v)>=Math.max(2,Math.min(20,c.p90*.2))):tipo==='area'&&a.contorno?contornosDe(c.id):[];
      const simbolos=[];if(tipo==='simbolo'){const bin=Uint8Array.from(mapaCapas.ids,v=>v===c.id?1:0);for(const comp of window.CapasColor.componentes(bin,mapaCapas.W,mapaCapas.H))if(comp.length>=2){let x=0,y=0;for(const p of comp){x+=p%mapaCapas.W;y+=Math.floor(p/mapaCapas.W);}simbolos.push([x/comp.length*op.ancho/mapaCapas.W,y/comp.length*mapaCapas.altoMm/mapaCapas.H]);}}
      if(!mascara&&!polilineas.length&&!simbolos.length)return;
      const base=window.Objetos.crearObjeto('imagen',{id:App.nuevoId('o'),nombre:a.significado[0].toUpperCase()+a.significado.slice(1),grupo,
        x:op.x,y:op.y,ancho:op.ancho,alto:mapaCapas.altoMm,baseAncho:op.ancho,baseAlto:mapaCapas.altoMm,
        mapaCapa:true,indiceMapa:i,tipoMapa:tipo,estiloMapa:a.estilo,mascara,poligonos:tipo==='area'?(c.poligonos.length?c.poligonos:contornosDe(c.id)):[],polilineas,simbolos,linea:a.contorno?'continua':'ninguna',
        original,receta:{modo:'capas-color',K:Number($('img-k').value),ancho:op.ancho,x:op.x,y:op.y,asignaciones:asignaciones.map(q=>({...q}))},orden:App.pagina().objetos.length+salida.length});
      if(tipo==='linea'&&a.separar){const r=window.CapasColor.separar(polilineas);for(const [nombre,estilo,trazos] of [['Límites','rayada',r.rectas],['Ríos','punteada',r.curvas],['Revisar','ultrafina',r.revisar]])if(trazos.length)salida.push(Object.assign({},base,{id:App.nuevoId('o'),nombre,estiloMapa:estilo,polilineas:trazos}));}
      else salida.push(base);
    });return salida;}
  function vistaPuntos(){if(!mapaCapas)return;const objetos=objetosDeCapas(),elegida=$('img-vista-capa').value,activos=elegida==='todas'?objetos:objetos.filter(o=>o.indiceMapa===Number(elegida));
    const c=$('img-vista'),g=c.getContext('2d'),op=opciones(),esc=Math.min((c.width-10)/op.ancho,(c.height-10)/mapaCapas.altoMm);g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#111';let n=0;
    for(const o of activos)for(const p of window.Objetos.objetoAPuntos(o,App.medidas())){const q=window.Grilla.ajustarAGrilla(p[0],p[1],App.medidas().grilla);const x=5+(q[0]-op.x)*esc,y=5+(q[1]-op.y)*esc;if(x<0||y<0||x>=c.width||y>=c.height)continue;g.beginPath();g.arc(x,y,Math.max(1,esc*.5),0,Math.PI*2);g.fill();n++;}
    $('img-estado').textContent=`Vista previa en la grilla real: ${n} puntos de ${activos.length} capas. Antes de agregar, revisá el significado y los rótulos braille.`;}
  function agregarCapas(){if(!mapaCapas)return;const objetos=objetosDeCapas();if(!objetos.length){$('img-estado').textContent='No hay capas para agregar. Elegí un significado distinto de texto o ignorar.';return;}
    App.registrar();if(reconvertirId){const viejo=App.EditorObjetos.buscar(reconvertirId);if(viejo?.grupo)App.pagina().objetos=App.pagina().objetos.filter(o=>o.grupo!==viejo.grupo);else App.pagina().objetos=App.pagina().objetos.filter(o=>o.id!==reconvertirId);reconvertirId=null;}
    App.pagina().objetos.push(...objetos);App.EditorObjetos.seleccionar(objetos[0].id,false);App.cambio('objetos');$('img-estado').textContent=`Se agregaron ${objetos.length} capas editables agrupadas.`;}
  $('btn-img-puntos').addEventListener('click',vistaPuntos);
  $('btn-img-agregar').addEventListener('click', () => {
    if($('img-modo').value==='capas-color'){agregarCapas();return;}
    if (!resultado?.polilineas.length) return;
    const op=opciones();
    const datos={nombre:'Imagen '+(imagen.nombre||''),x:op.x,y:op.y,linea:'continua',
      ancho:op.ancho,alto:resultado.alto,baseAncho:op.ancho,baseAlto:resultado.alto,
      polilineas:resultado.polilineas,original:resultado.original,receta:op,
      relleno:op.modo==='relleno'?'disperso':'ninguno'};
    if(reconvertirId){const viejo=App.EditorObjetos.buscar(reconvertirId);if(!viejo)return;
      App.registrar();App.EditorObjetos.reemplazar(reconvertirId,Object.assign({},viejo,datos,{nombre:viejo.nombre,linea:viejo.linea}));App.cambio('objetos');
      $('img-estado').textContent=`Imagen reconvertida: ${resultado.polilineas.length} líneas.`;
    }else{App.EditorObjetos.crear('imagen',datos);$('img-estado').textContent=`Se agregaron ${resultado.polilineas.length} líneas editables.`;}
  });

  function reconvertir(o){
    reconvertirId=o.id;
    for(const [campo,valor] of Object.entries(o.receta||{})){
      const id={modo:'img-modo',umbral:'img-umbral',invertir:'img-invertir',ancho:'img-ancho',x:'img-x',y:'img-y',
        paso:'img-paso',sens:'img-sens',suavizado:'img-suavizado',detalle:'img-detalle',sueltos:'img-sueltos',texto:'img-texto',
        colores:'img-colores',area:'img-area',simplificacion:'img-simplificacion',chaikin:'img-chaikin',minLargo:'img-min-largo',K:'img-k'}[campo];
      if(id){const el=$(id);if(el.type==='checkbox')el.checked=!!valor;else el.value=valor;}
    }
    $('img-ancho').value=o.ancho;$('img-x').value=o.x;$('img-y').value=o.y;
    const img=new Image();img.onload=async()=>{imagen=img;mostrarOpciones();await actualizar();if(o.receta?.asignaciones&&mapaCapas){asignaciones=o.receta.asignaciones.map(q=>({...q}));pintarCapas();}};img.src=o.original;
    $('dlg-imagen').showModal();
  }
  App.Imagen = { convertir, cargarImagen: img => { imagen = img; actualizar(); },reconvertir };
})();
