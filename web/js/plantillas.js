/* Plantillas de hoja: guardar la página actual (encabezado, cuadros, márgenes, marcos, símbolos...) para
   reutilizarla. Se guardan en el navegador (localStorage) y se pueden exportar a un archivo .json
   para llevarlas a otra computadora. El cálculo es puro (sirve en Node y en el navegador); abajo está el diálogo. */
(function (raiz) {
  'use strict';
  const nodo = typeof module !== 'undefined' && module.exports;
  const FORMATO = 'editor-braille-plantilla';
  const CLAVE = 'editor-braille-plantillas';
  const copiar = o => JSON.parse(JSON.stringify(o));

  /** Plantilla a partir de una página: sin el PDF de fondo ni las imágenes de referencia (pesan mucho). */
  function crearPlantilla(pagina, nombre) {
    const nom = String(nombre || '').trim();
    if (!nom) throw new Error('Escribí un nombre para la plantilla.');
    return {
      formato: FORMATO, version: 1, nombre: nom, creada: new Date().toISOString(),
      ancho: pagina.ancho, alto: pagina.alto,
      cuadros: copiar(pagina.cuadros || []),
      objetos: copiar((pagina.objetos || []).filter(o => o.tipo !== 'referencia')),
      capasVisibles: copiar(pagina.capasVisibles || {})
    };
  }

  function validar(p) {
    if (!p || p.formato !== FORMATO) throw new Error('El archivo no es una plantilla de hoja de este editor.');
    if (!(p.ancho > 0) || !(p.alto > 0)) throw new Error('La plantilla no tiene un tamaño de hoja válido.');
    if (!Array.isArray(p.cuadros) || !Array.isArray(p.objetos)) throw new Error('La plantilla está incompleta.');
    if (!String(p.nombre || '').trim()) throw new Error('La plantilla no tiene nombre.');
    return p;
  }

  /** Página nueva con el contenido de la plantilla: ids nuevos y grupos renombrados. */
  function paginaDesdePlantilla(p, nuevoId, paginaVacia) {
    validar(p);
    const grupos = new Map();
    const objetos = copiar(p.objetos).map(o => {
      o.id = nuevoId('o');
      if (o.grupo) { if (!grupos.has(o.grupo)) grupos.set(o.grupo, nuevoId('g')); o.grupo = grupos.get(o.grupo); }
      return o;
    });
    const cuadros = copiar(p.cuadros).map(c => { c.id = nuevoId('c'); return c; });
    const extra = { nombre: p.nombre, cuadros, objetos, capasVisibles: copiar(p.capasVisibles || {}) };
    if (paginaVacia) return paginaVacia(p.ancho, p.alto, extra);
    return Object.assign({ ancho: p.ancho, alto: p.alto, trazos: [], pdfPagina: null }, extra);
  }

  // ---- almacenamiento (se le pasa el storage, para poder probarlo)
  function leerLista(storage) {
    try {
      const v = JSON.parse(storage.getItem(CLAVE) || '[]');
      return Array.isArray(v) ? v.filter(p => { try { validar(p); return true; } catch (e) { return false; } }) : [];
    } catch (e) { return []; }
  }
  /** Guarda (o reemplaza la de igual nombre). Devuelve true si reemplazó una existente. Puede lanzar si no hay lugar. */
  function guardarEnLista(storage, plantilla) {
    validar(plantilla);
    const lista = leerLista(storage);
    const i = lista.findIndex(p => p.nombre.toLowerCase() === plantilla.nombre.toLowerCase());
    if (i >= 0) lista[i] = plantilla; else lista.push(plantilla);
    storage.setItem(CLAVE, JSON.stringify(lista));
    return i >= 0;
  }
  function quitarDeLista(storage, nombre) {
    const lista = leerLista(storage).filter(p => p.nombre !== nombre);
    storage.setItem(CLAVE, JSON.stringify(lista));
    return lista;
  }
  function nombreArchivo(plantilla) {
    return String(plantilla.nombre).replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, ' ').trim().replace(/\s+/g, '_') + '.plantilla.json';
  }
  /** Resumen para mostrar en la lista. */
  function resumen(p) {
    return `${p.cuadros.length} cuadros braille, ${p.objetos.length} objetos, hoja de ${p.ancho} × ${p.alto} mm`;
  }

  const api = { FORMATO, CLAVE, crearPlantilla, validar, paginaDesdePlantilla, leerLista, guardarEnLista, quitarDeLista, nombreArchivo, resumen };
  if (nodo) { module.exports = api; return; }
  raiz.Plantillas = api;

  // ------------------------------------------------------------ interfaz (pestaña Formato)
  const App = raiz.App;
  if (!App || !raiz.document) return;
  const doc = raiz.document, $ = id => doc.getElementById(id);
  const dlg = $('dlg-plantillas');
  if (!dlg) return;
  const almacen = () => { try { return raiz.localStorage; } catch (e) { return null; } };
  const estado = t => { $('plantillas-estado').textContent = t; App.anunciar(t); };

  function pintar() {
    const ul = $('plantillas-lista');
    ul.replaceChildren();
    const st = almacen();
    const lista = st ? leerLista(st) : [];
    if (!lista.length) {
      const li = doc.createElement('li');
      li.className = 'nota';
      li.textContent = st ? 'Todavía no hay plantillas guardadas en este navegador.' : 'Este navegador no permite guardar plantillas; podés importar un archivo .json.';
      ul.append(li);
    }
    for (const p of lista) {
      const li = doc.createElement('li');
      const t = doc.createElement('span');
      t.className = 'plantilla-nombre';
      t.textContent = `${p.nombre} (${resumen(p)})`;
      const mk = (texto, etiqueta, f) => {
        const b = doc.createElement('button');
        b.type = 'button'; b.textContent = texto; b.setAttribute('aria-label', `${etiqueta}: ${p.nombre}`);
        b.addEventListener('click', f);
        return b;
      };
      li.append(t,
        mk('Crear página nueva', 'Crear una página nueva con la plantilla', () => crearDesde(p)),
        mk('Exportar .json', 'Exportar a un archivo la plantilla', () => exportar(p)),
        mk('Eliminar', 'Eliminar la plantilla', () => {
          if (!confirm(`¿Eliminar la plantilla «${p.nombre}» de este navegador? Si no la exportaste, no se puede recuperar.`)) return;
          quitarDeLista(almacen(), p.nombre);
          pintar();
          estado(`Plantilla «${p.nombre}» eliminada.`);
          $('plantilla-nombre').focus();
        }));
      ul.append(li);
    }
  }

  function guardarActual() {
    const nombre = $('plantilla-nombre').value;
    try {
      const pl = crearPlantilla(App.pagina(), nombre);
      const st = almacen();
      if (!st) throw new Error('Este navegador no permite guardar plantillas. Usá «Exportar .json» después de guardarla.');
      const reemplazo = guardarEnLista(st, pl);
      pintar();
      estado(`Plantilla «${pl.nombre}» ${reemplazo ? 'actualizada' : 'guardada'} en este navegador: ${resumen(pl)}.`);
    } catch (e) {
      estado('No se pudo guardar la plantilla: ' + (e.name === 'QuotaExceededError' ? 'no hay espacio en el navegador; exportala a un archivo.' : e.message));
    }
  }

  function crearDesde(pl) {
    App.registrar('Página desde plantilla: ' + pl.nombre);
    App.doc.paginas.push(paginaDesdePlantilla(pl, pre => App.nuevoId(pre), App.paginaVacia));
    App.ui.pagina = App.doc.paginas.length - 1;
    App.ui.sel = null; App.ui.seleccion = [];
    App.cambio('pagina');
    App.Lienzo.ajustarZoom();
    dlg.close();
    App.anunciar(`Página ${App.ui.pagina + 1} creada desde la plantilla «${pl.nombre}». Control+Z la deshace.`);
  }

  function exportar(pl) {
    App.descargarBlob(nombreArchivo(pl), new Blob([JSON.stringify(pl, null, 1)], { type: 'application/json' }));
    estado(`Plantilla exportada como ${nombreArchivo(pl)} (en la carpeta de descargas).`);
  }

  $('btn-plantilla-guardar').addEventListener('click', guardarActual);
  $('plantilla-nombre').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); guardarActual(); } });
  $('btn-plantilla-exportar-actual').addEventListener('click', () => {
    try { exportar(crearPlantilla(App.pagina(), $('plantilla-nombre').value)); } catch (e) { estado(e.message); }
  });
  $('btn-plantilla-importar').addEventListener('click', () => $('archivo-plantilla').click());
  $('archivo-plantilla').addEventListener('change', async ev => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const pl = validar(JSON.parse(await f.text()));
      const st = almacen();
      if (st) guardarEnLista(st, pl);
      pintar();
      estado(`Plantilla «${pl.nombre}» importada${st ? ' y guardada en este navegador' : ''}.`);
    } catch (e) { estado('No se pudo importar: ' + e.message); }
  });

  function abrir(enfocar) {
    pintar();
    $('plantillas-estado').textContent = '';
    $('plantilla-nombre').value = App.pagina().nombre || '';
    dlg.showModal();
    const x = enfocar === 'lista' ? dlg.querySelector('#plantillas-lista button') : null;
    (x || $('plantilla-nombre')).focus();
  }

  if (App.grupoCinta) {
    App.grupoCinta('formato', 'Plantillas de hoja', [
      App.botonCinta({ id: 'btn-plantilla-abrir-guardar', texto: 'Guardar plantilla', icono: 'layout-template',
        titulo: 'Guarda la página actual como plantilla reutilizable', alClic: () => abrir('nombre') }),
      App.botonCinta({ id: 'btn-plantilla-abrir-nueva', texto: 'Página desde plantilla', icono: 'file-plus',
        titulo: 'Crea una página nueva a partir de una plantilla guardada', alClic: () => abrir('lista') })
    ]);
  }
  App.Plantillas = { abrir };
})(typeof self !== 'undefined' ? self : this);
