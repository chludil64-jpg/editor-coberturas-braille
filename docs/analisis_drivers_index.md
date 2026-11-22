# Informe de ingeniería inversa — Instaladores de controladores Index Braille (V3/V4 y V5)

**Fecha:** 22 de noviembre de 2026
**Artefactos analizados (solo análisis estático, no se ejecutó ni instaló nada):**

| Archivo | Tamaño | SHA-256 |
|---|---|---|
| `index-driver-V3,V4.exe` | 7.222.416 B | `871f2b1de4b4568edc726f1978a100a6b024df6f86e5425b369ddc2bd3779527` |
| `index-driver-V3,V4.zip` | 6.976.710 B | `4579919ad6be70c350458ddfbc81055f7dae2d00b024e4fb847dfd15b62bb710` |
| `index-driver-V5.exe` | 7.660.896 B | `7aaa70696d7996fa5faa7ea3b9b644db8e21f8340c43b6713d09f4f16c4b8edd` |

> El ZIP **solo contiene una copia idéntica de `index-driver-V3,V4.exe`** (mismo tamaño: 7.222.416 B). No aporta nada distinto.

---

## 0. Resumen ejecutivo

1. **No son Inno Setup ni NSIS ni MSI suelto ni autoextraíble clásico: son bundles de WiX Burn** (motor `burn`, sección PE `.wixburn`, magic `0x00F14300`, contenedores CAB anidados). Adentro hay **4 MSI**: dos "clean" (limpieza de versiones viejas) y dos de driver (x86 y x64).
2. **Qué instalan:** un **controlador de impresora v3 de Windows, propietario** (no Unidrv, no PScript, no Generic): `INDEXDRV.DLL` que exporta `DrvEnableDriver` / `DrvDisableDriver` / `DrvQueryDriverInfo`, más una DLL de configuración (`IDXUI4.DLL`), recursos (`IDXMSGE4`, `IDXBMPS4`, `IDXHLPE4.CHM`), un **language monitor** PJL (`IDXMON.DLL`, exporta `InitializePrintMonitor2`) y una app `spool-file.exe` ("Index-direct-Braille") con extensión de shell. **No hay driver USB, ni monitor de puerto, ni servicios, ni kernel drivers.**
3. **La Everest-D V4 se identifica como `USBPRINT\Index_Braille_ABIndeC522`** (ID derivado del Device ID 1284, vía `usbprint.sys`), con `LPTENUM\...` como alternativa para puerto paralelo. **No matchea por VID/PID**: el INF no contiene ni un solo `VID_`/`PID_`. Medido en esta misma PC: el dispositivo padre es `USB\VID_1868&PID_0002` con servicio **`usbprint`** (clase USB impresora estándar).
4. **Respuesta corta a la pregunta 3: sí alcanza** con `usbprint.sys` (que ya viene en Windows y se enlaza solo) + una cola con el driver **inbox** `Generic / Text Only` (INF `prnge001.inf`, Unidrv de Microsoft). Un trabajo **RAW no pasa por el driver**, va derecho al monitor de puerto, así que no hace falta nada de Index. Lo que se pierde sin su driver es la traducción braille (reglas `.ibk`, contracción), los formularios de papel, el estado bidireccional y la app idB.
5. **Recomendación:** (b) cola propia con `Generic / Text Only`, creada por el programa con un único pedido de administrador; (d) TCP 9100 como camino preferido cuando hay red (no requiere admin); (a) el driver oficial **descargado, no empaquetado**; (c) escritura USB directa solo como último recurso. **No se pueden redistribuir los binarios de Index**: no hay EULA en el paquete y no hay cesión de derechos.

---

## 1. Metodología y evidencia

Todo el trabajo fue estático y sobre copias en subcarpetas:

- **Identificación:** `file`, lectura de cabeceras PE con parser propio (`pe_tool.py`).
- **Desempaquetado:** el instalador es un PE con una sección `.wixburn`; se parseó la cabecera del bundle (magic `0x00F14300`, versión 2, GUID del stub, `dwStubSize`, offsets de contenedores) y se extrajeron los CAB con un extractor propio (`cabx3.py`, MSZIP con diccionario de 32 KB entre bloques).
- **Los MSI:** se leyeron con el objeto COM `WindowsInstaller.Installer` (apertura **solo lectura**, sin `msiexec`, sin instalar) y con un parser propio de OLE/CFB (`cfb.py`) para reconstruir el stream del gabinete (estaba **fragmentado** en el archivo, por eso un `carve` ingenuo del CAB falla).
- **Verificación de integridad:** SHA-1 de cada MSI **coincide con el hash declarado en el manifiesto del bundle** (los 4 MSI, 4/4).
- **Firmas:** `Get-AuthenticodeSignature` (solo lectura) sobre EXE, CAT y MSI.
- **Estado del sistema:** `Get-PnpDevice`, `Get-PnpDeviceProperty`, `Get-Printer`, `Get-PrinterPort`, registro del USB Monitor e INFs in-box de Windows (todo lectura).
- **No se pudo:** ejecutar la instalación (la sesión **no es administrador**) ni probar impresión real (la impresora figura **desconectada**, `Status = Unknown`).

**Carpetas generadas en este análisis:**

