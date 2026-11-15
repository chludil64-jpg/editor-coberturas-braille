# Mapas táctiles desde una imagen: cómo separar capas con significado

REVERSE-X — informe de ingeniería inversa y propuesta de producto. Fecha: 15/11/2026. Carpeta: `hermes_mapas/`. Todo lo que sigue se hizo dentro de esta carpeta.

---

## 1. Resumen ejecutivo (lo que importa)

- **Nadie resuelve esto reconociendo la imagen, salvo los académicos.** Los servicios que funcionan (TMAP, Touch Mapper, Haptické mapy, human_crossing) parten de **datos vectoriales con semántica** (OSM/GeoJSON): el significado (`road`, `waterway`, `admin_boundary`) viene en el dato, no se adivina del píxel. Esa es la razón de fondo de que nuestro editor mezcle ríos con límites.
- **El canal táctil que usan todos los productos serios es doble: altura + textura de superficie**, no "tipos de línea". Touch Mapper codifica 0.81 / 1.5 / 2.9 mm y las aguas con **onda sinusoidal de 10.3 mm** de paso (`converter/obj-to-tactile.py:509`). El Everest-D V4, en cambio, tiene **una sola altura de punto**: nos queda sólo la forma (textura y patrón de puntos). Esto cambia el diseño, no lo impide.
- **La regla que separa "línea" de "borde de región" es geométrica y medible**: grosor y longitud de trazo. En mis pruebas el grosor separó limpio (1.0–1.1 mm las líneas vs 8–165 mm las áreas), pero **falló con los símbolos puntuales** (2.25 mm) y con líneas muy finas y claras. No hay umbral mágico: hace falta confirmación humana.
- **Dos colores distintos pueden ser el mismo significado y el mismo color puede ser dos significados.** Medido: en un SVG real de Wikipedia el agua aparece como `#c6ecff` y `#c6ebff` (¡1/255 de diferencia!), y en otro mapa los ríos y los límites departamentales **comparten exactamente el mismo trazo** `#587c8a`. Conclusión: agrupar por color **y** separar por geometría, con el docente decidiendo.
- **Propuesta priorizada**: (P0) clusters de color en Lab + panel "esto es / estilo táctil" por color; (P1) separar relleno de trazo y eliminar el borde automático de las regiones; (P2) clases "símbolo/texto" e "ignorar"; (P3) split por geometría (recto vs sinuoso) y entrada SVG/OSM. Detalle en §9.
- **Prototipo funcionando** (sólo stdlib, sin instalar nada): clasifica colores, detecta agua, separa áreas de líneas, rasteriza a grilla de 2 mm con estilos (retícula de agua, guiones, punteada). Sobre 2 mapas reales: 15.7 % y 13.2 % de celdas con punto, ~6 s por mapa. Ver §8 y §2.

---

## 2. Qué hay en la carpeta y cómo correr el prototipo

- `PEDIDO.md` — el pedido.
- `repos/touch-mapper/` — clonado y leído (commit `e2710ea`, 4/10/2026). `repos/human_crossing/` — clonado y leído (estilos QML, plantillas BANA).
- `test_assets/` — dos mapas reales bajados de Wikimedia Commons (PNG renderizado) + SVG de origen: `chubut.png` (1920×1327), `provincias.png` (1280×2229), `Argentina_Chubut_location_map.svg`, `Argentina_location_map.svg`, `Map_of_Argentina_with_provinces.svg`.
- `prototipo/` — `pngio.py` (PNG mínimo), `tactil.py` (pipeline), `diag_trazos.py` (métrica de trazos), `mosaico.py` (una imagen por cluster), `qml_estilos.py`. **No se pudo instalar nada** (PyPI bloqueado: `uv pip install pillow numpy` → error de conexión): todo el prototipo es stdlib puro (`zlib`, `colorsys`, `math`), lo que de paso lo vuelve portable.

Cómo correrlo (desde la carpeta del proyecto, con el Python del sistema):

```
python prototipo/tactil.py test_assets/chubut.png 8      # K=8 clusters
python prototipo/diag_trazos.py                          # métrica de trazos por cluster
PYTHONPATH=prototipo python prototipo/mosaico.py test_assets/chubut.png   # 1 imagen por color
```

