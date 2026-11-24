# Entrega del portable para integrarlo a un sitio

Documento para la sesión (o persona) que va a publicar el Editor Braille en la página de descarga del sitio.

## Qué hay que publicar

Paquete listo en `dist/entrega/` (no está en git; se regenera con `herramientas/empaquetar.ps1`):

| Archivo | Para qué |
|---|---|
| `EditorBraille-portable-2.0.3.zip` | El programa (Windows 10/11, sin instalar Python). |
| `version.json` | Lo que consulta el botón «Actualizar». Ya trae la URL real del zip. |
| `pagina_descarga.md` | Texto listo para la página (requisitos, pasos, SmartScreen, licencia). |
| `entrega_portable.md` | Este documento. |

- Versión: **2.0.3**
- Tamaño: 51.749.814 bytes (49,3 MB)
- SHA256: `a6dab016f405a86676c9c280f48bc9f5b569a9edc11854b180a8a234e610e648`
- Código fuente (MIT): https://github.com/chludil64-jpg/editor-coberturas-braille

## Dónde se publica

- Página de descarga: https://www.ciencia.chubut.gov.ar/app-inclusion/editor-braille/
- Carpeta de estáticos: `https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/`
  - `EditorBraille-portable-2.0.3.zip`
  - `version.json` (dirección fija: `https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/version.json`)

## Pasos de integración en el sitio

1. Subir el zip y `version.json` a la carpeta de estáticos de arriba (zip y `version.json` **en el mismo dominio**, bajo `/static/`, por https).
2. Crear la página de descarga con el texto de `pagina_descarga.md` (el enlace ya apunta al zip real).
3. Servir `version.json` preferentemente con `Content-Type: application/json` (el programa tolera `text/plain` u `octet-stream`, pero exige que el cuerpo sea JSON válido), sin redirecciones a http y de menos de 64 KB. El zip puede pesar hasta 300 MB. Las redirecciones solo se siguen a https y, para el zip, dentro del mismo dominio.

## Conexión del programa con el sitio

Ya está hecha en esta versión: `URL_ACTUALIZACIONES` en `app.py` apunta a `https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/version.json`. Alternativa sin recompilar, por PC: `%LOCALAPPDATA%\EditorBraille\config.json` con `{"url_actualizaciones": "https://..."}`.

Para publicar una versión nueva: subir `VERSION` en `app.py`, correr `herramientas\empaquetar.ps1 -UrlZip https://www.ciencia.chubut.gov.ar/static/app_inclusion_uploads/2026/editor-braille/EditorBraille-portable-X.Y.Z.zip -Notas "..."` y subir el zip y el `version.json` generados.

Importante: los portables 2.0.0 ya distribuidos no tienen la URL configurada, así que **no** se actualizan solos; la actualización automática funciona a partir de la 2.0.1.

## Cómo funciona la actualización (para soporte)

- Botón: Archivo → Programa → «Actualizar».
- Lee `version.json` (solo https), compara versiones, descarga el zip, verifica el SHA256, lo descomprime en `%LOCALAPPDATA%\EditorBraille\actualizacion\<versión>\` y un `.cmd` reemplaza los archivos y reabre el programa.
- El perfil de la impresora y la calibración (`%LOCALAPPDATA%\EditorBraille`) no se tocan.
- El `.cmd` actualizador espera con `ping` y `robocopy` reintenta mientras el programa viejo termina de cerrarse; la carpeta del programa puede tener espacios. Probado el ciclo completo (detectar, descargar, verificar SHA256, reemplazar y reabrir conservando el perfil).
- Si la carpeta del programa no es escribible (por ejemplo, en `C:\Program Files`), avisa y hay que actualizar a mano.

## Licencias

- Código: MIT, © 2026 Matias Chludil y colaboradores.
- El ejecutable incluye PyMuPDF (AGPL-3.0): la página de descarga debe enlazar al código fuente (el repositorio de arriba).
