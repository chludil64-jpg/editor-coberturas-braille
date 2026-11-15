/* Costos de borde y camino mínimo para el lazo magnético. */
(function(raiz){'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function costos(rgba,W,H){const gray=new Float32Array(W*H),c=new Float32Array(W*H);for(let i=0;i<W*H;i++)gray[i]=.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const at=(xx,yy)=>gray[clamp(yy,0,H-1)*W+clamp(xx,0,W-1)],gx=at(x+1,y)-at(x-1,y),gy=at(x,y+1)-at(x,y-1),g=Math.min(1,Math.hypot(gx,gy)/180),dark=1-gray[y*W+x]/255;c[y*W+x]=.06+.72*(1-g)+.22*(1-dark);}
    return {W,H,costo:c};}
  function camino(mapa,inicio,fin,radio=35,intensidad=1){const {W,H,costo}=mapa,xy=p=>[clamp(Math.round(p[0]),0,W-1),clamp(Math.round(p[1]),0,H-1)],a=xy(inicio),b=xy(fin),start=a[1]*W+a[0],end=b[1]*W+b[0];if(start===end)return [a];
    const minX=clamp(Math.min(a[0],b[0])-radio,0,W-1),maxX=clamp(Math.max(a[0],b[0])+radio,0,W-1),minY=clamp(Math.min(a[1],b[1])-radio,0,H-1),maxY=clamp(Math.max(a[1],b[1])+radio,0,H-1);
    const dist=new Float64Array(W*H);dist.fill(Infinity);const prev=new Int32Array(W*H);prev.fill(-1);dist[start]=0;const heap=[];function push(i,d){let k=heap.length;heap.push([i,d]);while(k){const p=(k-1)>>1;if(heap[p][1]<=d)break;heap[k]=heap[p];k=p;}heap[k]=[i,d];}function pop(){const top=heap[0],last=heap.pop();if(heap.length){let k=0;while(2*k+1<heap.length){let j=2*k+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[k]=heap[j];k=j;}heap[k]=last;}return top;}
    push(start,0);const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];while(heap.length){const [i,d]=pop();if(d!==dist[i])continue;if(i===end)break;const x=i%W,y=Math.floor(i/W);for(const [dx,dy] of dirs){const xx=x+dx,yy=y+dy;if(xx<minX||xx>maxX||yy<minY||yy>maxY)continue;const j=yy*W+xx,step=Math.hypot(dx,dy),v=d+step*(1+Math.max(0,intensidad)*(costo[i]+costo[j])/2*8);if(v<dist[j]){dist[j]=v;prev[j]=i;push(j,v);}}}
    if(prev[end]<0)return [a,b];const out=[];for(let i=end;i>=0;i=prev[i]){out.push([i%W,Math.floor(i/W)]);if(i===start)break;}return out.reverse();}
  function simplificar(puntos,tol=.4){if(puntos.length<3)return puntos.slice();const a=puntos[0],b=puntos.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let max=-1,index=0;for(let i=1;i<puntos.length-1;i++){const p=puntos[i],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(l||1),0,1),d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>max){max=d;index=i;}}if(max<=tol)return [a,b];return simplificar(puntos.slice(0,index+1),tol).slice(0,-1).concat(simplificar(puntos.slice(index),tol));}
  const api={costos,camino,simplificar};if(typeof module!=='undefined'&&module.exports)module.exports=api;else raiz.Lazo=api;
})(typeof self!=='undefined'?self:this);
