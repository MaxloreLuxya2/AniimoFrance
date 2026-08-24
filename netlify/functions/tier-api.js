/* Aniimo France — sauvegarde partagée des Tiers List créées par les joueurs et des votes.
   Stocke tout dans un seul blob Netlify (petite échelle, site de fan) : pas de base de données
   à gérer. Lecture (GET) publique. Écriture (POST) selon l'action demandée dans le corps JSON. */

const { getStore } = require("@netlify/blobs");

/* Même phrase que le verrou du panneau admin du site, au moment de la mise en place.
   Si tu changes la phrase de passe dans le panneau admin, dis-le à Claude pour qu'il
   mette aussi celle-ci à jour : les deux ne sont pas reliées automatiquement. */
const ADMIN_KEY = "AniimoFrance2026";

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

function emptyData() {
  return { lists: {}, officialVoters: {} };
}

async function loadData(store) {
  const d = await store.get("data", { type: "json" });
  return d && typeof d === "object" ? Object.assign(emptyData(), d) : emptyData();
}

function tallyVoters(voters) {
  const t = {};
  Object.keys(voters || {}).forEach(function (vid) {
    var v = voters[vid] || {};
    Object.keys(v).forEach(function (name) {
      t[name] = t[name] || {};
      var val = v[name];
      t[name][val] = (t[name][val] || 0) + 1;
    });
  });
  return t;
}

function listTallyOk(voters) {
  var raw = tallyVoters(voters), out = {};
  Object.keys(raw).forEach(function (n) {
    out[n] = { ok: raw[n].ok || 0, no: raw[n].no || 0 };
  });
  return out;
}
function officialTallyOk(voters) {
  var raw = tallyVoters(voters), out = {};
  Object.keys(raw).forEach(function (n) {
    out[n] = { up: raw[n].up || 0, down: raw[n].down || 0 };
  });
  return out;
}

function publicList(l) {
  return {
    id: l.id,
    pseudo: l.pseudo,
    title: l.title,
    tiers: l.tiers || {},
    at: l.at || 0,
    votes: listTallyOk(l.voters)
  };
}

exports.handler = async function (event) {
  var store = getStore({ name: "aniimo-tiers", consistency: "strong" });

  if (event.httpMethod === "GET") {
    var data = await loadData(store);
    var lists = Object.keys(data.lists).map(function (id) { return publicList(data.lists[id]); });
    return json(200, { lists: lists, officialVotes: officialTallyOk(data.officialVoters) });
  }

  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "méthode non supportée" });

  var body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { ok: false, error: "JSON invalide" }); }
  var action = body.action;

  if (action === "save-list") {
    var l = body.list || {};
    var id = String(l.id || "").slice(0, 40);
    var pseudo = String(l.pseudo || "").trim().slice(0, 30);
    if (!id || !pseudo) return json(400, { ok: false, error: "pseudo ou identifiant manquant" });
    var tiers = {};
    if (l.tiers && typeof l.tiers === "object") {
      Object.keys(l.tiers).slice(0, 300).forEach(function (n) {
        if (typeof l.tiers[n] === "string") tiers[n] = l.tiers[n].slice(0, 8);
      });
    }
    var data = await loadData(store);
    var existing = data.lists[id];
    var editToken = String(l.editToken || "");
    if (existing) {
      if (!editToken || editToken !== existing.editToken) return json(403, { ok: false, error: "cette liste appartient à un autre navigateur" });
    } else {
      editToken = "t" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    }
    data.lists[id] = {
      id: id,
      pseudo: pseudo,
      title: String(l.title || "").trim().slice(0, 60),
      tiers: tiers,
      at: Date.now(),
      editToken: editToken,
      voters: existing ? (existing.voters || {}) : {}
    };
    await store.setJSON("data", data);
    return json(200, { ok: true, editToken: editToken, list: publicList(data.lists[id]) });
  }

  if (action === "delete-list") {
    var data2 = await loadData(store);
    var target = data2.lists[String(body.id || "")];
    var isAdmin = body.adminPass === ADMIN_KEY;
    var isOwner = target && body.editToken && body.editToken === target.editToken;
    if (!isAdmin && !isOwner) return json(403, { ok: false, error: "accès refusé" });
    delete data2.lists[String(body.id || "")];
    await store.setJSON("data", data2);
    return json(200, { ok: true });
  }

  if (action === "vote-list") {
    var listId = String(body.listId || "");
    var vid = String(body.voterId || "").slice(0, 40);
    if (!listId || !vid) return json(400, { ok: false, error: "paramètres manquants" });
    var data3 = await loadData(store);
    var list3 = data3.lists[listId];
    if (!list3) return json(404, { ok: false, error: "cette liste n'existe plus" });
    var votes = body.votes && typeof body.votes === "object" ? body.votes : {};
    var clean = {};
    Object.keys(votes).slice(0, 300).forEach(function (n) {
      if (votes[n] === "ok" || votes[n] === "no") clean[n] = votes[n];
    });
    list3.voters = list3.voters || {};
    if (Object.keys(clean).length) list3.voters[vid] = clean; else delete list3.voters[vid];
    await store.setJSON("data", data3);
    return json(200, { ok: true, votes: listTallyOk(list3.voters) });
  }

  if (action === "vote-official") {
    var vid2 = String(body.voterId || "").slice(0, 40);
    if (!vid2) return json(400, { ok: false, error: "paramètres manquants" });
    var data4 = await loadData(store);
    var votes2 = body.votes && typeof body.votes === "object" ? body.votes : {};
    var clean2 = {};
    Object.keys(votes2).slice(0, 300).forEach(function (n) {
      if (votes2[n] === "up" || votes2[n] === "down") clean2[n] = votes2[n];
    });
    data4.officialVoters = data4.officialVoters || {};
    if (Object.keys(clean2).length) data4.officialVoters[vid2] = clean2; else delete data4.officialVoters[vid2];
    await store.setJSON("data", data4);
    return json(200, { ok: true, officialVotes: officialTallyOk(data4.officialVoters) });
  }

  if (action === "clear-official-vote") {
    if (body.adminPass !== ADMIN_KEY) return json(403, { ok: false, error: "accès refusé" });
    var name = body.name;
    var data5 = await loadData(store);
    Object.keys(data5.officialVoters || {}).forEach(function (vid3) {
      if (data5.officialVoters[vid3] && data5.officialVoters[vid3][name] != null) delete data5.officialVoters[vid3][name];
    });
    await store.setJSON("data", data5);
    return json(200, { ok: true });
  }

  return json(400, { ok: false, error: "action inconnue" });
};
