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

    _est() { return { pasados: this._historial, futuros: this._rehacer }; },

    /* Memoria de deshacer: las imágenes de referencia (data URL) no se copian en cada paso. Se guardan
       una sola vez en _imagenes (por contenido) y los pasos del historial llevan solo «@img:<id>». */
    _imagenes: new Map(),
    _idImagen(url) {
      let h1 = 2166136261, h2 = 5381;
      for (let i = 0; i < url.length; i++) {
        const c = url.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = (Math.imul(h2, 33) + c) >>> 0;
      }
      return `${url.length.toString(36)}-${h1.toString(36)}-${h2.toString(36)}`;
    },
    /** Documento actual como texto para el historial (con las imágenes por referencia). */
    _ser(doc) {
      const imgs = this._imagenes;
      return JSON.stringify(doc || this.doc, (k, v) => {
        if (k === 'src' && typeof v === 'string' && v.length > 256 && v.startsWith('data:')) {
          const id = this._idImagen(v);
          if (!imgs.has(id)) imgs.set(id, v);
          return '@img:' + id;
        }
        return v;
      });
    },
    _deser(json) {
      const imgs = this._imagenes;
      return JSON.parse(json, (k, v) => (k === 'src' && typeof v === 'string' && v.startsWith('@img:') && imgs.has(v.slice(5))) ? imgs.get(v.slice(5)) : v);
    },

    /**
     * Guarda una copia antes de modificar, para poder deshacer. `nombre` es el de la acción tal como se ve
     * en el historial («Pegar», «Mover»…); si falta, se completa con el motivo del próximo cambio().
     */
    registrar(nombre) {
      this._pendiente = Historial.registrar(this._est(), this._ser(), nombre);
      this.sucio = true;
    },
    deshacer() {
      const est = this._est(), nombre = est.pasados.length && est.pasados[est.pasados.length - 1].nombre;
      const json = Historial.deshacer(est, this._ser());
      if (json === null) { this.anunciar('No hay nada para deshacer.'); return; }
      this.doc = this._deser(json);
      this._ajustarTrasRestaurar();
      this.anunciar(nombre ? `Deshecho: ${nombre}.` : 'Deshecho.');
    },
    rehacer() {
      const est = this._est(), nombre = est.futuros.length && est.futuros[est.futuros.length - 1].nombre;
      const json = Historial.rehacer(est, this._ser());
      if (json === null) { this.anunciar('No hay nada para rehacer.'); return; }
      this.doc = this._deser(json);
      this._ajustarTrasRestaurar();
      this.anunciar(nombre ? `Rehecho: ${nombre}.` : 'Rehecho.');
    },
    /** Pasos del historial para mostrarlos: {estados: [{nombre}], actual}. */
    lineaDeTiempo() { return Historial.lineaDeTiempo(this._est(), this._ser()); },
    /** Vuelve (o avanza) hasta el punto q de la línea de tiempo. Devuelve false si no hizo nada. */
    irAPaso(q) {
      const json = Historial.irA(this._est(), q, this._ser());
      if (json === null) return false;
      this.doc = this._deser(json);
      this.sucio = true;
      this._ajustarTrasRestaurar();
      return true;
    },
    _ajustarTrasRestaurar() {
      if (this.ui.pagina >= this.doc.paginas.length) this.ui.pagina = this.doc.paginas.length - 1;
      if (this.ui.sel && !this.buscarSel()) this.ui.sel = null;
      this.ui.seleccion=(this.ui.seleccion||[]).filter(id=>this.pagina().objetos.some(o=>o.id===id));
      this.cambio('historial');
    },
    limpiarHistorial() { this._historial.length = 0; this._rehacer.length = 0; this._pendiente = null; this._imagenes.clear(); },

    /** Avisa a todas las vistas que algo cambió. */
    cambio(motivo) {
      this._calc = null;
      // La acción recién registrada, si no tenía nombre, toma el del motivo (una sola vez).
      if (this._pendiente && motivo !== 'seleccion' && motivo !== 'historial') {
        Historial.nombrar(this._pendiente, Historial.nombrePorMotivo(motivo));
        this._pendiente = null;
      }
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

    /** True si el foco está en un campo de texto, algo editable o hay un diálogo/menú abierto: ahí no valen
        los atajos de una letra ni los del editor (V, L, M, N, Supr…). */
    atajosBloqueados(ev) {
      const t = ev && ev.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return true;
      if (document.querySelector('dialog[open]')) return true;
      if (document.querySelector('[role="menu"]:not([hidden])')) return true;
      return false;
    },

    nuevoId(prefijo) {
      return (prefijo || 'e') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    },

    anunciar(texto) {
      // Una sola región «live» (#anuncio). #estado-lienzo es texto visible, sin aria-live: así el lector
      // no dice el mismo mensaje dos veces.
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
