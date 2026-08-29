(function () {
  "use strict";

  var RAW = document.getElementById("state").textContent;
  var S = JSON.parse(RAW);
  var draftLoaded = false;
  try {
    var d = localStorage.getItem("aniimo.draft");
    if (d) { S = JSON.parse(d); draftLoaded = true; }
  } catch (e) {}

  /* Un brouillon enregistré avant une mise à jour peut être incomplet :
     on y réinjecte ce que la version publiée apporte de nouveau. */
  if (draftLoaded) {
    var PUB = JSON.parse(RAW);
    ["specs", "effects", "speeds", "pages", "pageEffects", "bosses", "bossTypes",
     "chart", "elemIcons", "elements", "roles", "levels", "meta", "abilities",
     "evoLines", "elemTeams", "tierVotes", "tabs", "textStyles", "pageStyle"].forEach(function (k) {
      if (!S[k] || (Array.isArray(S[k]) && !S[k].length)) S[k] = PUB[k];
    });
    /* icônes de compétences : on complète sans écraser celles ajoutées dans l'admin */
    ["skillIcons", "traitIcons", "skillIconsByName", "traitIconsByName"].forEach(function (k) {
      S[k] = S[k] || {};
      Object.keys(PUB[k] || {}).forEach(function (n) { if (!S[k][n]) S[k][n] = PUB[k][n]; });
    });
    S.team = S.team || PUB.team;
    if (!S.team.pinned) S.team.pinned = (PUB.team || {}).pinned || [];
    /* la bannière et les équipes livrées avec le site suivent la publication */
    if (PUB.heroImg) S.heroImg = PUB.heroImg;
    if (PUB.roleIcons) S.roleIcons = PUB.roleIcons;
    if (PUB.wipImg) S.wipImg = PUB.wipImg;
    S.elemTeams = S.elemTeams || {};
    Object.keys(PUB.elemTeams || {}).forEach(function (e) {
      var mine = S.elemTeams[e];
      if (!mine || !(mine.members || []).filter(Boolean).length) S.elemTeams[e] = PUB.elemTeams[e];
    });
    /* Champs issus des sources (non modifiables dans l'admin) : ils suivent
       toujours la version publiée dès que celle-ci change de version de données. */
    var DERIVED = ["sk2", "traitName", "traitDesc", "trait", "traitFr", "skills",
                   "tags", "synergy", "type", "typeGuess", "typeNote",
                   "fin", "evo"];
    var stale = ((S.meta || {}).dataVersion || 0) !== ((PUB.meta || {}).dataVersion || 0);
    if (stale) {
      /* blocs entièrement pilotés par les sources : un vieux brouillon les
         gardait figés (c'est ce qui laissait d'anciennes Spécialités du Foyer). */
      ["chart", "elements", "elemIcons", "evoLines", "levels",
       "effects", "speeds", "pages"].forEach(function (k) {
        if (PUB[k]) S[k] = PUB[k];
      });
      /* effets d'arrivée : on répare une configuration devenue inutilisable
         (catégorie absente, effet disparu du catalogue, ou tout coupé alors que
         la version publiée en propose) sans écraser un choix volontaire. */
      var FXOK = {};
      (PUB.effects || []).forEach(function (f) { FXOK[f.key] = 1; });
      S.pageEffects = S.pageEffects || {};
      var allNone = true;
      Object.keys(PUB.pageEffects || {}).forEach(function (k) {
        var mine = S.pageEffects[k];
        if (!mine || !FXOK[mine.fx]) S.pageEffects[k] = PUB.pageEffects[k];
        if ((S.pageEffects[k] || {}).fx && S.pageEffects[k].fx !== "none") allNone = false;
      });
      if (allNone) S.pageEffects = JSON.parse(JSON.stringify(PUB.pageEffects || {}));
      /* spécialités : on reprend la source mais on garde la note de l'admin */
      if (PUB.specs) {
        var notes = {};
        (S.specs || []).forEach(function (x) { if (x.note) notes[x.name] = x.note; });
        S.specs = JSON.parse(JSON.stringify(PUB.specs));
        S.specs.forEach(function (x) { if (notes[x.name]) x.note = notes[x.name]; });
      }
    }
    var byName = {};
    (S.aniimos || []).forEach(function (a) { byName[a.name] = a; });
    (PUB.aniimos || []).forEach(function (p) {
      var a = byName[p.name];
      if (!a) { S.aniimos.push(p); return; }
      if (!a.img && p.img) a.img = p.img;
      /* toute nouvelle clé publiée que le brouillon ignore encore */
      Object.keys(p).forEach(function (k) { if (!(k in a)) a[k] = p[k]; });
      if (stale) DERIVED.forEach(function (k) { if (k in p) a[k] = p[k]; });
    });
    if (stale) S.meta = PUB.meta;
  }

  var GRAD = {
    "Feu": ["#F0653F", "#B62A0E"], "Eau": ["#4C93E0", "#0F4E9E"], "Plante": ["#5FBF63", "#1E6B2A"],
    "Glace": ["#63CDE0", "#1B7F97"], "Foudre": ["#F5C63A", "#B87D00"],
    "Ténèbres": ["#9A6ECC", "#4A2280"], "Roche": ["#B98455", "#6E401A"],
    "Vent": ["#48C99A", "#0A7A52"], "Lumière": ["#FFE07A", "#C79A00"]
  };
  var ELEM_ORDER = ["Feu", "Eau", "Plante", "Glace", "Foudre", "Ténèbres", "Roche", "Vent", "Lumière"];
  var TYPE_COLOR = { "Physique": "#C0504D", "Magique": "#4F6BAF", "Soin": "#57A773" };
  var ROLE_ORDER = ["DPS", "BREAK", "SUPPORT", "REGEN", "HEAL"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  function total(a) { return a.hp + a.atk + a.pdef + a.mdef + a.brk + a.regen; }
  function top3(a) { return (a.skills || []).slice(0, 3); }
  function score(a) { return top3(a).reduce(function (s, k) { return s + k.m; }, 0); }
  function best(a) { return a.skills && a.skills.length ? a.skills[0].m : 0; }
  /* nom FR quand on l'a (sk2 porte la traduction), sinon le nom du jeu */
  function skFr(a, n) {
    var l = a.sk2 || [];
    for (var i = 0; i < l.length; i++) if (l[i].n === n) return l[i].nf || n;
    return n;
  }
  function bestName(a) {
    return a.skills && a.skills.length ? skFr(a, a.skills[0].n) : "attaque de base";
  }
  function hit(a) { return Math.round(a.atk * best(a) / 100); }
  function jobOf(k) { for (var i = 0; i < S.jobs.length; i++) if (S.jobs[i].key === k) return S.jobs[i]; return null; }
  function specOf(k) {
    for (var i = 0; i < (S.specs || []).length; i++)
      if (S.specs[i].key === k || S.specs[i].name === k) return S.specs[i];
    return null;
  }
  /* La spécialité du Foyer est portée par l'élément : elle se déduit, elle ne se saisit plus. */
  function specsOf(a) { return a.elems || []; }
  function mainJob(a) { return a.jobs && a.jobs.length ? jobOf(a.jobs[0]) : null; }
  function findAni(n) { for (var i = 0; i < S.aniimos.length; i++) if (S.aniimos[i].name === n) return S.aniimos[i]; return null; }
  /* Aniimo masqués (drapeau "hidden") : leurs données restent en base pour un
     retour en arrière plus tard, mais ils n'apparaissent nulle part sur le
     site public (rosters, tiers, recherche, équipes...) — seul le panneau
     admin continue de les lister pour pouvoir les gérer. */
  function activeAniimos() { return S.aniimos.filter(function (a) { return !a.hidden; }); }
  function chartOf(e) { return (S.chart || {})[e] || { strong: [], weak: [], resist: [] }; }

  function defs() {
    var g = ELEM_ORDER.map(function (e) {
      var c = GRAD[e];
      return '<linearGradient id="gr-' + slug(e) + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + c[0] + '"/><stop offset="100%" stop-color="' + c[1] + '"/></linearGradient>';
    }).join("");
    return '<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>' + g + "</defs></svg>";
  }

  function icon(a, size) {
    size = size || 24;
    if (a.img) {
      return '<img class="ico" src="' + a.img + '" alt="' + esc(a.name) + '" loading="lazy" ' +
        'style="width:' + size + 'px;height:' + size + 'px">';
    }
    var e = a.elems && a.elems[0] ? a.elems[0] : "Vent";
    var c = GRAD[e] || ["#9AA0A6", "#5F6368"];
    var role = (S.roles[a.role] || {}).color || "#888";
    var txt = a.name.slice(0, 3).toUpperCase();
    return '<svg class="ico" style="width:' + size + 'px;height:' + size + 'px" viewBox="0 0 64 64" role="img" aria-label="' + esc(a.name) + '">' +
      '<circle cx="32" cy="32" r="29" fill="url(#gr-' + slug(e) + ')" stroke="' + c[1] + '" stroke-width="3"/>' +
      '<text x="32" y="41" text-anchor="middle" font-family="IBM Plex Sans, Arial, sans-serif" font-size="22" font-weight="700" fill="#fff">' +
      esc(txt) + "</text></svg>";
  }

  function elemChip(e) {
    var im = (S.elemIcons || {})[e];
    return '<span class="chip sm el" style="background:' + (S.elements[e] || "#888") + '">' +
      (im ? '<img src="' + im + '" alt="" class="elico">' : "") + esc(e) + "</span>";
  }
  /* encadré vert : une astuce d'utilisation */
  function tipNote(txt, cls) {
    return '<p class="tipnote' + (cls ? " " + cls : "") + '"><span>Astuce</span>' + esc(txt) + "</p>";
  }
  var TIP_CLICK = "Cliquez sur l'icône ou le nom de l'Aniimo pour avoir les informations.";

  /* encadré or : le liseré s'anime en continu */
  function goldNote(label, txt) {
    return '<p class="abilnote"><span>' + esc(label) + "</span>" + esc(txt) + "</p>";
  }
  function roleChip(r) {
    var im = (S.roleIcons || {})[r];
    return '<span class="chip sm" style="background:' + ((S.roles[r] || {}).color || "#888") + '">' +
      (im ? '<img src="' + im + '" alt="" class="elico">' : "") + esc(r) + "</span>";
  }
  /* --- pictogrammes de compétences (SVG inline, suivent la couleur du type) --- */
  var SK_SVG = {
    Physique: '<path d="M13.5 3.5 20 3l-.5 6.5-7.2 7.2-6-6L13.5 3.5Z"/><path d="M6.3 17.7 3 21m2.2-5.4 3.2 3.2"/>',
    Magique: '<path d="M12 2.6 13.9 8l5.5 1.9-5.5 1.9L12 17.2 10.1 11.8 4.6 9.9 10.1 8 12 2.6Z"/><path d="M18.6 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
    Autre: '<circle cx="12" cy="12" r="3.4"/><path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M5.6 5.6l2.3 2.3M16.1 16.1l2.3 2.3M18.4 5.6l-2.3 2.3M7.9 16.1l-2.3 2.3"/>'
  };
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0c.7 6.4 4.9 10.6 12 12-7.1 1.4-11.3 5.6-12 12-.7-6.4-4.9-10.6-12-12C7.1 10.6 11.3 6.4 12 0Z"/></svg>';
  /* nom d'un Aniimo, décoré (dégradé + étincelles) quand il est Légendaire (arc-en-ciel)
     ou Starter (turquoise) */
  function nameHtml(a) {
    if (!a || (!a.legendary && !a.starter)) return esc(a && a.name);
    var cls = a.legendary ? "legendname" : "startername";
    var sp = "";
    for (var i = 1; i <= 5; i++) sp += '<span class="sp sp' + i + '">' + STAR + "</span>";
    return '<span class="' + cls + '">' + esc(a.name) + sp + "</span>";
  }
  function skKey(aniName, skName) { return aniName + "|" + skName; }
  function skImg(uri, alt) {
    return '<span class="skico art"><img src="' + uri + '" alt="' + esc(alt || "") + '" loading="lazy"></span>';
  }
  function skIcon(t, key, name) {
    var uri = (key && S.skillIcons ? S.skillIcons[key] : null) ||
              (name && S.skillIconsByName ? S.skillIconsByName[name] : null);
    if (uri) return skImg(uri, "");
    var k = SK_SVG[t] ? t : "Autre";
    var c = TYPE_COLOR[t] || "var(--muted)";
    return '<span class="skico" style="color:' + c + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SK_SVG[k] + "</svg></span>";
  }
  function traitIcon(aniName, traitName) {
    var uri = (aniName && S.traitIcons ? S.traitIcons[aniName] : null) ||
              (traitName && S.traitIconsByName ? S.traitIconsByName[traitName] : null);
    if (uri) return skImg(uri, "");
    return '<span class="skico trico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2.8 19.2 6v5.6c0 4.3-3 8.1-7.2 9.6-4.2-1.5-7.2-5.3-7.2-9.6V6L12 2.8Z"/>' +
      '<path d="m12 8.3 1.35 2.9 3 .45-2.17 2.2.51 3.15L12 15.5l-2.69 1.5.51-3.15-2.17-2.2 3-.45L12 8.3Z"/></svg></span>';
  }

  function typeChip(a) {
    if (!a.type || a.type === "n.c.") return '<span class="chip sm ghost">n.c.</span>';
    return '<span class="chip sm" style="background:' + (TYPE_COLOR[a.type] || "#888") + '"' +
      (a.typeNote ? ' title="' + esc(a.typeNote) + '"' : "") + ">" + esc(a.type) + "</span>";
  }
  /* --- pictogrammes des métiers (extraits des puces du jeu) --- */
  function jobIcon(j, size) {
    if (j.img) return '<img class="jsvg" src="' + j.img + '" alt="" width="' + size +
      '" height="' + size + '">';
    return esc(j.icon || "");
  }

  function jobChips(a) {
    var out = [];
    (a.jobs || []).forEach(function (k) {
      var j = jobOf(k);
      if (j) out.push('<span class="chip sm jobchip" style="background:' + j.color + '">' + jobIcon(j, 12) +
        esc(j.name) + (a.jobLevel ? " " + a.jobLevel : "") + "</span>");
    });
    if (!out.length) return '<span class="chip sm ghost">aucun</span>';
    return out.join(" ");
  }
  function bar(v, max, color) {
    var p = Math.max(2, Math.round((v / max) * 100));
    return '<span class="barcell"><span class="bar"><i style="width:' + p + '%;background:' + color + '"></i></span><b>' + v + "</b></span>";
  }

  var TAG_FR = {
    ep: "rend de l'EP", epMax: "relève le plafond d'EP", dmgUp: "augmente les dégâts", crit: "monte le taux critique",
    debuff: "affaiblit la cible", breakUp: "accélère le BREAK", heal: "soigne",
    regen: "entretient la régénération", cleanse: "dissipe les malus", shield: "protège",
    stun: "étourdit", revive: "se relève", stealth: "marque et se cache", team: "sur toute l'équipe"
  };

  /* ---------------- notes de rôle (tiers list) ---------------- */
  var KIT_W = {
    DPS:     { dmgUp: 22, crit: 20, debuff: 12, ep: 10, epMax: 10, breakUp: 8, stun: 6, revive: 8, team: 6 },
    BREAK:   { breakUp: 30, debuff: 20, stun: 16, shield: 8, dmgUp: 8, ep: 6, team: 6 },
    SUPPORT: { dmgUp: 26, crit: 22, debuff: 20, epMax: 24, ep: 18, team: 16, breakUp: 12, heal: 8, cleanse: 8 },
    REGEN:   { epMax: 34, ep: 26, regen: 18, team: 16, heal: 14, dmgUp: 12, debuff: 10, cleanse: 8, shield: 8 },
    HEAL:    { heal: 30, cleanse: 18, epMax: 22, ep: 18, team: 16, regen: 12, shield: 10 }
  };
  function kitScore(a, role) {
    var w = KIT_W[role] || {}, s = 0;
    (a.tags || []).forEach(function (t) { if (w[t]) s += w[t]; });
    if ((a.tags || []).indexOf("team") >= 0) s *= 1.15;
    return s;
  }
  function kitLabel(a) {
    var out = (a.tags || []).filter(function (t) { return t.indexOf("elem:") !== 0 && t !== "team"; })
      .map(function (t) { return TAG_FR[t] || t; });
    if ((a.tags || []).indexOf("team") >= 0 && out.length) out[0] = out[0] + " (équipe)";
    return out.length ? out.join(" · ") : "aucun effet d'équipe identifié";
  }

  function norm(v, lo, hi) { return hi === lo ? 50 : Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); }
  /* forme finale : pas d'évolution connue (les lignées viennent des sources) */
  function isFinal(a) { return a.fin !== 0; }
  function allScores() {
    var out = [];
    ROLE_ORDER.forEach(function (r) { out = out.concat(roleScores(r)); });
    return out.sort(function (x, y) { return y.s - x.s || y.kit - x.kit || total(y.a) - total(x.a); });
  }
  function roleScores(role) {
    if (role === "ALL") return allScores();
    var list = activeAniimos().filter(function (a) { return a.role === role; });
    if (!list.length) return [];
    function rng(f) {
      var vs = list.map(f);
      return [Math.min.apply(null, vs), Math.max.apply(null, vs)];
    }
    var F = {
      DPS: [[hit, .45], [score, .25], [function (a) { return a.atk; }, .20], [total, .10]],
      BREAK: [[function (a) { return a.brk; }, .55], [best, .20], [function (a) { return a.pdef + a.hp; }, .15], [total, .10]],
      SUPPORT: [[function (a) { return a.regen; }, .30], [function (a) { return a.atk; }, .25], [function (a) { return a.brk; }, .25], [total, .20]],
      REGEN: [[function (a) { return a.regen; }, .40], [function (a) { return a.hp; }, .25], [function (a) { return a.pdef + a.mdef; }, .20], [total, .15]],
      HEAL: [[function (a) { return a.regen; }, .40], [function (a) { return a.hp; }, .35], [function (a) { return a.mdef; }, .15], [total, .10]]
    }[role] || [[total, 1]];
    var ranges = F.map(function (p) { return rng(p[0]); });
    var kits = list.map(function (a) { return kitScore(a, role); });
    var kmin = Math.min.apply(null, kits), kmax = Math.max.apply(null, kits);
    return list.map(function (a, idx) {
      var st = 0;
      F.forEach(function (p, i) { st += norm(p[0](a), ranges[i][0], ranges[i][1]) * p[1]; });
      var kn = norm(kits[idx], kmin, kmax);
      return { a: a, s: Math.round(st * 0.55 + kn * 0.45), stat: Math.round(st), kit: Math.round(kn) };
    }).sort(function (x, y) { return y.s - x.s || y.kit - x.kit || total(y.a) - total(x.a); });
  }
  var ROLE_CRIT = {
    DPS: "statistiques (55%) : dégâts du meilleur coup, puissance des compétences, ATK — et apport du kit (45%) : bonus de dégâts, critiques, malus sur la cible.",
    BREAK: "statistiques (55%) : stat BREAK, puissance de la meilleure compétence, encaissement — et apport du kit (45%) : accélération du BREAK, étourdissement, défense rongée.",
    SUPPORT: "statistiques (55%) : REGEN, ATK, BREAK d'appoint — et apport du kit (45%) : bonus de dégâts et de critique pour l'équipe, malus, énergie rendue.",
    REGEN: "statistiques (55%) : REGEN, PV, défenses — et apport du kit (45%) : énergie rendue, plafond d'EP, régénération et bonus d'équipe.",
    HEAL: "statistiques (55%) : REGEN, PV, DÉF. Mag. — et apport du kit (45%) : soins, dissipation, énergie rendue, portée sur l'équipe."
  };

  /* ---------------- vue ---------------- */
  var animate = false;
  /* effet d'ouverture de la fiche détaillée d'un Aniimo : indépendant du drapeau
     "animate" ci-dessus (qui rejouerait aussi l'effet d'arrivée de toute la page
     en dessous) — actif seulement le temps du rendu qui ouvre la pop-up. */
  var detailOpening = false;
  /* effet "Mise au point" (assez lent) sur le panneau central du Devblog,
     rejoué uniquement quand on clique une version dans la colonne de gauche —
     même principe que detailOpening : ne touche pas le reste de la page. */
  var devOpening = false;
  /* fermeture de la fiche détaillée : on rejoue l'effet "Profondeur" à l'envers
     avant de retirer réellement la pop-up, plutôt que de la faire disparaître net. */
  function closeDetail() {
    var dlg = document.querySelector(".dlg");
    var side = document.querySelector(".dlgside");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!dlg || reduced) { view.detail = null; render(); return; }
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      view.detail = null; render();
    };
    /* "detailin" reste sur l'élément après l'ouverture ; comme detailout rejoue le
       même nom de keyframe qu'une variante inversée de celui-ci, changer juste la
       classe ne suffit pas à relancer l'animation (le navigateur ne redémarre pas
       une animation déjà terminée si animation-name ne change pas visiblement) —
       on retire donc l'ancienne classe et on force un reflow avant d'ajouter la
       nouvelle, avec un vrai jeu de keyframes dédié à la sortie. */
    [dlg, side].forEach(function (el) {
      if (!el) return;
      el.classList.remove("detailin");
      void el.offsetWidth;
      el.classList.add("detailout");
    });
    dlg.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 650); /* filet de sécurité si l'événement ne se déclenche pas */
  }
  function fxOf(page) {
    var c = (S.pageEffects || {})[page] || {};
    return { fx: c.fx || "none", sp: c.sp || "mid" };
  }
  function animClass(page) {
    if (!animate) return "";
    var c = fxOf(page || view.tab);
    if (c.fx === "none") return "";
    return " fx fx-" + c.fx + " spd-" + c.sp;
  }
  var view = {
    tab: "accueil", q: "", elem: "", role: "", job: "", type: "", sort: "no", dir: 1, pick: null,
    teamMode: "manuel", teamMain: "Fulmintis", teamSlots: ["", "", "", ""], adminSec: "aniimo",
    tcreate: false, tpick: null, tfold: false, tvote: false,
    openPicker: null, pickerQ: "", boss: "", bossType: "", pins: null, abil: "homeland", tier: "ALL", detail: null,
    infoTag: "raretes", etWhyOpen: {}, etInfoOpen: null, elemInfo: "Feu", devOpen: 0, customEdit: null
  };

  var TABS = [
    { id: "accueil", label: "Accueil", kind: "home", grp: "Fiches" },
    { id: "informations", label: "Informations", kind: "wip", grp: "Fiches" },
    { id: "tous", label: "Tous les Aniimos", kind: "roster", grp: "Fiches" },
    { id: "puissance", label: "Les compétences", kind: "power", grp: "Fiches" },
    { id: "tiers", label: "Tiers List", kind: "tier", grp: "Fiches" },
    { id: "team", label: "Team", kind: "team", grp: "Fiches" },
    { id: "equipements", label: "Equipements", kind: "wip", grp: "Fiches" },
    { id: "abilites", label: "Abilités", kind: "abil", grp: "Fiches" },
    { id: "metiers", label: "Métiers Aniimo", kind: "jobs", grp: "Fiches" },
    { id: "homeland", label: "HomeLand", kind: "wip", grp: "Fiches" },
    { id: "admin", label: "Panneau admin", kind: "admin", grp: "Gestion" }
  ];
  /* les catégories peuvent être renommées ou réordonnées dans l'admin */
  function tabs() {
    var t = (S.tabs && S.tabs.length) ? S.tabs : TABS;
    return t.filter(function (x) { return x && x.id; });
  }
  function tabOf(id) {
    var t = tabs();
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return t[0] || TABS[0];
  }

  function rows(tab) {
    var list = activeAniimos().slice();
    if (tab && tab.role) list = list.filter(function (a) { return a.role === tab.role; });
    if (view.elem) list = list.filter(function (a) { return a.elems.indexOf(view.elem) >= 0; });
    if (view.role) list = list.filter(function (a) { return a.role === view.role; });
    if (view.job) list = list.filter(function (a) {
      return view.job === "aucun" ? !(a.jobs || []).length : (a.jobs || []).indexOf(view.job) >= 0;
    });
    if (view.type) list = list.filter(function (a) { return a.type === view.type; });
    if (view.q) {
      var q = view.q.toLowerCase();
      list = list.filter(function (a) {
        return a.name.toLowerCase().indexOf(q) >= 0 || a.no.indexOf(q) >= 0 ||
          (a.traitFr || "").toLowerCase().indexOf(q) >= 0 ||
          (a.skills || []).some(function (s) { return s.n.toLowerCase().indexOf(q) >= 0; });
      });
    }
    var get = {
      no: function (a) { return parseInt(a.no, 10); }, name: function (a) { return a.name.toLowerCase(); },
      elem: function (a) { return a.elems[0]; }, role: function (a) { return a.role; },
      job: function (a) { return mainJob(a) ? mainJob(a).rank : 9; },
      lvl: function (a) { return a.jobLevel || 0; }, type: function (a) { return a.type || ""; },
      atk: function (a) { return a.atk; }, hp: function (a) { return a.hp; }, pdef: function (a) { return a.pdef; },
      mdef: function (a) { return a.mdef; }, brk: function (a) { return a.brk; }, regen: function (a) { return a.regen; },
      total: total, score: score, best: best, dmg: hit
    }[view.sort] || function (a) { return a.atk; };
    var dir = view.dir;
    list.sort(function (x, y) {
      var A = get(x), B = get(y);
      if (A < B) return -dir; if (A > B) return dir;
      return total(y) - total(x);
    });
    return list;
  }

  function th(label, key, cls) {
    var on = view.sort === key;
    return '<th class="sortable ' + (cls || "") + '" data-sort="' + key + '">' + esc(label) +
      '<span class="arrow">' + (on ? (view.dir === 1 ? "▲" : "▼") : "") + "</span></th>";
  }

  function toolbar(opts) {
    opts = opts || {};
    var els = ELEM_ORDER.map(function (e) { return '<option value="' + e + '"' + (view.elem === e ? " selected" : "") + ">" + e + "</option>"; }).join("");
    var rls = ROLE_ORDER.map(function (r) { return '<option value="' + r + '"' + (view.role === r ? " selected" : "") + ">" + r + "</option>"; }).join("");
    var jbs = S.jobs.map(function (j) { return '<option value="' + j.key + '"' + (view.job === j.key ? " selected" : "") + ">" + j.icon + " " + j.name + "</option>"; }).join("") +
      '<option value="aucun"' + (view.job === "aucun" ? " selected" : "") + ">Aucun métier</option>";
    var tps = ["Physique", "Magique"].map(function (t) { return '<option value="' + t + '"' + (view.type === t ? " selected" : "") + ">" + t + "</option>"; }).join("");
    return '<div class="toolbar">' +
      '<div class="field"><label for="q">Chercher</label><input id="q" type="search" placeholder="nom, compétence…" value="' + esc(view.q) + '"></div>' +
      '<div class="field"><label for="fe">Élément</label><select id="fe"><option value="">tous</option>' + els + "</select></div>" +
      (opts.noRole ? "" : '<div class="field"><label for="fr">Rôle</label><select id="fr"><option value="">tous</option>' + rls + "</select></div>") +
      '<div class="field"><label for="fj">Métier</label><select id="fj"><option value="">tous</option>' + jbs + "</select></div>" +
      '<div class="field"><label for="ft">Type</label><select id="ft"><option value="">tous</option>' + tps + "</select></div>" +
      '<button class="btn" id="reset">Réinitialiser</button></div>';
  }

  /* ---------------- fiche : tous les Aniimos ---------------- */
  function viewRoster() {
    var list = rows(null);
    var maxAtk = Math.max.apply(null, activeAniimos().map(function (a) { return a.atk; }));
    var maxTot = Math.max.apply(null, activeAniimos().map(total));
    var h = '<div class="head"><h1>Tous les Aniimos</h1><span class="count">' + list.length + " / " +
      activeAniimos().length + "</span>" + tipNote(TIP_CLICK, "right") + "</div>" +
      toolbar({}) + '<div class="tablewrap"><table class="tight roster' + animClass() + '"><thead><tr>' +
      '<th class="w-rank">#</th><th class="w-ico"></th>' + th("N°", "no", "w-no") + th("Nom", "name", "w-nm") +
      th("Élément", "elem") + th("Rôle", "role") + th("Métier", "job") + th("Type", "type") +
      th("ATK", "atk", "num") + th("PV", "hp", "num") + th("D.P", "pdef", "num") +
      th("D.M", "mdef", "num") + th("BRK", "brk", "num") + th("RGN", "regen", "num") +
      th("Total", "total", "num") + "</tr></thead><tbody>";
    list.forEach(function (a, i) {
      h += '<tr class="fxi" style="--i:' + Math.min(i, 26) + '">' +
        '<td class="rank">' + (i + 1) + "</td><td>" + aniLink(a, icon(a)) + '</td><td class="no">' + esc(a.no) + "</td>" +
        '<td class="nm">' + aniLink(a, nameHtml(a)) + "</td><td>" + a.elems.map(elemChip).join(" ") + "</td>" +
        "<td>" + roleChip(a.role) + "</td><td>" + jobChips(a) + "</td><td>" + typeChip(a) + "</td>" +
        '<td class="num">' + bar(a.atk, maxAtk, (S.elements[a.elems[0]] || "#888")) + "</td>" +
        '<td class="num">' + a.hp + '</td><td class="num">' + a.pdef + '</td><td class="num">' + a.mdef +
        '</td><td class="num">' + a.brk + '</td><td class="num">' + a.regen + "</td>" +
        '<td class="num">' + bar(total(a), maxTot, "var(--accent)") + "</td></tr>";
    });
    h += "</tbody></table></div>";
    return h;
  }

  /* ---------------- fiche : puissance ---------------- */
  var POW_SORTS = [["score", "Score des 3 meilleures"], ["best", "Compétence la plus puissante"],
    ["name", "Nom"]];

  function viewPower() {
    if (["score", "best", "name"].indexOf(view.sort) < 0) { view.sort = "score"; view.dir = -1; }
    var list = rows(null);
    var maxScore = Math.max.apply(null, activeAniimos().map(score));
    var h = '<div class="head"><h1>Les compétences</h1><span class="count">' + list.length + " / " +
      activeAniimos().length + "</span>" + tipNote(TIP_CLICK, "right") + "</div>" +
      '<p class="sub">Score = somme des 3 compétences les plus puissantes (valeur « Might » du jeu).</p>' +
      toolbar({}) +
      '<div class="toolbar" style="margin-top:-6px"><div class="field"><label for="fs">Trier par</label>' +
      '<select id="fs">' + POW_SORTS.map(function (s) {
        return '<option value="' + s[0] + '"' + (view.sort === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
      }).join("") + "</select></div></div>";

    h += '<div class="grid cards4pow' + animClass() + '">';
    list.forEach(function (a, i) {
      var sk = (a.skills || []).filter(function (s) { return s.m > 0; });
      if (!sk.length) sk = (a.skills || []).slice(0, 1);
      h += '<article class="powcard fxi" style="--i:' + Math.min(i, 24) + '">' +
        '<div class="powhead"><span class="pos">' + (i + 1) + "</span>" + aniLink(a, icon(a, 44)) +
        '<div class="pi"><b>' + aniLink(a, nameHtml(a)) + '</b><div class="chips">' + a.elems.map(elemChip).join(" ") +
        roleChip(a.role) + typeChip(a) + (a.legendary ? '<span class="chip legendary">Légendaire</span>' : (a.starter ? '<span class="chip starter">Starter</span>' : "")) + "</div></div></div>" +
        '<div class="powstats">' +
        '<div><span class="lbl">Score</span><b>' + score(a) + "</b></div>" +
        '<div><span class="lbl">ATK</span><b>' + a.atk + "</b></div></div>" +
        '<span class="bar big"><i style="width:' + Math.max(3, Math.round(score(a) / maxScore * 100)) +
        '%;background:var(--accent)"></i></span>' +
        skBlocks(a, sk) +
        "</article>";
    });
    h += "</div>";
    return h;
  }

  /* Titre de section « lustré » : dégradé animé sur le texte + pétillements */
  function skHead(label) {
    var sp = "";
    for (var i = 1; i <= 5; i++) sp += '<span class="sp sp' + i + '">' + STAR + "</span>";
    return '<h4 class="skhead"><span class="shine">' + esc(label) + "</span>" + sp + "</h4>";
  }

  /* Trait + liste détaillée des compétences (bloc bas des cartes « Les compétences ») */
  function skBlocks(a, fallback) {
    var trName = a.traitNameFr || a.traitName || a.trait;
    var trDesc = a.traitDesc || a.traitFr || "";
    var h = '<div class="skblock">' +
      skHead("Trait") +
      '<div class="skrow"><div class="skmain">' + traitIcon(a.name, trName) +
      '<div class="skname"><b>' + esc(trName) + "</b></div></div>" +
      (trDesc ? '<p class="skdesc">' + esc(trDesc) + "</p>" : "") +
      '</div><hr class="sksep">' +
      skHead("Compétences");

    var list = a.sk2;
    if (!list || !list.length) {
      list = (fallback || []).map(function (s) {
        return { n: s.n, t: "", m: s.m ? String(s.m) : "", ep: "", d: "" };
      });
    }
    var bs = bestSkill(a);
    list.forEach(function (s) {
      h += '<div class="skrow"><div class="skmain">' + skIcon(s.t, skKey(a.name, s.n), s.n) +
        '<div class="skname"><b>' + esc(s.nf || s.n) + "</b>" +
        (bs && s.n === bs.n ? '<span class="chip sm silver">Ultime</span>' : "") +
        (a.sCore && s.n === a.sCore ? '<span class="chip sm gold">S Core</span>' : "") +
        (s.e && S.elements && S.elements[s.e] ? elemChip(s.e) : "") +
        (s.t ? '<span class="chip sm" style="background:' + (TYPE_COLOR[s.t] || "#888") + '">' + esc(s.t) + "</span>" : "") +
        (s.brk ? '<span class="chip sm" style="background:' + (S.roles && S.roles.BREAK ? S.roles.BREAK.color : "#3F6FB5") + '">BREAK</span>' : "") +
        "</div></div>" +
        '<div class="sktags">' +
        '<span class="sktag">ATK :&nbsp;<b>' + (s.m !== "" && s.m != null ? esc(String(s.m)) : "—") + "</b></span>" +
        '<span class="sktag">EP :&nbsp;<b>' + (s.ep !== "" && s.ep != null ? esc(String(s.ep)) : "—") + "</b></span>" +
        "</div>" +
        (s.d ? '<p class="skdesc">' + esc(s.d) + "</p>" : "") +
        "</div>";
    });
    return h + "</div>";
  }

  /* ---------------- fiche détaillée (fenêtre) ---------------- */
  function aniLink(a, inner) {
    return '<button type="button" class="anilink" data-ani="' + esc(a.name) + '">' + inner + "</button>";
  }

  function statRow(lbl, v, max, col) {
    return '<div class="dstat"><span class="lbl">' + esc(lbl) + "</span>" +
      '<span class="bar"><i style="width:' + Math.max(3, Math.round(v / max * 100)) +
      '%;background:' + col + '"></i></span><b>' + v + "</b></div>";
  }

  /* ---- arbre d'évolution : lignées partageant la même forme de base ---- */
  function evoTree(name) {
    var lines = (S.evoLines || []).filter(function (l) { return l.indexOf(name) >= 0; });
    if (!lines.length) return null;
    var roots = {};
    lines.forEach(function (l) { roots[l[0]] = 1; });
    var fam = (S.evoLines || []).filter(function (l) { return roots[l[0]]; });
    var stages = [];
    fam.forEach(function (l) {
      l.forEach(function (n, i) {
        stages[i] = stages[i] || [];
        if (stages[i].indexOf(n) < 0) stages[i].push(n);
      });
    });
    return stages;
  }

  function evoCard(n, me) {
    var a = findAni(n);
    var inner = (a ? icon(a, 46) : '<span class="evoq">?</span>') +
      '<span class="evon">' + esc(n) + "</span>" +
      (a ? '<span class="evono">N° ' + esc(a.no) + "</span>" : "");
    return '<div class="evocard' + (n === me ? " is-me" : "") + '">' +
      (a ? aniLink(a, inner) : inner) + "</div>";
  }

  function evoSection(a) {
    var stages = evoTree(a.name);
    var h = '<section class="evosec">' + skHead("Évolution");
    if (!stages) {
      h += '<p class="evonone">Aucune évolution connue : ' + esc(a.name) +
        " existe sous une forme unique.</p>";
      return h + "</section>";
    }
    h += '<div class="evowrap"><div class="evochain">';
    stages.forEach(function (st, i) {
      if (i) h += '<div class="evoarr" aria-hidden="true">' +
        '<svg viewBox="0 0 24 14" width="24" height="14"><path d="M1 7h19M15 2l6 5-6 5" ' +
        'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
        'stroke-linejoin="round"/></svg></div>';
      h += '<div class="evocol">' + st.map(function (n) { return evoCard(n, a.name); }).join("") + "</div>";
    });
    h += "</div></div></section>";
    return h;
  }


  /* liste des apports : une flèche cerclée d'or par ligne, texte capitalisé */
  function cap(t) {
    t = String(t || "").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }
  function kitLines(a) {
    var out = (a.tags || []).filter(function (t) { return t.indexOf("elem:") !== 0 && t !== "team"; })
      .map(function (t) { return TAG_FR[t] || t; });
    if ((a.tags || []).indexOf("team") >= 0 && out.length) out[0] = out[0] + " (équipe)";
    if (tWhy()[a.name]) out = String(tWhy()[a.name]).split(" · ");
    if (!out.length) out = ["aucun effet d'équipe identifié"];
    if (a.synergy) out = out.concat(String(a.synergy).split(" · "));
    return out.map(cap);
  }
  function kitSection(a) {
    return '<section class="kitsec">' + skHead("Ce qu'il apporte") +
      '<ul class="kitlist">' + kitLines(a).map(function (l) {
        return '<li><span class="kitarr" aria-hidden="true">' +
          '<svg viewBox="0 0 24 14" width="13" height="13"><path d="M2 7h17M14 2l6 5-6 5" fill="none" ' +
          'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</span><span>" + esc(l) + "</span></li>";
      }).join("") + "</ul></section>";
  }

  function viewDetail(name) {
    var a = findAni(name);
    if (!a) return "";
    var maxes = { hp: 0, atk: 0, pdef: 0, mdef: 0, brk: 0, regen: 0, total: 0 };
    activeAniimos().forEach(function (x) {
      Object.keys(maxes).forEach(function (k) { if (x[k] > maxes[k]) maxes[k] = x[k]; });
      if (total(x) > maxes.total) maxes.total = total(x);
    });
    var rc = (S.roles[a.role] || {}).color || "#888";

    /* place dans le classement de son rôle, sur les formes finales comme la Tiers List */
    var ranked = roleScores(a.role).filter(function (r) { return isFinal(r.a); }), pos = 0, sc = null;
    ranked.forEach(function (r, i) { if (r.a.name === a.name) { pos = i + 1; sc = r; } });
    var band = sc && ranked.length ? tierOf(sc.s, ranked[0].s) : null;
    var evoTxt = isFinal(a) ? "Forme finale"
      : "Évolue en " + (a.evo || []).join(" ou ");

    var openCls = detailOpening ? " detailin" : "";
    var h = '<div class="dlg-back" data-close="1"></div><div class="dlgwrap">' +
      '<div class="dlg' + openCls + '" role="dialog" aria-modal="true" aria-label="' +
      esc(a.name) + '"><button class="dlgx" data-close="1" aria-label="Fermer">✕</button>' +
      '<div class="dlghead">' + icon(a, 92) +
      '<div><div class="no">N° ' + esc(a.no) + "</div><h2>" + nameHtml(a) + "</h2>" +
      '<div class="chips">' + a.elems.map(elemChip).join(" ") + roleChip(a.role) + typeChip(a) +
      jobChips(a) + (a.legendary ? '<span class="chip legendary">Légendaire</span>' : (a.starter ? '<span class="chip starter">Starter</span>' : "")) + "</div>" +
      '<div class="devo"' + (isFinal(a) ? ' data-fin="1"' : "") + ">" + esc(evoTxt) + "</div>" +
      (band ? '<div class="dtier"><span class="tchip" style="background:' + band.color + '">' + band.k +
        '</span> ' + pos + "<sup>" + (pos === 1 ? "er" : "e") + '</sup> sur ' + ranked.length +
        " en " + esc(a.role) + ' <span class="rank">score ' + sc.s + "</span></div>" : "") +
      "</div></div>";

    h += '<div class="dlgbody">';

    /* statistiques */
    h += '<section><h3>Statistiques</h3><div class="dstats">' +
      statRow("PV", a.hp, maxes.hp, "#3FA45B") +
      statRow("ATK", a.atk, maxes.atk, "#E8702A") +
      statRow("DÉF. Phys.", a.pdef, maxes.pdef, "#8F5A2B") +
      statRow("DÉF. Mag.", a.mdef, maxes.mdef, "#4F6BAF") +
      statRow("BREAK", a.brk, maxes.brk, "#3F6FB5") +
      statRow("REGEN", a.regen, maxes.regen, "#8E5FBF") +
      '<div class="dsum">' +
      statRow("Total", total(a), maxes.total, "#C9A227") +
      "</div></div></section>";

    /* arbre d'évolution */
    h += evoSection(a);

    /* apport à l'équipe */
    h += kitSection(a);

    /* spécialité du Foyer */
    var sp = specsOf(a).map(specOf).filter(Boolean);
    if (sp.length) {
      h += '<section><h3>Spécialité du Foyer</h3>' + sp.map(function (x) {
        return '<div class="dspec"><span class="specbadge" style="background:' + x.color + '">' +
          (x.img ? '<img src="' + x.img + '" alt="">' : "") + "</span><div><b>" + esc(x.name) +
          "</b><p>" + esc(x.desc || "") + "</p></div></div>";
      }).join("") + "</section>";
    }

    /* trait + compétences */
    h += "<section>" + skBlocks(a, (a.skills || []).filter(function (x) { return x.m > 0; })) + "</section>";

    return h + "</div></div>" + teamPanel(a) + "</div>";
  }

  /* ---- volet de droite : les équipes par élément où l'Aniimo joue ---- */
  function teamsWith(name) {
    var out = [];
    elemTeamOrder().forEach(function (e) {
      var t = elemTeamOf(e);
      var i = t.members.indexOf(name);
      if (i >= 0) { out.push({ e: e, t: t, slot: i, sub: false }); return; }
      var j = -1;
      (t.alts || []).forEach(function (x, k) { if (x && x.n === name) j = k; });
      if (j >= 0) out.push({ e: e, t: t, slot: j, sub: true });
    });
    return out;
  }

  function teamPanel(a) {
    var found = teamsWith(a.name);
    var own = (a.elems || [])[0];
    var h = '<aside class="dlgside' + (detailOpening ? " detailin" : "") + '" aria-label="Équipes de ' + esc(a.name) + '">' +
      '<div class="dsh"><b>Ses équipes</b><span>compositions conseillées par élément</span></div>' +
      '<div class="dsbody">';

    if (!found.length) {
      h += '<p class="dsnone">' + esc(a.name) +
        " ne fait partie d'aucune des compositions conseillées contre un boss. À titre de comparaison, " +
        "voici l'équipe conseillée contre un boss " + (own ? esc(own) + ", son propre élément" : "") + ".</p>";
      if (own) h += teamBlock(own, elemTeamOf(own), -1, false, a.name);
    } else {
      found.forEach(function (f) { h += teamBlock(f.e, f.t, f.slot, f.sub, a.name); });
      if (own && !found.some(function (f) { return f.e === own; })) {
        h += '<div class="dssep"><span>Face à son propre élément</span></div>' +
          teamBlock(own, elemTeamOf(own), -1, false, a.name);
      }
    }
    return h + "</div></aside>";
  }

  function teamBlock(elem, t, slot, sub, me) {
    var col = S.elements[elem] || "#888";
    var h = '<div class="dsteam" style="--ec:' + col + '">' +
      '<div class="dsthead">' + elemChip(elem) +
      '<span class="dstvs">élément ' + esc(elem) + "</span></div>";
    if (!t.members.length) return h + '<p class="dsnone">Aucune composition.</p></div>';
    function row(list, cls) {
      return '<div class="dstteam ' + cls + '">' + list.map(function (n) {
        var x = findAni(n);
        if (!x) return '<div class="dstm empty"></div>';
        return '<div class="dstm' + (n === me ? " is-me" : "") + '">' +
          aniLink(x, icon(x, 34)) + "<b>" + aniLink(x, nameHtml(x)) + "</b>" +
          '<span class="dstr" style="background:' + ((S.roles[x.role] || {}).color || "#888") + '">' +
          esc(x.role) + "</span></div>";
      }).join("") + "</div>";
    }
    h += row(t.members, "t1");
    var alts = (t.alts || []).map(function (x) { return (x || {}).n || ""; });
    if (alts.some(Boolean)) h += '<div class="dstsep"><span>Team 2</span></div>' + row(alts, "t2");
    return h + "</div>";
  }

  /* ---------------- fiche : Abilités ---------------- */
  function viewAbil() {
    var list = S.abilities || [];
    if (!list.length) return '<div class="head"><h1>Abilités</h1></div><p class="sub">Aucune abilité pour le moment.</p>';
    var cur = null;
    for (var i = 0; i < list.length; i++) if (list[i].key === view.abil) cur = list[i];
    if (!cur) { cur = list[0]; view.abil = cur.key; }

    var h = '<div class="head"><h1>Abilités</h1><span class="count">' +
      cur.items.length + " bonus</span></div>" +
      '<div class="modes">' + list.map(function (g) {
        return '<button class="btn' + (g.key === cur.key ? " primary" : "") +
          '" data-abil="' + esc(g.key) + '">' + esc(g.label) + "</button>";
      }).join("") + "</div>";

    h += '<h2 class="sec">' + esc(cur.title) + "</h2>" +
      (cur.intro ? '<p class="sub">' + esc(cur.intro) + "</p>" : "") +
      (cur.note ? goldNote("À noter", cur.note) : "");
    if (!cur.items.length) {
      return h + '<div class="wipwrap"><div class="wipnote">' +
        (S.wipImg ? '<img class="wipimg" src="' + S.wipImg + '" alt="">' : "") +
        "<b>Rédaction en cours</b>" +
        "<p>Cette rubrique arrive bientôt. Reviens la consulter dans quelques jours, " +
        "ou suis l'avancement sur le Discord.</p></div></div>";
    }
    var items = cur.items;
    /* HomeLand : les 4 paires de lettres opposées s'affichent en 2 colonnes,
       ligne par ligne (E/I, S/N, T/F, J/P) plutôt que dans l'ordre brut des données. */
    if (cur.key === "homeland") {
      var PAIR_ORDER = [["E", "I"], ["S", "N"], ["T", "F"], ["J", "P"]];
      var byLetter = {};
      items.forEach(function (p) { byLetter[p.l] = p; });
      var ordered = [];
      PAIR_ORDER.forEach(function (pair) {
        pair.forEach(function (l) { if (byLetter[l]) ordered.push(byLetter[l]); });
      });
      items = ordered;
    }
    h += '<div class="grid cards2' + animClass() + '">';
    items.forEach(function (p, pi) {
      h += '<div class="card percard fxi" style="--i:' + pi + '">' +
        '<div class="perhead"><span class="perletter" style="background:' + p.color + '">' + esc(p.l) + "</span>" +
        "<div><b>" + esc(p.name) + '</b><div class="rank">' + esc(p.en) + "</div></div></div>" +
        '<p class="perdesc">' + esc(p.desc) + "</p>" +
        (p.note ? '<div class="specnote">' + esc(p.note) + "</div>" : "") +
        "</div>";
    });
    return h + "</div>";
  }

  /* ---------------- fiche : métiers ---------------- */
  /* détail des niveaux d'un métier : Lv.1 -> Lv.max, chacun avec son propre
     rendement — un métier n'est jamais "juste Lv.4", c'est une progression */
  function jobLevelsHtml(j) {
    var lv = (S.levels || []).filter(function (l) { return l.lv <= j.max; });
    return '<div class="joblevels">' + lv.map(function (l) {
      return '<div class="joblv' + (l.lv === j.max ? " cur" : "") + '"><b>Lv.' + l.lv + "</b><span>" +
        l.rate + "/min</span></div>";
    }).join("") + "</div>";
  }
  /* icône carrée dédiée aux Métiers : artwork officiel sur un fond coloré selon
     l'élément de l'Aniimo. Toutes les cartes sont carrées : celles qui n'ont pas
     encore leur art dédié dans icon/System/Metier retombent sur le portrait
     habituel de l'Aniimo, affiché dans le même cadre carré coloré (jamais rond). */
  function jobAniIcon(a, size) {
    var src = (S.jobIcons || {})[a.name.toLowerCase()] || a.img;
    var e = a.elems && a.elems[0] ? a.elems[0] : "Vent";
    var bg = (S.elements || {})[e] || "#888";
    if (!src) {
      return '<span class="jico" style="width:' + size + 'px;height:' + size + 'px;background:' + bg + '">' +
        icon(a, Math.round(size * .8)) + "</span>";
    }
    return '<span class="jico" style="width:' + size + 'px;height:' + size + 'px;background:' + bg + '">' +
      '<img src="' + src + '" alt="' + esc(a.name) + '" loading="lazy"></span>';
  }
  /* grille compacte d'icônes + nom, utilisée sous chaque carte de métier */
  function jobRoster(list) {
    if (!list.length) return "";
    return '<div class="jobroster">' + list.map(function (a) {
      return '<div class="jobmini">' + aniLink(a, jobAniIcon(a, 56) + "<b>" + esc(a.name) + "</b>") + "</div>";
    }).join("") + "</div>";
  }
  function viewJobs() {
    var members = {};
    S.jobs.forEach(function (j) { members[j.key] = []; });
    activeAniimos().forEach(function (a) {
      if (!a.jobs || !a.jobs.length) return;
      a.jobs.forEach(function (k) { if (members[k]) members[k].push(a); });
    });
    var sorted = S.jobs.slice().sort(function (a, b) { return a.rank - b.rank; });
    var h = '<div class="head"><h1>Métiers Aniimo</h1><span class="count">' + S.jobs.length + " métiers</span></div>";

    h += '<h2 class="sec">Spécialités du Foyer</h2>' +
      '<p class="sub">Chaque élément donne accès à des installations différentes. Un Aniimo apporte la spécialité de son ou ses éléments.</p>' +
      '<div class="grid cards3' + animClass() + '">';
    (S.specs || []).forEach(function (sp, si) {
      var n = activeAniimos().filter(function (a) { return specsOf(a).indexOf(sp.name) >= 0; }).length;
      h += '<div class="card speccard fxi" style="--i:' + si + '">' +
        '<div class="spechead"><span class="specbadge" style="background:' + sp.color + '">' +
        (sp.img ? '<img src="' + sp.img + '" alt="">' : "") + "</span>" +
        "<div><b>" + esc(sp.name) + '</b><div class="rank">' + n + " Aniimo</div></div></div>" +
        '<p class="specdesc">' + esc(sp.desc || "") + "</p>" +
        (sp.note ? '<div class="specnote">' + esc(sp.note) + "</div>" : "") + "</div>";
    });
    h += "</div>";

    h += '<h2 class="sec">Métiers Aniimo</h2>' +
      '<p class="sub">Chaque métier progresse du niveau 1 jusqu\'à son niveau maximum, avec un meilleur rendement à chaque palier. Chaque métier a sa couleur et son pictogramme, repris partout ailleurs.</p>';
    var jobCards = sorted.map(function (j, ji) {
      var jm = members[j.key] || [];
      return '<div class="card jobcard fxi" style="--i:' + ji + '"><div class="badge" style="background:' + j.color + '">' +
        jobIcon(j, 30) + "</div>" +
        "<div><h3>" + esc(j.name) + "</h3>" +
        (j.excl ? '<div class="lbl"><span class="excl">' + esc(j.excl) + "</span></div>" : "") +
        "<p>" + esc(j.desc) + "</p>" +
        '<dl class="kv" style="margin-top:8px"><dt>Aniimo</dt><dd>' + jm.length + "</dd></dl>" +
        '<hr class="jobsep">' + jobRoster(jm) + "</div></div>";
    });
    h += '<div class="grid cards2 top' + animClass() + '">' + jobCards.join("") + "</div>";

    h += '<h2 class="sec">Échelle de rendement</h2><div class="tablewrap"><table class="tight"><thead><tr>' +
      "<th>Niveau</th><th>Rendement</th><th>Écart vs Lv.1</th><th>Métiers concernés</th></tr></thead><tbody>";
    S.levels.forEach(function (l) {
      var m = sorted.filter(function (j) { return j.max === l.lv; }).map(function (j) { return j.name; }).join(", ") || "—";
      h += "<tr><td><b>Lv." + l.lv + '</b></td><td class="num">' + l.rate + ' charge/min</td><td class="num">' +
        (l.lv === 1 ? "—" : "+" + Math.round((l.rate / 60 - 1) * 100) + "%") + "</td><td>" + esc(m) + "</td></tr>";
    });
    h += "</tbody></table></div>";

    return h;
  }

  /* ---------------- fiches : tiers list ---------------- */
  /* Paliers : T0 = le sommet, T5 = le bas. Le seuil est relatif au meilleur
     score du rôle, pour que chaque rôle ait son propre sommet. */
  var TIERS = [
    { k: "T0",   min: .90, color: "#E0453F" },
    { k: "T0.5", min: .78, color: "#E8703A" },
    { k: "T1",   min: .66, color: "#E8A02A" },
    { k: "T1.5", min: .55, color: "#D9C42E" },
    { k: "T2",   min: .44, color: "#7BC258" },
    { k: "T3",   min: .34, color: "#3FA9A0" },
    { k: "T4",   min: .22, color: "#4E8FDC" },
    { k: "T5",   min: 0,   color: "#7C7A8C" }
  ];
  /* Familles de rôles affichées à l'intérieur d'un palier, dans cet ordre. */
  var TIER_GROUPS = [
    { key: "DPS",  label: "DPS",                      roles: ["DPS"],               color: "#E8702A" },
    { key: "BRK",  label: "Break",                    roles: ["BREAK"],             color: "#4E8FDC" },
    { key: "SUP",  label: "Support · Debuff · Regen", roles: ["SUPPORT", "REGEN"],  color: "#C08BE0" },
    { key: "HEAL", label: "Soin",                     roles: ["HEAL"],              color: "#3FA45B" }
  ];
  function tierOf(score, best) {
    var r = best ? score / best : 0;
    for (var i = 0; i < TIERS.length; i++) if (r >= TIERS[i].min) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }

  var TIER_ROLES = [["DPS", "DPS"], ["BREAK", "Break"], ["SUPPORT", "Support"],
                    ["REGEN", "Regen"], ["HEAL", "Soin"]];
  TIER_ROLES.unshift(["ALL", "Tout"]);
  /* ---------------- Tiers List ---------------- */

  /* ---- vote sur la liste d'un joueur, vignette par vignette ---- */
  var LV_KEY = "aniimo.lvotes";
  var LVOTES = null;
  function listVotes() {
    if (!LVOTES) {
      try { LVOTES = JSON.parse(localStorage.getItem(LV_KEY) || "{}"); } catch (e) { LVOTES = {}; }
    }
    return LVOTES;
  }
  function saveListVotes() { try { localStorage.setItem(LV_KEY, JSON.stringify(listVotes())); } catch (e) {} }
  function myListVote(id, name) { return (listVotes()[id] || {})[name] || ""; }
  function castListVote(id, name, val) {
    var L = listVotes();
    L[id] = L[id] || {};
    if (L[id][name] === val) delete L[id][name]; else L[id][name] = val;
    if (!Object.keys(L[id]).length) delete L[id];
    saveListVotes(); render();
  }
  function listTally(l, name) {
    /* les comptes les plus à jour viennent du serveur ; on retombe sur les données
       du site (state.json) si la liste n'est pas (encore) connue en ligne. */
    var live = LIVE.lists && LIVE.lists.filter(function (x) { return x.id === (l || {}).id; })[0];
    var t = ((live || l || {}).votes || {})[name] || {};
    return { ok: t.ok || 0, no: t.no || 0 };
  }
  function listBallot(l) {
    var v = listVotes()[l.id] || {}, out = [];
    Object.keys(v).forEach(function (n) { out.push((v[n] === "ok" ? "+" : "-") + n); });
    return out.length ? tEnc({ l: l.id, t: l.title || "", v: out }) : "";
  }
  /* la barre de vote posée sur une vignette d'une liste de joueur */
  function listVoteBar(l, a) {
    if (!view.tvote || !l) return "";
    var mine = myListVote(l.id, a.name), t = listTally(l, a.name);
    return '<div class="votes lv">' +
      '<button type="button" class="vbtn up' + (mine === "ok" ? " on" : "") +
      '" data-lv="ok" data-lvn="' + esc(a.name) + '" title="D\'accord avec ce palier">✓<i>' + t.ok + "</i></button>" +
      '<button type="button" class="vbtn down' + (mine === "no" ? " on" : "") +
      '" data-lv="no" data-lvn="' + esc(a.name) + '" title="Pas d\'accord">✗<i>' + t.no + "</i></button></div>";
  }
  function listVotePanel(l) {
    if (!view.tvote || !l) return "";
    var v = listVotes()[l.id] || {};
    var ok = 0, no = 0;
    Object.keys(v).forEach(function (n) { if (v[n] === "ok") ok++; else no++; });
    return '<div class="votebox lvbox"><div class="vbhead"><b>Ton avis sur « ' +
      esc(l.title || "cette liste") + ' »</b><span class="betatag">BETA</span></div>' +
      "<p>Sous chaque vignette, ✓ valide le palier proposé et ✗ le conteste. " +
      "Quand tu as fini, clique sur « Enregistrer mes votes » : ton avis est sauvegardé sur le site " +
      "et compté avec celui des autres joueurs, visible par tous sur cette liste.</p>" +
      '<div class="actions"><span class="rank">' + ok + " d'accord · " + no + " en désaccord</span>" +
      '<span style="flex:1"></span>' +
      '<button class="btn' + (ok + no ? " primary" : "") + '" id="lvsave"' + (ok + no ? "" : " disabled") +
      ">Enregistrer mes votes</button>" +
      (ok + no ? '<button class="btn" id="lvclear">Effacer mes ✓ ✗</button>' : "") + "</div></div>";
  }

  /* ---- sauvegarde partagée en ligne (fonctions Netlify + Netlify Blobs) ----
     Les listes créées par les joueurs et les votes (liste comme officiels) sont
     envoyés à une petite fonction serveur qui les stocke pour que TOUT LE MONDE
     les voie, sans passer par le panneau admin ni par un commit. */
  var TIER_API = "/.netlify/functions/tier-api";
  var LIVE = { lists: null, officialVotes: null, loaded: false, failed: false };
  function voterId() {
    var k = "aniimo.voter";
    try {
      var v = localStorage.getItem(k);
      if (!v) {
        v = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) { return "v" + Math.random().toString(36).slice(2, 10); }
  }
  /* clé partagée avec netlify/functions/tier-api.js, pour les actions de modération
     (supprimer une liste, effacer un vote officiel) : n'est envoyée que si le panneau
     admin est déverrouillé. Si tu changes un jour la phrase de passe du panneau,
     dis-le à Claude pour mettre aussi celle-ci à jour côté fonction Netlify. */
  var API_ADMIN_KEY = "AniimoFrance2026";
  function adminPass() { return adminLocked() ? "" : API_ADMIN_KEY; }
  function fetchLive() {
    fetch(TIER_API, { cache: "no-store" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d) { LIVE.failed = true; return; }
      LIVE.loaded = true; LIVE.failed = false;
      LIVE.lists = d.lists || []; LIVE.officialVotes = d.officialVotes || {};
      /* on fusionne dans S pour que tout le code existant (tally, listTally, tAll…) marche sans rien changer */
      S.tierVotes = LIVE.officialVotes;
      var byId = {};
      (S.tierPublic || []).forEach(function (l) { byId[l.id] = l; });
      LIVE.lists.forEach(function (l) {
        var mine = tLists().filter(function (x) { return x.id === l.id; })[0];
        if (mine && mine._tok) l._tok = mine._tok;
        byId[l.id] = l;
      });
      S.tierPublic = Object.keys(byId).map(function (k2) { return byId[k2]; });
      render();
    }).catch(function () { LIVE.failed = true; });
  }
  function apiPost(url, body) {
    return fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return null; }).then(function (d) { return { status: r.status, d: d }; }); });
  }

  /* ---- publication en direct (fonction Netlify + Netlify Blobs) ----
     Publier envoie tout le contenu éditable du site (fiches, pages, styles, notes…)
     à une fonction serveur qui le garde en mémoire ; chaque visiteur le récupère au
     chargement de la page. Aucune reconstruction ni redéploiement nécessaire.
     Les images et icônes NE PASSENT PAS par là : une fonction Netlify est limitée à
     quelques Mo, largement dépassés par les icônes embarquées. Elles restent
     embarquées dans index.html au moment du build (bundle.py), comme avant —
     un changement d'image reste à transmettre via « Exporter le JSON ». */
  var SITE_API = "/.netlify/functions/site-data";
  var PUBLISH_EXCLUDE = ["skillIcons", "skillIconsByName", "elemMascots", "traitIcons", "traitIconsByName",
    "heroImg", "aniipodIcons", "qualityIcons", "wipImg", "roleIcons", "elemIcons",
    "tierVotes", "tierLists", "tierPublic"];
  var PUBLISH_STRIP_IMG = { aniimos: "no", jobs: "key", specs: "key" };
  var PUBLISHED_AT = null, LAST_PUBLISHED = null;

  function publishPayload() {
    var out = {};
    Object.keys(S).forEach(function (k) {
      if (PUBLISH_EXCLUDE.indexOf(k) >= 0) return;
      var v = S[k];
      if (PUBLISH_STRIP_IMG[k] && Array.isArray(v)) {
        v = v.map(function (it) {
          var c = {}, f;
          for (f in it) if (f !== "img" && f !== "artBig") c[f] = it[f];
          return c;
        });
      }
      out[k] = v;
    });
    return out;
  }
  /* recolle chaque élément publié (sans image) à l'image correspondante déjà
     présente dans S (baked ou déjà publiée), grâce à une clé stable (no / key) */
  function mergeItemsByKey(baseArr, overrideArr, keyField) {
    if (!Array.isArray(overrideArr)) return baseArr;
    var byKey = {}, k;
    (baseArr || []).forEach(function (it) { byKey[it[keyField]] = it; });
    return overrideArr.map(function (ov) {
      var base = byKey[ov[keyField]] || {}, merged = {};
      for (k in base) merged[k] = base[k];
      for (k in ov) merged[k] = ov[k];
      return merged;
    });
  }
  function applyPublished(data) {
    if (!data) return;
    Object.keys(data).forEach(function (k) {
      if (PUBLISH_STRIP_IMG[k]) S[k] = mergeItemsByKey(S[k], data[k], PUBLISH_STRIP_IMG[k]);
      else S[k] = data[k];
    });
  }
  function fetchPublished() {
    fetch(SITE_API, { cache: "no-store" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d) return;
      PUBLISHED_AT = d.publishedAt || null;
      LAST_PUBLISHED = d.data || null;
      if (!draftLoaded && LAST_PUBLISHED) { applyPublished(LAST_PUBLISHED); render(); }
    }).catch(function () {});
  }
  function unpublishSite() {
    if (!confirm("Retirer la publication en ligne ? Tout le monde reverra la version d'origine du site (celle du dernier vrai build).")) return;
    apiPost(SITE_API, { action: "unpublish", adminPass: adminPass() }).then(function (res) {
      if (res.status === 200 && res.d && res.d.ok) {
        PUBLISHED_AT = null; LAST_PUBLISHED = null;
        toast("Publication retirée — le site est revenu à sa version d'origine pour tout le monde.");
        render();
      } else {
        toast("Le retrait a échoué. Réessaie dans un instant.");
      }
    }).catch(function () { toast("Connexion impossible. Réessaie dans un instant."); });
  }

  /* listes personnalisées : créées ici, partagées par code/lien (site statique) */
  function tLists() { S.tierLists = S.tierLists || []; return S.tierLists; }
  function tPublic() { S.tierPublic = S.tierPublic || []; return S.tierPublic; }
  /* toutes les listes visibles : d'abord ma propre copie (celle que j'édite),
     puis celles publiées avec le site / sauvegardées en ligne par les autres joueurs. */
  function tAll() {
    var seen = {}, out = [];
    tLists().forEach(function (l) { seen[l.id] = 1; out.push(l); });
    tPublic().forEach(function (l) { if (!seen[l.id]) out.push(l); });
    return out;
  }
  function tIsPublic(id) { return tPublic().some(function (l) { return l.id === id; }); }
  function tIsMine(id) { return tLists().some(function (l) { return l.id === id && !l.shared; }); }
  function tListOf(id) {
    var l = tAll();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function tFix() { S.tierFix = S.tierFix || {}; return S.tierFix; }
  function tWhy() { S.tierWhy = S.tierWhy || {}; return S.tierWhy; }
  function newListId() { return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function tEnc(o) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(o))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function tDec(t) {
    t = String(t || "").trim().replace(/^.*#liste=/, "").replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(t))));
  }
  function tShareUrl(l) {
    return location.origin + location.pathname + "#liste=" +
      tEnc({ p: l.pseudo, t: l.title, x: l.tiers || {} });
  }

  /* groupe de colonnes d'un rôle */
  function grpOf(role) {
    for (var i = 0; i < TIER_GROUPS.length; i++)
      if (TIER_GROUPS[i].roles.indexOf(role) >= 0) return TIER_GROUPS[i];
    return TIER_GROUPS[0];
  }
  function bandByKey(k) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].k === k) return TIERS[i];
    return null;
  }
  /* palier retenu : liste perso > correction admin > score calculé */
  function bandOf(r, bestMap, list) {
    var k = list ? (list.tiers || {})[r.a.name] : tFix()[r.a.name];
    var b = k ? bandByKey(k) : null;
    return b || (list ? null : tierOf(r.s, bestMap[grpOf(r.a.role).key] || 0));
  }
  /* meilleur score de chaque famille de rôles (DPS/Break/Support·Regen/Soin),
     pour que la vue « Tout » tiere chaque colonne par rapport à son propre
     maximum plutôt que par rapport au meilleur score toutes familles confondues
     — sinon un soigneur ou un support n'atteint quasiment jamais T0/T0.5. */
  function groupBestOf(ranked) {
    var out = {};
    TIER_GROUPS.forEach(function (g) {
      var vals = ranked.filter(function (r) { return g.roles.indexOf(r.a.role) >= 0; }).map(function (r) { return r.s; });
      out[g.key] = vals.length ? Math.max.apply(null, vals) : 0;
    });
    return out;
  }
  function whyOf(a) { return tWhy()[a.name] || kitLabel(a); }

  function viewTier() {
    var sel = view.tier, list = null;
    if (sel && sel.indexOf("L:") === 0) {
      list = tListOf(sel.slice(2));
      if (!list) { sel = "ALL"; view.tier = sel; }
    }
    var role = list ? "ALL" : sel;
    if (!list && role !== "ALL" && !S.roles[role]) { role = "DPS"; view.tier = role; }

    /* la Tiers List ne retient que les formes finales */
    var finals = activeAniimos().filter(isFinal);
    var counts = {};
    finals.forEach(function (a) { counts[a.role] = (counts[a.role] || 0) + 1; });
    var ranked = roleScores(role).filter(function (r) { return isFinal(r.a); });
    var q = view.q.toLowerCase();
    var shown = ranked.filter(function (r) {
      if (view.elem && r.a.elems.indexOf(view.elem) < 0) return false;
      if (q && r.a.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var lab = "";
    TIER_ROLES.forEach(function (r) { if (r[0] === role) lab = r[1]; });

    var h = '<div class="head"><h1>Tiers List</h1><span class="count">' +
      (list ? Object.keys(list.tiers || {}).length + " placés" : ranked.length + " Aniimo") + "</span></div>";

    h += '<div class="homewarn big" style="--wc:#ff3b3b"><b class="warntag">Important</b>' +
      "Cette Tiers List n'est pas une nécessité : tous les Aniimos sont jouables !</div>";

    /* --- étiquettes : rôles, Tout, listes perso, Créer --- */
    h += '<div class="modes tiersw">' + TIER_ROLES.map(function (r) {
      var all = r[0] === "ALL", on = !list && r[0] === role;
      var col = all ? "var(--gold-line)" : ((S.roles[r[0]] || {}).color || "#888");
      var n = all ? finals.length : (counts[r[0]] || 0);
      return '<button class="btn tierbtn' + (all ? " tierall" : "") + (on ? " on" : "") +
        '" data-tier="' + r[0] + '"' +
        (on ? ' style="background:' + col + ';border-color:transparent;color:#fff"' : "") + ">" +
        '<span class="dot" style="background:' + col + '"></span>' + esc(r[1]) +
        '<span class="n">' + n + "</span></button>";
    }).join("") +
      '<button class="btn tierbtn tiernew" id="tcreate">✦ Créer<span class="betatag">BETA</span></button>' +
      '<button class="btn tierbtn tierimp" id="timport">Ouvrir un code</button></div>';

    /* --- dépliant : Les Tiers du Foyer --- */
    var LS = tAll();
    var open = view.tfold || !!list;
    h += '<div class="tfold' + (open ? " open" : "") + '">' +
      '<button type="button" class="tfoldhead" id="tfold" aria-expanded="' + (open ? "true" : "false") + '">' +
      '<span class="tfmark">✦</span><b>Les Tiers du Foyer</b>' +
      '<span class="tfsub">les tiers lists créées par les joueurs</span>' +
      '<span class="n">' + LS.length + "</span>" +
      '<span class="tfchev" aria-hidden="true">▾</span></button>';
    if (open) {
      h += '<div class="tfoldbody">';
      if (!LS.length) {
        h += '<p class="tfempty">Personne n\'a encore posé sa liste. Clique sur <b>✦ Créer</b> pour ouvrir la première.</p>';
      } else {
        h += '<div class="tfgrid">' + LS.map(function (l) {
          var on = list && l.id === list.id;
          var pub = tIsPublic(l.id), mine = tIsMine(l.id);
          var n = Object.keys(l.tiers || {}).length;
          return '<div class="tfcard' + (on ? " on" : "") + '">' +
            '<div class="tfrow"><b>' + esc(l.title || "Liste") + "</b>" +
            '<span class="tfbadge' + (pub ? " pub" : "") + '">' +
            (pub ? "en ligne" : mine ? "la mienne (pas encore enregistrée)" : "reçue par lien") + "</span></div>" +
            '<div class="tfby">par <b>' + esc(l.pseudo || "anonyme") + "</b></div>" +
            '<div class="tfmini">' + TIERS.map(function (t) {
              var c = 0;
              Object.keys(l.tiers || {}).forEach(function (k) { if (l.tiers[k] === t.k) c++; });
              return '<span class="tfm" style="background:' + t.color + ';opacity:' +
                (c ? 1 : 0.22) + '" title="' + t.k + " : " + c + '">' + c + "</span>";
            }).join("") + "</div>" +
            '<div class="tfact"><span class="rank">' + n + ' placés</span><span style="flex:1"></span>' +
            '<button type="button" class="btn" data-tier="L:' + esc(l.id) + '">' +
            (on ? "Affichée" : "Voir") + "</button>" +
            '<button type="button" class="btn" data-lcopy="' + esc(l.id) + '">Lien</button></div></div>';
        }).join("") + "</div>";
      }
      h += '<p class="tfnote">Les listes marquées <b>en ligne</b> sont sauvegardées sur le site : ' +
        "tout le monde les voit en arrivant, sans rien faire de plus. Une liste se partage aussi par son lien, " +
        "qui l'ouvre directement.</p></div>";
    }
    h += "</div>";

    /* --- formulaire de création --- */
    if (view.tcreate) {
      h += '<form class="card tcreate" id="tcform"><h3>Créer ma Tiers List</h3>' +
        "<p>Ta liste se construit ici, dans ce navigateur. Clique sur « Enregistrer » quand tu veux la sauvegarder sur le site : elle devient alors visible par tous, sans compte ni lien à envoyer.</p>" +
        '<div class="row">' +
        '<div class="f"><label for="tc-p">Ton pseudo</label><input id="tc-p" required maxlength="24" placeholder="ex. Maxlore"></div>' +
        '<div class="f"><label for="tc-t">Nom de la liste</label><input id="tc-t" maxlength="40" placeholder="ex. Tier list PvE 1.2"></div>' +
        '<div class="f"><label for="tc-s">Point de départ</label><select id="tc-s">' +
        '<option value="copy">copier le classement automatique</option>' +
        '<option value="empty">partir d\'une liste vide</option></select></div></div>' +
        '<div class="actions" style="margin-top:10px"><button class="btn primary" type="submit">Créer</button>' +
        '<button class="btn" type="button" id="tccancel">Annuler</button></div></form>';
    }

    /* --- bandeau d'explication --- */
    h += '<div class="tiernote"><p><b>T = Tiers.</b> Du meilleur au moins bon : ' +
      TIERS.map(function (t) {
        return '<span class="tchip" style="background:' + t.color + '">' + t.k + "</span>";
      }).join("") + "</p>";
    if (list) {
      h += '<p class="tiercrit">Liste de <b>' + esc(list.pseudo || "anonyme") + "</b>" +
        (list.shared ? " — ouverte depuis un lien partagé" : " — glisse les vignettes d'une bande à l'autre, ou clique une vignette puis une case") +
        ".</p>";
    } else {
      h += '<p class="tiercrit">' + (role === "ALL"
        ? "Tous rôles confondus : chaque Aniimo est noté sur les critères de <b>son propre rôle</b>, puis tout est fusionné en un seul classement. Un soigneur excellent peut donc devancer un DPS moyen."
        : "Rôle " + esc(lab) + " — critères : " + esc(ROLE_CRIT[role])) + "</p>" +
        '<p class="tiercrit">Seules les <b>formes finales</b> sont classées (' + finals.length +
        " sur " + activeAniimos().length + ") : une pré-évolution finit toujours par devenir sa forme finale.</p>";
    }
    h += "</div>";
    h += votePanel();
    h += goldNote("À noter", "Cette Tiers List vaut pour le Monde ouvert (Open World).");

    /* --- barre d'outils --- */
    h += '<div class="toolbar"><div class="field"><label for="q">Chercher</label><input id="q" type="search" placeholder="nom…" value="' + esc(view.q) + '"></div>' +
      '<div class="field"><label for="fe">Élément</label><select id="fe"><option value="">tous</option>' +
      ELEM_ORDER.map(function (e) { return '<option value="' + e + '"' + (view.elem === e ? " selected" : "") + ">" + e + "</option>"; }).join("") +
      '</select></div><button class="btn" id="reset">Réinitialiser</button>' +
      (list ? '<span style="flex:1"></span>' +
        '<button class="btn" id="tshare">Copier le lien de partage</button>' +
        '<button class="btn vote' + (view.tvote ? " on" : "") + '" id="tvote">' +
        (view.tvote ? "Fermer le vote" : "Vote") + "</button>" +
        (tIsMine(list.id) ? '<button class="btn save" id="tsave">Enregistrer</button>' : "") +
        (tIsMine(list.id) ? "" : '<button class="btn" id="tfork">Reprendre à mon compte</button>') +
        (tIsMine(list.id) || !adminLocked() ? '<button class="btn danger" id="tdel">Supprimer</button>' : "") : "") + "</div>";

    if (list) h += listVotePanel(list);

    /* --- colonnes affichées --- */
    var groups = list || role === "ALL"
      ? TIER_GROUPS.filter(function (g) {
          return shown.some(function (r) { return g.roles.indexOf(r.a.role) >= 0; });
        })
      : [grpOf(role)];
    if (!groups.length) groups = TIER_GROUPS.slice();

    /* --- répartition dans les bandes --- */
    var bestMap = groupBestOf(ranked);
    var bands = TIERS.map(function (t) { return { t: t, cells: {} }; });
    bands.forEach(function (b) { groups.forEach(function (g) { b.cells[g.key] = []; }); });
    var pool = {};
    groups.forEach(function (g) { pool[g.key] = []; });
    shown.forEach(function (r) {
      var g = grpOf(r.a.role);
      if (!pool[g.key]) return;
      var band = bandOf(r, bestMap, list);
      if (!band) { pool[g.key].push(r); return; }
      for (var i = 0; i < bands.length; i++) if (bands[i].t.k === band.k) bands[i].cells[g.key].push(r);
    });

    var cols = "grid-template-columns:repeat(" + groups.length + ",minmax(0,1fr))";

    /* --- plateau --- */
    h += '<div class="tboard' + animClass() + (list ? " editing" : "") + '">' +
      '<div class="tbhead"><div class="tbside"></div><div class="tbcols" style="' + cols + '">' +
      groups.map(function (g) {
        return '<div class="tbth" style="--gc:' + g.color + '"><span class="tbdot"></span>' +
          esc(g.label) + "</div>";
      }).join("") + "</div></div>";

    bands.forEach(function (b, bi) {
      var n = groups.reduce(function (t, g) { return t + b.cells[g.key].length; }, 0);
      if (!n && !list) return;
      h += '<div class="tbrow fxi" style="--i:' + bi + ";--glow:" + b.t.color + '">' +
        '<div class="tierlabel" style="background:' + b.t.color + '">' + b.t.k + "</div>" +
        '<div class="tbcols" style="' + cols + '">' +
        groups.map(function (g) {
          return '<div class="tbcell" style="--gc:' + g.color + '" data-drop="' + b.t.k + '">' +
            b.cells[g.key].map(function (r) { return tCard(r, ranked, role, list); }).join("") + "</div>";
        }).join("") + "</div></div>";
    });
    h += "</div>";

    /* --- réserve (liste perso) --- */
    if (list) {
      var np = groups.reduce(function (t, g) { return t + pool[g.key].length; }, 0);
      h += '<div class="tboard tbpool">' +
        '<div class="tbhead"><div class="tbside"></div><div class="tbcols" style="' + cols + '">' +
        groups.map(function (g) {
          return '<div class="tbth" style="--gc:' + g.color + '"><span class="tbdot"></span>' +
            esc(g.label) + "</div>";
        }).join("") + "</div></div>" +
        '<div class="tbrow"><div class="tierlabel poollab">Réserve</div>' +
        '<div class="tbcols" style="' + cols + '">' +
        groups.map(function (g) {
          return '<div class="tbcell" style="--gc:' + g.color + '" data-drop="_">' +
            pool[g.key].map(function (r) { return tCard(r, ranked, role, list); }).join("") + "</div>";
        }).join("") + "</div></div></div>";
      if (!np) h += '<p class="note">Tous les Aniimo sont placés.</p>';
    }

    if (!shown.length) h += '<p class="note">Aucun Aniimo ne correspond à ce filtre.</p>';
    return h;
  }

  var KLAB = { DPS: "Dégâts du meilleur coup", BREAK: "BREAK", SUPPORT: "REGEN", REGEN: "REGEN", HEAL: "REGEN" };
  function tCard(r, ranked, role, list) {
    var a = r.a, rr = role === "ALL" ? a.role : role;
    var kv = { DPS: hit(a), BREAK: a.brk, SUPPORT: a.regen, REGEN: a.regen, HEAL: a.regen }[rr];
    var edit = !!(list && tIsMine(list.id)) && !view.tvote;
    var picked = list && view.tpick === a.name;
    return '<div class="tcard' + (picked ? " picked" : "") + '"' +
      (edit ? ' draggable="true" data-drag="' + esc(a.name) + '"' : "") +
      ' title="' + esc(a.name + " — " + (KLAB[rr] || "Score") + " " + kv + " · score " + r.s +
        " (stats " + r.stat + ", kit " + r.kit + ")\n" + whyOf(a)) + '">' +
      '<div class="tcimg">' + (edit ? icon(a, 58) : aniLink(a, icon(a, 58))) +
      '<span class="tcpos">' + (ranked.indexOf(r) + 1) + "</span>" +
      (edit ? '<button type="button" class="tcinfo" data-ani="' + esc(a.name) +
        '" title="Voir la fiche">i</button>' : "") + "</div>" +
      '<div class="tcname">' + (edit ? nameHtml(a) : aniLink(a, nameHtml(a))) + "</div>" +
      '<div class="tcel">' + a.elems.map(elemChip).join("") +
      (role === "ALL" ? roleChip(a.role) : "") + "</div>" +
      (list ? listVoteBar(list, a) : voteBar(a)) + "</div>";
  }

  /* ---------------- team builder ---------------- */
  function elemsOf(a) { return a.elems || []; }
  function teamCovers(cand, target) {
    return elemsOf(cand).some(function (e) { return chartOf(e).strong.indexOf(target) >= 0; });
  }
  function synergy(cand, main, chosen) {
    var s = 0, reasons = [];
    if (!main || !main.name) return { s: 0, why: [] };
    if (elemsOf(cand).some(function (e) { return elemsOf(main).indexOf(e) >= 0; })) {
      s += 18; reasons.push("même élément que " + main.name + " : les buffs élémentaires profitent directement");
    }
    var mw = [];
    elemsOf(main).forEach(function (e) { chartOf(e).weak.forEach(function (w) { if (mw.indexOf(w) < 0) mw.push(w); }); });
    var cov = mw.filter(function (w) { return teamCovers(cand, w); });
    if (cov.length) { s += 8 * cov.length; reasons.push("couvre " + cov.join(" et ") + ", ce qui met " + main.name + " en difficulté"); }
    var res = mw.filter(function (w) { return elemsOf(cand).some(function (e) { return chartOf(e).resist.indexOf(w) >= 0; }); });
    if (res.length) { s += 5; reasons.push("résiste à " + res.join(" et ")); }
    var have = [];
    chosen.forEach(function (c) { elemsOf(c).forEach(function (e) { if (have.indexOf(e) < 0) have.push(e); }); });
    if (elemsOf(cand).some(function (e) { return have.indexOf(e) < 0; })) { s += 6; reasons.push("ajoute une couverture élémentaire absente"); }
    var t = (cand.traitFr || "").toLowerCase();
    if (/équipe|alliés|allies/.test(t)) { s += 10; reasons.push("son trait profite à toute l'équipe"); }
    if (/critique|dégâts/.test(t)) { s += 6; }
    return { s: s, why: reasons };
  }
  function pickFor(role, main, chosen) {
    var ranked = roleScores(role);
    var out = null;
    ranked.forEach(function (r) {
      if (r.a.name === main.name) return;
      if (chosen.some(function (c) { return c.name === r.a.name; })) return;
      var sy = synergy(r.a, main, chosen);
      var tot = r.s * 0.6 + sy.s * 1.6;
      if (!out || tot > out.tot) out = { a: r.a, tot: tot, role: r.s, why: sy.why };
    });
    return out;
  }
  var SLOTS = ["DPS", "BREAK", "SUPPORT", "SUSTAIN"];
  function slotOf(role) { return (role === "HEAL" || role === "REGEN") ? "SUSTAIN" : role; }
  function tagsOf(a) { return a.tags || []; }
  function has(a, t) { return tagsOf(a).indexOf(t) >= 0; }

  /* Ce dont le pilier de l'équipe a besoin, lu sur son kit. */
  function needsOf(main) {
    var n = { ep: 12, dmgUp: 16, crit: 12, debuff: 12, breakUp: 14, heal: 12, regen: 6,
      cleanse: 4, shield: 4, team: 8 };
    var why = {};
    if (!main || !main.name) return { w: n, why: why };
    var b = best(main), t = (main.traitFr || "").toLowerCase();
    if (b >= 150) {
      n.ep += 26;
      why.ep = "son ultime coûte cher : chaque EP rendu, c'est un " + bestName(main) + " de plus";
    } else if (b >= 110) { n.ep += 14; why.ep = "il a un gros coup à relancer souvent"; }
    if (/attaque normale|attaques normales/.test(t)) {
      n.crit += 18; n.dmgUp += 14;
      why.crit = "ses dégâts passent par les attaques normales : critique et bonus de dégâts les multiplient";
    }
    if (/critique/.test(t)) { n.crit += 10; }
    if (main.role === "DPS") { n.breakUp += 12; n.dmgUp += 10; }
    if (main.role === "BREAK") { n.dmgUp += 12; n.debuff += 10; }
    if (main.atk >= 115) { n.dmgUp += 10; n.crit += 8; }
    if (main.regen <= 80) { n.ep += 10; why.ep = why.ep || "son REGEN est bas : il dépend de l'équipe pour son énergie"; }
    if (main.hp <= 90) { n.heal += 10; why.heal = "il est fragile : un soin le garde en jeu pendant le burst"; }
    return { w: n, why: why };
  }


  /* Note d'apport réel d'un candidat pour ce pilier. */
  function contribution(cand, main, need) {
    var s = 0, why = [];
    var teamWide = has(cand, "team");
    ["ep", "dmgUp", "crit", "debuff", "breakUp", "heal", "regen", "cleanse", "shield"].forEach(function (t) {
      if (!has(cand, t)) return;
      var v = need.w[t] * (teamWide ? 1.35 : 1);
      s += v;
      if (v >= 20) why.push(TAG_FR[t] + (teamWide ? " pour toute l'équipe" : ""));
    });
    if (has(cand, "epMax")) {
      s += need.w.ep * 1.7;
      why.unshift("relève le plafond d'EP de l'équipe — l'effet d'énergie le plus fort du jeu");
    }
    if (has(cand, "stun")) s += 8;
    tagsOf(cand).forEach(function (t) {
      if (t.indexOf("elem:") === 0 && main && (main.elems || []).indexOf(t.slice(5)) >= 0) {
        s += 34;
        why.unshift("son bonus cible l'élément " + t.slice(5) + " — celui de " + main.name);
      }
    });
    if (cand.synergy) why.push(cand.synergy);
    return { s: s, why: why };
  }

  function pickSlot(slot, main, chosen, opts) {
    var roles = slot === "SUSTAIN" ? ["HEAL", "REGEN"] : [slot];
    var need = (opts && opts.need) || needsOf(main);
    var out = null;
    roles.forEach(function (role) {
      var ranked = roleScores(role);
      ranked.forEach(function (r) {
        var a = r.a;
        if (main && main.name && a.name === main.name) return;
        if (chosen.some(function (c) { return c.name === a.name; })) return;
        if (chosen.some(function (c) { return slotOf(c.role) === slotOf(a.role); })) return;
        var sy = synergy(a, main, chosen);
        var co = contribution(a, main, need);
        var tot = r.s * 0.35 + co.s * 1.0 + sy.s * 0.8;
        var why = co.why.concat(sy.why);
        if (opts && opts.bonus) {
          var b = opts.bonus(a, slot);
          tot += b.s;
          if (b.why) why = b.why.concat(why);
        }
        if (!out || tot > out.tot) out = { a: a, tot: tot, why: why, contrib: co.s };
      });
    });
    return out;
  }

  function autoTeam(mainName, opts) {
    var main = findAni(mainName);
    if (!main) return null;
    opts = opts || {};
    if (!opts.need) opts.need = needsOf(main);
    var chosen = [main], notes = {}, pinned = [];
    (opts.pins || []).forEach(function (n) {
      var a = findAni(n);
      if (!a || a.name === main.name) return;
      if (chosen.some(function (c) { return slotOf(c.role) === slotOf(a.role); })) return;
      chosen.push(a); pinned.push(a.name);
      var co = contribution(a, main, opts.need), sy = synergy(a, main, chosen);
      notes[a.name] = ["choisi manuellement"].concat(co.why, sy.why);
    });
    SLOTS.filter(function (slot) {
      return !chosen.some(function (c) { return slotOf(c.role) === slot; });
    }).forEach(function (slot) {
      var p = pickSlot(slot, main, chosen, opts);
      if (p) { chosen.push(p.a); notes[p.a.name] = p.why; }
    });
    var order = { DPS: 0, BREAK: 1, SUPPORT: 2, HEAL: 3, REGEN: 3 };
    chosen.sort(function (a, b) {
      if (a.name === main.name) return -1;
      if (b.name === main.name) return 1;
      return order[a.role] - order[b.role];
    });
    return { members: chosen, notes: notes, main: main, pinned: pinned };
  }

  /* ---- boss ---- */
  function bossOf(k) {
    if (typeof k === "string" && k.indexOf("@elem:") === 0) {
      var e = k.slice(6);
      return { key: k, name: "Boss " + e, elem: e, type: (S.bossTypes || [{}])[0].key || "", note: "" };
    }
    for (var i = 0; i < (S.bosses || []).length; i++) if (S.bosses[i].key === k) return S.bosses[i];
    return null;
  }
  function bossTypeOf(k) { for (var i = 0; i < (S.bossTypes || []).length; i++) if (S.bossTypes[i].key === k) return S.bossTypes[i]; return null; }
  function bossTeam(bossKey) {
    var boss = bossOf(bossKey); if (!boss) return null;
    var bt = bossTypeOf(boss.type) || { brkW: 1, sustainW: 1, prefer: "REGEN" };
    var E = boss.elem;
    function counterBonus(a, slot) {
      var s = 0, why = [];
      if (elemsOf(a).some(function (e) { return chartOf(e).strong.indexOf(E) >= 0; })) {
        s += 30; why.push("frappe le boss en ×1,6");
      }
      if (elemsOf(a).some(function (e) { return chartOf(e).resist.indexOf(E) >= 0; })) {
        s += 14; why.push("résiste aux attaques " + E + " du boss");
      }
      if (chartOf(E).strong.indexOf(elemsOf(a)[0]) >= 0) {
        s -= 22; why.push("prend ×1,6 du boss — à sortir dès qu'il vise");
      }
      if (slot === "BREAK") s += 12 * (bt.brkW - 1) * 10;
      if (slot === "SUSTAIN") s += 12 * (bt.sustainW - 1) * 10;
      return { s: s, why: why };
    }
    var opts = { bonus: counterBonus };
    // meilleur DPS anti-boss comme pilier
    var dps = pickSlot("DPS", { name: "", role: "", elems: [] }, [], opts);
    if (!dps) return null;
    var need = needsOf(dps.a);
    if (bt.key === "raid") { need.w.heal += 24; need.w.cleanse += 10; need.w.shield += 8; }
    if (bt.key === "entrainement") { need.w.heal = 2; need.w.ep += 18; need.w.dmgUp += 14; }
    if (bt.key === "alpha") { need.w.heal += 10; need.w.ep += 6; }
    opts.need = need;
    var t = autoTeam(dps.a.name, opts);
    if (!t) return null;
    t.notes[dps.a.name] = dps.why;
    t.boss = boss; t.bt = bt;
    return t;
  }

  /* ---------------- équipes élémentaires ----------------
     Une équipe conseillée par élément de boss. Elle est calculée à partir des
     données, et l'admin peut la remplacer membre par membre. */
  function elemTeams() { S.elemTeams = S.elemTeams || {}; return S.elemTeams; }

  function autoElemTeam(elem) {
    var t = bossTeam("@elem:" + elem);
    if (t) return { members: t.members.map(function (a) { return a.name; }), notes: t.notes, auto: true };
    return null;
  }
  /* équipe retenue : le choix de l'admin s'il existe, sinon le calcul */
  /* un remplaçant peut être un simple nom ou un objet {n, d} */
  function altName(x) { return typeof x === "string" ? x : (x || {}).n || ""; }

  function elemTeamOf(elem) {
    var saved = elemTeams()[elem] || {};
    var picked = (saved.members || []).filter(Boolean);
    var auto = autoElemTeam(elem);
    var out = picked.length
      ? { members: picked, notes: (auto || {}).notes || {}, auto: false }
      : { members: auto ? auto.members : [], notes: (auto || {}).notes || {}, auto: true };

    var altsRaw = (saved.alts || []).map(altName);
    out.alts = altsRaw.map(function (n, i) {
      var a = n ? findAni(n) : null;
      var holder = findAni(out.members[i]);
      var written = typeof (saved.alts || [])[i] === "object" ? ((saved.alts[i] || {}).d || "") : "";
      return { n: n, d: written || (a ? autoAlt(a, holder, elem) : "") };
    });

    /* textes : ceux écrits à la main gagnent, sinon ils sont générés */
    out.lead = saved.lead || autoLead(elem, out.members);
    out.risk = saved.risk || autoRisk(elem, out.members);
    var written = saved.points || [];
    out.points = out.members.map(function (n, i) {
      var a = findAni(n);
      var w = written[i];
      return { t: n, d: (w && w.t === n && w.d) ? w.d : autoPoint(a, elem) };
    });
    out.note = saved.note || "";
    return out;
  }
  function setBossAlt(id, v) {
    var i = id.lastIndexOf(":");
    var elem = id.slice(0, i), slot = +id.slice(i + 1);
    var t = elemTeams();
    t[elem] = t[elem] || { members: ["", "", "", ""], note: "" };
    t[elem].alts = (t[elem].alts || []).map(altName);
    while (t[elem].alts.length < 4) t[elem].alts.push("");
    t[elem].alts[slot] = v;
  }
  function setBossTeam(id, v) {
    var i = id.lastIndexOf(":");
    var elem = id.slice(0, i), slot = +id.slice(i + 1);
    var t = elemTeams();
    t[elem] = t[elem] || { members: ["", "", "", ""], note: "" };
    while (t[elem].members.length < 4) t[elem].members.push("");
    t[elem].members[slot] = v;
  }




  /* ================= votes de la communauté [BETA] =================
     Le site est un fichier statique : aucun serveur ne peut recevoir les
     votes. Chaque visiteur vote dans son navigateur, puis copie un
     bulletin que l'administrateur colle dans le panneau. Rien n'est
     appliqué au classement tant qu'il n'a pas validé la proposition. */

  var VOTE_KEY = "aniimo.votes";
  function myVotes() {
    if (!VOTES) {
      try { VOTES = JSON.parse(localStorage.getItem(VOTE_KEY) || "{}"); } catch (e) { VOTES = {}; }
    }
    return VOTES;
  }
  var VOTES = null;
  function saveVotes() {
    try { localStorage.setItem(VOTE_KEY, JSON.stringify(myVotes())); } catch (e) {}
  }
  /* comptages publiés avec le site, entretenus par l'admin */
  function tally() { S.tierVotes = S.tierVotes || {}; return S.tierVotes; }
  function tallyOf(n) { var t = tally()[n] || {}; return { up: t.up || 0, down: t.down || 0 }; }

  function castVote(name, dir) {
    var v = myVotes();
    if (v[name] === dir) delete v[name]; else v[name] = dir;
    saveVotes();
    render();
    toast(v[name] ? "Vote enregistré — pense à envoyer ton bulletin" : "Vote retiré");
  }
  function voteBallot() {
    var v = myVotes(), out = [];
    Object.keys(v).forEach(function (n) { out.push((v[n] === "up" ? "+" : "-") + n); });
    return out.length ? tEnc({ v: out }) : "";
  }
  function readBallot(code) {
    var d = tDec(code);
    if (!d || !d.v || !d.v.length) throw new Error("vide");
    return d.v;
  }

  /* la barre de vote sous une vignette de la Tiers List */
  function voteBar(a) {
    if (!S.voteOn) return "";
    var mine = myVotes()[a.name], t = tallyOf(a.name);
    return '<div class="votes">' +
      '<button type="button" class="vbtn up' + (mine === "up" ? " on" : "") +
        '" data-vote="up" data-vn="' + esc(a.name) + '" title="Le monter d\'un palier">▲<i>' + t.up + "</i></button>" +
      '<button type="button" class="vbtn down' + (mine === "down" ? " on" : "") +
        '" data-vote="down" data-vn="' + esc(a.name) + '" title="Le descendre d\'un palier">▼<i>' + t.down + "</i></button>" +
      "</div>";
  }

  function votePanel() {
    if (!S.voteOn) return "";
    var n = Object.keys(myVotes()).length;
    return '<div class="votebox"><div class="vbhead"><b>Vote de la communauté</b>' +
      '<span class="betatag">BETA</span></div>' +
      "<p>Sous chaque vignette, ▲ propose de le monter d'un palier et ▼ de le descendre. " +
      "Quand tu as fini, clique sur « Enregistrer mes votes » : ils sont sauvegardés sur le site. " +
      "L'administrateur les voit dans son panneau et applique ceux qui font consensus.</p>" +
      '<div class="actions"><button class="btn' + (n ? " primary" : "") + '" id="vsave"' +
      (n ? "" : " disabled") + ">Enregistrer mes votes" + (n ? " (" + n + ")" : "") + "</button>" +
      (n ? '<button class="btn" id="vclear">Effacer mes votes</button>' : "") + "</div></div>";
  }


  /* ============ conseiller d'équipe ============
     Utilisé par « Composer moi-même » : lit la composition en cours et
     rend des remarques concrètes, chacune avec des noms cliquables. */

  var SLOT_LABEL = { DPS: "un DPS", BREAK: "un BREAK", SUPPORT: "un soutien",
                     HEAL: "un soigneur", REGEN: "un relais d'énergie" };

  /* les meilleurs candidats d'un rôle, hors ceux déjà pris */
  function topFor(role, exclude, n) {
    var out = roleScores(role)
      .filter(function (r) { return isFinal(r.a) && exclude.indexOf(r.a.name) < 0; })
      .slice(0, n || 3).map(function (r) { return r.a; });
    return out;
  }
  /* candidats qui frappent en ×1,6 un élément donné */
  function coversElem(elem, exclude, n) {
    return activeAniimos().filter(function (a) {
      return isFinal(a) && exclude.indexOf(a.name) < 0 &&
        (a.elems || []).some(function (e) { return chartOf(e).strong.indexOf(elem) >= 0; });
    }).sort(function (x, y) { return hit(y) - hit(x); }).slice(0, n || 2);
  }
  /* candidats porteurs d'un apport précis */
  function withTag(tag, exclude, n) {
    return activeAniimos().filter(function (a) {
      return isFinal(a) && exclude.indexOf(a.name) < 0 && tagsOf(a).indexOf(tag) >= 0;
    }).sort(function (x, y) { return total(y) - total(x); }).slice(0, n || 2);
  }
  function nameLinks(list) {
    return list.map(function (a) {
      return '<button type="button" class="sugg" data-sugg="' + esc(a.name) + '">' +
        icon(a, 20) + nameHtml(a) + '<span class="sr">' + esc(a.role) + "</span></button>";
    }).join("");
  }

  function coach(members) {
    if (!members.length) return [];
    var have = members.map(function (a) { return a.name; });
    var roles = {};
    members.forEach(function (a) { roles[a.role] = (roles[a.role] || 0) + 1; });
    var out = [];

    /* 1. les rôles qui manquent */
    if (!roles.BREAK) out.push({ k: "manque", t: "Il manque un BREAK",
      d: "Sans briseur, la garde des ennemis ne tombe pas : pas de fenêtre de dégâts, et la capture devient difficile. C'est le trou le plus coûteux d'une composition.",
      s: topFor("BREAK", have, 3) });
    if (!roles.DPS) out.push({ k: "manque", t: "Il manque un DPS",
      d: "Beaucoup d'utilitaire, mais personne pour convertir les fenêtres ouvertes en dégâts réels.",
      s: topFor("DPS", have, 3) });
    if (!roles.HEAL && !roles.REGEN) out.push({ k: "manque", t: "Ni soin ni relais d'énergie",
      d: "Tenable sur un combat court, risqué dès que ça dure : plus personne ne rend de PV ni d'EP.",
      s: topFor("HEAL", have, 2).concat(topFor("REGEN", have, 1)) });

    /* 2. doublons de rôle */
    Object.keys(roles).forEach(function (r) {
      if (roles[r] < 2) return;
      var manque = ["DPS", "BREAK", "SUPPORT", "HEAL"].filter(function (x) { return !roles[x]; });
      out.push({ k: "conseil", t: roles[r] + " " + r + " dans la même équipe",
        d: "Deux Aniimo du même rôle se marchent dessus." +
           (manque.length ? " Échange-en un contre " + SLOT_LABEL[manque[0]] + "." : ""),
        s: manque.length ? topFor(manque[0], have, 3) : [] });
    });

    /* 3. couverture élémentaire */
    var covered = {}, exposed = {};
    members.forEach(function (a) {
      (a.elems || []).forEach(function (e) {
        chartOf(e).strong.forEach(function (x) { covered[x] = 1; });
        chartOf(e).weak.forEach(function (x) { exposed[x] = (exposed[x] || 0) + 1; });
      });
    });
    var danger = Object.keys(exposed).filter(function (e) { return exposed[e] >= 2 && !covered[e]; });
    danger.slice(0, 2).forEach(function (e) {
      out.push({ k: "manque", t: "Rien ne répond à l'élément " + e,
        d: "Plusieurs membres y prennent ×1,6 et personne ne frappe en avantage en retour. Un seul Aniimo suffit à renverser le rapport.",
        s: coversElem(e, have, 3) });
    });

    /* 4. le noyau élémentaire et son amplificateur */
    var core = {};
    members.forEach(function (a) { (a.elems || []).forEach(function (e) { core[e] = (core[e] || 0) + 1; }); });
    Object.keys(core).forEach(function (e) {
      if (core[e] < 2) return;
      var amp = activeAniimos().filter(function (a) {
        return isFinal(a) && have.indexOf(a.name) < 0 && (a.elems || []).indexOf(e) >= 0 &&
          (tagsOf(a).indexOf("dmgUp") >= 0 || tagsOf(a).indexOf("crit") >= 0 || tagsOf(a).indexOf("team") >= 0);
      }).sort(function (x, y) { return total(y) - total(x); }).slice(0, 2);
      if (amp.length) out.push({ k: "atout", t: "Noyau " + e + " à " + core[e] + " membres",
        d: "Un amplificateur du même élément multiplie tout le noyau d'un coup : c'est le meilleur gain de dégâts disponible ici.",
        s: amp });
    });

    /* 5. énergie */
    var rgn = members.reduce(function (s2, a) { return s2 + a.regen; }, 0);
    if (members.length >= 3 && rgn < 330) out.push({ k: "conseil", t: "Énergie un peu juste (REGEN cumulé " + rgn + ")",
      d: "Les grosses compétences coûtent cher en EP. Un relais d'énergie évite les temps morts entre deux burst.",
      s: withTag("ep", have, 2).concat(withTag("epMax", have, 1)) });

    /* 6. confort : purge et bouclier */
    var hasCleanse = members.some(function (a) { return tagsOf(a).indexOf("cleanse") >= 0; });
    if (members.length >= 3 && !hasCleanse) out.push({ k: "conseil", t: "Personne ne dissipe les malus",
      d: "Contre un ennemi qui empile les altérations, une purge sauve un run entier.",
      s: withTag("cleanse", have, 2) });

    /* 7. ce qui fonctionne déjà */
    var good = [];
    if (roles.BREAK) good.push("le BREAK est assuré");
    if (roles.HEAL) good.push("un soigneur tient l'équipe");
    if (roles.DPS && roles.BREAK && (roles.SUPPORT || roles.REGEN)) good.push("les trois rôles clés sont couverts");
    if (Object.keys(covered).length >= 5) good.push("la couverture élémentaire est large (" + Object.keys(covered).length + " éléments frappés en ×1,6)");
    if (good.length) out.push({ k: "atout", t: "Ce qui tient déjà debout",
      d: cap(good.join(", ")) + ".", s: [] });

    return out;
  }

  /* titre + intro du coach, affiché au-dessus du sélecteur d'équipe */
  function coachHead() {
    return '<section class="coach">' + skHead("Le conseil du Codex") +
      '<p class="etlead">Ces remarques se recalculent à chaque changement. Clique un nom pour le placer dans une case libre.</p></section>';
  }
  /* cartes de conseil, affichées sous le sélecteur une fois au moins un Aniimo choisi */
  function coachGrid(members) {
    var items = coach(members);
    if (!items.length) return "";
    var ORD = { manque: 0, conseil: 1, atout: 2 };
    items.sort(function (x, y) { return ORD[x.k] - ORD[y.k]; });
    var LBL = { manque: "À corriger", conseil: "Conseil", atout: "Atout" };
    return '<section class="coach"><div class="coachgrid">' + items.map(function (it) {
      return '<div class="citem c-' + it.k + '"><div class="chead"><span>' + LBL[it.k] + "</span><b>" +
        esc(it.t) + "</b></div><p>" + esc(it.d) + "</p>" +
        (it.s && it.s.length ? '<div class="csugg">' + nameLinks(it.s) + "</div>" : "") + "</div>";
    }).join("") + "</div></section>";
  }

  function analyse(members, main) {
    var strong = [], weak = [], roles = {}, covered = [], threats = {};
    members.forEach(function (a) {
      roles[a.role] = (roles[a.role] || 0) + 1;
      elemsOf(a).forEach(function (e) {
        chartOf(e).strong.forEach(function (t) { if (covered.indexOf(t) < 0) covered.push(t); });
        chartOf(e).weak.forEach(function (t) { threats[t] = (threats[t] || 0) + 1; });
      });
    });
    var brk = members.reduce(function (s, a) { return s + a.brk; }, 0);
    var rgn = members.reduce(function (s, a) { return s + a.regen; }, 0);
    var burst = members.reduce(function (m, a) { return Math.max(m, hit(a)); }, 0);
    var bursty = members.filter(function (a) { return hit(a) === burst; })[0];

    strong.push("Pic de dégâts : <b>" + esc(bursty.name) + "</b> place " + burst +
      " de dégâts avec " + esc(bestName(bursty)) + " (puissance " + best(bursty) + ").");
    strong.push("BREAK cumulé de <b>" + brk + "</b> et REGEN cumulé de <b>" + rgn + "</b>.");
    if (covered.length) strong.push("L'équipe frappe en ×1,6 : <b>" + covered.join(", ") + "</b>.");
    var sameElem = {};
    members.forEach(function (a) { elemsOf(a).forEach(function (e) { sameElem[e] = (sameElem[e] || 0) + 1; }); });
    Object.keys(sameElem).forEach(function (e) {
      if (sameElem[e] >= 3) strong.push("Noyau <b>" + e + "</b> à " + sameElem[e] + " membres : les buffs élémentaires se cumulent.");
    });
    if (roles.BREAK) strong.push("Le BREAK est assuré — obligatoire pour ouvrir les fenêtres de dégâts et pour capturer.");

    if (!roles.BREAK) weak.push("<b>Aucun BREAK</b> : l'équipe n'ouvrira pas de fenêtre de dégâts. Remplace un membre par un briseur.");
    if (!roles.DPS) weak.push("<b>Aucun DPS</b> : beaucoup d'utilitaire, peu de dégâts réels.");
    if (!roles.HEAL && !roles.REGEN) weak.push("<b>Aucun soin ni REGEN</b> : tenable en combat court, risqué sur la durée.");
    var bigThreats = Object.keys(threats).filter(function (t) { return threats[t] >= 2 && covered.indexOf(t) < 0; });
    if (bigThreats.length) weak.push("Vulnérable à <b>" + bigThreats.join(", ") + "</b> : plusieurs membres y prennent ×1,6 et personne ne riposte en avantage.");
    var missing = ELEM_ORDER.filter(function (e) { return covered.indexOf(e) < 0; });
    if (missing.length > 5) weak.push("Couverture élémentaire étroite : aucun avantage contre " + missing.join(", ") + ".");
    if (rgn < 300) weak.push("REGEN cumulé faible (" + rgn + ") : l'énergie remontera lentement entre deux burst.");
    // apports réels du kit
    var pool = {};
    members.forEach(function (a) {
      tagsOf(a).forEach(function (t) {
        if (t.indexOf("elem:") === 0) return;
        (pool[t] = pool[t] || []).push(a.name);
      });
    });
    var need = needsOf(main);
    if (pool.ep) strong.push("Énergie : <b>" + pool.ep.join(", ") + "</b> rend de l'EP — " +
      esc(main.name) + " peut relancer " + esc(bestName(main)) + " sans attendre.");
    if (pool.dmgUp || pool.crit) strong.push("Amplification : <b>" +
      ((pool.dmgUp || []).concat(pool.crit || []).filter(function (v, i, s) { return s.indexOf(v) === i; }).join(", ")) +
      "</b> monte les dégâts ou le taux critique de l'équipe.");
    if (pool.debuff) strong.push("<b>" + pool.debuff.join(", ") + "</b> affaiblit la cible avant le burst.");
    if (pool.cleanse) strong.push("<b>" + pool.cleanse.join(", ") + "</b> peut dissiper les malus.");
    members.forEach(function (a) {
      if (a.synergy && a.name !== main.name) strong.push("<b>" + esc(a.name) + "</b> : " + esc(a.synergy) + ".");
    });

    if (!pool.ep && need.w.ep >= 30) weak.push("<b>Personne ne rend d'EP</b> — or " + esc(main.name) +
      " a un ultime coûteux. Un Aniimo comme Somniwing (+20 d'EP pour l'équipe) ou Besauce ferait mieux que du soin brut ici.");
    if (!pool.dmgUp && !pool.crit) weak.push("<b>Aucun amplificateur de dégâts</b> : personne ne monte l'ATK, les critiques ou n'affaiblit la cible.");
    var sustain = members.filter(function (a) { return a.role === "HEAL" || a.role === "REGEN"; });
    if (!pool.heal && !pool.regen && !sustain.length)
      weak.push("<b>Aucun soin ni régénération</b> : tenable en combat court, risqué sur la durée.");
    else if (!pool.heal && sustain.length && sustain.every(function (a) { return a.role === "REGEN"; }))
      strong.push("Le maintien passe par la régénération et l'énergie plutôt que par des soins directs — c'est le bon choix quand le pilier a surtout besoin de relancer ses compétences.");
    if (!pool.breakUp) weak.push("Personne n'accélère le BREAK : la fenêtre de dégâts s'ouvrira plus lentement.");

    if (!weak.length) weak.push("Rien de bloquant : rôles couverts, BREAK présent et couverture élémentaire correcte.");

    var order = members.slice().sort(function (a, b) {
      var w = { BREAK: 0, SUPPORT: 1, REGEN: 2, HEAL: 2, DPS: 3 };
      return w[a.role] - w[b.role];
    });
    var rot = [];
    order.forEach(function (a) {
      var tpl = {
        BREAK: "ouvre sur <b>" + esc(bestName(a)) + "</b> (puissance " + best(a) + ") et enchaîne les attaques BREAK jusqu'à briser la garde",
        SUPPORT: "pose ses bonus pendant la garde brisée : <b>" + esc(bestName(a)) + "</b>" +
          (a.synergy ? " — " + esc(a.synergy) : ""),
        REGEN: (has(a, "ep") ? "recharge l'équipe en EP juste avant le burst" : "entretient les PV et l'énergie") +
          " — <b>" + esc(bestName(a)) + "</b>" + (a.synergy ? " (" + esc(a.synergy) + ")" : ""),
        HEAL: "soigne juste avant le burst pour ne pas couper le cycle — <b>" + esc(bestName(a)) + "</b>" +
          (a.synergy ? " (" + esc(a.synergy) + ")" : ""),
        DPS: "entre DANS la fenêtre de BREAK et lâche <b>" + esc(bestName(a)) + "</b> (puissance " + best(a) + ", " + hit(a) + " de dégâts)"
      }[a.role];
      rot.push({ who: a.name, what: tpl, main: a.name === main.name });
    });
    if (main.role === "DPS") rot.push({ who: main.name, what: "ressort puis <b>ré-entre</b> pour re-déclencher son passif d'entrée, et relance le cycle", main: true });

    return { strong: strong, weak: weak, rotation: rot, brk: brk, rgn: rgn, burst: burst,
      covered: covered, roles: roles };
  }

  function pins() {
    if (view.pins === null) view.pins = ((S.team || {}).pinned || []).slice();
    return view.pins;
  }
  function teamMembers() {
    if (view.teamMode === "boss") {
      var tb = view.boss ? bossTeam(view.boss) : null;
      return tb ? { members: tb.members, notes: tb.notes, main: tb.main, boss: tb.boss, bt: tb.bt } : null;
    }
    var ms = view.teamSlots.map(findAni).filter(Boolean);
    if (!ms.length) return null;
    return { members: ms, notes: {}, main: ms[0] };
  }

  /* ordre aléatoire (mais stable pendant la session) des Aniimo, pour les pickers qui le demandent */
  var ANI_RAND_ORDER = null;
  function aniRandIndex(name) {
    if (!ANI_RAND_ORDER) {
      ANI_RAND_ORDER = {};
      var arr = activeAniimos().map(function (a) { return a.name; });
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      arr.forEach(function (n, idx) { ANI_RAND_ORDER[n] = idx; });
    }
    return ANI_RAND_ORDER[name];
  }
  function aniPicker(id, val, ph, roles, rand) {
    var cur = val ? findAni(val) : null;
    var open = view.openPicker === id;
    var list = activeAniimos().slice();
    if (rand) list.sort(function (a, b) { return aniRandIndex(a.name) - aniRandIndex(b.name); });
    else list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (roles && roles.length) list = list.filter(function (a) { return roles.indexOf(a.role) >= 0; });
    if (open && view.pickerQ) {
      var q = view.pickerQ.toLowerCase();
      list = list.filter(function (a) {
        return a.name.toLowerCase().indexOf(q) >= 0 || a.role.toLowerCase().indexOf(q) >= 0 ||
          a.elems.join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    var h = '<div class="apick' + (open ? " open" : "") + '" data-pid="' + id + '">' +
      '<button type="button" class="apickbtn" data-popen="' + id + '" aria-expanded="' + open + '">' +
      (cur ? icon(cur, 26) + "<b>" + nameHtml(cur) + '</b><span class="rank">' + esc(cur.role) + " · " +
        esc(cur.elems.join("/")) + "</span>" : '<span class="ph">' + esc(ph || "— choisir un Aniimo —") + "</span>") +
      '<span class="caret">▾</span></button>';
    if (open) {
      h += '<div class="apickmenu"><input class="apickq" type="search" placeholder="Chercher un Aniimo…" value="' +
        esc(view.pickerQ) + '">';
      if (val) h += '<button type="button" class="apickitem clear" data-pchoose="' + id + '" data-pval="">Vider ce slot</button>';
      h += '<div class="apicklist">';
      list.forEach(function (a) {
        h += '<button type="button" class="apickitem' + (a.name === val ? " on" : "") + '" data-pchoose="' + id +
          '" data-pval="' + esc(a.name) + '">' + icon(a, 24) + "<b>" + nameHtml(a) + "</b>" +
          '<span class="chips">' + a.elems.map(elemChip).join("") + roleChip(a.role) + "</span></button>";
      });
      if (!list.length) h += '<div class="apickempty">Aucun Aniimo ne correspond.</div>';
      h += "</div></div>";
    }
    return h + "</div>";
  }

  function bossPicker() {
    var cur = view.boss ? bossOf(view.boss) : null;
    var open = view.openPicker === "boss";
    var list = (S.bosses || []).slice();
    if (view.bossType) list = list.filter(function (b) { return b.type === view.bossType; });
    if (open && view.pickerQ) {
      var q = view.pickerQ.toLowerCase();
      list = list.filter(function (b) {
        var t = bossTypeOf(b.type);
        return (b.name + " " + b.elem + " " + (t ? t.name : "")).toLowerCase().indexOf(q) >= 0;
      });
    }
    var h = '<div class="apick' + (open ? " open" : "") + '" data-pid="boss">' +
      '<button type="button" class="apickbtn" data-popen="boss" aria-expanded="' + open + '">' +
      (cur ? "<b>" + esc(cur.name) + "</b>" + elemChip(cur.elem) +
        '<span class="rank">' + esc((bossTypeOf(cur.type) || {}).name || "") + "</span>"
        : '<span class="ph">— choisir un boss —</span>') + '<span class="caret">▾</span></button>';
    if (open) {
      h += '<div class="apickmenu"><input class="apickq" type="search" placeholder="alpha, raid, glace…" value="' +
        esc(view.pickerQ) + '"><div class="apicklist">';
      list.forEach(function (b) {
        h += '<button type="button" class="apickitem' + (b.key === view.boss ? " on" : "") +
          '" data-pchoose="boss" data-pval="' + esc(b.key) + '"><b>' + esc(b.name) + "</b>" +
          '<span class="chips">' + elemChip(b.elem) + "</span>" +
          '<span class="rank" style="margin-left:auto">' + esc((bossTypeOf(b.type) || {}).name || "") + "</span></button>";
      });
      if (!list.length) h += '<div class="apickempty">Aucun boss ne correspond. Ajoute-le dans le panneau admin.</div>';
      h += "</div></div>";
    }
    return h + "</div>";
  }



  /* une vignette de membre d'équipe, réutilisée pour la Team 1 et la Team 2 */
  function etMember(a, tip) {
    if (!a) return '<div class="etm empty"></div>';
    return '<div class="etm"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" +
      aniLink(a, icon(a, 48)) + "<b>" + aniLink(a, esc(a.name)) + "</b>" +
      '<span class="etrole" style="background:' + ((S.roles[a.role] || {}).color || "#888") + '">' +
      esc(a.role) + "</span></div>";
  }


  /* ================= descriptions d'équipe générées ==================
     Rien n'est écrit à la main : chaque phrase est reconstruite à partir
     des statistiques, du trait et des compétences des membres présents.
     Changer un Aniimo dans l'admin met donc le texte à jour tout seul. */

  var ROLE_JOB = {
    DPS:     "porte les dégâts",
    BREAK:   "casse la garde",
    SUPPORT: "soutient l'équipe",
    REGEN:   "entretient l'énergie",
    HEAL:    "tient l'équipe en vie"
  };

  /* la statistique qui définit l'Aniimo dans son rôle ; pour un soutien on
     retient celle qui ressort vraiment, pas l'ATK par défaut. */
  function keyStat(a) {
    if (a.role === "SUPPORT") {
      var c = [["REGEN", a.regen], ["BREAK", a.brk], ["ATK", a.atk]];
      c.sort(function (x, y) { return y[1] - x[1]; });
      return c[0][0] + " " + c[0][1];
    }
    var m = { DPS: ["ATK", a.atk], BREAK: ["BREAK", a.brk],
              REGEN: ["REGEN", a.regen], HEAL: ["PV", a.hp] }[a.role];
    return m ? m[0] + " " + m[1] : "";
  }
  /* la compétence la plus puissante, hors attaque de base */
  function bestSkill(a) {
    var best = null;
    (a.sk2 || []).forEach(function (sk) {
      if (!/^\d+$/.test(String(sk.m || ""))) return;
      if (/attaque de base/i.test(sk.nf || sk.n)) return;
      if (!best || +sk.m > +best.m) best = sk;
    });
    return best;
  }
  /* une phrase courte tirée de la description du trait */
  function traitLine(a) {
    var n = a.traitNameFr || a.traitName || a.trait;
    var d = (a.traitDesc || a.traitFr || "").trim();
    if (!n) return "";
    if (!d) return "Trait " + n + ".";
    d = d.charAt(0).toLowerCase() + d.slice(1);
    if (d.length > 190) d = d.slice(0, 187).replace(/[\s,;.]+$/, "") + "…";
    return "Trait " + n + " : " + d;
  }

  /* relation élémentaire d'un membre avec l'élément de l'équipe */
  function elemRole(a, elem) {
    if ((a.elems || []).indexOf(elem) >= 0) return "same";
    return "neutral";
  }

  /* la ligne affichée sous chaque membre */
  function autoPoint(a, elem) {
    if (!a) return "";
    var bits = [];
    var job = ROLE_JOB[a.role] || "complète l'équipe";
    var head = "Il " + job;
    if (a.role === "HEAL" || /^(Glacy|Gracewing|Glameep|Luminelle|Fragrancier|Leafy|Witchin|Piopiota|Coraliz)$/.test(a.name)) {
      head = (/e$/.test(a.name) ? "Elle " : "Il ") + job;
    }
    var ks = keyStat(a);
    var bs = bestSkill(a);
    var hit = "";
    if (bs) {
      hit = +bs.m >= 60
        ? ", et " + (bs.nf || bs.n) + " frappe à " + bs.m
        : ", et sa meilleure compétence plafonne à " + bs.m + " — ce n'est pas là qu'il faut chercher ses dégâts";
    }
    bits.push(head + (ks ? " avec " + ks : "") + hit + ".");
    var tl = traitLine(a);
    if (tl) bits.push(tl);
    if (elemRole(a, elem) === "neutral")
      bits.push("Il n'a pas l'élément de l'équipe : il est pris pour son kit.");
    return bits.join(" ");
  }

  /* le chapeau de la carte : la logique élémentaire, calculée */
  function autoLead(elem, members) {
    var list = members.map(findAni).filter(Boolean);
    var same = list.filter(function (a) { return (a.elems || []).indexOf(elem) >= 0; }).length;
    var ch = chartOf(elem);
    var t = same === 4 ? "Équipe mono-" + elem + " : les quatre membres partagent l'élément"
          : same >= 2 ? "Noyau " + elem + " de " + same + " membres, complété par des kits neutres"
          : "Équipe bâtie autour de " + elem + ", complétée par les meilleurs kits disponibles";
    var f = ch.strong.length ? " L'élément " + elem + " frappe en ×1,6 " + ch.strong.join(", ") + "." : "";
    var w = ch.weak.length ? " Il encaisse ×1,6 de " + ch.weak.join(" et ") + "." : "";
    return t + "." + f + w;
  }

  /* le piège à éviter, déduit de la composition */
  function autoRisk(elem, members) {
    var list = members.map(findAni).filter(Boolean);
    if (!list.length) return "";
    var out = [];
    var ch = chartOf(elem);
    var frail = list.slice().sort(function (x, y) { return x.hp - y.hp; })[0];
    var hasHeal = list.some(function (a) { return a.role === "HEAL"; });
    var hasBreak = list.some(function (a) { return a.role === "BREAK"; });
    var hasEp = list.some(function (a) { return a.role === "REGEN" || a.role === "SUPPORT"; });
    if (ch.weak.length) out.push("Cette équipe encaisse ×1,6 face à " + ch.weak.join(" et ") + " : c'est le match-up à préparer.");
    if (!hasHeal) out.push("Aucun soigneur dans la composition — c'est " +
      (hasEp ? "l'énergie et les fenêtres de BREAK qui la font tenir" : "la vitesse d'exécution qui la fait tenir") + ".");
    if (!hasBreak) out.push("Personne ne casse la garde : prévois un BREAK si la cible en a une.");
    if (frail && frail.hp && frail.hp < 95) out.push("Surveille " + frail.name + " et ses " + frail.hp + " PV, c'est le maillon fragile.");
    return out.join(" ");
  }

  /* pourquoi ce remplaçant, comparé au titulaire qu'il remplace */
  function autoAlt(alt, holder, elem) {
    if (!alt) return "";
    var bits = [];
    var ks = keyStat(alt), bs = bestSkill(alt);
    bits.push((ks ? ks : "") + (bs ? (ks ? ", " : "") + (bs.nf || bs.n) + " à " + bs.m : "") + ".");
    var tl = traitLine(alt);
    if (tl) bits.push(tl);
    if (holder && alt.name === holder.name) {
      return "Il garde sa place dans les deux versions : c'est le socle de l'équipe.";
    }
    if (holder) {
      var d = [];
      if (alt.role !== holder.role) d.push("il change le rôle de la place (" + holder.role + " → " + alt.role + ")");
      var stat = { DPS: "atk", BREAK: "brk", SUPPORT: "atk", REGEN: "regen", HEAL: "hp" }[alt.role] || "atk";
      if (alt.role === holder.role && alt[stat] !== holder[stat]) {
        d.push(alt[stat] > holder[stat] ? "il tape plus haut sur la statistique du rôle"
                                        : "il rend un peu de statistique mais change ce que la place apporte");
      }
      if (elemRole(alt, elem) === "same" && elemRole(holder, elem) !== "same") d.push("il ramène l'élément de l'équipe");
      if (elemRole(alt, elem) !== "same" && elemRole(holder, elem) === "same") d.push("il sort de l'élément de l'équipe");
      if (d.length) bits.push(cap(d.join(", ")) + ".");
    }
    return bits.join(" ");
  }

  /* les 9 équipes types, une par élément de boss */
  /* ordre demandé pour l'affichage des équipes par élément */
  var ELEM_TEAM_ORDER = ["Foudre", "Feu", "Glace", "Plante", "Eau", "Ténèbres", "Lumière", "Vent", "Roche"];
  function elemTeamOrder() {
    return ELEM_TEAM_ORDER.filter(function (e) { return ELEM_ORDER.indexOf(e) >= 0; })
      .concat(ELEM_ORDER.filter(function (e) { return ELEM_TEAM_ORDER.indexOf(e) < 0; }));
  }
  function elemTeamsPanel() {
    var h = '<div class="homewarn small" style="--wc:#ff3b3b"><b class="warntag">Important</b>' +
      "Les Teams présentées ne sont que des exemples. Dans une team, il te faut un DPS et un BREAK ; " +
      "les rôles Support, Regen et Soin, eux, se valent et sont interchangeables.</div>" +
      '<section class="etsec"><div class="etbody">' +
      skHead("Les meilleures équipes par élément") +
      '<p class="etlead">Une équipe bâtie autour de chaque élément : un DPS pour porter les dégâts, ' +
      "un BREAK pour ouvrir la garde, un soutien et un relais d'énergie.</p>" +
      goldNote("À noter",
        "Les teams proposées ont été faites de manière à optimiser au mieux vos combats. " +
        "Chaque élément a sa Team 1 et sa Team 2, à jouer selon les Aniimo dont tu disposes.") +
      "</div>" +
      tipNote(TIP_CLICK, "left") +
      /* même effet d'arrivée que la Tiers List */
      '<div class="etboard"><div class="etgrid' + animClass("tiers") + '">';
    elemTeamOrder().forEach(function (e, ei) {
      var t = elemTeamOf(e);
      var col = S.elements[e] || "#888";
      h += '<div class="etcard fxi" style="--ec:' + col + ";--glow:" + col + ";--i:" + ei + '">' +
        '<div class="ethead">' + elemChip(e) +
        '<span class="etvs">élément ' + esc(e) + "</span></div>";
      if (!t.members.length) {
        h += '<p class="etempty">Aucune équipe pour cet élément.</p>';
      } else {
        h += '<div class="etteam">' + t.members.map(function (n) {
          return etMember(findAni(n));
        }).join("") + "</div>";
        var alts = (t.alts || []).filter(function (x) { return x && x.n && findAni(x.n); });
        if (alts.length) {
          h += '<div class="etsep"><span>Team 2</span></div>' +
            '<div class="etteam alt2">' + (t.alts || []).map(function (x) {
              return x && x.n ? etMember(findAni(x.n), x.d) : '<div class="etm empty"></div>';
            }).join("") + "</div>";
        }
      }
      var infoOpen = view.etInfoOpen === e;
      var infoInner = "";
      if (t.points && t.points.length) {
        infoInner += '<ul class="etpts">' + t.points.map(function (pt) {
          var a2 = findAni(pt.t);
          return "<li>" + (a2 ? icon(a2, 22) : "") +
            "<div><b>" + esc(pt.t) + "</b>" + esc(pt.d) + "</div></li>";
        }).join("") + "</ul>";
      }
      if ((t.alts || []).some(function (x) { return x && x.n; })) {
        infoInner += '<div class="etaltbox"><span class="etalth">Team 2</span><ul>' +
          t.alts.map(function (x, ai) {
            if (!x || !x.n) return "";
            var b = findAni(x.n);
            return "<li>" + (b ? icon(b, 20) : "") + "<div><b>" + esc(x.n) + "</b>" +
              (t.members[ai] ? '<span class="etfor">à la place de ' + esc(t.members[ai]) + "</span>" : "") +
              esc(x.d || "") + "</div></li>";
          }).join("") + "</ul></div>";
      }
      if (t.risk) infoInner += '<p class="etrisk"><span>Piège à éviter</span>' + esc(t.risk) + "</p>";
      if (t.note) infoInner += '<p class="etnote">' + esc(t.note) + "</p>";
      h += '<button type="button" class="etinfobtn" data-etinfo="' + esc(e) + '" aria-expanded="' + infoOpen + '">' +
        "Info" + '<span class="etwhycaret">' + (infoOpen ? "▴" : "▾") + "</span></button>" +
        '<div class="etinfobody' + (infoOpen ? " open" : "") + '"><div class="etfoldin">' + infoInner + "</div></div>";
      h += "</div>";
    });
    return h + "</div></div></section>";
  }

  function viewTeam() {
    var h = '<div class="head"><h1>Team</h1></div>';
    h += elemTeamsPanel();
    return h;
  }

  /* ---------------- admin ---------------- */
  /* ---------------- panneau admin : coquille ----------------
     Les sections sont rangées par famille dans une colonne de gauche,
     avec une description et un compteur : on trouve où aller sans lire
     une rangée de dix boutons identiques. */
  var ADMIN_SECS = [
    { g: "Contenu", k: "aniimo", n: "Aniimo",
      d: "Fiches, statistiques, compétences et icônes",
      c: function () { return S.aniimos.length + " fiches"; } },
    { g: "Contenu", k: "specs", n: "Spécialités du Foyer",
      d: "Les 9 éléments et leur description",
      c: function () { return (S.specs || []).length + " éléments"; } },
    { g: "Contenu", k: "jobs", n: "Métiers",
      d: "Noms, couleurs, rendements et icônes",
      c: function () { return (S.jobs || []).length + " métiers"; } },
    { g: "Contenu", k: "abil", n: "Abilités",
      d: "Onglets HomeLand et Classique",
      c: function () { return (S.abilities || []).length + " onglets"; } },
    { g: "Contenu", k: "pages", n: "Catégories du site",
      d: "Ajouter, renommer, masquer ou réordonner les rubriques",
      c: function () { return tabs().length + " catégories"; } },
    { g: "Contenu", k: "accueil", n: "Page d'accueil",
      d: "Le message d'avertissement affiché en haut de l'Accueil",
      c: function () { return "1 message"; } },
    { g: "Contenu", k: "devblog", n: "Notes de mise à jour",
      d: "Créer, modifier et supprimer les patch notes du Devblog",
      c: function () { return devList().length + " version" + (devList().length > 1 ? "s" : ""); } },
    { g: "Contenu", k: "custom", n: "Constructeur de page",
      d: "Créer une page entièrement libre : titres, textes, encadrés, listes, images",
      c: function () { var n = customTabsList().length; return n ? n + " page" + (n > 1 ? "s" : "") : "aucune"; } },

    { g: "Jeu", k: "bosses", n: "Boss et équipes",
      d: "Liste des boss et compositions par élément",
      c: function () { return (S.bosses || []).length + " boss"; } },
    { g: "Jeu", k: "tiers", n: "Tiers List",
      d: "Corriger les paliers et les phrases affichées",
      c: function () { return Object.keys(tFix()).length + " corrections"; } },
    { g: "Jeu", k: "votes", n: "Votes",
      d: "Compter les bulletins et valider les propositions",
      c: function () { var n = Object.keys(tally()).length; return n ? n + " en attente" : "aucun"; } },
    { g: "Jeu", k: "team", n: "Équipe par défaut",
      d: "L'équipe présentée à l'arrivée sur l'onglet Team",
      c: function () { return ((S.team || {}).main || "—"); } },

    { g: "Apparence", k: "effets", n: "Effets d'arrivée",
      d: "L'animation jouée en entrant dans chaque catégorie",
      c: function () { return (S.effects || []).length + " effets"; } },
    { g: "Apparence", k: "style", n: "Écriture et pétillement",
      d: "Couleurs du reflet, des étincelles et des encadrés dorés",
      c: function () { return "3 réglages"; } },
    { g: "Apparence", k: "rarity", n: "Couleurs de rareté",
      d: "Paliers du Score Potentiel et rareté des Aniipods",
      c: function () { return "8 paliers"; } },
    { g: "Apparence", k: "acces", n: "Accès au panneau",
      d: "Phrase de passe et visibilité de la rubrique Gestion",
      c: function () { return (S.meta || {}).adminHash ? "verrouillé" : "ouvert"; } },
    { g: "Apparence", k: "protect", n: "Protection du contenu",
      d: "Anti-copie : clic droit, Ctrl+U, sélection, avertissement",
      c: function () {
        var p = protect(), n = 0;
        for (var k in p) if (p[k]) n++;
        return n + "/5 actifs";
      } }
  ];

  function viewAdmin() {
    var cur = view.adminSec;
    if (!ADMIN_SECS.some(function (x) { return x.k === cur; })) cur = view.adminSec = "aniimo";
    var groups = [];
    ADMIN_SECS.forEach(function (x) { if (groups.indexOf(x.g) < 0) groups.push(x.g); });

    var pubInfo = PUBLISHED_AT ?
      "publié le " + new Date(PUBLISHED_AT).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) :
      "jamais publié en direct";
    var h = '<div class="head"><h1>Panneau admin</h1><span class="count">' +
      (draftLoaded ? "brouillon local" : "version publiée") + "</span></div>" +
      '<div class="banner"><b>' + (draftLoaded ? "Modifications non publiées" : "À jour") + "</b>" +
      '<span style="color:var(--ink-2)">Publier met à jour le site en direct pour tout le monde, en quelques secondes, ' +
      "sans reconstruire la page (" + esc(pubInfo) + "). Les images et icônes ne sont pas incluses — utilise " +
      '« Exporter le JSON » pour celles-là.</span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn primary" id="publish">Publier</button>' +
      '<button class="btn" id="exportjson">Exporter le JSON</button>' +
      '<button class="btn" id="importjson">Importer un JSON</button>' +
      '<button class="btn danger" id="revert">Abandonner le brouillon</button>' +
      (PUBLISHED_AT ? '<button class="btn danger" id="unpublish">Retirer la publication</button>' : "") +
      "</div>";

    h += '<div class="adminshell"><nav class="adminnav">';
    groups.forEach(function (g) {
      /* chaque famille dans son encadré léger */
      h += '<div class="anbox"><div class="angroup">' + esc(g) + "</div>";
      ADMIN_SECS.filter(function (x) { return x.g === g; }).forEach(function (x) {
        var n = "";
        try { n = x.c(); } catch (e) { n = ""; }
        h += '<button class="ansec' + (x.k === cur ? " on" : "") + '" data-asec="' + x.k + '">' +
          "<b>" + esc(x.n) + "</b><span>" + esc(x.d) + '</span><i class="ancount">' + esc(n) + "</i></button>";
      });
      h += "</div>";
    });
    h += '</nav><div class="adminmain">';

    if (cur === "aniimo") h += adminAniimo();
    else if (cur === "specs") h += adminSpecs();
    else if (cur === "jobs") h += adminJobs();
    else if (cur === "abil") h += adminAbil();
    else if (cur === "pages") h += adminPages();
    else if (cur === "accueil") h += adminAccueil();
    else if (cur === "devblog") h += adminDevblog();
    else if (cur === "custom") h += adminCustom();
    else if (cur === "bosses") h += adminBosses();
    else if (cur === "tiers") h += adminTiers();
    else if (cur === "votes") h += adminVotes();
    else if (cur === "team") h += adminTeam();
    else if (cur === "effets") h += adminEffects();
    else if (cur === "style") h += adminStyle();
    else if (cur === "rarity") h += adminRarity();
    else if (cur === "protect") h += adminProtect();
    else h += adminLockCard();

    return h + "</div></div>";
  }


  /* ---------------- admin : catégories du site ---------------- */
  var PAGE_KINDS = [
    ["roster", "Liste d'Aniimo (tableau)"], ["power", "Compétences"],
    ["abil", "Abilités"], ["jobs", "Métiers"], ["team", "Team"],
    ["tier", "Tiers List"], ["wip", "Rédaction en cours"],
    ["custom", "Page personnalisée (page libre)"],
    ["home", "Page d'accueil"], ["admin", "Panneau admin"]
  ];
  function userTabs() { S.tabs = S.tabs || null; return S.tabs; }

  function adminPages() {
    /* la liste éditable démarre sur celle du code, puis vit dans le brouillon */
    var list = userTabs() || TABS.map(function (t) {
      return { id: t.id, label: t.label, kind: t.kind, grp: t.grp, hidden: !!t.hidden };
    });
    var h = '<div class="card"><h3>Catégories du site</h3>' +
      "<p>Ce sont les rubriques du menu de gauche. Renomme-les, change leur ordre, masque-en une le temps de la préparer, " +
      "ou ajoute une rubrique « Rédaction en cours » qui affichera l'ourson et la note en attendant son contenu.</p>" +
      '<div class="tablewrap"><table class="tight" id="pagetable"><thead><tr>' +
      "<th>Ordre</th><th>Nom affiché</th><th>Contenu</th><th>Groupe</th><th>Visible</th><th></th>" +
      "</tr></thead><tbody>";
    list.forEach(function (t, i) {
      var locked = t.kind === "admin" || t.kind === "home";
      h += "<tr data-pg='" + i + "'>" +
        '<td class="num"><button type="button" class="btn sm" data-pgup="' + i + '"' +
        (i ? "" : " disabled") + '>↑</button> <button type="button" class="btn sm" data-pgdn="' + i + '"' +
        (i < list.length - 1 ? "" : " disabled") + ">↓</button></td>" +
        '<td><input data-pk="label" value="' + esc(t.label) + '" style="min-width:170px"></td>' +
        '<td><select data-pk="kind"' + (locked ? " disabled" : "") + ">" + PAGE_KINDS.map(function (k) {
          return '<option value="' + k[0] + '"' + (k[0] === t.kind ? " selected" : "") + ">" + esc(k[1]) + "</option>";
        }).join("") + "</select></td>" +
        '<td><select data-pk="grp"><option value="Fiches"' + (t.grp === "Fiches" ? " selected" : "") + ">Fiches</option>" +
        '<option value="Gestion"' + (t.grp === "Gestion" ? " selected" : "") + ">Gestion</option></select></td>" +
        '<td><label class="f check"><input type="checkbox" data-pk="show"' + (t.hidden ? "" : " checked") +
        (locked ? " disabled" : "") + "> <span></span></label></td>" +
        "<td>" + (locked ? '<span class="rank">rubrique système</span>'
          : '<button type="button" class="btn sm danger" data-pgdel="' + i + '">Supprimer</button>') + "</td></tr>";
    });
    h += '</tbody></table></div><div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="savepages">Enregistrer les catégories</button>' +
      '<button class="btn" id="addpage">+ Nouvelle catégorie</button>' +
      '<button class="btn" id="resetpages">Revenir aux catégories d\'origine</button></div>' +
      '<p class="note">Une catégorie « Rédaction en cours » affiche l\'illustration et la note d\'attente : ' +
      "pratique pour annoncer une rubrique avant de l'écrire.</p></div>";
    return h;
  }

  function readPages() {
    var out = [];
    document.querySelectorAll("#pagetable tbody tr").forEach(function (tr) {
      var g = function (k) { return tr.querySelector('[data-pk="' + k + '"]'); };
      var cur = (userTabs() || TABS)[+tr.dataset.pg] || {};
      out.push({
        id: cur.id, label: g("label").value.trim() || cur.label,
        kind: g("kind").disabled ? cur.kind : g("kind").value,
        grp: g("grp").value,
        hidden: g("show").disabled ? false : !g("show").checked
      });
    });
    return out;
  }
  function bindAdminPages() {
    on("savepages", "onclick", function () {
      S.tabs = readPages(); persist("Catégories enregistrées"); render();
    });
    on("addpage", "onclick", function () {
      var l = userTabs() || TABS.map(function (t) {
        return { id: t.id, label: t.label, kind: t.kind, grp: t.grp, hidden: !!t.hidden };
      });
      l.splice(l.length - 1, 0, { id: "p" + Date.now().toString(36), label: "Nouvelle catégorie",
        kind: "wip", grp: "Fiches", hidden: false });
      S.tabs = l; persist("Catégorie ajoutée"); render();
    });
    on("resetpages", "onclick", function () {
      if (!confirm("Revenir aux catégories d'origine ?")) return;
      S.tabs = null; persist("Catégories réinitialisées"); render();
    });
    function move(i, d) {
      var l = readPages();
      if (i + d < 0 || i + d >= l.length) return;
      var x = l.splice(i, 1)[0]; l.splice(i + d, 0, x);
      S.tabs = l; persist("Ordre modifié"); render();
    }
    document.querySelectorAll("[data-pgup]").forEach(function (b) {
      b.onclick = function () { move(+b.dataset.pgup, -1); };
    });
    document.querySelectorAll("[data-pgdn]").forEach(function (b) {
      b.onclick = function () { move(+b.dataset.pgdn, 1); };
    });
    document.querySelectorAll("[data-pgdel]").forEach(function (b) {
      b.onclick = function () {
        var l = readPages(), t = l[+b.dataset.pgdel];
        if (!confirm("Supprimer la catégorie « " + t.label + " » ?")) return;
        l.splice(+b.dataset.pgdel, 1);
        S.tabs = l; if (view.tab === t.id) view.tab = "tous";
        persist("Catégorie supprimée"); render();
      };
    });
  }

  /* ---------------- admin : page d'accueil ---------------- */
  var HOMEWARN_DEFAULT = "Ce site est un projet de fan développé à partir des informations disponibles durant " +
    "la Bêta 3 d’Aniimo ainsi que du Wiki officiel d’Aniimo. Certaines données peuvent donc différer de la version finale du jeu.";
  function homeWarn() { return (S.homeWarn != null) ? S.homeWarn : HOMEWARN_DEFAULT; }
  function homeWarnColor() { return S.homeWarnColor || "#ff3b3b"; }
  function homeWarnHalo() { return S.homeWarnHalo !== false; }

  function adminAccueil() {
    return '<div class="card"><h3>Page d\'accueil</h3>' +
      "<p>Le message d'avertissement affiché tout en haut de l'Accueil, avant le journal des mises à jour.</p>" +
      '<div class="f wide"><label>Texte du message</label>' +
      '<textarea id="hwtxt" rows="4">' + esc(homeWarn()) + '</textarea></div>' +
      '<div class="row4 pickrow" style="margin-top:10px">' +
      '<label class="f"><span>Couleur du cadre</span><input type="color" id="hwcolor" value="' + esc(homeWarnColor()) + '"></label>' +
      '<label class="f check" style="align-self:end"><input type="checkbox" id="hwhalo"' + (homeWarnHalo() ? " checked" : "") +
      '> <span></span> Effet animé sur le contour</label></div>' +
      '<div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="savehw">Enregistrer</button>' +
      '<button class="btn" id="resethw">Revenir au message d\'origine</button></div></div>';
  }
  function bindAdminAccueil() {
    on("savehw", "onclick", function () {
      S.homeWarn = document.getElementById("hwtxt").value.trim() || HOMEWARN_DEFAULT;
      S.homeWarnColor = document.getElementById("hwcolor").value;
      S.homeWarnHalo = document.getElementById("hwhalo").checked;
      persist("Accueil enregistré"); render();
    });
    on("resethw", "onclick", function () {
      S.homeWarn = null; S.homeWarnColor = null; S.homeWarnHalo = null;
      persist("Accueil réinitialisé"); render();
    });
  }

  /* ---------------- admin : notes de mise à jour (Devblog) ---------------- */
  function devList() {
    if (!S.patchnotes || !S.patchnotes.length) S.patchnotes = JSON.parse(JSON.stringify(PATCHNOTES));
    return S.patchnotes;
  }
  function adminDevblog() {
    var L = devList();
    var h = '<div class="card"><h3>Notes de mise à jour (Devblog)</h3>' +
      "<p>Chaque carte correspond à une version affichée sur l'Accueil. Ajoute, modifie ou supprime des lignes " +
      "de type Ajout, Modification ou Suppression : elles s'affichent en vert, jaune ou rouge.</p></div>";
    h += '<div class="devadminlist">';
    L.forEach(function (p, vi) {
      h += '<div class="card devadmincard" data-dvi="' + vi + '" style="margin-top:14px">' +
        '<div class="devadminhead">' +
        '<label class="f"><span>Version</span><input data-df="version" value="' + esc(p.version) + '" style="width:90px"></label>' +
        '<label class="f"><span>Date affichée</span><input data-df="date" value="' + esc(p.date) + '" style="width:180px"></label>' +
        '<span style="flex:1"></span>' +
        '<button type="button" class="btn sm" data-dvup="' + vi + '"' + (vi ? "" : " disabled") + '>↑</button> ' +
        '<button type="button" class="btn sm" data-dvdn="' + vi + '"' + (vi < L.length - 1 ? "" : " disabled") + '>↓</button> ' +
        '<button type="button" class="btn sm danger" data-dvdel="' + vi + '">Supprimer la version</button>' +
        "</div>" +
        '<div class="tablewrap"><table class="tight" data-dctable="' + vi + '"><thead><tr>' +
        "<th>Type</th><th>Texte</th><th></th></tr></thead><tbody>";
      (p.changes || []).forEach(function (c, ci) {
        h += "<tr>" +
          '<td><select data-dc="t">' + Object.keys(PATCH_TYPE).map(function (k) {
            return '<option value="' + k + '"' + (k === c.t ? " selected" : "") + ">" + esc(PATCH_TYPE[k].label) + "</option>";
          }).join("") + "</select></td>" +
          '<td><input data-dc="txt" value="' + esc(c.txt) + '" style="width:100%"></td>' +
          '<td><button type="button" class="btn sm danger" data-dcdel="' + vi + ":" + ci + '">✕</button></td></tr>';
      });
      h += "</tbody></table></div>" +
        '<div class="actions" style="margin-top:10px">' +
        '<button type="button" class="btn sm" data-dcadd="' + vi + '">+ Ajouter une ligne</button></div></div>';
    });
    h += "</div>" +
      '<div class="actions" style="margin-top:14px">' +
      '<button class="btn primary" id="savedev">Enregistrer les notes</button>' +
      '<button class="btn" id="adddev">+ Nouvelle version</button>' +
      '<button class="btn" id="resetdev">Revenir aux notes d\'origine</button></div>';
    return h;
  }
  /* relit l'intégralité du formulaire (versions + lignes) tel qu'affiché à l'écran */
  function readDevblog() {
    var out = [];
    document.querySelectorAll(".devadmincard").forEach(function (card) {
      var vi = card.dataset.dvi;
      var g = function (k) { return card.querySelector('[data-df="' + k + '"]'); };
      var changes = [];
      card.querySelectorAll('[data-dctable="' + vi + '"] tbody tr').forEach(function (tr) {
        changes.push({
          t: tr.querySelector('[data-dc="t"]').value,
          txt: tr.querySelector('[data-dc="txt"]').value.trim()
        });
      });
      out.push({ version: g("version").value.trim() || "0.0", date: g("date").value.trim(), changes: changes });
    });
    return out;
  }
  function bindAdminDevblog() {
    on("savedev", "onclick", function () {
      S.patchnotes = readDevblog(); persist("Notes enregistrées"); render();
    });
    on("adddev", "onclick", function () {
      var l = readDevblog();
      l.unshift({ version: "0.0", date: "", changes: [{ t: "add", txt: "" }] });
      S.patchnotes = l; persist("Version ajoutée"); render();
    });
    on("resetdev", "onclick", function () {
      if (!confirm("Revenir aux notes d'origine ?")) return;
      S.patchnotes = null; persist("Notes réinitialisées"); render();
    });
    document.querySelectorAll("[data-dvup]").forEach(function (b) {
      b.onclick = function () {
        var l = readDevblog(), i = +b.dataset.dvup;
        if (i < 1) return;
        var x = l.splice(i, 1)[0]; l.splice(i - 1, 0, x);
        S.patchnotes = l; persist("Ordre modifié"); render();
      };
    });
    document.querySelectorAll("[data-dvdn]").forEach(function (b) {
      b.onclick = function () {
        var l = readDevblog(), i = +b.dataset.dvdn;
        if (i >= l.length - 1) return;
        var x = l.splice(i, 1)[0]; l.splice(i + 1, 0, x);
        S.patchnotes = l; persist("Ordre modifié"); render();
      };
    });
    document.querySelectorAll("[data-dvdel]").forEach(function (b) {
      b.onclick = function () {
        var l = readDevblog(), i = +b.dataset.dvdel;
        if (!confirm("Supprimer la version « " + (l[i].version || "") + " » ?")) return;
        l.splice(i, 1);
        S.patchnotes = l; view.devOpen = null; persist("Version supprimée"); render();
      };
    });
    document.querySelectorAll("[data-dcadd]").forEach(function (b) {
      b.onclick = function () {
        var l = readDevblog(), vi = +b.dataset.dcadd;
        l[vi].changes.push({ t: "add", txt: "" });
        S.patchnotes = l; persist("Ligne ajoutée"); render();
      };
    });
    document.querySelectorAll("[data-dcdel]").forEach(function (b) {
      b.onclick = function () {
        var parts = b.dataset.dcdel.split(":"), vi = +parts[0], ci = +parts[1];
        var l = readDevblog();
        l[vi].changes.splice(ci, 1);
        S.patchnotes = l; persist("Ligne supprimée"); render();
      };
    });
  }

  /* ---------------- admin : constructeur de page (pages personnalisées) ----------------
     Une page personnalisée est une rubrique (kind:"custom") dont le contenu est une
     liste de blocs ordonnée. Chaque bloc a un type (titre, texte, encadré, liste,
     image, séparateur, espacement) et ses propres réglages. L'effet d'arrivée et le
     style d'écriture de la page se règlent comme pour n'importe quelle rubrique,
     dans les sections « Effets d'arrivée » et « Écriture et pétillement ». */
  var BLOCK_TYPES = [
    ["title", "Titre"], ["text", "Paragraphe"], ["note", "Encadré"],
    ["list", "Liste à puces"], ["image", "Image"], ["divider", "Séparateur"], ["spacer", "Espacement"]
  ];
  function blockLabel(type) {
    for (var i = 0; i < BLOCK_TYPES.length; i++) if (BLOCK_TYPES[i][0] === type) return BLOCK_TYPES[i][1];
    return type;
  }
  function newBlock(type) {
    var id = "b" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    if (type === "title") return { id: id, type: type, text: "Nouveau titre", size: "h2", align: "left" };
    if (type === "text") return { id: id, type: type, text: "Texte du paragraphe…", align: "left", bold: false };
    if (type === "note") return { id: id, type: type, text: "Texte de l'encadré…", color: "#F0A82C", halo: false };
    if (type === "list") return { id: id, type: type, style: "neutre", items: ["Élément 1", "Élément 2"] };
    if (type === "image") return { id: id, type: type, url: "", width: "medium", align: "center", caption: "" };
    if (type === "divider") return { id: id, type: type, label: "" };
    if (type === "spacer") return { id: id, type: type, size: "md" };
    return { id: id, type: type };
  }
  function customPages() { S.customPages = S.customPages || {}; return S.customPages; }
  function customBlocks(id) {
    var C = customPages();
    if (!C[id] || !C[id].blocks) C[id] = { blocks: (C[id] && C[id].blocks) || [] };
    return C[id].blocks;
  }
  function customTabsList() { return tabs().filter(function (t) { return t.kind === "custom"; }); }

  /* rendu public d'un bloc */
  function blockHtml(b, i) {
    var al = "pgalign-" + (b.align || "left");
    var extra = "", inner = "", style = "--i:" + Math.min(i, 26);
    if (b.type === "title") {
      extra = "pgtitle " + al;
      inner = b.size === "h2" ? skHead(b.text || "") :
        '<div class="pgtitle-' + (b.size === "h3" ? "h3" : "h1") + '">' + esc(b.text || "") + "</div>";
    } else if (b.type === "text") {
      extra = "pgtext " + al + (b.bold ? " pgbold" : "");
      inner = esc(b.text || "").replace(/\n/g, "<br>");
    } else if (b.type === "note") {
      extra = "homewarn" + (b.halo ? "" : " nohalo");
      style += ";--wc:" + esc(b.color || "#F0A82C");
      inner = esc(b.text || "").replace(/\n/g, "<br>");
    } else if (b.type === "list") {
      extra = "pglist " + al;
      var cls = b.style === "good" ? "bul good" : b.style === "bad" ? "bul bad" : "bul";
      inner = '<ul class="' + cls + '">' + (b.items || []).map(function (it) {
        return it.trim() ? "<li>" + esc(it) + "</li>" : "";
      }).join("") + "</ul>";
    } else if (b.type === "image") {
      extra = "pgimgwrap " + al;
      inner = (b.url ?
        '<img class="pgimg pgw-' + esc(b.width || "medium") + '" src="' + esc(b.url) + '" alt="' + esc(b.caption || "") + '">' :
        '<div class="pgimgempty">Aucune image pour l\'instant — colle un lien dans le panneau admin.</div>') +
        (b.caption ? '<div class="pgimgcap">' + esc(b.caption) + "</div>" : "");
    } else if (b.type === "divider") {
      extra = "pgdivwrap";
      inner = b.label ? '<div class="pgdiv"><span>' + esc(b.label) + "</span></div>" : '<hr class="pgdivplain">';
    } else if (b.type === "spacer") {
      extra = "pgspacer pgsp-" + esc(b.size || "md");
    }
    return '<div class="pgblock fxi ' + extra + '" style="' + style + '">' + inner + "</div>";
  }
  function customPanel(t) {
    var blocks = customBlocks(t.id);
    var h = '<div class="head"><h1>' + esc(t.label) + "</h1></div>";
    if (!blocks.length) return h + '<div class="wipwrap">' + wipNote() + "</div>";
    h += '<div class="pgwrap' + animClass() + '">' + blocks.map(blockHtml).join("") + "</div>";
    return h;
  }

  /* éditeur admin d'un bloc */
  function customBlockCard(b, i, total) {
    function alignSel(cur) {
      return ["left", "center", "right"].map(function (a) {
        return '<option value="' + a + '"' + (a === (cur || "left") ? " selected" : "") + ">" +
          (a === "left" ? "Gauche" : a === "center" ? "Centré" : "Droite") + "</option>";
      }).join("");
    }
    var head = '<div class="devadminhead"><b>' + esc(blockLabel(b.type)) + "</b>" +
      '<span style="flex:1"></span>' +
      '<button type="button" class="btn sm" data-cbup="' + i + '"' + (i ? "" : " disabled") + ">↑</button> " +
      '<button type="button" class="btn sm" data-cbdn="' + i + '"' + (i < total - 1 ? "" : " disabled") + ">↓</button> " +
      '<button type="button" class="btn sm danger" data-cbdel="' + i + '">Supprimer</button></div>';
    var body = "";
    if (b.type === "title") {
      body = '<div class="f wide"><label>Texte</label><input data-bf="text" value="' + esc(b.text) + '"></div>' +
        '<div class="row4" style="margin-top:8px">' +
        '<label class="f"><span>Taille</span><select data-bf="size">' +
        '<option value="h1"' + (b.size === "h1" ? " selected" : "") + ">Grand</option>" +
        '<option value="h2"' + (b.size === "h2" ? " selected" : "") + ">Moyen (avec effet scintillant)</option>" +
        '<option value="h3"' + (b.size === "h3" ? " selected" : "") + ">Petit</option>" +
        "</select></label>" +
        '<label class="f"><span>Alignement</span><select data-bf="align">' + alignSel(b.align) + "</select></label>" +
        "</div>";
    } else if (b.type === "text") {
      body = '<div class="f wide"><label>Texte</label><textarea data-bf="text" rows="4">' + esc(b.text) + "</textarea></div>" +
        '<div class="row4" style="margin-top:8px">' +
        '<label class="f"><span>Alignement</span><select data-bf="align">' + alignSel(b.align) + "</select></label>" +
        '<label class="f check" style="align-self:end"><input type="checkbox" data-bf="bold"' + (b.bold ? " checked" : "") +
        "> <span></span> Texte en gras</label>" +
        "</div>";
    } else if (b.type === "note") {
      body = '<div class="f wide"><label>Texte de l\'encadré</label><textarea data-bf="text" rows="3">' + esc(b.text) + "</textarea></div>" +
        '<div class="row4 pickrow" style="margin-top:8px">' +
        '<label class="f"><span>Couleur du cadre</span><input type="color" data-bf="color" value="' + esc(b.color || "#F0A82C") + '"></label>' +
        '<label class="f check" style="align-self:end"><input type="checkbox" data-bf="halo"' + (b.halo ? " checked" : "") +
        "> <span></span> Effet animé sur le contour</label>" +
        "</div>";
    } else if (b.type === "list") {
      body = '<div class="f wide"><label>Éléments (un par ligne)</label><textarea data-bf="items" rows="4">' +
        esc((b.items || []).join("\n")) + "</textarea></div>" +
        '<div class="row4" style="margin-top:8px"><label class="f"><span>Style des puces</span><select data-bf="style">' +
        '<option value="neutre"' + (b.style === "neutre" || !b.style ? " selected" : "") + ">Neutre</option>" +
        '<option value="good"' + (b.style === "good" ? " selected" : "") + ">Positif (vert)</option>" +
        '<option value="bad"' + (b.style === "bad" ? " selected" : "") + ">Négatif (rouge)</option>" +
        "</select></label></div>";
    } else if (b.type === "image") {
      body = '<div class="f wide"><label>Lien de l\'image</label><input data-bf="url" value="' + esc(b.url) + '" placeholder="https://…"></div>' +
        '<div class="row4" style="margin-top:8px">' +
        '<label class="f"><span>Largeur</span><select data-bf="width">' +
        '<option value="small"' + (b.width === "small" ? " selected" : "") + ">Petite</option>" +
        '<option value="medium"' + (b.width === "medium" || !b.width ? " selected" : "") + ">Moyenne</option>" +
        '<option value="large"' + (b.width === "large" ? " selected" : "") + ">Grande</option>" +
        '<option value="full"' + (b.width === "full" ? " selected" : "") + ">Pleine largeur</option>" +
        "</select></label>" +
        '<label class="f"><span>Alignement</span><select data-bf="align">' + alignSel(b.align) + "</select></label>" +
        '<label class="f wide"><span>Légende (optionnel)</span><input data-bf="caption" value="' + esc(b.caption) + '"></label>' +
        "</div>";
    } else if (b.type === "divider") {
      body = '<div class="f wide"><label>Texte au centre (optionnel)</label><input data-bf="label" value="' + esc(b.label) +
        '" placeholder="ex. Bêta 3"></div>';
    } else if (b.type === "spacer") {
      body = '<div class="f"><label>Hauteur</label><select data-bf="size">' +
        '<option value="sm"' + (b.size === "sm" ? " selected" : "") + ">Petite</option>" +
        '<option value="md"' + (b.size === "md" || !b.size ? " selected" : "") + ">Moyenne</option>" +
        '<option value="lg"' + (b.size === "lg" ? " selected" : "") + ">Grande</option>" +
        "</select></div>";
    }
    return '<div class="card devadmincard cblock" data-cbi="' + i + '" data-cbtype="' + esc(b.type) +
      '" style="margin-top:12px">' + head + body + "</div>";
  }
  function adminCustom() {
    var CT = customTabsList();
    var h = '<div class="card"><h3>Constructeur de page</h3>' +
      "<p>Crée une page entièrement libre, bloc par bloc : titres, paragraphes, encadrés, listes, images, séparateurs, " +
      "espacements. Chaque bloc s'ajoute, se réordonne et se supprime. L'effet d'arrivée et le style d'écriture de la " +
      "page se règlent comme pour n'importe quelle rubrique, dans « Effets d'arrivée » et « Écriture et pétillement ».</p>";
    if (!CT.length) {
      h += '<p class="note">Aucune page personnalisée pour l\'instant.</p>' +
        '<div class="actions"><button class="btn primary" id="newcustom">+ Créer une page personnalisée</button></div></div>';
      return h;
    }
    h += '<div class="modes" style="margin-top:4px">' + CT.map(function (t) {
      return '<button type="button" class="btn' + (view.customEdit === t.id ? " primary" : "") +
        '" data-cpick="' + esc(t.id) + '">' + esc(t.label) + "</button>";
    }).join("") + '<button type="button" class="btn" id="newcustom">+ Nouvelle page</button></div></div>';

    var validCur = view.customEdit && CT.some(function (t) { return t.id === view.customEdit; });
    var cur = validCur ? view.customEdit : CT[0].id;
    view.customEdit = cur;
    var t = tabOf(cur), blocks = customBlocks(cur);

    h += '<div class="card" style="margin-top:14px">' +
      '<div class="devadminhead"><h3 style="margin:0">' + esc(t.label) + "</h3><span style=\"flex:1\"></span>" +
      '<button type="button" class="btn sm" id="cpgview">Voir la page</button> ' +
      '<button type="button" class="btn sm" data-asec="pages">Renommer / réordonner / supprimer</button></div>' +
      '<p class="note" style="margin-top:0">Le nom affiché, la place dans le menu et la suppression de cette page ' +
      "se gèrent dans « Catégories du site ».</p>";

    h += '<div class="cblist">';
    blocks.forEach(function (b, i) { h += customBlockCard(b, i, blocks.length); });
    h += "</div>";

    if (!blocks.length) h += '<p class="note">Cette page est vide : elle affiche la note "en préparation" aux visiteurs. Ajoute un premier bloc.</p>';

    h += '<div class="actions" style="margin-top:12px">' +
      '<select id="cbaddtype">' + BLOCK_TYPES.map(function (bt) {
        return '<option value="' + bt[0] + '">' + esc(bt[1]) + "</option>";
      }).join("") + "</select> " +
      '<button type="button" class="btn" id="cbadd">+ Ajouter un bloc</button>' +
      '<span style="flex:1"></span>' +
      '<button class="btn primary" id="savecustom">Enregistrer la page</button>' +
      (blocks.length ? '<button class="btn danger" id="clearcustom">Vider la page</button>' : "") +
      "</div></div>";
    return h;
  }
  function readCustomBlocks() {
    var out = [], id = view.customEdit, cur = id ? customBlocks(id) : [];
    document.querySelectorAll(".cblock").forEach(function (card) {
      var i = +card.dataset.cbi, type = card.dataset.cbtype, from = cur[i] || {};
      var g = function (k) { return card.querySelector('[data-bf="' + k + '"]'); };
      var b = { id: from.id, type: type };
      if (type === "title") { b.text = g("text").value.trim(); b.size = g("size").value; b.align = g("align").value; }
      else if (type === "text") { b.text = g("text").value; b.align = g("align").value; b.bold = g("bold").checked; }
      else if (type === "note") { b.text = g("text").value; b.color = g("color").value; b.halo = g("halo").checked; }
      else if (type === "list") {
        b.items = g("items").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        b.style = g("style").value;
      } else if (type === "image") {
        b.url = g("url").value.trim(); b.width = g("width").value; b.align = g("align").value; b.caption = g("caption").value.trim();
      } else if (type === "divider") { b.label = g("label").value.trim(); }
      else if (type === "spacer") { b.size = g("size").value; }
      out.push(b);
    });
    return out;
  }
  function bindAdminCustom() {
    document.querySelectorAll("[data-cpick]").forEach(function (b) {
      b.onclick = function () { view.customEdit = b.dataset.cpick; render(); };
    });
    on("newcustom", "onclick", function () {
      var l = userTabs() || TABS.map(function (t) { return { id: t.id, label: t.label, kind: t.kind, grp: t.grp, hidden: !!t.hidden }; });
      var id = "p" + Date.now().toString(36);
      l.splice(l.length - 1, 0, { id: id, label: "Nouvelle page", kind: "custom", grp: "Fiches", hidden: false });
      S.tabs = l; view.customEdit = id; persist("Page personnalisée créée"); render();
    });
    on("cpgview", "onclick", function () {
      if (!view.customEdit) return;
      view.tab = view.customEdit; animate = true; render(); animate = false; window.scrollTo(0, 0);
    });
    on("savecustom", "onclick", function () {
      if (!view.customEdit) return;
      customPages()[view.customEdit] = { blocks: readCustomBlocks() };
      persist("Page enregistrée"); render();
    });
    on("clearcustom", "onclick", function () {
      if (!view.customEdit) return;
      if (!confirm("Vider tous les blocs de cette page ?")) return;
      customPages()[view.customEdit] = { blocks: [] };
      persist("Page vidée"); render();
    });
    on("cbadd", "onclick", function () {
      if (!view.customEdit) return;
      var type = document.getElementById("cbaddtype").value;
      var blocks = readCustomBlocks();
      blocks.push(newBlock(type));
      customPages()[view.customEdit] = { blocks: blocks };
      persist("Bloc ajouté"); render();
    });
    function move(i, d) {
      if (!view.customEdit) return;
      var blocks = readCustomBlocks();
      if (i + d < 0 || i + d >= blocks.length) return;
      var x = blocks.splice(i, 1)[0]; blocks.splice(i + d, 0, x);
      customPages()[view.customEdit] = { blocks: blocks };
      persist("Ordre modifié"); render();
    }
    document.querySelectorAll("[data-cbup]").forEach(function (b) { b.onclick = function () { move(+b.dataset.cbup, -1); }; });
    document.querySelectorAll("[data-cbdn]").forEach(function (b) { b.onclick = function () { move(+b.dataset.cbdn, 1); }; });
    document.querySelectorAll("[data-cbdel]").forEach(function (b) {
      b.onclick = function () {
        if (!view.customEdit) return;
        var blocks = readCustomBlocks(), i = +b.dataset.cbdel;
        if (!confirm("Supprimer ce bloc ?")) return;
        blocks.splice(i, 1);
        customPages()[view.customEdit] = { blocks: blocks };
        persist("Bloc supprimé"); render();
      };
    });
  }

  /* ---------------- admin : écriture et pétillement ----------------
     Un style est une petite fiche réutilisable (couleurs, nombre
     d'étincelles, vitesse, reflet, liseré). On les crée ici, puis on
     rattache un style à chaque rubrique du site. */
  /* les cinq animations d'écriture et les cinq encadrements disponibles */
  var TEXT_FX = [
    ["shine",   "Reflet balayant",  "un éclat glisse sur les lettres"],
    ["pulse",   "Halo qui respire", "le nom s'éclaire et s'éteint doucement"],
    ["wave",    "Vague",            "les lettres montent et descendent l'une après l'autre"],
    ["glitch",  "Glitch",           "un décalage chromatique bref, par à-coups"],
    ["neon",    "Néon",             "un contour lumineux qui vibre légèrement"],
    ["rainbow", "Arc-en-ciel",      "un dégradé multicolore défile sur les lettres"],
    ["type",    "Machine à écrire", "les lettres apparaissent une à une, curseur clignotant"],
    ["none",    "Aucun",            "texte fixe"]
  ];
  var FRAME_FX = [
    ["gold",     "Liseré tournant", "un dégradé fait le tour du cadre"],
    ["dashed",   "Pointillés",      "des tirets défilent le long du bord"],
    ["corners",  "Équerres",        "quatre coins marqués, pas de cadre complet"],
    ["glow",     "Halo",            "une lueur diffuse qui respire"],
    ["double",   "Double filet",    "deux traits fins, sobre et net"],
    ["sweep",    "Balayage",        "un point lumineux unique parcourt le contour"],
    ["confetti", "Confettis",       "quatre pastilles de couleur clignotent aux coins"],
    ["none",     "Aucun",           "bord simple"]
  ];
  var STYLE_BUILTIN = [
    { key: "rb",    name: "Rouge et bleu",   spRed: "#FF4B57", spBlue: "#4FA8FF",
      gold: "#C9A227", sparkles: 5, speed: 2.1, fx: "shine", frame: "gold" },
    { key: "or",    name: "Or classique",    spRed: "#FFD97A", spBlue: "#FFF3D0",
      gold: "#C9A227", sparkles: 3, speed: 2.6, fx: "shine", frame: "gold" },
    { key: "glace", name: "Glacial",         spRed: "#7CE7FF", spBlue: "#FFFFFF",
      gold: "#4FD0E0", sparkles: 4, speed: 2.4, fx: "pulse",  frame: "glow" },
    { key: "braise", name: "Braise",         spRed: "#FF7A3C", spBlue: "#FFD166",
      gold: "#E8702A", sparkles: 5, speed: 1.6, fx: "wave",   frame: "dashed" },
    { key: "emer",  name: "Émeraude",        spRed: "#48E39B", spBlue: "#CFFFE6",
      gold: "#2FA36B", sparkles: 3, speed: 2.8, fx: "neon",   frame: "corners" },
    { key: "neon",  name: "Néon violet",     spRed: "#C77DFF", spBlue: "#7B2FFF",
      gold: "#A855F7", sparkles: 5, speed: 1.4, fx: "glitch", frame: "double" },
    { key: "rose",  name: "Pétale",          spRed: "#FF8FB1", spBlue: "#FFD6E7",
      gold: "#E0559B", sparkles: 4, speed: 3.0, fx: "wave",   frame: "glow" },
    { key: "abysse", name: "Abysse",         spRed: "#4FA8FF", spBlue: "#8FE3FF",
      gold: "#2E6FD9", sparkles: 3, speed: 3.2, fx: "pulse",  frame: "double" },
    { key: "mono",  name: "Argent",          spRed: "#E8ECF4", spBlue: "#9AA6BF",
      gold: "#8E99AE", sparkles: 2, speed: 2.9, fx: "neon",   frame: "dashed" },
    { key: "calm",  name: "Sobre",           spRed: "#FF4B57", spBlue: "#4FA8FF",
      gold: "#C9A227", sparkles: 0, speed: 2.1, fx: "none", frame: "none" }
  ];
  function styleList() {
    if (!S.textStyles || !S.textStyles.length) S.textStyles = JSON.parse(JSON.stringify(STYLE_BUILTIN));
    S.textStyles.forEach(normStyle);
    return S.textStyles;
  }
  /* un style enregistré avant l'arrivée des effets nommés */
  function normStyle(c) {
    if (typeof c.fx !== "string") c.fx = c.shine === false ? "none" : "shine";
    if (typeof c.frame !== "string") c.frame = c.frame === false ? "none" : "gold";
    delete c.shine;
    return c;
  }
  function styleByKey(k) {
    var l = styleList();
    for (var i = 0; i < l.length; i++) if (l[i].key === k) return l[i];
    return l[0];
  }
  function pageStyles() { S.pageStyle = S.pageStyle || {}; return S.pageStyle; }
  /* le style rattaché à une rubrique, sinon le premier de la liste */
  function styleOf(page) { return styleByKey(pageStyles()[page] || styleList()[0].key); }

  /* applique le style de la rubrique ouverte */
  function applyStyle(st) {
    var c = st || styleOf(view.tab), r = document.documentElement;
    r.style.setProperty("--sp-red", c.spRed);
    r.style.setProperty("--sp-blue", c.spBlue);
    r.style.setProperty("--gold-line", c.gold);
    r.style.setProperty("--sp-speed", c.speed + "s");
    TEXT_FX.forEach(function (f) { r.classList.toggle("tfx-" + f[0], c.fx === f[0]); });
    FRAME_FX.forEach(function (f) { r.classList.toggle("frm-" + f[0], c.frame === f[0]); });
    for (var i = 1; i <= 5; i++) r.classList.toggle("sp-off-" + i, i > (c.sparkles || 0));
  }

  function stylePreview(c, id) {
    var sp = "";
    for (var i = 1; i <= 5; i++) {
      sp += '<span class="sp sp' + i + '"' + (i > c.sparkles ? ' style="display:none"' : "") + ">" + STAR + "</span>";
    }
    var txt = "Tous les Aniimos";
    var letters = txt.split("").map(function (ch, li) {
      return '<i style="--l:' + li + '">' + (ch === " " ? "&nbsp;" : ch) + "</i>";
    }).join("");
    return '<div class="stprev tfx-' + esc(c.fx) + " frm-" + esc(c.frame) + '" id="' + id +
      '" style="--sp-red:' + esc(c.spRed) + ";--sp-blue:" + esc(c.spBlue) +
      ";--gold-line:" + esc(c.gold) + ";--sp-speed:" + c.speed + 's">' +
      '<button class="tab" aria-current="true"><span class="tablab">' +
      '<span class="shine" data-txt="' + esc(txt) + '">' + letters + "</span>" +
      sp + "</span></button>" +
      '<p class="abilnote"><span>Exemple</span>L\'encadré avec son effet.</p></div>';
  }

  function adminStyle() {
    var L = styleList(), PG = tabs().filter(function (t) { return t.kind !== "admin"; });

    /* 1. rattachement rubrique → style */
    var h = '<div class="card"><h3>Style d\'écriture par rubrique</h3>' +
      "<p>Chaque rubrique du site peut porter son propre style : couleur des étincelles, reflet sur le nom, " +
      "liseré des encadrés dorés. Crée les styles plus bas, puis rattache-les ici.</p>" +
      '<div class="tablewrap"><table class="tight" id="stpages"><thead><tr>' +
      "<th>Rubrique</th><th>Style appliqué</th><th></th></tr></thead><tbody>";
    PG.forEach(function (t) {
      var cur = pageStyles()[t.id] || L[0].key;
      h += "<tr data-stp='" + esc(t.id) + "'><td><b>" + esc(t.label) + "</b></td>" +
        '<td><select data-stk="style">' + L.map(function (x) {
          return '<option value="' + esc(x.key) + '"' + (x.key === cur ? " selected" : "") + ">" + esc(x.name) + "</option>";
        }).join("") + "</select></td>" +
        '<td><button type="button" class="btn sm" data-stgo="' + esc(t.id) + '">Voir la rubrique</button></td></tr>';
    });
    h += '</tbody></table></div><div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="savestpages">Enregistrer les rattachements</button>' +
      '<button class="btn" id="stall">Appliquer le premier style partout</button></div></div>';

    /* 2. la bibliothèque de styles */
    h += '<div class="card" style="margin-top:14px"><h3>Les styles disponibles</h3>' +
      "<p>Modifie un style et toutes les rubriques qui l'utilisent suivent. L'aperçu de chaque fiche est en direct.</p>" +
      '<div class="stgrid">';
    L.forEach(function (c, i) {
      var used = PG.filter(function (t) { return (pageStyles()[t.id] || L[0].key) === c.key; }).length;
      h += '<div class="stcard" data-sti="' + i + '">' +
        '<div class="sthead"><input data-sf="name" value="' + esc(c.name) + '">' +
        '<span class="rank">' + (used ? used + " rubrique" + (used > 1 ? "s" : "") : "non utilisé") + "</span>" +
        (L.length > 1 ? '<button type="button" class="btn sm danger" data-stdel="' + i + '">Supprimer</button>' : "") +
        "</div>" +
        '<div class="strow">' +
        '<label class="f"><span>Étincelle 1</span><input type="color" data-sf="spRed" value="' + esc(c.spRed) + '"></label>' +
        '<label class="f"><span>Étincelle 2</span><input type="color" data-sf="spBlue" value="' + esc(c.spBlue) + '"></label>' +
        '<label class="f"><span>Encadrés</span><input type="color" data-sf="gold" value="' + esc(c.gold) + '"></label>' +
        "</div>" +
        '<div class="strow">' +
        '<label class="f wide"><span>Étincelles : <b class="stn">' + c.sparkles + '</b></span>' +
        '<input type="range" data-sf="sparkles" min="0" max="5" step="1" value="' + c.sparkles + '"></label>' +
        '<label class="f wide"><span>Vitesse : <b class="stv">' + c.speed + '</b> s</span>' +
        '<input type="range" data-sf="speed" min="0.8" max="4" step="0.1" value="' + c.speed + '"></label>' +
        "</div>" +
        '<div class="stfxrow">' +
        '<div class="stfxbox fxtype-writing"><span class="stfxlabel">Effet d\'écriture</span>' +
        '<p class="stfxhint">anime le nom de la rubrique</p>' +
        '<select data-sf="fx">' +
        TEXT_FX.map(function (f) {
          return '<option value="' + f[0] + '"' + (f[0] === c.fx ? " selected" : "") +
            ' title="' + esc(f[2]) + '">' + esc(f[1]) + "</option>";
        }).join("") + "</select></div>" +
        '<div class="stfxbox fxtype-frame"><span class="stfxlabel">Encadrement</span>' +
        '<p class="stfxhint">habille les encadrés dorés</p>' +
        '<select data-sf="frame">' +
        FRAME_FX.map(function (f) {
          return '<option value="' + f[0] + '"' + (f[0] === c.frame ? " selected" : "") +
            ' title="' + esc(f[2]) + '">' + esc(f[1]) + "</option>";
        }).join("") + "</select></div>" +
        "</div>" +
        stylePreview(c, "stp" + i) + "</div>";
    });
    h += '</div><div class="actions" style="margin-top:12px">' +
      '<button class="btn primary" id="savestyles">Enregistrer les styles</button>' +
      '<button class="btn" id="addstyle">+ Nouveau style</button>' +
      '<button class="btn" id="resetstyle">Revenir aux styles d\'origine</button></div></div>';
    return h;
  }

  function readStyleCard(card) {
    var g = function (k) { return card.querySelector('[data-sf="' + k + '"]'); };
    var i = +card.dataset.sti, cur = styleList()[i] || {};
    return {
      key: cur.key || ("s" + Date.now().toString(36)),
      name: g("name").value.trim() || "Style",
      spRed: g("spRed").value, spBlue: g("spBlue").value, gold: g("gold").value,
      sparkles: +g("sparkles").value, speed: +g("speed").value,
      fx: g("fx").value, frame: g("frame").value
    };
  }

  function bindAdminStyle() {
    /* aperçu en direct, sans recharger la page */
    document.querySelectorAll(".stcard").forEach(function (card) {
      function live() {
        var c = readStyleCard(card), pv = card.querySelector(".stprev");
        pv.style.setProperty("--sp-red", c.spRed);
        pv.style.setProperty("--sp-blue", c.spBlue);
        pv.style.setProperty("--gold-line", c.gold);
        pv.style.setProperty("--sp-speed", c.speed + "s");
        pv.querySelectorAll(".sp").forEach(function (el, i) {
          el.style.display = i < c.sparkles ? "" : "none";
        });
        TEXT_FX.forEach(function (f) { pv.classList.toggle("tfx-" + f[0], c.fx === f[0]); });
        FRAME_FX.forEach(function (f) { pv.classList.toggle("frm-" + f[0], c.frame === f[0]); });
        var n = card.querySelector(".stn"), v = card.querySelector(".stv");
        if (n) n.textContent = c.sparkles;
        if (v) v.textContent = c.speed;
      }
      card.querySelectorAll("[data-sf]").forEach(function (el) { el.oninput = live; el.onchange = live; });
    });
    on("savestyles", "onclick", function () {
      var out = [];
      document.querySelectorAll(".stcard").forEach(function (c) { out.push(readStyleCard(c)); });
      S.textStyles = out;
      persist("Styles enregistrés"); render();
    });
    on("addstyle", "onclick", function () {
      var l = styleList();
      l.push({ key: "s" + Date.now().toString(36), name: "Nouveau style",
        spRed: "#FF4B57", spBlue: "#4FA8FF", gold: "#C9A227",
        sparkles: 3, speed: 2.1, fx: "shine", frame: "gold" });
      persist("Style ajouté"); render();
    });
    document.querySelectorAll("[data-stdel]").forEach(function (b) {
      b.onclick = function () {
        var l = styleList(), i = +b.dataset.stdel, k = (l[i] || {}).key;
        if (l.length < 2 || !confirm("Supprimer le style « " + l[i].name + " » ?")) return;
        l.splice(i, 1);
        Object.keys(pageStyles()).forEach(function (p2) {
          if (pageStyles()[p2] === k) delete pageStyles()[p2];
        });
        persist("Style supprimé"); render();
      };
    });
    on("savestpages", "onclick", function () {
      var m = pageStyles();
      document.querySelectorAll("#stpages tbody tr").forEach(function (tr) {
        m[tr.dataset.stp] = tr.querySelector('[data-stk="style"]').value;
      });
      persist("Rattachements enregistrés"); render();
    });
    on("stall", "onclick", function () {
      var k = styleList()[0].key, m = {};
      tabs().forEach(function (t) { m[t.id] = k; });
      S.pageStyle = m; persist("Style appliqué partout"); render();
    });
    document.querySelectorAll("[data-stgo]").forEach(function (b) {
      b.onclick = function () {
        view.tab = b.dataset.stgo; animate = true; render(); animate = false; window.scrollTo(0, 0);
      };
    });
    on("resetstyle", "onclick", function () {
      if (!confirm("Revenir aux styles d'origine ?")) return;
      S.textStyles = null; S.pageStyle = {};
      persist("Styles réinitialisés"); render();
    });
  }

  /* ---------------- admin : couleurs de rareté ---------------- */
  function adminRarity() {
    var ST = scoreTiersList(), R = itemRarities();
    var h = '<div class="card"><h3>Score Potentiel — Informations &gt; Raretés</h3>' +
      "<p>Les 4 paliers de rareté d'un Aniimo capturé, avec leur couleur de contour.</p>" +
      '<div class="stgrid">';
    ST.forEach(function (t, i) {
      h += '<div class="rarcard" data-sci="' + i + '">' +
        '<div class="sthead"><input data-scf="name" value="' + esc(t.name) + '"><span class="rank">' + esc(t.pct) + "</span></div>" +
        '<div class="strow">' +
        '<label class="f"><span>Couleur</span><input type="color" data-scf="color" value="' + esc(t.color) + '"></label>' +
        '<label class="f wide"><span>Pourcentage affiché</span><input data-scf="pct" value="' + esc(t.pct) + '"></label>' +
        "</div></div>";
    });
    h += '</div><div class="actions" style="margin-top:12px">' +
      '<button class="btn primary" id="savescore">Enregistrer</button>' +
      '<button class="btn" id="resetscore">Revenir aux couleurs d\'origine</button></div></div>';

    h += '<div class="card" style="margin-top:14px"><h3>Rareté des Aniipods — Informations &gt; Aniipods</h3>' +
      "<p>Couleur de contour de chaque rareté d'objet. Le Prismatique utilise en plus trois couleurs pour son dégradé.</p>" +
      '<div class="stgrid">';
    ["rare", "epique", "legendaire", "prismatique"].forEach(function (k) {
      var r = R[k];
      h += '<div class="rarcard" data-rak="' + k + '">' +
        '<div class="sthead"><input data-raf="label" value="' + esc(r.label) + '"></div>' +
        '<div class="strow">' +
        '<label class="f"><span>Couleur' + (k === "prismatique" ? " 1" : "") + '</span><input type="color" data-raf="color" value="' + esc(r.color) + '"></label>' +
        (k === "prismatique" ?
          '<label class="f"><span>Couleur 2</span><input type="color" data-raf="pm2" value="' + esc(r.pm2 || "#35E6D8") + '"></label>' +
          '<label class="f"><span>Couleur 3</span><input type="color" data-raf="pm3" value="' + esc(r.pm3 || "#FFFFFF") + '"></label>'
          : "") +
        "</div></div>";
    });
    h += '</div><div class="actions" style="margin-top:12px">' +
      '<button class="btn primary" id="saverar">Enregistrer</button>' +
      '<button class="btn" id="resetrar">Revenir aux couleurs d\'origine</button></div></div>';
    return h;
  }
  function bindAdminRarity() {
    on("savescore", "onclick", function () {
      var out = [];
      document.querySelectorAll(".rarcard[data-sci]").forEach(function (card, i) {
        var cur = scoreTiersList()[i] || {};
        out.push({
          key: cur.key, no: cur.no,
          name: card.querySelector('[data-scf="name"]').value.trim() || cur.name,
          pct: card.querySelector('[data-scf="pct"]').value.trim() || cur.pct,
          color: card.querySelector('[data-scf="color"]').value
        });
      });
      S.scoreTiers = out; persist("Couleurs enregistrées"); render();
    });
    on("resetscore", "onclick", function () {
      if (!confirm("Revenir aux couleurs d'origine du Score Potentiel ?")) return;
      S.scoreTiers = null; persist("Couleurs réinitialisées"); render();
    });
    on("saverar", "onclick", function () {
      var out = {};
      document.querySelectorAll(".rarcard[data-rak]").forEach(function (card) {
        var k = card.dataset.rak, cur = itemRarities()[k] || {};
        out[k] = { label: card.querySelector('[data-raf="label"]').value.trim() || cur.label,
          color: card.querySelector('[data-raf="color"]').value };
        if (k === "prismatique") {
          out[k].pm1 = out[k].color;
          out[k].pm2 = card.querySelector('[data-raf="pm2"]').value;
          out[k].pm3 = card.querySelector('[data-raf="pm3"]').value;
        }
      });
      S.itemRarities = out; persist("Couleurs enregistrées"); render();
    });
    on("resetrar", "onclick", function () {
      if (!confirm("Revenir aux couleurs d'origine des Aniipods ?")) return;
      S.itemRarities = null; persist("Couleurs réinitialisées"); render();
    });
  }

  function adminAniimo() {
    var list = S.aniimos.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (view.q) {
      var q = view.q.toLowerCase();
      list = list.filter(function (a) { return a.name.toLowerCase().indexOf(q) >= 0; });
    }
    var cur = view.pick ? findAni(view.pick) : null;
    var h = '<div class="adminwrap"><div><div class="field" style="margin-bottom:8px"><label for="q">Filtrer</label>' +
      '<input id="q" type="search" placeholder="nom…" value="' + esc(view.q) + '"></div><div class="picker">';
    list.forEach(function (a) {
      h += '<button data-pick="' + esc(a.name) + '"' + (cur && cur.name === a.name ? ' aria-current="true"' : "") + ">" +
        icon(a, 22) + "<span>" + esc(a.name) + '</span><span class="rank" style="margin-left:auto">' + esc(a.no) + "</span></button>";
    });
    h += '</div><button class="btn" id="addani" style="margin-top:8px;width:100%">+ Nouvel Aniimo</button></div><div class="card">';
    if (!cur) {
      h += "<h3>Choisis un Aniimo à gauche</h3><p>Ou crée-en un nouveau.</p></div></div>";
      return h;
    }
    var elemOpts = ELEM_ORDER.map(function (e) { return '<option value="' + e + '">' + e + "</option>"; }).join("");
    h += '<form class="form" id="anif">' +
      '<div class="icocell"><span id="preview">' + icon(cur, 52) + "</span><h3>" + esc(cur.name) + "</h3></div>" +
      '<div class="row">' +
      fld("no", "N°", cur.no) + fld("name", "Nom", cur.name) +
      '<div class="f"><label for="a-e1">Élément 1</label><select id="a-e1">' + elemOpts + "</select></div>" +
      '<div class="f"><label for="a-e2">Élément 2</label><select id="a-e2"><option value="">—</option>' + elemOpts + "</select></div>" +
      '<div class="f"><label for="a-role">Rôle</label><select id="a-role">' +
      ROLE_ORDER.map(function (r) { return '<option value="' + r + '">' + r + "</option>"; }).join("") + "</select></div>" +
      '<div class="f"><label for="a-type">Type de dégâts</label><select id="a-type">' +
      ["Physique", "Magique", "Soin", "n.c."].map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("") + "</select></div>" +
      "</div>" +
      '<div class="f"><label>Métiers Aniimo</label><div class="checks">' + S.jobs.map(function (j) {
        return '<label class="f check"><input type="checkbox" data-job="' + j.key + '"> <span>' + j.icon + " " + esc(j.name) + "</span></label>";
      }).join("") + "</div></div>" +
      '<div class="f"><label for="a-joblevel">Niveau de métier réel (voir wiki.aniimo.com — pas forcément le niveau max)</label>' +
      '<input id="a-joblevel" type="number" min="0" value="' + esc(cur.jobLevel || "") + '"></div>' +
      '<div class="f"><label>Icône</label><div class="iconedit">' +
      '<input id="a-img" placeholder="URL ou data:image/… — vide = pastille générée" value="' + esc(cur.img || "") + '">' +
      '<button type="button" class="btn" id="pickimg">Choisir un fichier…</button>' +
      '<button type="button" class="btn" id="clearimg">Retirer</button></div>' +
      '<span class="rank">L\'image est redimensionnée à 64 px et stockée dans la page.</span></div>' +
      '<div class="row">' + fld("hp", "PV", cur.hp) + fld("atk", "ATK", cur.atk) + fld("pdef", "DÉF. Phys.", cur.pdef) +
      fld("mdef", "DÉF. Mag.", cur.mdef) + fld("brk", "BREAK", cur.brk) + fld("regen", "REGEN", cur.regen) + "</div>" +
      '<div class="f"><label for="a-trait">Compétence spéciale (trait)</label><textarea id="a-trait">' + esc(cur.traitFr || "") + "</textarea></div>" +
      '<div class="f"><label for="a-note">Note sur le type (info-bulle)</label><input id="a-note" value="' + esc(cur.typeNote || "") + '"></div>' +
      '<div class="f"><label>Compétences (nom + puissance)</label><div class="skills" id="skills"></div>' +
      '<button type="button" class="btn" id="addskill" style="justify-self:start">+ Ajouter une compétence</button></div>' +
      skillIconBlock(cur) +
      '<div class="actions"><button type="submit" class="btn primary">Enregistrer la fiche</button>' +
      '<button type="button" class="btn danger" id="delani">Supprimer</button>' +
      '<span class="rank">Enregistrer met à jour le brouillon local ; « Publier » rend les changements visibles par tous.</span></div></form></div></div>';
    return h;
  }
  /* icônes du trait et des compétences, directement sous la fiche de l'Aniimo */
  function skillIconBlock(a) {
    var trName = a.traitNameFr || a.traitName || a.trait;
    var h = '<div class="f"><label>Icônes du trait et des compétences</label>' +
      '<span class="rank" style="margin-bottom:6px">Une icône vaut pour toute la lignée d\'évolution : ' +
      "celle d'une compétence d'Emberpup sert aussi à Flameruff et Scorchhowl. " +
      "L'image est ramenée à 64 px et rangée dans la page.</span>" +
      '<div class="icolist">' +
      '<div class="icoedit"><div class="skmain">' + traitIcon(a.name, trName) +
      '<div class="skname"><b>' + esc(trName) + '</b><span class="rank">Trait</span></div></div>' +
      '<div class="icobtns"><button type="button" class="btn sm" data-ico="@trait">Changer</button>' +
      ((S.traitIcons || {})[a.name] ? '<button type="button" class="btn sm danger" data-icodel="@trait">Retirer</button>' : "") +
      "</div></div>";
    var list = a.sk2 || [];
    if (!list.length) h += '<p class="rank">Aucune compétence détaillée pour cet Aniimo.</p>';
    list.forEach(function (s) {
      var own = (S.skillIcons || {})[skKey(a.name, s.n)];
      h += '<div class="icoedit"><div class="skmain">' + skIcon(s.t, skKey(a.name, s.n), s.n) +
        '<div class="skname"><b>' + esc(s.nf || s.n) + "</b>" +
        (s.e && S.elements && S.elements[s.e] ? elemChip(s.e) : "") +
        (s.t ? '<span class="chip sm" style="background:' + (TYPE_COLOR[s.t] || "#888") + '">' + esc(s.t) + "</span>" : "") +
        (!own && (S.skillIconsByName || {})[s.n] ? '<span class="rank">héritée</span>' : "") +
        "</div></div>" +
        '<div class="icobtns"><button type="button" class="btn sm" data-ico="' + esc(s.n) + '">Changer</button>' +
        (own ? '<button type="button" class="btn sm danger" data-icodel="' + esc(s.n) + '">Retirer</button>' : "") +
        "</div></div>";
    });
    return h + "</div></div>";
  }

  function fld(id, label, val) {
    return '<div class="f"><label for="a-' + id + '">' + esc(label) + '</label><input id="a-' + id + '" value="' + esc(val) + '"></div>';
  }

  function adminSpecs() {
    var h = '<div class="card"><h3>Spécialités du Foyer</h3>' +
      "<p>Une spécialité par élément. Elle est attribuée automatiquement : un Aniimo apporte celle de son ou ses éléments, " +
      "il n'y a donc rien à cocher fiche par fiche. La description décrit les installations ; " +
      "l'explication est un champ libre qui s'affiche sous la description dans la fiche Métiers.</p>" +
      '<div class="specedit" id="spectable">';
    (S.specs || []).forEach(function (sp, i) {
      var n = S.aniimos.filter(function (a) { return specsOf(a).indexOf(sp.name) >= 0; }).length;
      h += '<div class="speceditrow" data-spec="' + i + '">' +
        '<div class="spechead"><span class="specbadge" style="background:' + sp.color + '">' +
        (sp.img ? '<img src="' + sp.img + '" alt="" id="spimg' + i + '">' : "") + "</span>" +
        "<div><b>" + esc(sp.name) + '</b><div class="rank">' + n + " Aniimo</div></div>" +
        '<button type="button" class="btn sm" data-spicon="' + i + '">Changer l\u2019icône</button></div>' +
        '<label class="f"><span>Description</span>' +
        '<input value="' + esc(sp.desc || "") + '" data-k="desc" placeholder="Installations liées à cet élément"></label>' +
        '<label class="f"><span>Explication (libre)</span>' +
        '<textarea rows="2" data-k="note" placeholder="À toi de remplir…">' + esc(sp.note || "") + "</textarea></label>" +
        "</div>";
    });
    h += '</div><div class="actions" style="margin-top:12px">' +
      '<button class="btn primary" id="savespecs">Enregistrer les spécialités</button></div></div>';
    return h;
  }

  function adminJobs() {
    var h = '<div class="card"><h3>Métiers Aniimo</h3><div class="tablewrap"><table class="tight" id="jobtable"><thead><tr>' +
      "<th>Icône</th><th>Nom</th><th>Rang</th><th>Niv. max</th><th>Rendement</th><th>Couleur</th><th>Description</th><th></th></tr></thead><tbody>";
    S.jobs.forEach(function (j, i) {
      h += "<tr data-job='" + i + "'>" +
        '<td><input value="' + esc(j.icon) + '" data-k="icon" style="width:44px"></td>' +
        '<td><input value="' + esc(j.name) + '" data-k="name" style="width:100px"></td>' +
        '<td><input type="number" value="' + j.rank + '" data-k="rank" style="width:56px"></td>' +
        '<td><input type="number" value="' + j.max + '" data-k="max" style="width:56px"></td>' +
        '<td><input type="number" value="' + j.rate + '" data-k="rate" style="width:66px"></td>' +
        '<td><input type="color" value="' + esc(j.color) + '" data-k="color"></td>' +
        '<td><input value="' + esc(j.desc) + '" data-k="desc" style="min-width:240px"></td>' +
        '<td><button type="button" class="btn danger" data-jbdel="' + i + '">Supprimer</button></td></tr>';
    });
    h += '</tbody></table></div><div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="savejobs">Enregistrer les métiers</button>' +
      '<button class="btn" id="addjob">+ Nouveau métier</button>' +
      '<span class="rank">Supprimer un métier le retire aussi de tous les Aniimo qui le portaient.</span></div></div>';
    return h;
  }

  function adminBosses() {
    var q = (view.q || "").toLowerCase();
    var all = (S.bosses || []).map(function (b, i) { return { b: b, i: i }; });
    var rows = all.filter(function (r) {
      if (!q) return true;
      var t = bossTypeOf(r.b.type);
      return (r.b.name + " " + r.b.elem + " " + (t ? t.name : "") + " " + (r.b.note || ""))
        .toLowerCase().indexOf(q) >= 0;
    });
    var h = '<div class="card"><h3>Boss</h3>' +
      "<p>Le jeu ne publie pas de liste officielle des boss : la liste de départ couvre les trois types connus pour chaque élément. Renomme-les avec les vrais noms au fur et à mesure, ou ajoute les tiens.</p>" +
      '<div class="toolbar"><div class="field" style="flex:1"><label for="q">Chercher un boss</label>' +
      '<input id="q" type="search" placeholder="nom, élément, type, note…" value="' + esc(view.q || "") + '"></div>' +
      '<button class="btn" id="reset">Réinitialiser</button>' +
      '<span class="rank">' + rows.length + " sur " + all.length + "</span></div>" +
      '<div class="tablewrap"><table class="tight" id="bosstable"><thead><tr><th>Nom</th><th>Type</th><th>Élément</th><th>Note</th><th></th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var b = r.b, i = r.i;
      h += "<tr data-boss='" + i + "'>" +
        '<td><input value="' + esc(b.name) + '" data-k="name" style="min-width:150px"></td>' +
        '<td><select data-k="type">' + (S.bossTypes || []).map(function (t) {
          return '<option value="' + t.key + '"' + (t.key === b.type ? " selected" : "") + ">" + esc(t.name) + "</option>";
        }).join("") + "</select></td>" +
        '<td><select data-k="elem">' + ELEM_ORDER.map(function (e) {
          return '<option value="' + e + '"' + (e === b.elem ? " selected" : "") + ">" + e + "</option>";
        }).join("") + "</select></td>" +
        '<td><input value="' + esc(b.note || "") + '" data-k="note" style="min-width:220px" placeholder="mécanique, phase, conseil…"></td>' +
        '<td><button type="button" class="btn danger" data-bodel="' + i + '">Supprimer</button></td></tr>';
    });
    if (!rows.length) h += '<tr><td colspan="5" class="rank">Aucun boss ne correspond à cette recherche.</td></tr>';
    h += '</tbody></table></div><div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="savebosses">Enregistrer les boss</button>' +
      '<button class="btn" id="addboss">+ Nouveau boss</button>' +
      '<span class="rank">Le nouveau boss apparaît en haut du tableau : renseigne son nom, son type et son élément, puis enregistre.</span></div></div>';

    /* --- équipes élémentaires --- */
    h += '<div class="card" style="margin-top:14px"><h3>Équipes conseillées par élément</h3>' +
      "<p>C'est ce que l'onglet Team affiche sous « Contre un Boss ». Laisse les quatre places vides pour garder l'équipe calculée automatiquement ; dès qu'un membre est choisi, c'est ta composition qui s'affiche.</p>" +
      '<div class="etadmin">';
    elemTeamOrder().forEach(function (e) {
      var saved = elemTeams()[e] || { members: ["", "", "", ""], note: "" };
      var mem = (saved.members || []).slice();
      while (mem.length < 4) mem.push("");
      var alt = (saved.alts || []).map(altName);
      while (alt.length < 4) alt.push("");
      var t = elemTeamOf(e);
      h += '<div class="etarow" data-elem="' + esc(e) + '">' +
        '<div class="etahead">' + elemChip(e) +
        '<span class="rank">' + (t.auto ? "équipe calculée" : "équipe imposée") + "</span>" +
        '<span style="flex:1"></span>' +
        '<button type="button" class="btn sm" data-etauto="' + esc(e) + '">Reprendre le calcul</button>' +
        '<button type="button" class="btn sm danger" data-etclear="' + esc(e) + '">Vider</button></div>' +
        '<div class="row4 pickrow">' + mem.map(function (v, i) {
          return '<div class="f"><label>Place ' + (i + 1) + "</label>" +
            aniPicker("bt" + e + ":" + i, v, "— auto —") + "</div>";
        }).join("") + "</div>" +
        '<div class="row4 pickrow">' + alt.map(function (v, i) {
          return '<div class="f"><label>Remplaçant ' + (i + 1) + "</label>" +
            aniPicker("ba" + e + ":" + i, v, "— aucun —") + "</div>";
        }).join("") + "</div>" +
        '<div class="row4">' + alt.map(function (v, i) {
          return '<div class="f"><label>Pourquoi ce remplaçant ' + (i + 1) + "</label>" +
            '<input data-etaltd="' + esc(e) + ":" + i + '" value="' +
            esc(((saved.alts || [])[i] || {}).d || "") +
            '" placeholder="ce qu\'il apporte à la place du titulaire"></div>';
        }).join("") + "</div>" +
        '<div class="f"><label>Note affichée sous l\'équipe</label>' +
        '<input data-etnote="' + esc(e) + '" value="' + esc(saved.note || "") +
        '" placeholder="ex. sortir le soigneur avant la phase 2"></div></div>';
    });
    h += '</div><div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="saveetteams">Enregistrer les équipes</button></div></div>';
    return h;
  }

  /* --- admin : icônes de compétences ------------------------------------ */
  function adminSkillIcons() {
    var list = S.aniimos.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (view.q) {
      var q = view.q.toLowerCase();
      list = list.filter(function (a) { return a.name.toLowerCase().indexOf(q) >= 0; });
    }
    var pick = view.pick && findAni(view.pick) ? view.pick : (list[0] || {}).name;
    var a = findAni(pick);
    var done = Object.keys(S.skillIcons || {}).length + Object.keys(S.traitIcons || {}).length;

    var h = '<p class="note">Une icône attribuée à une compétence vaut pour toute la lignée d\'évolution : ' +
      'celle de « Fire Kick » sur Emberpup sert aussi à Flameruff et Scorchhowl. ' +
      done + ' icône(s) attribuée(s).</p>' +
      '<div class="adminwrap"><div><div class="field" style="margin-bottom:8px"><label for="q">Filtrer</label>' +
      '<input id="q" type="search" placeholder="nom…" value="' + esc(view.q || "") + '"></div><div class="picker">' +
      list.map(function (x) {
        return '<button data-pick="' + esc(x.name) + '"' + (x.name === pick ? ' aria-current="true"' : "") + ">" +
          icon(x, 22) + "<span>" + esc(x.name) + "</span></button>";
      }).join("") + '</div></div><div class="card">';

    if (!a) return h + "</div></div>";
    var trName = a.traitNameFr || a.traitName || a.trait;
    h += '<h3 class="sec">' + esc(a.name) + "</h3>" +
      '<div class="icoedit"><div class="skmain">' + traitIcon(a.name, trName) +
      '<div class="skname"><b>' + esc(trName) + '</b><span class="rank">Trait</span></div></div>' +
      '<div class="icobtns"><button class="btn sm" data-ico="@trait">Changer</button>' +
      ((S.traitIcons || {})[a.name] ? '<button class="btn sm danger" data-icodel="@trait">Retirer</button>' : "") +
      "</div></div>";
    (a.sk2 || []).forEach(function (s) {
      var own = (S.skillIcons || {})[skKey(a.name, s.n)];
      h += '<div class="icoedit"><div class="skmain">' + skIcon(s.t, skKey(a.name, s.n), s.n) +
        '<div class="skname"><b>' + esc(s.nf || s.n) + "</b>" +
        (s.e && S.elements && S.elements[s.e] ? elemChip(s.e) : "") +
        (s.t ? '<span class="chip sm" style="background:' + (TYPE_COLOR[s.t] || "#888") + '">' + esc(s.t) + "</span>" : "") +
        (!own && (S.skillIconsByName || {})[s.n] ? '<span class="rank">héritée</span>' : "") +
        "</div></div>" +
        '<div class="icobtns"><button class="btn sm" data-ico="' + esc(s.n) + '">Changer</button>' +
        (own ? '<button class="btn sm danger" data-icodel="' + esc(s.n) + '">Retirer</button>' : "") +
        "</div></div>";
    });
    return h + "</div></div>";
  }

  function bindSkillIcons() {
    var a = findAni(view.pick); if (!a) return;
    document.querySelectorAll("[data-ico]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.ico;
        readImage(function (uri) {
          if (k === "@trait") {
            S.traitIcons = S.traitIcons || {};
            S.traitIcons[a.name] = uri;
            S.traitIconsByName = S.traitIconsByName || {};
            S.traitIconsByName[a.traitName || a.trait] = uri;
          } else {
            S.skillIcons = S.skillIcons || {};
            S.skillIcons[skKey(a.name, k)] = uri;
            S.skillIconsByName = S.skillIconsByName || {};
            S.skillIconsByName[k] = uri;
          }
          persist("Icône enregistrée"); render();
        }, 64);
      };
    });
    document.querySelectorAll("[data-icodel]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.icodel;
        if (k === "@trait") { delete (S.traitIcons || {})[a.name]; }
        else { delete (S.skillIcons || {})[skKey(a.name, k)]; }
        persist("Icône retirée"); render();
      };
    });
  }



  /* ---------------- admin : Abilités ---------------- */
  function adminAbil() {
    var groups = S.abilities || [];
    var h = "";
    groups.forEach(function (g, gi) {
      h += '<div class="card"' + (gi ? ' style="margin-top:14px"' : "") + ' data-abg="' + gi + '">' +
        "<h3>" + esc(g.label || "Onglet") + "</h3>" +
        '<div class="row">' +
        '<div class="f"><label>Nom de l\'étiquette</label><input data-ag="label" value="' + esc(g.label || "") + '"></div>' +
        '<div class="f" style="flex:2"><label>Titre affiché</label><input data-ag="title" value="' + esc(g.title || "") + '"></div></div>' +
        '<div class="f"><label>Texte d\'introduction</label><textarea data-ag="intro" rows="2">' + esc(g.intro || "") + "</textarea></div>" +
        '<div class="f"><label>Note en bas de page</label><textarea data-ag="note" rows="2">' + esc(g.note || "") + "</textarea></div>" +
        '<div class="tablewrap"><table class="tight"><thead><tr><th>Lettre</th><th>Nom</th><th>Nom anglais</th>' +
        "<th>Couleur</th><th>Installation</th><th>Description</th><th></th></tr></thead><tbody>";
      (g.items || []).forEach(function (it, ii) {
        h += "<tr data-abi='" + gi + ":" + ii + "'>" +
          '<td><input data-ai="l" value="' + esc(it.l || "") + '" style="width:46px;text-align:center"></td>' +
          '<td><input data-ai="name" value="' + esc(it.name || "") + '" style="min-width:120px"></td>' +
          '<td><input data-ai="en" value="' + esc(it.en || "") + '" style="min-width:110px"></td>' +
          '<td><input data-ai="color" type="color" value="' + esc(it.color || "#888888") + '" style="width:48px;padding:2px"></td>' +
          '<td><input data-ai="fac" value="' + esc(it.fac || "") + '" style="min-width:150px"></td>' +
          '<td><textarea data-ai="desc" rows="2" style="min-width:260px">' + esc(it.desc || "") + "</textarea></td>" +
          '<td><button type="button" class="btn danger" data-abdel="' + gi + ":" + ii + '">Supprimer</button></td></tr>';
      });
      if (!(g.items || []).length) h += '<tr><td colspan="7" class="rank">Aucune entrée — ajoute-en une ci-dessous.</td></tr>';
      h += '</tbody></table></div><div class="actions" style="margin-top:10px">' +
        '<button class="btn" type="button" data-abadd="' + gi + '">+ Nouvelle entrée</button></div></div>';
    });
    h += '<div class="actions" style="margin-top:12px">' +
      '<button class="btn primary" id="saveabil">Enregistrer les Abilités</button>' +
      '<button class="btn" id="addabg">+ Nouvel onglet</button></div>';
    return h;
  }

  function bindAdminAbil() {
    on("saveabil", "onclick", function () {
      document.querySelectorAll("[data-abg]").forEach(function (card) {
        var g = (S.abilities || [])[+card.dataset.abg];
        if (!g) return;
        card.querySelectorAll("[data-ag]").forEach(function (el) { g[el.dataset.ag] = el.value.trim(); });
        card.querySelectorAll("tr[data-abi]").forEach(function (tr) {
          var it = (g.items || [])[+tr.dataset.abi.split(":")[1]];
          if (!it) return;
          tr.querySelectorAll("[data-ai]").forEach(function (el) { it[el.dataset.ai] = el.value.trim(); });
        });
      });
      persist("Abilités enregistrées"); render();
    });
    document.querySelectorAll("[data-abadd]").forEach(function (b) {
      b.onclick = function () {
        var g = (S.abilities || [])[+b.dataset.abadd]; if (!g) return;
        g.items = g.items || [];
        g.items.push({ l: "?", name: "Nouvelle entrée", en: "", color: "#7A7F8C", fac: "", desc: "", note: "" });
        persist("Entrée ajoutée"); render();
      };
    });
    document.querySelectorAll("[data-abdel]").forEach(function (b) {
      b.onclick = function () {
        var p2 = b.dataset.abdel.split(":"), g = (S.abilities || [])[+p2[0]];
        if (!g || !confirm("Supprimer cette entrée ?")) return;
        g.items.splice(+p2[1], 1);
        persist("Entrée supprimée"); render();
      };
    });
    on("addabg", "onclick", function () {
      S.abilities = S.abilities || [];
      S.abilities.push({ key: "onglet" + S.abilities.length, label: "Nouvel onglet",
                         title: "", intro: "", note: "", items: [] });
      persist("Onglet ajouté"); render();
    });
  }


  /* ---------------- admin : votes de la communauté ---------------- */
  function adminVotes() {
    var T = tally();
    var ranked = allScores().filter(function (r) { return isFinal(r.a); });
    var bestMap = groupBestOf(ranked);
    var rows = Object.keys(T).filter(function (n) {
      var t = tallyOf(n); return t.up || t.down;
    }).sort(function (x, y) {
      var a = tallyOf(x), b = tallyOf(y);
      return (b.up + b.down) - (a.up + a.down);
    });

    var h = '<div class="card"><h3>Votes de la communauté <span class="betatag">BETA</span></h3>' +
      "<p>Les visiteurs proposent de monter ou descendre un Aniimo d'un palier, puis cliquent sur « Enregistrer mes votes » : " +
      "ça arrive ici tout seul. Rien ne bouge dans la Tiers List tant que tu n'as pas appliqué une proposition : " +
      "tu gardes la main sur chaque changement. Le champ ci-dessous ne sert plus qu'en secours, pour ajouter " +
      "à la main un avis reçu autrement (Discord, oralement…).</p>" +
      '<div class="row"><div class="f" style="flex:2"><label for="vpaste">Bulletin ou avis reçu</label>' +
      '<input id="vpaste" type="text" placeholder="colle ici le code copié par le visiteur"></div>' +
      '<div class="f"><label for="vw">Poids de ce bulletin</label>' +
      '<input id="vw" type="number" value="1" min="1" max="50" style="width:90px"></div></div>' +
      '<div class="actions" style="margin-top:8px">' +
      '<button class="btn primary" id="vadd">Ajouter au comptage</button>' +
      '<label class="f check" style="margin-left:6px"><input type="checkbox" id="voteon"' +
      (S.voteOn ? " checked" : "") + '> <span>Ouvrir le vote sur le site</span></label>' +
      '<button class="btn danger" id="vreset">Remettre les compteurs à zéro</button></div>';

    if (!rows.length) {
      h += '<p class="note">Aucun vote pour le moment.</p></div>';
      return h;
    }
    h += '<div class="tablewrap" style="margin-top:12px"><table class="tight"><thead><tr>' +
      "<th></th><th>Aniimo</th><th>Palier actuel</th><th>▲ Monter</th><th>▼ Descendre</th>" +
      "<th>Proposition</th><th></th></tr></thead><tbody>";
    rows.forEach(function (n) {
      var a = findAni(n); if (!a) return;
      var t = tallyOf(n), sc = null;
      ranked.forEach(function (r) { if (r.a.name === n) sc = r; });
      var band = tFix()[n] ? bandByKey(tFix()[n]) : (sc ? tierOf(sc.s, bestMap[grpOf(sc.a.role).key] || 0) : null);
      var i = band ? TIERS.map(function (x) { return x.k; }).indexOf(band.k) : -1;
      var dir = t.up === t.down ? "" : (t.up > t.down ? "up" : "down");
      var target = i < 0 || !dir ? null
        : TIERS[Math.max(0, Math.min(TIERS.length - 1, i + (dir === "up" ? -1 : 1)))];
      h += "<tr>" + "<td>" + icon(a, 28) + "</td><td><b>" + esc(n) + "</b></td>" +
        "<td>" + (band ? '<span class="tchip" style="background:' + band.color + '">' + band.k + "</span>" : "—") + "</td>" +
        '<td class="num">' + t.up + '</td><td class="num">' + t.down + "</td>" +
        "<td>" + (target && target.k !== (band || {}).k
          ? '<span class="tchip" style="background:' + target.color + '">' + target.k + "</span>"
          : '<span class="rank">égalité, rien à trancher</span>') + "</td>" +
        "<td>" + (target && target.k !== (band || {}).k
          ? '<button type="button" class="btn sm primary" data-vok="' + esc(n) + ':' + target.k + '">Appliquer</button> '
          : "") +
        '<button type="button" class="btn sm" data-vno="' + esc(n) + '">Rejeter</button></td></tr>';
    });
    h += "</tbody></table></div></div>";
    return h;
  }

  function bindAdminVotes() {
    on("vadd", "onclick", function () {
      var el = document.getElementById("vpaste"), w = +(document.getElementById("vw") || {}).value || 1;
      var code = el ? el.value.trim() : "";
      if (!code) return;
      var list, d;
      try { d = tDec(code); list = d && d.v; } catch (e) { d = null; }
      if (!list || !list.length) { toast("Ce bulletin est illisible."); return; }
      /* un avis porte sur une liste de joueur ; un bulletin porte sur le classement officiel */
      if (d.l) {
        var l = tListOf(d.l);
        if (!l) { toast("Cette liste n'existe pas sur ce navigateur."); return; }
        l.votes = l.votes || {};
        var m = 0;
        list.forEach(function (item) {
          var k = item.charAt(0) === "+" ? "ok" : "no", nm = item.slice(1);
          if (!findAni(nm)) return;
          l.votes[nm] = l.votes[nm] || { ok: 0, no: 0 };
          l.votes[nm][k] += w; m++;
        });
        el.value = "";
        persist(m + " avis ajouté" + (m > 1 ? "s" : "") + " à « " + (l.title || "la liste") + " »");
        render(); return;
      }
      var T = tally(), n = 0;
      list.forEach(function (item) {
        var dir = item.charAt(0) === "+" ? "up" : "down", name = item.slice(1);
        if (!findAni(name)) return;
        T[name] = T[name] || { up: 0, down: 0 };
        T[name][dir] += w; n++;
      });
      el.value = "";
      persist(n + " vote" + (n > 1 ? "s" : "") + " ajouté" + (n > 1 ? "s" : "")); render();
    });
    on("voteon", "onchange", function () {
      S.voteOn = this.checked;
      persist(this.checked ? "Vote ouvert au public" : "Vote fermé"); render();
    });
    on("vreset", "onclick", function () {
      if (!confirm("Remettre tous les compteurs de vote à zéro ?")) return;
      S.tierVotes = {}; persist("Compteurs remis à zéro"); render();
    });
    document.querySelectorAll("[data-vok]").forEach(function (b) {
      b.onclick = function () {
        var p2 = b.dataset.vok.split(":"), n = p2[0], k = p2[1];
        tFix()[n] = k;
        delete tally()[n];
        persist(n + " placé en " + k); render();
        apiPost(TIER_API, { action: "clear-official-vote", name: n, adminPass: adminPass() }).catch(function () {});
      };
    });
    document.querySelectorAll("[data-vno]").forEach(function (b) {
      b.onclick = function () {
        var n = b.dataset.vno;
        delete tally()[n];
        persist("Proposition rejetée"); render();
        apiPost(TIER_API, { action: "clear-official-vote", name: n, adminPass: adminPass() }).catch(function () {});
      };
    });
  }

  /* ---------------- admin : Tiers List ---------------- */
  function adminTiers() {
    var ranked = allScores().filter(function (r) { return isFinal(r.a); });
    var bestMap = groupBestOf(ranked);
    var q = (view.q || "").toLowerCase();
    var rows = ranked.filter(function (r) { return !q || r.a.name.toLowerCase().indexOf(q) >= 0; });
    var fixed = Object.keys(tFix()).length;

    var h = '<div class="card"><h3>Corriger la Tiers List officielle</h3>' +
      "<p>Le palier est calculé à partir des statistiques et du kit. Impose-en un autre quand ton avis de joueur diffère du calcul, et remplace au besoin la phrase affichée sous la vignette. Les cases laissées sur « auto » suivent le calcul.</p>" +
      '<div class="toolbar"><div class="field"><label for="q">Chercher</label>' +
      '<input id="q" type="search" placeholder="nom…" value="' + esc(view.q || "") + '"></div>' +
      '<span class="rank">' + fixed + " palier" + (fixed > 1 ? "s" : "") + " imposé" + (fixed > 1 ? "s" : "") + "</span></div>" +
      '<div class="tablewrap"><table class="tight" id="tiertable"><thead><tr>' +
      "<th></th><th>Aniimo</th><th>Rôle</th><th>Colonne</th><th>Calculé</th><th>Palier imposé</th>" +
      "<th>Phrase affichée</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      var a = r.a, auto = tierOf(r.s, bestMap[grpOf(a.role).key] || 0), cur = tFix()[a.name] || "";
      h += "<tr data-tani='" + esc(a.name) + "'>" +
        "<td>" + icon(a, 28) + "</td>" +
        "<td><b>" + esc(a.name) + "</b><br><span class='rank'>score " + r.s + "</span></td>" +
        "<td>" + roleChip(a.role) + "</td>" +
        '<td style="color:var(--muted)">' + esc(grpOf(a.role).label) + "</td>" +
        '<td><span class="tchip" style="background:' + auto.color + '">' + auto.k + "</span></td>" +
        '<td><select data-tk="fix"><option value="">— auto —</option>' +
        TIERS.map(function (t) {
          return '<option value="' + t.k + '"' + (t.k === cur ? " selected" : "") + ">" + t.k + "</option>";
        }).join("") + "</select></td>" +
        '<td><input data-tk="why" placeholder="' + esc(kitLabel(a)) + '" value="' +
        esc(tWhy()[a.name] || "") + '"></td></tr>';
    });
    h += '</tbody></table></div><div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="savetiers">Enregistrer</button>' +
      '<button class="btn" id="resettiers">Tout remettre en auto</button></div></div>';

    var LS = tAll();
    h += '<div class="card" style="margin-top:14px"><h3>Les Tiers du Foyer</h3>' +
      "<p>Dès qu'un joueur clique sur « Enregistrer » sur sa liste, elle est sauvegardée sur le site et " +
      "<b>tout le monde la voit</b> aussitôt, sans rien faire de ton côté. Tu peux quand même en ajouter une " +
      "toi-même à partir d'un lien reçu, ou en retirer une du site.</p>" +
      '<div class="toolbar"><div class="field" style="flex:1"><label for="tadd">Lien ou code reçu</label>' +
      '<input id="tadd" type="text" placeholder="https://…/#liste=… ou le code seul"></div>' +
      '<button class="btn primary" id="taddgo">Ajouter au site</button></div>';
    if (!LS.length) h += '<p class="note">Aucune liste pour le moment.</p>';
    else {
      h += '<div class="tablewrap"><table class="tight"><thead><tr><th>Liste</th><th>Pseudo</th>' +
        "<th>Placés</th><th>Visibilité</th><th></th></tr></thead><tbody>";
      LS.forEach(function (l) {
        var live = LIVE.lists && LIVE.lists.some(function (x) { return x.id === l.id; });
        h += "<tr><td><b>" + esc(l.title || "Liste") + "</b></td><td>" + esc(l.pseudo || "anonyme") + "</td>" +
          "<td>" + Object.keys(l.tiers || {}).length + "</td>" +
          "<td>" + (live ? '<span class="tfbadge pub">en ligne, visible par tous</span>'
            : '<span class="tfbadge">pas encore enregistrée en ligne</span>') + "</td>" +
          '<td><button type="button" class="btn" data-lgo="' + esc(l.id) + '">Voir</button> ' +
          '<button type="button" class="btn" data-lcopy="' + esc(l.id) + '">Copier le lien</button> ' +
          '<button type="button" class="btn danger" data-ldel="' + esc(l.id) + '">Supprimer</button></td></tr>';
      });
      h += "</tbody></table></div>";
    }
    if (LIVE.failed) h += '<p class="note">La sauvegarde en ligne ne répond pas pour le moment (fonctions Netlify pas encore déployées, ou site hors ligne) : ce tableau montre les listes connues de ce navigateur.</p>';
    return h + "</div>";
  }

  function bindAdminTiers() {
    on("savetiers", "onclick", function () {
      var fx = tFix(), wy = tWhy();
      document.querySelectorAll("#tiertable tbody tr").forEach(function (tr) {
        var n = tr.dataset.tani;
        var v = tr.querySelector('[data-tk="fix"]').value;
        if (v) fx[n] = v; else delete fx[n];
        var w = tr.querySelector('[data-tk="why"]').value.trim();
        if (w) wy[n] = w; else delete wy[n];
      });
      persist("Tiers list enregistrée"); render();
    });
    on("resettiers", "onclick", function () {
      if (!confirm("Remettre tous les paliers sur le calcul automatique ?")) return;
      S.tierFix = {}; S.tierWhy = {};
      persist("Paliers remis en auto"); render();
    });
    document.querySelectorAll("[data-lgo]").forEach(function (b) {
      b.onclick = function () { view.tab = "tiers"; view.tier = "L:" + b.dataset.lgo; render(); window.scrollTo(0, 0); };
    });
    document.querySelectorAll("[data-lcopy]").forEach(function (b) {
      b.onclick = function () {
        var l = tListOf(b.dataset.lcopy); if (!l) return;
        copyText(tShareUrl(l)); toast("Lien copié.");
      };
    });
    document.querySelectorAll("[data-ldel]").forEach(function (b) {
      b.onclick = function () {
        var l = tListOf(b.dataset.ldel); if (!l) return;
        if (!confirm("Supprimer « " + (l.title || "cette liste") + " » ?")) return;
        S.tierLists = tLists().filter(function (x) { return x.id !== l.id; });
        S.tierPublic = tPublic().filter(function (x) { return x.id !== l.id; });
        persist("Liste supprimée"); render();
        apiPost(TIER_API, { action: "delete-list", id: l.id, editToken: l._tok || "", adminPass: adminPass() })
          .then(function () { fetchLive(); }).catch(function () {});
      };
    });
    on("taddgo", "onclick", function () {
      var el = document.getElementById("tadd"), t = el ? el.value.trim() : "";
      if (!t) return;
      var d;
      try { d = tDec(t); } catch (e) { toast("Ce code ne correspond à aucune Tiers List."); return; }
      if (!d || !d.x) { toast("Ce code ne correspond à aucune Tiers List."); return; }
      var newId = newListId();
      apiPost(TIER_API, { action: "save-list", list: { id: newId, pseudo: d.p || "anonyme", title: d.t || "Liste partagée", tiers: d.x } })
        .then(function (res) {
          if (res.d && res.d.ok) { toast("Liste ajoutée et visible par tous."); fetchLive(); }
          else toast("Impossible d'enregistrer cette liste en ligne pour le moment.");
        }).catch(function () { toast("Connexion impossible : réessaie dans un instant."); });
    });
  }

  /* la table des effets suit désormais les rubriques réellement en place (tabs()),
     et non plus l'instantané figé au moment du build : toute nouvelle rubrique —
     y compris une page personnalisée — apparaît ici automatiquement. */
  var FX_WHAT = {
    roster: "les lignes du tableau", power: "les cartes de compétences", abil: "les cartes d'abilité",
    jobs: "les cartes de métier et de spécialité", team: "les cartes de l'équipe", tier: "les lignes du classement",
    wip: "l'illustration d'attente", home: "le journal des mises à jour", custom: "les blocs de la page",
    admin: "aucun effet"
  };
  var INFO_FX_WHAT = {
    raretes: "les cartes de score potentiel", aniipods: "les cartes d'objets de capture",
    elements: "les cartes de la liste des Aniimo", formes: "les blocs météo et la carte des Nutures",
    oeufs: "les cartes d'œufs", braquage: "les cartes de rangs du braquage"
  };
  function effectPages() {
    var base = tabs().map(function (t) { return { key: t.id, name: t.label, what: FX_WHAT[t.kind] || "le contenu de la page" }; });
    var infoRows = INFO_TAGS.map(function (tg) {
      return { key: "informations:" + tg.key, name: "Informations > " + tg.label, what: INFO_FX_WHAT[tg.key] || "le contenu de la rubrique" };
    });
    return base.concat(infoRows);
  }
  function adminEffects() {
    var FX = S.effects || [], SP = S.speeds || [], PG = effectPages();
    var h = '<div class="card"><h3>Effet d\'arrivée par catégorie</h3>' +
      "<p>Chaque catégorie du site peut avoir son propre effet d'apparition. L'effet se joue quand tu arrives sur la catégorie, pas à chaque filtre ou changement de tri.</p>" +
      '<div class="tablewrap"><table class="tight" id="fxtable"><thead><tr>' +
      "<th>Catégorie</th><th>Ce qui s'anime</th><th>Effet</th><th>Vitesse</th><th></th></tr></thead><tbody>";
    PG.forEach(function (p) {
      var c = fxOf(p.key);
      var locked = p.key === "admin";
      h += "<tr data-page='" + esc(p.key) + "'>" +
        "<td><b>" + esc(p.name) + "</b></td>" +
        '<td style="color:var(--muted)">' + esc(p.what) + "</td>" +
        '<td><select data-fk="fx"' + (locked ? " disabled" : "") + ">" + FX.map(function (f) {
          return '<option value="' + f.key + '"' + (f.key === c.fx ? " selected" : "") + ">" + esc(f.name) + "</option>";
        }).join("") + "</select></td>" +
        '<td><select data-fk="sp"' + (locked ? " disabled" : "") + ">" + SP.map(function (s) {
          return '<option value="' + s.key + '"' + (s.key === c.sp ? " selected" : "") + ">" + esc(s.name) + "</option>";
        }).join("") + "</select></td>" +
        "<td>" + (locked ? '<span class="rank">page de gestion</span>'
          : '<button type="button" class="btn" data-fxgo="' + esc(p.key) + '">Voir l\'effet</button>') + "</td></tr>";
    });
    h += '</tbody></table></div><div class="actions" style="margin-top:10px">' +
      '<button class="btn primary" id="savefx">Enregistrer les effets</button>' +
      '<button class="btn" id="fxnone">Tout couper</button>' +
      '<span class="rank">Les effets se désactivent automatiquement si le système du visiteur demande de réduire les animations.</span></div></div>';

    h += '<div class="card" style="margin-top:14px"><h3>Les effets disponibles</h3>' +
      '<div class="fxgrid">' + FX.map(function (f) {
        var used = PG.filter(function (p) { return fxOf(p.key).fx === f.key; }).length;
        return '<div class="fxitem"><div class="fxdemo fx fx-' + f.key + ' spd-mid">' +
          '<i class="fxi" style="--i:0"></i><i class="fxi" style="--i:1"></i><i class="fxi" style="--i:2"></i></div>' +
          "<div><b>" + esc(f.name) + '</b><p>' + esc(f.desc) + "</p>" +
          '<span class="rank">' + (used ? "utilisé sur " + used + " catégorie" + (used > 1 ? "s" : "") : "non utilisé") +
          "</span></div></div>";
      }).join("") + "</div></div>";
    return h;
  }

  /* brouillon de travail : le formulaire garde les mêmes sélecteurs illustrés
     que l'onglet Team (icône + éléments + rôle) au lieu d'un menu texte. */
  function aTeam() {
    if (!view.aTeam) {
      var t = S.team || {};
      view.aTeam = { main: t.main || "", pinned: (t.pinned || []).slice(0, 3) };
    }
    while (view.aTeam.pinned.length < 3) view.aTeam.pinned.push("");
    return view.aTeam;
  }
  function adminTeam() {
    var T = aTeam();
    return '<div class="card"><h3>Équipe par défaut</h3>' +
      "<p>L'onglet Team démarre sur cet Aniimo principal. Tu peux imposer jusqu'à trois compagnons : ils sont gardés d'office, et les places restantes sont calculées automatiquement autour d'eux.</p>" +
      '<div class="row4 pickrow">' +
      '<div class="f"><label>Aniimo principal</label>' + aniPicker("admain", T.main) + "</div>" +
      '<div class="f"><label>Compagnon gardé 1</label>' + aniPicker("adp0", T.pinned[0], "— libre —") + "</div>" +
      '<div class="f"><label>Compagnon gardé 2</label>' + aniPicker("adp1", T.pinned[1], "— libre —") + "</div>" +
      '<div class="f"><label>Compagnon gardé 3</label>' + aniPicker("adp2", T.pinned[2], "— libre —") + "</div></div>" +
      '<div class="actions" style="margin-top:10px"><button class="btn primary" id="saveteam">Enregistrer</button>' +
      '<button class="btn" id="clearteam">Vider les compagnons</button>' +
      '<span class="rank">Deux Aniimo du même rôle ne peuvent pas être gardés ensemble : seul le premier est retenu.</span></div></div>';
  }

  /* ---------------- bannière ---------------- */
  var HERO = null;
  function heroPicks() {
    if (HERO) return HERO;
    var pool = activeAniimos().filter(function (a) { return a.img; });
    var out = [];
    for (var i = 0; i < 4 && pool.length; i++) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    HERO = out;
    return out;
  }
  var SPARKS = [
    [12, 26, 9], [22, 66, 6], [31, 18, 7], [38, 74, 5], [44, 34, 10],
    [58, 22, 6], [63, 70, 8], [72, 30, 5], [79, 60, 9], [88, 22, 6], [93, 52, 7]
  ];
  function banner() {
    var p = heroPicks();
    var sp = SPARKS.map(function (s, i) {
      return '<i class="sp" style="left:' + s[0] + "%;top:" + s[1] + "%;width:" + s[2] +
        "px;height:" + s[2] + "px;animation-delay:" + (i * 0.4).toFixed(1) + 's"></i>';
    }).join("");
    function side(list, cls) {
      return '<div class="hside ' + cls + '">' + list.map(function (a, i) {
        return '<img class="hani h' + i + '" src="' + a.img + '" alt="' + esc(a.name) +
          '" title="' + esc(a.name) + '" loading="lazy">';
      }).join("") + "</div>";
    }
    /* image de bannière fournie : elle remplace la composition automatique */
    if (S.heroImg) {
      return '<header class="hero heroimg"><img src="' + S.heroImg + '" alt="Aniimo France">' +
        sp + "</header>";
    }
    return '<header class="hero">' + sp + '<span class="orbit"></span><span class="orbit o2"></span>' +
      side(p.slice(0, 2), "left") +
      '<div class="hcore"><h1 class="htitle">Aniimo</h1></div>' +
      side(p.slice(2, 4), "right") + "</header>";
  }

  /* ---------------- rendu ---------------- */

  /* ---------------- accès au panneau admin ----------------
     Verrou par phrase de passe : la page ne stocke qu'une empreinte SHA-256.
     Cela écarte les visiteurs, mais un site statique ne peut pas cacher son
     propre code : qui sait lire du JavaScript peut contourner le verrou.
     La vraie protection reste de ne pas publier de version avec l'admin. */
  var UNLOCK_KEY = "aniimo.admin";
  var adminOK = false;
  try { adminOK = sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch (e) {}
  function adminLocked() { return !!(S.meta && S.meta.adminHash) && !adminOK; }

  function sha256(txt) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) {
        return ("0" + x.toString(16)).slice(-2);
      }).join("");
    });
  }

  function viewLock() {
    return '<div class="head"><h1>Panneau admin</h1></div>' +
      '<form class="card lockcard" id="lockf"><h3>Accès réservé</h3>' +
      "<p>Ce panneau modifie les données du site. Entre la phrase de passe pour l'ouvrir.</p>" +
      '<div class="f"><label for="lockpw">Phrase de passe</label>' +
      '<input id="lockpw" type="password" autocomplete="current-password" autofocus></div>' +
      '<div class="actions" style="margin-top:10px"><button class="btn primary" type="submit">Ouvrir</button>' +
      '<span class="rank" id="lockmsg"></span></div></form>';
  }

  /* ---------------- admin : protection du contenu ----------------
     Des freins raisonnables contre la copie occasionnelle, pas une vraie
     serrure : un site envoyé au navigateur du visiteur peut toujours être
     lu, sauvegardé ou copié par quelqu'un qui sait utiliser les outils de
     développement. Ce panneau décourage, il ne verrouille pas. */
  function protect() {
    var d = { rightclick: true, select: false, dragimg: true, consoleWarn: false, blockviewsource: true }, p = S.protect || {};
    for (var k in d) if (p[k] !== undefined) d[k] = p[k];
    return d;
  }
  function adminProtect() {
    var p = protect();
    function chk(key, label) {
      return '<label class="f check"><input type="checkbox" data-pr="' + key + '"' + (p[key] ? " checked" : "") +
        "> <span></span> " + esc(label) + "</label>";
    }
    return '<div class="card"><h3>Protection du contenu</h3>' +
      "<p>Des freins simples contre la copie occasionnelle des textes et des images. Ils s'appliquent tout de suite, " +
      "sans republier — désactivés automatiquement pendant que tu es connecté au panneau, pour ne pas te gêner.</p>" +
      '<div class="protectchecks">' +
      chk("rightclick", "Bloquer le clic droit") +
      chk("blockviewsource", "Bloquer Ctrl+U (voir le code source)") +
      chk("select", "Bloquer la sélection du texte") +
      chk("dragimg", "Bloquer le glisser-déposer des images") +
      chk("consoleWarn", "Avertissement dans la console") +
      "</div>" +
      '<div class="actions" style="margin-top:10px"><button class="btn primary" id="saveprot">Enregistrer</button></div>' +
      '<p class="note"><b>À savoir.</b> Un site web ne peut jamais empêcher totalement la copie de son code, de ses ' +
      "images ou de son contenu : tout ce qui est envoyé au navigateur peut être lu, enregistré ou copié par " +
      "quelqu'un qui sait utiliser les outils de développement (F12, Ctrl+Maj+I) — aucun site, aussi protégé soit-il, " +
      "n'y échappe, et bloquer ces outils n'est pas fiable (on l'a donc volontairement laissé de côté). Ces réglages " +
      "découragent la copie au clic, au raccourci ou au glisser-déposer, rien de plus. Pour une vraie protection, " +
      "la voie qui fonctionne est légale : une mention de droits d'auteur en pied de page (déjà présente) et, en cas " +
      "de reprise abusive, une demande de retrait auprès de l'hébergeur.</p></div>";
  }
  function bindAdminProtect() {
    on("saveprot", "onclick", function () {
      S.protect = {
        rightclick: document.querySelector('[data-pr="rightclick"]').checked,
        blockviewsource: document.querySelector('[data-pr="blockviewsource"]').checked,
        select: document.querySelector('[data-pr="select"]').checked,
        dragimg: document.querySelector('[data-pr="dragimg"]').checked,
        consoleWarn: document.querySelector('[data-pr="consoleWarn"]').checked
      };
      persist("Protection enregistrée"); render();
    });
  }
  /* applique les freins en direct, sauf pendant que le panneau admin est ouvert */
  function applyProtect() {
    var p = protect(), onAdmin = view.tab === "admin";
    document.documentElement.classList.toggle("noselect", !!(p.select && !onAdmin));
    document.documentElement.classList.toggle("noimgdrag", !!(p.dragimg && !onAdmin));
    if (p.consoleWarn && !window.__aniimoWarned) {
      window.__aniimoWarned = true;
      try {
        console.log("%cArrête !", "color:#ff3b3b;font-size:42px;font-weight:900;-webkit-text-stroke:1px #000");
        console.log("%cCe site est un projet de fan (Aniimo France). Le contenu, le code et les images ne sont pas " +
          "libres de droits — merci de ne pas les recopier ailleurs sans autorisation.",
          "color:#F0A82C;font-size:14px");
      } catch (e) {}
    }
  }
  document.addEventListener("contextmenu", function (e) {
    if (protect().rightclick && view.tab !== "admin") e.preventDefault();
  });
  document.addEventListener("keydown", function (e) {
    if (!protect().blockviewsource || view.tab === "admin") return;
    var k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "u") e.preventDefault();
  });
  /* glisser-déposer d'une image (clic gauche maintenu) : la classe noimgdrag couvre Chrome/Safari,
     ce gestionnaire couvre les navigateurs qui ignorent -webkit-user-drag (Firefox notamment).
     On laisse passer les vignettes de la Tiers List ([data-drag]) : leur glisser-déposer sert à
     réordonner le classement, pas à récupérer l'image. */
  document.addEventListener("dragstart", function (e) {
    if (!protect().dragimg || view.tab === "admin") return;
    if (!e.target || e.target.tagName !== "IMG") return;
    if (e.target.closest("[data-drag]")) return;
    e.preventDefault();
  });

  function adminLockCard() {
    var set = !!(S.meta && S.meta.adminHash);
    return '<div class="card" style="margin-top:14px"><h3>Accès au panneau</h3>' +
      "<p>" + (set ? "Une phrase de passe est active : le panneau reste fermé tant qu'elle n'est pas donnée."
        : "Aucune phrase de passe : n'importe quel visiteur peut ouvrir ce panneau.") + "</p>" +
      '<div class="row"><div class="f"><label for="pw1">Nouvelle phrase de passe</label>' +
      '<input id="pw1" type="password" autocomplete="new-password" placeholder="au moins 6 caractères"></div>' +
      '<div class="f"><label for="pw2">Confirmer</label><input id="pw2" type="password" autocomplete="new-password"></div></div>' +
      '<div class="actions" style="margin-top:10px"><button class="btn primary" id="setpw">Enregistrer la phrase</button>' +
      (set ? '<button class="btn danger" id="clearpw">Retirer le verrou</button>' : "") + "</div>" +
      '<p class="note">Tant que le verrou est actif, la rubrique <b>Gestion</b> disparaît du menu : ' +
      "tu rouvres le panneau en ajoutant <code>#admin</code> à la fin de l'adresse du site.</p>" +
      '<p class="note"><b>À savoir.</b> Le site est un fichier statique : le verrou écarte les curieux, ' +
      "il ne résiste pas à quelqu'un qui sait lire le code de la page. Pour une vraie fermeture, garde une " +
      "copie du site avec le panneau pour toi et publie une version sans lui — dis-le-moi et je te la prépare.</p></div>";
  }

  function renderRail() {
    var c = {};
    activeAniimos().forEach(function (a) { c[a.role] = (c[a.role] || 0) + 1; });
    var groups = [];
    tabs().forEach(function (t) { if (!t.hidden && groups.indexOf(t.grp) < 0) groups.push(t.grp); });
    var h = '<div class="brand"><b>Aniimo France</b><span>Codex</span></div>' +
      /* enveloppe neutre sur grand écran, ruban défilant sur mobile */
      '<div class="railnav">';
    groups.forEach(function (g) {
      /* le panneau est masqué aux visiteurs : on y accède par #admin */
      if (g === "Gestion" && adminLocked() && view.tab !== "admin") return;
      h += '<div class="navgroup">' + g + "</div>";
      tabs().filter(function (t) { return t.grp === g && !t.hidden; }).forEach(function (t) {
        var dot = t.role ? '<span class="dot" style="background:' + (S.roles[t.role] || {}).color + '"></span>' : "";
        var n = t.role ? '<span class="n">' + (c[t.role] || 0) + "</span>" : "";
        var on = view.tab === t.id;
        /* la catégorie ouverte pétille quand la souris passe dessus */
        var sp = "";
        for (var k = 1; k <= 5; k++) sp += '<span class="sp sp' + k + '">' + STAR + "</span>";
        var letters = esc(t.label).split("").map(function (ch, li) {
          return '<i style="--l:' + li + '">' + (ch === " " ? "&nbsp;" : ch) + "</i>";
        }).join("");
        var lab = on
          ? '<span class="tablab"><span class="shine" data-txt="' + esc(t.label) + '">' +
            letters + "</span>" + sp + "</span>"
          : "<span>" + esc(t.label) + "</span>";
        h += '<button class="tab" data-tab="' + t.id + '"' + (on ? ' aria-current="true"' : "") + ">" +
          dot + lab + n + "</button>";
      });
    });
    h += "</div>" + discordCard() +
      '<div class="railnote">Dernière mise à jour : ' + esc(S.meta.updated) + "</div>";
    return h;
  }

  /* invitation Discord, au pied du menu */
  var DISCORD_URL = "https://discord.gg/acyn8kxvpA";
  var DISCORD_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.9A19 19 0 0 0 15.6 3.5a13 13 0 0 0-.6 1.3 17.6 17.6 0 0 0-5 0 13 13 0 0 0-.6-1.3A19 19 0 0 0 4.6 4.9 19.7 19.7 0 0 0 1.2 18a19.1 19.1 0 0 0 5.8 2.9 14.2 14.2 0 0 0 1.2-2 12.4 12.4 0 0 1-2-.9l.5-.4a13.6 13.6 0 0 0 11.6 0l.5.4a12.4 12.4 0 0 1-2 1 14 14 0 0 0 1.2 1.9 19 19 0 0 0 5.8-2.9 19.7 19.7 0 0 0-3.5-13.1ZM8.5 15.3c-1.1 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.1 1 2.1 2.3-.9 2.3-2.1 2.3Zm7 0c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.1 1 2.1 2.3-.9 2.3-2.1 2.3Z"/></svg>';
  function discordCard() {
    return '<a class="dcbtn" href="' + DISCORD_URL + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="dcico">' + DISCORD_SVG + "</span>" +
      '<span class="dctxt"><b>Rejoins Aniimo France</b><span>discord.gg — la communauté française</span></span></a>';
  }

  /* étiquettes de la page Informations : cliquer l'une d'elles affiche la note */
  var INFO_TAGS = [
    { key: "raretes", label: "Raretés" },
    { key: "formes", label: "Météo & Prismana" },
    { key: "regional", label: "Formes Régionales" },
    { key: "aniipods", label: "Aniipods" },
    { key: "elements", label: "Éléments" },
    { key: "oeufs", label: "Œufs & Éclosions" },
    { key: "braquage", label: "Braquage d'Œuf" },
  ];
  /* ================= Braquage d'Œuf : contenu détaillé de l'onglet Informations ================= */
  var BRAQUAGE = {"icons": {"rank1": "data:image/webp;base64,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", "rank2": "data:image/webp;base64,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", "rank3": "data:image/webp;base64,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", "rank4": "data:image/webp;base64,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", "rank5": "data:image/webp;base64,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", "rank6": "data:image/webp;base64,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", "rank7": "data:image/webp;base64,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", "coin": "data:image/webp;base64,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", "bonoeuf": "data:image/webp;base64,UklGRqILAABXRUJQVlA4WAoAAAAQAAAAVwAAVwAAQUxQSNYEAAABDAVt2zAJf9jdZRARE8CjDlArywlpMqAfXdKitr2QBH1/Uu2xPWvbtm3btm3btm3btm3b25X830V3z1SnenkVERNAtbata3uSEZkRlSpSCaXQCWXQAx55v3SBx+He95lLPM97vi8dRMQEIFjB32tpWP9DlAZlBcYmI6mQMQiQB8QmYaxARCACGBPKGC1Wve+165YCxBprxlEpgCCVEbZg5d2LoNI2DIu5f3Vl75S8dq/rTpgJIuNBSgxGP6FXJZ2S5O+7Cez40igfP//R1cZ13Rd5zQBsA4g+/NhVcix1fHt+WJM2i++7ymN7zD+2BqxJlcV0/69FL3ry8ikAK+kRU3i2m15Wz59OnBSwEpaMweJ4XlW8QMbkd8dPAFhJhcWSztnmqiTpy+TXhw8CVsKpLablHfrerepj8rMDegAroVmcQsc6aF317+4dgJWgLBb0ThNgU8W64rt7dAImIDG5p+hYX7Ri8u3tipBwLLZnzDGT14p6R94/CgnFSO/X6sfH5qmN9GU+0GyCwRl0HD+ZVKKSjLmJmDAMZih7TYje6PT0ZhuI3ELHROid6nloTyYIiwW7G3NKQ0UKfpkSJgRj732lojkqpWr19OSQpERqWSzGZeItRUXHi2+MiCQ0ViN3857xzSjzuIytl8UC3jelgxnNOf9of1Qvg1sZz6LqSWWkcLxpgnydLObwXifUe0y0WN5+gkwiMgaDa+g4qoinfVZWv580Z5fUx8j0f3gdD6oMVJuT4w+Hzz+aRX0tLmJMZqBKwYFiO3t+s9dcE+QkEallZMKfVcfj26h6frLzHENZQZIyBosz6FRpVNAQKjZ6frjTbP0ZJCqCmhaLOa9KNlMRFBXaqeO7283RH6HOYlrfoVOqegU6Ejrj+M5ms/ZFqLfFiXRkFbPedvOdjWbpiZCwSA2LeZxTVaUqDkOH7A+r9zacqcciYaltbObpbjWz0aNCR/X8aKOZug0SFkFNi814U8n+rqHnN1vP3GNRd0HPF7ra1dOrmip/3W+2Pov6R9idsVTRlBOUB+Wfx8wzHCFAg5vVdVTZaHp6VK9nLDBBFmHcyrF44qkHm+c1C0+SQ5AWW9ZKlX22c/B8ZKnJiwhlLfqHnbaEUpCqxXfWmqpJAjG4gnF5ekRnlWqF8vsdZugQBCq4g66diRGpklSNj5mrzyBUi0s03lRMelbqPZ3j1QtOmEWwBsuRd9k6OVA0fXL5yfII2EQH/95aKsIW7aTwtxuOuO/N9adqkZAQFVf5p9bbqMVLFplhpgWn6zQIO1v6+sN/WUpnFSrSTxtN1lZsbbEI3Xz68t1PdWuInvXl0h0CEaQwUxje6k3Sa0LKa2UMUmryzbOe8yudr9BScdDifZNKWoCo1Lnao6TzSopUUHleWjKpgeRaJt37E9KrVoLOXo8ezKQHMIXWea6IGfv2yeKHyw9GaQKi0sCmL5F3Ss+L50zXipRLvmW6435orVQ2q2/XHs2kDYhKXcv/XGtyd9WMHWiE2dIEO7xL+lr668YTZBsCTL519vPL9EpVqufts3ZJYwCipp51niB9hZa3nSiHhim55skP/orqfJn3zdUjjQMwhfaFr1aS32w6WR6NNVMa2ur+F27faZYuaTCQfOvkc846TW+ExmsLrW0Fi//PA1ZQOCCmBgAA0CAAnQEqWABYAD5JIo1EoqIhE5z9kCgEhKDLAP5BaAAyoogvo/wHI/g+esco863bQeYrzhfQ36AH9u6h70QP1m9OP2KP7d/xfRvzQD+d/hn+kHj//Y/C/ye+uPZjlCsv/03DzvE/5l/it+i5d/XeKbuTeI3oAfmL/henv/zeVb6G/9H+a+AT+Y/0z/cdjP0Rf1vZshfYoR/ipAWTuca7/R01VRoa3znXpIlMxsT+fmj2Oc6Nw73w/vdyj6gk5XVUB5h+8evVDcYHQzBdLX1eTShfjZVMsYemDjpD3ewWg8wQHA43Ly5lesHvVzIpTvb3ujM+C2Ebcty5RNsjzW0wzcCPgV/WUdbwzU1rxnUoAAD+8BOTP27aaRXmP7LxwIYY4ssOh0LI8DqhmrC1bEJAwHCp6XMbkKK+XE+HQP/EIpa0LAHhf47//xcv//k4x//xAVheh/O8/pcvopbiB1V1HxAtPqcdrxVUm037ww+YFqzvNhVdgD8XZWZL4JV+8tWELdQqAOpMgaR8oWVcCCJAHT8fv4EAqGXg6572gDg0eb8tX5oL5+Qjzgp9Tjv+cD6b5IwmOOS5KWu576mkOrocUUZ/6IY2dO3+KdE8QX2a3vzpSgAq7KqJ/89PYRqtU7E4gcn8drsKynlSnVHg9YG+O37bk5nv20arSbyUv6j7DKfuv89arNqUu7wNoRu+NX1siGX/nWifynlJCwhTa48xYzNQ5H1to3KgsK9UM3jeYbpZ/r9W7iL3svaoaOu1MmJuzxFzHpHFRPMDQRZWTjhvfEjPtHkJNcmrv0EYT4PW64S9vr0RqDuItuC39ktwRgVKktN4YuA+RZvmwZhuT7u3vgmHrDOKCtjihV0YjsbsaxwDCtIZ+tP9az0ujUJwnnCrBDtRd5HWPaGbpTkdkRXwqYU6+RsqOhc0mS7a2wH/7KMruTzDQZv7ldRlftnIFD+lrxPxKuvfTO00ecYWeV48WDdGPNi0Mygq7YPcegBuqI02MoONugJ8Cqv/5JeVXTj8ZZS7F6QxtnjFnc2cdQA2DYGLGrqje7AbQ2TjdBTBaHeY8D1Z/AHKxgv9Y/N/IgtJ99M+f4J5sN7HWA0ENrvS4yt+5Ht7gQHZD01jS7skz6PrrafOKmKroXYY/85/J3VxSLwnfUmuUXMsotBPIKO8oZnaLLceGisyyiKXYuzGTOO2fuQvAQMuiTO5/rorLnsFeK+CEpGQJiRJjS/iAM5vuSDXoyBLEDdMYKWaFhWWobRB0swBSkOU3P7qsX5uaf0MvbXkmEJOIZ+c56cmLTaueGNY5nbuPw23hU4XZwz4m44bvL3iDi2efxTe7vfw+IwmNjmUd35yleWbAVG6uyFJ9IrePLOTSaKLpGWRSrL+qgd0r4yzisnbOIFkUuQft4rFjhFvMPgpT29Q/MzaeVyZW0cGyzHe1p6zKhJl2QF/aRoMwerz2yflK3+q/xvPtX587HHiHS/04N4IJv53zegL4MaCLlwZbNqZ4Zh8+1A1K3yICj+ZWGLjM7SycO3pLOWHjsAr9oCGffBr5RoV9MAxDqLR1EK+ZslQ//KJQkfhJuONG7+oqEfJUJqmVo+Y7RV7D+KUA/y2LdvmgVJQF8HgGp/E8QC73zuy6T0MEDtoKemlH2h8lJhfaKg3U2Logqb80T7ySSjMcG13+oI+8bgxuzLdrhpxSbAhcUZ18WhL9RveQ0EKw619lUK62fM6cEikzz4cMCCJZIkDwPDo7PInK9gy3z709WqTpK3e1swZsbmW8EIoZz8Okz6prK4+7/uecBZ+BqEla6rc21n5qwxsZikLWwOxS1bdFThI542cGbTeorhU1ZfusQa3IJ/gZ/NWOiXj9c/AhRlfvK9UqnGujbjfs/QR1+/ieM/iAf393ZlsXd8yW6eyb2TxYehlZsQXyxQBD2X+6mmQH/vBvGIog+NbrXuNj4PV90NEjlkBOe19Xeo0M0naquz73z5W+aVu4wc1i3d+rUQV84TMevlwAkWR7pCsbNFiM1chDt2+O/KcNWEO6o/fBL9/zyqn50cWwW507i90LkQl4EYs53pszX9ITHtsB1FibR5FEzoiudq46n7B540NdUp7j/gsE8Yv9Cl0s173Q0wzDG+K7PAPf91ZDdwOgDfIq+Msbq+8PDYVyMjIF6hQ/8KFnH1ogk4vUCgvoxhceQj4246j4xZ+USVCoT+njCzt/E5KW30DHxqWbwdSJ0ZJ6/4ycGYH7C8GuHvfFo+tpmuKf+ggOfLLR0AAAAAAAA==", "bonsuper": "data:image/webp;base64,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"}, "ranks": [{"icon": "rank1", "name": "Chasseur d'œufs de rookie", "div": "3 DIVISIONS", "color": "#9CA3AF"}, {"icon": "rank2", "name": "Remontée de l'œuf scout", "div": "3 DIVISIONS", "color": "#2DD4BF"}, {"icon": "rank3", "name": "Élégant Pro Egg", "div": "4 DIVISIONS", "color": "#3B82F6"}, {"icon": "rank4", "name": "Chercheur d'œufs d'élite", "div": "4 DIVISIONS", "color": "#8B5CF6"}, {"icon": "rank5", "name": "Expert Egg Raider", "div": "5 DIVISIONS", "color": "#D946EF"}, {"icon": "rank6", "name": "Maître de braquage d'œuf", "div": "5 DIVISIONS", "color": "#F59E0B"}, {"icon": "rank7", "name": "Empereur d'", "div": "RANG APEX", "color": "#C89434"}], "shop": [{"icon": "coin", "name": "Pièce d'œuf de coquille", "desc": "La devise de magasin que vous gagnez à partir de runs"}, {"icon": "bonoeuf", "name": "Bon d'œuf", "desc": "Échange hebdomadaire, jusqu'à 10× par semaine"}, {"icon": "bonsuper", "name": "Bon d'achat Super Egg", "desc": "Échange hebdomadaire, jusqu'à 10× par semaine"}], "talents": {"commun": {"label": "Commun", "items": [["Grève critique I", "Boost de dégâts +5%"], ["Grève critique II", "Boost de dégâts +5%"], ["Tampon de dégâts I", "Réduction des dégâts +5%"], ["Tampon de dégâts II", "Réduction des dégâts +5%"], ["Évasion d'urgence", "Augmentation de la vitesse de déplacement en baisse"], ["Récupération rapide I", "Vitesse de récupération de l'endurance +5%"], ["Récupération rapide II", "Vitesse de récupération de l'endurance +5%"], ["Renfort sûr", "Egg Boat Limite de charge sûre +10 kg"], ["Charognard I", "Recherche d'articles plus rapide"], ["Charonnier II", "Recherche d'articles plus rapide"], ["Charonnier III", "Recherche d'articles plus rapide"], ["Corps Fort I", "Élan max +10"], ["Corps fort II", "Élan max +10"], ["Œuf rapide I", "Vitesse de déplacement +10% en fileté avec un œuf"], ["Œuf rapide II", "Vitesse de déplacement +10% en fileté avec un œuf"], ["Volonté Tenace", "Perte HP plus lente pendant la descente"], ["Œuf Dur I", "Réduction des dégâts +10% en double avec un œuf"], ["Œuf dur II", "Réduction des dégâts +10% en double avec un œuf"]]}, "rare": {"label": "Rare", "items": [["Entièrement Chargé I", "Charge +4"], ["Entièrement Chargé II", "Charge +4"], ["Entièrement Chargé III", "Charge +6"], ["Marchandises à moitié prix I", "Egg Heist Shop offre 1 article supplémentaire à moitié prix."], ["Marchandises à moitié prix II", "Egg Heist Shop offre 1 article supplémentaire à moitié prix."], ["Expansion sûre I", "Bateau d'œuf Capacité sûre +1"], ["Expansion sûre II", "Bateau d'œuf Capacité sûre +1"]]}, "epique": {"label": "Épique", "items": [["Œuf Bateau Coffre", "Déverrouille la fonction Egg Boat Safe."], ["Marchandises à moitié prix III", "Egg Heist Shop ajoute 2 articles à moitié prix supplémentaires."], ["Auto-relance", "Peut s'auto-réviver tout en étant abattu si un coéquipier est en vie. Une fois par match."]]}}, "intro": "Une seule course est une course contre deux autres joueurs et l'environnement. Access s'ouvre une fois que vous atteignez le Niveau Pathfinder vétéran, puis chaque match exécute le même arc :", "steps": [{"n": 1, "title": "Déposer dans les îles perdues", "desc": "Trois Pathfinders entrent dans l'arène en temps réel - vous êtes en compétition l'un contre l'autre et les menaces PvE de la carte."}, {"n": 2, "title": "Rassemblez-vous et infiltrez-vous", "desc": "Collecter les fournitures sur les îles, puis enfreindre la zone interdite où le prix est organisé."}, {"n": 3, "title": "Saisissez l'œuf géant Darkler", "desc": "Concourez pour réclamer l'œuf Giant Darkler – l'objet tout le mode est construit autour."}, {"n": 4, "title": "Évacuer par bateau", "desc": "Atteindre le bateau et sortir en toute sécurité pour faire la banque de ce que vous transportez. La façon dont ce paiement est partagé est la torsion de base du mode – voir les règles ci-dessous."}], "rankdesc": "Chaque course marque vers un rang saisonnier. Sept niveaux se situent entre un chasseur d'œufs frais et le apex – les rangs supérieurs laissent tomber des boîtes de récompense plus riches.", "talentdesc": "Entre les matchs, vous dépensez vos revenus sur les talents de heist d'œuf – des avantages permanents qui portent dans chaque future course. Il y en a 28 à travers trois raretés, à partir de petits boosts de statistiques à une auto-relance une fois par match.", "shopdesc": "Egg Heist dirige sa propre boucle de récompense. Les pièces d'œufs alimentent la boutique de braquage d'œufs, et vous dépensez bons sur une cadence hebdomadaire – chaque type de bon jusqu'à dix fois par semaine. La boutique elle-même stocke Gear, Imprints, Eggs, Keys et plus encore."};
  function brqRankCard(r, i) {
    var cls = "brqrank fxi" + (r.icon === "rank7" ? " apex" : "");
    return '<div class="' + cls + '" style="--rc:' + r.color + ';--i:' + i + '"><img src="' + BRAQUAGE.icons[r.icon] + '" alt="" loading="lazy">' +
      '<b>' + esc(r.name) + '</b><span>' + esc(r.div) + '</span></div>';
  }
  function brqStepCard(s) {
    return '<div class="brqstep"><span class="brqstepnum">' + s.n + '</span>' +
      '<div><b>' + esc(s.title) + '</b><p>' + esc(s.desc) + '</p></div></div>';
  }
  function brqShopCard(s) {
    return '<div class="brqshopcard"><img src="' + BRAQUAGE.icons[s.icon] + '" alt="" loading="lazy">' +
      '<div><b>' + esc(s.name) + '</b><p>' + esc(s.desc) + '</p></div></div>';
  }
  function brqTalentCard(t, k) {
    return '<div class="brqtalent ' + k + '"><b>' + esc(t[0]) + '</b><p>' + esc(t[1]) + '</p></div>';
  }
  function brqCol(key) {
    var col = BRAQUAGE.talents[key];
    return '<div class="brqcol ' + key + '"><div class="brqcolhead"><span class="brqdot ' + key + '"></span>' +
      esc(col.label) + '<span class="brqcount">' + col.items.length + '</span></div>' +
      col.items.map(function (t) { return brqTalentCard(t, key); }).join("") + '</div>';
  }
  function braquagePanel() {
    return '<div class="brqwrap">' +
      '<div class="brqsec">' + skHead("Comment \u00e7a fonctionne") +
        '<p class="brqdesc">' + esc(BRAQUAGE.intro) + '</p>' +
        '<div class="brqsteps">' + BRAQUAGE.steps.map(brqStepCard).join("") + '</div></div>' +
      '<div class="brqhead">' + skHead("Le prix \u2013 l'\u0153uf g\u00e9ant Darkler") +
        '<p class="brqdesc">Saisir l\'\u0153uf g\u00e9ant Darkler porte une chance d\'obtenir un Aniimo flambant neuf dans sa forme Darkler.</p>' +
      '</div>' +
      '<div class="brqsec">' + skHead("Escalader les rangs") +
        '<p class="brqdesc">' + esc(BRAQUAGE.rankdesc) + '</p>' +
        '<div class="brqranks' + animClass("informations:braquage") + '">' + BRAQUAGE.ranks.map(brqRankCard).join("") + '</div></div>' +
      '<div class="brqsec">' + skHead("\u00c9conomie & Boutique") +
        '<p class="brqdesc">' + esc(BRAQUAGE.shopdesc) + '</p>' +
        '<div class="brqshop">' + BRAQUAGE.shop.map(brqShopCard).join("") + '</div></div>' +
      '<div class="brqsec">' + skHead("L'arbre de Talent") +
        '<p class="brqdesc">' + esc(BRAQUAGE.talentdesc) + '</p>' +
        '<div class="brqtree">' + ["commun", "rare", "epique"].map(brqCol).join("") + '</div></div>' +
      '</div>';
  }

  /* ================= Éléments : contenu détaillé de l'onglet Informations ================= */
  function elemRosterCard(a, i) {
    var art = a.artBig ? '<img src="' + a.artBig + '" alt="' + esc(a.name) + '" loading="lazy">' : icon(a, 64);
    var els = a.elems || [];
    var c1 = S.elements[els[0]] || "#888";
    var c2 = S.elements[els[1]] || c1;
    var inner = '<div class="elemrosart">' + art + '<span class="elemrosno">N°' + esc(a.no) + '</span></div>' +
      '<div class="elemrosinfo"><b>' + esc(a.name) + '</b>' + roleChip(a.role) + '</div>';
    return '<div class="elemroscard fxi" style="--c1:' + c1 + ';--c2:' + c2 + ';--i:' + i + '">' + aniLink(a, inner) + '</div>';
  }
  function elementsPanel() {
    var e = view.elemInfo || "Feu";
    var ch = chartOf(e);
    var mascot = (S.elemMascots || {})[e];
    var members = activeAniimos().filter(function (a) { return a.elems.indexOf(e) >= 0; })
      .sort(function (a, b) { return parseInt(a.no, 10) - parseInt(b.no, 10); });
    var h = '<div class="elempick">' + ELEM_ORDER.map(function (k) {
      return '<button type="button" class="elempickbtn' + (e === k ? " on" : "") +
        '" data-eleminfo="' + esc(k) + '" style="--ec:' + (S.elements[k] || "#888") + '">' +
        elemChip(k) + "</button>";
    }).join("") + "</div>" +
      '<div class="elemhead">' +
      '<div class="elemtitlebox">' +
      '<div class="elemtitlewrap">' + skHead("Matchups de type " + e) + "</div>" +
      (mascot ? '<img class="elemmascot" src="' + mascot + '" alt="">' : "") +
      "</div>" +
      '<div class="elemways">' +
      '<div class="elemwrow"><span class="elemdot strong"></span><b>Fort contre</b><span class="elemwchips">' +
      (ch.strong.map(elemChip).join("") || '<span class="etcempty">—</span>') + "</span></div>" +
      '<div class="elemwrow"><span class="elemdot weak"></span><b>Faible à</b><span class="elemwchips">' +
      (ch.weak.map(elemChip).join("") || '<span class="etcempty">—</span>') + "</span></div>" +
      '<div class="elemwrow"><span class="elemdot resist"></span><b>Résiste</b><span class="elemwchips">' +
      (ch.resist.map(elemChip).join("") || '<span class="etcempty">—</span>') + "</span></div>" +
      "</div></div>" +
      '<div class="elemtitlewrap">' + skHead("Les Aniimo " + e) + "</div>" +
      '<div class="elemroster' + animClass("informations:elements") + '">' + members.map(elemRosterCard).join("") + "</div>";
    return h;
  }

  /* ================= Raretés : Score Potentiel ================= */
  var SCORE_TIERS_DEFAULT = [
    { key: "common", no: "01", name: "Commun", pct: "66%", color: "#24E67C" },
    { key: "good", no: "02", name: "Bien", pct: "26%", color: "#2E86FF" },
    { key: "elite", no: "03", name: "Élite", pct: "7,2%", color: "#A855F7" },
    { key: "perfect", no: "04", name: "Parfait", pct: "0,8%", color: "#F5B942" }
  ];
  function scoreTiersList() {
    if (!S.scoreTiers || !S.scoreTiers.length) S.scoreTiers = JSON.parse(JSON.stringify(SCORE_TIERS_DEFAULT));
    return S.scoreTiers;
  }
  function scoreCard(t, i) {
    var img = (S.qualityIcons || {})[t.key];
    return '<div class="scorecard fxi" style="--rc:' + t.color + ';--i:' + i + '">' +
      '<span class="scoreno">' + esc(t.no) + '</span>' +
      (img ? '<img class="scoreicon" src="' + img + '" alt="" loading="lazy">' : "") +
      '<b class="scorename">' + esc(t.name) + '</b>' +
      '<span class="scorepct">' + esc(t.pct) + '</span>' +
      '<span class="scoresub">Cotes d’attrapage</span>' +
      '</div>';
  }
  function raretesPanel() {
    return '<div class="scorewrap">' +
      '<div class="elemtitlewrap">' + skHead("Score Potentiel") + '</div>' +
      '<p class="scoreintro">Triez ou filtrez votre collection par score potentiel et chaque Aniimo montre l’un des quatre ascendants grades, chacun avec le badge de qualité du jeu. Un Aniimo fraîchement pris se lit sans appréciation jusqu’à ce que vous l’évaluiez pour révéler la note.</p>' +
      '<p class="brqdesc">Un Aniimo sauvage atterrit sur Commun la plupart du temps, et Parfait seulement ~0,8%.</p>' +
      '<div class="scoregrid' + animClass("informations:raretes") + '">' + scoreTiersList().map(scoreCard).join("") + '</div>' +
      '</div>';
  }

  /* ================= Formes : formes météo + carte des Fleurs de Leyline ================= */
  var WEATHER_FORMS = [
    { key: "pluie", label: "Pluie",
      desc: "Rain réveille les formes épouvantables : les variantes Rainstorm et les chanteurs côtiers qui restent cachés sous un ciel clair.",
      locs: [
        { name: "Nimbus Fields", lvl: "5-15", rows: [
          { ani: "Nimbi", img: "nimbi-2", form: "Forme Highland", elems: ["Vent", "Foudre"] },
          { ani: "Turbo", img: "turbo-2", form: "Forme Highland", elems: ["Vent", "Foudre"] }
        ] },
        { name: "Le détroit d’Argent", lvl: "14-20", rows: [
          { ani: "Tromber", img: "tromber-base", form: "Forme de Base", elems: ["Vent"] }
        ] },
        { name: "Forêt d’étoiles tombantes", lvl: "16-23", rows: [
          { ani: "Stellarys", img: "stellarys-2", form: "Forme de Tempête de Pluie", elems: ["Ténèbres", "Eau"] },
          { ani: "Tromber", img: "tromber-2", form: "Forme Highland", elems: ["Vent", "Eau"] }
        ] },
        { name: "Mer de Fleurs", lvl: "19-28", rows: [
          { ani: "Thornblade", img: "thornblade-2", form: "Forme de Tempête de Pluie", elems: ["Plante", "Foudre"] }
        ] },
        { name: "Côte de Tideblossom", lvl: "45-50", rows: [
          { ani: "Luminelle", img: "luminelle-2", form: "Forme de Tempête de Pluie", elems: ["Foudre", "Eau"] }
        ] },
        { name: "Baie de Crescent", lvl: "51-55", rows: [
          { ani: "Coraliz", img: "coraliz-2", form: "Forme Highland", elems: ["Roche"] },
          { ani: "Reefish", img: "reefish-2", form: "Forme Highland", elems: ["Roche"] }
        ] }
      ]
    },
    { key: "orage", label: "Orage",
      desc: "Tout ce que la pluie apporte, plus les chargeurs de tempête : des formes d’orage qui n’osent se montrer que lorsque la foudre craque.",
      locs: [
        { name: "Nimbus Fields", lvl: "5-15", rows: [
          { ani: "Nimbi", img: "nimbi-2", form: "Forme Highland", elems: ["Vent", "Foudre"] },
          { ani: "Turbo", img: "turbo-2", form: "Forme Highland", elems: ["Vent", "Foudre"] }
        ] },
        { name: "Le détroit d’Argent", lvl: "14-20", rows: [
          { ani: "Tromber", img: "tromber-base", form: "Forme de Base", elems: ["Vent"] }
        ] },
        { name: "Forêt d’étoiles tombantes", lvl: "16-23", rows: [
          { ani: "Stellarys", img: "stellarys-2", form: "Forme de Tempête de Pluie", elems: ["Ténèbres", "Eau"] },
          { ani: "Tromber", img: "tromber-2", form: "Forme Highland", elems: ["Vent", "Eau"] }
        ] },
        { name: "Mer de Fleurs", lvl: "19-28", rows: [
          { ani: "Thornblade", img: "thornblade-2", form: "Forme de Tempête de Pluie", elems: ["Plante", "Foudre"] }
        ] },
        { name: "crête de Beast Fang", lvl: "23-30", rows: [
          { ani: "Scorchhowl", img: "scorchhowl-2", form: "Forme d’Orage", elems: ["Feu", "Foudre"] },
          { ani: "Glynsera", img: "glynsera-night", form: "Forme de Nuit", elems: ["Ténèbres", "Glace"] }
        ] },
        { name: "Décrètement d’Echoback", lvl: "30-38", rows: [
          { ani: "Sherro", img: "sherro-2", form: "Forme d’Orage", elems: ["Eau", "Foudre"] }
        ] },
        { name: "Côte de Tideblossom", lvl: "45-50", rows: [
          { ani: "Luminelle", img: "luminelle-2", form: "Forme de Tempête de Pluie", elems: ["Foudre", "Eau"] }
        ] }
      ]
    },
    { key: "neige", label: "Neige",
      desc: "La neige tombe sur les trois régions les plus froides et tire les formes des Highlands touchées par la glace.",
      locs: [
        { name: "Prairie Driftwise", lvl: "38-42", rows: [
          { ani: "Pomegg", img: "pomegg-2", form: "Forme Highland", elems: ["Plante", "Glace"] }
        ] },
        { name: "Rosetower Woods", lvl: "39-43", rows: [
          { ani: "Pomegg", img: "pomegg-2", form: "Forme Highland", elems: ["Plante", "Glace"] }
        ] },
        { name: "Russet Highlands", lvl: "40-45", rows: [
          { ani: "Baleetle", img: "baleetle-2", form: "Forme Highland", elems: ["Roche", "Glace"] },
          { ani: "Helmut", img: "helmut-2", form: "Forme Highland", elems: ["Ténèbres", "Glace"] },
          { ani: "Rookey", img: "rookey-2", form: "Forme Highland", elems: ["Ténèbres", "Glace"] },
          { ani: "Waleetle", img: "waleetle-2", form: "Forme Highland", elems: ["Roche", "Glace"] },
          { ani: "Pawney", img: "pawney-2", form: "Forme Highland", elems: ["Ténèbres", "Glace"] }
        ] }
      ]
    }
  ];

  /* portrait d'une forme météo : image dédiée, sans fond coloré */
  function formIcon(row) {
    var src = (S.formeIcons || {})[row.img];
    if (!src) return "";
    return '<span class="wjico"><img src="' + src + '" alt="' + esc(row.ani) + '" loading="lazy"></span>';
  }

  function weatherRow(row) {
    var inner = formIcon(row) +
      '<div class="wrowmeta"><b>' + esc(row.ani) + "</b>" +
      '<span class="wform">' + esc(row.form) + "</span>" +
      '<div class="wchips">' + (row.elems || []).map(elemChip).join("") +
      (row.extra ? '<span class="chip sm ghost">' + esc(row.extra) + "</span>" : "") + "</div></div>";
    return '<div class="wrow">' + inner + "</div>";
  }

  function weatherLoc(loc) {
    return '<div class="wloc"><div class="wlochead"><b>' + esc(loc.name) + '</b>' +
      '<span class="wlvl">Lv ' + esc(loc.lvl) + "</span></div>" +
      '<div class="wlocrows">' + loc.rows.map(weatherRow).join("") + "</div></div>";
  }

  /* petites particules décoratives (gouttes, flocons, éclair) sur la vignette météo */
  function wpillFx(key) {
    if (key === "pluie") {
      return '<span class="wfx" aria-hidden="true">' +
        [10, 24, 40, 55, 68, 82, 94].map(function (x, i) {
          return '<span class="drop" style="left:' + x + '%; --i:' + i + '"></span>';
        }).join("") + "</span>";
    }
    if (key === "orage") {
      return '<span class="wfx" aria-hidden="true">' +
        [12, 26, 62, 88].map(function (x, i) {
          return '<span class="drop" style="left:' + x + '%; --i:' + i + '"></span>';
        }).join("") +
        '<span class="flash"></span><span class="bolt"></span></span>';
    }
    if (key === "neige") {
      return '<span class="wfx" aria-hidden="true">' +
        [8, 22, 36, 50, 64, 78, 92].map(function (x, i) {
          return '<span class="flake" style="left:' + x + '%; --i:' + i + '"></span>';
        }).join("") + "</span>";
    }
    return "";
  }
  function weatherPanel(w, i) {
    var im = (S.weatherIcons || {})[w.key];
    return '<div class="wpanel wp-' + w.key + ' fxi" style="--i:' + i + '">' +
      '<div class="wpill">' + wpillFx(w.key) + (im ? '<img src="' + im + '" alt="" class="wpico">' : "") +
      "<span>" + esc(w.label) + "</span></div>" +
      '<div class="wlocgrid">' + w.locs.map(weatherLoc).join("") + "</div></div>";
  }

  /* carte interactive des Fleurs de Leyline, avec les points de collecte de Prismana */
  var LEYLINE_SPOTS = [
    { name: "Echoback Landing", x: 12.9, y: 25.31 },
    { name: "Beast Fang Ridge", x: 24.19, y: 23.9 },
    { name: "Berylline Causeway", x: 37.44, y: 23.9 },
    { name: "Russet Highlands", x: 50, y: 19.97 },
    { name: "Zephyrus Landbridge", x: 73.85, y: 22.64 },
    { name: "Rosetower Woods", x: 73.85, y: 51.1 },
    { name: "Driftwise Meadow", x: 47.93, y: 33.33 },
    { name: "Mistwoods", x: 31.91, y: 40.88 },
    { name: "Forêt d’étoiles tombantes", x: 12.9, y: 39.31 },
    { name: "Nimbus Fields", x: 25.92, y: 58.02 },
    { name: "Le détroit d’Argent", x: 23.39, y: 70.6 },
    { name: "Blitzwood", x: 44.24, y: 63.21 },
    { name: "Côte de Tideblossom", x: 58.76, y: 82.23 },
    { name: "Mer de Fleurs", x: 53.81, y: 59.43 }
  ];

  function leylineSpot(sp, i) {
    return '<button type="button" class="leyspot" style="left:' + sp.x + '%;top:' + sp.y + '%;--i:' + i + '" aria-label="' + esc(sp.name) + '">' +
      (S.leylineIcon ? '<img src="' + S.leylineIcon + '" alt="" loading="lazy">' : "") +
      '<span class="leyname">' + esc(sp.name) + "</span></button>";
  }

  function leylinePanel(i) {
    return '<div class="leylinewrap fxi" id="leyline-map" style="--i:' + i + '">' +
      '<div class="leytitle">' + (S.prismanaFlowIcon ? '<img src="' + S.prismanaFlowIcon + '" alt="" class="leytitleico">' : "") +
      skHead("Les Nutures") + "</div>" +
      tipNote("Passez la souris sur les icônes de la carte pour afficher le nom de chaque lieu.") +
      '<div class="leymapbox">' +
      (S.leylineMap ? '<img class="leymap" src="' + S.leylineMap + '" alt="Carte des Nutures">' : "") +
      LEYLINE_SPOTS.map(leylineSpot).join("") +
      "</div>" + prismList() + "</div>";
  }

  /* liste des Prismana par lieu de collecte, sous la carte des Fleurs de Leyline */
  var PRISM_SPOTS = [
    { loc: "Nimbus Fields", lvl: "5-15", names: ["Turbo"] },
    { loc: "The Argent Strait", lvl: "14-20", names: ["Cornet"] },
    { loc: "Forest of Falling Stars", lvl: "16-23", names: ["Stellarys"] },
    { loc: "Sea of Flowers", lvl: "19-28", names: ["Thornblade"] },
    { loc: "Beast Fang Ridge", lvl: "23-30", names: ["Scorchhowl", "Glynsera"] },
    { loc: "Mistwoods", lvl: "24-33", names: ["Witchin"] },
    { loc: "Blitzwood", lvl: "28-35", names: ["Blazen"] },
    { loc: "Echoback Landing", lvl: "30-38", names: ["Panpanta", "Sherro"] },
    { loc: "Berylline Causeway", lvl: "34-38", names: ["Ignitis"] },
    { loc: "Driftwise Meadow", lvl: "38-42", names: ["Glacy"] },
    { loc: "Rosetower Woods", lvl: "39-43", names: ["Grizbo"] },
    { loc: "Russet Highlands", lvl: "40-45", names: ["Pawney"] },
    { loc: "Tideblossom Coast", lvl: "45-50", names: ["Luminelle"] },
    { loc: "Zephyrus Landbridge", lvl: "45-48", names: ["Magmarex"] },
    { loc: "Crescent Bay", lvl: "51-55", names: ["Glameep"] }
  ];

  /* certaines espèces utilisent une forme Prismana « -3 » plutôt que « -2 » par défaut,
     voir les clés déjà déclarées dans PRISM_EGGS plus bas */
  var PRISM_FORM_KEY_OVERRIDES = {
    luminelle: "luminelle-3", pawney: "pawney-3", scorchhowl: "scorchhowl-3",
    sherro: "sherro-3", stellarys: "stellarys-3", thornblade: "thornblade-3", turbo: "turbo-3"
  };
  /* la forme Prismana de certaines espèces porte un second élément que sa fiche
     de base n'a pas (ex. Stellarys de base = Ténèbres, sa forme de Tempête de
     Pluie = Ténèbres/Eau) — repris des formes météo déjà déclarées plus haut. */
  var PRISM_ELEM_OVERRIDES = {
    turbo: ["Vent", "Foudre"], stellarys: ["Ténèbres", "Eau"], thornblade: ["Plante", "Foudre"],
    luminelle: ["Foudre", "Eau"], scorchhowl: ["Feu", "Foudre"], glynsera: ["Ténèbres", "Glace"],
    sherro: ["Eau", "Foudre"], pawney: ["Ténèbres", "Glace"]
  };
  function prismRow(name) {
    var a = findAni(name);
    if (!a) return "";
    var lname = a.name.toLowerCase();
    var key = PRISM_FORM_KEY_OVERRIDES[lname] || (lname + "-2");
    var src = (S.formeIcons || {})[key] || a.img;
    var elems = PRISM_ELEM_OVERRIDES[lname] || a.elems || [];
    var inner = '<span class="prico">' + (src ? '<img src="' + src + '" alt="" loading="lazy">' : "") + "</span>" +
      '<div class="prowmeta"><b>Prismana ' + esc(a.name) + "</b>" +
      '<div class="wchips">' + elems.map(elemChip).join("") + "</div></div>";
    return '<div class="prow">' + inner + "</div>";
  }

  function prismLoc(sp) {
    return '<div class="wloc"><div class="wlochead"><b>' + esc(sp.loc) + '</b>' +
      '<span class="wlvl">Lv ' + esc(sp.lvl) + "</span></div>" +
      '<div class="wlocrows">' + sp.names.map(prismRow).join("") + "</div></div>";
  }

  function prismList() {
    return '<div class="prismlist"><div class="wlocgrid">' + PRISM_SPOTS.map(prismLoc).join("") + "</div></div>";
  }

  function formesPanel() {
    return '<div class="formeswrap' + animClass("informations:formes") + '">' +
      WEATHER_FORMS.map(weatherPanel).join("") +
      leylinePanel(WEATHER_FORMS.length) +
      "</div>";
  }

  /* ================= Œufs & Éclosions ================= */
  var HATCH_STEPS = [
    { n: 1, title: "Prenez un oeuf", desc: "Les œufs apparaissent lorsque vous explorez, à partir d'événements et d'autres systèmes – chacun porte déjà les étiquettes qui décident de ce qu'il devient." },
    { n: 2, title: "Incuber au Hatchinator", desc: "Placez-le dans le Hatchinator, l'incubateur de votre patrie, et il éclot sur une minuterie. Il éclot même des œufs de Pathfinders à proximité à portée." },
    { n: 3, title: "Accélérez-le", desc: "Caressez l'œuf pour couper l'attente (il y a une limite quotidienne, et les amis peuvent caresser le vôtre aussi), dépenser des articles d'accélération, ou rouler le bonus de week-end - le temps d'éclosion est divisé par deux du vendredi au dimanche." },
    { n: 4, title: "Rencontrez votre Aniimo", desc: "L'œuf éclot dans son Aniimo – et certains œufs ont une chance d'en éclore deux à la fois." },
  ];
  function eggStepCard(s, i) {
    return '<div class="eggstep fxi" style="--i:' + i + '"><span class="eggstepnum">' + s.n + "</span>" +
      "<div><b>" + esc(s.title) + "</b><p>" + esc(s.desc) + "</p></div></div>";
  }

  /* Prismana : forme iridescente, la plus rare à l'éclosion */
  var PRISM_EGGS = [
    { name: "Blazen", key: "blazen-2" },
    { name: "Cornet", key: "cornet-2" },
    { name: "Fenmane" },
    { name: "Fentuft" },
    { name: "Fulmintis" },
    { name: "Glacy", key: "glacy-2" },
    { name: "Glameep", key: "glameep-2" },
    { name: "Glynsera", key: "glynsera-2" },
    { name: "Grizbo", key: "grizbo-2" },
    { name: "Ignitis", key: "ignitis-2" },
    { name: "Iris", key: "iris-2" },
    { name: "Irisal", key: "irisal-2" },
    { name: "Luminelle", key: "luminelle-3" },
    { name: "Magmarex", key: "magmarex-2" },
    { name: "Panpanta", key: "panpanta-2" },
    { name: "Pawney", key: "pawney-3" },
    { name: "Scorchhowl", key: "scorchhowl-3" },
    { name: "Sherro", key: "sherro-3" },
    { name: "Stellarys", key: "stellarys-3" },
    { name: "Thornblade", key: "thornblade-3" },
    { name: "Turbo", key: "turbo-3" },
    { name: "Witchin", key: "witchin-2" },
  ];
  /* Ombrage : forme sombre, plus rare encore */
  var SHADOW_EGGS = [
    { name: "Blazen", key: "blazen-shadow" },
    { name: "Cornet", key: "cornet-shadow" },
    { name: "Ignitis", key: "ignitis-shadow" },
    { name: "Luminelle", key: "luminelle-shadow" },
    { name: "Magmarex", key: "magmarex-shadow" },
    { name: "Pawney", key: "pawney-shadow" },
    { name: "Scorchhowl", key: "scorchhowl-shadow" },
    { name: "Sherro", key: "sherro-shadow" },
    { name: "Stellarys", key: "stellarys-shadow" },
    { name: "Thornblade", key: "thornblade-shadow" },
    { name: "Turbo", key: "turbo-shadow" },
    { name: "Witchin", key: "witchin-shadow" },
  ];
  function eggIcon(item) {
    var a = findAni(item.name);
    var src = item.key ? (S.formeIcons || {})[item.key] : null;
    if (!src && a) src = a.img;
    return src;
  }
  function eggCard(item) {
    var a = findAni(item.name);
    var src = eggIcon(item);
    var inner = '<span class="eggico">' +
      (src ? '<img src="' + src + '" alt="" loading="lazy">' : "") + "</span>" +
      "<b>" + esc(item.name) + "</b>";
    return a ?
      '<button type="button" class="anilink eggcard" data-ani="' + esc(a.name) + '">' + inner + "</button>" :
      '<div class="eggcard">' + inner + "</div>";
  }
  function eggTrack(list, cls) {
    var cards = list.map(eggCard).join("");
    return '<div class="eggtrackwrap ' + cls + '"><div class="eggtrack">' + cards + cards + "</div></div>";
  }

  /* paliers de garantie d'éclosion */
  var EGG_TIERS = [
    { key: "elite", name: "Elite", desc: "Garantit un Score Potentiel Élite ou supérieur", color: "#A855F7" },
    { key: "perfect", name: "Parfait", desc: "Garantit la meilleure note de Score Potentiel", color: "#F5B942" },
    { key: "sparkling", name: "Sparkling", desc: "Garantit un Aniimo Sparkling chromatique", color: "#FF6EC7", pm: ["#FF6EC7", "#35E6D8", "#FFFFFF"] },
    { key: "alpha", name: "Alpha", desc: "Garantit le puissant trait Alpha", color: "#D2453F" }
  ];
  function eggTierCard(t) {
    var pm = t.pm ? ";--pm1:" + esc(t.pm[0]) + ";--pm2:" + esc(t.pm[1]) + ";--pm3:" + esc(t.pm[2]) : "";
    return '<div class="eggtiercard' + (t.pm ? " prismatique" : "") + '" style="--rc:' + esc(t.color) + pm + '">' +
      '<b class="eggtiername">' + esc(t.name) + '</b>' +
      '<p class="eggtierdesc">' + esc(t.desc) + '</p>' +
      '</div>';
  }
  function eggTiersPanel() {
    return '<div class="leytitle">' + (S.eggsIcon ? '<img src="' + S.eggsIcon + '" alt="" class="leytitleico">' : "") +
      skHead("Les oeufs") + "</div>" +
      '<div class="eggtiergrid">' + EGG_TIERS.map(eggTierCard).join("") + "</div>";
  }

  function oeufsPanel() {
    return '<div class="oeufswrap">' +
      '<div class="ctrtitle">' + skHead("Comment fonctionne l'éclosion ?") + "</div>" +
      goldNote("À savoir", "Seuls Aniipod Ultra et le Sparkling Cube portent une garantie d'éclosion – alors gardez ceux pour les œufs qui vous tiennent à cœur.") +
      '<div class="eggsteps' + animClass("informations:oeufs") + '">' + HATCH_STEPS.map(eggStepCard).join("") + "</div>" +
      eggTiersPanel() +
      '<div class="ctrtitle">' + skHead("Œufs d'ombrage – la forme de l'ombre") + "</div>" +
      eggTrack(SHADOW_EGGS, "ombrage") +
      "</div>";
  }

  /* ================= Aniipods ================= */
  var ANIIPODS = [
    { key: "aniipodUltra", name: "Aniipod Ultra", rar: "legendaire",
      desc: "Aniipod développé par le Polaris Institute avec des performances étonnantes à tous points de vue. Il représente l’esprit d’un champion." },
    { key: "cubeScintillant", name: "Cube scintillant", rar: "prismatique",
      desc: "Une version améliorée de l’Aniipod Ultra, créée par un génie. Certains Pathfinders croient que sa conception transcende les mathématiques et est plutôt métaphysique." },
    { key: "aniipodHyper", name: "Aniipod Hyper", rar: "epique",
      desc: "Un Aniipod fabriqué à partir de nouveaux matériaux qui augmente la vitesse de lancer en réduisant la résistance à l’air et en étendant la plage de lancer." },
    { key: "aniipodMega", name: "Aniipod Mega", rar: "epique",
      desc: "Le deuxième produit amélioré de la série Aniipod, conçu pour aider Pathfinders à attraper Aniimo encore plus facilement." },
    { key: "aniipodPro", name: "Aniipod Pro", rar: "epique",
      desc: "Le premier produit amélioré de la série Aniipod, conçu pour aider Pathfinders à attraper Aniimo avec plus de facilité." },
    { key: "aniipodTrace", name: "Aniipod Trace", rar: "epique",
      desc: "Un dispositif de capture Aniimo équipé d’un système de verrouillage à l’œil d’aigle qui suit automatiquement Aniimo à proximité après avoir été jeté." },
    { key: "tumbler", name: "Tumbler", rar: "epique",
      desc: "Un produit de spécialité de la série Aniipod, inspiré de Nimbi roulant sur des pentes herbeuses." },
    { key: "aniipod", name: "Aniipod", rar: "rare",
      desc: "Un dispositif pour attraper, équiper et entraîner Aniimo. Les chercheurs de l’Institut Polaris l’ont développé en utilisant Lumintech après s’être inspirés des ruines de la civilisation de l’ancienne Idylle." }
  ];
  var ANIIPOD_RAR_DEFAULT = {
    rare: { label: "Rare", color: "#2E86FF" },
    epique: { label: "Épique", color: "#A855F7" },
    legendaire: { label: "Légendaire", color: "#F5B942" },
    prismatique: { label: "Prismatique", color: "#FF6EC7", pm1: "#FF6EC7", pm2: "#35E6D8", pm3: "#FFFFFF" }
  };
  function itemRarities() {
    if (!S.itemRarities) S.itemRarities = JSON.parse(JSON.stringify(ANIIPOD_RAR_DEFAULT));
    return S.itemRarities;
  }
  function itmCard(it, i) {
    var R = itemRarities(), r = R[it.rar] || R.rare;
    var img = (S.aniipodIcons || {})[it.key];
    var pm = it.rar === "prismatique" ?
      ";--pm1:" + esc(r.pm1 || "#FF6EC7") + ";--pm2:" + esc(r.pm2 || "#35E6D8") + ";--pm3:" + esc(r.pm3 || "#FFFFFF") : "";
    return '<div class="itmcard ' + it.rar + ' fxi" style="--rc:' + esc(r.color) + pm + ';--i:' + i + '">' +
      (img ? '<img class="itmicon" src="' + img + '" alt="" loading="lazy">' : "") +
      '<b class="itmname">' + esc(it.name) + '</b>' +
      '<span class="itmrare">' + esc(r.label) + '</span>' +
      '<p class="itmdesc">' + esc(it.desc) + '</p>' +
      '</div>';
  }
  var ANIIPOD_RAR_ORDER = { rare: 0, epique: 1, legendaire: 2, prismatique: 3 };
  function aniipodsPanel() {
    var sorted = ANIIPODS.slice().sort(function (a, b) {
      return ANIIPOD_RAR_ORDER[a.rar] - ANIIPOD_RAR_ORDER[b.rar];
    });
    return '<div class="scorewrap">' +
      '<div class="elemtitlewrap">' + skHead("Les Aniipods") + '</div>' +
      '<p class="scoreintro">Aniimo a 8 objets de capture. Ils couvrent 3 niveaux de rareté, de Rare jusqu’à Prismatic. Les plus rares incluent Sparkling Cube.</p>' +
      '<p class="brqdesc">Les valeurs peuvent changer avant le lancement.</p>' +
      '<div class="itmgrid' + animClass("informations:aniipods") + '">' + sorted.map(itmCard).join("") + '</div>' +
      '</div>';
  }

  /* ================= Accueil : journal des mises à jour du site ================= */
  var PATCH_TYPE = {
    add: { label: "Ajout", cls: "add" },
    mod: { label: "Modification", cls: "mod" },
    del: { label: "Suppression", cls: "del" }
  };
  var PATCHNOTES = [
    { version: "0.2", date: "29 août 2026", changes: [
      { t: "add", txt: "Nouvelle page d’Accueil : journal des mises à jour du site (Devblog) avec un carré par version, visible dès l’arrivée." },
      { t: "add", txt: "Informations > Raretés : section « Score Potentiel » avec les 4 paliers de rareté et leurs cotes d’attrapage." },
      { t: "add", txt: "Informations > Aniipods : les 11 objets de capture du jeu, classés par rareté (Rare, Épique, Légendaire, Prismatique)." },
      { t: "add", txt: "Informations > Éléments : matchups de type et roster complet des Aniimo pour chacun des 9 éléments, avec mascottes animées." },
      { t: "add", txt: "Ajout d’une page d’Accueil." },
      { t: "add", txt: "Ajout d’un dépliant dans la Team « Contre un Élément »." },
      { t: "add", txt: "Ajout du contenu dans Informations > Braquage d’Œuf." },
      { t: "add", txt: "Ajout du contenu dans Informations > Éléments." },
      { t: "add", txt: "Ajout du contenu dans Informations > Raretés." },
      { t: "add", txt: "Ajout du contenu dans Informations > Aniipods." },
      { t: "add", txt: "Ajout du contenu dans Informations > Météo & Prismana." },
      { t: "add", txt: "Ajout du contenu dans Informations > Formes Régionales." },
      { t: "add", txt: "Ajout du contenu dans Informations > Œufs & Éclosions." },
      { t: "del", txt: "Suppression de certaines informations inutiles." },
      { t: "del", txt: "Suppression des catégories « Rôles » et « Statistiques »." },
      { t: "del", txt: "Suppression de la catégorie « Composer moi-même »." },
      { t: "mod", txt: "Modification de la catégorie « Tiers List »." },
      { t: "mod", txt: "Modification de la catégorie « Métiers Aniimo »." },
      { t: "mod", txt: "Modification de l’affichage des icônes d’Aniimo dans la catégorie « Tous les Aniimos »." },
      { t: "mod", txt: "Modification dans Team « Composer moi-même » : la composition est désormais libre." }
    ] },
    { version: "0.1", date: "23 – 24 août 2026", changes: [
      { t: "add", txt: "Ajout d’une étiquette « Ultime » sur les compétences correspondantes." },
      { t: "add", txt: "Ajout d’une étiquette « S Core » sur les compétences correspondantes." },
      { t: "add", txt: "Ajout d’une étiquette « Légendaire » pour Irisalis dans sa description ainsi que dans les classements afin de mieux l’identifier." },
      { t: "add", txt: "Ajout de la catégorie « Informations »." },
      { t: "add", txt: "Ajout d’un vote pour les Tier Lists créées par les utilisateurs." },
      { t: "add", txt: "Ajout d’un panneau affichant les contre-éléments." },
      { t: "add", txt: "Ajout de catégories dans Informations : Rôles, Raretés, Formes, Aniipods, Statistiques et Éléments." },
      { t: "del", txt: "Suppression des descriptions dans les Tier Lists." },
      { t: "del", txt: "Suppression de « Team automatique » dans la catégorie Team." },
      { t: "del", txt: "Suppression d’Irisalis dans l’arbre d’évolution." },
      { t: "del", txt: "Suppression des « Rangs 1/4 » à « Rangs 4/4 » dans les métiers Loisir, Artisanat, Parfumerie et Portage." },
      { t: "del", txt: "Suppression des noms en anglais dans les métiers." },
      { t: "del", txt: "Suppression de « Soin » dans la recherche par Type." },
      { t: "del", txt: "Suppression de l’information « Meilleur coup » ainsi que de la recherche par « Meilleur coup » dans la catégorie « Les Compétences »." },
      { t: "mod", txt: "Modification de l’ordre de certaines catégories." },
      { t: "mod", txt: "Modification des couleurs des Abilités." },
      { t: "mod", txt: "Modification de la description des Teams lorsqu’on clique sur un Aniimo." },
      { t: "mod", txt: "Modification des statistiques, des compétences et de la description d’Irisalis." }
    ] }
  ];
  function patchItem(c) {
    var p = PATCH_TYPE[c.t];
    return '<div class="patchitem ' + p.cls + '"><span class="patchtag">' + esc(p.label) + '</span>' +
      '<p>' + esc(c.txt) + '</p></div>';
  }
  /* liste de gauche : une ligne miniature par version, la plus récente en haut. */
  function devMini(d, i) {
    var active = view.devOpen === i;
    return '<div class="devmini fxi' + (active ? " active" : "") + '" data-dev="' + i + '" style="--i:' + i + '">' +
      '<span class="devminiv">Patch v.' + esc(d.version) + '</span>' +
      '<span class="devminid">' + esc(d.date) + '</span></div>';
  }
  /* panneau central : détail de la version sélectionnée. */
  function devDetail(d) {
    return '<div class="devmainhead"><b>Patch v.' + esc(d.version) + '</b>' +
      '<span class="devdate">' + esc(d.date) + '</span></div>' +
      '<div class="patchlist">' + d.changes.map(patchItem).join("") + '</div>';
  }
  /* compte à rebours avant l'ouverture, calé en position absolue à gauche de
     l'encadré d'avertissement : totalement indépendant du reste de la mise en
     page (ne pousse ni ne décale rien), masqué sur les écrans trop étroits
     pour lui laisser de la place sans chevaucher quoi que ce soit. */
  function launchTimerBox() {
    return '<div class="launchtimer" aria-live="off">' +
      '<span class="ltlabel">Ouverture d\'Aniimo</span>' +
      '<div class="ltnums">' +
      '<div class="ltcell"><b data-lt="d">--</b><span>Jours</span></div>' +
      '<div class="ltcell"><b data-lt="h">--</b><span>Heures</span></div>' +
      '<div class="ltcell"><b data-lt="m">--</b><span>Min</span></div>' +
      '<div class="ltcell"><b data-lt="s">--</b><span>Sec</span></div>' +
      "</div></div>";
  }
  var LAUNCH_AT = new Date(2026, 8, 16, 4, 0, 0).getTime();
  var launchTimerIv = null;
  function bindLaunchTimer() {
    if (launchTimerIv) { clearInterval(launchTimerIv); launchTimerIv = null; }
    var box = document.querySelector(".launchtimer");
    if (!box) return;
    var dEl = box.querySelector('[data-lt="d"]'), hEl = box.querySelector('[data-lt="h"]'),
      mEl = box.querySelector('[data-lt="m"]'), sEl = box.querySelector('[data-lt="s"]');
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    function tick() {
      var diff = LAUNCH_AT - Date.now();
      if (diff <= 0) {
        dEl.textContent = hEl.textContent = mEl.textContent = sEl.textContent = "00";
        if (launchTimerIv) { clearInterval(launchTimerIv); launchTimerIv = null; }
        return;
      }
      var s = Math.floor(diff / 1000);
      var d = Math.floor(s / 86400); s -= d * 86400;
      var h = Math.floor(s / 3600); s -= h * 3600;
      var m = Math.floor(s / 60); s -= m * 60;
      dEl.textContent = String(d);
      hEl.textContent = pad(h); mEl.textContent = pad(m); sEl.textContent = pad(s);
    }
    tick();
    launchTimerIv = setInterval(tick, 1000);
  }
  function homePanel() {
    var list = devList();
    var idx = list[view.devOpen] ? view.devOpen : 0;
    var cur = list[idx];
    var mascot = (S.devblog || {}).mascot;
    return '<div class="homewrap">' +
      launchTimerBox() +
      '<div class="homewarn' + (homeWarnHalo() ? "" : " nohalo") + '" style="--wc:' + esc(homeWarnColor()) + '">' +
      esc(homeWarn()) + '</div>' +
      '<div class="elemtitlewrap">' + skHead("Journal des mises à jour") + '</div>' +
      '<div class="devblog">' +
      '<div class="devlist' + animClass("accueil") + '">' + list.map(devMini).join("") + '</div>' +
      '<div class="devmain' + (devOpening ? " fx fx-blurin" : "") + '"' +
      (devOpening ? ' style="--dur:1.05s"' : "") + '>' +
      (cur ? '<div class="fxi">' + devDetail(cur) + '</div>' : "") + '</div>' +
      '<div class="devside">' +
      (mascot ? '<img class="devmascot" src="' + mascot + '" alt="">' : "") +
      '<b class="devbrand">Devblog</b>' +
      '</div></div></div>';
  }

  function wipNote() {
    return '<div class="wipnote">' +
      (S.wipImg ? '<img class="wipimg" src="' + S.wipImg + '" alt="">' : "") +
      "<b>Rédaction en cours</b>" +
      "<p>Cette rubrique arrive bientôt. Reviens la consulter dans quelques jours, " +
      "ou suis l'avancement sur le Discord.</p></div>";
  }
  /* page en cours de rédaction */
  function viewWip(t) {
    var h = '<div class="head"><h1>' + esc(t.label) + "</h1></div>";
    if (t.id === "informations") {
      h += '<div class="modes">' + INFO_TAGS.map(function (tg) {
        return '<button class="btn' + (view.infoTag === tg.key ? " primary" : "") +
          '" data-infotag="' + tg.key + '">' + esc(tg.label) + "</button>";
      }).join("") + "</div>";
      h += view.infoTag === "braquage" ? braquagePanel() :
        view.infoTag === "elements" ? elementsPanel() :
        view.infoTag === "raretes" ? raretesPanel() :
        view.infoTag === "aniipods" ? aniipodsPanel() :
        view.infoTag === "formes" ? formesPanel() :
        view.infoTag === "oeufs" ? oeufsPanel() :
        '<div class="wipwrap">' + wipNote() + "</div>";
      return h;
    }
    return h + '<div class="wipwrap">' + wipNote() + "</div>";
  }

  /* mention légale, au pied de chaque page */
  function siteFooter() {
    return '<footer class="sitefoot"><span>Tout droit réservés — Fan Website — Maxlore Credit</span></footer>';
  }

  /* bouton « remonter » : un Aniimo qui dépasse du haut de la pastille */
  var TOPANI = null;
  function topBtn() {
    if (!TOPANI) {
      var pool = activeAniimos().filter(function (a) { return a.img; });
      TOPANI = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }
    return '<button type="button" class="topbtn" id="gotop" aria-label="Remonter en haut">' +
      (TOPANI ? '<img class="topani" src="' + TOPANI.img + '" alt="">' : "") +
      '<span class="toparr" aria-hidden="true">▲</span><span class="toplab">TOP</span></button>';
  }
  var topTick = null;
  function bindTop() {
    var b = document.getElementById("gotop");
    if (!b) return;
    b.onclick = function () { window.scrollTo({ top: 0, behavior: "smooth" }); };
    function upd() { b.classList.toggle("on", (window.scrollY || 0) > 260); }
    upd();
    if (topTick) window.removeEventListener("scroll", topTick);
    topTick = upd;
    window.addEventListener("scroll", topTick, { passive: true });
  }

  /* on retient certaines préférences, mais pas l'onglet : chaque visite repart sur l'Accueil */
  var VIEW_KEY = "aniimo.view";
  var VIEW_KEEP = ["tier", "abil", "teamMode", "teamMain", "adminSec", "tfold"];
  function saveView() {
    try {
      var o = {};
      VIEW_KEEP.forEach(function (k) { o[k] = view[k]; });
      localStorage.setItem(VIEW_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  function restoreView() {
    try {
      var o = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
      if (!o) return;
      VIEW_KEEP.forEach(function (k) { if (o[k] !== undefined && o[k] !== null) view[k] = o[k]; });
      /* "Team automatique" a été retiré : les visiteurs qui avaient encore ce mode
         enregistré basculent simplement sur "Composer moi-même". */
      if (view.teamMode === "auto") view.teamMode = "manuel";
      /* une liste perso supprimée entre-temps ne doit pas bloquer la page */
      if (typeof view.tier === "string" && view.tier.indexOf("L:") === 0 &&
          !tListOf(view.tier.slice(2))) view.tier = "ALL";
      if (!tabOf(view.tab) || tabOf(view.tab).id !== view.tab) view.tab = "accueil";
    } catch (e) {}
  }

  function render() {
    /* la page revient en haut à chaque interaction (clic sur une vignette, une
       catégorie ou autre) — c'est le comportement voulu partout, sauf sur la
       Tiers List : là, on reste statique (position mémorisée puis restaurée),
       pour pouvoir sélectionner un Aniimo et faire défiler à la molette sans
       perdre sa place pendant la création d'une liste. Certains raccourcis de
       navigation (changement de catégorie, ouverture d'une liste partagée...)
       forcent en plus explicitement window.scrollTo(0, 0) juste après cet
       appel, y compris pour arriver en haut de la Tiers List elle-même. */
    var sy = window.scrollY;
    var t = tabOf(view.tab), body;
    if (t.kind === "home") body = homePanel();
    else if (t.kind === "roster") body = viewRoster();
    else if (t.kind === "power") body = viewPower();
    else if (t.kind === "abil") body = viewAbil();
    else if (t.kind === "jobs") body = viewJobs();
    else if (t.kind === "tier") body = viewTier();
    else if (t.kind === "team") body = viewTeam();
    else if (t.kind === "wip") body = viewWip(t);
    else if (t.kind === "custom") body = customPanel(t);
    else body = adminLocked() ? viewLock() : viewAdmin();

    document.getElementById("app").innerHTML = defs() +
      '<div class="shell"><nav class="rail">' + renderRail() + '</nav><main class="main">' +
      banner() + body + siteFooter() + "</main></div>" +
      topBtn() +
      (view.detail ? viewDetail(view.detail) : "");
    wire();
    bindTop();
    applyStyle();
    applyProtect();
    saveView();
    if (t.kind === "tier") window.scrollTo(0, sy); else window.scrollTo(0, 0);
    if (t.kind === "home") bindLaunchTimer();
    else if (launchTimerIv) { clearInterval(launchTimerIv); launchTimerIv = null; }
    if (t.kind === "admin" && adminLocked()) return;
    if (t.kind === "admin" && view.adminSec === "aniimo" && view.pick) { fillForm(); bindSkillIcons(); }
    if (t.kind === "admin" && view.adminSec === "skico") bindSkillIcons();
    if (t.kind === "admin" && view.adminSec === "tiers") bindAdminTiers();
    if (t.kind === "admin" && view.adminSec === "abil") bindAdminAbil();
    if (t.kind === "admin" && view.adminSec === "votes") bindAdminVotes();
    if (t.kind === "admin" && view.adminSec === "pages") bindAdminPages();
    if (t.kind === "admin" && view.adminSec === "style") bindAdminStyle();
    if (t.kind === "admin" && view.adminSec === "accueil") bindAdminAccueil();
    if (t.kind === "admin" && view.adminSec === "devblog") bindAdminDevblog();
    if (t.kind === "admin" && view.adminSec === "custom") bindAdminCustom();
    if (t.kind === "admin" && view.adminSec === "rarity") bindAdminRarity();
    if (t.kind === "admin" && view.adminSec === "protect") bindAdminProtect();
  }


  /* ---------------- Tiers List : création, glisser-déposer, partage ---------------- */
  function curList() {
    return view.tier && view.tier.indexOf("L:") === 0 ? tListOf(view.tier.slice(2)) : null;
  }
  function placeIn(name, key) {
    var l = curList();
    if (!l || !tIsMine(l.id)) return;
    l.tiers = l.tiers || {};
    if (key === "_") delete l.tiers[name]; else l.tiers[name] = key;
    view.tpick = null;
    persist("Tiers list mise à jour");
    render();
  }

  function wireTier() {
    on("tfold", "onclick", function () { view.tfold = !view.tfold; render(); });
    document.querySelectorAll("[data-vote]").forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); castVote(b.dataset.vn, b.dataset.vote); };
    });
    on("vsave", "onclick", function () {
      var v = myVotes();
      if (!Object.keys(v).length) return;
      var btn = document.getElementById("vsave");
      if (btn) btn.disabled = true;
      apiPost(TIER_API, { action: "vote-official", voterId: voterId(), votes: v }).then(function (res) {
        if (btn) btn.disabled = false;
        if (res.d && res.d.ok) {
          toast("Tes votes sont enregistrés sur le site et comptés avec ceux des autres joueurs.");
          fetchLive();
        } else {
          toast("Impossible d'enregistrer tes votes pour le moment — réessaie dans un instant.");
        }
      }).catch(function () {
        if (btn) btn.disabled = false;
        toast("Connexion impossible : réessaie dans un instant.");
      });
    });
    on("vclear", "onclick", function () {
      VOTES = {}; saveVotes(); render(); toast("Votes effacés");
    });
    document.querySelectorAll("[data-lcopy]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var l = tListOf(b.dataset.lcopy); if (!l) return;
        copyText(tShareUrl(l));
        toast("Lien copié — colle-le à qui tu veux, la liste s'ouvrira toute seule.");
      };
    });
    on("tcreate", "onclick", function () { view.tcreate = !view.tcreate; view.tfold = true; render(); });
    on("tccancel", "onclick", function () { view.tcreate = false; render(); });
    on("timport", "onclick", function () {
      var t = prompt("Colle ici le lien ou le code d'une Tiers List partagée :");
      if (!t) return;
      openShared(t, true);
    });

    var f = document.getElementById("tcform");
    if (f) f.onsubmit = function (e) {
      e.preventDefault();
      var pseudo = document.getElementById("tc-p").value.trim();
      if (!pseudo) return;
      var title = document.getElementById("tc-t").value.trim() || ("Liste de " + pseudo);
      var mode = document.getElementById("tc-s").value;
      var tiers = {};
      if (mode === "copy") {
        var ranked = allScores().filter(function (r) { return isFinal(r.a); });
        var bestMap = groupBestOf(ranked);
        ranked.forEach(function (r) {
          var b = tFix()[r.a.name] ? bandByKey(tFix()[r.a.name]) : tierOf(r.s, bestMap[grpOf(r.a.role).key] || 0);
          if (b) tiers[r.a.name] = b.k;
        });
      }
      var l = { id: newListId(), pseudo: pseudo, title: title, tiers: tiers, at: Date.now() };
      tLists().push(l);
      view.tcreate = false; view.tier = "L:" + l.id;
      persist("Tiers list créée");
      render();
    };

    on("tsave", "onclick", function () {
      var l = curList(); if (!l) return;
      l.at = Date.now();
      var btn = document.getElementById("tsave");
      if (btn) { btn.disabled = true; btn.textContent = "Enregistrement…"; }
      apiPost(TIER_API, {
        action: "save-list",
        list: { id: l.id, pseudo: l.pseudo, title: l.title, tiers: l.tiers, editToken: l._tok || "" }
      }).then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; }
        if (res.d && res.d.ok) {
          if (res.d.editToken) l._tok = res.d.editToken;
          persist("Liste enregistrée");
          toast("« " + (l.title || "Ta liste") + " » est enregistrée et visible par tous sur le site.");
          fetchLive();
        } else if (res.status === 403) {
          toast("Cette liste a été créée depuis un autre navigateur : impossible de l'écraser depuis ici.");
        } else {
          persist("Liste enregistrée (hors-ligne)");
          toast("Impossible de la publier pour l'instant — elle reste dans ce navigateur. Réessaie dans un instant.");
        }
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; }
        persist("Liste enregistrée (hors-ligne)");
        toast("Connexion impossible : la liste reste dans ce navigateur pour l'instant. Réessaie plus tard pour la publier.");
      });
    });
    on("tvote", "onclick", function () {
      view.tvote = !view.tvote; view.tpick = null;
      animate = true; render(); animate = false;
    });
    document.querySelectorAll("[data-lv]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var l = curList(); if (!l) return;
        castListVote(l.id, b.dataset.lvn, b.dataset.lv);
      };
    });
    on("lvsave", "onclick", function () {
      var l = curList(); if (!l) return;
      var v = listVotes()[l.id] || {};
      if (!Object.keys(v).length) return;
      var btn = document.getElementById("lvsave");
      if (btn) btn.disabled = true;
      apiPost(TIER_API, { action: "vote-list", listId: l.id, voterId: voterId(), votes: v }).then(function (res) {
        if (btn) btn.disabled = false;
        if (res.d && res.d.ok) {
          toast("Ton avis sur « " + (l.title || "cette liste") + " » est enregistré et visible par tous.");
          fetchLive();
        } else {
          toast("Impossible d'enregistrer ton avis pour le moment — réessaie dans un instant.");
        }
      }).catch(function () {
        if (btn) btn.disabled = false;
        toast("Connexion impossible : réessaie dans un instant.");
      });
    });
    on("lvclear", "onclick", function () {
      var l = curList(); if (!l) return;
      delete listVotes()[l.id]; saveListVotes(); render(); toast("Avis effacé");
    });
    on("tshare", "onclick", function () {
      var l = curList(); if (!l) return;
      var url = tShareUrl(l);
      copyText(url);
      toast("Lien copié — colle-le à qui tu veux, la liste s'ouvrira toute seule.");
    });
    on("tdel", "onclick", function () {
      var l = curList(); if (!l) return;
      if (!confirm("Supprimer « " + (l.title || "cette liste") + " » ?")) return;
      S.tierLists = tLists().filter(function (x) { return x.id !== l.id; });
      S.tierPublic = tPublic().filter(function (x) { return x.id !== l.id; });
      view.tier = "ALL"; persist("Tiers list supprimée"); render();
      apiPost(TIER_API, { action: "delete-list", id: l.id, editToken: l._tok || "", adminPass: adminPass() })
        .then(function () { fetchLive(); }).catch(function () {});
    });
    on("tfork", "onclick", function () {
      var l = curList(); if (!l) return;
      var pseudo = prompt("Ton pseudo :", "");
      if (!pseudo) return;
      var c = { id: newListId(), pseudo: pseudo.trim(), title: (l.title || "Liste") + " (repris)",
                tiers: JSON.parse(JSON.stringify(l.tiers || {})), at: Date.now() };
      tLists().push(c); view.tier = "L:" + c.id;
      persist("Tiers list reprise"); render();
    });

    /* clic : je choisis une vignette, puis la case d'arrivée */
    document.querySelectorAll("[data-drag]").forEach(function (c) {
      c.addEventListener("click", function (e) {
        if (e.target.closest("[data-ani]")) return;
        view.tpick = view.tpick === c.dataset.drag ? null : c.dataset.drag;
        render();
      });
      c.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", c.dataset.drag);
        e.dataTransfer.effectAllowed = "move";
        c.classList.add("dragging");
      });
      c.addEventListener("dragend", function () { c.classList.remove("dragging"); });
    });
    document.querySelectorAll("[data-drop]").forEach(function (cell) {
      cell.addEventListener("dragover", function (e) { e.preventDefault(); cell.classList.add("over"); });
      cell.addEventListener("dragleave", function () { cell.classList.remove("over"); });
      cell.addEventListener("drop", function (e) {
        e.preventDefault(); cell.classList.remove("over");
        var n = e.dataTransfer.getData("text/plain");
        if (n) placeIn(n, cell.dataset.drop);
      });
      cell.addEventListener("click", function (e) {
        if (!view.tpick || e.target.closest(".tcard")) return;
        placeIn(view.tpick, cell.dataset.drop);
      });
    });
  }

  function copyText(t) {
    try {
      if (navigator.clipboard) { navigator.clipboard.writeText(t); return; }
    } catch (e) {}
    var ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  /* ouvrir une liste reçue par lien ou par code */
  function openShared(txt, go) {
    var d;
    try { d = tDec(txt); } catch (e) { toast("Ce code ne correspond à aucune Tiers List."); return; }
    if (!d || typeof d !== "object" || !d.x) { toast("Ce code ne correspond à aucune Tiers List."); return; }
    var l = { id: newListId(), pseudo: d.p || "anonyme", title: d.t || "Liste partagée",
              tiers: d.x, shared: true, at: Date.now() };
    tLists().push(l);
    view.tier = "L:" + l.id; view.tab = "tiers"; view.tcreate = false; view.tfold = true;
    persist("Tiers list partagée ouverte");
    if (go) { render(); window.scrollTo(0, 0); }
  }

  /* ---------------- interactions ---------------- */
  function on(id, ev, fn) { var el = document.getElementById(id); if (el) el[ev] = fn; }

  function wire() {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.tab;
        if (t === "puissance" && view.tab !== "puissance") { view.sort = "score"; view.dir = -1; }
        /* la liste complète se lit dans l'ordre du jeu, par numéro */
        if (t === "tous" && view.tab !== "tous") { view.sort = "no"; view.dir = 1; }
        else if (t !== "puissance" && view.tab === "puissance") { view.sort = "atk"; view.dir = -1; }
        /* Informations : toujours revenir sur le premier sous-onglet (Raretés) en y entrant */
        if (t === "informations" && view.tab !== "informations") view.infoTag = "raretes";
        view.tab = t; animate = true; devOpening = t === "accueil"; render(); animate = false; devOpening = false; window.scrollTo(0, 0);
        /* changement de catégorie = petite vérification en arrière-plan qu'il n'y a
           pas eu de publication plus récente entre-temps, sans jamais bloquer/ralentir
           la navigation (la page a déjà changé au-dessus, avant même cet appel) */
        fetchPublished(); fetchLive();
      };
    });
    document.querySelectorAll("th[data-sort]").forEach(function (h) {
      h.onclick = function () {
        var k = h.dataset.sort;
        if (view.sort === k) view.dir = -view.dir;
        else { view.sort = k; view.dir = ["name", "no", "elem", "role", "type", "job"].indexOf(k) >= 0 ? 1 : -1; }
        render();
      };
    });
    var q = document.getElementById("q");
    if (q) q.oninput = function () {
      view.q = q.value; var pos = q.selectionStart; render();
      var nq = document.getElementById("q");
      if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {} }
    };
    [["fe", "elem"], ["fr", "role"], ["fj", "job"], ["ft", "type"]].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.onchange = function () { view[p[1]] = el.value; render(); };
    });
    on("fs", "onchange", function () {
      view.sort = this.value; view.dir = this.value === "name" ? 1 : -1; render();
    });
    on("reset", "onclick", function () { view.q = ""; view.elem = ""; view.role = ""; view.job = ""; view.type = ""; render(); });

    document.querySelectorAll("[data-pin]").forEach(function (b) {
      b.onclick = function () {
        var n = b.dataset.pin, p = pins(), i = p.indexOf(n);
        if (i >= 0) p.splice(i, 1); else p.push(n);
        render();
      };
    });
    document.querySelectorAll("[data-btype]").forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.btype;
        view.bossType = view.bossType === t ? "" : t;
        var cur = bossOf(view.boss);
        if (cur && view.bossType && cur.type !== view.bossType) view.boss = "";
        render();
      };
    });
    /* un nom conseillé se pose dans la première case libre */
    document.querySelectorAll("[data-sugg]").forEach(function (b) {
      b.onclick = function () {
        var n = b.dataset.sugg;
        if (view.teamSlots.indexOf(n) >= 0) return;
        var i = view.teamSlots.indexOf("");
        if (i < 0) i = 3;
        view.teamSlots[i] = n;
        animate = true; render(); animate = false;
        toast(n + " ajouté à l'équipe");
      };
    });
    document.querySelectorAll("[data-infotag]").forEach(function (b) {
      b.onclick = function () {
        view.infoTag = b.dataset.infotag;
        animate = true; render(); animate = false;
      };
    });
    document.querySelectorAll("[data-scrollto]").forEach(function (b) {
      b.onclick = function () {
        var el = document.getElementById(b.dataset.scrollto);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
    document.querySelectorAll("[data-etinfo]").forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var k = b.dataset.etinfo;
        view.etInfoOpen = view.etInfoOpen === k ? null : k;
        render();
      };
    });
    document.querySelectorAll("[data-eleminfo]").forEach(function (b) {
      b.onclick = function () {
        view.elemInfo = b.dataset.eleminfo;
        animate = true; render(); animate = false;
      };
    });
    document.querySelectorAll("[data-dev]").forEach(function (b) {
      b.onclick = function () {
        view.devOpen = parseInt(b.dataset.dev, 10);
        devOpening = true; render(); devOpening = false;
      };
    });
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.onclick = function () {
        view.teamMode = b.dataset.mode;
        animate = true; render(); animate = false;
      };
    });
    document.querySelectorAll("[data-popen]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.dataset.popen;
        view.openPicker = view.openPicker === id ? null : id;
        view.pickerQ = "";
        render();
        var q = document.querySelector(".apickq");
        if (q) q.focus();
      };
    });
    document.querySelectorAll("[data-pchoose]").forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.pchoose, v = b.dataset.pval;
        if (id === "tmain") view.teamMain = v;
        else if (id === "boss") view.boss = v;
        else if (id === "admain") aTeam().main = v;
        else if (id.indexOf("adp") === 0) aTeam().pinned[+id.slice(3)] = v;
        else if (id.indexOf("bt") === 0) { setBossTeam(id.slice(2), v); persist("Équipe par élément mise à jour"); }
        else if (id.indexOf("ba") === 0) { setBossAlt(id.slice(2), v); persist("Remplaçant mis à jour"); }
        else view.teamSlots[+id.slice(2)] = v;
        view.openPicker = null; view.pickerQ = "";
        render();
      };
    });
    var pq = document.querySelector(".apickq");
    if (pq) pq.oninput = function () {
      view.pickerQ = pq.value; var pos = pq.selectionStart; render();
      var n = document.querySelector(".apickq");
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
    };
    if (view.openPicker) {
      document.onclick = function (ev) {
        if (!ev.target.closest || !ev.target.closest(".apick")) {
          view.openPicker = null; document.onclick = null; render();
        }
      };
    } else { document.onclick = null; }

    document.querySelectorAll("[data-ani]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation(); view.detail = b.dataset.ani;
        detailOpening = true; render(); detailOpening = false;
      };
    });
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.onclick = closeDetail;
    });
    document.querySelectorAll("[data-tier]").forEach(function (b) {
      b.onclick = function () {
        view.tier = b.dataset.tier; view.tcreate = false; view.tpick = null;
        animate = true; render(); animate = false;
      };
    });
    wireTier();
    document.querySelectorAll("[data-abil]").forEach(function (b) {
      b.onclick = function () { view.abil = b.dataset.abil; animate = true; render(); animate = false; };
    });
    var lf = document.getElementById("lockf");
    if (lf) lf.onsubmit = function (e) {
      e.preventDefault();
      var v = document.getElementById("lockpw").value;
      var msg = document.getElementById("lockmsg");
      sha256(v).then(function (hx) {
        if (hx && hx === S.meta.adminHash) {
          adminOK = true;
          try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch (e2) {}
          render();
        } else if (msg) msg.textContent = "Phrase incorrecte.";
      });
    };
    on("setpw", "onclick", function () {
      var a = document.getElementById("pw1").value, b2 = document.getElementById("pw2").value;
      if (a.length < 6) { toast("Choisis une phrase d'au moins 6 caractères."); return; }
      if (a !== b2) { toast("Les deux phrases ne correspondent pas."); return; }
      sha256(a).then(function (hx) {
        if (!hx) { toast("Ce navigateur ne sait pas chiffrer la phrase (page ouverte en local ?)."); return; }
        S.meta = S.meta || {}; S.meta.adminHash = hx;
        adminOK = true;
        try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch (e) {}
        persist("Phrase de passe enregistrée"); render();
      });
    });
    on("clearpw", "onclick", function () {
      if (!confirm("Retirer le verrou ? Le panneau sera ouvert à tous.")) return;
      if (S.meta) delete S.meta.adminHash;
      persist("Verrou retiré"); render();
    });

    document.querySelectorAll("[data-asec]").forEach(function (b) {
      b.onclick = function () { view.adminSec = b.dataset.asec; render(); };
    });
    document.querySelectorAll("[data-pick]").forEach(function (b) {
      b.onclick = function () { view.pick = b.dataset.pick; render(); };
    });

    var af = document.getElementById("anif");
    if (af) {
      af.onsubmit = function (e) { e.preventDefault(); saveAni(); };
      on("addskill", "onclick", function () { addSkillRow("", ""); });
      on("delani", "onclick", function () {
        if (!confirm("Supprimer " + view.pick + " ?")) return;
        S.aniimos = S.aniimos.filter(function (a) { return a.name !== view.pick; });
        view.pick = null; persist("Aniimo supprimé"); render();
      });
      on("pickimg", "onclick", function () {
        readImage(function (uri) {
          document.getElementById("a-img").value = uri;
          document.getElementById("preview").innerHTML =
            '<img class="ico" src="' + uri + '" alt="" style="width:52px;height:52px">';
        });
      });
      on("clearimg", "onclick", function () { document.getElementById("a-img").value = ""; });
    }
    on("addani", "onclick", function () {
      var n = prompt("Nom du nouvel Aniimo ?");
      if (!n) return;
      n = n.trim();
      if (!n) return;
      if (findAni(n)) { toast("Ce nom existe déjà."); return; }
      function create(img) {
        S.aniimos.push({ no: "000", name: n, elems: ["Feu"], role: "DPS", jobs: [], jobLevel: null,
          type: "Physique", typeGuess: false, typeNote: "", specs: [], img: img || "",
          hp: 80, atk: 80, pdef: 60, mdef: 60, brk: 50, regen: 70, trait: "", traitFr: "", skills: [] });
        view.pick = n; view.q = "";
        persist(img ? "Aniimo créé avec son icône" : "Aniimo créé — ajoute son icône dans la fiche");
        render();
      }
      if (confirm("Choisir une icône pour " + n + " maintenant ?\n\nOK : choisir un fichier image.\nAnnuler : créer sans icône, tu pourras l'ajouter après.")) {
        readImage(function (uri) { create(uri); });
      } else create("");
    });

    on("savespecs", "onclick", function () {
      document.querySelectorAll("#spectable .speceditrow").forEach(function (tr) {
        var sp = S.specs[+tr.dataset.spec];
        tr.querySelectorAll("[data-k]").forEach(function (i) { sp[i.dataset.k] = i.value; });
      });
      persist("Spécialités enregistrées"); render();
    });
    document.querySelectorAll("[data-spicon]").forEach(function (b) {
      b.onclick = function () {
        var i = +b.dataset.spicon;
        readImage(function (uri) {
          S.specs[i].img = uri;
          var im = document.getElementById("spimg" + i); if (im) im.src = uri;
          persist("Icône remplacée");
        }, 48);
      };
    });
    document.querySelectorAll("[data-jbdel]").forEach(function (b) {
      b.onclick = function () {
        var j = S.jobs[+b.dataset.jbdel];
        var used = S.aniimos.filter(function (a) { return (a.jobs || []).indexOf(j.key) >= 0; }).length;
        if (!confirm("Supprimer le métier « " + j.name + " » ?" +
          (used ? "\nIl sera retiré de " + used + " Aniimo." : ""))) return;
        S.jobs.splice(+b.dataset.jbdel, 1);
        S.aniimos.forEach(function (a) {
          a.jobs = (a.jobs || []).filter(function (k) { return k !== j.key; });
          if (!a.jobs.length) { a.jobLevel = null; return; }
          var jlMax = Math.max.apply(null, a.jobs.map(function (k) {
            var jj = jobOf(k); return jj ? jj.max : 0;
          }));
          if (a.jobLevel > jlMax) a.jobLevel = jlMax;
        });
        persist("Métier supprimé"); render();
      };
    });
    on("addjob", "onclick", function () {
      var n = prompt("Nom du nouveau métier ?");
      if (!n) return;
      var key = slug(n);
      if (jobOf(key)) { toast("Ce métier existe déjà."); return; }
      S.jobs.push({ key: key, name: n, en: n, icon: "🔧", color: "#7A7A85",
        rank: S.jobs.length + 1, max: 1, rate: 60, desc: "" });
      persist("Métier ajouté"); render();
    });
    on("savejobs", "onclick", function () {
      document.querySelectorAll("#jobtable tbody tr").forEach(function (tr) {
        var j = S.jobs[+tr.dataset.job];
        tr.querySelectorAll("[data-k]").forEach(function (i) {
          var k = i.dataset.k;
          j[k] = (k === "rank" || k === "max" || k === "rate") ? +i.value : i.value;
        });
      });
      S.aniimos.forEach(function (a) {
        if (!a.jobs || !a.jobs.length) { a.jobLevel = null; return; }
        var jlMax = Math.max.apply(null, a.jobs.map(function (k) {
          var j = jobOf(k); return j ? j.max : 0;
        }));
        if (a.jobLevel > jlMax) a.jobLevel = jlMax;
      });
      persist("Métiers enregistrés"); render();
    });
    on("saveteam", "onclick", function () {
      var T = aTeam();
      S.team = S.team || {};
      S.team.main = T.main;
      S.team.pinned = T.pinned.filter(Boolean);
      view.teamMain = S.team.main;
      view.pins = S.team.pinned.slice();
      persist("Équipe par défaut enregistrée"); render();
    });
    on("clearteam", "onclick", function () { aTeam().pinned = ["", "", ""]; render(); });

    on("saveetteams", "onclick", function () {
      var T = elemTeams();
      document.querySelectorAll("[data-etnote]").forEach(function (el) {
        var e = el.dataset.etnote;
        T[e] = T[e] || { members: ["", "", "", ""], note: "" };
        T[e].note = el.value.trim();
      });
      document.querySelectorAll("[data-etaltd]").forEach(function (el) {
        var p2 = el.dataset.etaltd.split(":"), e = p2[0], i = +p2[1];
        T[e] = T[e] || { members: ["", "", "", ""], note: "" };
        T[e].alts = T[e].alts || [];
        while (T[e].alts.length < 4) T[e].alts.push({ n: "", d: "" });
        T[e].alts[i].d = el.value.trim();
      });
      Object.keys(T).forEach(function (e) {
        var t = T[e];
        var m = (t.members || []).filter(Boolean);
        var a = (t.alts || []).filter(function (x) { return x && (x.n || x.d); });
        if (!m.length && !a.length && !t.note && !t.lead && !(t.points || []).length && !t.risk) delete T[e];
      });
      persist("Équipes par élément enregistrées"); render();
    });
    document.querySelectorAll("[data-etclear]").forEach(function (b) {
      b.onclick = function () {
        var e = b.dataset.etclear, T = elemTeams();
        if (T[e]) { T[e].members = ["", "", "", ""]; T[e].alts = []; }
        persist("Équipe vidée"); render();
      };
    });
    document.querySelectorAll("[data-etauto]").forEach(function (b) {
      b.onclick = function () {
        var e = b.dataset.etauto, a = autoElemTeam(e), T = elemTeams();
        if (!a) { toast("Impossible de calculer une équipe pour " + e + "."); return; }
        T[e] = T[e] || { note: "" };
        T[e].members = a.members.slice(0, 4);
        persist("Équipe reprise du calcul"); render();
      };
    });

    on("savefx", "onclick", function () {
      S.pageEffects = S.pageEffects || {};
      document.querySelectorAll("#fxtable tbody tr").forEach(function (tr) {
        var k = tr.dataset.page, cur = S.pageEffects[k] || {};
        tr.querySelectorAll("[data-fk]").forEach(function (sel) { cur[sel.dataset.fk] = sel.value; });
        S.pageEffects[k] = cur;
      });
      persist("Effets enregistrés"); render();
    });
    on("fxnone", "onclick", function () {
      S.pageEffects = S.pageEffects || {};
      effectPages().forEach(function (p) {
        S.pageEffects[p.key] = { fx: "none", sp: (S.pageEffects[p.key] || {}).sp || "mid" };
      });
      persist("Tous les effets coupés"); render();
    });
    document.querySelectorAll("[data-fxgo]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.fxgo, tr = b.closest("tr");
        S.pageEffects = S.pageEffects || {};
        var cur = S.pageEffects[k] || {};
        tr.querySelectorAll("[data-fk]").forEach(function (sel) { cur[sel.dataset.fk] = sel.value; });
        S.pageEffects[k] = cur;
        view.tab = k; animate = true; render(); animate = false; window.scrollTo(0, 0);
      };
    });
    on("savebosses", "onclick", function () {
      document.querySelectorAll("#bosstable tbody tr").forEach(function (tr) {
        var b = S.bosses[+tr.dataset.boss];
        tr.querySelectorAll("[data-k]").forEach(function (i) { b[i.dataset.k] = i.value; });
      });
      persist("Boss enregistrés"); render();
    });
    document.querySelectorAll("[data-bodel]").forEach(function (b) {
      b.onclick = function () {
        var bo = S.bosses[+b.dataset.bodel];
        if (!confirm("Supprimer le boss « " + bo.name + " » ?")) return;
        if (view.boss === bo.key) view.boss = "";
        S.bosses.splice(+b.dataset.bodel, 1);
        persist("Boss supprimé"); render();
      };
    });
    on("addboss", "onclick", function () {
      S.bosses = S.bosses || [];
      S.bosses.unshift({ key: "boss-" + Date.now().toString(36), name: "Nouveau boss",
        type: (S.bossTypes[0] || {}).key || "alpha", elem: "Feu", note: "" });
      view.q = "";
      persist("Boss ajouté — renseigne son nom, son type et son élément"); render();
      var f = document.querySelector('#bosstable tbody tr [data-k="name"]');
      if (f) { f.focus(); f.select(); }
    });
    on("publish", "onclick", publish);
    on("exportjson", "onclick", exportJson);
    on("importjson", "onclick", importJson);
    on("unpublish", "onclick", unpublishSite);
    on("revert", "onclick", function () {
      if (!confirm("Abandonner le brouillon local et revenir à la version publiée ?")) return;
      S = JSON.parse(RAW); draftLoaded = false;
      if (LAST_PUBLISHED) applyPublished(LAST_PUBLISHED);
      try { localStorage.removeItem("aniimo.draft"); } catch (e) {}
      toast("Brouillon abandonné"); render();
    });
  }

  function readImage(cb, size) {
    size = size || 64;
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () {
          var c = document.createElement("canvas");
          var r = Math.min(size / im.width, size / im.height, 1);
          c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          cb(c.toDataURL("image/webp", 0.8));
        };
        im.onerror = function () { toast("Image illisible."); };
        im.src = fr.result;
      };
      fr.readAsDataURL(f);
    };
    inp.click();
  }

  function fillForm() {
    var a = findAni(view.pick); if (!a) return;
    var g = function (id) { return document.getElementById(id); };
    if (g("a-e1")) g("a-e1").value = a.elems[0] || "Feu";
    if (g("a-e2")) g("a-e2").value = a.elems[1] || "";
    if (g("a-role")) g("a-role").value = a.role;
    if (g("a-type")) g("a-type").value = a.type || "n.c.";
    document.querySelectorAll("[data-job]").forEach(function (c) {
      c.checked = (a.jobs || []).indexOf(c.dataset.job) >= 0;
    });
    if (g("a-joblevel")) g("a-joblevel").value = a.jobLevel || "";
    var box = document.getElementById("skills");
    if (box) { box.innerHTML = ""; (a.skills || []).forEach(function (s) { addSkillRow(s.n, s.m); }); }
  }
  function addSkillRow(n, m) {
    var box = document.getElementById("skills"); if (!box) return;
    var d = document.createElement("div");
    d.className = "skillrow";
    d.innerHTML = '<input placeholder="Nom de la compétence" value="' + esc(n) + '">' +
      '<input type="number" placeholder="Puissance" value="' + esc(m) + '">' +
      '<button type="button" class="btn" title="Retirer">✕</button>';
    d.querySelector("button").onclick = function () { d.remove(); };
    box.appendChild(d);
  }
  function saveAni() {
    var a = findAni(view.pick); if (!a) return;
    var g = function (id) { return document.getElementById(id); };
    var newName = g("a-name").value.trim() || a.name;
    a.no = g("a-no").value.trim();
    a.name = newName;
    a.elems = [g("a-e1").value].concat(g("a-e2").value ? [g("a-e2").value] : []);
    a.role = g("a-role").value;
    a.type = g("a-type").value;
    delete a.specs; delete a.spec;
    a.img = g("a-img").value.trim();
    a.typeNote = g("a-note").value;
    a.traitFr = g("a-trait").value;
    ["hp", "atk", "pdef", "mdef", "brk", "regen"].forEach(function (k) { a[k] = +g("a-" + k).value || 0; });
    a.jobs = [];
    document.querySelectorAll("[data-job]").forEach(function (c) { if (c.checked) a.jobs.push(c.dataset.job); });
    a.jobs.sort(function (x, y) {
      if (x === "parfumerie") return -1; if (y === "parfumerie") return 1;
      return (jobOf(x) ? jobOf(x).rank : 9) - (jobOf(y) ? jobOf(y).rank : 9);
    });
    if (!a.jobs.length) {
      a.jobLevel = null;
    } else {
      var jlMax = Math.max.apply(null, a.jobs.map(function (k) { var j = jobOf(k); return j ? j.max : 0; }));
      var jlVal = +g("a-joblevel").value || 0;
      a.jobLevel = jlVal > 0 ? Math.min(jlVal, jlMax) : jlMax;
    }
    a.skills = [];
    document.querySelectorAll("#skills .skillrow").forEach(function (r) {
      var ins = r.querySelectorAll("input");
      if (ins[0].value.trim()) a.skills.push({ n: ins[0].value.trim(), m: +ins[1].value || 0 });
    });
    a.skills.sort(function (x, y) { return y.m - x.m; });
    view.pick = newName;
    persist("Fiche enregistrée"); render();
  }

  function persist(msg) {
    draftLoaded = true;
    try { localStorage.setItem("aniimo.draft", JSON.stringify(S)); } catch (e) {
      toast("Brouillon trop lourd pour le navigateur — exporte le JSON pour ne rien perdre."); return;
    }
    toast(msg + " — brouillon local");
  }
  var toastT;
  function toast(msg) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var d = document.createElement("div");
    d.className = "toast"; d.setAttribute("role", "status"); d.textContent = msg;
    document.body.appendChild(d);
    clearTimeout(toastT);
    toastT = setTimeout(function () { d.remove(); }, 3200);
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    var u = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = u;
    a.download = "state.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
    toast("state.json téléchargé.");
  }
  function importJson() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var o = JSON.parse(fr.result);
          if (!o.aniimos || !o.jobs) throw new Error("format");
          S = o; persist("JSON importé"); render();
        } catch (e) { toast("Fichier illisible : il faut un JSON exporté depuis cette page."); }
      };
      fr.readAsText(f);
    };
    inp.click();
  }

  function renderDoc(state) {
    var css = document.getElementById("appcss").textContent;
    var js = document.getElementById("appjs").textContent;
    var json = JSON.stringify(state).replace(/</g, "\\u003c");
    var st = "scr" + "ipt";
    return '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Aniimo France</title>\n' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">\n' +
      '<style id="appcss">' + css + "</style>\n</head>\n<body>\n<div id=\"app\"></div>\n" +
      "<" + st + ' type="application/json" id="state">' + json + "</" + st + ">\n" +
      "<" + st + ' id="appjs">' + js + "</" + st + ">\n</body>\n</html>";
  }

  function publish() {
    var btn = document.getElementById("publish");
    if (btn) { btn.disabled = true; btn.textContent = "Publication…"; }
    if (window.claude && window.claude.use) {
      /* ancien mécanisme : version hébergée sur claude.ai (artifact) */
      window.claude.use("artifact")
        .then(function (api) {
          if (!api) throw { code: "not_granted" };
          return api.publish(renderDoc(S));
        })
        .then(function () {
          try { localStorage.removeItem("aniimo.draft"); } catch (e) {}
          toast("Publié — la page est à jour pour tout le monde.");
          if (btn) { btn.disabled = false; btn.textContent = "Publier"; }
        })
        .catch(function (err) {
          var code = (err && err.code) || "upstream_error";
          var msg = {
            conflict: "Quelqu'un a publié entre-temps : la page se recharge sur sa version. Ton brouillon local est conservé.",
            not_writer: "Cette vue est en lecture seule : seul le propriétaire du lien peut publier. Exporte le JSON pour lui transmettre tes changements.",
            not_granted: "La publication n'est pas disponible depuis cette vue. Tes changements restent en brouillon local — utilise « Exporter le JSON ».",
            capability_disabled: "La publication n'est pas disponible ici. Tes changements restent en brouillon local.",
            not_declared: "La publication a été retirée de cette page. Tes changements restent en brouillon local.",
            too_large: "La page est trop lourde pour être publiée. Allège les icônes, puis réessaie.",
            rate_limited: "Trop de publications d'affilée. Attends une minute, puis réessaie."
          }[code] || "La publication a échoué. Tes changements restent en brouillon local ; réessaie dans un instant.";
          toast(msg);
          if (btn) { btn.disabled = false; btn.textContent = "Publier"; }
        });
      return;
    }
    /* mécanisme réel du site déployé : fonction Netlify + Netlify Blobs, en direct
       pour tout le monde, sans reconstruction ni redéploiement */
    apiPost(SITE_API, { action: "publish", data: publishPayload(), adminPass: adminPass() })
      .then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = "Publier"; }
        if (res.status === 200 && res.d && res.d.ok) {
          PUBLISHED_AT = res.d.publishedAt || Date.now();
          LAST_PUBLISHED = publishPayload();
          try { localStorage.removeItem("aniimo.draft"); } catch (e) {}
          draftLoaded = false;
          toast("Publié — le site est à jour pour tout le monde, en direct.");
          render();
        } else if (res.status === 403) {
          toast("Mot de passe admin invalide ou expiré — reconnecte-toi au panneau admin puis réessaie.");
        } else if (res.status === 413) {
          toast("Trop volumineux pour être publié en direct — vérifie qu'aucune image n'est incluse, puis réessaie.");
        } else {
          toast("La publication a échoué. Tes changements restent en brouillon local ; réessaie dans un instant.");
        }
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = "Publier"; }
        toast("Connexion impossible : la publication a échoué. Réessaie dans un instant.");
      });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && view.detail) closeDetail();
  });

  if (S.team && S.team.main) view.teamMain = S.team.main;
  restoreView();
  /* le panneau admin est masqué du menu : #admin l'ouvre */
  function openByHash(go) {
    if (!/^#admin/.test(location.hash || "")) return false;
    view.tab = "admin";
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (go) render();
    return true;
  }
  openByHash(false);
  /* ajouter #admin sans recharger doit marcher aussi */
  window.addEventListener("hashchange", function () { openByHash(true); });
  /* une Tiers List reçue par lien s'ouvre directement */
  if (/^#liste=/.test(location.hash || "")) {
    try { openShared(location.hash, false); } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  /* premier affichage : on joue l'effet de la catégorie, comme à l'arrivée
     sur celle-ci — c'est ce qu'on attend après un rafraîchissement. */
  animate = true; devOpening = view.tab === "accueil"; render(); animate = false; devOpening = false;
  /* on va chercher les listes et votes sauvegardés en ligne (fonctions Netlify) */
  fetchLive();
  /* on va chercher la dernière version publiée en direct (si aucun brouillon local) */
  fetchPublished();
})();
