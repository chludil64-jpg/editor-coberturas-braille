/* Cálculo de bordes y trayectos fuera del hilo de la interfaz. */
importScripts('bordes.js','vectorizar.js','capas_color.js');
self.onmessage=e=>{
  const {datos,W,H,op}=e.data;
  try{
    if(e.data.tipo==='capas'){
      self.postMessage({progreso:'Reduciendo mapa a resolución de decisión…'});
      const reducido=self.CapasColor.reducir(datos,W,H,1400);
      const resultado=self.CapasColor.analizar(reducido.datos,reducido.W,reducido.H,op.ancho,op.K,mensaje=>self.postMessage({progreso:mensaje}));
      resultado.reducido=reducido.datos;
      self.postMessage({resultado});return;
    }
    const res=self.Bordes.detectar(datos,W,H,op);
    const polilineas=op.modo==='umbral'?self.Vectorizar.filas(res.pixeles,W,H,op.pxPorMm):
      self.Vectorizar.convertir(res.pixeles,W,H,op.pxPorMm,
      {minLargoMm:op.minLargo,simplificacionMm:op.simplificacion,pasadas:op.chaikin});
    self.postMessage({polilineas,quitados:res.quitados});
  }catch(err){self.postMessage({error:String(err)});}
};
