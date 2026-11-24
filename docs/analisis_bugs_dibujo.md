# Informe de revisión — Editor Braille (lienzo y herramientas de dibujo)

- Repositorio: `C:\Users\matut\OneDrive\Desktop\PROGRAMA  IMPRIMIR BRAILLE` (commit `0f5ce3d`, 22/11/2026).
- Alcance: `web/js/lienzo.js`, `dibujo.js`, `medir.js`, `editor_objetos.js`, `menu_contextual.js`, `principal.js`, `cinta.js`, `atajos.js`, `objetos.js`, `historial.js`, `portapapeles.js`, `svg_dibujo.js`, `importar_dibujo.js`, `vectorizar.js` + `index.html`.
- Método: lectura completa de los módulos + **reproducción real en Chrome 157 (headless, CDP)** sobre una instancia de prueba del servidor en `http://127.0.0.1:8791` (puerto alternativo, no el 8777 del usuario). Los eventos de mouse y teclado se enviaron por `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`, así que son eventos confiables (no sintéticos desde JS). Cada hallazgo tiene la medición que lo respalda.
- No se modificó ningún archivo del repositorio.

---

## 1. Resumen ejecutivo

- **La causa del bug reportado está identificada y reproducida**: `Escape` con la herramienta Polilínea **no cancela el trazo**: en `lienzo.js:640` se atiende antes que la limpieza, cambia la herramienta a «Elegir y mover» y deja `verticesPendientes` vivo. A partir de ahí, `lienzo.js:414` sigue redibujando la vista previa y la etiqueta de medida (`ponerMedicion`) **con cualquier herramienta**, sin comprobar cuál está activa. Resultado: la línea y la etiqueta «183,8 mm · 284°» quedan pegadas al cursor para siempre.
- `Enter` y el **doble clic sí terminan** la polilínea (verificado), pero sólo si el foco está en el `<canvas>`: si el usuario tocó un botón de la cinta, la tecla se va al botón y el lienzo nunca la recibe. Eso explica la sensación de «no hay forma de cortarla».
- Hay además **11 defectos reales** de estados que no se limpian, historial contaminado, objetos de tamaño cero y goma incompleta. Todos verificados en el navegador.
- **Descarté como causa** (probado, no es): `medir.js` (es cálculo puro), `App.atajosBloqueados` (no intercepta Escape/Enter), el menú contextual (sólo escucha `pointerdown`), `role=application`/`aria-describedby`, y el doble clic (llega bien). Detalle en §6.

Prioridad sugerida: **BUG-01 + BUG-02 + BUG-03 en un solo parche** (es un mismo estado mal gestionado); después BUG-04, BUG-06, BUG-07; el resto por tanda.

---

## 2. BUG-01 (ALTA / P0) — El trazo de Polilínea/Polígono no se puede terminar y queda pegado al cursor

### 2.1 Reproducción exacta (verificada)

1. Elegir **Polilínea** (cinta → Dibujar → Formas).
2. Clic en 2 o 3 lugares de la hoja. La etiqueta de medida sigue al cursor (correcto hasta acá).
3. Presionar **Escape**.
4. Mover el mouse por la hoja.

**Resultado observado** (capturado por CDP):

```
tras 2 clics : herr=polilinea  cursor="x 69,7 mm · y 63,6 mm · 44,1 mm · 344,1°"
tras Escape  : herr=seleccionar cursor="x 69,7 mm · y 63,6 mm · 44,1 mm · 344,1°"
tras mover   : herr=seleccionar cursor="x 51,5 mm · y 51,5 mm · 46,2 mm · 113,2°"
objetos creados: 0
```

Es decir: la herramienta **sí** cambió, pero la etiqueta y la línea de vista previa siguen vivas y siguen al cursor. Con un clic sin mover, el mismo estado aparece en Línea, Medir y Mano alzada (la etiqueta es la misma), que es por qué el usuario sospechaba de esas herramientas también.

### 2.2 Cadena de causas (4 eslabones)

**Causa 1 — `web/js/lienzo.js:640`: Escape cambia de herramienta en vez de cancelar.**

```js
640| if(ev.key==='Escape'&&!lazo&&App.ui.herramienta!=='seleccionar'&&App.elegirHerramienta){App.elegirHerramienta('seleccionar');ev.preventDefault();return;}
```

Esta línea está **antes** del bloque que limpia (`lienzo.js:670`, `else if (ev.key === 'Escape') { verticesPendientes=null; ... }`) y hace `return`, así que con Polilínea/Polígono activos ese bloque de limpieza **nunca se ejecuta**. `verticesPendientes` (declarado en `lienzo.js:20`) y `vistaPrevia` (`:19`) quedan intactos.

