/* SVG local: geometría en mm, estilos heredados y capas por color. */
(function (raiz) {
  'use strict';
  const num = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig;
  const N = s => (String(s || '').match(num) || []).map(Number);
  const I = [1,0,0,1,0,0];
  const aplicar=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
  const mult=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  function transform(s){let m=I;for(const q of String(s||'').matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/ig)){const v=N(q[2]);let t=I;
    if(q[1]==='matrix'&&v.length===6)t=v;
    if(q[1]==='translate')t=[1,0,0,1,v[0]||0,v[1]||0];
    if(q[1]==='scale')t=[v[0],0,0,v[1]??v[0],0,0];
    if(q[1]==='rotate'){const a=(v[0]||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);t=[c,s,-s,c,0,0];if(v.length>2)t=mult(mult([1,0,0,1,v[1],v[2]],t),[1,0,0,1,-v[1],-v[2]]);}
    m=mult(m,t);
  }return m;}
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  function curva(p0,p1,p2,p3,tol,out,depth=0){
    const dev=Math.max(Math.abs((p3[0]-p0[0])*(p1[1]-p0[1])-(p3[1]-p0[1])*(p1[0]-p0[0])),Math.abs((p3[0]-p0[0])*(p2[1]-p0[1])-(p3[1]-p0[1])*(p2[0]-p0[0])))/(dist(p0,p3)||1);
    if(dev<=tol||depth>=12){out.push(p3);return;}
    const half=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],a=half(p0,p1),b=half(p1,p2),c=half(p2,p3),d=half(a,b),e=half(b,c),f=half(d,e);
    curva(p0,a,d,f,tol,out,depth+1);curva(f,e,c,p3,tol,out,depth+1);
  }
  function arco(a,rx,ry,rot,large,sweep,b,tol,out){rx=Math.abs(rx);ry=Math.abs(ry);if(!rx||!ry||dist(a,b)<1e-9){out.push(b);return;}
    const phi=rot*Math.PI/180,co=Math.cos(phi),si=Math.sin(phi),dx=(a[0]-b[0])/2,dy=(a[1]-b[1])/2,x=co*dx+si*dy,y=-si*dx+co*dy;
    let lam=x*x/(rx*rx)+y*y/(ry*ry);if(lam>1){rx*=Math.sqrt(lam);ry*=Math.sqrt(lam);}
    const k=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-rx*rx*y*y-ry*ry*x*x)/(rx*rx*y*y+ry*ry*x*x||1)));
    const cx=k*rx*y/ry,cy=-k*ry*x/rx,C=[co*cx-si*cy+(a[0]+b[0])/2,si*cx+co*cy+(a[1]+b[1])/2];
    const angle=(u,v)=>Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]),u=[(x-cx)/rx,(y-cy)/ry],v=[(-x-cx)/rx,(-y-cy)/ry];
    let da=angle(u,v);if(!sweep&&da>0)da-=2*Math.PI;if(sweep&&da<0)da+=2*Math.PI;
    const n=Math.max(2,Math.ceil(Math.abs(da)*Math.sqrt(Math.max(rx,ry)/(8*Math.max(tol,.01)))));for(let i=1;i<=n;i++){const th=Math.atan2(u[1],u[0])+da*i/n;out.push([C[0]+co*rx*Math.cos(th)-si*ry*Math.sin(th),C[1]+si*rx*Math.cos(th)+co*ry*Math.sin(th)]);}
    out[out.length-1]=b;
  }
  function path(d,tol=.35){const tokens=String(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig)||[];let i=0,cmd='',p=[0,0],start=[0,0],prevC=null,prevQ=null,sub=[],out=[];
    const flush=()=>{if(sub.length>1)out.push(sub);sub=[];};
    const take=n=>{if(i+n>tokens.length||tokens.slice(i,i+n).some(x=>/^[a-zA-Z]$/.test(x)))return null;const a=tokens.slice(i,i+n).map(Number);i+=n;return a;};
    while(i<tokens.length){if(/^[a-zA-Z]$/.test(tokens[i]))cmd=tokens[i++];if(!cmd)break;const rel=cmd===cmd.toLowerCase(),c=cmd.toUpperCase(),n={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0}[c];if(n===undefined)break;
      if(c==='Z'){if(sub.length&&dist(sub[0],sub.at(-1))>1e-8)sub.push(sub[0]);flush();p=start;cmd='';continue;}
      const v=take(n);if(!v){if(i<tokens.length&&!/^[a-zA-Z]$/.test(tokens[i]))i++;else if(i>=tokens.length)break;continue;}
      const point=(x,y)=>rel?[p[0]+x,p[1]+y]:[x,y];let q;
      if(c==='M'){flush();p=point(v[0],v[1]);start=p;sub=[p];cmd=rel?'l':'L';}
      else if(c==='L'){p=point(v[0],v[1]);sub.push(p);}
      else if(c==='H'){p=[rel?p[0]+v[0]:v[0],p[1]];sub.push(p);}
      else if(c==='V'){p=[p[0],rel?p[1]+v[0]:v[0]];sub.push(p);}
      else if(c==='C'||c==='S'){const c1=c==='S'?(prevC?[2*p[0]-prevC[0],2*p[1]-prevC[1]]:p):point(v[0],v[1]);const c2=c==='S'?point(v[0],v[1]):point(v[2],v[3]);q=c==='S'?point(v[2],v[3]):point(v[4],v[5]);curva(p,c1,c2,q,tol,sub);p=q;prevC=c2;prevQ=null;}
      else if(c==='Q'||c==='T'){const ctrl=c==='T'?(prevQ?[2*p[0]-prevQ[0],2*p[1]-prevQ[1]]:p):point(v[0],v[1]);q=c==='T'?point(v[0],v[1]):point(v[2],v[3]);curva(p,[(p[0]+2*ctrl[0])/3,(p[1]+2*ctrl[1])/3],[(q[0]+2*ctrl[0])/3,(q[1]+2*ctrl[1])/3],q,tol,sub);p=q;prevQ=ctrl;prevC=null;}
      else if(c==='A'){q=point(v[5],v[6]);arco(p,...v.slice(0,5),q,tol,sub);p=q;prevC=prevQ=null;}
      if(!['C','S','Q','T'].includes(c))prevC=prevQ=null;
    }flush();return out;}
  function color(s){s=String(s||'').trim().toLowerCase();if(!s||s==='none'||s==='transparent')return null;const names={black:'#000000',white:'#ffffff',blue:'#0000ff',red:'#ff0000',gray:'#808080',grey:'#808080',navy:'#000080'};s=names[s]||s;
    if(/^#[0-9a-f]{3}$/.test(s))return s.slice(1).split('').map(c=>parseInt(c+c,16));if(/^#[0-9a-f]{6}$/.test(s))return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const v=N(s);return s.startsWith('rgb')&&v.length>=3?v.slice(0,3):null;}
  function sugerir(c,kind,width){if(kind==='text')return 'texto';if(!c)return 'ignorar';const [r,g,b]=c,azul=b>r*1.13&&b>g*1.04;if(kind==='fill')return azul?'agua':'tierra';if(azul)return width>=2?'costa':'río';if(Math.max(r,g,b)-Math.min(r,g,b)<35)return 'límite';return 'ruta';}
  function agrupar(elementos){const C=typeof module!=='undefined'&&module.exports?require('./capas_color.js'):raiz.CapasColor;const capas=[];
    for(const e of elementos){if(e.tag==='text'){let capa=capas.find(x=>x.kind==='text');if(!capa){capa={kind:'text',color:[120,120,120],lab:C.rgbLab(120,120,120),elementos:[],significado:'texto',estilo:'ninguna'};capas.push(capa);}capa.elementos.push(e);continue;}for(const kind of ['fill','stroke']){const rgb=e[kind];if(!rgb||(kind==='fill'&&!e.cerrado))continue;const lab=C.rgbLab(...rgb);let capa=capas.find(x=>x.kind===kind&&C.delta(x.lab,lab)<4);if(!capa){capa={kind,color:rgb,lab,elementos:[],significado:sugerir(rgb,kind,e.strokeWidth),estilo:null};capa.estilo=estiloInicial(capa.significado,kind);capas.push(capa);}capa.elementos.push(e);}}
    return capas;}
  function xmlMinimo(xml){const stack=[],doc={documentElement:null,querySelector:()=>null};for(const tok of xml.match(/<[^>]+>/g)||[]){if(/^<\? |^<!--|^<!/.test(tok))continue;if(/^<\//.test(tok)){stack.pop();continue;}const tag=tok.match(/^<([\w:.-]+)/);if(!tag)continue;const attrs={};for(const m of tok.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))attrs[m[1]]=m[3];const el={localName:tag[1].split(':').at(-1),children:[],getAttribute:k=>Object.hasOwn(attrs,k)?attrs[k]:null};if(stack.length)stack.at(-1).children.push(el);else doc.documentElement=el;if(!/\/\s*>$/.test(tok))stack.push(el);}return doc;}

  /**
   * Área del dibujo que se ve, en unidades del viewBox, según la regla estándar de SVG
   * (preserveAspectRatio, por defecto «xMidYMid meet»). Si width/height y viewBox tienen
   * proporciones distintas, el área visible se amplía (meet) o se recorta (slice) hacia los lados.
   * Así lo hacen los mapas de ubicación de Wikipedia: el viewBox no coincide con lo que se ve.
   */
  function areaVisible(root){
    const vb=N(root.getAttribute('viewBox'));
    const W=/%/.test(root.getAttribute('width')||'')?0:N(root.getAttribute('width'))[0];
    const H=/%/.test(root.getAttribute('height')||'')?0:N(root.getAttribute('height'))[0];
    if(vb.length<4)return {x:0,y:0,w:W||100,h:H||100};
    const [vx,vy,vw,vh]=vb;
    if(!W||!H||!vw||!vh)return {x:vx,y:vy,w:vw,h:vh};
    const par=String(root.getAttribute('preserveAspectRatio')||'xMidYMid meet').trim().split(/\s+/);
    if(par[0]==='none')return {x:vx,y:vy,w:vw,h:vh};
    const k=(par[1]==='slice'?Math.max:Math.min)(W/vw,H/vh),ancho=W/k,alto=H/k;
    const alinear=(eje,inicio,tam,vis)=>/Min/.test(eje)?inicio:/Max/.test(eje)?inicio+tam-vis:inicio+(tam-vis)/2;
    const ax=par[0].slice(0,4),ay=par[0].slice(4);
    return {x:alinear(ax,vx,vw,ancho),y:alinear(ay,vy,vh,alto),w:ancho,h:alto};
  }
  /** Recorta un trazo al rectángulo [0,W]×[0,H]: polígonos con Sutherland-Hodgman, líneas en tramos. */
  function recortar(puntos,cerrado,W,H){
    const dentro=p=>p[0]>=0&&p[0]<=W&&p[1]>=0&&p[1]<=H;
    if(puntos.every(dentro))return [{puntos,cerrado}];
    if(cerrado){
      let v=puntos.slice(0,-1);
      const bordes=[[p=>p[0]>=0,(a,b)=>{const t=(0-a[0])/(b[0]-a[0]);return [0,a[1]+t*(b[1]-a[1])];}],
        [p=>p[0]<=W,(a,b)=>{const t=(W-a[0])/(b[0]-a[0]);return [W,a[1]+t*(b[1]-a[1])];}],
        [p=>p[1]>=0,(a,b)=>{const t=(0-a[1])/(b[1]-a[1]);return [a[0]+t*(b[0]-a[0]),0];}],
        [p=>p[1]<=H,(a,b)=>{const t=(H-a[1])/(b[1]-a[1]);return [a[0]+t*(b[0]-a[0]),H];}]];
      for(const [en,cruce] of bordes){if(!v.length)break;const sal=[];for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];
        if(en(b)){if(!en(a))sal.push(cruce(a,b));sal.push(b);}else if(en(a))sal.push(cruce(a,b));}v=sal;}
      return v.length>=3?[{puntos:v.concat([v[0]]),cerrado:true}]:[];
    }
    // Líneas: Liang-Barsky por segmento; los tramos que salen del rectángulo cortan la línea.
    const trozos=[];let actual=[];
    for(let i=0;i<puntos.length-1;i++){const a=puntos[i],b=puntos[i+1],dx=b[0]-a[0],dy=b[1]-a[1];let t0=0,t1=1,ok=true;
      for(const [pp,q] of [[-dx,a[0]],[dx,W-a[0]],[-dy,a[1]],[dy,H-a[1]]]){if(pp===0){if(q<0){ok=false;break;}continue;}const r=q/pp;
        if(pp<0){if(r>t1){ok=false;break;}if(r>t0)t0=r;}else{if(r<t0){ok=false;break;}if(r<t1)t1=r;}}
      if(!ok){if(actual.length>1)trozos.push(actual);actual=[];continue;}
      const p0=[a[0]+t0*dx,a[1]+t0*dy],p1=[a[0]+t1*dx,a[1]+t1*dy];
      if(!actual.length||dist(actual.at(-1),p0)>1e-6){if(actual.length>1)trozos.push(actual);actual=[p0];}
      actual.push(p1);if(t1<1){trozos.push(actual);actual=[];}}
    if(actual.length>1)trozos.push(actual);
    return trozos.map(v=>({puntos:v,cerrado:false}));
  }
  /** Reglas simples de <style> con selectores de clase (.cls-1{fill:#fff}), como las que exportan Illustrator o Inkscape. */
  function reglasClase(doc){const r={};if(!doc.querySelectorAll)return r;for(const st of doc.querySelectorAll('style')){for(const m of String(st.textContent||'').matchAll(/([^{}]+)\{([^}]*)\}/g)){const decl={};for(const d of m[2].split(';')){const p=d.split(':');if(p.length===2)decl[p[0].trim()]=p[1].trim();}for(const sel of m[1].split(',')){const c=sel.trim().match(/^\.([\w-]+)$/);if(c)r[c[1]]=Object.assign(r[c[1]]||{},decl);}}}return r;}
  function parsear(xml,anchoMm,tolMm=.3){const doc=typeof DOMParser==='undefined'?xmlMinimo(xml):new DOMParser().parseFromString(xml,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('SVG inválido');const root=doc.documentElement;if(!root||root.localName!=='svg')throw Error('No es SVG');
    const area=areaVisible(root),w=area.w,h=area.h,s=anchoMm/w,origen=[area.x,area.y],elementos=[],altoMm=h*s;
    let contador=0;const clases=reglasClase(doc);
    const visit=(el,parent,est)=>{if(/display\s*:\s*none/i.test(el.getAttribute('style')||'')||el.getAttribute('display')==='none')return;const m=mult(parent,transform(el.getAttribute('transform'))),style={...est};for(const k of ['fill','stroke','stroke-width','fill-opacity','opacity','fill-rule']){const a=el.getAttribute(k);if(a!==null)style[k]=a;}for(const c of String(el.getAttribute('class')||'').split(/\s+/))if(c&&clases[c])Object.assign(style,clases[c]);for(const rule of String(el.getAttribute('style')||'').split(';')){const parts=rule.split(':');if(parts.length===2)style[parts[0].trim()]=parts[1].trim();}
      const tag=el.localName,idx=contador++;let lines=[];if(tag==='path')lines=path(el.getAttribute('d'),tolMm/s);
      else if(tag==='polyline'||tag==='polygon'){const p=N(el.getAttribute('points')),v=[];for(let i=0;i+1<p.length;i+=2)v.push([p[i],p[i+1]]);if(tag==='polygon'&&v.length)v.push(v[0]);lines=[v];}
      else if(tag==='line')lines=[[[+el.getAttribute('x1')||0,+el.getAttribute('y1')||0],[+el.getAttribute('x2')||0,+el.getAttribute('y2')||0]]];
      else if(tag==='rect'){const x=+el.getAttribute('x')||0,y=+el.getAttribute('y')||0,ww=+el.getAttribute('width')||0,hh=+el.getAttribute('height')||0;lines=[[[x,y],[x+ww,y],[x+ww,y+hh],[x,y+hh],[x,y]]];}
      else if(tag==='circle'||tag==='ellipse'){const x=+el.getAttribute('cx')||0,y=+el.getAttribute('cy')||0,rx=tag==='circle'?+el.getAttribute('r')||0:+el.getAttribute('rx')||0,ry=tag==='circle'?rx:+el.getAttribute('ry')||0,n=Math.max(16,Math.ceil(2*Math.PI*Math.max(rx,ry)*s/Math.max(tolMm,.1)));lines=[Array.from({length:n+1},(_,i)=>[x+rx*Math.cos(2*Math.PI*i/n),y+ry*Math.sin(2*Math.PI*i/n)])];}
      if(tag==='text')elementos.push({puntos:[],cerrado:false,fill:null,stroke:null,strokeWidth:0,tag});
      if(lines.length){for(const line of lines){if(line.length<2)continue;const puntos=line.map(p=>{const q=aplicar(m,p);return [(q[0]-origen[0])*s,(q[1]-origen[1])*s];});const cerrado=dist(puntos[0],puntos.at(-1))<1e-7,base={fill:color(style.fill),stroke:color(style.stroke),strokeWidth:(parseFloat(style['stroke-width'])||1)*s,tag,idx,evenodd:style['fill-rule']==='evenodd',opaco:(parseFloat(style['fill-opacity']??1)*parseFloat(style.opacity??1))>=.9};for(const trozo of recortar(puntos,cerrado,anchoMm,altoMm))elementos.push({...base,...trozo});}}
      for(const child of el.children)if(child.localName!=='defs'&&child.localName!=='clipPath')visit(child,m,style);
    };visit(root,I,{fill:'black',stroke:'none'});return {anchoMm,altoMm,elementos,capas:agrupar(elementos)};}
  // Estilo táctil por defecto según el significado (informe del bot REA §5): la tierra va sin relleno
  // para no llenar la hoja de puntos; el agua con retícula espaciada; ríos punteados, límites rayados y rutas en punto y raya (distintas de la costa).
  function estiloInicial(significado,kind){
    if(kind==='fill')return significado==='agua'?'reticula':'ninguno';
    return {costa:'continua','río':'punteada','límite':'rayada',ruta:'puntoraya'}[significado]||'continua';}
  const api={estiloInicial,areaVisible,recortar,path,transform,aplicar,mult,color,sugerir,agrupar,parsear};if(typeof module!=='undefined'&&module.exports)module.exports=api;else raiz.SvgImportar=api;
})(typeof self!=='undefined'?self:this);
