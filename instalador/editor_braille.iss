; Script de Inno Setup (gratuito: https://jrsoftware.org/isinfo.php).
; Se compila con herramientas/empaquetar.ps1 (busca iscc.exe) o a mano:
;   iscc /DVersion=2.0.0 instalador\editor_braille.iss   (requiere dist\Editor Braille ya generada)
#ifndef Version
  #define Version "2.0.0"
#endif

[Setup]
AppId={{B7C2E4A1-5D3F-4A8E-9C16-EDB0A11E2025}
AppName=Editor Braille
AppVersion={#Version}
AppPublisher=Editor Braille
DefaultDirName={localappdata}\Programs\Editor Braille
DefaultGroupName=Editor Braille
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\Editor Braille.exe
SetupIconFile=..\web\iconos\app.ico
OutputDir=..\dist
OutputBaseFilename=EditorBraille-instalador-{#Version}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el Escritorio"; Flags: unchecked

[Files]
Source: "..\dist\Editor Braille\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Editor Braille"; Filename: "{app}\Editor Braille.exe"; IconFilename: "{app}\Editor Braille.exe"
Name: "{autodesktop}\Editor Braille"; Filename: "{app}\Editor Braille.exe"; Tasks: escritorio

[Run]
Filename: "{app}\Editor Braille.exe"; Description: "Abrir Editor Braille"; Flags: nowait postinstall skipifsilent