Salidas: `test_assets/chubut_tactil.png` (grilla de puntos, 2 mm, ×8 de zoom), `chubut_capas.json` (métricas por capa), `chubut_mosaico.png`.

---

## 3. Reconocimiento del artefacto

- **Lo que se analizó acá**: los dos mapas reales, los tres SVG y el código de dos repositorios. **No tuve acceso al código de nuestro editor** (en la carpeta sólo estaba `PEDIDO.md`): todo lo que digo de él es lo que describe el pedido (Canny + regiones de color por k-medias + vectorización de esqueleto). Si el editor cambia, §9 hay que releerlo.
- **Plataforma del destino**: embosser Index Everest-D V4, grilla de ~2 mm, una sola altura de punto. Consecuencia dura: **no hay relieve variable**; la distinción táctil posible es forma del punto, densidad, patrón y continuidad (sólido / guionado / punteado / retícula). Ojo: la resolución del V4 aparece como **17 dpi (≈1.5 mm)** en una ficha y como **"hasta 50 dpi"** en otra (y un paper atribuye 50 dpi al V5): no lo pude confirmar en documentación de Index. **Medilo con una prueba** (paso 0 de §9): puntos a 1 / 1.5 / 2 mm y ver cuál sale separado.

---

## 4. Cómo lo resuelven los proyectos reales

| Proyecto | Entrada | Separa agua/límites/rutas cómo | Simplificación y símbolos | Fuente |
|---|---|---|---|---|
| **Touch Mapper** | OSM (nunca imagen) | Por **categoría semántica** del dato; tabla categoría→altura en `doc/way-area-extrusion-tiers.md` y `converter/tactile_constants.py` | `decimate()` (DISSOLVE) y `fatten()` en `converter/obj-to-tactile.py:688/696`; agua = onda de 10.3 mm (`:509`); marco + esquina NE (`:355`) | github.com/skarkkai/touch-mapper |
| **TMAP / Smith-Kettlewell + LightHouse** | OSM + geocoding Google | Ídem: cada clase tiene su símbolo fijo. **Calles sólidas, sendas punteadas, edificios rellenos** | Etiqueta **sólo** calles que llegan al borde (evita amontonar); 6 escalas 1:1500–1:50000; hoja de clave aparte; SVG+PDF | ski.org/project/tactile-map-automated-production-tmap ; madlabdesign.org/tmap-faq-and-troubleshooting |
| **TactileView** (HumanWare/Thinkable) | Imagen, SVG, escaneo, webcam | Semántica **puesta por el usuario**: importa, aplica *Detect shape*, *Filters*, y asigna a cada objeto estilo de línea (sólida/punteada), grosor y textura | 7 modos de creación; biblioteca internacional de mapas; manual 2024 §4.05–5.08 | tactileview.com ; manual en humanware.com |
| **Tiger / ViewPlus (TSS 9, IVEO Transformer Pro)** | Imagen, escaneo, SVG | **Mapeo color→patrón automático**: el *Pattern Editor* crea patrones táctiles y los asocia a colores concretos; preset *"Outline, Fill With Auto Patterns"* cambia relleno sólido por patrón según el color | *edge detection*, *line intensification*, *reduction/elimination/pattern replacement of color fill*; avisa que **grandes rellenos pesados son mala idea** ("No Fill" en equipos chicos) | viewplus.com/product/tiger-software-suite9 ; manual IVEO Transformer Pro 2017 |
| **ElPicsPrint** (Elita, para Index) | Imagen, SVG | **Relleno automático de puntos en zonas de color**; a cada contorno se le asigna tipo de textura y altura de punto; umbrales superior/inferior para imágenes full color | Grosor de línea en "puntos braille": `1x`, `2x`, `2x+`; recomienda **≥3 mm de separación**, objetos **≥5 mm**, **máx. 3 texturas** por imagen | elitagroup.com/prod/elpicsprint + manual |
| **PictureBraille** | Imagen escaneada / portapapeles | **No separa nada**: convierte a un mapa de bits de puntos (1 bit) para el embosser | Sin capas ni semántica; es el antecedente del enfoque que hoy tenemos | pentronics.com.au/Software.html ; ULD 2012 p.126 |
| **human_crossing** (Jiang et al., AGILE 2023) | OSM → QGIS | Capas OSM separadas; estilos en QML con anchos en **mm** (0.26 / 0.5 / 1.0) y `customdash` en mm ("5;2") | Plantillas A3/A4/A5 **según BANA**, leyenda en braille, norte, escala; pasos 00–07 en `scripts/` | github.com/myhjiang/human_crossing |
| **lunar_assembler**, **osm2tactile** | OSM → SVG (navegador / Flask) | Semántica del dato + hoja de estilo (CSS/QML) | Salida SVG apta para corte láser / relieve | github.com/matkoniecz/lunar_assembler ; github.com/raphiniert/osm2tactile |

