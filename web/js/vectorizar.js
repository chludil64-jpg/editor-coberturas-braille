/* Esqueleto binario a trayectos editables, en píxeles o milímetros. */
(function (raiz) {
  'use strict';
  function trazar(b, W, H) {
    const vecinos = i => {
      const x=i%W,y=(i-x)/W,a=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const xx=x+dx,yy=y+dy;
        if(xx<0||yy<0||xx>=W||yy>=H||!b[yy*W+xx])continue;
        // Una diagonal no crea una unión falsa al lado de una esquina ortogonal.
        if(dx&&dy&&(b[y*W+xx]||b[yy*W+x]))continue;
        a.push(yy*W+xx);
      }
      return a;
    };
    const adj=new Map(),usados=new Set(),salida=[];
    for(let i=0;i<b.length;i++)if(b[i])adj.set(i,vecinos(i));
    const clave=(a,c)=>Math.min(a,c)+','+Math.max(a,c);
    const punto=i=>[i%W,Math.floor(i/W)];
    function seguir(inicio,siguiente){
      const camino=[punto(inicio)];let a=inicio,c=siguiente;
      while(c!==undefined){
        usados.add(clave(a,c));camino.push(punto(c));
        if(c===inicio||adj.get(c).length!==2)break;
        const n=adj.get(c).find(q=>q!==a&&!usados.has(clave(c,q)));
        a=c;c=n;
      }
      if(camino.length>1)salida.push(camino);
    }
    for(const [i,v] of adj)if(v.length!==2)for(const n of v)if(!usados.has(clave(i,n)))seguir(i,n);
    for(const [i,v] of adj)for(const n of v)if(!usados.has(clave(i,n)))seguir(i,n);
    return salida;
  }
  function simplificar(v,tolerancia){
    if(v.length<3||tolerancia<=0)return v.slice();
    const a=v[0],z=v.at(-1),dx=z[0]-a[0],dy=z[1]-a[1],den=dx*dx+dy*dy||1;
    let mayor=-1,indice=-1;
    for(let i=1;i<v.length-1;i++){
      const t=Math.max(0,Math.min(1,((v[i][0]-a[0])*dx+(v[i][1]-a[1])*dy)/den));
      const d=Math.hypot(v[i][0]-a[0]-t*dx,v[i][1]-a[1]-t*dy);
      if(d>mayor){mayor=d;indice=i;}
    }
    if(mayor<=tolerancia)return [a,z];
    return simplificar(v.slice(0,indice+1),tolerancia).slice(0,-1).concat(simplificar(v.slice(indice),tolerancia));
  }
  function suavizar(v,pasadas){
    let a=v.slice();
    for(let k=0;k<Math.min(2,pasadas||0);k++){
      const cerrado=a.length>2&&a[0][0]===a.at(-1)[0]&&a[0][1]===a.at(-1)[1];
      const n=cerrado?a.length-1:a.length,r=[];
      if(!cerrado)r.push(a[0]);
      for(let i=0;i<(cerrado?n:n-1);i++){
        const p=a[i],q=a[(i+1)%n];r.push([.75*p[0]+.25*q[0],.75*p[1]+.25*q[1]],[.25*p[0]+.75*q[0],.25*p[1]+.75*q[1]]);
      }
      if(cerrado)r.push(r[0]);else r.push(a.at(-1));a=r;
    }
    return a;
  }
  const largo=v=>v.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-v[i][0],p[1]-v[i][1]),0);
  function convertir(b,W,H,pxPorMm,op={}){
    return trazar(b,W,H).map(v=>v.map(([x,y])=>[x/pxPorMm,y/pxPorMm]))
      .filter(v=>largo(v)>= (op.minLargoMm||0))
      .map(v=>suavizar(simplificar(v,op.simplificacionMm||0),op.pasadas||0));
  }
  function filas(b,W,H,pxPorMm){
    const salida=[];
    for(let y=0;y<H;y++){
      let inicio=-1;
      for(let x=0;x<=W;x++){
        if(x<W&&b[y*W+x]){if(inicio<0)inicio=x;}
        else if(inicio>=0){salida.push([[inicio/pxPorMm,y/pxPorMm],[(x-1)/pxPorMm,y/pxPorMm]]);inicio=-1;}
      }
    }
    return salida;
  }
  const api={trazar,simplificar,suavizar,convertir,filas,largo};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else raiz.Vectorizar=api;
})(typeof self!=='undefined'?self:this);
