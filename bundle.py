# -*- coding: utf-8 -*-
"""Assemble app.css + state.json + app.js -> artifact.html (contenu de page) et index.html (doc complet)."""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda p: io.open(os.path.join(HERE, p), encoding="utf-8").read()

# ---------------------------------------------------------------------------
# Adresse publique du site. C'est la SEULE ligne a changer le jour ou tu passes
# sur un nom de domaine perso : elle alimente le lien canonique, les apercus de
# partage, les donnees structurees et le sitemap.
# ---------------------------------------------------------------------------
SITE_URL = "https://aniimo-france.netlify.app"
DISCORD_URL = "https://discord.gg/acyn8kxvpA"

TITLE = "Aniimo France — Codex Aniimo FR et Discord de la communauté"
DESC = ("Aniimo France, le codex francophone d'Aniimo : fiches des Aniimos, compétences, "
        "Tiers List, métiers, équipes et guides. Rejoins le Discord Aniimo FR de la communauté française.")

# Donnees structurees : elles disent explicitement a Google que « Aniimo FR » et
# « Aniimo France » designent le meme site, et rattachent le Discord a la marque.
JSONLD = """{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "%(url)s/#website",
      "url": "%(url)s/",
      "name": "Aniimo France",
      "alternateName": ["Aniimo FR", "Aniimo France Codex", "Codex Aniimo FR"],
      "description": "%(desc)s",
      "inLanguage": "fr-FR",
      "publisher": { "@id": "%(url)s/#org" }
    },
    {
      "@type": "Organization",
      "@id": "%(url)s/#org",
      "name": "Aniimo France",
      "alternateName": "Aniimo FR",
      "url": "%(url)s/",
      "logo": "%(url)s/favicon.png",
      "image": "%(url)s/og-image.jpg",
      "description": "Communauté française du jeu Aniimo : codex, guides et serveur Discord.",
      "sameAs": ["%(discord)s"]
    }
  ]
}""" % {"url": SITE_URL, "desc": DESC, "discord": DISCORD_URL}

HEAD = """<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<meta name="keywords" content="Aniimo France, Aniimo FR, Aniimo France Discord, Aniimo FR Discord, Aniimo, codex Aniimo, Tiers List Aniimo, Aniimo français, communauté Aniimo">
<meta name="author" content="Aniimo France">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#131119">
<link rel="canonical" href="%(url)s/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Aniimo France">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(url)s/">
<meta property="og:image" content="%(url)s/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%(title)s">
<meta name="twitter:description" content="%(desc)s">
<meta name="twitter:image" content="%(url)s/og-image.jpg">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="apple-touch-icon" href="favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<script type="application/ld+json">%(jsonld)s</script>
""" % {"title": TITLE, "desc": DESC, "url": SITE_URL, "jsonld": JSONLD}

# Contenu lisible SANS JavaScript. Le site entier etant dessine par app.js, un
# robot qui n'execute pas le script ne voyait jusqu'ici qu'une page vide : ce
# bloc lui donne un vrai texte a indexer (titre, description, rubriques, Discord).
NOSCRIPT = """<noscript><div style="max-width:760px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;line-height:1.6">
<h1>Aniimo France — le codex francophone d'Aniimo</h1>
<p><b>Aniimo France</b> (aussi appelé <b>Aniimo FR</b>) est le site français dédié au jeu Aniimo :
fiches complètes des Aniimos, compétences et traits, Tiers List, métiers, équipes par élément,
raretés, œufs et éclosions, météo et Prismana.</p>
<h2>Rejoindre le Discord Aniimo France</h2>
<p>La communauté française se retrouve sur le <a href="%(discord)s">Discord Aniimo France (Aniimo FR)</a>
pour échanger guides, équipes et actualités du jeu.</p>
<h2>Les rubriques du site</h2>
<ul>
<li>Tous les Aniimos — la liste complète avec statistiques</li>
<li>Les compétences — traits, compétences, Ultimes et S Core</li>
<li>Tiers List — le classement de la communauté</li>
<li>Team — les meilleures équipes par élément</li>
<li>Métiers Aniimo, Personnalités, HomeLand et Équipements</li>
<li>Informations — raretés, éléments, Aniipods, météo et Prismana, formes régionales, œufs</li>
</ul>
<p>Activez JavaScript pour afficher le site complet.</p>
</div></noscript>
""" % {"discord": DISCORD_URL}

body = (HEAD
        + '<style id="appcss">' + R("app.css") + "</style>\n"
        + '<div id="app"></div>\n'
        + NOSCRIPT
        + '<script type="application/json" id="state">' + R("state.json").strip() + "</script>\n"
        + '<script id="appjs">' + R("app.js") + "</script>")

io.open(os.path.join(HERE, "artifact.html"), "w", encoding="utf-8").write(body)
doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8">' \
      '<meta name="viewport" content="width=device-width,initial-scale=1">' + body + "</body></html>"
io.open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(doc)

# robots.txt + sitemap.xml : rediges ici pour rester cales sur SITE_URL.
io.open(os.path.join(HERE, "robots.txt"), "w", encoding="utf-8").write(
    "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % SITE_URL)
io.open(os.path.join(HERE, "sitemap.xml"), "w", encoding="utf-8").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    '  <url>\n    <loc>%s/</loc>\n    <changefreq>weekly</changefreq>\n'
    '    <priority>1.0</priority>\n  </url>\n</urlset>\n' % SITE_URL)

print("artifact.html", len(body), "octets  |  robots.txt + sitemap.xml regeneres")