Académicos (todos parten de **imagen**, que es nuestro caso):

- **Bouhlel & Rojbi, ASSETS 2014** — el antecedente más cercano: pipeline de 7 pasos (adquisición → segmentación **Fuzzy C-Means** con K fijado por el especialista → simplificación → **"texture attribution": asignar una textura táctil distinta a cada color/clase** → OCR del texto → braille → salida). DOI 10.1145/2661334.2661335 (reseña: a11ybob.com).
- **Touya et al. / MULTIMAGE (ISPRS 2020; ICA 2022)** — mapas escaneados de manuales: CNN para **inferir escala y contenido**, después generalización con datos geográficos. Conclusión útil: los generadores OSM actuales "no generalizan lo suficiente".
- **Luft 2021 (TGIS)** — segmentación de agua en mapas topográficos escaneados: **el espacio Lab umbraliza mejor que RGB**; el resultado sale ruidoso y hay que morfologizar. DOI 10.1111/tgis.12794.
- **Chiang & Knoblock (GREC 2011/2012)** — separación de capas por color (CIS) + **etiquetado por el usuario** (una muestra de "esto es ruta") + limpieza + raster→vector. Es exactamente el flujo que propongo, con 4 clics humanos.
- **Revisiones sistemáticas** (IJGI 2019; Processes 2021) — coinciden: **no existe una solución integral automática** de mapas táctiles; lo que hay son pipelines con intervención humana. **IJCNN 2025** va por otro camino: mapas RGB → táctiles con difusión guiada por texto (lagos/ríos/ciudades), 47 % de salidas "con ajustes mínimos" — potente, pero requiere ML y datos etiquetados: fuera de nuestro alcance hoy.

---

## 5. Reglas de simbolización y números que sí sirven

De **BANA, *Guidelines and Standards for Tactile Graphics* (2022)** (leí el manual web y la edición 2010; el PDF 2022 no me bajó completo — ver §11):