**Causa 2 — `web/js/dibujo.js:60-67`: cambiar de herramienta tampoco limpia el trazo pendiente.**

```js
60| document.querySelectorAll('input[name="herramienta"]').forEach(r => {
61|   r.addEventListener('change', () => {
62|     App.ui.herramienta = r.value;
63|     if (App.Lienzo && App.Lienzo.limpiarMedicion) App.Lienzo.limpiarMedicion();   // ← sólo la medición
64|     $('lienzo').style.cursor = r.value === 'seleccionar' ? 'default' : 'crosshair';
65|     App.anunciar(`Herramienta: ${nombresHerr[r.value]}.`);
66|   });
67| });
```

`limpiarMedicion` (`lienzo.js:105`) borra `medicion` y `anclaMedir`, no `verticesPendientes` ni `vistaPrevia`. Es la misma ruta que usa `App.elegirHerramienta` (`dibujo.js:70-74`), o sea que **la cinta, los atajos V/L/M (`cinta.js:223-228`) y Escape** dejan el fantasma igual.

**Causa 3 — `web/js/lienzo.js:414-418`: el fantasma se redibuja con cualquier herramienta.**

```js
414| if (!arrastre && verticesPendientes && verticesPendientes.puntos.length) {
415|   const u = verticesPendientes.puntos.at(-1);
416|   ponerMedicion(Medir.describir('linea', { a: u, b: mm }), mm, u, mm);
417|   dibujar();
418| }
```

No hay ninguna condición sobre `App.ui.herramienta`. Con «Elegir y mover», con Medir, con Línea o con Goma, **cada `pointermove` vuelve a poner la medición y a redibujar la vista previa**. Esto convierte un estado inconsistente en un síntoma permanente y visible. Es también lo que contamina la herramienta Medir: en la prueba de Medir después de un Escape quedó la etiqueta del trazo viejo (44-60 mm) en lugar de la medición real.

**Causa 4 — el final "de verdad" depende del foco del canvas.** `Enter` (`lienzo.js:673`) y el doble clic (`:694`) sólo funcionan si `lienzo` tiene el foco, porque el listener es `lienzo.addEventListener('keydown')` (`:614`). Al elegir la herramienta desde la cinta el foco queda en el `<button>` de la cinta; ahí `Escape` va al botón (no cierra nada) y `Enter` vuelve a activar el botón. Verificado:

```
tras clic en cinta : herr=seleccionar, activo="Elegir y mover"   ← foco en el botón
Escape            : herr=seleccionar, activo="Elegir y mover"   ← no pasa nada
Escape (foco en lienzo): anuncio="Nada elegido."                ← recién acá limpia
```

**Recuperación actual (indocumentada):** sólo funciona con el lienzo enfocado: (a) `Enter` (crea el trazo), (b) segundo `Escape` (lo descarta), (c) doble clic (lo crea). El usuario no tiene forma de saberlo: en `interfaz.js:122-130` **no hay texto de ayuda para `polilinea` ni `poligono`** (sólo para seleccionar, lazo, editar-vertices, borrar-linea, tijera, goma y medir), y `#ayuda-lienzo` (`index.html:100`) tampoco lo menciona. Ver BUG-15.

### 2.3 Corrección propuesta

**(a) `lienzo.js`: una sola función que cancela todo lo que está a medio hacer.** Insertar después de `limpiarMedicion` (`línea 105`):

```js
  /** Cancela el gesto en curso sin tocar el documento: trazo de polilínea/polígono,
      vista previa, medición y vértice elegido. Devuelve true si había algo. */
  function cancelarPendiente() {
    const habia = !!verticesPendientes || !!vistaPrevia || !!verticeElegido || !!medicion;
    verticesPendientes = null;
    vistaPrevia = null;
    verticeElegido = null;
    medicion = null;
    anclaMedir = null;
    medirConTeclado = false;
    if (habia) dibujar();
    return habia;
  }
```

Y exportarla en `lienzo.js:715`:

```js
  }, limpiarMedicion: () => { limpiarMedicion(); medirConTeclado = false; dibujar(); },
     cancelarPendiente,
     lazoActivo: () => !!lazo, ...
```

**(b) `lienzo.js:640`: Escape primero cancela, después cambia de herramienta.**

