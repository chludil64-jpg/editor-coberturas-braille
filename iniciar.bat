@echo off
rem Editor de coberturas braille: arranca el servidor local y abre el navegador.
cd /d "%~dp0"
title Editor de coberturas braille
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto sinpython
%PY% -c "import pymupdf" >nul 2>nul || goto sinpymupdf
echo Iniciando el editor braille... (no cierres esta ventana mientras lo uses)
%PY% "%~dp0app.py" %*
if errorlevel 1 goto error
goto fin
:sinpython
echo No se encontro Python 3. Instalalo desde https://www.python.org/downloads/
goto error
:sinpymupdf
echo Falta la biblioteca PyMuPDF. Instalala con:
echo     %PY% -m pip install pymupdf
goto error
:error
echo.
echo El programa no pudo iniciarse. Revisa el mensaje de arriba.
pause
:fin
