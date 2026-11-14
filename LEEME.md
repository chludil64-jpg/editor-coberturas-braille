# Editor de coberturas braille (Index Everest-D V4)

Programa local para armar la **cobertura braille en acetato** que se superpone a una boleta o plantilla de votación impresa en tinta. Cada texto en braille queda en el mismo lugar que el texto impreso, y se pueden sumar dibujos en relieve (recuadros, flechas, imágenes).

Funciona sin internet. Se usa en el navegador, pero todo corre en esta PC: el servidor escucha solo en `127.0.0.1`.

## Requisitos

- Windows con Python 3 y PyMuPDF (`python -m pip install pymupdf`). No hace falta nada más.
- Un navegador actualizado (Edge, Chrome o Firefox).

## Cómo se abre

1. Doble clic en **`iniciar.bat`**. Se abre una ventana negra (el servidor) y el navegador en `http://127.0.0.1:8765/`.
2. Para salir, usá el botón **Cerrar programa** o cerrá la ventana negra.

## Uso básico

1. En **Archivo → Abrir PDF…** se carga el documento. El lienzo toma el tamaño de cada página en mm reales, con el PDF de fondo (opacidad regulable), zoom y reglas en mm. Funcionan páginas A4 horizontales y verticales, incluso mezcladas en un mismo PDF. Desde **Archivo** también podés crear una **página A4 horizontal o vertical en blanco**, abrir un proyecto o un `.ibe`, guardar el proyecto y cerrar el programa.
2. **Textos del PDF**: lista de los textos que se detectaron, con su posición. Con «Agrupar renglones vecinos» los renglones de un mismo bloque (por ejemplo «PARTIDO CHUBUT / SOMOS TODOS») van juntos. Marcá los que querés y tocá **Crear cuadros con los elegidos**. Si el PDF es un escaneo sin texto, usá **Nuevo cuadro vacío**.
3. **Cuadros braille**: cada cuadro se transcribe a braille español grado 1 (integral). Se puede editar el texto (para abreviar), cambiar la alineación respecto de la tinta (centro, izquierda, derecha o libre), partir en renglones según un ancho máximo, duplicar y borrar.
   - Mayúsculas: signo 46 antes de la letra; palabra entera en mayúsculas con 46-46 (también «signo en cada letra» o «todo mayúsculas sin signo»).
   - Números: signo 3456; punto de miles (3) y coma decimal (2) siguen dentro del número; letra a-j después de un número lleva el punto 5.
   - Acentuadas, ü, ñ y puntuación española (¿? ¡! . , ; : - ( ) comillas). La barra `/` se escribe 456-256 (conviene confirmarlo con la normativa vigente). Los caracteres sin transcripción se avisan y se omiten.
4. **Mover**: arrastrar con el mouse, o con el lienzo enfocado usar las flechas (0,5 mm; Mayúscula + flecha = 5 mm). **Av Pág / Re Pág** pasan de un elemento al siguiente, **Suprimir** borra, **Escape** suelta. **Ctrl+Z / Ctrl+Y** deshacen y rehacen; **Ctrl+S** guarda el proyecto.
5. **Avisos** (panel derecho): braille más ancho que el texto impreso, puntos fuera de la hoja o en la zona no imprimible, cuadros que se chocan, puntos a menos de la separación mínima (2 mm por defecto) y caracteres sin transcribir.
6. **Dibujo en relieve**: herramientas punto, línea, rectángulo, elipse, mano alzada y goma (los dibujos se convierten en puntos cada «Paso» mm, 2 mm por defecto). Para teclado: «Agregar forma por coordenadas».
   - **Importar imagen…**: PNG o JPG a puntos (umbral, contornos o contorno con relleno raleado), con ancho, posición y paso.
   - **Calcar vectores del PDF…**: pasa las líneas y recuadros del PDF (casilleros de marcado) a líneas de puntos.
   - **Ralear puntos**: quita puntos de dibujo a menos de la separación mínima (nunca toca el braille).
   - **Separar el dibujo del braille**: omite los puntos de dibujo que quedan a menos de X mm de un cuadro braille.
7. **Vista**: «Sobre el PDF» o «Solo puntos». En la barra del lienzo, los controles están agrupados por página, zoom y fondo. La página activa determina la orientación de cada salida.

## Salidas

Todo sale de **una sola lista de puntos en mm**: la que se ve en pantalla es la misma que va al PDF de prueba y al archivo de impresión.

- En el menú **Exportar**: **PDF de prueba 1:1**, **PNG**, **Archivo .prn para la Everest** y **Archivo .ibe (Index V5)**. El `.prn` usa la grilla calibrada de la Everest-D V4; el `.ibe` usa punto libre (ver detalles abajo).
- **PDF de prueba 1:1**: el diseño original con los puntos encima (en magenta). Imprimilo en tinta **al 100 % / tamaño real** (sin «ajustar a la página») y superponelo al documento para ver el calce antes de gastar acetato. Trae una barra de 100 mm para controlar la escala de la impresora común.
- **PNG**: la matriz de puntos a 10 píxeles por mm.
- **Archivo .prn**: modo gráfico por grilla calibrada para la Everest-D V4 (ver abajo).
- **Imprimir…** queda como botón directo. Envía a la Index por el spooler de Windows (modo RAW) o por red (IP y puerto 9100). Siempre pide marcar la casilla de confirmación antes de enviar. **Perfil de impresora…** y **Calibración…** están en el menú **Impresora**.
- **Guardar / Abrir proyecto**: archivo `.braille.json` con el PDF incluido, los cuadros, los dibujos y el perfil.
- **Abrir .ibe…**: abre un archivo de Index (por ejemplo las muestras de `ejemplos/ibe/`) en una página nueva para verlo.

