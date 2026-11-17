## Verificación previa

Levanté el servidor en el puerto 8791 y probé el comportamiento real (no solo leí el código):

- `Host: evil.example` → **403**; `POST` sin `X-Editor-Braille` → **403**; `OPTIONS` → **501** sin cabeceras CORS.
- Traversal (`/../app.py`, `/..%2fapp.py`, `/%2e%2e/app.py`, `/js/../../app.py`) → **404** en las cuatro.
- Hoja de **1200 × 1200 mm** → se codificó igual (`CH281 LP142`), sin freno.
- Destino de red con **puerto -1** → el servidor intentó abrir el socket (400 por error de red, no por validación).
- Cabeceras de `/`: solo `Server`, `Date`, `Content-Type`, `Content-Length`, `Cache-Control`, `nosniff`. **Sin CSP, sin X-Frame-Options.**

Aviso: la prueba de `/api/imprimir` regeneró `ultimo_trabajo.prn` (152 bytes, está en `.gitignore`, se sobrescribe en cada envío). `git diff` está limpio: no toqué ningún archivo versionado. El servidor de prueba quedó apagado.

---

# Informe

## Interfaz y accesibilidad

**ALTA**

- **El lienzo no recibe las flechas con lector de pantalla.** `web/index.html:168` declara `role="img"` sobre un `<canvas tabindex="0">` que es interactivo. Con NVDA/JAWS, un `role="img"` no activa el modo formulario: las flechas se las come el modo lectura y el movimiento por teclado no funciona. Propuesta: `role="application"` + `aria-roledescription="lienzo de dibujo"` (con la lista de elementos como salida siempre disponible), o mejor, agregar en «Propiedades» botones de 1 mm / 5 mm por eje para cuadros y objetos y dejar el canvas como atajo opcional.
- **Cada mensaje se anuncia dos veces.** `web/js/proyecto.js:109` (`anunciar`) escribe el mismo texto en `#anuncio` (`aria-live="assertive" role="status"`, `index.html:269`) y en `#estado-lienzo` (`aria-live="polite"`, `index.html:172`). Al mover con flechas, el docente oye la posición repetida. Propuesta: una sola región viva; `#anuncio` solo para errores, `#estado-lienzo` con el texto normal. Corregir además el `role="status"` (implica *polite*) que contradice `assertive`.
- **La impresora queda preseleccionada aunque no sea la Index.** `web/js/principal.js:129` busca `impresora_windows` o un nombre con `index|everest|braille`; si no hay coincidencia, el `<select>` se queda en la **primera impresora del sistema**. Con la casilla marcada, un envío RAW a una láser de oficina imprime basura y gasta papel. Propuesta: opción vacía «Elegí la impresora», `Enviar` deshabilitado hasta elegir, y aviso explícito si el nombre elegido no parece braille.
- **Deshacer guarda las imágenes de referencia dentro de cada snapshot.** `web/js/proyecto.js:56` hace `JSON.stringify(this.doc)` hasta 150 veces; `web/js/imagen.js:6` mete el PNG como data URL en el objeto `referencia`. Una foto de 4 MB ⇒ ~5 MB por paso ⇒ cientos de MB y tirones al arrastrar. Propuesta: excluir `src` de los snapshots (guardar imágenes por id en un mapa aparte) o limitar el historial por bytes, no por cantidad.
- **Los avisos se recalculan en cada cambio, incluso por tecla.** `web/js/principal.js:434` llama `mostrarAvisos()` con cualquier motivo distinto de `'arrastre'`, y `web/js/grilla.js:505` recorre todos los puntos (índice por rejilla, pares de cuadros, márgenes). Al tipear en `#cuadro-texto` (`App.cambio('texto')`) se recalcula todo. En páginas con decenas de miles de puntos se nota. Propuesta: debounce de 200–300 ms y saltear el cálculo completo mientras el foco esté en el textarea.

**MEDIA**

