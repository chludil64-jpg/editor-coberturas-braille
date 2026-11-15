/* Análisis local de mapas por color. Coordenadas de salida en mm. */
(function (raiz) {
  'use strict';
  const V = typeof module !== 'undefined' && module.exports ? require('./vectorizar.js') : raiz.Vectorizar;
  const rgbLab = (r,g,b) => {
    const f=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
    r=f(r);g=f(g);b=f(b);
    const x=(.4124564*r+.3575761*g+.1804375*b)/.95047,y=.2126729*r+.7151522*g+.072175*b,z=(.0193339*r+.119192*g+.9503041*b)/1.08883;
    const h=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;
    return [116*h(y)-16,500*(h(x)-h(y)),200*(h(y)-h(z))];
  };
  const delta=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  function reducir(datos,W,H,max=600){const f=Math.min(1,max/Math.max(W,H)),w=Math.max(1,Math.round(W*f)),h=Math.max(1,Math.round(H*f));if(w===W&&h===H)return {datos,W,H};
    const out=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++){const y0=Math.floor(y*H/h),y1=Math.max(y0+1,Math.floor((y+1)*H/h));for(let x=0;x<w;x++){
      const x0=Math.floor(x*W/w),x1=Math.max(x0+1,Math.floor((x+1)*W/w)),s=[0,0,0,0];for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const p=(yy*W+xx)*4,a=datos[p+3]/255;s[0]+=a*datos[p];s[1]+=a*datos[p+1];s[2]+=a*datos[p+2];s[3]+=a;}
      const n=(y1-y0)*(x1-x0),p=(y*w+x)*4;for(let k=0;k<3;k++)out[p+k]=Math.round((s[k]+255*(n-s[3]))/n);out[p+3]=255;
    }}return {datos:out,W:w,H:h};}
  function hsv(r,g,b){r/=255;g/=255;b/=255;const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo;let h=0;
    if(d)h=hi===r?60*((g-b)/d%6):hi===g?60*((b-r)/d+2):60*((r-g)/d+4);
    return [(h+360)%360,hi?d/hi:0,hi];}
  function fusionar(centros,umbral=4){const grupos=[];
    for(let i=0;i<centros.length;i++){let g=grupos.find(a=>delta(centros[i],a.centro)<umbral);
      if(g){g.ids.push(i);g.centro=g.centro.map((v,j)=>(v*(g.ids.length-1)+centros[i][j])/g.ids.length);}
      else grupos.push({ids:[i],centro:centros[i].slice()});}
    return grupos;
  }
  function kmedias(datos,W,H,K=8){K=Math.max(4,Math.min(12,Math.round(K)||8));const n=W*H, labs=new Array(n), paso=Math.max(1,Math.floor(n/30000));
    for(let i=0;i<n;i++)labs[i]=rgbLab(datos[i*4],datos[i*4+1],datos[i*4+2]);
    const muestras=[];for(let i=0;i<n;i+=paso)muestras.push(i);
    const centros=[labs[muestras[0]].slice()];
    while(centros.length<K){let mejor=-1,dist=-1;for(const i of muestras){const d=Math.min(...centros.map(c=>delta(c,labs[i])));if(d>dist){dist=d;mejor=i;}}centros.push(labs[mejor].slice());}
    for(let it=0;it<12;it++){const sum=centros.map(()=>[0,0,0,0]);for(const i of muestras){let j=0,d=Infinity;centros.forEach((c,k)=>{const q=delta(c,labs[i]);if(q<d){d=q;j=k;}});sum[j][3]++;for(let k=0;k<3;k++)sum[j][k]+=labs[i][k];}
      sum.forEach((s,j)=>{if(s[3])centros[j]=s.slice(0,3).map(v=>v/s[3]);});}
    const grupos=fusionar(centros),ids=new Uint8Array(n),count=grupos.map(()=>0),rgb=grupos.map(()=>[0,0,0]);
    for(let i=0;i<n;i++){let best=0,d=Infinity;grupos.forEach((g,j)=>{const q=delta(g.centro,labs[i]);if(q<d){d=q;best=j;}});ids[i]=best;count[best]++;for(let k=0;k<3;k++)rgb[best][k]+=datos[i*4+k];}
    return {ids,capas:grupos.map((g,j)=>({id:j,lab:g.centro,color:rgb[j].map(v=>Math.round(v/(count[j]||1))),cantidad:count[j],porcentaje:100*count[j]/n}))};
  }
  function componentes(mask,W,H){const visto=new Uint8Array(mask.length),out=[];for(let i=0;i<mask.length;i++)if(mask[i]&&!visto[i]){const q=[i],c=[];visto[i]=1;for(let a=0;a<q.length;a++){const p=q[a],x=p%W,y=(p-x)/W;c.push(p);for(const z of [x>0?p-1:-1,x<W-1?p+1:-1,y>0?p-W:-1,y<H-1?p+W:-1])if(z>=0&&mask[z]&&!visto[z]){visto[z]=1;q.push(z);}}out.push(c);}return out;}
  function erosion(mask,W,H){const d=new Uint16Array(mask.length),q=[];for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%W,y=(i-x)/W;if(!x||!y||x===W-1||y===H-1||!mask[i-1]||!mask[i+1]||!mask[i-W]||!mask[i+W]){d[i]=1;q.push(i);}}
    let max=0;for(let a=0;a<q.length;a++){const i=q[a],x=i%W,y=(i-x)/W;max=Math.max(max,d[i]);for(const z of [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1])if(z>=0&&mask[z]&&!d[z]){d[z]=d[i]+1;q.push(z);}}return max;}
  function esqueleto(mask,W,H){const b=Uint8Array.from(mask),neigh=i=>[i-W,i-W+1,i+1,i+W+1,i+W,i+W-1,i-1,i-W-1].map(j=>b[j]||0);
    for(let iter=0;iter<60;iter++){let cambio=0;for(let fase=0;fase<2;fase++){const quitar=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!b[i])continue;const n=neigh(i),s=n.reduce((a,v)=>a+v,0);if(s<2||s>6)continue;let t=0;for(let k=0;k<8;k++)if(!n[k]&&n[(k+1)%8])t++;if(t!==1)continue;
      if(fase===0?(n[0]*n[2]*n[4]||n[2]*n[4]*n[6]):(n[0]*n[2]*n[6]||n[0]*n[4]*n[6]))continue;quitar.push(i);}
      quitar.forEach(i=>b[i]=0);cambio+=quitar.length;}if(!cambio)break;}return b;}
  function estadisticas(mask,W,H,anchoMm){const comp=componentes(mask,W,H),mm=anchoMm/W,area=comp.reduce((s,c)=>s+c.length,0)*mm*mm;
    let x0=W,y0=H,x1=0,y1=0,per=0;for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%W,y=(i-x)/W;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);if(!x||!mask[i-1])per++;if(x===W-1||!mask[i+1])per++;if(!y||!mask[i-W])per++;if(y===H-1||!mask[i+W])per++;}
    const sk=esqueleto(mask,W,H),trazos=V.convertir(sk,W,H,1/mm,{simplificacionMm:.25}),largos=trazos.map(V.largo).filter(x=>x>=mm*2).sort((a,b)=>a-b),p90=largos.length?largos[Math.min(largos.length-1,Math.ceil(.9*largos.length)-1)]:0;
    const grosor=2*erosion(mask,W,H)*mm,compacidad=per?4*Math.PI*(area/mm/mm)/(per*per):0;
    return {area,grosor,p90,compacidad,caja:[x0*mm,y0*mm,(x1+1)*mm,(y1+1)*mm],trazos,componentes:comp};}
  function clasificar(s,color,porcentaje){const simbolo=s.area<25&&s.p90<20&&s.compacidad>.3;
    const rol=simbolo?'SÍMBOLO':s.grosor<=2.2&&s.p90>=20?'LÍNEA':s.grosor>=3?'ÁREA':'REVISAR';
    const [h,sat,v]=hsv(...color);
    // Azul: agua si es área; río o costa si es línea (las líneas azules casi nunca son límites).
    const azul=h>=165&&h<=265&&sat>=.10&&v>=.35;
    return {rol,agua:rol==='ÁREA'&&azul,lineaAzul:rol!=='ÁREA'&&rol!=='SÍMBOLO'&&azul&&sat>=.2,saturacion:sat,ignorar:porcentaje<.3};}
  function separar(trazos){const r={rectas:[],curvas:[],revisar:[]};for(const v of trazos){const l=V.largo(v);if(l<1)continue;const c=Math.hypot(v.at(-1)[0]-v[0][0],v.at(-1)[1]-v[0][1])/l;r[c>=.97?'rectas':c<.90?'curvas':'revisar'].push(v);}return r;}
  function poligonos(mask,W,H,anchoMm){const lados=new Map(),clave=(x,y)=>x+','+y,agregar=(x,y,u,v)=>{const k=clave(x,y);if(!lados.has(k))lados.set(k,[]);lados.get(k).push([u,v]);};
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!mask[i])continue;
      if(!y||!mask[i-W])agregar(x,y,x+1,y);
      if(x===W-1||!mask[i+1])agregar(x+1,y,x+1,y+1);
      if(y===H-1||!mask[i+W])agregar(x+1,y+1,x,y+1);
      if(!x||!mask[i-1])agregar(x,y+1,x,y);
    }
    const out=[],esc=anchoMm/W;for(const [k,cola] of lados)while(cola.length){const inicio=k.split(',').map(Number),v=[inicio],primero=cola.pop();v.push(primero);let actual=primero,guardia=0;
      while((actual[0]!==inicio[0]||actual[1]!==inicio[1])&&guardia++<W*H*4){const q=lados.get(clave(...actual));if(!q||!q.length)break;actual=q.pop();v.push(actual);}
      if(v.length>=4&&actual[0]===inicio[0]&&actual[1]===inicio[1])out.push(V.simplificar(v.map(p=>[p[0]*esc,p[1]*esc]),.35));}
    return out;}
  function analizar(datos,W,H,anchoMm,K=8,progreso=()=>{}){progreso('Agrupando colores en Lab…');const base=kmedias(datos,W,H,K);for(const capa of base.capas){progreso(`Midiendo capa ${capa.id+1} de ${base.capas.length}…`);const mask=Uint8Array.from(base.ids,v=>v===capa.id?1:0),s=estadisticas(mask,W,H,anchoMm);Object.assign(capa,s,clasificar(s,capa.color,capa.porcentaje));delete capa.componentes;
      capa.trazos=s.trazos.map(v=>V.simplificar(v,.35));capa.poligonos=capa.rol==='ÁREA'?poligonos(mask,W,H,anchoMm):[];}
    return {W,H,anchoMm,altoMm:anchoMm*H/W,ids:base.ids,capas:base.capas};}
  const api={rgbLab,delta,reducir,hsv,fusionar,kmedias,componentes,erosion,esqueleto,estadisticas,clasificar,separar,poligonos,analizar};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else raiz.CapasColor=api;
})(typeof self!=='undefined'?self:this);