```
drivers_index/
├─ extract_v34/ux/     -> contenedor UX del bundle V3,V4 (wixstdba.dll, logo, license.rtf, manifiesto)
├─ extract_v34/att/    -> contenedor adjunto: aa0..aa3 = los 4 MSI
├─ msi/                -> MSI renombrados + volcado de tablas (x64_tables.txt, x86_tables.txt, clean_x64_tables.txt)
├─ files_x64/ files_x86/  -> archivos reales del paquete 8.3.1 (INF, CAT, DLLs, EXE)
├─ extract_v5/ msi_v5/ files_v5/  -> ídem para el paquete 8.5.4
└─ scripts/            -> detectar-everest.ps1, crear-cola-everest.ps1, imprimir-raw.ps1
```

---

## 2. Pregunta 1 — Tipo de instalador, contenido, versión, firma y licencia

### 2.1 Tipo: WiX Burn (no es Inno, no es NSIS, no es MSI, no es autoextraíble)

Evidencia dura:

- Sección PE **`.wixburn`** de 56 bytes (el "stub data" de Burn).
- Cabecera del stub en el offset `431616` (V5) / `429568` (V3,V4) con:
  - magic `00 43 f1 00` = **`0x00F14300`** (`BURN_SECTION_MAGIC`),
  - versión `2`,
  - GUID del stub,
  - `dwStubSize = 461.824` (V3,V4) / `463.360` (V5) → coincide exacto con el offset donde arranca el primer CAB.
- **Dos contenedores CAB anidados** por EXE:
  - *UX container* (interfaz): `wixstdba.dll` (175.616 B) + `thm.xml` + `thm.wxl` + `logo.png` + `license.rtf` + `BootstrapperApplicationData.xml`.
  - *Attached container* (payloads): 4 MSI comprimidos en MSZIP.
- El manifiesto interno (`BootstrapperApplicationData.xml`) es el XML de Burn con `<Chain>`, `<MsiPackage>`, `<RelatedBundle>`.

Consecuencia práctica: **no se puede "abrir con 7-Zip y listo"** si el CAB viene partido en el stream; y `expand.exe` falla (`0xca00a009`) si lo carveás a mano.

### 2.2 Versiones y motor de compilación

| Paquete | Versión del producto | Motor | MSI | Fecha del INF |
|---|---|---|---|---|
| `index-driver-V3,V4.exe` | **8.3.1.0** (Registration `{dd8ae973-ee4a-4773-b188-ab7fd17bbe52}`) | WiX **3.10.2.2516** | 8.3.1 (drivers), 1.0.0.0 (clean) | 10/06/2017 |
| `index-driver-V5.exe` | **8.5.4.0** (Registration `{cafb45ba-445a-4bc9-8420-4576a752c555}`) | WiX **3.11.1.2318** | 8.5.4 (drivers), 1.0.0.0 (clean) | 02/05/2023 |

Nombre interno de ambos: `index-installer.exe`, ProductName `Index Braille Driver`, CompanyName `Index Braille`.
Dato de color forense: el MSI "clean" figura con `Manufacturer = **Index Braile**` (typo, sin la segunda "l"), mientras que los MSI de driver dicen `Index Braille`.

### 2.3 Contenido completo (V3,V4 = 8.3.1)

**Bundle:** stub (≈460 KB) + UX CAB (106.796 B) + attached CAB (6.639.132 B).

**4 MSI** (los 4 verificados contra el manifiesto):

| MSI | ProductCode | Versión | Tamaño | Rol |
|---|---|---|---|---|
| `index-driver-clean-x86.msi` | `{D00CE68D-0CF3-459F-AA29-0E1B444DBFD3}` | 1.0.0.0 | 49.152 B | Paquete **vacío** (0 archivos, 0 custom actions, 1 componente con clave de registro testigo bajo `System32`). Sirve de marcador: comparte UpgradeCode `{600009B0-D1DB-4EB6-B29F-2FFC7278E6C4}`, que los MSI de driver declaran como `RelatedPackage`, para forzar reinstalación/limpieza del paquete anterior |
| `index-driver-clean-x64.msi` | `{86E635AE-8BC7-472E-8874-CF310D9CBF95}` | 1.0.0.0 | 49.152 B | Ídem, 64 bits |
| `index-driver-x86.msi` | `{F2516312-7930-4463-AC01-7120E5DB5FAB}` | 8.3.1.0 | 4.210.688 B | Driver + idB (32 bits) |
| `index-driver-x64.msi` | `{7D34798E-8CFB-47DF-9109-E8FAD03866CF}` | 8.3.1.0 | 4.820.992 B | Driver + idB (64 bits) |

UpgradeCode común: `{9905FA5A-3C64-4BFC-B8ED-CA8204415CE7}`. Los MSI van con `ARPSYSTEMCOMPONENT=1` (no aparecen en "Agregar o quitar programas": solo el bundle).
`InstallSize` declarado: 5.785.329 B (x86) y **6.395.610 B (x64)** — que es **exactamente** lo que ocupan los archivos extraídos. Contabilidad cerrada.

**Archivos del MSI x64 (tabla `File`, orden de secuencia):**

| Archivo | Tamaño | Versión | Destino |
|---|---|---|---|
| `idxbmps4.dll` | 1.270.944 | 0.3.2051.1 | `...\driver\x64` |
| `ibdrvx64-nobidi.cat` | 16.571 | — | `...\driver` |
| `indexdrv.dll` | 74.912 | 0.3.2051.1 | `...\driver\x64` |
| `idxhlpe4.chm` | 18.268 | — | `...\driver` |
| `indexdrv-nobidi.inf` | 5.392 | — | `...\driver` |
| `idxmon.dll` | 26.272 | 0.3.2051.1 | `...\driver\x64` |
| `idxmsge4.dll` | 22.688 | 0.3.2051.1 | `...\driver\x64` |
| `idxui4.dll` | 129.184 | 0.3.2051.1 | `...\driver\x64` |
| `release-notes.rtf` | 107.667 | — | `...\driver` |
| `shell-extension.dll` | 147.456 | 1.3.2.0 | `...\idb` |
| `spool-file.exe` | 4.576.256 | 1.4.0.0 | `...\idb` |
| **Total** | **6.395.610** | | ✔ coincide con `InstallSize` |

