import json, urllib.parse, subprocess, sys

def api(params):
    q = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    out = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0 (RE research)", q],
                         capture_output=True, text=True).stdout
    return json.loads(out)

terms = ["mapa de Chubut", "Patagonia mapa fisico", "Argentina mapa provincias",
         "mapa turistico Trelew", "laguna Colhue Huapi mapa"]
for term in terms:
    r = api({"action": "query", "format": "json", "list": "search",
             "srnamespace": "6", "srlimit": "6", "srsearch": term})
    print("==", term)
    for s in r.get("query", {}).get("search", []):
        print("   ", s["title"])
