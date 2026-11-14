# Cambios de v1-mejoras

## Archivos tocados

- `web/index.html`: menús Archivo, Exportar e Impresora con los IDs originales; opciones para crear A4 horizontal o vertical; controles de vista agrupados y texto «Sobre el PDF».
- `web/estilos.css`: paneles de menú, foco visible y agrupación de controles. Se conserva la regla para movimiento reducido.
- `web/js/principal.js`: navegación de menús por teclado y puntero; creación de páginas en blanco; mensaje inicial general.
- `web/js/grilla.js`: el aviso de zona no imprimible ubica la franja de entrada según orientación y sentido de giro. La grilla de cada página sigue usando sus pasos correspondientes.
- `web/js/lienzo.js`: dibuja la misma zona no imprimible que se usa en los avisos.
- `tests/test_index_v4.py`: casos con el perfil real para transformación y generación `.prn` de páginas A4 vertical y horizontal; PDF de prueba y PNG verticales.
- `tests/braille.test.js`: pasos de la grilla y margen de entrada en ambas orientaciones.
- `LEEME.md`: uso de menús, páginas A4 en ambas orientaciones y estado del perfil real.

## Decisiones

El valor interno `boleta` de la vista permanece para no cambiar los proyectos guardados. El margen izquierdo de 5 mm del perfil histórico representa la franja física de entrada; en el diseño vertical se muestra arriba y en el horizontal, a la izquierda. No se cambió la calibración ni el perfil. La página activa determina el tamaño y la orientación de las salidas, también cuando el PDF mezcla orientaciones.

## Verificaciones

- Se intentó ejecutar `node --test` y `python -m unittest discover -s tests` desde la raíz. Ambos ejecutables devolvieron `Access is denied` en este entorno, por lo que las suites **no pudieron completarse**.
- Se verificó la sintaxis de los nueve archivos `web/js/*.js` con `new Function`.
- Se evaluaron las funciones reales de grilla en JavaScript: A4 vertical conserva pasos 2,05 × 2,02 mm y margen superior de 5 mm; A4 horizontal usa 2,02 × 2,05 mm y margen izquierdo de 5 mm.
- Se verificó que `index.html` carga los nueve scripts y que no tiene IDs duplicados.
- `.git/HEAD` indica que sigue activa la rama `v1-mejoras`. No se hicieron commits, push ni envíos a impresoras.

## Pendiente de verificar en un entorno con ejecutables habilitados

Ejecutar las dos suites y probar manualmente en navegador la navegación por teclado y lector de pantalla, así como la descarga de PDF, PNG y `.prn` de un PDF con páginas mezcladas. No se pudo comprobar la salida física en la impresora.