```js
    // Escape: si hay un trazo a medio dibujar, lo cancela (no cambia de herramienta).
    if (ev.key === 'Escape' && !lazo) {
      if (verticesPendientes) { cancelarPendiente(); App.anunciar('Trazo cancelado.'); ev.preventDefault(); return; }
      if (App.ui.herramienta !== 'seleccionar' && App.elegirHerramienta) {
        App.elegirHerramienta('seleccionar'); ev.preventDefault(); return;
      }
    }
```

Con esto el primer Escape cancela y deja la herramienta Polilínea activa (mejor para volver a empezar); el segundo Escape vuelve a «Elegir y mover», como dice la ayuda.

**(c) `lienzo.js:414`: la vista previa sólo existe con la herramienta que la creó.**

```js
    if (!arrastre && verticesPendientes && verticesPendientes.puntos.length &&
        (App.ui.herramienta === 'polilinea' || App.ui.herramienta === 'poligono')) {
```

**(d) `dibujo.js:62-64`: al cambiar de herramienta, cancelar lo pendiente.**

```js
      App.ui.herramienta = r.value;
      if (App.Lienzo && App.Lienzo.cancelarPendiente) App.Lienzo.cancelarPendiente();
      else if (App.Lienzo && App.Lienzo.limpiarMedicion) App.Lienzo.limpiarMedicion();
```

Con (a)+(b)+(c) el bug desaparece aunque el usuario no sepa qué tecla apretar: cualquier cambio de herramienta (cinta, atajo, Escape) limpia el estado, y Escape ya no deja basura.

**(e) Opcional pero recomendado: que `Enter` funcione aunque el foco no esté en el canvas.** En `lienzo.js:614` no conviene mover el `keydown` a `document` (rompería campos de texto), pero sí se puede agregar en `dibujo.js` un `document.addEventListener('keydown', ...)` que, con `!App.atajosBloqueados(ev)` y `ev.key==='Enter'`, llame a `App.Lienzo.terminarTrazo?.()`. Alternativa más simple y suficiente: en `App.elegirHerramienta` devolver el foco al lienzo después de elegir (`$('lienzo').focus()`), así Enter/Escape siempre llegan. Esto último es una línea y resuelve el eslabón 4 completo.

---

## 3. BUG-02 (ALTA) — La etiqueta de medida y la vista previa aparecen fuera de la herramienta que corresponde

- **Dónde:** `web/js/lienzo.js:414-418`.
- **Repro:** el de BUG-01. Después del Escape, elegir Medir y mover el mouse: la barra muestra la distancia al último vértice del trazo abandonado, no la medición.
- **Causa:** ver Causa 3 de BUG-01 (falta la guarda de herramienta). Es el mismo cambio que (c).
- **Corrección:** la de §2.3(c). Si se prefiere no tocar ese `if`, la alternativa es limpiar `verticesPendientes` en todos los caminos de cambio de herramienta (§2.3(d)), pero conviene hacer las dos cosas: la guarda es la que evita que un estado viejo se dibuje.

---

## 4. BUG-03 (ALTA) — Cambiar de herramienta no limpia el estado del trazo (y el panel de ayuda no lo explica)

- **Dónde:** `web/js/dibujo.js:60-67` y `web/js/interfaz.js:122-130`.
- **Repro:** dibujar 2 puntos con Polilínea y tocar «Goma» en la cinta → la línea de vista previa sigue dibujada sobre la hoja mientras se usa la goma.
- **Causa:** sólo se llama `limpiarMedicion()`. Además, `interfaz.js` no tiene `TEXTOS.polilinea` / `TEXTOS.poligono` (cae en el genérico «Elegí el estilo de línea y el relleno en la pestaña Dibujar»), así que la persona no tiene ninguna pista de cómo terminar. Es parte del mismo bug desde el punto de vista del usuario.
- **Corrección (código):** §2.3(d) para el estado, y en `interfaz.js:122` agregar:

```js
      polilinea: 'Cada clic agrega un vértice y la vista previa sigue al cursor. Para terminar: Enter o doble clic. Escape cancela el trazo. También se puede escribir la lista de vértices en el panel de la herramienta.',
      poligono: 'Cada clic agrega un vértice. Para cerrar la forma: Enter o doble clic (hacen falta 3 vértices). Escape cancela.',
```

y ampliar `#ayuda-lienzo` en `index.html:100` con la misma frase (es el texto que lee el lector de pantalla al enfocar el lienzo).

---

## 5. BUG-04 (MEDIA-ALTA) — El trazo pendiente sobrevive al cambio de página, documento nuevo, abrir proyecto y deshacer (y se crea en la página equivocada)

