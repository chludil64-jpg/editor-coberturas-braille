/* Autoguardado de recuperación: cada 2 minutos y al ocultar o cerrar la pestaña, si hay cambios sin guardar,
   deja una copia del proyecto en IndexedDB (no en localStorage: el PDF en base64 puede ser grande).
   Se conservan las últimas 3 copias. Al abrir el programa, si hay una copia más nueva que el último
   guardado, se ofrece recuperarla; Archivo › «Recuperar copia automática…» lista las copias.
   La lógica pura (rotación de copias, cuándo ofrecer, formatos) sirve en Node y se prueba en tests/. */
(function (raiz) {
  'use strict';

  const MAX_COPIAS = 3;
  const INTERVALO_MS = 2 * 60 * 1000;

  // ------------------------------------------------------------ lógica pura
  function ordenar(lista) { return (lista || []).slice().sort((a, b) => b.fecha - a.fecha); }

  /** Agrega `nueva` a la lista y devuelve qué copias conservar (las `max` más nuevas) y cuáles borrar. */
  function rotarCopias(lista, nueva, max) {
    const tope = max || MAX_COPIAS;
    const todas = ordenar((lista || []).filter(c => c.id !== nueva.id).concat([nueva]));
    return { conservar: todas.slice(0, tope), borrar: todas.slice(tope) };
  }

  /** Copia que conviene ofrecer al abrir el programa: la más nueva posterior al último guardado
      (y a la última vez que se descartó una oferta). Si no hay ninguna, null. */
  function copiaParaOfrecer(lista, estado) {
    const e = estado || {};
    const corte = Math.max(Number(e.ultimoGuardado) || 0, Number(e.ignorarHasta) || 0);
    return ordenar(lista).find(c => c.fecha > corte) || null;
  }

  /** ¿Hay que guardar una copia ahora? Solo con cambios sin guardar y distintos de la última copia. */
  function hayQueAutoguardar(e) { return !!(e && e.sucio) && e.version !== e.versionAuto; }

  const dos = n => String(n).padStart(2, '0');
  function formatoHora(ms) { const d = new Date(ms); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; }
  function formatoFecha(ms) {
    const d = new Date(ms);
    return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} a las ${formatoHora(ms)}`;
  }

  const logica = { MAX_COPIAS, INTERVALO_MS, rotarCopias, copiaParaOfrecer, hayQueAutoguardar, formatoHora, formatoFecha };
  if (typeof module !== 'undefined' && module.exports) { module.exports = logica; return; }

  // ------------------------------------------------------------ navegador
  const App = raiz.App, $ = id => document.getElementById(id);
  if (!App) return;

  let bd = null, dbAbierta = null, conocidas = null, avisoError = false, ultimoNombre = '', ultimaHora = '';

  function abrirBD() {
    if (!bd) {
      bd = new Promise((ok, mal) => {
        if (!raiz.indexedDB) { mal(new Error('Este navegador no tiene IndexedDB.')); return; }
        const r = raiz.indexedDB.open('editor-braille-recuperacion', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('copias')) db.createObjectStore('copias', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'clave' });
        };
        r.onsuccess = () => { dbAbierta = r.result; ok(r.result); };
        r.onerror = () => mal(r.error || new Error('No se pudo abrir IndexedDB.'));
      });
      bd.catch(() => { bd = null; });
    }
    return bd;
  }
  function pedido(req) {
    return new Promise((ok, mal) => { req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error); });
  }
  function terminada(tx) {
    return new Promise((ok, mal) => { tx.oncomplete = () => ok(); tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error || new Error('Transacción cancelada.')); });
  }
  async function leerCopias() {
    const db = await abrirBD();
    return ordenar(await pedido(db.transaction('copias').objectStore('copias').getAll()));
  }
  async function leerMeta(clave) {
    const db = await abrirBD();
    const r = await pedido(db.transaction('meta').objectStore('meta').get(clave));
    return r ? r.valor : 0;
  }
  async function ponerMeta(clave, valor) {
    const db = await abrirBD();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ clave, valor });
    await terminada(tx);
  }
  async function estadoGuardado() {
    return { ultimoGuardado: await leerMeta('ultimoGuardado'), ignorarHasta: await leerMeta('ignorarHasta') };
  }

  function pintarEstado() {
    const el = $('estado-guardado');
    if (!el) return;
    if (App.sucio) {
      el.textContent = ultimaHora ? `Cambios sin guardar (último guardado a las ${ultimaHora})` : 'Cambios sin guardar';
      el.className = 'estado';
    } else if (ultimoNombre) {
      el.textContent = `Guardado en ${ultimoNombre} a las ${ultimaHora}`;
      el.className = 'estado ok';
    } else { el.textContent = ''; el.className = 'estado'; }
  }

  /** Guarda una copia de recuperación si hay cambios. Devuelve true si guardó. */
  async function guardarCopiaAhora() {
    const e = { sucio: App.sucio, version: App._version || 0, versionAuto: App._versionAuto };
    if (!hayQueAutoguardar(e)) return false;
    try {
      const texto = App._textoProyecto();
      const fecha = Date.now();
      const copia = { id: fecha, fecha, nombre: App.pdf.nombre || '', paginas: App.doc.paginas.length, texto };
      // Con la base ya abierta y la lista de copias conocida, la escritura se pide en el mismo instante
      // (sin esperar nada): así también alcanza a salir cuando la pestaña se está cerrando.
      const db = dbAbierta || await abrirBD();
      const previas = conocidas || ordenar(await pedido(db.transaction('copias').objectStore('copias').getAll()));
      const { conservar, borrar } = rotarCopias(previas, copia);
      const tx = db.transaction('copias', 'readwrite');
      const st = tx.objectStore('copias');
      st.put(copia);
      for (const c of borrar) st.delete(c.id);
      conocidas = conservar.map(c => ({ id: c.id, fecha: c.fecha }));
      await terminada(tx);
      App._versionAuto = e.version;
      avisoError = false;
      return true;
    } catch (err) {
      console.error('Autoguardado de recuperación:', err);
      if (!avisoError) {
        avisoError = true;
        const el = $('estado-guardado');
        if (el) { el.textContent = 'No se pudo guardar la copia automática'; el.className = 'estado aviso'; }
      }
      return false;
    }
  }

  /** Se guardó el proyecto (archivo o descarga). Devuelve la hora «HH:MM» para el mensaje. */
  function marcarGuardado(nombre) {
    const ahora = Date.now();
    ultimoNombre = nombre || ultimoNombre || 'el archivo';
    ultimaHora = formatoHora(ahora);
    App._versionAuto = App._version || 0;
    ponerMeta('ultimoGuardado', ahora).catch(e => console.error(e));
    pintarEstado();
    return ultimaHora;
  }
  /** Documento nuevo/abierto/PDF nuevo: lo anterior ya no se ofrece como recuperable. */
  function reiniciar() {
    App._versionAuto = App._version || 0;
    ultimoNombre = ''; ultimaHora = '';
    ponerMeta('ultimoGuardado', Date.now()).catch(e => console.error(e));
    pintarEstado();
  }

  // ------------------------------------------------------------ diálogos
  async function recuperar(copia) {
    try {
      if (App.Lienzo && App.Lienzo.cancelarPendiente) App.Lienzo.cancelarPendiente();
      await App.abrirProyecto(copia.texto, true);
      if (App.Lienzo) App.Lienzo.limpiarFondos();
      if (App.Principal && App.Principal.aplicarPerfilUi) App.Principal.aplicarPerfilUi();
      if (App.Lienzo) App.Lienzo.ajustarZoom();
      App.sucio = true;     // sigue sin estar guardado en un archivo
      App._archivo = null;
      ultimoNombre = ''; pintarEstado();
      App.anunciar(`Trabajo recuperado de la copia del ${formatoFecha(copia.fecha)}: ${App.doc.paginas.length} ${App.doc.paginas.length === 1 ? 'página' : 'páginas'}. Guardalo con Ctrl+S.`);
      return true;
    } catch (e) {
      console.error(e);
      App.anunciar('No se pudo recuperar la copia: ' + e.message);
      return false;
    }
  }

  async function ofrecerAlIniciar() {
    let copia;
    try { copia = copiaParaOfrecer(await leerCopias(), await estadoGuardado()); }
    catch (e) { console.error('No se pudo leer las copias automáticas:', e); return; }
    const dlg = $('dlg-recuperar');
    if (!copia || !dlg) return;
    $('recuperar-texto').textContent = `Recuperar el trabajo no guardado del ${formatoFecha(copia.fecha)}` +
      `${copia.nombre ? ' («' + copia.nombre + '»)' : ''}, ${copia.paginas} ${copia.paginas === 1 ? 'página' : 'páginas'}. ` +
      'El programa se cerró o se recargó antes de guardarlo en un archivo.';
    $('btn-recuperar-si').onclick = async () => { dlg.close(); await recuperar(copia); };
    $('btn-recuperar-no').onclick = () => { ponerMeta('ignorarHasta', copia.fecha).catch(e => console.error(e)); dlg.close(); App.anunciar('Copia descartada. Sigue disponible en Archivo › Recuperar copia automática.'); };
    dlg.showModal();
    $('btn-recuperar-si').focus();
  }

  async function abrirListado() {
    const dlg = $('dlg-copias'), ul = $('lista-copias');
    if (!dlg || !ul) return;
    let copias = [];
    let errorLeer = '';
    try { copias = await leerCopias(); } catch (e) { errorLeer = e.message; }
    ul.innerHTML = '';
    $('copias-estado').textContent = errorLeer ? 'No se pudieron leer las copias: ' + errorLeer
      : copias.length ? `${copias.length} ${copias.length === 1 ? 'copia' : 'copias'} (máximo ${MAX_COPIAS}), de la más nueva a la más vieja.`
        : 'Todavía no hay copias automáticas. Se guardan solas cada 2 minutos mientras haya cambios sin guardar.';
    for (const c of copias) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Recuperar la copia del ${formatoFecha(c.fecha)}${c.nombre ? ' · ' + c.nombre : ''} · ${c.paginas} ${c.paginas === 1 ? 'página' : 'páginas'}`;
      b.addEventListener('click', async () => {
        if (App.sucio && !confirm('Hay cambios sin guardar en el documento actual. ¿Reemplazarlo por la copia?')) return;
        dlg.close();
        await recuperar(c);
      });
      li.append(b);
      ul.append(li);
    }
    if (!dlg.open) dlg.showModal();
    const primero = ul.querySelector('button') || dlg.querySelector('[data-cerrar]');
    if (primero) primero.focus();
  }
  const dc = $('dlg-copias');
  if (dc) dc.addEventListener('click', ev => { if (ev.target.closest('[data-cerrar]')) dc.close(); });
  const dg = $('dlg-error-guardado');
  if (dg) dg.addEventListener('click', ev => { if (ev.target.closest('[data-cerrar]')) dg.close(); });
  const bCopias = $('btn-recuperar-copia');
  if (bCopias) bCopias.addEventListener('click', abrirListado);

  // ------------------------------------------------------------ disparadores
  // Se abre la base y se lee la lista de copias de entrada, para poder guardar sin esperas al cerrar.
  leerCopias().then(l => { conocidas = l.map(c => ({ id: c.id, fecha: c.fecha })); }).catch(() => {});
  setInterval(() => { guardarCopiaAhora(); }, INTERVALO_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarCopiaAhora(); });
  raiz.addEventListener('pagehide', () => { guardarCopiaAhora(); });
  App.alCambiar(motivo => { if (motivo !== 'arrastre') pintarEstado(); });

  App.Autoguardado = Object.assign({ guardarCopiaAhora, marcarGuardado, reiniciar, ofrecerAlIniciar, abrirListado, leerCopias }, logica);
})(typeof window !== 'undefined' ? window : globalThis);