- Máx. **5 texturas de área, 5 estilos de línea y 5 tipos de símbolo** por gráfico; si no alcanza, **clave alfabética** (§3.2.2).
- Área mínima **6 mm²**; línea primaria mínimo **12.5 mm** de largo; líneas guía 20–37 mm (§3.4.3).
- **Línea punteada primaria: guion de 6–10 mm, espacio ≈ mitad del guion** (§3.4.3.3). Con grilla de 2 mm: 3 puntos encendidos / 2 apagados.
- Separación mínima **3 mm** (1/8") entre líneas, puntos y braille; APH admite que a veces hace falta **6 mm**.
- **Mapas complejos: separar en capas** (político, uso del suelo, recursos) — §3.9, ejemplo 3-6. Es la recomendación oficial para lo que nos pasa.
- Muestras de la clave: textura de área **25 × 12.5 mm**, línea **25 mm**.

De **APH, *Guidelines for Design of Tactile Graphics***:

- Cuerpos de agua y tierra se distinguen con **símbolo de área distinto**; para agua, **textura muy baja y de espaciado cerrado**; la tierra se deja en relieve (BANA 3.4.3.1: "bodies of water where land is raised"). Consistencia: el mismo símbolo para agua en todos los mapas de la misma transcripción.

De **tactiles.eu (3D4VIP)**, útil porque es 3D y con números:

- Línea estándar **1.0 × 1.1 mm**; **guionada 7 mm / 3 mm**; **ultrafina 2 mm / 3 mm**; separación mínima **2 mm** (1 mm absoluto).
- Rellenos de líneas a **1.5–2.5 mm** de paso (finos) o **3.5–4 mm** (gruesos), y una advertencia que vale oro: dos patrones con igual paso y ancho **no se distinguen** ("Option 3 same as Option 1").

Tabla de estilos que propongo para el Everest-D (todo en múltiplos de 2 mm):

| Capa | Estilo táctil | Patrón en la grilla | Riesgo |
|---|---|---|---|
| Costa / agua | retícula de puntos baja | puntos cada **3–4** celdas (6–8 mm) | relleno denso = ruido (ViewPlus lo desaconseja) |
| Río / arroyo | punteada fina | 1 punto cada 2 celdas (4 mm) | se confunde con "punteada" de ruta si se reusa |
| Límite | guionada | 3 on / 2 off (6/4 mm) | con 1 sola altura, sólo la forma lo distingue |
| Ruta | sólida 1 punto de ancho | continua | tapa el cruce con límites: cortar el límite donde cruza |
| Curva de nivel / auxiliar | ultrafina | 1 on / 2 off | limitar a 1 capa auxiliar |
| Texto / símbolos | **no** vectorizar: reemplazar por braille + punto guía | — | vectorizar texto = basura garantizada |

---

## 6. Diagnóstico del enfoque actual (Canny + k-medias)

- **Canny responde "¿hay contraste acá?"**, no "¿qué significa esto?". El borde de un lago y el trazo de un río producen la misma respuesta. Por eso agua y límites salen idénticos.
- **k-medias sobre RGB** agrupa por color, pero (a) el antialias crea colores intermedios que se vuelven "capas" propias, (b) el texto genera decenas de fragmentos, y (c) un mismo color puede tener dos significados. Medido en `chubut.png` con K=8: **3 de 8 clusters (2.7 % de los píxeles) eran halos/antialias** y 1 cluster mezclaba límites provinciales, costa y ríos.
- **Vectorizar el esqueleto de todo** aplana el grosor (una línea de 3 mm y una de 0.3 mm quedan iguales), borra la textura de área (el canal más potente que tenemos) y no deja lugar donde decir "este color es agua": falta la capa de decisión semántica.

---

## 7. Técnicas aplicables a nuestro caso (imagen del docente, sin dependencias)

1. **Clasificar color en Lab, no en RGB.** `k-means` en Lab con K=6..10 y **fusión de centros con ΔE < 4** (resuelve `#c6ecff` vs `#c6ebff`, y en general las variantes de escaneo). Uso previo: Luft 2021 (agua en Lab), Chiang & Knoblock (CIS). HSV sirve sólo como **prior** de agua: `165 ≤ H ≤ 265`, `S ≥ 0.10`, `V ≥ 0.35`.
2. **Regla de prior de agua por área, no por línea.** El prior HSV produce un falso positivo en la capa de líneas (medido: cluster `#587c8a` marcado "agua" siendo línea). Regla: el prior de agua **sólo aplica si la clase es de área**.
3. **Separar trazo de relleno (esto es el corazón del arreglo).**
   - Grosor = `2 × iteraciones de erosión` hasta vaciar la máscara, en mm.
   - Si grosor ≤ ~1.5 mm → **línea**; si grosor ≥ ~3 mm → **área**; en el medio → **símbolo/punto** (revisar por compacidad `4πA/P²` y tamaño de bbox).
   - En áreas: **no dibujar el contorno** (era el error). El área se comunica por textura; el contorno sólo se dibuja si el usuario lo pide (costa) o si separa dos áreas iguales.
   - Bordes entre dos áreas de distinto color: **no son líneas**. Suprimir el trazo y dejar que la textura de cada lado hable.
4. **Mismo color, dos significados → partir por geometría.** Por trazo: largo, **rectitud = cuerda/longitud**, curvatura media. Medido en la capa mezclada de Chubut: 29 trazos, 892 mm, de los cuales **183 mm con rectitud ≥ 0.97** (candidatos a límite) y **505 mm con rectitud < 0.90** (candidatos a río). Presentarlo como dos sub-capas con vista previa y dejarlo confirmar.
5. **Texto y símbolos: detectar y sacar, no vectorizar.** Los fragmentos de texto se delatan por **longitud de trazo corta y cantidad alta**: medido, los halos/textos dieron p90 de 8–20 mm, mientras la capa de líneas real dio **p90 = 99.8 mm**. Regla: p90 de trazo ≥ ~20 mm para tratar un color como capa de línea; si no, marcarlo "texto/símbolo/ignorar" (el usuario decide). El texto se reemplaza por etiqueta braille con línea guía (BANA §3.4.3.5).
6. **Asignación por el usuario (obligatoria).** Por cada color detectado: muestra del color, imagen aislada (mi `mosaico.py`), % del mapa, grosor, y un desplegable **significado + estilo**. Defaults conservadores (agua, límite, ruta, ignorar) y "no imprimir hasta confirmar". Los tres productos que funcionan hacen exactamente esto (TactileView "colours on screen", Tiger "color→pattern", ElPicsPrint "texture type").
7. **Restricciones duras al rasterizar.** Máx. 5 texturas / 5 estilos (BANA); separación ≥ 2 celdas (4 mm) cuando dos capas corren paralelas; guiones medidos por longitud de arco, no por píxeles; relleno de áreas grandes a 3–4 celdas de paso; cortar la capa inferior en los cruces (si no, se leen como un nudo).
8. **SVG/OSM como entrada alternativa (opcional, no P0).** Verifiqué que los SVG de Wikipedia **no traen clases semánticas**: `Argentina_location_map.svg` tiene **0 atributos `class`** y el agua es `fill:#c6ecff` / `#c6ebff`; `Map_of_Argentina_with_provinces.svg` usa `style` inline con 442 paths. O sea: SVG no nos regala semántica — **hay que clusterizar igual**, con la ventaja de tener vectores limpios (grosor exacto, sin antialias) y texto como `<text>` separado. Si algún día se quiere OSM/GeoJSON, el atajo probado es `lunar_assembler` (OSM→SVG en el navegador) y `human_crossing` (OSM→QGIS con estilos en mm).

---

## 8. Lo que medí con el prototipo (resultados reales)

Setup: `tactil.py` con análisis a 480 px de ancho (0.50 mm/px), K=8, hoja 240×160 mm, grilla de puntos de 2 mm (120×80 = 9600 celdas). ~6 s por mapa, Python puro, 1 core.

**Mapa 1 — `chubut.png`** (provincia con lagos, ríos, límites departamentales, texto):

| cluster | color | % px | grosor | rol detectado | qué es realmente (verificado en el mosaico) |
|---|---|---|---|---|---|
| 6 | `#fdfde8` | 58.8 | 41 mm | área | tierra |
| 7 | `#c4ebfd` | 25.1 | 69 mm | área **+AGUA** | mar y lagos (correcto) |
| 0 | `#dfdfdf` | 6.3 | 24 mm | área | provincias vecinas |
| 1 | `#f5e0b8` | 5.6 | 8 mm | área | franja exterior |
| 5 | `#587c8a` | 1.6 | **1.00 mm** | línea | **límites + costa + ríos (mezclados)** |
| 2 | `#bcbeb3` | 1.1 | <0.5 mm | línea/ruido | límites departamentales finos |
| 3 | `#d3dbce` | 1.0 | <0.5 mm | línea/ruido | límites + ríos tenues |
| 4 | `#edefdd` | 0.6 | <0.5 mm | ruido | halo del color tierra |

- Agua: detectada por HSV **sin falsos negativos** en las áreas; falso positivo en el cluster de líneas (corregido con la regla "prior de agua sólo para áreas").
- Salida: 1511 puntos sobre 9600 celdas = **15.7 %** de la hoja con relieve.
- Split geométrico de la capa mezclada: 16 trazos rectos (183 mm) vs 11 sinuosos (505 mm) → separación límite/río **factible** con el mismo color.

**Mapa 2 — `provincias.png`** (mapa político con texto por todos lados):

- Cluster de **símbolos de capital** `#4b3d35`: grosor **2.25 mm** → mi regla lo clasificó "área". **Falla real**: hace falta la tercera clase (símbolo/punto). Lo detecté porque su p90 de trazo fue **0 mm** (no hay trazos, son manchas).
- Clusters de texto/antialias: p90 de trazo 4.5–20.2 mm, 76–229 trazos → con la regla de p90 ≥ 20 mm quedan fuera.
- Salida: 1269 puntos = **13.2 %**.
- **Falla real**: los límites provinciales finos y claros se perdieron (contraste ΔE < 10 contra los rellenos pastel). Recomendación derivada: para líneas de bajo contraste, complementar con bordes de Canny **a resolución completa**, no a la resolución de análisis.

**Hallazgo de densidad**: el relleno de agua a paso 2 celdas (4 mm) generó 1162 puntos en un solo mapa — casi el 80 % del total. Es demasiado ruido para una mano. Paso **3–4 celdas (6–8 mm)** para aguas grandes, como hacen Touch Mapper (onda cada 10.3 mm) y ViewPlus (reducir relleno).

**Archivos de control**: `chubut_tactil.png` y `provincias_tactil.png` muestran la grilla de puntos resultante (×8) — es la vista previa que hoy no tenemos.

---

## 9. Propuesta priorizada para el editor

**Paso 0 — medir la máquina (1 hoja, 10 min).** Imprimir puntos en diagonales a 1 / 1.5 / 2 / 2.5 mm y una línea de 1 punto con guiones de 3/2 y 1/2 celdas. De ahí salen los únicos números que valen: paso mínimo de la grilla y guion legible. Todo lo demás se expresa en múltiplos de ese paso.

**P0 — Panel de capas por color (el arreglo de fondo; 1–2 días).**
1. Reducir la imagen a lado mayor ~600 px (media de bloque, sin antialias): es la resolución de *decisión*, no de dibujo.
2. `k-means` en Lab, K=6..10 + fusión ΔE<4. Descartar clusters < 0.3 % **sugiriéndolos** como "ignorar" (no borrarlos).
3. Por cluster: color medio, %, grosor por erosión, p90 de trazo, compacidad, `bbox`, y **miniatura aislada**.
4. UI: tabla de colores con **significado** (agua / río / límite / ruta / curva / símbolo / texto / ignorar) y **estilo** (retícula X mm / continua / guionada / punteada / doble). Botón "no imprimir hasta confirmar".
5. Vista previa en la grilla real del embosser, capa por capa y superpuesta.

**P1 — Geometría: área vs línea vs símbolo (2–3 días).** Reglas de §7.3 más el ajuste en la UI: "grosor mínimo para considerar trazo" (default 1.5 mm), "no dibujar contorno de áreas" (default activado), "p90 mínimo de trazo para capa de línea" (default 20 mm). Añadir la clase **SÍMBOLO** (manchas compactas, sin trazos).

**P2 — Limpieza táctil (2 días).** Quitar fragmentos < 6 mm² (no se sienten); unir cortes de trazo ≤ 2 celdas; cortar la capa inferior en cruces; separar capas que corran a < 2 celdas; relleno de agua a paso configurable; leyenda braille generada con el nombre de cada capa y su patrón (según BANA: muestra de 25 × 12.5 mm).

**P3 — Split por geometría y entradas alternativas (3–5 días).** Subdividir una capa de línea en "recto/límite" y "sinuoso/río" por rectitud, con un slider y confirmación. Importar SVG tomando `fill`/`stroke` como colores (no como clases) y `<text>` como etiquetas; opcionalmente OSM por `lunar_assembler` para mapas base.

Pseudocódigo del núcleo (P0+P1):

```
img  = reducir(original, 600)                  # media de bloque
lab  = [srgb2lab(p) for p in img]
C    = kmeans(lab, K=8)                        # + fusionar centros con ΔE < 4
L    = asignar(img, C)
para cada c en C:
    m         = L == c
    grosor   = 2 * erosionar_hasta_vaciar(m) * mm_por_px
    trazos    = esqueletonizar(m) -> polilíneas (Zhang-Suen + RDP)
    p90       = percentil(largo(trazos), 90)
    rol       = SÍMBOLO if no trazos and area < (5mm)^2
              else LÍNEA  if grosor <= 1.5mm and p90 >= 20mm
              else ÁREA   if grosor >= 3mm
              else REVISAR
    agua?     = rol == ÁREA and 165 <= hue <= 265 and sat >= 0.10
rol = usuario_confirma(rol, estilo)            # nada se imprime sin confirmar
para cada capa confirmada:
    si ÁREA:      emitir_dots(reticula(paso_mm, m), estilo)
                  # sin contorno, salvo que el usuario lo pida
    si LÍNEA:     emitir_dots(polilíneas, guion_por_arco(paso=on/off))
    si SÍMBOLO:   emitir_dots(centroide_o_bbox, símbolo)
resolver_conflictos(prioridad_de_capas, separación >= 2 celdas)
```

**Lo que NO haría** (y por qué): red neuronal para segmentar (necesita dataset etiquetado; los papers que lo hacen reportan 47–74 % de acierto, no más); vectorizar texto; rellenar áreas al 100 %; automatismo sin confirmación (mis dos pruebas fallaron en casos distintos: símbolos en un mapa, líneas claras en el otro).

---

## 10. Riesgos, legal y límites

- **Licencias**: `touch-mapper` es **AGPL-3.0** — leerlo para aprender está bien; copiar código obliga a abrir todo el nuestro. `human_crossing` es **GPL-2.0**, `lunar_assembler` **AGPL-3.0**. Todos los mapas de Wikimedia son CC BY-SA o dominio público según archivo; los datos OSM son **ODbL** (atribución si se usan datos). El prototipo de esta carpeta **no reutiliza código de esos repos**: reimplementa las ideas (erosión, esqueleto, k-means), que son técnicas estándar.
- **Las reglas BANA/APH son buenas prácticas de transcripción**, no ley; citarlas no obliga, pero son el estándar de la profesión y conviene declarar en el editor qué regla se aplica.
- **Riesgo técnico mayor**: una sola altura de punto. Sin relieve variable, dos capas densas con el mismo estilo son indistinguibles. La disciplina de "máx. 5 estilos + leyenda" no es estética: es la única forma de que el mapa se lea. Y si el docente puede imprimir sin confirmar capas, va a salir un mapa ilegible y va a culpar a la herramienta: el gate de confirmación es parte del producto, no un extra.

---

## 11. Qué no pude verificar (explícito)

1. **El código de nuestro editor**: no estaba en la carpeta. El diagnóstico de §6 y el plan de §9 se basan en la descripción del pedido.
2. **Resolución real del Everest-D V4**: fichas de distribuidores dicen 17 dpi y 50 dpi. No encontré la hoja oficial. Se resuelve con el paso 0.
3. **El PDF de BANA 2022** no se pudo extraer completo (timeout del servicio). Usé el manual web de BANA y la edición 2010 (mirror en prcvi.org), cuyos números coinciden en lo citado, más la guía APH.
4. **Manuales de TactileView, ViewPlus (TSS 8/9, IVEO Transformer Pro), ElPicsPrint y PictureBraille**: leí fichas, índices y secciones citadas por extractos web; no ejecuté ninguno de esos programas.
5. **Papers**: de Bouhlel & Rojbi 2014 leí reseña y abstract; de IJCNN 2025 sólo el abstract.
6. **Pruebas con personas**: ninguna. La validez táctil de la tabla de §5 hay que probarla con estudiantes; el prototipo mide geometría, no legibilidad.
7. **`touch-mapper`**: leí constantes, extrusión, agua, pipeline y documentos; **no** lo ejecuté (necesita Blender 2.78 + AWS).

---

## 12. Fuentes

Código (clonado en `repos/`):
- https://github.com/skarkkai/touch-mapper — `converter/tactile_constants.py`, `converter/obj-to-tactile.py` (`water_wave_pattern` :509, `add_borders` :355, `decimate` :688, `fatten` :696, `do_ways` :703), `doc/way-area-extrusion-tiers.md`, `doc/converter-pipeline-stages.md`, `converter/map_desc/map-description-classifications.json`, `AGENTS.md`.
- https://github.com/myhjiang/human_crossing — `styles/*.qml` (anchos en mm 0.26/0.5/1.0, `customdash` "5;2"), `templates/A4_fr.qpt`.
- https://github.com/matkoniecz/lunar_assembler — OSM→SVG en el navegador para corte láser. https://github.com/raphiniert/osm2tactile — OSM→mapas táctiles (Flask + osm2pgsql).

Normas y guías:
- BANA, *Guidelines and Standards for Tactile Graphics* (2022): https://brailleauthority.org/sites/default/files/tg/Tactile%20Graphics%20Standards%20and%20Guidelines%202022.pdf ; manual web: https://brailleauthority.org/tg/web-manual/tgmanual.html ; edición 2010: https://prcvi.org/media/1125/guidelines-and-standards-for-tactile-graphics.pdf
- APH, *Guidelines for Design of Tactile Graphics*: https://aph.org/research/guides — 3D4VIP / Tactiles: https://tactiles.eu/guidelines/4-1-line-symbols/ , /3-2-surfaces-and-textures/ , /4-5-minimum-distance-between-two-objects/ , /5-7-generating-maps-with-touch-mapper-org/

Servicios y productos:
- TMAP (Smith-Kettlewell): https://www.ski.org/project/tactile-map-automated-production-tmap/ ; FAQ/MAD Lab: https://madlabdesign.org/tmap-faq-and-troubleshooting/ ; evaluación (PMC 2023): https://pmc.ncbi.nlm.nih.gov/articles/PMC10065749/
- TactileView: https://www.tactileview.com/ ; manual 2024: https://www.humanware.com/wp-content/uploads/2024/11/TactileView-manual-2024.pdf
- ViewPlus TSS 9: https://viewplus.com/product/tiger-software-suite9/ ; manual IVEO Transformer Pro: https://viewplus.com/downloads/docs/manuals/VPIveo3TransformerProUserManual_2017Oct.pdf ; TSS 8: https://viewplus.com/downloads/docs/manuals/VPTSS8UserManual_2022Jun.pdf
- ElPicsPrint: https://elitagroup.com/prod/elpicsprint/ ; guía: https://elitagroup.com/manuals/elpicsprint — PictureBraille: https://pentronics.com.au/Software.html ; descripción en ULD 2012: http://www.uld-conference.org/files_of_downloads/2012/ULD2012_Proceedings.pdf (p. 126)
- Index Braille, software de gráficos: https://indexbraille.com/learn-more/index-braille-tactile-graphics ; resolución V4 (fichas): https://professional-vision-services.co.uk/products/braille-products/index-everest-d-v4-embosser , https://irie-at.com/product/everest-d-v4-refurbished

Académicos:
- Bouhlel & Rojbi (ASSETS 2014), *New Tools for Automating Tactile Geographic Map Translation*: https://doi.org/10.1145/2661334.2661335 (reseña: https://a11ybob.com/writing/reviews/69cf16dde30ec2433fd85bb1)
- Touya et al. (ISPRS 2020): https://isprs-archives.copernicus.org/articles/XLIII-B4-2020/17/2020/isprs-archives-XLIII-B4-2020-17-2020.pdf — MULTIMAGE (ICA 2022): https://ica-abs.copernicus.org/articles/5/115/2022/ica-abs-5-115-2022.pdf
- Jiang et al. (AGILE 2023): https://agile-giss.copernicus.org/articles/4/29/2023/agile-giss-4-29-2023.pdf — Luft (TGIS 2021): https://onlinelibrary.wiley.com/doi/10.1111/tgis.12794
- Chiang & Knoblock (GREC 2012): https://usc-isi-i2.github.io/papers/chiang12-grec.pdf ; (2011): https://usc-isi-i2.github.io/papers/chiang11-grec.pdf ; (LNCS): https://spatial-computing.github.io/papers/chiang12greclncs.pdf
- Revisiones sistemáticas: mapas https://doi.org/10.3390/ijgi8070293 ; gráficos táctiles https://www.mdpi.com/2227-9717/9/10/1726 — difusión guiada por texto (IJCNN 2025): https://doi.org/10.1109/ijcnn64981.2025.11228171
- OSM para personas ciegas (lista de servicios): https://wiki.openstreetmap.org/wiki/OSM_for_the_blind