- **Dónde:** `lienzo.js:382-386` y `:673` (estado del módulo), `principal.js:370-378` (`nuevaPagina`), `principal.js:399-404` (`#sel-pagina`), `proyecto.js:286-297` (`nuevoProyecto`), `proyecto.js:299-322` (`abrirProyecto`), `proyecto.js:120-125` (`_ajustarTrasRestaurar`).
- **Repro (verificado):** Polilínea, 2 clics en la página 1 → crear/ir a la página 2 → mover el mouse (el fantasma aparece en la página 2) → `Enter`.
- **Resultado medido:**

```
pág 2 con trazo pendiente: cursor="x 81,8 mm · y 81,8 mm · 21,9 mm · 303,7°"
Enter en pág 2          : objetos=1  tipos=["polilinea"]
por página              : [[], [{"t":"polilinea","v":2}]]   ← el trazo quedó en la página 2 con coordenadas de la 1
```

Igual con «Nuevo documento»: el fantasma se dibuja sobre el documento vacío y `Enter` crea la polilínea ahí con las coordenadas del documento anterior.

- **Causa:** `verticesPendientes` es estado del módulo `lienzo.js` y ninguna de esas acciones lo toca. `terminarVertices()` (`lienzo.js:679`) crea el objeto en `App.pagina()` actual, sin recordar en qué página se empezó.
- **Corrección:** llamar `App.Lienzo.cancelarPendiente()` (de §2.3(a)) en:
  - `principal.js:370` al principio de `nuevaPagina`,
  - `principal.js:399` en el listener de `#sel-pagina` (antes de cambiar `App.ui.pagina`),
  - `proyecto.js:288` y `:312` (`nuevoProyecto` / `abrirProyecto`),
  - `proyecto.js:120` (`_ajustarTrasRestaurar`, para deshacer/rehacer/ir a un paso).

  Alternativa más robusta (defensa en profundidad): guardar la página en el estado y descartar el trazo si cambió:

```js
      if(!verticesPendientes)verticesPendientes={tipo:h,puntos:[],pagina:App.ui.pagina};
      if(verticesPendientes.pagina!==App.ui.pagina){verticesPendientes=null;vistaPrevia=null;dibujar();return;}
```

---

## 6. BUG-05 (MEDIA) — Escapar de Polígono y seguir con Polilínea crea un polígono

- **Dónde:** `web/js/lienzo.js:383` (`if(!verticesPendientes)verticesPendientes={tipo:h,...}`).
- **Repro (verificado):** Polígono → 3 clics → Escape → elegir Polilínea → `Enter`.
- **Resultado medido:** `tipos=["poligono"]`, `cerrado:true`, historial «Crear polígono» — con la cinta mostrando «Polilínea» activa.
- **Causa:** el objeto pendiente conserva `tipo` del primer clic; mientras haya `verticesPendientes`, el `tipo` nunca se actualiza.
- **Corrección:** con §2.3(d) este caso ya no ocurre (cambiar de herramienta cancela). Si se prefiere conservar los vértices al cambiar entre polilínea y polígono, actualizar el tipo:

```js
      if(!verticesPendientes)verticesPendientes={tipo:h,puntos:[]};
      else verticesPendientes.tipo=h;
```

---

## 7. BUG-06 (MEDIA) — Un clic para elegir, con 1 píxel de temblor, mueve el objeto 0,3 mm y ensucia el historial

- **Dónde:** `web/js/lienzo.js:424-431` (rama `mover`).
- **Repro (verificado):** rectángulo en (20,20)-(60,50); con «Elegir y mover», presionar y soltar moviendo **1 px**.
- **Resultado medido:**

```
caja antes  : x0=20     y0=20
caja después: x0=20.3   y0=20.3      (0,303 mm a zoom 110 %)
historial   : ["Mover"]
```

En una hoja calibrada a 2,05 × 2,02 mm eso es un sexto de celda: no se ve, pero **desalinea el dibujo respecto de la grilla** y llena el historial de pasos «Mover» que no se distinguen entre sí.

- **Causa:** `posicion()` redondea a 0,01 mm, así que cualquier movimiento de 1 px produce `dx≠0` y entra en `if (!dx && !dy) return;` → registra y mueve. No hay umbral de arrastre.
- **Corrección:** umbral de 4 px antes de arrancar el movimiento (el delta acumulado se aplica igual cuando se supera, porque recién ahí se actualiza `arrastre.ultimo`):

