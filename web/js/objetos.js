/* Geometría editable en mm. Las tablas de ciclos se ajustarán con muestras impresas. */
(function (raiz) {
  'use strict';
  const LINEAS = Object.freeze({
    continua: [1], punteada: [1, 0, 0], rayada: [1, 1, 1, 0, 0], ninguna: [0]
  });
  const RELLENOS = Object.freeze({ ninguno: 0, reticula: 3, horizontales: 3, diagonales: 3, disperso: 4 });
  const CAPAS = ['referencia', 'dibujo', 'rotulos', 'claves'];
  const red = n => Math.round(n * 1000) / 1000;
  const par = q => [Number(q[0]) || 0, Number(q[1]) || 0];
  const copiar = o => JSON.parse(JSON.stringify(o));

  function crearObjeto(tipo, datos) {
    const d = datos || {};
    return Object.assign({ id: null,
      tipo, nombre: tipo, capa: 'dibujo', rotacion: 0, bloqueado: false, oculto: false,
      grupo: null, orden: 0, linea: 'continua', relleno: 'ninguno',
      x: 0, y: 0, ancho: 0, alto: 0, vertices: [], puntos: [], cerrado: false }, copiar(d));
  }
  function migrarTrazos(pagina) {
    pagina.objetos = pagina.objetos || [];
    for (const t of pagina.trazos || []) {
      if (pagina.objetos.some(o => o.id === t.id)) continue;
      pagina.objetos.push(crearObjeto('puntos', { id: t.id, nombre: t.nombre || 'Puntos importados',
        capa: 'dibujo', puntos: copiar(t.puntos || []), orden: pagina.objetos.length }));
    }
    pagina.trazos = [];
    return pagina;
  }
  function vertices(o) {
    if (o.tipo === 'puntos') return (o.puntos || []).map(par);
    if (o.tipo === 'punto') return [[o.x, o.y]];
    if (o.tipo === 'linea' || o.tipo === 'polilinea' || o.tipo === 'poligono') return (o.vertices || []).map(par);
    const x = o.x, y = o.y, w = o.ancho, h = o.alto;
    if (o.tipo === 'rectangulo') return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    if (o.tipo === 'elipse') {
      const a = [];
      for (let i = 0; i < 72; i++) {
        const ang = i * Math.PI / 36;
        a.push([x+w/2 + w/2*Math.cos(ang), y+h/2 + h/2*Math.sin(ang)]);
      }
      return a;
    }
    return [];
  }
  function centro(o) {
    const v = vertices(o);
    if (!v.length) return [o.x || 0, o.y || 0];
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const q of v){x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1]);}
    return [(x0+x1)/2,(y0+y1)/2];
  }
  function geometria(o) {
    const v=vertices(o),ang = (o.rotacion || 0) * Math.PI / 180;
    if(!ang)return v;
    const c = centro(o);
    return v.map(q => [red(c[0]+(q[0]-c[0])*Math.cos(ang)-(q[1]-c[1])*Math.sin(ang)),
      red(c[1]+(q[0]-c[0])*Math.sin(ang)+(q[1]-c[1])*Math.cos(ang))]);
  }
  function caja(o) {
    const v = geometria(o);
    if (!v.length) return { x0:0,y0:0,x1:0,y1:0,ancho:0,alto:0 };
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const q of v){x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1]);}
    return { x0,y0,x1,y1,ancho:red(x1-x0),alto:red(y1-y0) };
  }
  function mover(o, dx, dy) {
    const n=copiar(o);
    if (['puntos','linea','polilinea','poligono'].includes(n.tipo)) {
      const k=n.tipo==='puntos'?'puntos':'vertices';
      n[k]=(n[k]||[]).map(q=>[red(q[0]+dx),red(q[1]+dy)]);
    } else { n.x=red((n.x||0)+dx); n.y=red((n.y||0)+dy); }
    return n;
  }
  function escalar(o, sx, sy, origen) {
    const n=copiar(o), c=origen||centro(o);
    if (['puntos','linea','polilinea','poligono'].includes(n.tipo)) {
      const k=n.tipo==='puntos'?'puntos':'vertices';
      n[k]=(n[k]||[]).map(q=>[red(c[0]+(q[0]-c[0])*sx),red(c[1]+(q[1]-c[1])*sy)]);
    } else {
      n.x=red(c[0]+((n.x||0)-c[0])*sx); n.y=red(c[1]+((n.y||0)-c[1])*sy);
      n.ancho=red((n.ancho||0)*sx); n.alto=red((n.alto||0)*sy);
    }
    return n;
  }
  function rotar(o, grados) { const n=copiar(o); n.rotacion=red(((n.rotacion||0)+grados)%360); return n; }
  function pasos(m) { return [m && m.grilla && m.grilla.px || m && m.entrePuntosX || m && m.entrePuntos || 2,
    m && m.grilla && m.grilla.py || m && m.entrePuntosY || m && m.entrePuntos || 2]; }
  function dentro(x,y,v) {
    let ok=false;
    for(let i=0,j=v.length-1;i<v.length;j=i++) {
      if (((v[i][1]>y)!==(v[j][1]>y)) && x < (v[j][0]-v[i][0])*(y-v[i][1])/(v[j][1]-v[i][1])+v[i][0]) ok=!ok;
    }
    return ok;
  }
  function distanciaSegmento(x,y,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
  }
  function objetoAPuntos(o,m) {
    if (!o || o.oculto) return [];
    const v=geometria(o), [px,py]=pasos(m), paso=Math.min(px,py), salida=[];
    if (o.tipo==='puntos' || o.tipo==='punto') return v;
    const cerrado=o.tipo==='rectangulo'||o.tipo==='elipse'||o.tipo==='poligono'||!!o.cerrado;
    const ciclo=LINEAS[o.linea]||LINEAS.continua;
    let distancia=0;
    for(let i=0;i<v.length-(cerrado?0:1);i++) {
      const a=v[i],b=v[(i+1)%v.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const n=Math.max(1,Math.round(l/paso));
      for(let j=0;j<(cerrado?n:n+1);j++) {
        const fase=Math.round((distancia+j*l/n)/paso)%ciclo.length;
        if(ciclo[fase]) salida.push([red(a[0]+(b[0]-a[0])*j/n),red(a[1]+(b[1]-a[1])*j/n)]);
      }
      distancia+=l;
    }
    const relleno=RELLENOS[o.relleno]===undefined?'ninguno':o.relleno;
    if (cerrado && relleno!=='ninguno' && v.length>=3) {
      const b=caja(o), nx=Math.floor(b.x1/px),ny=Math.floor(b.y1/py);
      for(let iy=Math.ceil(b.y0/py);iy<=ny;iy++) for(let ix=Math.ceil(b.x0/px);ix<=nx;ix++) {
        let usar=false;
        if(relleno==='reticula') usar=ix%3===0&&iy%3===0;
        else if(relleno==='horizontales') usar=iy%3===0;
        else if(relleno==='diagonales') usar=(ix+iy)%3===0;
        else if(relleno==='disperso') usar=iy%4===0 ? ix%4===0 : iy%4===2&&ix%4===2;
        if (!usar) continue;
        const x=red(ix*px),y=red(iy*py);
        if (!dentro(x,y,v)) continue;
        if (v.some((a,i)=>distanciaSegmento(x,y,a,v[(i+1)%v.length])<=paso+1e-6)) continue;
        salida.push([x,y]);
      }
    }
    return salida;
  }
  const api={ LINEAS,RELLENOS,CAPAS,crearObjeto,migrarTrazos,mover,escalar,rotar,caja,centro,geometria,objetoAPuntos,pasos };
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else raiz.Objetos=api;
})(typeof self!=='undefined'?self:this);
