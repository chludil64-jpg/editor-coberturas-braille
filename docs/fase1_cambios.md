# Fase 1: editor de gráficos táctiles

## Archivos tocados

- `web/js/objetos.js`: modelo puro de objetos, transformaciones, cajas, ciclos táctiles, rellenos y migración de trazos.
- `web/js/grilla.js`: generación final de puntos de objetos y avisos de legibilidad.
- `web/js/proyecto.js`: objetos por página, selección e importación de proyectos anteriores.
- `web/js/editor_objetos.js`: lista textual por capas, propiedades, selección y operaciones.
- `web/js/lienzo.js`, `web/js/dibujo.js`: creación y edición en el lienzo, importación como puntos fijos y goma.
- `web/js/principal.js`: navegación a avisos, resumen previo a impresión y apertura de IBE como puntos fijos.
- `web/index.html`, `web/estilos.css`: paneles «Páginas y elementos», «Crear», «Propiedades» y pie «Avisos».
- `tests/objetos.test.js`: pruebas de ciclos, formas, rellenos, transformaciones, migración, grilla y verificador.
- `LEEME.md`: instrucciones breves de la fase 1.

## Decisiones

La geometría se guarda en mm y se convierte a puntos solo en `Grilla.calcularPagina`. Los puntos de imágenes, calcos, IBE y proyectos viejos son objetos de tipo `puntos`, sin edición de forma. El perfil con codificador `grilla` ajusta la matriz final. Los ciclos de línea y patrones de relleno son tablas ajustables tras probar muestras impresas. Las muestras visuales usan milímetros CSS; la escala física depende de la pantalla y requiere calibración. Los avisos informan y no impiden imprimir. La lista de elementos es la alternativa textual al lienzo.

## Comprobación

Los 22 tests JavaScript existentes y los 8 nuevos pasaron ejecutados en el motor V8 de la sesión con un adaptador para `node:test` y `assert` (30/30). Los 12 archivos `web/js/*.js` pasaron una comprobación de sintaxis con `new Function` en V8. No se pudo ejecutar `node --test` ni `python -m unittest discover -s tests`: los ejecutables instalados están fuera de la raíz autorizada y el entorno respondió «Access is denied». Tampoco se verificó el comportamiento en navegador, con lector de pantalla ni en una impresión física. No se envió ningún trabajo a la impresora.
