# Editor Braille

Editor de braille y gráficos táctiles para la impresora Index Everest-D V4, con PDF de fondo para calzar cada texto sobre la tinta. Gratis, funciona sin internet y no hace falta instalar nada más.

**[Descargar Editor Braille para Windows](https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/EditorBraille-portable-2.0.1.zip)**

- Versión: **2.0.1**
- Tamaño: **49,3 MB** (51.726.590 bytes)
- SHA256: `1f2776926921c114be1b7661478c5e64318bdaad5b22297e7ea8488eaa414fb3`

> La versión, el tamaño y el SHA256 de arriba corresponden al zip generado el 19/11/2026 en `dist/`. Si volvés a empaquetar, `herramientas/empaquetar.ps1` imprime el SHA256 nuevo y `herramientas/generar_version_json.py` lo escribe en `version.json`: actualizá estos datos.

## Requisitos

- Windows 10 u 11.
- Google Chrome o Microsoft Edge (también anda con Firefox).
- Para imprimir por USB: el controlador de la Index Everest-D V4 instalado. Por red no hace falta.
- No requiere Python.

## Instalación

1. Descargá el zip y descomprimí **toda** la carpeta «Editor Braille» donde quieras (Escritorio, pendrive). No lo abras desde dentro del zip.
2. Doble clic en `Editor Braille.exe`. Se abre el navegador con el editor; no aparece ventana negra.
3. Para salir, usá el botón «Cerrar programa» del editor.

### Aviso de Windows SmartScreen

El programa no está firmado digitalmente, así que Windows puede mostrar «Windows protegió su PC». Elegí **Más información → Ejecutar de todas formas**. Podés comprobar que el archivo es el original comparando el SHA256 de arriba (en PowerShell: `Get-FileHash .\EditorBraille-portable-2.0.1.zip`).

## Cómo actualizar

- Desde el programa: pestaña **Archivo → Actualizar**. Si hay una versión nueva, pide confirmación, la descarga, verifica su huella y se reabre actualizado. Conviene guardar el proyecto antes. El perfil de impresora y la calibración no se pierden.
- A mano: descargá el zip nuevo y reemplazá la carpeta (el perfil y la calibración se guardan aparte, en `%LOCALAPPDATA%\EditorBraille`).

## Código y licencia

- Código fuente: https://github.com/chludil64-jpg/editor-coberturas-braille
- Licencia MIT, © 2026 Matias Chludil y colaboradores.
- El ejecutable incluye PyMuPDF (AGPL-3.0): quien lo redistribuya debe hacerlo con el código fuente disponible (el repositorio de arriba). También usa íconos Lucide (ISC) y Pillow (MIT-CMU).

---

## Para publicar (no pegar en la página)

### version.json

Ya publicado en https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/version.json (no cambia de dirección entre versiones; en cada versión se reemplaza su contenido). Contenido actual:

```json
{"version":"2.0.1","url":"https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/EditorBraille-portable-2.0.1.zip","sha256":"1f2776926921c114be1b7661478c5e64318bdaad5b22297e7ea8488eaa414fb3","notas":"Activa la actualización automática desde el sitio de la SCyT."}
```

- `version`: número `X.Y.Z`; el programa ofrece actualizar solo si es mayor que el instalado.
- `url`: dirección **https** directa al zip, en el **mismo dominio** que `version.json`.
- `sha256`: obligatorio; si no coincide, no se instala.
- `notas`: texto corto con las novedades (se muestra en el diálogo).

Para la próxima versión:

```
powershell -ExecutionPolicy Bypass -File herramientas\empaquetar.ps1 -UrlZip https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/EditorBraille-portable-X.Y.Z.zip -Notas "Qué cambió"
```

Eso genera el zip y `dist/version.json`; subir ambos a la carpeta de estáticos.

### Dónde está publicado

- Página de descarga: https://www.ciencia.chubut.gov.ar/app-inclusion/editor-braille/
- Zip y `version.json`: `https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/`

### Configuración de la URL

La constante `URL_ACTUALIZACIONES` de `app.py` ya apunta a `version.json` desde la versión 2.0.1. Sin recompilar, por PC: `%LOCALAPPDATA%\EditorBraille\config.json` con `{"url_actualizaciones": "https://..."}` (manda sobre la constante).

Notas técnicas: solo se aceptan direcciones https (también en redirecciones; el zip, además, debe estar en el mismo dominio que `version.json`); el `Content-Type` de `version.json` no se exige, pero el cuerpo debe ser JSON válido; `version.json` hasta 64 KB y zip hasta 300 MB; la instalación automática solo funciona en el portable (corriendo con Python, se actualiza con `git pull`). Para pruebas locales se permite `http://127.0.0.1` con la variable de entorno `EDITOR_BRAILLE_PRUEBAS=1`.
