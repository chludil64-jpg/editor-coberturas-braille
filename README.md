# Editor Braille

Editor de braille y gráficos táctiles para la impresora **Index Everest-D V4**, con un PDF (o una imagen) de fondo para que cada texto braille quede justo sobre el texto impreso. Funciona sin internet: corre en tu PC y se usa desde el navegador.

Manual de uso completo: [LEEME.md](LEEME.md).

## Qué hace

- Abre un PDF (A4 horizontal o vertical) y detecta sus textos para transcribirlos a braille español grado 1.
- Cuadros braille editables, con alineación respecto de la tinta, mayúsculas, números y puntuación.
- Dibujo en relieve: líneas, polígonos, elipses, mano alzada, lazo magnético sobre una referencia, importación de SVG y calco de vectores del PDF.
- Avisos de legibilidad táctil (separación mínima, zona no imprimible, choques).
- Salidas: PDF de prueba 1:1, PNG, `.prn` (grilla calibrada) y `.ibe`; impresión directa por Windows o por red.
- Proyectos guardables, deshacer/rehacer ilimitado, atajos de teclado y diseño pensado para lector de pantalla.
- Botón **Actualizar** para buscar versiones nuevas.

## Descargar (Windows)

Versión portable, sin instalar Python: [página de descarga](https://www.ciencia.chubut.gov.ar/app-inclusion/editor-braille/) (también se puede armar con `herramientas/empaquetar.ps1`).
Descomprimí toda la carpeta y abrí `Editor Braille.exe`. Si Windows SmartScreen avisa: «Más información» → «Ejecutar de todas formas» (el programa no está firmado).

## Requisitos

- Windows 10 u 11 (la impresión usa el spooler de Windows; el resto funciona en cualquier sistema con Python).
- Python 3.10 o más nuevo, solo para ejecutar desde el código.
- Edge, Chrome o Firefox actualizado.

## Ejecutar desde el código

```
pip install pymupdf pillow
python app.py            # abre http://127.0.0.1:8777/
```

En Windows también sirve `iniciar.bat`. Opciones: `--puerto N`, `--sin-navegador`.

## Estructura

- `app.py`: servidor local (solo `127.0.0.1`) y API JSON.
- `motor/`: PDF (`pdf_io.py`), codificadores y lector `.ibe` (`index_v4.py`), perfil (`perfil.py`), impresión (`impresion.py`), actualizaciones (`actualizacion.py`).
- `web/`: interfaz en HTML/CSS/JS sin frameworks.
- `perfiles/everest_v4.json`: calibración de la impresora (grilla 2,05 × 2,02 mm).
- `tests/`: pruebas, con muestras sintéticas en `tests/fixtures/`.
- `herramientas/`: empaquetado y utilidades. `instalador/`: script de Inno Setup. `docs/`: investigación y notas.

## Pruebas

```
node --test tests/*.test.js
python tests/test_index_v4.py
python tests/test_seguridad.py
python tests/test_actualizacion.py
```

## Armar el portable

```
powershell -ExecutionPolicy Bypass -File herramientas\empaquetar.ps1
```

Genera `dist\EditorBraille-portable-<versión>.zip` con PyInstaller. Con `-UrlZip https://.../archivo.zip` también crea `dist\version.json` para las actualizaciones (ver [docs/pagina_descarga.md](docs/pagina_descarga.md)).

## Protocolo de la impresora

La Everest-D V4 se maneja con modo gráfico por grilla (`ESC BEL`, CR LF por fila, CH y LP automáticos). **No modifiques `motor/index_v4.py` sin probarlo en la impresora real**: un cambio mínimo puede desplazar los puntos o dar error 202.

## Contribuir

1. Abrí un issue contándonos el problema o la idea.
2. Hacé un fork, trabajá en una rama y corré las cuatro pruebas de arriba antes de abrir el pull request.
3. Mantené la interfaz accesible (teclado, lector de pantalla, textos de al menos 13 px) y en español rioplatense.
4. No subas documentos de terceros (boletas, muestras con copyright): usá material propio o sintético.

## Autoría

Creado por **Matias Chludil** ([@chludil64-jpg](https://github.com/chludil64-jpg)), con asistencia de herramientas de IA. Las contribuciones son bienvenidas.

## Licencia

Código bajo licencia [MIT](LICENSE), © 2026 Matias Chludil y colaboradores.

Componentes de terceros:

- **Lucide** (íconos, ISC): `web/iconos/LICENSE-lucide.txt`.
- **PyMuPDF** (AGPL-3.0): el ejecutable portable lo incluye, por lo que **distribuir el `.exe` queda sujeto a la AGPL-3.0**. Quien redistribuya el `.exe` debería hacerlo con el código fuente disponible, que es este repositorio.
- **Pillow** (MIT-CMU / HPND).