## Formato .ibe (punto libre)

Texto plano latin-1, tal como en las muestras gráficas de Index (`ejemplos/ibe/`):

```
ESC D DP2,LS50,TM0,BI0,CH46,LP27;
ESC F OR0.00:0.00,WX297.00,HY210.00;
x:y        <- un punto por línea, en mm con 2 decimales, origen arriba a la izquierda
...
x:y;
```

**Lo que no está confirmado** (no hay documentación pública de Index; se copió de las muestras):

- `DP`: probablemente faz simple/doble (DP2 en la muestra de Everest, DP1 en la de Basic, DP4 en la de BrailleBox).
- `CH` y `LP`: parecen caracteres por línea y líneas por página. Valores por defecto: hoja apaisada CH46 LP27 (muestra Basic), hoja parada CH34 LP29 (muestra Everest).
- `OR`: parece el origen o margen (OR3.00:0.00 en la muestra de Everest parada; 0 en las demás).
- Las muestras de Everest y BrailleBox **no cierran con `;`** al final; las de Basic y geometry sí. El programa lo cierra por defecto (se puede quitar en el perfil).
- Fin de línea: LF (como Everest) o CR LF (como geometry).

Todos esos valores se cambian en **Perfil de impresora…** (`perfiles/everest_v4.json`). Recomendación para la primera prueba: mandar primero `ejemplos/ibe/_everest_functions_graphs.ibe` tal cual, y recién después un archivo hecho con este programa.

## Modo grilla (`.prn`)

La Everest V4 usa el modo gráfico del driver libre de OpenPrinting (cups-filters) para Index V4:
`ESC D TM0,BI0,CH<bloques por línea>,LP<líneas de bloques>,LS50,BT0;` + `ESC BEL` + por cada bloque de 2×4 puntos dos bytes (`0x40 | d1+2·d2+4·d3+8·d7` y `0x40 | d4+2·d5+4·d6+8·d8`) + CR al final de cada línea + `ESC ACK` + `SUB`. Los puntos se ajustan a una grilla (2,0 mm por defecto, configurable): la ubicación queda a pasos de 2 mm.

## Calibración

1. **Calibración…** → **Imprimir la hoja…** (o **Descargar hoja .ibe**). Imprimila en **papel**.
2. Con la hoja como sale de la impresora (la palabra «calibración» en braille arriba a la izquierda), medí: el centro de la cruz superior izquierda desde el borde izquierdo y desde el superior (deberían ser 20 mm), la distancia entre las dos cruces de arriba y entre las dos de la izquierda.
3. **Calcular y guardar en el perfil**: corrige desplazamiento X/Y y escala X/Y. Volvé a imprimir la hoja para comprobar.
4. Después: boleta en papel, superponer, y recién entonces acetato.

En el perfil también se elige cómo entra la hoja: **apaisada** (A4 horizontal, 297 mm de ancho) o **parada**. Con el perfil real, la hoja entra parada: una página horizontal se gira 90° en sentido horario al imprimir; una vertical conserva su orientación. El espejo se aplica si está configurado. Estos ajustes se aplican solo al archivo de impresión; la pantalla y el PDF de prueba muestran el diseño tal cual va sobre el PDF. La franja de entrada de unos 5 mm aparece a la izquierda de la página horizontal y arriba de la vertical. La hoja de calibración se arma directamente en el sentido de la impresora (solo se le aplica escala y desplazamiento).

Medidas: hoja **A4 como máximo** (297 × 210 mm horizontal o 210 × 297 mm vertical). Las páginas de PDF mayores que A4 muestran un aviso. La Everest-D V4 admite hojas de 130 a 297 mm de ancho; papel de 120 a 180 g/m². El acetato hay que probarlo.

## Archivos

- `iniciar.bat` — arranca todo.
- `app.py` — servidor local y API.
- `motor/` — `pdf_io.py` (textos, fondo, vectores, PDF de prueba, PNG), `index_v4.py` (codificadores y lector .ibe), `perfil.py` (perfil y transformación a la hoja), `impresion.py` (RAW por `winspool.drv` y red).
- `web/` — interfaz (HTML, CSS y JS sin frameworks).
- `perfiles/everest_v4.json` — perfil de la impresora.
- `ejemplos/` — PDF de Gaiman y muestras `.ibe` de Index.
- `tests/` — pruebas.

## Pruebas

Desde la carpeta del proyecto:

```
python -m unittest discover -s tests -v
node --test
```

## Límites conocidos

- El perfil real de la Everest-D V4 usa la grilla `.prn` calibrada. La salida `.ibe` de punto libre queda disponible para compatibilidad con equipos que la acepten.
- Si el firmware de la impresora es viejo, puede hacer falta actualizarlo.
- El braille ocupa mucho más que la tinta (por ejemplo «LISTA 1005» ocupa 74,5 mm contra 38 mm impresos): conviene abreviar o partir en renglones.
- Las exportaciones e impresión son de la página que se está viendo.

## Disposición braille (sin el PDF)

- **Archivo → Exportar disposición braille…** guarda solo los cuadros braille (texto, posición, alineación y opciones) y los dibujos de cada página, en un archivo liviano `.disposicion.json`, sin el PDF.
- **Archivo → Importar disposición braille…** los vuelve a poner en el documento abierto. Útil cuando cambia el PDF (por ejemplo, una versión corregida de la plantilla): abrí el PDF nuevo e importá la disposición. Si ya hay cuadros, pregunta si reemplazarlos o agregarlos. Se puede deshacer con Ctrl+Z.
- Las páginas se emparejan por número. Si una página mide distinto, avisa para revisar que los cuadros caigan bien.
