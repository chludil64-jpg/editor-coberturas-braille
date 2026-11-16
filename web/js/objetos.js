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
      x: 0, y: 0, ancho: 0, alto: 0, vertices: [], puntos: [], borrados: [], cerrado: false }, copiar(d));
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
    if (o.tipo === 'imagen' || o.tipo === 'referencia') return [[o.x,o.y],[o.x+o.ancho,o.y],[o.x+o.ancho,o.y+o.alto],[o.x,o.y+o.alto]];
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
    n.borrados=(n.borrados||[]).map(q=>[red(q[0]+dx),red(q[1]+dy),q[2]]);
    if (['puntos','linea','polilinea','poligono'].includes(n.tipo)) {
      const k=n.tipo==='puntos'?'puntos':'vertices';
      n[k]=(n[k]||[]).map(q=>[red(q[0]+dx),red(q[1]+dy)]);
    } else { n.x=red((n.x||0)+dx); n.y=red((n.y||0)+dy); }
    return n;
  }
  function escalar(o, sx, sy, origen) {
    const n=copiar(o), c=origen||centro(o);
    n.borrados=(n.borrados||[]).map(q=>[red(c[0]+(q[0]-c[0])*sx),red(c[1]+(q[1]-c[1])*sy),q[2]*Math.max(Math.abs(sx),Math.abs(sy))]);
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
  function voltear(o, eje) {
    const n=copiar(o);
    if(n.tipo==='imagen') { n[eje==='horizontal'?'espejoX':'espejoY']=!n[eje==='horizontal'?'espejoX':'espejoY'];return n; }
    const c=centro(o),k=n.tipo==='puntos'?'puntos':'vertices';
    if(['puntos','linea','polilinea','poligono'].includes(n.tipo)) n[k]=(n[k]||[]).map(p=>eje==='horizontal'?[red(2*c[0]-p[0]),p[1]]:[p[0],red(2*c[1]-p[1])]);
    else if(n.tipo!=='punto') n.rotacion=red(-(n.rotacion||0));
    return n;
  }
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
  function editarVertice(o,i,p){const n=copiar(o);if(!Array.isArray(n.vertices)||i<0||i>=n.vertices.length)throw Error('Vértice inválido');n.vertices[i]=par(p);return n;}
  function agregarVertice(o,i,p){const n=copiar(o);if(!Array.isArray(n.vertices)||i<0||i>=n.vertices.length)throw Error('Tramo inválido');n.vertices.splice(i+1,0,par(p));return n;}
  function quitarVertice(o,i){const n=copiar(o),min=n.tipo==='poligono'?3:2;if(!n.vertices||n.vertices.length<=min||i<0||i>=n.vertices.length)throw Error('No se puede borrar ese vértice');n.vertices.splice(i,1);return n;}
  function cortarLinea(o,i,p){if(o.tipo!=='polilinea'&&o.tipo!=='linea')throw Error('Elegí una línea abierta');const a=agregarVertice(o,i,p),primero=copiar(a),segundo=copiar(a);primero.tipo=segundo.tipo='polilinea';primero.vertices=a.vertices.slice(0,i+2);segundo.vertices=a.vertices.slice(i+1);return [primero,segundo];}
  function borrarTramo(o,i){if(!['linea','polilinea'].includes(o.tipo)||i<0||i>=o.vertices.length-1)throw Error('Tramo inválido');const n=o.vertices,partes=[n.slice(0,i+1),n.slice(i+1)].filter(v=>v.length>=2);return partes.map(v=>crearObjeto('polilinea',{...o,vertices:v}));}
  function unirLineas(a,b,tolerancia=3){if(!['linea','polilinea'].includes(a.tipo)||!['linea','polilinea'].includes(b.tipo))throw Error('Elegí dos líneas abiertas');let av=a.vertices.slice(),bv=b.vertices.slice(),pares=[[0,0],[0,1],[1,0],[1,1]].map(([i,j])=>({i,j,d:Math.hypot(av[i?av.length-1:0][0]-bv[j?bv.length-1:0][0],av[i?av.length-1:0][1]-bv[j?bv.length-1:0][1])})).sort((x,y)=>x.d-y.d);const q=pares[0];if(q.d>tolerancia)throw Error('Los extremos están demasiado lejos');if(q.i===0)av.reverse();if(q.j===1)bv.reverse();return crearObjeto('polilinea',{...a,vertices:av.concat(bv.slice(1)),grupo:a.grupo===b.grupo?a.grupo:null});}
  /* Con grilla de impresora: el contorno se traza celda por celda (Bresenham) en la misma grilla
     donde se imprime, así sigue la forma sin escalones dobles ni huecos; el relleno deja libre
     una celda alrededor del contorno para que la línea se siga leyendo al tacto. */
  function aGrilla(o,v,cerrado,ciclo,px,py) {
    const celdas=[], vistas=new Set(), clave=(i,j)=>i+','+j;
    let k=0;
    const poner=(i,j)=>{ const c=clave(i,j); if(!vistas.has(c)){ vistas.add(c); if(ciclo[k%ciclo.length]) celdas.push([i,j]); k++; } };
    const tramos=v.length-(cerrado?0:1);
    for(let t=0;t<tramos;t++) {
      const a=v[t], b=v[(t+1)%v.length];
      let x0=Math.round(a[0]/px), y0=Math.round(a[1]/py); const x1=Math.round(b[0]/px), y1=Math.round(b[1]/py);
      const dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1; let err=dx+dy;
      for(;;) { poner(x0,y0); if(x0===x1&&y0===y1)break; const e2=2*err; if(e2>=dy){err+=dy;x0+=sx;} if(e2<=dx){err+=dx;y0+=sy;} }
    }
    // Las celdas del contorno (aunque la línea sea punteada) marcan el borde para el relleno.
    const salida=celdas.map(([i,j])=>[red(i*px),red(j*py)]);
    const relleno=RELLENOS[o.relleno]===undefined?'ninguno':o.relleno;
    if (cerrado && relleno!=='ninguno' && v.length>=3) {
      const b=caja(o);
      for(let iy=Math.ceil(b.y0/py);iy<=Math.floor(b.y1/py);iy++) for(let ix=Math.ceil(b.x0/px);ix<=Math.floor(b.x1/px);ix++) {
        let usar=false;
        if(relleno==='reticula') usar=ix%3===0&&iy%3===0;
        else if(relleno==='horizontales') usar=iy%3===0;
        else if(relleno==='diagonales') usar=(ix+iy)%3===0;
        else if(relleno==='disperso') usar=iy%4===0 ? ix%4===0 : iy%4===2&&ix%4===2;
        if (!usar || !dentro(ix*px,iy*py,v)) continue;
        let cerca=false;
        for(let di=-1;di<=1&&!cerca;di++) for(let dj=-1;dj<=1;dj++) if(vistas.has(clave(ix+di,iy+dj))){cerca=true;break;}
        if (!cerca) salida.push([red(ix*px),red(iy*py)]);
      }
    }
    return (o.borrados||[]).length?salida.filter(p=>!o.borrados.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=q[2])):salida;
  }
  function objetoAPuntos(o,m) {
    if (!o || o.oculto) return [];
    if(o.tipo==='referencia')return [];
    if(o.tipo==='imagen') {
      const [px,py]=pasos(m),paso=Math.min(px,py),salida=[];
      const baseW=o.baseAncho||o.ancho,baseH=o.baseAlto||o.alto;
      if(!baseW||!baseH)return salida;
      const ang=(o.rotacion||0)*Math.PI/180,cx=o.x+o.ancho/2,cy=o.y+o.alto/2;
      const llevar=p=>{
        let xx=p[0]/baseW,yy=p[1]/baseH;
        if(o.espejoX)xx=1-xx;if(o.espejoY)yy=1-yy;
        const x=o.x+xx*o.ancho-cx,y=o.y+yy*o.alto-cy;
        return [red(cx+x*Math.cos(ang)-y*Math.sin(ang)),red(cy+x*Math.sin(ang)+y*Math.cos(ang))];
      };
      if(o.mapaCapa){
        const estilo=o.estiloMapa||'continua', ciclo=estilo==='ultrafina'?[1,0,0]:estilo==='punteada'?[1,0]:LINEAS[estilo]||LINEAS.continua;
        for(const linea of o.polilineas||[]){const v=linea.map(llevar);let arco=0;
          for(let i=0;i<v.length-1;i++){const a=v[i],b=v[i+1],l=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(l/paso));
            for(let j=0;j<=n;j++)if(ciclo[Math.floor((arco+j*l/n)/paso)%ciclo.length])salida.push([red(a[0]+(b[0]-a[0])*j/n),red(a[1]+(b[1]-a[1])*j/n)]);arco+=l;}}
        for(const p of o.simbolos||[]){const q=llevar(p);salida.push(q);if(estilo==='cuadradito')for(const d of [[px,0],[-px,0],[0,py],[0,-py]])salida.push([red(q[0]+d[0]),red(q[1]+d[1])]);}
        if(o.mascara&&estilo!=='sin-relleno'){
          const mask=o.mascara,ang=-(o.rotacion||0)*Math.PI/180,cx=o.x+o.ancho/2,cy=o.y+o.alto/2;
          const x0=Math.min(...geometria(o).map(q=>q[0])),x1=Math.max(...geometria(o).map(q=>q[0]));
          const y0=Math.min(...geometria(o).map(q=>q[1])),y1=Math.max(...geometria(o).map(q=>q[1]));
          const cada=estilo==='reticula8'?4:3;
          for(let iy=Math.ceil(y0/py);iy<=Math.floor(y1/py);iy++)for(let ix=Math.ceil(x0/px);ix<=Math.floor(x1/px);ix++){
            const usar=estilo==='reticula6'||estilo==='reticula8'?ix%cada===0&&iy%cada===0:estilo==='horizontales'?iy%3===0:estilo==='diagonales'?(ix+iy)%3===0:estilo==='disperso'?iy%4===0&&ix%4===0:false;
            if(!usar)continue;const x=ix*px-cx,y=iy*py-cy,rx=cx+x*Math.cos(ang)-y*Math.sin(ang),ry=cy+x*Math.sin(ang)+y*Math.cos(ang);
            let u=(rx-o.x)/o.ancho,v=(ry-o.y)/o.alto;if(o.espejoX)u=1-u;if(o.espejoY)v=1-v;
            const mx=Math.floor(u*mask.W),my=Math.floor(v*mask.H);if(mx<0||my<0||mx>=mask.W||my>=mask.H)continue;
            const row=mask.filas[my]||[];if(row.some(r=>mx>=r[0]&&mx<=r[1]))salida.push([red(ix*px),red(iy*py)]);
          }
        }
        return salida;
      }
      for(const linea of o.polilineas||[]){
        const v=linea.map(llevar);let distancia=0,ciclo=LINEAS[o.linea]||LINEAS.continua;
        for(let i=0;i<v.length-1;i++){
          const a=v[i],b=v[i+1],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
          const n=Math.max(1,Math.ceil(l/paso));
          for(let j=0;j<=n;j++)if(ciclo[Math.round((distancia+j*l/n)/paso)%ciclo.length])salida.push([red(a[0]+(b[0]-a[0])*j/n),red(a[1]+(b[1]-a[1])*j/n)]);
          distancia+=l;
        }
        if(o.relleno&&o.relleno!=='ninguno'&&v.length>2&&Math.hypot(v[0][0]-v.at(-1)[0],v[0][1]-v.at(-1)[1])<paso){
          const b={x0:Math.min(...v.map(p=>p[0])),x1:Math.max(...v.map(p=>p[0])),y0:Math.min(...v.map(p=>p[1])),y1:Math.max(...v.map(p=>p[1]))};
          for(let iy=Math.ceil(b.y0/py);iy<=Math.floor(b.y1/py);iy++)for(let ix=Math.ceil(b.x0/px);ix<=Math.floor(b.x1/px);ix++){
            const usar=o.relleno==='reticula'?ix%3===0&&iy%3===0:o.relleno==='horizontales'?iy%3===0:o.relleno==='diagonales'?(ix+iy)%3===0:ix%4===0&&iy%4===0;
            if(usar&&dentro(ix*px,iy*py,v)&&!v.some((p,i)=>distanciaSegmento(ix*px,iy*py,p,v[(i+1)%v.length])<=paso))salida.push([red(ix*px),red(iy*py)]);
          }
        }
      }
      return salida;
    }
    const v=geometria(o), [px,py]=pasos(m), paso=Math.min(px,py), salida=[];
    if (o.tipo==='puntos' || o.tipo==='punto') return v;
    const cerrado=o.tipo==='rectangulo'||o.tipo==='elipse'||o.tipo==='poligono'||!!o.cerrado;
    const ciclo=LINEAS[o.linea]||LINEAS.continua;
    if (m && m.grilla) return aGrilla(o,v,cerrado,ciclo,px,py);
    let distancia=0;
    for(let i=0;i<v.length-(cerrado?0:1);i++) {
      const a=v[i],b=v[(i+1)%v.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const n=Math.max(1,Math.ceil(l/paso));
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
    return (o.borrados||[]).length?salida.filter(p=>!o.borrados.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=q[2])):salida;
  }
  const api={ LINEAS,RELLENOS,CAPAS,crearObjeto,migrarTrazos,mover,escalar,rotar,voltear,caja,centro,geometria,objetoAPuntos,pasos,editarVertice,agregarVertice,quitarVertice,cortarLinea,borrarTramo,unirLineas,distanciaSegmento };
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else raiz.Objetos=api;
})(typeof self!=='undefined'?self:this);
