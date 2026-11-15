/* Importación local de imágenes como vectores táctiles editables. */
(function () {
  'use strict';
  const App = window.App;
  const $ = id => document.getElementById(id);
  let imagen = null;
  let resultado = null;
  let reconvertirId = null;
  let trabajo = null,serie=0;

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
    $('img-opciones-mapa').hidden = false;
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
  ['img-modo', 'img-umbral', 'img-invertir', 'img-ancho', 'img-x', 'img-y', 'img-paso',
   'img-sens', 'img-suavizado', 'img-detalle', 'img-sueltos', 'img-texto',
   'img-colores','img-area','img-simplificacion','img-chaikin','img-min-largo'].forEach(id => {
    $(id).addEventListener('input', actualizarPronto);
    $(id).addEventListener('change', actualizarPronto);
  });
  $('btn-img-agregar').addEventListener('click', () => {
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
        colores:'img-colores',area:'img-area',simplificacion:'img-simplificacion',chaikin:'img-chaikin',minLargo:'img-min-largo'}[campo];
      if(id){const el=$(id);if(el.type==='checkbox')el.checked=!!valor;else el.value=valor;}
    }
    $('img-ancho').value=o.ancho;$('img-x').value=o.x;$('img-y').value=o.y;
    const img=new Image();img.onload=()=>{imagen=img;mostrarOpciones();actualizar();};img.src=o.original;
    $('dlg-imagen').showModal();
  }
  App.Imagen = { convertir, cargarImagen: img => { imagen = img; actualizar(); },reconvertir };
})();
