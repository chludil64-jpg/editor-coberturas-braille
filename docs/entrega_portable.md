# Entrega del portable para integrarlo a un sitio

Documento para la sesión (o persona) que va a publicar el Editor Braille en la página de descarga del sitio.

## Qué hay que publicar

Paquete listo en `dist/entrega/` (no está en git; se regenera con `herramientas/empaquetar.ps1`):

| Archivo | Para qué |
|---|---|
| `EditorBraille-portable-2.0.0.zip` | El programa (Windows 10/11, sin instalar Python). |
| `version.json.plantilla` | Lo que consulta el botón «Actualizar». Reemplazar `{URL_ZIP}` y renombrar a `version.json`. |
| `pagina_descarga.md` | Texto listo para la página (requisitos, pasos, SmartScreen, licencia). |
| `entrega_portable.md` | Este documento. |

- Versión: **2.0.0**
- Tamaño: 51.726.173 bytes (49,3 MB)
- SHA256: `88dc97d84c95452f95f37358d4a422e0ebfa8b10fdad2277555f936a8c69b546`
- Código fuente (MIT): https://github.com/chludil64-jpg/editor-coberturas-braille

## Pasos de integración en el sitio

1. Subir el zip a los estáticos del sitio con una URL **https** estable, por ejemplo `https://SITIO/descargas/editor-braille/EditorBraille-portable-2.0.0.zip`.
2. Crear `version.json` desde la plantilla, con esa URL en `url`, y publicarlo en una URL https **fija** que no cambie entre versiones, por ejemplo `https://SITIO/descargas/editor-braille/version.json`.
   - O generarlo: `python herramientas/generar_version_json.py dist/EditorBraille-portable-2.0.0.zip https://SITIO/.../EditorBraille-portable-2.0.0.zip --salida dist/version.json`
3. Crear la página de descarga con el texto de `pagina_descarga.md` (reemplazar `{URL_ZIP}`).
4. Servir `version.json` con `Content-Type: application/json`, sin redirecciones a http y de menos de 64 KB. El zip puede pesar hasta 300 MB.

## Conectar el programa con el sitio (en el repo del Editor Braille)

1. En `app.py`, poner la URL fija de `version.json` en `URL_ACTUALIZACIONES = "https://SITIO/descargas/editor-braille/version.json"`.
   - Alternativa sin recompilar, por PC: `%LOCALAPPDATA%\EditorBraille\config.json` con `{"url_actualizaciones": "https://..."}`.
2. Subir `VERSION` en `app.py` (por ejemplo `2.0.1`), volver a correr `herramientas\empaquetar.ps1 -UrlZip https://SITIO/.../EditorBraille-portable-2.0.1.zip -Notas "..."` y publicar el zip nuevo y el `version.json` nuevo.
3. En el README, reemplazar «página de descarga (próximamente…)» por el enlace real.

Importante: los portables 2.0.0 ya distribuidos no tienen la URL configurada, así que **no** se van a actualizar solos. La actualización automática funciona a partir de la primera versión que se compile con `URL_ACTUALIZACIONES` puesta. Conviene configurar la URL antes de difundir el programa.

## Cómo funciona la actualización (para soporte)

- Botón: Archivo → Programa → «Actualizar».
- Lee `version.json` (solo https), compara versiones, descarga el zip, verifica el SHA256, lo descomprime en `%LOCALAPPDATA%\EditorBraille\actualizacion\<versión>\` y un `.cmd` reemplaza los archivos y reabre el programa.
- El perfil de la impresora y la calibración (`%LOCALAPPDATA%\EditorBraille`) no se tocan.
- Si la carpeta del programa no es escribible (por ejemplo, en `C:\Program Files`), avisa y hay que actualizar a mano.

## Licencias

- Código: MIT, © 2026 Matias Chludil y colaboradores.
- El ejecutable incluye PyMuPDF (AGPL-3.0): la página de descarga debe enlazar al código fuente (el repositorio de arriba).
