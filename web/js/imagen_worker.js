/* Cálculo de bordes y trayectos fuera del hilo de la interfaz. */
importScripts('bordes.js','vectorizar.js');
self.onmessage=e=>{
  const {datos,W,H,op}=e.data;
  try{
    const res=self.Bordes.detectar(datos,W,H,op);
    const polilineas=op.modo==='umbral'?self.Vectorizar.filas(res.pixeles,W,H,op.pxPorMm):
      self.Vectorizar.convertir(res.pixeles,W,H,op.pxPorMm,
      {minLargoMm:op.minLargo,simplificacionMm:op.simplificacion,pasadas:op.chaikin});
    self.postMessage({polilineas,quitados:res.quitados});
  }catch(err){self.postMessage({error:String(err)});}
};
