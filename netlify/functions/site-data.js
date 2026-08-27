/* Aniimo France — publication en direct du contenu du panneau admin.
   Le panneau admin envoie ici (POST action:"publish") tout le contenu éditable
   du site (fiches, pages, styles, notes de mise à jour, etc — sans les images
   ni les icônes, trop lourdes). Chaque visiteur récupère (GET) ce contenu au
   chargement de la page et l'affiche par-dessus la version construite dans
   index.html. Rien à reconstruire, rien à redéployer : c'est en direct pour
   tout le monde dès la publication.

   Une fonction Netlify (AWS Lambda) est limitée à 6 Mo par requête/réponse —
   on se garde une bonne marge avec MAX_BYTES. Si jamais une image se glissait
   dans les données envoyées, la publication est refusée plutôt que de risquer
   un dépassement silencieux. */

const { ADMIN_KEY, blobStore, json } = require("./_shared");

const MAX_BYTES = 4 * 1024 * 1024;

exports.handler = async function (event) {
  try {
    return await handleEvent(event);
  } catch (e) {
    return json(500, { ok: false, error: (e && e.name) || "erreur serveur", message: (e && e.message) || String(e) });
  }
};

async function handleEvent(event) {
  var store = blobStore("aniimo-site");

  if (event.httpMethod === "GET") {
    var rec = await store.get("data", { type: "json" });
    return json(200, rec || { data: null, publishedAt: null });
  }

  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "méthode non supportée" });

  var body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { ok: false, error: "JSON invalide" }); }

  if (body.adminPass !== ADMIN_KEY) return json(403, { ok: false, error: "accès refusé" });

  if (body.action === "publish") {
    var payload = JSON.stringify(body.data || {});
    if (payload.length > MAX_BYTES) {
      return json(413, {
        ok: false, error: "trop volumineux",
        message: "Les données dépassent la taille autorisée — vérifie qu'aucune image n'est incluse."
      });
    }
    var rec2 = { data: body.data || {}, publishedAt: Date.now() };
    await store.setJSON("data", rec2);
    return json(200, { ok: true, publishedAt: rec2.publishedAt });
  }

  if (body.action === "unpublish") {
    await store.delete("data");
    return json(200, { ok: true });
  }

  return json(400, { ok: false, error: "action inconnue" });
}
