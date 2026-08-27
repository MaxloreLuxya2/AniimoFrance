/* Aniimo France — bouts de code communs à toutes les fonctions Netlify du site
   (accès aux Blobs, mot de passe admin, réponses JSON). Un seul endroit à
   modifier si l'un de ces réglages change. */

const { getStore } = require("@netlify/blobs");

/* Même phrase que le verrou du panneau admin du site, au moment de la mise en place.
   Si tu changes la phrase de passe dans le panneau admin, dis-le à Claude pour qu'il
   mette aussi celle-ci à jour : les deux ne sont pas reliées automatiquement. */
const ADMIN_KEY = "AniimoFrance2026";

/* La configuration automatique de Netlify Blobs (siteID/token injectés tout seuls)
   n'est pas fiable sur tous les sites en ce moment. Si les variables d'environnement
   BLOBS_SITE_ID et BLOBS_TOKEN sont définies (Project configuration → Environment
   variables), on les utilise explicitement ; sinon on retombe sur l'injection
   automatique. */
function blobStore(name) {
  var opts = { name: name, consistency: "strong" };
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    opts.siteID = process.env.BLOBS_SITE_ID;
    opts.token = process.env.BLOBS_TOKEN;
  }
  return getStore(opts);
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

module.exports = { ADMIN_KEY, blobStore, json };
