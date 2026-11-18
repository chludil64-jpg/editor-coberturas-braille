/* Historial de deshacer con nombre de cada paso. Cálculo puro (sirve en Node y en el navegador).
   El estado es { pasados: [], futuros: [] }:
   - pasados: un renglón por acción hecha, {nombre, json} = nombre de la acción y copia del documento ANTES de hacerla.
   - futuros: acciones deshechas (la última deshecha queda arriba de todo), {nombre, json} = copia DESPUÉS de hacerla.
   La «línea de tiempo» es la lista de estados por los que pasó el documento: el inicial, uno después de cada acción
   y, si hubo deshacer, los que se pueden rehacer. Volver a un paso es pararse en otro punto de esa línea. */
(function (raiz) {
  'use strict';
  const MAX = 150;

  const NOMBRES = {
    objetos: 'Cambio en los objetos', cuadros: 'Cambio en los cuadros braille', cuadro: 'Editar cuadro braille',
    texto: 'Editar texto braille', dibujo: 'Dibujo', mover: 'Mover', arrastre: 'Mover o transformar',
    pagina: 'Cambio de página', opciones: 'Cambio de opciones', capas: 'Capas visibles', nombre: 'Renombrar',
    borrar: 'Borrar', disposicion: 'Importar disposición braille', perfil: 'Perfil de impresora'
  };
  /** Nombre por defecto según el motivo del aviso de cambio. */
  function nombrePorMotivo(motivo) { return NOMBRES[motivo] || 'Cambio'; }

  function nuevo() { return { pasados: [], futuros: [] }; }

  /** Guarda el documento actual antes de una acción. `nombre` puede faltar: se completa con nombrar(). */
  function registrar(est, json, nombre) {
    const entrada = { nombre: nombre || '', json };
    est.pasados.push(entrada);
    if (est.pasados.length > MAX) est.pasados.shift();
    est.futuros.length = 0;
    return entrada;
  }

  /** Pone nombre a una entrada que no lo tenía (devuelve true si lo puso). */
  function nombrar(entrada, nombre) {
    if (!entrada || entrada.nombre) return false;
    entrada.nombre = nombre;
    return true;
  }

  /** Estados por los que pasó el documento, en orden; `actual` es la posición del que se está viendo. */
  function lineaDeTiempo(est, actualJSON) {
    const estados = [], n = est.pasados.length, m = est.futuros.length;
    est.pasados.forEach((p, j) => estados.push({ json: p.json, nombre: j === 0 ? 'Estado inicial' : est.pasados[j - 1].nombre || 'Cambio' }));
    estados.push({ json: actualJSON, nombre: n ? est.pasados[n - 1].nombre || 'Cambio' : 'Estado inicial' });
    for (let k = m - 1; k >= 0; k--) estados.push({ json: est.futuros[k].json, nombre: est.futuros[k].nombre || 'Cambio' });
    return { estados, actual: n };
  }

  /**
   * Se para en el punto `q` de la línea de tiempo (0 = el más antiguo guardado). Reacomoda las pilas y devuelve
   * el JSON del documento que hay que cargar, o null si `q` no existe o ya es el actual.
   */
  function irA(est, q, actualJSON) {
    const t = lineaDeTiempo(est, actualJSON), total = t.estados.length;
    if (!Number.isInteger(q) || q < 0 || q >= total || q === t.actual) return null;
    // Acción j (0 a total-2) lleva del estado j al estado j+1.
    const nombreAccion = j => t.estados[j + 1].nombre;
    est.pasados.length = 0;      // se modifican en el lugar: otras partes del programa guardan estas listas
    for (let j = 0; j < q; j++) est.pasados.push({ nombre: nombreAccion(j), json: t.estados[j].json });
    est.futuros.length = 0;
    for (let j = total - 2; j >= q; j--) est.futuros.push({ nombre: nombreAccion(j), json: t.estados[j + 1].json });
    return t.estados[q].json;
  }

  /** Deshace un paso; devuelve el JSON a cargar o null si no hay nada. */
  function deshacer(est, actualJSON) {
    if (!est.pasados.length) return null;
    const p = est.pasados.pop();
    est.futuros.push({ nombre: p.nombre || 'Cambio', json: actualJSON });
    return p.json;
  }
  /** Rehace un paso; devuelve el JSON a cargar o null si no hay nada. */
  function rehacer(est, actualJSON) {
    if (!est.futuros.length) return null;
    const f = est.futuros.pop();
    est.pasados.push({ nombre: f.nombre || 'Cambio', json: actualJSON });
    return f.json;
  }

  const api = { MAX, nombrePorMotivo, nuevo, registrar, nombrar, lineaDeTiempo, irA, deshacer, rehacer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Historial = api;
})(typeof self !== 'undefined' ? self : this);
