# Genera la version portable (zip) y, si hay Inno Setup, el instalador.
# Uso: powershell -ExecutionPolicy Bypass -File herramientas\empaquetar.ps1
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$version = (Select-String -Path app.py -Pattern '^VERSION\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
Write-Host "Version $version"
python -m pip install --quiet pyinstaller pymupdf
if (Test-Path build) { Remove-Item build -Recurse -Force }
if (Test-Path 'dist\Editor Braille') { Remove-Item 'dist\Editor Braille' -Recurse -Force }
python -m PyInstaller --noconfirm --distpath dist --workpath build EditorBraille.spec
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller fallo' }
Copy-Item herramientas\LEEME-portable.txt 'dist\Editor Braille\LEEME-portable.txt' -Force
$zip = "dist\EditorBraille-portable-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
# zipfile (no Compress-Archive de PS 5.1, que guarda rutas con barra invertida)
python -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', 'dist', 'Editor Braille')" ($zip -replace '\.zip$','')
if ($LASTEXITCODE -ne 0) { throw 'zip fallo' }
Write-Host "Portable: $zip"
$iscc = @("$env:ProgramFiles\Inno Setup 6\iscc.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\iscc.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\iscc.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iscc) {
    & $iscc "/DVersion=$version" instalador\editor_braille.iss
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup fallo' }
} else {
    Write-Host 'Inno Setup no esta instalado: se omite el instalador (instalalo y volve a correr este script).'
}
Get-FileHash $zip -Algorithm SHA256 | Format-List
