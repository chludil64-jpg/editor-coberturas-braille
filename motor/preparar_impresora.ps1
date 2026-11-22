<#
  preparar_impresora.ps1  (Editor Braille)
  Crea (si hace falta) una cola de impresora para una Index braille por USB, usando el
  controlador que ya trae Windows ("Generic / Text Only"). Se ejecuta ELEVADO (administrador).

  Solo acepta dos parametros, ambos validados; el nombre de la cola y el controlador son fijos.
  No ejecuta nada que venga de afuera. Deja el resultado en un JSON (el programa lo lee).
#>
param(
  [Parameter(Mandatory = $true)][string]$Puerto,
  [Parameter(Mandatory = $true)][string]$Resultado
)
$ErrorActionPreference = 'Stop'
$NombreCola = 'Braille Index (Editor Braille)'
$Controlador = 'Generic / Text Only'

function Guardar-Resultado($ok, $mensaje, $cola) {
  $obj = [ordered]@{ ok = [bool]$ok; mensaje = [string]$mensaje; cola = [string]$cola; puerto = [string]$Puerto }
  $json = $obj | ConvertTo-Json -Compress
  $tmp = $Resultado + '.tmp'
  [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination $Resultado -Force
}

try {
  # Validacion de parametros: nada que no sea el formato esperado.
  if ($Puerto -notmatch '^USB\d{3}$') { throw 'El puerto no es valido.' }
  $esperado = Join-Path $env:LOCALAPPDATA 'EditorBraille'
  $dirRes = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($Resultado))
  if (($dirRes.TrimEnd('\') -ne $esperado.TrimEnd('\')) -or ([System.IO.Path]::GetFileName($Resultado) -ne 'preparar_impresora.json')) {
    throw 'La ruta del resultado no es valida.'
  }
  if (-not (Get-PrinterPort -Name $Puerto -ErrorAction SilentlyContinue)) {
    throw "Windows no tiene el puerto $Puerto. Reconecta la impresora."
  }

  # Controlador in-box.
  if (-not (Get-PrinterDriver -Name $Controlador -ErrorAction SilentlyContinue)) {
    $inf = Join-Path $env:windir 'INF\prnge001.inf'
    if (Test-Path -LiteralPath $inf) { & pnputil.exe /add-driver "$inf" /install | Out-Null }
    Add-PrinterDriver -Name $Controlador
  }

  # Cola: si ya hay una sobre ese puerto, no se crea otra.
  $existente = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.PortName -eq $Puerto } | Select-Object -First 1
  if ($existente) {
    Guardar-Resultado $true 'Ya existia una cola para esa impresora.' $existente.Name
    return
  }
  if (Get-Printer -Name $NombreCola -ErrorAction SilentlyContinue) {
    Set-Printer -Name $NombreCola -PortName $Puerto
  } else {
    Add-Printer -Name $NombreCola -DriverName $Controlador -PortName $Puerto
  }
  Set-Printer -Name $NombreCola -Shared $false -ErrorAction SilentlyContinue
  $p = Get-Printer -Name $NombreCola
  if ($p.PortName -ne $Puerto) { throw "La cola quedo en el puerto $($p.PortName)." }
  Guardar-Resultado $true 'Cola creada.' $NombreCola
}
catch {
  try { Guardar-Resultado $false ($_.Exception.Message) '' } catch { }
}
