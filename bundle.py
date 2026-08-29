# -*- coding: utf-8 -*-
"""Assemble app.css + state.json + app.js -> artifact.html (contenu de page) et index.html (doc complet)."""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda p: io.open(os.path.join(HERE, p), encoding="utf-8").read()

HEAD = """<title>Aniimo France</title>
<link rel="icon" type="image/png" href="favicon.png">
<link rel="apple-touch-icon" href="favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
"""

body = (HEAD
        + '<style id="appcss">' + R("app.css") + "</style>\n"
        + '<div id="app"></div>\n'
        + '<script type="application/json" id="state">' + R("state.json").strip() + "</script>\n"
        + '<script id="appjs">' + R("app.js") + "</script>")

io.open(os.path.join(HERE, "artifact.html"), "w", encoding="utf-8").write(body)
doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8">' \
      '<meta name="viewport" content="width=device-width,initial-scale=1">' + body + "</body></html>"
io.open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(doc)
print("artifact.html", len(body), "octets")