```js
    } else if (arrastre.tipo === 'mover') {
      // Un clic con temblor no mueve nada ni agrega un paso al historial.
      if (!arrastre.registrado && Math.hypot(mm[0] - arrastre.inicio[0], mm[1] - arrastre.inicio[1]) * escala() < 4) return;
      const dx = mm[0] - arrastre.ultimo[0], dy = mm[1] - arrastre.ultimo[1];
```

---

## 8. BUG-07 (MEDIA) — Un clic sin arrastrar con Línea / Rectángulo / Elipse crea objetos de tamaño cero

- **Dónde:** `web/js/lienzo.js:492-497`.
- **Repro (verificado):** elegir Línea y hacer un clic suelto (sin mover).
- **Resultado medido:**

```
Línea      : objetos=1  vertices=[[51.52,51.52],[51.52,51.52]]  hist=["Crear línea"]
Rectángulo : objetos=1  (0 × 0 mm)                               hist=["Crear rectángulo"]
Mano alzada: objetos=1  (1 punto)                                hist=["Mano alzada"]
```

- **Causa:** `terminar()` arma el objeto con `const b=mm||a.inicio` sin comprobar que haya habido arrastre. La línea de 0 mm no se ve, no se puede elegir con el mouse (su caja es un punto) y sólo se puede borrar por la lista de elementos.
- **Corrección:**

```js
    if (a.tipo === 'forma') {
      vistaPrevia = null;
      const b = mm || a.inicio;
      // Sin arrastre no hay forma: evita objetos de 0 mm y pasos de historial inútiles.
      if (Math.hypot(b[0] - a.inicio[0], b[1] - a.inicio[1]) < 0.5) { medicion = null; dibujar(); return; }
      const datos = a.forma==='linea' ? {vertices:[a.inicio,b]} : { x:Math.min(a.inicio[0],b[0]), ... };
```

Para Mano alzada, en `terminar` (`lienzo.js:498-502`) agregar el mismo control: si `pts.length < 2`, no llamar a `agregarTrazo` y anunciar «Movés el lápiz para dibujar».

---

## 9. BUG-08 (MEDIA) — La goma agrega un paso de deshacer aunque no borre nada

- **Dónde:** `web/js/lienzo.js:388-393` (registra en `pointerdown`) y `:503-505` (cierre).
- **Repro (verificado):** hoja vacía, herramienta Goma, un clic suelto.
- **Resultado medido:** `historial = ["Borrar con la goma"]`, `objetos = 0`. Cada clic de goma deja un paso que no hace nada; con `Ctrl+Z` el usuario "deshace" cosas invisibles.
- **Causa:** `App.registrar()` se llama antes de saber si `borrarConGoma()` quitó algo. No se puede registrar después (hay que guardar la foto *antes* de mutar), así que hay que poder descartar el paso.
- **Corrección:** helper en `proyecto.js` (junto a `registrar`, línea 89):

```js
    registrar(nombre) {
      this._pendiente = Historial.registrar(this._est(), this._ser(), nombre);
      this._ultimo = this._pendiente;       // ← nuevo
      this.sucio = true;
    },
    /** Saca del historial el último paso registrado (gestos que no cambiaron nada). */
    descartarRegistro() {
      const e = this._ultimo;
      this._ultimo = null;
      if (!e) return false;
      const i = this._historial.lastIndexOf(e);
      if (i < 0) return false;
      this._historial.splice(i, 1);
      if (this._pendiente === e) this._pendiente = null;
      return true;
    },
```

y en `lienzo.js:503`:

```js
    } else if (a.tipo === 'goma') {
      if (!a.quitados) App.descartarRegistro();   // no borró nada: no ensucia el historial
      App.anunciar(`Goma: se borraron ${a.quitados} puntos.`);
```

El mismo `descartarRegistro()` sirve para BUG-11.

---

## 10. BUG-09 (MEDIA) — La goma no borra rectángulos, elipses ni polígonos

- **Dónde:** `web/js/lienzo.js:315`.
- **Repro:** dibujar un **Rectángulo**, elegir Goma y pasar por encima de su contorno: no pasa nada. En cambio, sobre una Línea/Polilínea sí borra (marca `borrados`).
- **Causa:** el filtro es `['linea','polilinea','poligono']`; `rectangulo` y `elipse` quedan afuera (y `puntos`, que sí funciona, va por otra rama). El usuario ve que la goma "no funciona" en la mitad de las formas.
- **Corrección:** incluir las formas con `objetoAPuntos` válido:

