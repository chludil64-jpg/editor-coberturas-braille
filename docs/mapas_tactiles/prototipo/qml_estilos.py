import glob, re, os
for f in sorted(glob.glob("repos/human_crossing/styles/*.qml")):
    s = open(f, encoding="utf-8", errors="replace").read()
    def first(pat):
        m = re.search(pat, s)
        return m.group(1) if m else "-"
    widths = sorted(set(re.findall(r'<prop k="line_width" v="([^"]+)"', s)))
    units = sorted(set(re.findall(r'<prop k="line_width_unit" v="([^"]+)"', s)))
    dash = sorted(set(re.findall(r'<prop k="customdash" v="([^"]+)"', s)))
    style = sorted(set(re.findall(r'<prop k="line_style" v="([^"]+)"', s)))
    fills = sorted(set(re.findall(r'<prop k="color" v="([0-9,]+)"', s)))[:3]
    print(f"{os.path.basename(f):28s} w={','.join(widths)[:14]:14s} u={','.join(units):4s} "
          f"dash={','.join(dash)[:12]:12s} style={','.join(style):6s} color={fills}")
