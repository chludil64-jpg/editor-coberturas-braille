/* Transcripción a braille español grado 1 (integral), según la signografía
   básica de la CBE (Comisión Braille Española), de uso habitual en Argentina.
   Cada celda es un arreglo con los números de punto (1 a 6).
   Funciona en el navegador (window.BrailleES) y en Node (require). */
(function (raiz) {
  'use strict';

  const LETRAS = {
    a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5], f: [1, 2, 4], g: [1, 2, 4, 5],
    h: [1, 2, 5], i: [2, 4], j: [2, 4, 5], k: [1, 3], l: [1, 2, 3], m: [1, 3, 4],
    n: [1, 3, 4, 5], o: [1, 3, 5], p: [1, 2, 3, 4], q: [1, 2, 3, 4, 5], r: [1, 2, 3, 5],
    s: [2, 3, 4], t: [2, 3, 4, 5], u: [1, 3, 6], v: [1, 2, 3, 6], w: [2, 4, 5, 6],
    x: [1, 3, 4, 6], y: [1, 3, 4, 5, 6], z: [1, 3, 5, 6],
    'ñ': [1, 2, 4, 5, 6], 'á': [1, 2, 3, 5, 6], 'é': [2, 3, 4, 6], 'í': [3, 4],
    'ó': [3, 4, 6], 'ú': [2, 3, 4, 5, 6], 'ü': [1, 2, 5, 6]
  };

  // Los dígitos usan las letras a-j precedidas del signo de número.
  const DIGITOS = {
    '1': [1], '2': [1, 2], '3': [1, 4], '4': [1, 4, 5], '5': [1, 5], '6': [1, 2, 4],
    '7': [1, 2, 4, 5], '8': [1, 2, 5], '9': [2, 4], '0': [2, 4, 5]
  };

  // Puntuación española. Algunos signos ocupan dos celdas.
  const PUNTUACION = {
    '.': [[3]], ',': [[2]], ';': [[2, 3]], ':': [[2, 5]],
    '¿': [[2, 6]], '?': [[2, 6]], '¡': [[2, 3, 5]], '!': [[2, 3, 5]],
    '"': [[2, 3, 6]], '“': [[2, 3, 6]], '”': [[2, 3, 6]], '«': [[2, 3, 6]], '»': [[2, 3, 6]],
    '(': [[1, 2, 6]], ')': [[3, 4, 5]],
    '-': [[3, 6]], '‐': [[3, 6]], '–': [[3, 6], [3, 6]], '—': [[3, 6], [3, 6]],
    "'": [[3]], '’': [[3]], '‘': [[3]],
    '*': [[3, 5]],
    '/': [[4, 5, 6], [2, 5, 6]] // barra (verificar con la normativa vigente)
  };

  const SIGNO_MAYUSCULA = [4, 6];
  const SIGNO_NUMERO = [3, 4, 5, 6];
  const SIGNO_INTERRUPTOR = [5]; // separa un número de una letra a-j que le sigue

  function esLetra(c) {
    return /\p{L}/u.test(c);
  }
  function esMayuscula(c) {
    return c !== c.toLowerCase() && c === c.toUpperCase();
  }
  function esDigito(c) {
    return c >= '0' && c <= '9';
  }

  /**
   * Transcribe un texto (puede tener varios renglones separados por \n).
   * opciones.mayusculas: 'signo' (por defecto) | 'sin_signo' (todo mayúsculas sin signo)
   * opciones.palabraMayusculas: 'doble' (46-46 antes de una palabra toda en
   *   mayúsculas, por defecto) | 'cada_letra' (46 antes de cada letra)
   * Devuelve { renglones: [[celda,...],...], sinTranscribir: [caracteres], unicode }.
   */
  function transcribir(texto, opciones) {
    const op = Object.assign({ mayusculas: 'signo', palabraMayusculas: 'doble' }, opciones || {});
    const lineas = String(texto == null ? '' : texto).normalize('NFC').replace(/\r/g, '').split('\n');
    const renglones = [];
    const sinTranscribir = [];
    for (const linea of lineas) {
      const celdas = [];
      const chars = Array.from(linea.replace(/\t/g, ' '));
      let enNumero = false;
      let enPalabraMayus = false;
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (c === ' ' || /\s/u.test(c)) {
          celdas.push([]);
          enNumero = false;
          enPalabraMayus = false;
          continue;
        }
        if (esDigito(c)) {
          if (!enNumero) celdas.push(SIGNO_NUMERO.slice());
          celdas.push(DIGITOS[c].slice());
          enNumero = true;
          enPalabraMayus = false;
          continue;
        }
        if ((c === '.' || c === ',') && enNumero && i + 1 < chars.length && esDigito(chars[i + 1])) {
          // Punto de miles o coma decimal dentro de un número: sigue el modo número.
          celdas.push(c === '.' ? [3] : [2]);
          continue;
        }
        if (esLetra(c)) {
          const minus = c.toLowerCase();
          const celda = LETRAS[minus];
          if (!celda) {
            sinTranscribir.push(c);
            enNumero = false;
            continue;
          }
          let signoEscrito = false;
          if (op.mayusculas !== 'sin_signo' && esMayuscula(c) && !enPalabraMayus) {
            // ¿La palabra entera está en mayúsculas? (dos letras o más)
            let j = i;
            let letras = 0;
            let todas = true;
            while (j < chars.length && esLetra(chars[j])) {
              letras++;
              if (!esMayuscula(chars[j])) todas = false;
              j++;
            }
            if (todas && letras >= 2 && op.palabraMayusculas === 'doble') {
              celdas.push(SIGNO_MAYUSCULA.slice(), SIGNO_MAYUSCULA.slice());
              enPalabraMayus = true;
            } else {
              celdas.push(SIGNO_MAYUSCULA.slice());
            }
            signoEscrito = true;
          }
          if (enNumero && !signoEscrito && 'abcdefghij'.includes(minus)) {
            celdas.push(SIGNO_INTERRUPTOR.slice());
          }
          celdas.push(celda.slice());
          enNumero = false;
          continue;
        }
        const punt = PUNTUACION[c];
        enNumero = false;
        enPalabraMayus = false;
        if (punt) {
          for (const p of punt) celdas.push(p.slice());
        } else {
          sinTranscribir.push(c);
        }
      }
      renglones.push(celdas);
    }
    return { renglones, sinTranscribir, unicode: renglones.map(aUnicode).join('\n') };
  }

  /** Celda -> carácter Unicode braille (U+2800). */
  function celdaAUnicode(celda) {
    let bits = 0;
    for (const p of celda) bits |= 1 << (p - 1);
    return String.fromCodePoint(0x2800 + bits);
  }
  function aUnicode(celdas) {
    return celdas.map(celdaAUnicode).join('');
  }

  const api = {
    transcribir, celdaAUnicode, aUnicode,
    LETRAS, DIGITOS, PUNTUACION, SIGNO_MAYUSCULA, SIGNO_NUMERO, SIGNO_INTERRUPTOR
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.BrailleES = api;
})(typeof self !== 'undefined' ? self : this);