- **El primer paso del flujo está plegado.** `web/js/interfaz.js:146` deja «Textos del PDF» cerrado por defecto, y `interfaz.js:139-155` recuerda el estado en `localStorage`. Si la sección quedó cerrada alguna vez, la lista de textos —y la de cuadros— desaparece sin ninguna pista. Propuesta: no persistir el estado de las secciones esenciales, o dejar un resumen «3 secciones plegadas» con botón.
- **Guardar es descargar.** `web/js/proyecto.js:177` y `principal.js:451` (Ctrl+S) generan una descarga: cada guardado crea `proyecto (1).braille.json`, `(2)`, etc. en Descargas. No hay autoguardado ni «recientes». Propuesta: `showSaveFilePicker()` (Chrome/Edge, que es lo que usa) para fijar el archivo, más autoguardado a `localStorage` con recuperación al abrir si la pestaña se cerró.
- **La vista braille en Unicode no dice nada a un lector.** `web/js/cuadros.js:203` escribe `calc.unicode` (rango U+2800), que los lectores leen como silencio o basura. Propuesta: `aria-label` con la descripción textual («8 celdas, 2 renglones: "lista"») y, opcionalmente, puntos por celda (`a: 1`, `b: 1,2`).
- **Atajos de una letra activos dentro de los diálogos.** `web/js/cinta.js:188` solo excluye `INPUT/TEXTAREA/SELECT`: con un diálogo abierto, apretar `l` o `v` cambia la herramienta del fondo. Propuesta: salir si `document.querySelector('dialog[open]')` o si el foco está en un `dialog`.
- **«Cerrar programa» mata el servidor sin confirmar** si no hay cambios (`principal.js:364`): la pestaña queda muerta y hay que volver a `iniciar.bat`. Propuesta: confirmar siempre, o dejar el servidor vivo y solo cerrar la pestaña.
- **Faltan atajos de trabajo:** no hay Ctrl+O (abrir PDF), Ctrl+P (imprimir) ni pantalla de ayuda de teclas; `aria-keyshortcuts` solo está en Deshacer/Rehacer (`index.html:57`). La cinta obliga a recorrer 6 pestañas para llegar a Imprimir.
- **Texto chico para datos importantes.** Las posiciones, «ya tiene cuadro» y los conteos van en `<small>` (~12 px, `web/estilos.css:163`) y los rótulos de grupo en `.75rem` (`estilos.css:253`). Propuesta: subir a `0.9rem` y ofrecer un control de tamaño de letra (el zoom del navegador ya reordena bien a una columna por `estilos.css:218`).

**BAJA**

- Tabla de capas SVG sin `scope="col"` y con miniaturas `canvas` cuyo `aria-label` es «Miniatura de capa N» (`index.html:488`, `imagen.js:10`): aporta cero a un usuario ciego; el dato útil (color, cantidad) ya está en texto.
- El zoom no conserva el punto bajo el cursor ni tiene «encajar selección» (`lienzo.js:378-380`); con 600 % máximo no se puede revisar un detalle fino.
- Buenas prácticas ya presentes y a conservar: enlaces «Saltar a…», `:focus-visible` de 3 px con halo, `prefers-reduced-motion`, tema oscuro por `prefers-color-scheme`, avisos con «Ir al elemento», y edición de braille **sin** el lienzo (lista + X/Y + ancho máximo), que es la alternativa real para quien no usa mouse.

## Seguridad

Contexto: app local, `127.0.0.1`, un solo usuario. Las tres defensas contra ataques web ya están y funcionan (bind loopback, validación de `Host`, cabecera propia que fuerza preflight CORS): **DNS rebinding y CSRF están cubiertos** — lo verifiqué, no lo supongo. Lo que sigue son huecos reales frente a ese modelo.

**ALTA**

- **No hay tope de tamaño de hoja en el servidor.** `app.py:66` (`generar_archivo`) codifica lo que llegue; el aviso «supera A4» vive solo en el navegador (`grilla.js:513`). La memoria escala con `ancho·alto/(paso_x·paso_y·4)`: A4 ≈ 62 KB, 1200 × 1200 mm ≈ 86 KB (probado, pasó), 10 × 10 m ≈ 6 GB. Un `.braille.json` corrupto o un PDF con página desmesurada cuelga la máquina. Propuesta: en `generar_archivo`, rechazar con 400 si `max(lado) > 297+2` o `min(lado) > 210+2`, y limitar la lista de puntos (p. ej. 200 000).
- **Se puede embeber la app en un iframe ajeno (clickjacking).** `_responder` (`app.py:103-116`) no manda `X-Frame-Options` ni CSP (confirmado en las cabeceras reales). Una página maliciosa puede superponer el diálogo de impresión y que el clic del docente caiga en «Confirmo» + «Enviar». Riesgo real: trabajo enviado sin querer, acetato y papel perdidos. Propuesta: `X-Frame-Options: DENY` + `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; object-src 'none'` en `_responder`.
- **El destino de impresión por red no se valida.** `app.py:254-260` toma `ip` y `puerto` del cuerpo y ejecuta `socket.create_connection`: es una escritura TCP arbitraria a cualquier host:puerto (probado con puerto `-1`). Hoy la barrera es la cabecera CSRF; si alguna vez se sirve algo más en ese origen, el primitivo ya está. Propuesta: permitir solo IP privada/loopback y puerto 9100, o solo las IP ya guardadas en el perfil.
- **PDF no confiable se parsea dentro del proceso.** `app.py:191-196` acepta cualquier cosa que empiece con `%PDF` hasta 80 MB y `motor/pdf_io.py:16` llama `pymupdf.open` (MuPDF, C). Un PDF armado puede agotar memoria o aprovechar un CVE del parser con los privilegios del docente. También entra por `.braille.json` con PDF embebido (`proyecto.js:196`). En su flujo (PDF del organismo electoral) la probabilidad es baja, pero es el punto más caro si falla. Propuesta: tope de páginas y de MB, `pip install -U pymupdf` como rutina, y a mediano plazo parsear en un subproceso con límite de memoria.
- **Los PDFs quedan enteros en RAM.** `app.py:32-46` guarda hasta 6 documentos con sus bytes: con el máximo de 80 MB son ~480 MB retenidos. Propuesta: bajar a 2 y no guardar `datos`, solo el `Document` (ya tiene el stream adentro) o volcar a temporales con borrado.

