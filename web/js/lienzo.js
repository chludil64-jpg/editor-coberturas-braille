/* Lienzo: dibuja la página en milímetros reales (fondo del PDF, reglas,
   márgenes, cuadros y puntos) y maneja el mouse y el teclado. */
(function () {
  'use strict';
  const App = window.App;

  const MARGEN = 30;          // px para las reglas
  const PX_POR_MM = 3;        // a zoom 100 %
  const DIAM_PUNTO = 1.5;     // mm (como se ve el punto en relieve)

  const lienzo = document.getElementById('lienzo');
  const ctx = lienzo.getContext('2d');
  const contenedor = document.getElementById('contenedor-lienzo');
  const fondos = new Map(); // clave -> Image
  const referencias=new Map();
  let mapaLazo=null,claveLazo='';
  let lazo=null,cursorLazo=[10,10],verticeElegido=null;
  let arrastre = null;      // estado del gesto en curso
  let vistaPrevia = null;   // puntos de la forma que se está dibujando
  let verticesPendientes = null;

  function escala() { return PX_POR_MM * App.ui.zoom; }
  function aPx(mm) { return MARGEN + mm * escala(); }
  function aMm(px) { return (px - MARGEN) / escala(); }

  function imagenFondo() {
    const p = App.pagina();
    if (!App.pdf.id || p.pdfPagina == null) return null;
    const clave = App.pdf.id + ':' + p.pdfPagina;
    if (!fondos.has(clave)) {
      const img = new Image();
      img.onload = () => dibujar();
      img.onerror = () => App.anunciar('No se pudo cargar el fondo del PDF.');
      img.src = `/api/pdf/${App.pdf.id}/pagina/${p.pdfPagina}.png?dpi=150`;
      fondos.set(clave, img);
    }
    const img = fondos.get(clave);
    return img.complete && img.naturalWidth ? img : null;
  }

  function dimensionar() {
    const p = App.pagina();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.ceil(aPx(p.ancho) + 20), h = Math.ceil(aPx(p.alto) + 20);
    lienzo.style.width = w + 'px';
    lienzo.style.height = h + 'px';
    lienzo.width = Math.round(w * dpr);
    lienzo.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function dibujarReglas(p) {
    const e = escala();
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, lienzo.width, MARGEN);
    ctx.fillRect(0, 0, MARGEN, lienzo.height);
    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#111';
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const paso = e >= 6 ? 1 : (e >= 2.5 ? 2 : 5);
    for (let mm = 0; mm <= p.ancho; mm += paso) {
      const x = Math.round(aPx(mm)) + 0.5;
      const largo = mm % 10 === 0 ? 12 : (mm % 5 === 0 ? 8 : 4);
      ctx.moveTo(x, MARGEN); ctx.lineTo(x, MARGEN - largo);
      if (mm % (e < 2 ? 50 : 10) === 0) ctx.fillText(String(mm), x + 2, 10);
    }
    for (let mm = 0; mm <= p.alto; mm += paso) {
      const y = Math.round(aPx(mm)) + 0.5;
      const largo = mm % 10 === 0 ? 12 : (mm % 5 === 0 ? 8 : 4);
      ctx.moveTo(MARGEN, y); ctx.lineTo(MARGEN - largo, y);
      if (mm % (e < 2 ? 50 : 10) === 0) {
        ctx.save(); ctx.translate(10, y + 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText(String(mm), -ctx.measureText(String(mm)).width - 2, 0); ctx.restore();
      }
    }
    ctx.stroke();
    ctx.fillText('mm', 3, 22);
  }

  function rectPx(r) {
    return [aPx(r.x0), aPx(r.y0), (r.x1 - r.x0) * escala(), (r.y1 - r.y0) * escala()];
  }
  function cajaSeleccion(){
    const ids=App.ui.seleccion||[],v=(App.pagina().objetos||[]).filter(o=>ids.includes(o.id)&&!o.oculto);
    if(!v.length)return null;
    const b=v.map(Objetos.caja);return {x0:Math.min(...b.map(q=>q.x0)),y0:Math.min(...b.map(q=>q.y0)),x1:Math.max(...b.map(q=>q.x1)),y1:Math.max(...b.map(q=>q.y1))};
  }
  function manijas(b){const cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
    return {nw:[b.x0,b.y0],n:[cx,b.y0],ne:[b.x1,b.y0],e:[b.x1,cy],se:[b.x1,b.y1],s:[cx,b.y1],sw:[b.x0,b.y1],w:[b.x0,cy],rotar:[cx,b.y0-7]};}
  function hayDesbloqueado(){const ids=App.ui.seleccion||[];return (App.pagina().objetos||[]).some(o=>ids.includes(o.id)&&!o.oculto&&!o.bloqueado);}
  function tocarManija(mm){const b=cajaSeleccion();if(!b||!hayDesbloqueado())return null;
    return Object.entries(manijas(b)).find(([,p])=>Math.hypot(mm[0]-p[0],mm[1]-p[1])<=Math.max(2,8/escala()))?.[0]||null;}

  function dibujar() {
    const p = App.pagina();
    if (!p) return;
    dimensionar();
    const e = escala();
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = '#8d8d8d';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    // Hoja
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(aPx(0), aPx(0), p.ancho * e, p.alto * e);
    const img = App.ui.vista === 'boleta' ? imagenFondo() : null;
    if (img) {
      ctx.globalAlpha = App.ui.opacidad;
      ctx.drawImage(img, aPx(0), aPx(0), p.ancho * e, p.alto * e);
      ctx.globalAlpha = 1;
    }
    for(const o of p.objetos||[]){if(o.tipo!=='referencia'||o.oculto||p.capasVisibles?.referencia===false)continue;let ref=referencias.get(o.src);if(!ref){ref=new Image();ref.onload=()=>dibujar();ref.src=o.src;referencias.set(o.src,ref);}if(ref.complete&&ref.naturalWidth){ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,o.opacidad??.5));const c=[o.x+o.ancho/2,o.y+o.alto/2];ctx.translate(aPx(c[0]),aPx(c[1]));ctx.rotate((o.rotacion||0)*Math.PI/180);ctx.drawImage(ref,-o.ancho*e/2,-o.alto*e/2,o.ancho*e,o.alto*e);ctx.restore();}}
    // Zona no imprimible
    const mg = App.perfil ? Grilla.margenesDeDiseno(App.perfil, p.ancho, p.alto) : null;
    if (mg) {
      ctx.fillStyle = 'rgba(200, 30, 30, 0.12)';
      ctx.fillRect(aPx(0), aPx(0), p.ancho * e, mg.superior * e);
      ctx.fillRect(aPx(0), aPx(p.alto - mg.inferior), p.ancho * e, mg.inferior * e);
      ctx.fillRect(aPx(0), aPx(0), mg.izquierdo * e, p.alto * e);
      ctx.fillRect(aPx(p.ancho - mg.derecho), aPx(0), mg.derecho * e, p.alto * e);
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(aPx(0) - 0.5, aPx(0) - 0.5, p.ancho * e + 1, p.alto * e + 1);

    const calc = App.calculo();
    const sel = App.ui.sel;
    // Texto en tinta resaltado desde la lista
    if (App.ui.resaltado) {
      ctx.fillStyle = 'rgba(255, 200, 0, 0.35)';
      ctx.fillRect(...rectPx(App.ui.resaltado));
    }
    // Cuadros
    for (const c of p.cuadros) {
      if(c.oculto||p.capasVisibles&&p.capasVisibles[c.capa||'rotulos']===false)continue;
      const cc = calc.cuadros.get(c.id);
      if (!cc) continue;
      if (App.ui.verTinta && c.tinta) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = '#1565c0';
        ctx.lineWidth = 1;
        ctx.strokeRect(...rectPx(c.tinta));
      }
      const elegido = sel && sel.tipo === 'cuadro' && sel.id === c.id;
      const r = Grilla.rectCuadro(c, cc);
      const m = 1.2;
      ctx.setLineDash(elegido ? [] : [5, 3]);
      ctx.strokeStyle = elegido ? '#0047b3' : '#555';
      ctx.lineWidth = elegido ? 2.5 : 1;
      ctx.strokeRect(aPx(r.x0 - m), aPx(r.y0 - m), (r.x1 - r.x0 + 2 * m) * e, (r.y1 - r.y0 + 2 * m) * e);
      if (elegido) {
        ctx.fillStyle = 'rgba(0, 71, 179, 0.08)';
        ctx.fillRect(aPx(r.x0 - m), aPx(r.y0 - m), (r.x1 - r.x0 + 2 * m) * e, (r.y1 - r.y0 + 2 * m) * e);
      }
    }
    ctx.setLineDash([]);
    // Puntos
    const radio = Math.max(1.2, DIAM_PUNTO / 2 * e);
    const lotes = { braille: [], dibujo: [], objeto: [], elegido: [] };
    for (const pt of calc.puntos) {
      const esSel = App.ui.seleccion && App.ui.seleccion.includes(pt.id);
      (esSel ? lotes.elegido : lotes[pt.origen]).push(pt);
    }
    const colores = { braille: '#000000', dibujo: '#0b3d91', objeto: '#0b3d91', elegido: '#a32600' };
    for (const k of Object.keys(lotes)) {
      ctx.fillStyle = colores[k];
      ctx.beginPath();
      for (const pt of lotes[k]) {
        const x = aPx(pt.x), y = aPx(pt.y);
        ctx.moveTo(x + radio, y);
        ctx.arc(x, y, radio, 0, Math.PI * 2);
      }
      ctx.fill();
      // Borde blanco para que el punto se vea también sobre fondos oscuros.
      if (img && lotes[k].length) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke(); }
    }
    if (vistaPrevia && vistaPrevia.length) {
      ctx.fillStyle = 'rgba(211, 84, 0, 0.75)';
      ctx.beginPath();
      for (const pt of vistaPrevia) {
        const x = aPx(pt[0]), y = aPx(pt[1]);
        ctx.moveTo(x + radio, y);
        ctx.arc(x, y, radio, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    if(lazo?.anclas.length){const pts=puntosLazo().concat(lazo.preview||[]);ctx.strokeStyle='#9b2d00';ctx.lineWidth=3;ctx.setLineDash([]);ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(aPx(q[0]),aPx(q[1])):ctx.moveTo(aPx(q[0]),aPx(q[1])));ctx.stroke();
      // Anclajes: cada clic queda marcado y se puede arrastrar. El primero es cuadrado (clic ahí cierra la forma).
      lazo.anclas.forEach((q,i)=>{ctx.fillStyle=i===lazo.anclas.length-1?'#9b2d00':'#fff';ctx.strokeStyle='#9b2d00';ctx.lineWidth=2;ctx.beginPath();if(i===0)ctx.rect(aPx(q[0])-6,aPx(q[1])-6,12,12);else ctx.arc(aPx(q[0]),aPx(q[1]),6,0,Math.PI*2);ctx.fill();ctx.stroke();});}
    if(verticeElegido){ctx.fillStyle='#a32600';ctx.beginPath();ctx.arc(aPx(verticeElegido.p[0]),aPx(verticeElegido.p[1]),7,0,Math.PI*2);ctx.fill();}
    const bs=cajaSeleccion();if(bs){
      ctx.strokeStyle='#a32600';ctx.lineWidth=2;ctx.setLineDash([5,3]);
      ctx.strokeRect(aPx(bs.x0),aPx(bs.y0),(bs.x1-bs.x0)*e,(bs.y1-bs.y0)*e);ctx.setLineDash([]);
      if(!hayDesbloqueado()){
        // Bloqueado: sin manijas, con un candado de texto para que se entienda por qué no se mueve.
        ctx.fillStyle='#a32600';ctx.font='bold 13px system-ui, sans-serif';ctx.fillText('🔒 Bloqueado (desbloquealo en Propiedades)',aPx(bs.x0),aPx(bs.y0)-6);
      } else {
      const h=manijas(bs);ctx.beginPath();ctx.moveTo(aPx(h.n[0]),aPx(h.n[1]));ctx.lineTo(aPx(h.rotar[0]),aPx(h.rotar[1]));ctx.stroke();
      for(const [nombre,[x,y]] of Object.entries(h)){
        ctx.fillStyle=nombre==='rotar'?'#a32600':'#fff';ctx.beginPath();ctx.arc(aPx(x),aPx(y),5,0,Math.PI*2);ctx.fill();ctx.stroke();
      }
      }
    }
    if(arrastre&&arrastre.tipo==='marco') {const a=arrastre.inicio,b=arrastre.ultimo;
      ctx.strokeStyle='#0047b3';ctx.setLineDash([4,2]);ctx.strokeRect(aPx(Math.min(a[0],b[0])),aPx(Math.min(a[1],b[1])),Math.abs(a[0]-b[0])*e,Math.abs(a[1]-b[1])*e);ctx.setLineDash([]);}
    if (arrastre && arrastre.tipo === 'goma' && arrastre.ultimo) {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(aPx(arrastre.ultimo[0]), aPx(arrastre.ultimo[1]), radioGoma() * e, 0, Math.PI * 2);
      ctx.stroke();
    }
    dibujarReglas(p);
  }

  function radioGoma() {
    return Number(document.getElementById('radio-goma').value) || 2;
  }
  function pasoDibujo() {
    return Math.max(0.5, Number(document.getElementById('paso-dibujo').value) || 2);
  }

  function posicion(ev) {
    const r = lienzo.getBoundingClientRect();
    return [Math.round(aMm(ev.clientX - r.left) * 100) / 100, Math.round(aMm(ev.clientY - r.top) * 100) / 100];
  }

  /** Busca qué hay bajo el puntero: primero cuadros, después trazos. */
  function tocar(mm) {
    const p = App.pagina();
    const calc = App.calculo();
    const dentro = c => {
      if(c.oculto||p.capasVisibles&&p.capasVisibles[c.capa||'rotulos']===false)return false;
      const cc = calc.cuadros.get(c.id);
      if (!cc) return false;
      const r = Grilla.rectCuadro(c, cc);
      return mm[0] >= r.x0 - 1.5 && mm[0] <= r.x1 + 1.5 && mm[1] >= r.y0 - 1.5 && mm[1] <= r.y1 + 1.5;
    };
    // Si el elemento ya elegido está bajo el puntero, tiene prioridad (cuadros superpuestos).
    const s = App.ui.sel;
    if (s && s.tipo === 'cuadro') {
      const c = p.cuadros.find(x => x.id === s.id);
      if (c && dentro(c)) return { tipo: 'cuadro', id: c.id };
    }
    for (let i = p.cuadros.length - 1; i >= 0; i--) {
      if (dentro(p.cuadros[i])) return { tipo: 'cuadro', id: p.cuadros[i].id };
    }
    const tol = Math.max(1.5, 6 / escala());
    for(const o of (p.objetos||[]).slice().sort((a,b)=>(b.orden||0)-(a.orden||0))) {
      if(o.oculto||p.capasVisibles&&p.capasVisibles[o.capa]===false)continue;
      const b=Objetos.caja(o);
      if(mm[0]>=b.x0-tol&&mm[0]<=b.x1+tol&&mm[1]>=b.y0-tol&&mm[1]<=b.y1+tol) return {tipo:'objeto',id:o.id};
    }
    for (let i = p.trazos.length - 1; i >= 0; i--) {
      const t = p.trazos[i];
      if (t.puntos.some(q => Math.hypot(q[0] - mm[0], q[1] - mm[1]) <= tol)) return { tipo: 'trazo', id: t.id };
    }
    return null;
  }

  function puntosForma(tipo, a, b) {
    const paso = pasoDibujo();
    if (tipo === 'linea') return Grilla.muestrearLinea(a, b, paso);
    if (tipo === 'rectangulo') return Grilla.muestrearRectangulo(a[0], a[1], b[0], b[1], paso);
    if (tipo === 'elipse') return Grilla.muestrearElipse(a[0], a[1], b[0], b[1], paso);
    return [a];
  }

  function borrarConGoma(mm) {
    const p = App.pagina();
    const r = radioGoma();
    let quitados = 0;
    for (const t of p.objetos.filter(o=>o.tipo==='puntos'&&!o.bloqueado)) {
      const antes = t.puntos.length;
      t.puntos = t.puntos.filter(q => Math.hypot(q[0] - mm[0], q[1] - mm[1]) > r);
      quitados += antes - t.puntos.length;
    }
    for(const o of p.objetos.filter(q=>['linea','polilinea','poligono'].includes(q.tipo)&&!q.bloqueado)){
      const cerca=Objetos.objetoAPuntos(o,App.medidas()).some(q=>Math.hypot(q[0]-mm[0],q[1]-mm[1])<=r);
      if(cerca){o.borrados=o.borrados||[];o.borrados.push([mm[0],mm[1],r]);quitados++;}
    }
    p.objetos = p.objetos.filter(t => t.tipo!=='puntos'||t.puntos.length > 0);
    return quitados;
  }
  function fuenteLazo(){const p=App.pagina(),o=(p.objetos||[]).find(q=>q.tipo==='referencia'&&!q.oculto),img=o?referencias.get(o.src):imagenFondo();if(!img||!img.naturalWidth)return null;return {img,o,x:o?.x||0,y:o?.y||0,w:o?.ancho||p.ancho,h:o?.alto||p.alto,clave:o?.src||`${App.pdf.id}:${p.pdfPagina}`};}
  function prepararLazo(){const f=fuenteLazo();if(!f)return null;if(claveLazo!==f.clave){const c=document.createElement('canvas'),s=Math.min(1,700/Math.max(f.img.naturalWidth,f.img.naturalHeight));c.width=Math.max(1,Math.round(f.img.naturalWidth*s));c.height=Math.max(1,Math.round(f.img.naturalHeight*s));const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(f.img,0,0,c.width,c.height);mapaLazo=window.Lazo.costos(g.getImageData(0,0,c.width,c.height).data,c.width,c.height);claveLazo=f.clave;}return f;}
  function tramoLazo(a,b){const f=prepararLazo();if(!f||!document.getElementById('lazo-iman').checked)return [a,b];const px=q=>[(q[0]-f.x)/f.w*mapaLazo.W,(q[1]-f.y)/f.h*mapaLazo.H],mm=q=>[f.x+q[0]/mapaLazo.W*f.w,f.y+q[1]/mapaLazo.H*f.h];const radio=Number(document.getElementById('lazo-radio').value)||8,inten=Number(document.getElementById('lazo-intensidad').value)/5;return window.Lazo.camino(mapaLazo,px(a),px(b),Math.ceil(radio*mapaLazo.W/f.w),inten).map(mm);}
  /** Puntos del trazo: primer anclaje y, después, cada tramo sin repetir su inicio. */
  function puntosLazo(){if(!lazo||!lazo.anclas.length)return [];return [lazo.anclas[0]].concat(...lazo.tramos.map(s=>s.slice(1)));}
  function iniciarLazo(mm){lazo={anclas:[mm],tramos:[],quitadas:[],preview:[]};App.anunciar('Lazo iniciado. Cada clic fija un punto; arrastrá un punto para corregirlo; Ctrl+Z o Retroceso borra el último; Enter o doble clic termina.');}
  function agregarAncla(mm){const ant=lazo.anclas.at(-1);lazo.tramos.push(tramoLazo(ant,mm));lazo.anclas.push(mm);lazo.quitadas=[];App.anunciar(`Punto ${lazo.anclas.length} fijado.`);}
  /** Saca el último punto del lazo (Ctrl+Z / Retroceso). Devuelve false si no había lazo. */
  function deshacerLazo(){if(!lazo)return false;if(lazo.anclas.length<=1){lazo=null;App.anunciar('Lazo cancelado.');dibujar();return true;}lazo.quitadas.push({ancla:lazo.anclas.pop(),tramo:lazo.tramos.pop()});lazo.preview=[];App.anunciar(`Punto borrado. Quedan ${lazo.anclas.length}.`);dibujar();return true;}
  /** Vuelve a poner el último punto quitado (Ctrl+Y). */
  function rehacerLazo(){if(!lazo||!lazo.quitadas.length)return !!lazo;const q=lazo.quitadas.pop();lazo.anclas.push(q.ancla);lazo.tramos.push(q.tramo);App.anunciar(`Punto ${lazo.anclas.length} repuesto.`);dibujar();return true;}
  /** Mueve un anclaje y recalcula los dos tramos que lo tocan. */
  function moverAncla(i,mm){lazo.anclas[i]=mm;if(i>0)lazo.tramos[i-1]=tramoLazo(lazo.anclas[i-1],mm);if(i<lazo.anclas.length-1)lazo.tramos[i]=tramoLazo(mm,lazo.anclas[i+1]);}
  function anclaCercana(mm){if(!lazo)return -1;const tol=Math.max(2,8/escala());let mejor=-1,dmin=Infinity;lazo.anclas.forEach((q,i)=>{const d=Math.hypot(q[0]-mm[0],q[1]-mm[1]);if(d<tol&&d<dmin){dmin=d;mejor=i;}});return mejor;}
  function terminarLazo(cerrar=false){if(!lazo)return;if(cerrar&&lazo.anclas.length>=3){lazo.tramos.push(tramoLazo(lazo.anclas.at(-1),lazo.anclas[0]));}const puntos=puntosLazo();const minimo=cerrar?3:2;if(puntos.length>=minimo){const tipo=cerrar?'poligono':'polilinea',tol=Number(document.getElementById('lazo-simplificar').value)||0,v=window.Lazo.simplificar(puntos,tol);const sig=document.getElementById('lazo-significado').value;App.EditorObjetos.crear(tipo,{nombre:sig[0].toUpperCase()+sig.slice(1),vertices:v,cerrado:cerrar});App.anunciar(`${sig}: ${v.length} vértices. ${cerrar?'Forma cerrada.':'Trazo terminado.'}`);}lazo=null;dibujar();}
  function lineaCercana(mm){const tol=Math.max(2,7/escala());let mejor=null;for(const o of App.pagina().objetos||[]){if(o.bloqueado||o.oculto||!['linea','polilinea','poligono'].includes(o.tipo))continue;const v=Objetos.geometria(o);for(let i=0;i<v.length-(o.tipo==='poligono'?0:1);i++){const d=Objetos.distanciaSegmento(mm[0],mm[1],v[i],v[(i+1)%v.length]);if(d<tol&&(!mejor||d<mejor.d))mejor={o,i,d};}}return mejor;}
  function verticeCercano(mm){const o=App.ui.sel?.tipo==='objeto'&&App.EditorObjetos.buscar(App.ui.sel.id);if(!o||o.bloqueado||!['linea','polilinea','poligono'].includes(o.tipo))return null;const v=Objetos.geometria(o),i=v.findIndex(p=>Math.hypot(mm[0]-p[0],mm[1]-p[1])<Math.max(2,8/escala()));return i<0?null:{o,i,p:v[i]};}

  lienzo.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    lienzo.focus();
    const mm = posicion(ev);
    const h = App.ui.herramienta;
    lienzo.setPointerCapture(ev.pointerId);
    if(h==='lazo'){if(!lazo){iniciarLazo(mm);dibujar();return;}const i=anclaCercana(mm);if(i>=0){arrastre={tipo:'ancla',i,inicio:mm,movido:false};return;}agregarAncla(mm);lazo.preview=[];dibujar();return;}
    if(h==='editar-vertices'){const v=verticeCercano(mm);if(v){verticeElegido=v;arrastre={tipo:'vertice',id:v.o.id,i:v.i,registrado:false};dibujar();}else{const hit=lineaCercana(mm);if(hit)App.EditorObjetos.seleccionar(hit.o.id,false);}return;}
    if(h==='borrar-linea'||h==='tijera'){const hit=lineaCercana(mm);if(!hit)return;App.registrar();if(h==='borrar-linea'){if(ev.altKey){const partes=Objetos.borrarTramo(hit.o,hit.i);App.pagina().objetos=App.pagina().objetos.filter(o=>o.id!==hit.o.id);for(const parte of partes){parte.id=App.nuevoId('o');parte.grupo=null;App.pagina().objetos.push(parte);}App.anunciar('Tramo borrado.');}else{App.pagina().objetos=App.pagina().objetos.filter(o=>o.id!==hit.o.id);App.anunciar('Línea borrada.');}App.EditorObjetos.seleccionar(null,false);}else{try{const partes=Objetos.cortarLinea(hit.o,hit.i,mm);partes[0].id=hit.o.id;partes[1].id=App.nuevoId('o');partes[0].grupo=partes[1].grupo=null;App.EditorObjetos.reemplazar(hit.o.id,partes[0]);App.pagina().objetos.push(partes[1]);App.anunciar('Línea cortada en dos.');}catch(e){App.anunciar(e.message);}}App.cambio('objetos');return;}
    if (h === 'seleccionar') {
      const manija=tocarManija(mm);
      if(manija){
        const ids=(App.ui.seleccion||[]).filter(id=>!App.EditorObjetos.buscar(id)?.bloqueado);
        if(ids.length){const b=cajaSeleccion();arrastre={tipo:manija==='rotar'?'rotar':'escalar',manija,ids,base:b,
          originales:ids.map(id=>JSON.parse(JSON.stringify(App.EditorObjetos.buscar(id)))),inicio:mm,registrado:false};return;}
      }
      const t = tocar(mm);
      if(t&&t.tipo==='objeto') App.EditorObjetos.seleccionar(t.id,ev.shiftKey);
      else if(t) App.seleccionar(t.tipo,t.id);
      else if(!ev.shiftKey) App.EditorObjetos.seleccionar(null,false);
      if (t) {
        const o=t.tipo==='objeto'&&App.EditorObjetos.buscar(t.id);
        if((o&&o.bloqueado)||(t.tipo==='cuadro'&&App.buscarSel()?.bloqueado)){App.anunciar('Elemento bloqueado: para moverlo o cambiarle el tamaño, usá «Bloquear o desbloquear» en el panel de elementos.');return;}
        arrastre = { tipo: 'mover', inicio: mm, ultimo: mm, registrado: false };
      } else arrastre={tipo:'marco',inicio:mm,ultimo:mm};
      return;
    }
    if (h === 'punto') {
      App.EditorObjetos.crear('punto',{x:mm[0],y:mm[1]});
      return;
    }
    if(h==='polilinea'||h==='poligono') {
      if(!verticesPendientes)verticesPendientes={tipo:h,puntos:[]};
      const ult=verticesPendientes.puntos.at(-1);
      if(!ult||Math.hypot(ult[0]-mm[0],ult[1]-mm[1])>0.5)verticesPendientes.puntos.push(mm);
      vistaPrevia=verticesPendientes.puntos.slice();dibujar();return;
    }
    if (h === 'goma') {
      App.registrar();
      arrastre = { tipo: 'goma', ultimo: mm, quitados: borrarConGoma(mm) };
      App.cambio('dibujo');
      return;
    }
    if (h === 'mano') {
      arrastre = { tipo: 'mano', camino: [mm] };
      vistaPrevia = [mm];
      dibujar();
      return;
    }
    arrastre = { tipo: 'forma', forma: h, inicio: mm };
    vistaPrevia = puntosForma(h, mm, mm);
    dibujar();
  });

  lienzo.addEventListener('pointermove', ev => {
    const mm = posicion(ev);
    document.getElementById('cursor-mm').textContent = `x ${mm[0].toFixed(1)} mm · y ${mm[1].toFixed(1)} mm`;
    cursorLazo=mm;
    if(lazo&&arrastre&&arrastre.tipo==='ancla'){if(Math.hypot(mm[0]-arrastre.inicio[0],mm[1]-arrastre.inicio[1])>0.8)arrastre.movido=true;if(arrastre.movido){const now=performance.now();if(!arrastre.ultima||now-arrastre.ultima>60){moverAncla(arrastre.i,mm);arrastre.ultima=now;dibujar();}}return;}
    if(lazo&&!arrastre&&App.ui.herramienta==='lazo'){const now=performance.now();if(!lazo.ultimaVista||now-lazo.ultimaVista>80){lazo.preview=tramoLazo(lazo.anclas.at(-1),mm).slice(1);lazo.ultimaVista=now;dibujar();}}
    if(!arrastre&&App.ui.herramienta==='seleccionar'){
      const h=tocarManija(mm);lienzo.style.cursor=h==='rotar'?'grab':h?({n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize'}[h]):tocar(mm)?'move':'default';}
    if (!arrastre) return;
    if (arrastre.tipo === 'mover') {
      const dx = mm[0] - arrastre.ultimo[0], dy = mm[1] - arrastre.ultimo[1];
      if (!dx && !dy) return;
      if (!arrastre.registrado) { App.registrar(); arrastre.registrado = true; }
      mover(dx, dy, true);
      arrastre.ultimo = mm;
    } else if(arrastre.tipo==='vertice'){const o=App.EditorObjetos.buscar(arrastre.id);if(!arrastre.registrado){App.registrar();arrastre.registrado=true;}App.EditorObjetos.reemplazar(o.id,Objetos.editarVertice(o,arrastre.i,mm));verticeElegido={o,i:arrastre.i,p:mm};App.cambio('arrastre');
    } else if(arrastre.tipo==='marco') { arrastre.ultimo=mm;dibujar();
    } else if(arrastre.tipo==='escalar') {
      if(!arrastre.registrado){App.registrar();arrastre.registrado=true;}
      const a=arrastre,b=a.base,h=a.manija,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
      const ox=h.includes('w')?b.x1:h.includes('e')?b.x0:cx,oy=h.includes('n')?b.y1:h.includes('s')?b.y0:cy;
      let sx=h==='n'||h==='s'?1:(mm[0]-ox)/((h.includes('w')?b.x0:h.includes('e')?b.x1:cx)-ox||1);
      let sy=h==='e'||h==='w'?1:(mm[1]-oy)/((h.includes('n')?b.y0:h.includes('s')?b.y1:cy)-oy||1);
      sx=Math.max(.01,sx);sy=Math.max(.01,sy);
      const proporcional=ev.shiftKey||(!ev.altKey&&a.originales.length===1&&a.originales[0].tipo==='imagen'&&h.length===2);
      if(proporcional){const s=Math.abs(sx-1)>Math.abs(sy-1)?sx:sy;sx=s;sy=s;}
      a.originales.forEach(o=>App.EditorObjetos.reemplazar(o.id,Objetos.escalar(o,sx,sy,[ox,oy])));App.cambio('arrastre');
    } else if(arrastre.tipo==='rotar') {
      if(!arrastre.registrado){App.registrar();arrastre.registrado=true;}
      const a=arrastre,b=a.base,c=[(b.x0+b.x1)/2,(b.y0+b.y1)/2];
      let ang=(Math.atan2(mm[1]-c[1],mm[0]-c[0])-Math.atan2(a.inicio[1]-c[1],a.inicio[0]-c[0]))*180/Math.PI;
      if(ev.shiftKey)ang=Math.round(ang/15)*15;
      const rad=ang*Math.PI/180;
      a.originales.forEach(o=>{let n=Objetos.rotar(o,ang),p=Objetos.centro(o),dx=p[0]-c[0],dy=p[1]-c[1];
        n=Objetos.mover(n,dx*Math.cos(rad)-dy*Math.sin(rad)-dx,dx*Math.sin(rad)+dy*Math.cos(rad)-dy);App.EditorObjetos.reemplazar(o.id,n);});App.cambio('arrastre');
    } else if (arrastre.tipo === 'goma') {
      arrastre.ultimo = mm;
      arrastre.quitados += borrarConGoma(mm);
      App.cambio('dibujo');
    } else if (arrastre.tipo === 'mano') {
      const u = arrastre.camino[arrastre.camino.length - 1];
      if (Math.hypot(u[0] - mm[0], u[1] - mm[1]) >= 0.3) arrastre.camino.push(mm);
      vistaPrevia = Grilla.muestrearTrayecto(arrastre.camino, pasoDibujo(), false);
      dibujar();
    } else if (arrastre.tipo === 'forma') {
      vistaPrevia = puntosForma(arrastre.forma, arrastre.inicio, mm);
      dibujar();
    }
  });

  function terminar(ev) {
    if (!arrastre) return;
    const a = arrastre;
    arrastre = null;
    const mm = ev ? posicion(ev) : null;
    if (a.tipo === 'ancla') {
      // Soltar un anclaje del lazo: si se arrastró, queda en su lugar nuevo; si fue un clic
      // sobre el PRIMER punto y hay al menos 3, se cierra la forma.
      if (!lazo) return;
      if (a.movido) { if (mm) moverAncla(a.i, mm); App.anunciar(`Punto ${a.i + 1} movido.`); dibujar(); return; }
      if (a.i === 0 && lazo.anclas.length >= 3) { terminarLazo(true); return; }
      return;
    }
    if (a.tipo === 'forma') {
      vistaPrevia = null;
      const b=mm||a.inicio,datos=a.forma==='linea'?{vertices:[a.inicio,b]}:
        {x:Math.min(a.inicio[0],b[0]),y:Math.min(a.inicio[1],b[1]),ancho:Math.abs(b[0]-a.inicio[0]),alto:Math.abs(b[1]-a.inicio[1])};
      App.EditorObjetos.crear(a.forma,datos);
    } else if (a.tipo === 'mano') {
      const pts = Grilla.muestrearTrayecto(a.camino, pasoDibujo(), false);
      vistaPrevia = null;
      App.registrar();
      App.Dibujo.agregarTrazo('mano', pts, 'Mano alzada');
    } else if (a.tipo === 'goma') {
      App.anunciar(`Goma: se borraron ${a.quitados} puntos.`);
      App.cambio('dibujo');
    } else if (a.tipo === 'mover' && a.registrado) {
      const el = App.buscarSel();
      if (el && App.ui.sel.tipo === 'cuadro') App.anunciar(`Cuadro en x ${el.x.toFixed(1)}, y ${el.y.toFixed(1)} mm.`);
      App.cambio('mover');
    } else if(a.tipo==='marco') {
      const b=a.ultimo||a.inicio,x0=Math.min(a.inicio[0],b[0]),x1=Math.max(a.inicio[0],b[0]),y0=Math.min(a.inicio[1],b[1]),y1=Math.max(a.inicio[1],b[1]);
      const ids=App.pagina().objetos.filter(o=>{const r=Objetos.caja(o);return r.x0>=x0&&r.x1<=x1&&r.y0>=y0&&r.y1<=y1;}).map(o=>o.id);
      App.ui.seleccion=ids;App.ui.sel=ids.length?{tipo:'objeto',id:ids.at(-1)}:null;App.cambio('seleccion');
    } else if(a.tipo==='vertice'&&a.registrado){App.cambio('objetos');App.anunciar('Vértice movido.');
    } else if((a.tipo==='escalar'||a.tipo==='rotar')&&a.registrado){App.cambio('objetos');App.anunciar('Forma transformada.');
    }
  }
  lienzo.addEventListener('pointerup', terminar);
  lienzo.addEventListener('pointercancel', () => { arrastre = null; vistaPrevia = null; dibujar(); });

  /** Mueve el elemento elegido. `silencioso` evita anunciar en cada paso del arrastre. */
  function mover(dx, dy, silencioso) {
    const el = App.buscarSel();
    if (!el) return;
    const r = v => Math.round(v * 1000) / 1000;
    if (App.ui.sel.tipo === 'cuadro') {
      if(el.bloqueado)return;
      el.x = r(el.x + dx);
      el.y = r(el.y + dy);
      el.alineacion = 'libre';
    } else if(App.ui.sel.tipo==='objeto') {
      for(const id of App.ui.seleccion||[el.id]) {const o=App.EditorObjetos.buscar(id);if(o&&!o.bloqueado)App.EditorObjetos.reemplazar(id,Objetos.mover(o,dx,dy));}
    } else {
      el.puntos = el.puntos.map(q => [r(q[0] + dx), r(q[1] + dy)]);
    }
    App.cambio(silencioso ? 'arrastre' : 'mover');
  }

  function elementosOrdenados() {
    const p = App.pagina();
    return p.cuadros.map(c => ({ tipo: 'cuadro', id: c.id })).concat((p.objetos||[]).map(t => ({ tipo: 'objeto', id: t.id })));
  }

  function describirSel() {
    const el = App.buscarSel();
    if (!el) return 'Nada elegido.';
    if (App.ui.sel.tipo === 'cuadro') {
      return `Cuadro «${el.texto.replace(/\n/g, ' / ')}», x ${el.x.toFixed(1)}, y ${el.y.toFixed(1)} mm.`;
    }
    return `Objeto «${el.nombre}», tipo ${el.tipo}.`;
  }

  lienzo.addEventListener('keydown', ev => {
    const flechas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if(App.ui.herramienta==='lazo'){if(flechas[ev.key]){cursorLazo=[cursorLazo[0]+flechas[ev.key][0],cursorLazo[1]+flechas[ev.key][1]];App.anunciar(`Cursor x ${cursorLazo[0].toFixed(1)}, y ${cursorLazo[1].toFixed(1)} mm.`);ev.preventDefault();return;}if(ev.key==='Enter'){if(!lazo){iniciarLazo(cursorLazo);}else if(Math.hypot(cursorLazo[0]-lazo.anclas.at(-1)[0],cursorLazo[1]-lazo.anclas.at(-1)[1])<.5){terminarLazo();}else{agregarAncla(cursorLazo);}ev.preventDefault();dibujar();return;}if(ev.key==='Backspace'&&lazo){deshacerLazo();ev.preventDefault();return;}if(ev.key==='Escape'&&lazo){lazo=null;App.anunciar('Lazo cancelado.');ev.preventDefault();dibujar();return;}}
    if(ev.key==='Delete'&&verticeElegido&&App.ui.herramienta==='editar-vertices'){try{const v=verticeElegido,o=App.EditorObjetos.buscar(v.o.id);App.registrar();App.EditorObjetos.reemplazar(o.id,Objetos.quitarVertice(o,v.i));verticeElegido=null;App.cambio('objetos');App.anunciar('Vértice borrado.');}catch(e){App.anunciar(e.message);}ev.preventDefault();return;}
    if (flechas[ev.key]) {
      if (!App.buscarSel()) { App.anunciar('Elegí un elemento con Av Pág o desde la lista.'); ev.preventDefault(); return; }
      if(ev.ctrlKey&&App.ui.sel.tipo==='objeto'){
        App.EditorObjetos.transformarSeleccion('escalar',flechas[ev.key][0]+flechas[ev.key][1]<0?.95:1.05);ev.preventDefault();return;}
      const paso = ev.shiftKey ? 5 : 1;
      const medidas=Objetos.pasos(App.medidas());
      App.registrar();
      mover(flechas[ev.key][0] * paso * medidas[0], flechas[ev.key][1] * paso * medidas[1], false);
      App.anunciar(describirSel());
      ev.preventDefault();
    } else if(App.ui.sel?.tipo==='objeto'&&!ev.ctrlKey&&['+','-','r','R'].includes(ev.key)){
      if(ev.key.toLowerCase()==='r')App.EditorObjetos.transformarSeleccion('rotar',ev.shiftKey?-15:15);
      else App.EditorObjetos.transformarSeleccion('escalar',ev.key==='+'?1.05:.95);
      ev.preventDefault();
    } else if (ev.key === 'PageDown' || ev.key === 'PageUp') {
      const lista = elementosOrdenados();
      if (!lista.length) { App.anunciar('La página no tiene elementos.'); ev.preventDefault(); return; }
      const s = App.ui.sel;
      let i = s ? lista.findIndex(x => x.id === s.id) : -1;
      i = ev.key === 'PageDown' ? (i + 1) % lista.length : (i - 1 + lista.length) % lista.length;
      App.seleccionar(lista[i].tipo, lista[i].id);
      App.anunciar(describirSel());
      ev.preventDefault();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (App.buscarSel()) {
        if(App.ui.sel.tipo==='objeto')App.EditorObjetos.operar('borrar');else App.Cuadros.borrarSeleccion();
        ev.preventDefault();
      }
    } else if (ev.key === 'Escape') {
      verticesPendientes=null;vistaPrevia=null;App.seleccionar(null);
      App.anunciar('Nada elegido.');
    } else if(ev.key==='Enter'&&verticesPendientes){terminarVertices();ev.preventDefault();
    } else if(ev.ctrlKey&&ev.key.toLowerCase()==='d'){App.EditorObjetos.operar('duplicar');ev.preventDefault();
    } else if(ev.ctrlKey&&ev.key.toLowerCase()==='g'){App.EditorObjetos.operar(ev.shiftKey?'desagrupar':'agrupar');ev.preventDefault();
    } else if(ev.ctrlKey&&ev.key.toLowerCase()==='a'){App.ui.seleccion=App.pagina().objetos.map(o=>o.id);App.ui.sel=App.ui.seleccion.length?{tipo:'objeto',id:App.ui.seleccion.at(-1)}:null;App.cambio('seleccion');ev.preventDefault();
    }
  });
  function terminarVertices(){if(!verticesPendientes)return;const v=verticesPendientes;verticesPendientes=null;vistaPrevia=null;
    if(v.puntos.length>=(v.tipo==='poligono'?3:2))App.EditorObjetos.crear(v.tipo,{vertices:v.puntos,cerrado:v.tipo==='poligono'});else dibujar();}
  // Clic derecho sobre un elemento: lo elige (si no estaba elegido) y abre el menú de acciones.
  lienzo.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    if (lazo) return;
    const mm = posicion(ev), t = tocar(mm);
    if (t && t.tipo === 'objeto' && !(App.ui.seleccion || []).includes(t.id)) App.EditorObjetos.seleccionar(t.id, false);
    else if (t && t.tipo !== 'objeto') App.seleccionar(t.tipo, t.id);
    if (!t && !(App.ui.seleccion || []).length) { App.anunciar('No hay ningún elemento ahí.'); return; }
    if (App.MenuContextual) App.MenuContextual.abrir(ev.clientX, ev.clientY, lienzo);
  });
  lienzo.addEventListener('dblclick',ev=>{if(App.ui.herramienta==='lazo'){terminarLazo();return;}if(App.ui.herramienta==='editar-vertices'){const mm=posicion(ev),hit=lineaCercana(mm);if(hit){App.registrar();App.EditorObjetos.reemplazar(hit.o.id,Objetos.agregarVertice(hit.o,hit.i,mm));App.cambio('objetos');App.anunciar('Vértice agregado.');}return;}terminarVertices();});

  window.addEventListener('pointerup', () => { if (arrastre) terminar(null); });

  function ajustarZoom() {
    const p = App.pagina();
    const ancho = contenedor.clientWidth - MARGEN - 30;
    const alto = contenedor.clientHeight - MARGEN - 30;
    const z = Math.min(ancho / (p.ancho * PX_POR_MM), alto > 100 ? alto / (p.alto * PX_POR_MM) : 99);
    App.ui.zoom = Math.max(0.3, Math.min(6, Math.round(z * 20) / 20));
    actualizarZoom();
  }
  function actualizarZoom() {
    document.getElementById('zoom-valor').textContent = Math.round(App.ui.zoom * 100) + ' %';
    dibujar();
  }

  App.Lienzo = { lazoActivo: () => !!lazo, deshacerLazo, rehacerLazo, dibujar, ajustarZoom, actualizarZoom, mover, describirSel, limpiarFondos: () => fondos.clear() };
  App.alCambiar(() => dibujar());
  window.addEventListener('resize', () => dibujar());
})();