`...` = `C:\Program Files\Index Braille\Braille Printer Driver-8.3.1.0-nobidi\` (tabla `Directory`: `APPLICATIONFOLDER`, `IndexDirectBrailleDir = APPLICATIONFOLDER\idb`, `IndexDriverDir = APPLICATIONFOLDER\driver`, `IndexDriverDriverArchDir = driver\x64`).

El paquete V5 (8.5.4) es igual pero: `spool-file.exe` 4.598.272 (v1.6.3.0), `shell-extension.dll` 179.200, `idxbmps4.dll` 1.878.432, INF `indexdrv.inf` (5.657 B, **con** language monitor activo), CAT `ibdrvx64.cat` (15.020 B) y total 6.957.305 B.

**Instalación del driver:** el MSI trae la tabla **`MsiDriverPackages`** (`IndexDriverInf | 14 | 1`) y las custom actions **DIFxApp** (`ProcessDriverPackages`, `InstallDriverPackages`, `UninstallDriverPackages`, `RollbackInstall`, `CleanupOnSuccess`, desde las DLL `DIFxApp.dll`/`DIFxAppA.dll` embebidas en la tabla `Binary`). Es decir: instala el **paquete de driver PnP** (copia al DriverStore y lo enlaza a los dispositivos que matcheen), no solo archivos.
Además: `RemovePrinterDrivers` y `RemoveLanguageMonitor` (custom actions de tipo 3137 vía el binario `PrinterManagement`) al desinstalar/actualizar.

**Lo que **sí** toca el sistema (grueso):**
- Registro: `HKLM\Software\Index Braille\Index-direct-Braille\spool-file` (ruta del EXE), `...\spool-file\settings\extensions = .pdf|.doc|.ibe|.txt|.brf|.docx|.rtf`, asociación `.ibe`, menú contextual `*\shellex\ContextMenuHandlers\Index-direct-Braille` = `{F415999C-0791-4880-AA85-6897CC6AC6CE}`, TypeLib, y `Software\Microsoft\Braille Printer Driver\installed = 1`.
- Acceso directo en el menú Inicio.

**Lo que **no** instala (importante):** ni `AddService` (cero servicios), ni driver USB propio, ni monitor de puerto, ni driver de kernel. La sección `[MODELS]` del INF es un INF de impresora clásico y nada más.

### 2.4 Firma digital

| Archivo | Firmante | Emisor | Vigencia | Timestamp | Estado |
|---|---|---|---|---|---|
| `index-driver-V3,V4.exe` | `CN=Index Braille AB, O=Index Braille AB, L=Gammelstad, S=Stockholm, C=SE` | DigiCert SHA2 High Assurance Code Signing CA | 01/03/2017 → 04/03/2020 | DigiCert Timestamp Responder | **Válida** |
| `index-driver-x64.msi` (8.3.1) | idem | idem | idem | idem | **Válida** |
| `index-driver-clean-x64.msi` | idem | idem | idem | idem | **Válida** |
| `ibdrvx64-nobidi.cat` | idem | idem | idem | idem | **Válida** |
| `index-driver-V5.exe` | `CN=Index Braille AB, O=Index Braille AB, S=Norrbottens län, C=SE` | **Sectigo** Public Code Signing CA R36 | 26/04/2023 → 26/04/2026 | DigiCert Timestamp 2022-2 | **Válida** |

Dos observaciones que importan para el despliegue:

- El certificado de 8.3.1 **está vencido desde 2020**, pero la firma sigue siendo válida porque está **timestamped** (el sello prueba que se firmó en fecha válida). Windows acepta esto, pero **si la PC no tiene internet y no puede validar la cadena/OCSP**, puede aparecer el cartel "No se puede verificar el editor de este software". Ya está documentado por Index en su knowledge base ("Select: Install this driver software anyway").
- **No es WHQL** (no está firmado por "Microsoft Windows Hardware Compatibility Publisher"). Es firma de código común. Para un driver de impresora de usuario eso alcanza, pero el instalador **va a pedir confirmación** de instalación de software de dispositivo (y va a requerir administrador).

### 2.5 Licencia / EULA — hallazgo importante

- **No hay EULA.** El payload que el bundle presenta como `license.rtf` **es byte por byte idéntico al `release-notes.rtf`**:

```
license.rtf    size=107667  sha256=f9bbfc20defd9370dabfcda8b10482d85b4cd8bf948c5a8ced8aa19db370c0d3
release-notes  size=107667  sha256=f9bbfc20defd9370dabfcda8b10482d85b4cd8bf948c5a8ced8aa19db370c0d3
--> IDENTICOS: True
```

  En V5 pasa lo mismo: `license.rtf` (18.104 B) es el historial de versiones 8.5.4 ("Version History / Upgrade from 8.5.3 to 8.5.4 …").
- Ni el EXE, ni los MSI, ni la tabla `UIText`/`WixUI` contienen texto de licencia, ni cláusula de redistribución. Lo único legal que aparece es `Copyright (c) Index Braille. All rights reserved.` en los recursos de versión y `(c) 2017 Index Braille AB` en las DLLs.

**Conclusión legal:** al no haber EULA ni cesión expresa, aplica el régimen por defecto: **obra propietaria, todos los derechos reservados**. Redistribuir `INDEXDRV.DLL`, la CAT, el INF o el propio instalador dentro de nuestro producto **no está autorizado** por ningún texto del paquete. Ver §5.4.

---

## 3. Pregunta 2 — Qué instala realmente y cómo se identifica cada modelo

### 3.1 Pieza por pieza, y qué hace cada una

| Pieza | Tipo real (probado) | Función |
|---|---|---|
| `INDEXDRV.DLL` | DLL de **driver GDI v3 propietario**. Exporta solo `DllMain`, `DrvEnableDriver`, `DrvDisableDriver`, `DrvQueryDriverInfo`. Importa `EngCreateBitmap`, `EngPaint`, `EngLineTo`, `EngFillPath` (motor GDI) y **`WritePrinter` de WINSPOOL**. Compilada con WinDDK. | Es **el driver**: recibe el trabajo GDI, lo rasteriza a puntos braille y arma el stream del embosador. Tiene soporte de `DrvEscape`/`DrvDrawEscape` con **PASSTHROUGH** (permite mandar bytes crudos) y referencias a `WinBraille\5.0\RuleFiles\*.ibk` (tablas de traducción). |
| `IDXUI4.DLL` | `ConfigFile` del INF. Exporta `DrvDeviceCapabilities`, `DrvDocumentPropertySheets`, `DrvPrinterEvent`, `DrvUpgradePrinter`, `PrinterProperties`, `DevQueryPrintEx`, `DrvConvertDevMode`. | Diálogos de propiedades/preferencias, tamaños de papel, margen de encuadernado, líneas por página. Contiene la lista de modelos ("Index Everest V2/V3", "Index Braille Box V4", "Index Everest-D V4"…). |
| `IDXMSGE4.DLL` | Recursos de mensajes | Textos de UI/errores. |
| `IDXBMPS4.DLL` | Recursos gráficos (1,27 MB / 1,88 MB en V5) | Bitmaps de la UI del driver. |
| `IDXHLPE4.CHM` | Ayuda compilada | Documentación del driver. |
| `IDXMON.DLL` | **Language monitor** del spooler. Exporta `InitializePrintMonitor2`; internamente `PJLMonStartDocPort`, `PJLMonOpenPortEx`, `PJLMonReadPort`, `SetPortW`. | Consulta estado del embosador (PJL) y lo reporta. En 8.3.1 **está desactivado** (`;LanguageMonitor=` comentado, de ahí el sufijo *nobidi*); en 8.5.4 **está activo** (`PJL_MONITOR="Index Braille Language Monitor,IDXMON.DLL"`). |
| `spool-file.exe` | App MFC (GUI) | "**Index-direct-Braille (idB)**": traduce e imprime archivos (pdf, doc, docx, rtf, txt, brf, bra, bbz, epub, dxb, ebf…) a braille. Usa `OpenPrinter/StartDocPrinterW/WritePrinter` (o sea: **pasa por el spooler**, no escribe al USB directo). |
| `shell-extension.dll` | Shell extension COM (`DllRegisterServer`, contexto `*\shellex`) | Agrega "Imprimir con Index Braille Direct" al menú contextual de cualquier archivo. |
| `indexdrv-nobidi.inf` | INF de impresora **v3** | Declara modelos → hardware IDs → instala los 6 archivos del driver. |
| `ibdrvx64-nobidi.cat` | Catálogo Authenticode | Firmas de los 6 archivos + el INF. |

### 3.2 ¿v3 o v4? → **v3**, sin dudas

Marcadores leídos en el INF:
- `[MODELS]` con `CopyFiles`, `DataFile=INDEXDRV.DLL`, **`DataSection=INDEXU_DATA`**, **`ConfigFile=IDXUI4.DLL`**, `HelpFile=IDXHLPE4.CHM` → estructura de driver **v3** (los v4 no admiten módulo de configuración ni `DataSection`).
- `[DestinationDirs] DefaultDestDir=66000` → instala en `%windir%\system32\spool\drivers\x64\3` (comportamiento v3).
- Ausencia de `[PrinterPackageInstallation]`, `CoreDriverDependencies` e `InboxVersionRequired` (los v4 y los "package-aware" los llevan).
- `DriverVer=10/06/2017,8.3.1` y binarios "built by: WinDDK" con exports `Drv*`.

Verificado en esta PC: el driver instalado figura como `PrinterEnvironment = Windows x64`, `DataFile = ...\spool\DRIVERS\x64\3\INDEXDRV.DLL`, `ConfigFile = ...\IDXUI4.DLL`, `Monitor = Index Braille Language Monitor`. Es decir: **está en la carpeta de v3 (`...\3`)**, no en la de v4 (`...\4`).

### 3.3 Driver base: **ninguno de Microsoft** — usan driver propio

- `DataFile=INDEXDRV.DLL` (propio), **no** `UNIDRV.DLL`, **no** `PSCRIPT5.DLL`, **no** `TTY.GPD`.
- Comparación: el "Generic / Text Only" de Microsoft (INFs in-box `prnge001.inf`) sí declara `DataFile=TTY.GPD` + `CoreDriverSections="{D20EA372-…},UNIDRV.OEM,UNIDRV_DATA"` → **Unidrv**.

O sea: **para imprimir desde Word/Chrome en braille contratado hace falta el driver de Index. Para mandar bytes ya armados, no.**

### 3.4 Hardware IDs (extraídos del INF, 8.3.1)

Todos los modelos se declaran por **dos** rutas: `LPTENUM\<id>` (paralelo) y `USBPRINT\<id>` (USB). Ninguna entrada usa `USB\VID_…`.

| Modelo (nombre exacto del INF) | ID (LPTENUM / USBPRINT) |
|---|---|
| **Index Everest-D V4** | **`USBPRINT\Index_Braille_ABIndeC522`** |
| Index Braille Box V4 | `…\Index_Braille_ABIndeD752` |
| Index Basic-D V4 | `…\Index_Braille_ABIndeB3E6` |
| Index BrailleBox V5 (CID viejo, 6 primeras unidades) | `…\Index_Braille_ABB72D` |
| Index BrailleBox V5 | `…\Index_Braille_ABIndeF9E7` |
| Index Basic-D V5 | `…\Index_Braille_ABInde7327` |
| Index Everest-D V5 | `…\Index_Braille_ABInde05E3` |
| Index FanFold-D | `…\Index_Braille_ABInde53F7` |
| Index 4Waves PRO | `…\Index_Braille_AB4Wav26B3` |
| Index 4X4 PRO V3 | `…\Index_Braille_AB4x4_5D3E` |
| Index Basic-D V3 | `…\Index_Braille_ABBasiC6F4` |
| Index Basic-S V3 | `…\Index_Braille_ABBasi72F1` |
| Index Everest V3 | `…\Index_Braille_ABEver6022` |
| Index Universal | `…\Index_Braille_ABIndeE005` y `…\ABInde0E05` |
| ATC Braille and Print | `…\Index_Braille_ABATC_FA18` |
| ETC Romeo 60 | `…\USBPRINT\Enabling_Technologie905E` |
| ETC Juliet 120 | `…\USBPRINT\Enabling_Technologie86F6` |

V5 (8.5.4) agrega `Index FanFold+` (`Inde3501`) y `APH PageBlaster` (`American_Printing_HoAA1E`), y saca ATC.

**Cómo se forma ese ID:** `usbprint.sys` lee el *IEEE-1284 Device ID* del dispositivo (`MFG:Index Braille;MDL:Everest-D V4;CMD:…;CID:IndeC522;`), concatena fabricante+modelo sin espacios y le pega el **CID**. El `IndeC522` es el CID del Everest-D V4.

### 3.5 Lo que se midió en esta PC (evidencia de campo, no del INF)

```
InstanceId   : USBPRINT\INDEX_BRAILLE_ABINDEX_EVEREST-D_V4\7&384FC4BB&0&USB004
HardwareId   : USBPRINT\Index_Braille_ABIndeC522
             : Index_Braille_ABIndeC522
