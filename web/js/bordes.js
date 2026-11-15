/* Detección de bordes para mapas e ilustraciones: produce un esqueleto vectorizable.

   Pasos:
   1. Suavizado (quita el granulado de JPG y escaneos).
   2. Bordes:
      - «bordes»: Canny por canal RGB, con histéresis.
      - «regiones»: colores cuantizados y límites entre regiones.
      - «lineas»: píxeles oscuros (mapas en blanco y negro, dibujos de línea).
   3. Se descartan los detalles chicos (letras, números, manchas) por tamaño en mm.
   4. Adelgazamiento (Zhang-Suen): cada línea queda de un píxel de ancho.
   5. Se conserva el esqueleto para trazar polilíneas; los nodos viejos siguen disponibles.

   Funciona en el navegador (window.Bordes) y en Node (require), sin dependencias. */
(function (raiz) {
  'use strict';

  /** Suavizado por caja separable de radio r sobre los 3 canales. Devuelve Float32Array RGB. */
  function suavizar(rgba, W, H, r) {
    const n = W * H;
    let a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = rgba[i * 4]; a[i * 3 + 1] = rgba[i * 4 + 1]; a[i * 3 + 2] = rgba[i * 4 + 2];
    }
    if (!r) return a;
    const b = new Float32Array(n * 3);
    // horizontal
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s0 = 0, s1 = 0, s2 = 0, c = 0;
        for (let k = -r; k <= r; k++) {
          const xx = Math.min(W - 1, Math.max(0, x + k));
          const j = (y * W + xx) * 3;
          s0 += a[j]; s1 += a[j + 1]; s2 += a[j + 2]; c++;
        }
        const i = (y * W + x) * 3;
        b[i] = s0 / c; b[i + 1] = s1 / c; b[i + 2] = s2 / c;
      }
    }
    // vertical
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s0 = 0, s1 = 0, s2 = 0, c = 0;
        for (let k = -r; k <= r; k++) {
          const yy = Math.min(H - 1, Math.max(0, y + k));
          const j = (yy * W + x) * 3;
          s0 += b[j]; s1 += b[j + 1]; s2 += b[j + 2]; c++;
        }
        const i = (y * W + x) * 3;
        a[i] = s0 / c; a[i + 1] = s1 / c; a[i + 2] = s2 / c;
      }
    }
    return a;
  }

  /** Mapa binario de bordes por diferencia de color (Sobel por canal, se toma el mayor). */
  function bordesDeColor(rgb, W, H, umbral) {
    const out = new Uint8Array(W * H);
    const v = (x, y, c) => rgb[((Math.min(H - 1, Math.max(0, y))) * W + Math.min(W - 1, Math.max(0, x))) * 3 + c];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let max = 0;
        for (let c = 0; c < 3; c++) {
          const gx = -v(x - 1, y - 1, c) - 2 * v(x - 1, y, c) - v(x - 1, y + 1, c)
                   + v(x + 1, y - 1, c) + 2 * v(x + 1, y, c) + v(x + 1, y + 1, c);
          const gy = -v(x - 1, y - 1, c) - 2 * v(x, y - 1, c) - v(x + 1, y - 1, c)
                   + v(x - 1, y + 1, c) + 2 * v(x, y + 1, c) + v(x + 1, y + 1, c);
          const m = Math.sqrt(gx * gx + gy * gy) / 4; // 0..~360
          if (m > max) max = m;
        }
        out[y * W + x] = max > umbral ? 1 : 0;
      }
    }
    return out;
  }

  /* Canny: Sobel por canal, supresión de no máximos e histéresis. */
  function canny(rgb,W,H,alto) {
    const n=W*H,mag=new Float32Array(n),dir=new Uint8Array(n),out=new Uint8Array(n);
    const v=(x,y,c)=>rgb[(y*W+x)*3+c];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      let mejor=0,gxMejor=0,gyMejor=0;
      for(let c=0;c<3;c++){
        const gx=-v(x-1,y-1,c)-2*v(x-1,y,c)-v(x-1,y+1,c)+v(x+1,y-1,c)+2*v(x+1,y,c)+v(x+1,y+1,c);
        const gy=-v(x-1,y-1,c)-2*v(x,y-1,c)-v(x+1,y-1,c)+v(x-1,y+1,c)+2*v(x,y+1,c)+v(x+1,y+1,c);
        const m=Math.hypot(gx,gy)/4;if(m>mejor){mejor=m;gxMejor=gx;gyMejor=gy;}
      }
      const i=y*W+x;mag[i]=mejor;
      const a=(Math.atan2(gyMejor,gxMejor)*180/Math.PI+180)%180;
      dir[i]=a<22.5||a>=157.5?0:a<67.5?1:a<112.5?2:3;
    }
    const bajo=alto*.4,pila=[],fina=new Float32Array(n);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      const i=y*W+x,d=dir[i],a=[1,W+1,W,W-1][d];
      if(mag[i]<bajo||mag[i]<mag[i-a]||mag[i]<mag[i+a])continue;
      fina[i]=mag[i];
      if(mag[i]>=alto){out[i]=1;pila.push(i);}
    }
    while(pila.length){const i=pila.pop(),x=i%W,y=(i-x)/W;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy;if(xx<1||yy<1||xx>=W-1||yy>=H-1)continue;
        const j=yy*W+xx;if(!out[j]&&fina[j]>=bajo){out[j]=1;pila.push(j);}
      }
    }
    return out;
  }

  function regionesColor(rgb,W,H,cantidad,minAreaPx) {
    const n=W*H,k=Math.max(2,Math.min(12,Math.round(cantidad||6))),centros=[];
    // Semillas reproducibles y agrupamiento en RGB; conserva colores de brillo similar.
    for(let j=0;j<k;j++){const i=Math.min(n-1,Math.floor((j+.5)*n/k));centros.push([rgb[3*i],rgb[3*i+1],rgb[3*i+2]]);}
    const etiquetas=new Uint8Array(n);
    for(let iter=0;iter<8;iter++){
      const sum=Array.from({length:k},()=>[0,0,0,0]);
      for(let i=0;i<n;i++){
        let best=Infinity,which=0;
        for(let j=0;j<k;j++){const d=(rgb[3*i]-centros[j][0])**2+(rgb[3*i+1]-centros[j][1])**2+(rgb[3*i+2]-centros[j][2])**2;
          if(d<best){best=d;which=j;}}
        etiquetas[i]=which;sum[which][0]+=rgb[3*i];sum[which][1]+=rgb[3*i+1];sum[which][2]+=rgb[3*i+2];sum[which][3]++;
      }
      sum.forEach((s,j)=>{if(s[3])centros[j]=s.slice(0,3).map(v=>v/s[3]);});
    }
    if(minAreaPx>1){const visto=new Uint8Array(n),pila=[];
      for(let i=0;i<n;i++){if(visto[i])continue;const grupo=[],lab=etiquetas[i];pila.push(i);visto[i]=1;
        while(pila.length){const q=pila.pop();grupo.push(q);const x=q%W,y=(q-x)/W;
          for(const z of [x>0?q-1:-1,x<W-1?q+1:-1,y>0?q-W:-1,y<H-1?q+W:-1])if(z>=0&&!visto[z]&&etiquetas[z]===lab){visto[z]=1;pila.push(z);}
        }
        if(grupo.length<minAreaPx){const votos=new Map();for(const q of grupo){const x=q%W,y=(q-x)/W;
          for(const z of [x>0?q-1:-1,x<W-1?q+1:-1,y>0?q-W:-1,y<H-1?q+W:-1])if(z>=0&&etiquetas[z]!==lab)votos.set(etiquetas[z],(votos.get(etiquetas[z])||0)+1);}
          const nuevo=[...votos].sort((a,b)=>b[1]-a[1])[0];if(nuevo)grupo.forEach(q=>etiquetas[q]=nuevo[0]);}
      }
    }
    const b=new Uint8Array(n);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;
      if(etiquetas[i]!==etiquetas[i+1]||etiquetas[i]!==etiquetas[i+W])b[i]=1;}
    return b;
  }

  /** Mapa binario de píxeles oscuros. */
  function oscuros(rgb, W, H, umbral, invertir) {
    const out = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const lum = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
      let o = lum < umbral;
      if (invertir) o = !o;
      out[i] = o ? 1 : 0;
    }
    return out;
  }

  /**
   * Quita componentes (8-conectados) de `b`:
   *  - los que tienen el lado mayor menor que `minPx` (manchas, letras sueltas);
   *  - si `textoPx` > 0, los «enredados» de hasta `textoPx` de lado: mucho trazo en poco lugar
   *    (píxeles / lado mayor > `densidad`), típico de palabras y números. Una línea de mapa
   *    tiene ~1 píxel de trazo por píxel de largo; un lago o círculo, ~3; una palabra, bastante más.
   * Modifica `b`. Devuelve la cantidad de componentes quitados.
   */
  function quitarChicos(b, W, H, minPx, textoPx, densidad) {
    textoPx = textoPx || 0;
    densidad = densidad || 4;
    if (minPx <= 1 && !textoPx) return 0;
    const visto = new Uint8Array(W * H);
    const pila = new Int32Array(W * H);
    let quitados = 0;
    for (let inicio = 0; inicio < W * H; inicio++) {
      if (!b[inicio] || visto[inicio]) continue;
      let tope = 0, minX = W, maxX = -1, minY = H, maxY = -1;
      const miembros = [];
      pila[tope++] = inicio; visto[inicio] = 1;
      while (tope) {
        const i = pila[--tope];
        miembros.push(i);
        const x = i % W, y = (i - x) / W;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (b[j] && !visto[j]) { visto[j] = 1; pila[tope++] = j; }
          }
        }
      }
      const lado = Math.max(maxX - minX + 1, maxY - minY + 1);
      const enredado = textoPx > 0 && lado <= textoPx && miembros.length / lado > densidad;
      if (lado < minPx || enredado) {
        for (const i of miembros) b[i] = 0;
        quitados++;
      }
    }
    return quitados;
  }

  /**
   * Engrosa `b` con un radio de `r` píxeles (cuadrado). Sirve para unir los dos bordes que
   * deja una línea gruesa (uno de cada lado) antes de adelgazar: así queda una sola línea
   * por el centro en vez de dos paralelas.
   */
  function engrosar(b, W, H, r) {
    if (r < 1) return b;
    const tmp = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {            // horizontal
      let ultimo = -1e9;
      for (let x = 0; x < W + r; x++) {
        if (x < W && b[y * W + x]) ultimo = x;
        const xs = x - r;
        if (xs >= 0 && xs < W && x - ultimo <= 2 * r) tmp[y * W + xs] = 1;
      }
    }
    const out = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) {            // vertical
      let ultimo = -1e9;
      for (let y = 0; y < H + r; y++) {
        if (y < H && tmp[y * W + x]) ultimo = y;
        const ys = y - r;
        if (ys >= 0 && ys < H && y - ultimo <= 2 * r) out[ys * W + x] = 1;
      }
    }
    b.set(out);
    return b;
  }

  /**
   * Adelgaza y conserva las formas: Zhang-Suen puede borrar entera una forma maciza chica
   * (termina en un cuadrado de 2 × 2 que desaparece). Si una forma desaparece, se deja un
   * píxel en su centro.
   */
  function adelgazarConservando(b, W, H) {
    const antes = b.slice();
    adelgazar(b, W, H);
    const visto = new Uint8Array(W * H);
    const pila = new Int32Array(W * H);
    for (let inicio = 0; inicio < W * H; inicio++) {
      if (!antes[inicio] || visto[inicio]) continue;
      let tope = 0, queda = false, sx = 0, sy = 0;
      const miembros = [];
      pila[tope++] = inicio; visto[inicio] = 1;
      while (tope) {
        const i = pila[--tope];
        miembros.push(i);
        if (b[i]) queda = true;
        const x = i % W, y = (i - x) / W;
        sx += x; sy += y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (antes[j] && !visto[j]) { visto[j] = 1; pila[tope++] = j; }
        }
      }
      if (!queda) {
        const cx = sx / miembros.length, cy = sy / miembros.length;
        let mejor = miembros[0], dmin = Infinity;
        for (const i of miembros) {
          const x = i % W, y = (i - x) / W, dd = (x - cx) ** 2 + (y - cy) ** 2;
          if (dd < dmin) { dmin = dd; mejor = i; }
        }
        b[mejor] = 1;
      }
    }
    return b;
  }

  /** Adelgazamiento Zhang-Suen (in situ). */
  function adelgazar(b, W, H) {
    const borrar = [];
    let cambio = true;
    const p = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : b[y * W + x];
    while (cambio) {
      cambio = false;
      for (let paso = 0; paso < 2; paso++) {
        borrar.length = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!b[y * W + x]) continue;
            const p2 = p(x, y - 1), p3 = p(x + 1, y - 1), p4 = p(x + 1, y), p5 = p(x + 1, y + 1);
            const p6 = p(x, y + 1), p7 = p(x - 1, y + 1), p8 = p(x - 1, y), p9 = p(x - 1, y - 1);
            const vecinos = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (vecinos < 2 || vecinos > 6) continue;
            const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
            let trans = 0;
            for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) trans++;
            if (trans !== 1) continue;
            if (paso === 0) {
              if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
            } else {
              if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
            }
            borrar.push(y * W + x);
          }
        }
        if (borrar.length) {
          cambio = true;
          for (const i of borrar) b[i] = 0;
        }
      }
    }
    return b;
  }

  /**
   * Detecta bordes y devuelve los nodos de una grilla de puntos.
   * rgba: datos de la imagen (W × H). op:
   *   modo: 'bordes' | 'lineas'
   *   umbralBorde (diferencia de color, 5..150), umbral (brillo, 1..254), invertir
   *   suavizado (px, 0..3), pxPorMm, detalleMinMm (mm), paso (mm), quitarSueltos (bool)
   * Devuelve { nodos: [[col, fila], ...], pixeles: Uint8Array del esqueleto, quitados }.
   */
  function detectar(rgba, W, H, op) {
    const rgb = suavizar(rgba, W, H, Math.round(op.suavizado || 0));
    const b = op.modo === 'lineas' || op.modo==='umbral' || op.modo==='contornos' || op.modo==='relleno'
      ? oscuros(rgb, W, H, op.umbral == null ? 128 : op.umbral, !!op.invertir)
      : op.modo==='regiones' ? regionesColor(rgb,W,H,op.colores,Math.round((op.areaMinMm2||0)*op.pxPorMm**2))
      : canny(rgb, W, H, op.umbralBorde == null ? 30 : op.umbralBorde);
    const minPx = Math.round((op.detalleMinMm || 0) * op.pxPorMm);
    let quitados = quitarChicos(b, W, H, minPx);
    if(op.modo==='umbral')return {nodos:[],pixeles:b,quitados};
    if(op.modo==='contornos'||op.modo==='relleno'){
      const copia=b.slice();
      for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(copia[y*W+x]&&
        (x===0||x===W-1||y===0||y===H-1||!copia[y*W+x-1]||!copia[y*W+x+1]||!copia[(y-1)*W+x]||!copia[(y+1)*W+x]))b[y*W+x]=1;
      else b[y*W+x]=0;
    }
    // Une los dos lados de las líneas gruesas (hasta ~1,2 mm de grosor) antes de adelgazar.
    if(op.modo==='lineas')engrosar(b, W, H, Math.round((op.unirMm == null ? 0.6 : op.unirMm) * op.pxPorMm));
    adelgazarConservando(b, W, H);
    // Después de adelgazar, cada trazo mide 1 píxel: el texto se reconoce por lo enredado.
    const textoPx = op.quitarTexto ? Math.round((op.textoMaxMm || 30) * op.pxPorMm) : 0;
    quitados += quitarChicos(b, W, H, minPx, textoPx, op.densidadTexto || 3.5);
    // Esqueleto -> nodos de la grilla de `paso` mm.
    const paso = op.paso;
    const nodos = new Map();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!b[y * W + x]) continue;
        const c = Math.round((x + 0.5) / op.pxPorMm / paso);
        const f = Math.round((y + 0.5) / op.pxPorMm / paso);
        nodos.set(c + ',' + f, [c, f]);
      }
    }
    let lista = [...nodos.values()];
    if (op.quitarSueltos) {
      lista = lista.filter(([c, f]) => {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dy) && nodos.has((c + dx) + ',' + (f + dy))) return true;
          }
        }
        return false;
      });
    }
    return { nodos: lista, pixeles: b, quitados };
  }

  const api = { suavizar, bordesDeColor, canny, regionesColor, oscuros, quitarChicos, engrosar, adelgazar, adelgazarConservando, detectar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Bordes = api;
})(typeof window !== 'undefined' ? window : this);