```js
    for(const o of p.objetos.filter(q=>['linea','polilinea','poligono','rectangulo','elipse'].includes(q.tipo)&&!q.bloqueado)){
```

(No incluir `imagen`/`referencia`: `objetoAPuntos` de una imagen sin `mapaCapa` devuelve sus polilíneas de contorno y borrar "trozos" de una imagen no tiene sentido.)

---

## 11. BUG-10 (MEDIA-BAJA) — El vértice elegido queda marcado en rojo al cambiar de herramienta

- **Dónde:** `web/js/lienzo.js:226` (se dibuja `verticeElegido` sin mirar la herramienta) y `:715` (no se expone forma de limpiarlo).
- **Repro (verificado por lectura de píxeles):** objeto con «Editar vértices» → `Tab` (elige el vértice 1) → cambiar a «Elegir y mover». El punto rojo `#a32600` sigue pintado sobre el lienzo (en la prueba, 171 píxeles de ese color, idénticos antes y después del cambio) aunque ya no se pueda mover con las flechas.
- **Causa:** `verticeElegido` sólo se limpia dentro de `teclasVertices` (al salir por los extremos con Tab o al cambiar de objeto).
- **Corrección:** incluir `verticeElegido` en `cancelarPendiente()` (§2.3(a), ya está) y llamarla al cambiar de herramienta (§2.3(d)). Como refuerzo, condicionar el dibujo: `if (verticeElegido && App.ui.herramienta === 'editar-vertices')`.

---

## 12. BUG-11 (BAJA) — `registrar()` antes de validar deja pasos huérfanos en el historial

- **Dónde:** `web/js/lienzo.js:359` (tijera sobre un polígono: `App.registrar('Cortar línea con la tijera')` y después `Objetos.cortarLinea` lanza «Elegí una línea abierta») y `:600-609` (Suprimir vértice cuando la forma ya tiene el mínimo: `quitarVertice` lanza).
- **Repro:** con la tijera, clic sobre un polígono → aviso de error; el paso «Cortar línea con la tijera» queda en el historial. Igual con Suprimir sobre un vértice de una polilínea de 2 vértices.
- **Causa:** el `catch` anuncia el error pero no revierte la entrada; además `_pendiente` queda armado y el **próximo** `cambio()` le pone el nombre de *otra* acción (paso duplicado con nombre equivocado).
- **Corrección:** validar antes de registrar (mover `App.registrar(...)` después de la operación que puede lanzar) o llamar `App.descartarRegistro()` en el `catch`:

```js
      }catch(e){App.descartarRegistro();App.anunciar(e.message);}
```

---

## 13. BUG-12 (BAJA) — La medición queda pintada al cambiar de página/deshacer y la barra de estado no coincide

- **Dónde:** `web/js/lienzo.js:105` (`limpiarMedicion` sólo en cambio de herramienta), `:470-482` (`terminar` de `medir` deja `medicion` viva a propósito), `index.html:103` (`#cursor-mm` es `aria-hidden="true"`).
- **Repro:** medir, cambiar a otra página: el cartel con la medida sigue dibujado sobre la hoja nueva hasta el próximo redibujado completo; lo mismo después de `Ctrl+Z`.
- **Causa:** `medicion` no se limpia en `App.alCambiar` y `dibujarMedicion()` (`:106-129`) la pinta siempre que exista. Aparte: la barra de estado (`cursor-mm`) se reescribe en cada `pointermove` (`:407-408`) y pierde la medida aunque el cartel siga en pantalla; y como `#cursor-mm` es `aria-hidden`, el lector nunca lee la medida en vivo (sólo al soltar, por `App.anunciar`).
- **Corrección:** en el listener `App.alCambiar` de `lienzo.js:716`, limpiar la medición cuando el motivo no sea de arrastre:

```js
  App.alCambiar(() => dibujar());
  // → 
  App.alCambiar(motivo => { if (motivo !== 'arrastre' && motivo !== 'seleccion') { medicion = null; } dibujar(); });
```

Esto es cosmético; no lo pondría en la misma tanda que el P0 (riesgo de borrar la medida que el usuario está leyendo).

---

## 14. BUG-13 (BAJA) — Con un solo punto del lazo, el clic derecho no ofrece nada

- **Dónde:** `web/js/lienzo.js:338` (`menuLazo` exige 2 puntos) y `:684` (`contextmenu` deriva todo al menú del lazo si `lazo` existe).
- **Repro:** Lazo → un clic → clic derecho. Resultado medido: no se abre ningún menú; sólo se anuncia «Fijá al menos 2 puntos para terminar la línea». La única salida es Escape o Ctrl+Z.
- **Corrección:** con `n < 2` ofrecer igual un menú mínimo (Cancelar / Deshacer punto):

