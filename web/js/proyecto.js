/* Estado de la aplicación, historial (deshacer/rehacer), utilidades de la API
   y guardar/abrir proyectos (.braille.json). */
(function () {
  'use strict';

  const A4H = { ancho: 297, alto: 210 };

  function paginaVacia(ancho, alto, extra) {
    return Object.assign({ ancho, alto, cuadros: [], objetos: [], trazos: [], capasVisibles: {}, pdfPagina: null, nombre: '' }, extra || {});
  }

  function docNuevo() {
    return {
      paginas: [paginaVacia(A4H.ancho, A4H.alto, { nombre: 'Hoja A4 horizontal' })],
      opciones: { separarDibujo: true, separacionDibujo: 3 }
    };
  }

  const App = window.App = {
    doc: docNuevo(),
    ui: {
      pagina: 0, sel: null, herramienta: 'seleccionar', zoom: 1, opacidad: 0.6,
      vista: 'boleta', verTinta: true, resaltado: null, pasoTeclado: 0.5, seleccion: []
    },
    pdf: { id: null, nombre: '', base64: null, info: [] },
    perfil: null,
    sucio: false,
    _historial: [],
    _rehacer: [],
    _oyentes: [],
    _calc: null,

    paginaVacia, docNuevo,

    pagina() { return this.doc.paginas[this.ui.pagina]; },

    medidas() {
      const p = this.pagina();
      return Grilla.medidasDePerfil(this.perfil, p && p.ancho, p && p.alto);
    },

    /** Cálculo único de puntos de la página actual (se cachea hasta el próximo cambio). */
    calculo() {
      if (!this._calc) {
        const o = this.doc.opciones || {};
        this._calc = Grilla.calcularPagina(this.pagina(), {
          medidas: this.medidas(),
          separacionDibujo: Grilla.despejeEfectivo(o)
        });
      }
      return this._calc;
    },

    /** Guarda una copia antes de modificar, para poder deshacer. */
    registrar() {
      this._historial.push(JSON.stringify(this.doc));
      if (this._historial.length > 150) this._historial.shift();
      this._rehacer = [];
      this.sucio = true;
    },
    deshacer() {
      if (!this._historial.length) { this.anunciar('No hay nada para deshacer.'); return; }
      this._rehacer.push(JSON.stringify(this.doc));
      this.doc = JSON.parse(this._historial.pop());
      this._ajustarTrasRestaurar();
      this.anunciar('Deshecho.');
    },
    rehacer() {
      if (!this._rehacer.length) { this.anunciar('No hay nada para rehacer.'); return; }
      this._historial.push(JSON.stringify(this.doc));
      this.doc = JSON.parse(this._rehacer.pop());
      this._ajustarTrasRestaurar();
      this.anunciar('Rehecho.');
    },
    _ajustarTrasRestaurar() {
      if (this.ui.pagina >= this.doc.paginas.length) this.ui.pagina = this.doc.paginas.length - 1;
      if (this.ui.sel && !this.buscarSel()) this.ui.sel = null;
      this.ui.seleccion=(this.ui.seleccion||[]).filter(id=>this.pagina().objetos.some(o=>o.id===id));
      this.cambio('historial');
    },
    limpiarHistorial() { this._historial = []; this._rehacer = []; },

    /** Avisa a todas las vistas que algo cambió. */
    cambio(motivo) {
      this._calc = null;
      for (const f of this._oyentes) {
        try { f(motivo); } catch (e) { console.error(e); }
      }
    },
    alCambiar(f) { this._oyentes.push(f); },

    buscarSel() {
      const s = this.ui.sel;
      if (!s) return null;
      const p = this.pagina();
      const lista = s.tipo === 'cuadro' ? p.cuadros : s.tipo === 'objeto' ? p.objetos : p.trazos;
      return lista.find(x => x.id === s.id) || null;
    },
    seleccionar(tipo, id) {
      this.ui.sel = tipo ? { tipo, id } : null;
      this.ui.seleccion = tipo ? [id] : [];
      this.cambio('seleccion');
    },

    nuevoId(prefijo) {
      return (prefijo || 'e') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    },

    anunciar(texto) {
      const el = document.getElementById('anuncio');
      if (!el) return;
      el.textContent = '';
      setTimeout(() => { el.textContent = texto; }, 30);
      const est = document.getElementById('estado-lienzo');
      if (est) est.textContent = texto;
    },

    /** Llama a la API del servidor local. */
    async api(ruta, opciones) {
      const op = Object.assign({ method: 'GET' }, opciones || {});
      const cab = Object.assign({ 'X-Editor-Braille': '1' }, op.headers || {});
      if (op.json !== undefined) {
        op.body = JSON.stringify(op.json);
        cab['Content-Type'] = 'application/json';
        delete op.json;
      }
      op.headers = cab;
      const r = await fetch(ruta, op);
      const tipo = r.headers.get('Content-Type') || '';
      if (!r.ok) {
        let msg = `Error ${r.status}`;
        if (tipo.includes('json')) { try { msg = (await r.json()).error || msg; } catch (e) { /* nada */ } }
        throw new Error(msg);
      }
      return tipo.includes('json') ? r.json() : r.blob();
    },

    descargarBlob(nombre, blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    descargarBase64(nombre, b64, tipo) {
      this.descargarBlob(nombre, new Blob([base64ABytes(b64)], { type: tipo || 'application/octet-stream' }));
    },

    nombreBase() {
      const n = (this.pdf.nombre || 'braille').replace(/\.[^.]+$/, '').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '_');
      return `${n}_p${this.ui.pagina + 1}`;
    },

    // ------------------------------------------------------------ proyecto
    async cargarPdf(arrayBuffer, nombre, conservarDoc) {
      const r = await this.api('/api/pdf', {
        method: 'POST', body: arrayBuffer, headers: { 'Content-Type': 'application/pdf' }
      });
      this.pdf = { id: r.id, nombre, base64: bytesABase64(new Uint8Array(arrayBuffer)), info: r.paginas };
      if (!conservarDoc) {
        this.doc = {
          paginas: r.paginas.map((p, i) => paginaVacia(p.ancho, p.alto, { pdfPagina: i, nombre: `${nombre} · página ${i + 1}` })),
          opciones: { separarDibujo: true, separacionDibujo: Number(this.perfil && this.perfil.separacion_dibujo_braille_mm) || 3 }
        };
        this.ui.pagina = 0;
        this.ui.sel = null;
        this.limpiarHistorial();
        this.sucio = false;
      }
      this.cambio('pdf');
      return r;
    },

    guardarProyecto() {
      const datos = {
        formato: 'editor-coberturas-braille', version: 1,
        guardado: new Date().toISOString(),
        doc: this.doc,
        pdf: this.pdf.base64 ? { nombre: this.pdf.nombre, base64: this.pdf.base64 } : null,
        perfil: this.perfil
      };
      const nombre = (this.pdf.nombre || 'proyecto').replace(/\.[^.]+$/, '') + '.braille.json';
      this.descargarBlob(nombre, new Blob([JSON.stringify(datos)], { type: 'application/json' }));
      this.sucio = false;
      this.anunciar(`Proyecto guardado como ${nombre} (en la carpeta de descargas).`);
    },

    async abrirProyecto(texto) {
      const datos = JSON.parse(texto);
      if (datos.formato !== 'editor-coberturas-braille' || !datos.doc || !Array.isArray(datos.doc.paginas)) {
        throw new Error('El archivo no es un proyecto de este editor.');
      }
      if (datos.pdf && datos.pdf.base64) {
        const bytes = base64ABytes(datos.pdf.base64);
        await this.cargarPdf(bytes.buffer, datos.pdf.nombre, true);
      } else {
        this.pdf = { id: null, nombre: '', base64: null, info: [] };
      }
      // El perfil (calibración de la impresora) NO se toma del proyecto: se usa siempre el
      // perfil actual de la impresora, para que un proyecto viejo no traiga calibraciones viejas.
      this.doc = datos.doc;
      this.doc.opciones = Object.assign({ separarDibujo: true, separacionDibujo: 3 }, this.doc.opciones || {});
      this.doc.paginas.forEach(p => { Objetos.migrarTrazos(p); p.capasVisibles = p.capasVisibles || {}; });
      this.ui.pagina = 0;
      this.ui.sel = null;
      this.ui.seleccion = [];
      this.limpiarHistorial();
      this.sucio = false;
      this.cambio('proyecto');
    }
  };

  function bytesABase64(bytes) {
    let s = '';
    const trozo = 0x8000;
    for (let i = 0; i < bytes.length; i += trozo) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + trozo));
    }
    return btoa(s);
  }
  function base64ABytes(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }
  App.bytesABase64 = bytesABase64;
  App.base64ABytes = base64ABytes;

  window.addEventListener('beforeunload', e => {
    if (App.sucio) { e.preventDefault(); e.returnValue = ''; }
  });
})();
