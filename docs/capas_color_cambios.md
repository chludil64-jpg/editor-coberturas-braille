# Panel de capas por color

## Archivos tocados

- `web/js/capas_color.js`: reducción por media de bloque, Lab, k-medias, fusión de centros, mediciones morfológicas, sugerencias de rol, polígonos de contorno y división de trazos por rectitud.
- `web/js/imagen_worker.js`: análisis del mapa y progreso fuera del hilo de la interfaz.
- `web/js/imagen.js`: tabla de capas, asignación de significado y estilo, miniaturas aisladas, vista previa de puntos, separación de rectas y curvas, creación de grupo y reapertura de receta.
- `web/js/objetos.js`: puntos táctiles de capas de mapa, con texturas y remuestreo de trayectos al transformar.
- `web/index.html`, `web/estilos.css`: controles y presentación accesible.
- `tests/capas_color.test.js`: pruebas sintéticas de color, geometría, clasificación, agua, texto, división y escala.
- `LEEME.md`: instrucciones de uso.

## Decisiones

La clasificación es una sugerencia; el docente confirma significado y estilo. Los clusters menores al 0,3 % se sugieren para ignorar y se conservan en la tabla. El prior HSV de agua se aplica solamente a áreas. Texto e ignorar no crean puntos. Los objetos de área guardan polígonos de contorno simplificados y una máscara de corridas por fila para conservar huecos y obtener la textura exacta al escalar y rotar; el contorno no se dibuja de forma predeterminada. Una capa de línea puede separarse en límites rectos, ríos curvos y trazos para revisar. Cada objeto conserva la imagen reducida y la receta, y todos comparten un identificador de grupo. `Grilla.calcularPagina` sigue siendo el único cálculo final de puntos.

## Verificación

- `node --test` y `python -m unittest discover -s tests` no se pudieron ejecutar: `node` y `python` no están disponibles en PATH en esta sesión.
- Se verificó sintaxis JavaScript con `new Function` y se ejecutaron las pruebas Node mediante un adaptador V8 local: **51 pasaron, 0 fallaron**. El adaptador reproduce las aserciones usadas, pero no sustituye una ejecución con Node. También se comprobó que no hay IDs HTML duplicados ni scripts faltantes, y que el trazado de polígonos cierra un área sintética.
- No se pudo verificar `ejemplos/mapas/chubut.png` mediante un script Node ni el flujo en navegador con lector de pantalla. No se probó la legibilidad táctil impresa y no se envió nada a una impresora.

## Ajustes posteriores (probados con mapas reales de Chubut y Argentina)

- Resolución de análisis: de 600 a 1400 px de lado mayor (los ríos de 1 px quedaban cortados en fragmentos y se clasificaban como ruido).
- Líneas azules: se sugieren como «río» (punteada), o «costa» (continua) si el azul es fuerte y el trazo largo. Nuevo significado «costa».
- Corte de grosor para líneas: de 1,5 a 2,2 mm; líneas finas dudosas con trazos ≥ 5 mm se sugieren como «límite» en vez de «ignorar».
- Resultado en Chubut: costa, límite provincial, límites departamentales, ríos, agua y tierra sugeridos correctamente. En el mapa chico de Argentina (JPG 342 × 584) una capa celeste de ríos queda en «ignorar» por el ruido del JPG y hay que asignarla a mano.
