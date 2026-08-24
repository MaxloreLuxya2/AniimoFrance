// stamp-date.js — exécuté à chaque build Netlify (donc à chaque push) pour
// remplacer automatiquement la date "Dernière mise à jour" affichée sur le site
// par la date du jour, sans avoir à l'éditer à la main dans index.html.

const fs = require("fs");
const path = require("path");

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const now = new Date();
const formatted = now.getDate() + " " + MONTHS[now.getMonth()] + " " + now.getFullYear();

const file = path.join(__dirname, "index.html");
const html = fs.readFileSync(file, "utf8");

const updated = html.replace(/"updated":"[^"]*"/, '"updated":"' + formatted + '"');

if (updated === html) {
  console.warn('stamp-date: champ "updated" introuvable dans index.html — rien n\'a été changé.');
  process.exit(0);
}

fs.writeFileSync(file, updated);
console.log("stamp-date: date mise à jour ->", formatted);
