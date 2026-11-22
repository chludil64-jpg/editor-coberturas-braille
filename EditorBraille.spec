# -*- mode: python ; coding: utf-8 -*-
# Spec de PyInstaller (modo carpeta, sin consola). Se compila con herramientas/empaquetar.ps1.
a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[('web', 'web'), ('perfiles', 'perfiles'), ('motor/preparar_impresora.ps1', 'motor')],
    hiddenimports=['motor.actualizacion', 'motor.impresion', 'motor.instalar_impresora', 'motor.index_v4', 'motor.pdf_io', 'motor.perfil'],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'pydoc', 'test'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='Editor Braille',
    debug=False, strip=False, upx=False,
    console=False,
    icon='web/iconos/app.ico',
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='Editor Braille')
