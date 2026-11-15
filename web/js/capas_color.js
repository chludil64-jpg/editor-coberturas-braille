/* Conversión Lab para fusionar colores casi iguales de un SVG. */
(function(raiz){'use strict';
  const rgbLab=(r,g,b)=>{const f=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};r=f(r);g=f(g);b=f(b);const x=(.4124564*r+.3575761*g+.1804375*b)/.95047,y=.2126729*r+.7151522*g+.072175*b,z=(.0193339*r+.119192*g+.9503041*b)/1.08883;const h=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;return [116*h(y)-16,500*(h(x)-h(y)),200*(h(y)-h(z))];};
  const delta=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);const api={rgbLab,delta};if(typeof module!=='undefined'&&module.exports)module.exports=api;else raiz.CapasColor=api;
})(typeof self!=='undefined'?self:this);
