/* Web Worker: vectoriza una imagen fuera del hilo principal (la CSP exige un archivo .js propio). */
'use strict';
importScripts('vectorizar.js');
self.onmessage = ev => {
  const { id, buf, ancho, alto, opciones } = ev.data;
  try {
    const res = self.Vectorizar.vectorizar(new Uint8ClampedArray(buf), ancho, alto, opciones);
    self.postMessage({ id, res });
  } catch (e) {
    self.postMessage({ id, error: String(e && e.message || e) });
  }
};
