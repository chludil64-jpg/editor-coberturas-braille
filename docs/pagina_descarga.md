# Editor Braille

Editor de braille y gráficos táctiles para la impresora Index Everest-D V4, con PDF de fondo para calzar cada texto sobre la tinta. Gratis, funciona sin internet y no hace falta instalar nada más.

**[Descargar Editor Braille para Windows]({URL_ZIP})**

- Versión: **2.0.0**
- Tamaño: **49,3 MB** (51.715.846 bytes)
- SHA256: `7eb72ed7129087865d7286f1be706e4933a83177ac2706b970875936e95d01f2`

> La versión, el tamaño y el SHA256 de arriba corresponden al zip generado el 18/11/2026 en `dist/`. Si volvés a empaquetar, `herramientas/empaquetar.ps1` imprime el SHA256 nuevo y `herramientas/generar_version_json.py` lo escribe en `version.json`: actualizá estos datos.

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

El programa no está firmado digitalmente, así que Windows puede mostrar «Windows protegió su PC». Elegí **Más información → Ejecutar de todas formas**. Podés comprobar que el archivo es el original comparando el SHA256 de arriba (en PowerShell: `Get-FileHash .\EditorBraille-portable-2.0.0.zip`).

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

El botón «Buscar actualizaciones» lee este archivo. Ejemplo:

```json
{"version":"2.0.0","url":"{URL_ZIP}","sha256":"7eb72ed7129087865d7286f1be706e4933a83177ac2706b970875936e95d01f2","notas":"Primera versión portable."}
```

- `version`: número `X.Y.Z`; el programa ofrece actualizar solo si es mayor que el instalado.
- `url`: dirección **https** directa al zip (reemplazá `{URL_ZIP}`).
- `sha256`: obligatorio; si no coincide, no se instala.
- `notas`: texto corto con las novedades (se muestra en el diálogo).

Se genera con:

```
python herramientas/generar_version_json.py dist/EditorBraille-portable-2.0.0.zip https://TU-SITIO/EditorBraille-portable-2.0.0.zip --notas "Qué cambió"
```

O directo al empaquetar: `powershell -ExecutionPolicy Bypass -File herramientas\empaquetar.ps1 -UrlZip https://TU-SITIO/EditorBraille-portable-2.0.0.zip -Notas "Qué cambió"`.

### Dónde subir los archivos

1. Subí el **zip** al sitio (o a una página de lanzamientos) en una dirección https estable. Ese es `{URL_ZIP}`.
2. Subí **version.json** en otra dirección https fija (por ejemplo `https://TU-SITIO/editor-braille/version.json`). Esa dirección no cambia nunca; en cada versión se reemplaza solo su contenido.
3. Pegá en esta página el contenido de arriba (título a «Licencia») con el enlace real.

### Para la próxima sesión: configurar la URL

Mientras no esté configurada, el botón avisa «No hay dirección de actualizaciones configurada». Hay dos formas:

- En el código: en `app.py`, la constante `URL_ACTUALIZACIONES = "https://TU-SITIO/editor-braille/version.json"` (se incluye en el próximo portable).
- Sin recompilar: crear `%LOCALAPPDATA%\EditorBraille\config.json` con
  `{"url_actualizaciones": "https://TU-SITIO/editor-braille/version.json"}`.
  Si existen las dos, manda el `config.json`.

Notas técnicas: solo se aceptan direcciones https; `version.json` hasta 64 KB y zip hasta 300 MB; la instalación automática solo funciona en el portable (corriendo con Python, se actualiza con `git pull`). Para pruebas locales se permite `http://127.0.0.1` con la variable de entorno `EDITOR_BRAILLE_PRUEBAS=1`.