```js
  function menuLazo(x,y,desde){ if(!lazo) return false; const n=lazo.anclas.length;
    if(n<2){ App.MenuContextual.abrirLista(x,y,desde||lienzo,[{texto:'Cancelar lazo',alClic:cancelarLazo}],'Acciones del lazo'); return true; }
```

---

## 15. BUG-14 (BAJA) — Los atajos de una letra (V/L/M) disparan desde la cinta

- **Dónde:** `web/js/cinta.js:223-228`.
- **Repro:** tabular hasta un botón de la cinta (por ejemplo «Imprimir…») y apretar `v`, `l` o `m` mientras se navega con el teclado: cambia la herramienta sin avisar.
- **Causa:** `App.atajosBloqueados(ev)` (`proyecto.js:157-163`) sólo bloquea `INPUT|TEXTAREA|SELECT`, `contenteditable`, diálogos abiertos y menús. Un `<button>` o un `<summary>` no bloquea, y en una app pensada para lector de pantalla el foco pasa mucho tiempo en botones.
- **Corrección:** sumar el botón/summary al bloqueo, o exigir que el foco esté en el lienzo o en el cuerpo:

```js
    if (ev.ctrlKey || ev.metaKey || ev.altKey || App.atajosBloqueados(ev)) return;
    const t = ev.target;
    if (t && (t.closest('button') || t.closest('summary') || t.closest('a'))) return;
```

---

## 16. BUG-15 (BAJA) — No hay ayuda de cómo terminar Polilínea/Polígono

- **Dónde:** `web/js/interfaz.js:122-130` (faltan `linea`, `polilinea`, `poligono`, `rectangulo`, `elipse`, `punto`, `mano`) y `index.html:100` (`#ayuda-lienzo`).
- **Impacto:** es la mitad del bug reportado. El usuario no encontró cómo cortar el trazo porque la interfaz no lo dice en ningún lado, ni en el panel ni en la ayuda de atajos (`dlg-atajos`, `index.html:570-580`, que tampoco menciona Enter/doble clic para formas).
- **Corrección:** el texto de §4 en `interfaz.js` + una fila en la tabla de atajos:

```
Enter / doble clic (lienzo) | Terminar la polilínea o cerrar el polígono
Escape (lienzo)             | Cancelar el trazo que se está dibujando / soltar la selección
```

---

## 17. BUG-16 (BAJA, rendimiento) — `dibujar()` reasigna el tamaño del canvas en cada movimiento

- **Dónde:** `web/js/lienzo.js:44-53` (`dimensionar`) llamada desde `:134` en **cada** `dibujar()`.
- **Medición (verificada):** `2 dibujar() → 2 asignaciones de canvas.width`. Con ~6.800 puntos, `dibujar()` tarda ≈1,9 ms (dpr 1, canvas 1031×743). Asignar `canvas.width` reasigna el *backing store* completo (`1031·743·4 ≈ 3 MB`) y descarta el contenido; en un monitor con `dpr=2` es el cuádruple, y se hace varias veces por segundo mientras se dibuja o se arrastra.
- **Corrección:**

```js
  function dimensionar() {
    const p = App.pagina(), dpr = window.devicePixelRatio || 1;
    const w = Math.ceil(aPx(p.ancho) + 20), h = Math.ceil(aPx(p.alto) + 20);
    if (lienzo.style.width === w + 'px' && lienzo.style.height === h + 'px' && lienzo.width === Math.round(w * dpr)) return;
    lienzo.style.width = w + 'px'; lienzo.style.height = h + 'px';
    lienzo.width = Math.round(w * dpr); lienzo.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
```

---

## 18. Falsos positivos descartados (probados, no son la causa)

