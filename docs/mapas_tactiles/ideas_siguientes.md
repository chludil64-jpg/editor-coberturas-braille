# Mapas táctiles: estado y próximas ideas (15/11/2026)

## Estado
- Modo «Mapa por capas de color» (rama dibujo-v2): separa por color y deja asignar significado y estilo. En el mapa de Chubut (PNG 797 × 550) sugirió bien costa, límites, ríos, agua y tierra. En el de Argentina (JPG 342 × 584) una capa de ríos quedó en «ignorar» por el ruido del JPG.
- Los modos anteriores («Bordes de mapa», «Regiones de color») no separan por significado: todo sale como la misma línea.
- Tamaño: un mapa con muchos límites necesita 200 mm o más de ancho para que las líneas queden a ≥ 4 mm entre sí.

## Ideas, en orden de prioridad
1. **Importar SVG por colores.** Los mapas de ubicación de Wikipedia/Wikimedia son SVG: cada trazo y relleno ya trae su color y coordenadas exactas. Tomar los paths, agruparlos por color de trazo/relleno, mostrar la misma tabla de capas y convertirlos directamente en polilíneas y polígonos (sin detección de bordes). Resultado limpio, sin cortes. Ver informe del bot REA §7.8.
2. **Trazo con imán (lazo magnético / «intelligent scissors»).** Herramienta manual: el usuario hace clic sobre el mapa de fondo y el tramo entre clics sigue el borde más fuerte (camino de costo mínimo sobre el gradiente). Se elige el estilo antes de trazar (río, límite, costa). Es lo más confiable para fotos y escaneos, y es como trabajan los transcriptores profesionales.
3. **IA opcional como ayudante.** Un modelo de visión que mire el mapa y sugiera qué es cada color, qué texto hay y qué simplificar. No dibuja (no da coordenadas precisas); solo completa la tabla de capas. Tiene costo por uso: tiene que ser opcional y avisar antes.