Compatible   : USBPRINT\1284_CID_Index_Braille_AB_IndeC522
             : 1284_CID_Index_Braille_AB_IndeC522
             : CID_MS_GENERICPRINT            <-- ¡ojo, ver §4!
Padre USB    : USB\VID_1868&PID_0002\53943   (REV_0103)
Servicio del padre : usbprint                 <-- clase impresora USB estándar
Puerto       : USB004
Cola actual  : "Index Everest-D V4" / Datatype RAW / PrintProcessor winprint
Driver instalado: 8.5.5.0 (más nuevo que los dos paquetes analizados)
```

- **VID = `0x1868` (Index Braille), PID = `0x0002`** para esta Everest-D V4. El PID puede variar por modelo; **lo estable para detectar es el CID / hardware ID `USBPRINT\…IndeC522`**, no el PID.
- El **mapeo puerto ↔ dispositivo** está en `HKLM\SYSTEM\CurrentControlSet\Control\Print\Monitors\USB Monitor\Ports\<puerto>` con las claves `Device Id`, `Parent Device Id` y `Device Path`. Eso permite detectar el `USB00x` correcto **sin adivinar**.

---

## 4. Pregunta 3 — ¿Alcanza con usbprint.sys + una cola genérica?

**Sí, y hay tres pruebas concretas en la propia máquina y en los INFs de Windows.**

1. **`usbprint.sys` es driver in-box y se enlaza solo.** `C:\Windows\INF\usbprint.inf` contiene:
   `%USBPRINT.DeviceDesc% = USBPRINT_Inst, USB\Class_07, GENERIC_USB_PRINTER` → cualquier dispositivo USB clase 7 (impresora) obtiene "**USB Printing Support**" **sin ningún archivo del fabricante**. En esta PC el padre `USB\VID_1868&PID_0002` tiene `Service = usbprint`, y el dispositivo no tiene driver de Index en ese nivel: usan el de Microsoft.
2. **El puerto lo crea Microsoft.** El *USB Monitor* del spooler creó `USB004` con `Description = "Index Braille ABIndex Everest-D V4"` (lo saca del 1284 ID). No hace falta ningún port monitor de Index.
3. **Windows ya reconoce el equipo como "genérico".** El dispositivo expone el ID compatible **`CID_MS_GENERICPRINT`**, que es el que engancha el INF in-box `prnms013.inf` (`Generic printer device`, clase `SoftwareDevice`). No crea la cola, pero confirma que Windows lo trata como impresora genérica.
4. **Un trabajo RAW no atraviesa el driver.** Con `Datatype = RAW`, el print processor `winprint` manda los bytes tal cual al monitor de puerto. El `.GPD`, el Unidrv y cualquier traducción **no se ejecutan**. Por eso `Generic / Text Only` sirve para nuestro stream `ESC D … ESC BEL` + `CR LF`.

### Lo que **sí** se pierde sin el driver de Index (aceptable en nuestro caso)

- Traducción text→braille (literario/contratado) con tablas Liblouis y reglas `.ibk` → **nosotros ya la hacemos**.
- Formularios de papel, márgenes, líneas por página, "unprintable area" por modelo → lo maneja nuestro editor.
- Estado bidireccional (PJL) y "Test page" del driver → opcional; el reporte de estado se puede hacer por el mismo canal o por red.
- Impresión desde Word/Chrome/PDF con braille correcto → **no** lo vamos a dar con esta cola; y está bien: si el docente quiere imprimir un Word, ahí sí conviene el driver oficial.

### Lo que **no** alcanza

- **No se puede mandar RAW "a un puerto" sin cola.** Para `winspool` hace falta una cola: es justo la limitación que ya conocés ("necesita una cola de impresora instalada"). Las alternativas sin cola son TCP 9100 o escritura directa al dispositivo (§5.3 c y d).
- **Bajo Windows Protected Print Mode (WPP)** —Windows 11 24H2+, hoy **desactivado por defecto**— Windows **borra todas las colas v3/v4** y **bloquea drivers de terceros**. `Generic / Text Only` también es v3 (in-box, pero v3). Si algún día una escuela activa WPP o una política lo impone, la única salida es **TCP 9100 / escritura directa** (§5.3 d/c). Vale tenerlo en el radar: Microsoft ya anunció fin de servicio de drivers v3/v4 (15/01/2026: nada nuevo a Windows Update; 01/07/2026: se prefiere el driver IPP; 01/07/2027: solo parches de seguridad).

---

## 5. Pregunta 4 — Recomendación para nuestro programa

### 5.1 Comparativa

| | (a) Driver oficial + pnputil/Add-PrinterDriver | (b) Cola con `Generic / Text Only` (in-box) | (c) Escritura USB directa | (d) Red TCP 9100 |
|---|---|---|---|---|
| **Requiere admin** | Sí (1 vez) | **Sí (1 vez)** | Probablemente sí la 1ª vez (driver ya enlazado podría no) | **No** |
| **Requiere internet** | No si se empaqueta (pero no se puede), sí si se descarga | **No** | No | No |
| **Archivos de terceros** | Sí | **Ninguno** | Ninguno | Ninguno |
| **Legalidad de redistribuir** | **No autorizado** (sin EULA ni cesión) | **OK** (todo de Microsoft) | OK | OK |
| **Imprime nuestro ESC D tal cual** | Sí, pero pasa por driver + language monitor (capa de más) | **Sí, RAW puro** | **Sí, byte a byte** | **Sí, byte a byte** |
| **Traducción braille / formularios** | Sí | No | No | No |
| **Robustez ante updates de Windows** | Media (v3 en extinción, WPP lo rompe) | Media (v3 in-box; WPP lo rompe) | **Alta** (no depende del spooler) | **Alta** |
| **Complejidad para el docente** | Alta (UAC + "instalar de todos modos") | **Baja** (un UAC y listo) | Media | **Muy baja** |
| **Riesgo de romper lo que ya anda** | Medio (el "clean" MSI borra drivers previos) | Bajo (cola aparte, convive) | Medio (exclusividad del dispositivo) | Nulo |

### 5.2 Recomendación concreta

**Orden de preferencia para el "todo incluido" del Editor Braille:**

1. **Primario: (d) TCP 9100**, si la impresora está en red. Cero permisos, cero drivers, cero archivos de terceros, y es lo que ya funciona. El asistente debería: buscar en la red local (o pedir IP), probar el puerto 9100 y listo.
2. **Secundario (USB, sin admin, sin driver de Index): (b) cola con `Generic / Text Only`** creada por el programa con **un solo pedido de administrador** en el primer uso. Es la opción que cumple "que no tenga que buscar ni instalar controladores".
3. **Opcional avanzado (a): el driver oficial, pero descargado por el programa desde indexbraille.com** (con consentimiento explícito del usuario y verificando el hash/firma), o instalado a mano por quien quiera imprimir desde Word. **No empaquetarlo.**
4. **Último recurso (c): escritura directa al dispositivo USB.** Solo si el spooler está roto/bloqueado (WPP) o no se puede elevar.

**Por qué NO (a) como opción principal:** obliga a administrador *y* a aceptar software firmado por un editor que Windows puede marcar como "no verificable" (certificado vencido en 2020, sin internet para OCSP), trae 6,4 MB de archivos ajenos que no podemos redistribuir, instala una app extra (`spool-file.exe`) y **un language monitor que se mete en el camino de nuestros bytes**, y arrastra un MSI "clean" cuyo único fin es forzar la reinstalación del paquete anterior (sobre una instalación que el docente ya tenía andando, es un riesgo innecesario).

**Por qué tampoco "no hacer nada":** hoy el programa depende de que exista una cola. Una cola con driver genérico creada automáticamente resuelve eso sin pedirle nada raro al docente.

### 5.3 Permisos, riesgos y límites de cada opción

**(a) Driver oficial**
- Permisos: administrador (UAC) + aceptar "instalar software de dispositivo". En dominio, `Add-PrinterDriver` puede requerir además permisos de Print Server.
- Riesgos: el MSI "clean" fuerza la reinstalación del paquete anterior; el language monitor altera el camino de datos; el certificado vencido puede disparar advertencias; si la escuela no tiene internet, la validación de cadena puede fallar; WPP (futuro) lo bloquea.
- Legal: **no redistribuible** (ver §5.4).

**(b) Cola genérica**
- Permisos: administrador **una vez** (crear cola local es cambio de máquina). Si no se puede elevar: no hay cola → usar (d) o (c).
- Riesgos: `Generic / Text Only` es Unidrv v3; si alguien imprime desde Word a esa cola, sale texto plano sin sentido → **no ponerla como impresora predeterminada** y ponerle un nombre inequívoco ("Braille Index — Editor"). Si hay **dos** impresoras USB, hay que mapear el puerto por registro (ya resuelto en el script). Si el docente desenchufa y vuelve a enchufar, el puerto puede cambiar de número (`USB004` → `USB005`): **el script debe re-resolver el puerto en cada arranque**.
- Legal: sin problema, todo es de Windows.

**(c) Escritura directa USB**
- Camino: `CreateFile("\\?\usb#vid_1868&pid_0002#<serial>#{28d78fad-5a12-11d1-ae5b-0000f803a8c2}")` + `WriteFile`. La ruta exacta está en el registro (`USB Monitor\Ports\<puerto>\Device Path`).
- Estado real de la prueba: **no se pudo validar** porque el equipo está desconectado (`Status=Unknown`) y la sesión no es admin; ambas aperturas devolvieron `ERROR_FILE_NOT_FOUND`. **Hay que probarlo con la impresora enchufada y encendida.**
- Riesgos: hay que respetar el *chunking* (los release notes de Index documentan timeouts y un bug de "delay printing waiting for more data" en transferencias USB → conviene escribir por bloques grandes, no byte a byte); si el spooler tiene la cola abierta puede haber conflicto de acceso; no hay manejo de estado ni de papel agotado.

**(d) TCP 9100**
- Permisos: ninguno (a lo sumo, permitir la salida en el firewall).
- Riesgos: la impresora tiene que tener IP (fija o reservada por DHCP); latencia/timeout si la red es mala; hay que confirmar que el modelo tiene interfaz de red (la Everest-D V4 habitualmente sí, y vos ya lo usás así).
- Ventaja: es el único camino inmune a cambios de Windows en el spooler.

### 5.4 Legalidad de redistribuir (leélo antes de empaquetar)

- **Los binarios de Windows son propietarios**: `Copyright (c) Index Braille`, `All rights reserved`, **sin EULA y sin cláusula de redistribución** en ninguno de los dos instaladores (la "licencia" que muestran es el changelog). Por defecto, **no se pueden incluir en nuestro instalador** ni en un ZIP que distribuyamos.
- **Sí se puede**: (1) que el programa **descargue** el instalador oficial desde indexbraille.com con consentimiento del usuario; (2) **enlazar** a la página oficial; (3) **pedirle permiso por escrito a Index** (son una empresa chica y cooperativa con el ámbito educativo; un mail pidiendo autorización de redistribución para fines educativos es razonable y probablemente salga bien); (4) no usar nada de ellos y quedarnos con (b)/(d).
- **Ojo con el nombre**: llamar a la cola "Index Everest-D V4" usa su marca. Mejor "Braille Index" / "Braille — Everest D" y decir "compatible con" en la UI.
- **Dato útil**: el driver de **Linux** de Index sí es **GPL-2+/GPL-3+** (paquete `printer-driver-indexbraille` en Debian/openKylin, con `filter/index-direct-braille.c`). Eso **no** cubre los binarios de Windows. Y si algún día reusáramos ese código, nuestro programa pasaría a ser GPL: decidirlo a conciencia.
- Nuestro `ESC D … ESC BEL` es **comportamiento/protocolo**, no código copiado: reimplementarlo es legítimo.

### 5.5 Comandos exactos (opción recomendada = b)

> Todo esto está en `scripts/`, **con la sintaxis ya validada** con el parser de PowerShell. La detección se **corrió de verdad** en esta máquina y encontró la Everest-D V4 en `USB004`. El helper RAW también se ejecutó (falla limpio con `Win32=1801` contra una cola inexistente, lo que prueba que el P/Invoke y el marshalling están bien).

**Paso 0 — Detectar (no necesita admin).** `scripts/detectar-everest.ps1`:

```powershell
$patron = 'USBPRINT\INDEX_BRAILLE_ABINDEC522'          # Everest-D V4
$dev = Get-PnpDevice -Class Printer | Where-Object { $_.InstanceId -like "$patron*" }
$dev | Format-List Status, FriendlyName, InstanceId
(Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds').Data
# --> USBPRINT\Index_Braille_ABIndeC522
$parent = (Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName 'DEVPKEY_Device_Parent').Data
# --> USB\VID_1868&PID_0002\53943

# puerto real, sin adivinar:
foreach ($k in Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\USB Monitor\Ports') {
  $p = Get-ItemProperty $k.PSPath
  if ($p.'Device Id' -eq $parent) { "Puerto = " + $k.PSChildName }   # --> USB004
}
```

**Paso 1 — Instalar el driver genérico y crear la cola (admin).** `scripts/crear-cola-everest.ps1`:

```powershell
# 1) driver in-box (si no está en el DriverStore)
pnputil.exe /add-driver "$env:windir\INF\prnge001.inf" /install
Add-PrinterDriver -Name "Generic / Text Only"

# 2) cola sobre el puerto USB00x ya detectado
Add-Printer -Name "Braille Index" -DriverName "Generic / Text Only" -PortName "USB004"

# 3) que NO sea predeterminada ni compartida
Set-Printer -Name "Braille Index" -Shared $false -Published $false
```

**Paso 2 — Verificar:**

```powershell
Get-Printer      -Name "Braille Index" | Format-List Name, DriverName, PortName, PrintProcessor, Datatype, PrinterStatus
Get-PrinterPort  -Name "USB004"        | Format-List Name, Description
Get-PrinterDriver -Name "Generic / Text Only" | Format-List Name, PrinterEnvironment
# esperado: DriverName=Generic / Text Only, PortName=USB004, Datatype=RAW, PrinterStatus=Normal
```

**Paso 3 — Prueba de bytes crudos (sin driver de por medio).** `scripts/imprimir-raw.ps1` (envuelve `OpenPrinter`/`StartDocPrinter` con `pDataType="RAW"`/`WritePrinter`):

```powershell
# ESC D + datos + ESC BEL, una línea
$b = [byte[]](0x1B,0x44) + [Text.Encoding]::ASCII.GetBytes("hola") + [byte[]](0x0D,0x0A,0x1B,0x07)
[IO.File]::WriteAllBytes("$PWD\prueba.bin", $b)
powershell -ExecutionPolicy Bypass -File .\scripts\imprimir-raw.ps1 -Cola "Braille Index" -Archivo .\prueba.bin
```

**Paso 4 (opcional) — Driver oficial, si el docente lo quiere para Word.** No empaquetar: descargar o pedir que lo baje, y después:

```powershell
# descarga (ejemplo; usar la URL vigente de indexbraille.com)
Invoke-WebRequest 'https://www.indexbraille.com/.../index-driver-V3,V4.exe' -OutFile "$env:TEMP\index-driver.exe"
# comprobar firma antes de ejecutar
(Get-AuthenticodeSignature "$env:TEMP\index-driver.exe").Status   # debe ser 'Valid'

# alternativa "a mano" con el INF ya extraído (requiere admin):
pnputil.exe /add-driver .\files_x64\indexdrv-nobidi.inf /install
Add-PrinterDriver -Name "Index Everest-D V4"
Add-Printer -Name "Braille Index (oficial)" -DriverName "Index Everest-D V4" -PortName "USB004"
```

Ojo: **no ejecutar el MSI "clean"** en una máquina que ya tiene una cola andando (fuerza la reinstalación del paquete anterior).

---

## 6. Riesgos y límites de este análisis

- **No se ejecutó ni instaló ningún instalador.** Todo lo dicho surge de archivos, tablas MSI, INFs y del estado del sistema.
- **La impresora estaba desconectada** durante el análisis (`Status = Unknown`), así que **no se validó** ni la escritura directa al dispositivo ni una impresión real por la cola genérica.
- **La sesión no es administrador**, así que **no se pudo probar** el alta de la cola con `Generic / Text Only`. Los comandos están escritos según la ruta documentada y con *fallback* (`pnputil` → `Add-PrinterDriver`), pero **la prueba end-to-end queda pendiente** de una sesión elevada con el equipo encendido.
- **No se desensambló** `INDEXDRV.DLL` a fondo: se determinó su naturaleza (driver GDI v3 propietario, PASSTHROUGH, reglas `.ibk`) por exports, imports, strings y estructura del INF. Si en algún momento queremos replicar su generación de puntos, hay trabajo de reversing pendiente (y ahí sí conviene mirar el driver GPL de Linux como referencia conceptual).
- **`spool-file.exe`** se identificó por imports (`StartDocPrinterW`/`WritePrinter`) y strings, no por tracing dinámico.
- Las afirmaciones sobre **WPP** y el fin de servicio de drivers v3/v4 salen de documentación de Microsoft (ver §7); no se probaron en esta máquina.

---

## 7. Referencias externas consultadas

- Microsoft Learn — *End of Servicing Plan for Third-Party Printer Drivers on Windows*: 15/01/2026 sin drivers nuevos en Windows Update; 01/07/2026 se prefiere el IPP Class Driver; 01/07/2027 solo parches de seguridad. Los drivers existentes **sí** se pueden seguir instalando desde el paquete del fabricante.
- Microsoft Learn — *Windows Protected Print Mode*: Win11 24H2+/Server 2025+, **no activo por defecto**; al activarse **borra las colas v3/v4 y bloquea drivers de terceros**.
- Index Braille KB — *Install Index printer driver 5-X*: confirma que Windows muestra "no se puede verificar el editor" y hay que elegir "Install this driver software anyway" (coherente con el certificado vencido de 8.3.1).
- Debian/openKylin `printer-driver-indexbraille`: el driver de **Linux** es GPL-2+/GPL-3+ (no aplica a los binarios de Windows).

---

## 8. Próximos pasos sugeridos

1. **Cerrar la verificación pendiente** (30 minutos, con la impresora enchufada y una consola elevada): correr `crear-cola-everest.ps1`, verificar con `Get-Printer`, y mandar `prueba.bin` por `imprimir-raw.ps1`. Si sale una línea en braille, la opción (b) queda probada end-to-end.
2. **Implementar en el Editor Braille** la cascada: `TCP 9100 (si hay IP)` → `cola propia "Braille Index"` → `cola oficial existente` → `escritura directa`. Detección por **hardware ID `…IndeC522`**, no por nombre de cola ni por PID.
3. **Persistir el puerto**: guardar el `USB00x` resuelto y **re-resolverlo en cada arranque** (cambia al reconectar).
4. **No empaquetar binarios de Index.** Decidir entre: pedir autorización por escrito, o descargar bajo consentimiento.
5. **Documentar para el docente** en una pantalla: "tu impresora está en red / por USB / no la encuentro", con un solo botón ("Preparar impresora") que dispare el UAC.
