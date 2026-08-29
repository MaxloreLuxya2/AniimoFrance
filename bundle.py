# -*- coding: utf-8 -*-
"""Assemble app.css + state.json + app.js -> artifact.html (contenu de page) et index.html (doc complet)."""
import io, os

import json

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda p: io.open(os.path.join(HERE, p), encoding="utf-8").read()

# Le roster est relu ici pour alimenter le contenu indexable : la liste des noms
# se met donc a jour toute seule a chaque build, sans rien reecrire a la main.
_ST = json.loads(R("state.json"))
ANIIMO_NAMES = [a["name"] for a in _ST.get("aniimos", []) if not a.get("hidden")]
ELEMENTS = ["Feu", "Eau", "Plante", "Glace", "Foudre", "Ténèbres", "Roche", "Vent", "Lumière"]

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
      "alternateName": ["Aniimo FR", "Aniimo France Codex", "Codex Aniimo FR", "Aniimo Francophone",\n                        "Wiki Aniimo FR", "Aniimo France Discord", "Aniimo FR Discord"],
      "description": "%(desc)s",
      "inLanguage": "fr-FR",
      "publisher": { "@id": "%(url)s/#org" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": { "@type": "EntryPoint", "urlTemplate": "%(url)s/?q={search_term_string}" },
        "query-input": "required name=search_term_string"
      }
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
      "sameAs": ["%(discord)s"],
      "knowsAbout": ["Aniimo", "Tiers List Aniimo", "Aniimos", "compétences Aniimo",
                     "métiers Aniimo", "Prismana", "Aniipods", "HomeLand"]
    },
    {
      "@type": "CollectionPage",
      "@id": "%(url)s/#codex",
      "url": "%(url)s/",
      "name": "Codex Aniimo France — tous les Aniimos en français",
      "isPartOf": { "@id": "%(url)s/#website" },
      "inLanguage": "fr-FR",
      "about": { "@type": "VideoGame", "name": "Aniimo" },
      "mainEntity": {
        "@type": "ItemList",
        "name": "Liste des Aniimos",
        "numberOfItems": %(ncount)d,
        "itemListElement": [%(items)s]
      }
    }
  ]
}""" % {"url": SITE_URL, "desc": DESC, "discord": DISCORD_URL,
         "ncount": len(ANIIMO_NAMES),
         "items": ", ".join(
             '{"@type":"ListItem","position":%d,"name":%s}' % (i + 1, json.dumps(n, ensure_ascii=False))
             for i, n in enumerate(ANIIMO_NAMES))}

HEAD = """<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<meta name="keywords" content="Aniimo France, Aniimo FR, Aniimo France Discord, Aniimo FR Discord, Aniimo, jeu Aniimo, Aniimo français, Aniimo francophone, codex Aniimo, wiki Aniimo FR, dex Aniimo, liste des Aniimos, Tiers List Aniimo, tier list Aniimo français, guide Aniimo FR, équipe Aniimo, meilleurs Aniimos, compétences Aniimo, métiers Aniimo, Prismana, Aniipods, HomeLand Aniimo, œufs Aniimo, éclosion Aniimo, communauté Aniimo France">
<meta name="author" content="Aniimo France">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#131119">\n<meta http-equiv="content-language" content="fr-FR">\n<link rel="alternate" hreflang="fr" href="%(url)s/">\n<link rel="alternate" hreflang="x-default" href="%(url)s/">
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
NOSCRIPT = """<noscript><div style="max-width:820px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;line-height:1.6">
<h1>Aniimo France — le codex francophone d'Aniimo</h1>
<p><b>Aniimo France</b>, aussi appelé <b>Aniimo FR</b>, est le site français dédié au jeu <b>Aniimo</b> :
le codex complet des Aniimos en français, leurs compétences, traits, Ultimes et S Core, la Tiers List
de la communauté, les métiers, les équipes par élément, les raretés, les œufs et éclosions,
la météo et les Prismana, les formes régionales, les Aniipods et le HomeLand.</p>

<h2>Aniimo France Discord — rejoindre le serveur Aniimo FR</h2>
<p>La communauté française et québécoise se retrouve sur le
<a href="%(discord)s">Discord Aniimo France</a>. Que tu cherches
« <b>Aniimo France Discord</b> » ou « <b>Aniimo FR Discord</b> », il s'agit du même serveur :
celui de la communauté francophone d'Aniimo, où l'on échange guides, compositions d'équipe,
astuces et actualités du jeu en français.</p>

<h2>Que trouve-t-on sur Aniimo France ?</h2>
<ul>
<li><b>Tous les Aniimos</b> — la liste complète des %(ncount)d Aniimos avec leurs statistiques (PV, ATK, défenses, BREAK, REGEN)</li>
<li><b>Les compétences</b> — traits, compétences, Ultimes et S Core de chaque Aniimo</li>
<li><b>Tiers List</b> — le classement des meilleurs Aniimos, voté par la communauté française</li>
<li><b>Team</b> — les meilleures équipes par élément et les règles de composition</li>
<li><b>Métiers Aniimo</b> — Loisir, Artisanat, Parfumerie et Portage</li>
<li><b>Personnalités</b> — les bonus de personnalité du Foyer et du HomeLand</li>
<li><b>Informations</b> — raretés, éléments, Aniipods, météo &amp; Prismana, formes régionales, braquage d'œufs, éclosions</li>
<li><b>Équipements</b> et <b>HomeLand</b></li>
</ul>

<h2>Les éléments d'Aniimo</h2>
<p>%(elements)s.</p>

<h2>Liste des Aniimos</h2>
<p>%(names)s.</p>

<p>Activez JavaScript pour afficher le site complet et interactif.</p>
</div></noscript>
""" % {"discord": DISCORD_URL, "ncount": len(ANIIMO_NAMES),
       "elements": ", ".join(ELEMENTS),
       "names": ", ".join(ANIIMO_NAMES)}

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