| Hipótesis del reporte | Resultado |
|---|---|
| El doble clic nunca llega porque cada clic agrega un punto y redibuja | **Falso.** Verificado: 2 clics + doble clic → `objetos=1`, `tipos=["polilinea"]`, historial «Crear polilínea». El segundo clic del par cae a <0,5 mm y no agrega punto, y `dblclick` (`lienzo.js:694`) llega bien. |
| `Enter` no termina | **Falso** con el foco en el lienzo (probado: crea la polilínea). **Cierto** si el foco está en la cinta (ver Causa 4). |
| `medir.js` intercepta o cancela eventos | **Falso.** El módulo es cálculo puro (`num`, `angulo`, `segmento`, `describir`), sin listeners. |
| `App.atajosBloqueados` bloquea Escape/Enter | **Falso.** Sólo se usa en `cinta.js:224`, `editor_objetos.js:166` y `atajos.js:31` (letras y `?`); Escape/Enter no pasan por ahí. |
| El menú contextual (clic derecho) cancela los eventos | **Falso.** `menu_contextual.js` sólo escucha `pointerdown` para cerrarse, y `contextmenu` en `lienzo.js:682` hace `preventDefault` pero no `stopPropagation` ni toca `verticesPendientes`. Con Polilínea, el clic derecho abre el menú de objetos: **no termina ni cancela el trazo** (eso sí es una carencia de UX, ver §14). |
| `role="application"` + `aria-describedby` interceptan teclas | **Falso.** Los atributos no alteran el despacho de eventos en Chrome. Sí es cierto que ningún texto de ayuda explica cómo terminar (§16). |
| El historial cancela el trazo | **Parcial.** El historial no cancela nada: `Ctrl+Z` con un trazo pendiente **no lo limpia** (probado: `historial=[]` y el fantasma sigue), lo que empeora la confusión. Cubierto por BUG-04. |
| Listeners duplicados por registrarse dos veces | **Falso.** Los tres `change` sobre `input[name="herramienta"]` (`dibujo.js:61`, `cinta.js:219`, `interfaz.js:136`) hacen cosas distintas y no se pisan. No hay `addEventListener` repetido sobre el lienzo. |
| Errores de consola probables | **Ninguno** en las pruebas: `logs=[]` en todos los escenarios. Todos los `getElementById` usados existen (verificado id por id en `index.html`). |

---

## 19. Pruebas automáticas sugeridas (para que no vuelva)

1. **`tests/lienzo_estado.test.js`** (con jsdom + stub de canvas, o Playwright): simular `pointerdown` ×2 con `polilinea` y después `Escape`; afirmar que `App.Lienzo.hayTrazoPendiente()` es `false` y que `#cursor-mm` **no** contiene «mm · ».
2. Exponer en `App.Lienzo` un getter `hayTrazoPendiente: () => !!verticesPendientes` (hoy no hay forma de testearlo; también sirve para depurar).
3. Caso de regresión de BUG-04: pendiente + `cambio de página` → `Enter` no debe crear nada.
4. Caso de BUG-06: `pointerdown`, `pointermove` de 1 px, `pointerup` → el objeto no se mueve y `App._historial.length` no cambia.
5. Caso de BUG-07: clic suelto con `linea` → `App.pagina().objetos.length === 0`.

---

## 20. Orden de trabajo recomendado

1. Parche único para BUG-01/02/03 (§2.3 a-d) — es el bug que bloquea el uso.
2. BUG-04 (limpieza en cambio de página/documento/deshacer) + BUG-05 (se resuelve solo).
3. BUG-06 y BUG-07 (calidad de vida al dibujar; dos líneas cada uno).
4. BUG-08 + BUG-11 con el mismo helper `descartarRegistro()`.
5. BUG-09, BUG-10, BUG-13, BUG-14, BUG-15, BUG-16.
6. BUG-12 al final (cosmético, riesgo de pisar la medida que la persona está leyendo).

---

## Anexo — Cómo se reprodujo

- Servidor: `py -3.13 app.py --puerto 8791 --sin-navegador` (instancia de prueba; el `python` 3.14 del sistema no tiene `pymupdf`, por eso se usó 3.13).
- Navegador: Chrome 157 headless con `--remote-debugging-port=9333` y perfil temporal.
- Eventos: `Input.dispatchMouseEvent` (`mousePressed/mouseMoved/mouseReleased`, `clickCount` 1/2 para el doble clic) e `Input.dispatchKeyEvent` (`rawKeyDown`+`keyUp`, con `modifiers:2` para Ctrl+Z). Los eventos de puntero son confiables: `lienzo.setPointerCapture(ev.pointerId)` (`lienzo.js:350`) funciona, así que la ruta de código ejercitada es exactamente la del uso real.
- Estado leído desde la propia app: `App.ui.herramienta`, `App.pagina().objetos`, `App._historial`, `document.activeElement`, `#cursor-mm`, `#estado-lienzo`, y píxeles del canvas vía `getImageData` para el marcador de vértice.
- La única advertencia de consola registrada fue la de Chrome sobre `getImageData` sin `willReadFrequently`, originada por la propia medición del test (no por la app).