**MEDIA**

- **Los 500 devuelven el texto de la excepción**: `app.py:165` y `app.py:235` (`f"Error interno: {e}"`) filtran rutas y detalles internos al navegador. En local es cosmético, pero conviene mensaje genérico + traza a la consola.
- **El perfil no se valida del lado del servidor.** `app.py:197` acepta el JSON completo y `motor/perfil.py:73-80` lo escribe tal cual: `grilla.paso_x_mm = 0` produce `ZeroDivisionError` → 500, y valores absurdos generan archivos enormes. Propuesta: validar rangos en `perfil.guardar` (pasos > 0,5 mm, escalas 0,5–2, copias 1–50).
- **Service worker**: `web/sw.js:3-9` usa `CACHE = "editor-braille-v1"` fijo y `addAll` sin versión. El *network-first* evita servir JS viejo, pero si el servidor está apagado la app instalada arranca desde caché y muestra «No se pudo leer el perfil de impresora» en lugar de «el programa no está abierto». Propuesta: versión derivada del manifiesto, y un chequeo de `/api/perfil` al arrancar que, si falla, muestre una pantalla clara con «abrí `iniciar.bat`».
- **`ultimo_trabajo.prn` se escribe en la carpeta del proyecto**, que vive en OneDrive (`app.py:247-252`). El último trabajo —y los `.braille.json` con el PDF embebido en Descargas— se sincronizan a la nube. Para material electoral conviene: escribir esa copia en `%TEMP%` y borrarla al cerrar, y decirlo en el LEEME.
- **Sin autenticación**: cualquier proceso o cuenta local puede listar impresoras, leer el perfil, imprimir o apagar el servidor (`/api/apagar`). En una PC compartida del colegio, un token aleatorio generado por `iniciar.bat` y exigido en la cabecera lo cierra sin molestar al docente.
- **`_leer_cuerpo` confía en `Content-Length`** (`app.py:121-125`): si falta (petición *chunked*) lee 0 bytes y el PDF se rechaza; si es negativo o no numérico, revienta en un 500. Validar `0 <= largo <= MAX_SUBIDA` antes de leer.

**BAJA**

- `_estatico` (`app.py:170-172`) resiste traversal en las cuatro variantes probadas, pero sirve **cualquier** archivo bajo `web/` con su MIME: si alguien deja un `.svg` o `.html` ahí, se ejecuta en el mismo origen que la API. Propuesta: allowlist de extensiones.
- `ya_esta_abierto` (`app.py:306-313`) da por buena cualquier respuesta que contenga «braille» en los primeros 4000 bytes: un falso positivo deja el programa sin arrancar (y el puerto alternativo 8778 rompe la PWA instalada, cuyo `start_url` es `./`).
- `/api/pdf/<id>/pagina/<n>.png` y `/vectores/<n>` hacen `int(...)` sin validar (`app.py:150-157`): índice fuera de rango o `?dpi=abc` → 500 con detalle. Devolver 404/400 con mensaje propio.
- No se mira `Origin` ni `Sec-Fetch-Site` en GET: defensa en profundidad barata (una línea), aunque los endpoints de lectura no cambian estado.
- Ya está bien y conviene no tocarlo: `allow_reuse_address = False` con `SO_EXCLUSIVEADDRUSE` (`app.py:274-282`), validación del nombre de impresora contra `EnumPrintersW` antes de enviar (`app.py:263`), `confirmado is not True` obligatorio para imprimir (`app.py:238`), `nosniff` y `no-store` en todas las respuestas, y `MAX_SUBIDA` como techo único.
