/* Disposición braille: exportar e importar SOLO los cuadros braille (texto, posición,
   alineación, opciones) y los dibujos de cada página, sin el PDF de fondo.
   Sirve para volver a aplicar el trabajo sobre el mismo PDF (o una versión corregida)
   sin empezar de cero. Funciona en el navegador (window.Disposicion) y en Node (require). */
(function (raiz) {
  'use strict';

  const FORMATO = 'disposicion-braille';
  const copiar = v => JSON.parse(JSON.stringify(v));

  /** Arma el archivo de disposición a partir del documento del editor. */
  function extraer(doc, nombrePdf) {
    return {
      formato: FORMATO,
      version: 1,
      guardado: new Date().toISOString(),
      pdfOrigen: nombrePdf || '',
      paginas: (doc.paginas || []).map((p, i) => ({
        numero: i + 1,
        ancho: p.ancho,
        alto: p.alto,
        cuadros: copiar(p.cuadros || []),
        trazos: copiar(p.trazos || []),
        objetos: copiar(p.objetos || [])
      }))
    };
  }

  /** Cantidad de cuadros y dibujos que trae un archivo de disposición. */
  function contar(datos) {
    let cuadros = 0, dibujos = 0;
    for (const p of datos.paginas || []) {
      cuadros += (p.cuadros || []).length;
      dibujos += (p.trazos || []).length + (p.objetos || []).length;
    }
    return { cuadros, dibujos };
  }

  function validar(datos) {
    if (!datos || datos.formato !== FORMATO || !Array.isArray(datos.paginas)) {
      throw new Error('El archivo no es una disposición braille de este editor.');
    }
  }

  /**
   * Aplica una disposición sobre el documento (lo modifica).
   * modo: 'reemplazar' (borra los cuadros y dibujos actuales de cada página) o 'agregar'.
   * nuevoId(prefijo): genera ids nuevos para no repetir los existentes.
   * paginaVacia(ancho, alto, extra): crea páginas si la disposición tiene más que el documento.
   * Devuelve { paginas, cuadros, dibujos, avisos }.
   */
  function aplicar(doc, datos, modo, nuevoId, paginaVacia) {
    validar(datos);
    const avisos = [];
    let cuadros = 0, dibujos = 0;
    datos.paginas.forEach((pd, i) => {
      let p = doc.paginas[i];
      if (!p) {
        p = paginaVacia(pd.ancho, pd.alto, { nombre: `Página ${i + 1} (de la disposición)` });
        doc.paginas.push(p);
        avisos.push(`La disposición tiene la página ${i + 1}, que no estaba: se agregó en blanco.`);
      } else if (Math.abs(p.ancho - pd.ancho) > 1 || Math.abs(p.alto - pd.alto) > 1) {
        avisos.push(`Página ${i + 1}: mide ${p.ancho.toFixed(0)} × ${p.alto.toFixed(0)} mm y la disposición ` +
          `se armó sobre ${pd.ancho.toFixed(0)} × ${pd.alto.toFixed(0)} mm. Revisá que los cuadros caigan bien.`);
      }
      if (modo === 'reemplazar') {
        p.cuadros = [];
        p.trazos = [];
        if (p.objetos) p.objetos = [];
      }
      p.cuadros = p.cuadros || [];
      p.trazos = p.trazos || [];
      for (const c of pd.cuadros || []) { const n = copiar(c); n.id = nuevoId('c'); p.cuadros.push(n); cuadros++; }
      for (const t of pd.trazos || []) { const n = copiar(t); n.id = nuevoId('t'); p.trazos.push(n); dibujos++; }
      if ((pd.objetos || []).length) {
        p.objetos = p.objetos || [];
        for (const o of pd.objetos) { const n = copiar(o); n.id = nuevoId('o'); p.objetos.push(n); dibujos++; }
      }
    });
    if (doc.paginas.length > datos.paginas.length) {
      avisos.push(`El documento tiene ${doc.paginas.length} páginas y la disposición ${datos.paginas.length}: ` +
        'las páginas que sobran no se tocaron.');
    }
    return { paginas: datos.paginas.length, cuadros, dibujos, avisos };
  }

  const api = { FORMATO, extraer, contar, validar, aplicar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Disposicion = api;
})(typeof window !== 'undefined' ? window : this);
