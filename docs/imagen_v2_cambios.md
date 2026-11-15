# Imagen editable v2

## Archivos tocados

- `web/js/bordes.js`: Canny por canal RGB con supresión de no máximos e histéresis; regiones de color por cuantización y eliminación de áreas chicas. Conserva líneas oscuras y limpieza de detalles.
- `web/js/vectorizar.js`: trazado del esqueleto por cadenas, simplificación Douglas-Peucker, suavizado Chaikin y largo mínimo.
- `web/js/imagen_worker.js`, `web/js/imagen.js`: cálculo en Web Worker local, comparación original/resultado, receta y original reducido para reconversión.
- `web/js/objetos.js`: objeto `imagen` con polilíneas en mm, remuestreo al paso de la grilla, volteos y relleno de contornos cerrados.
- `web/js/lienzo.js`, `web/js/editor_objetos.js`: ocho manijas, rotación, grupo, propiedades y atajos de teclado.
- `web/index.html`, `web/estilos.css`: controles y vista previa accesibles.
- `tests/imagen_v2.test.js`: geometría, detección, escalado y persistencia.
- `LEEME.md`: instrucciones breves.

## Decisiones

`Grilla.calcularPagina` sigue siendo la única fuente de puntos. El objeto `imagen` guarda la geometría vectorial en coordenadas locales de mm, su caja y la receta; `Objetos.objetoAPuntos` la transforma y muestrea al paso de la grilla al calcular la página. Los proyectos y disposiciones ya serializaban la lista completa de objetos, así que no hizo falta cambiar sus formatos. Las imágenes de proyectos anteriores siguen como puntos fijos. El relleno de regiones cerradas usa los patrones táctiles existentes. El modo «Regiones de color» usa RGB para separar colores incluso con brillo similar; su calidad depende de la paleta y de la limpieza elegidas.

## Verificación

- Las 42 pruebas JavaScript (35 anteriores y 7 nuevas) pasaron en V8 con un adaptador de `node:test` y `assert`. Los 18 archivos JS de `web/js` y `tests` pasaron comprobación de sintaxis con `new Function`.
- Se comprobó que todos los scripts declarados en `index.html` existen y que no hay IDs repetidos.
- `node --test` no pudo ejecutarse porque `node` no está disponible en PATH. `python -m unittest discover -s tests` no pudo ejecutarse: el ejecutable de Python está fuera de la raíz autorizada y el entorno respondió «Access is denied».
- No se verificó la interfaz en navegador, con lector de pantalla ni la calidad física de una impresión. No se envió nada a una impresora.
