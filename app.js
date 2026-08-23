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
     "evoLines", "elemTeams"].forEach(function (k) {
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
      (a.typeNote ? ' title="' + esc(a.typeNote) + '"' : "") + ">" + esc(a.type) +
      (a.typeGuess ? " ?" : "") + "</span>";
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
    var list = S.aniimos.filter(function (a) { return a.role === role; });
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
    tab: "tous", q: "", elem: "", role: "", job: "", type: "", sort: "atk", dir: -1, pick: null,
    teamMode: "auto", teamMain: "Fulmintis", teamSlots: ["", "", "", ""], adminSec: "aniimo",
    tcreate: false, tpick: null, tfold: false,
    openPicker: null, pickerQ: "", boss: "", bossType: "", pins: null, abil: "homeland", tier: "DPS", detail: null
  };

  var TABS = [
    { id: "tous", label: "Tous les Aniimos", kind: "roster", grp: "Fiches" },
    { id: "puissance", label: "Les compétences", kind: "power", grp: "Fiches" },
    { id: "abilites", label: "Abilités", kind: "abil", grp: "Fiches" },
    { id: "metiers", label: "Métiers Aniimo", kind: "jobs", grp: "Fiches" },
    { id: "team", label: "Team", kind: "team", grp: "Fiches" },
    { id: "tiers", label: "Tiers List", kind: "tier", grp: "Fiches" },
    { id: "admin", label: "Panneau admin", kind: "admin", grp: "Gestion" }
  ];
  function tabOf(id) { for (var i = 0; i < TABS.length; i++) if (TABS[i].id === id) return TABS[i]; return TABS[0]; }

  function rows(tab) {
    var list = S.aniimos.slice();
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
    var tps = ["Physique", "Magique", "Soin"].map(function (t) { return '<option value="' + t + '"' + (view.type === t ? " selected" : "") + ">" + t + "</option>"; }).join("");
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
    var maxAtk = Math.max.apply(null, S.aniimos.map(function (a) { return a.atk; }));
    var maxTot = Math.max.apply(null, S.aniimos.map(total));
    var h = '<div class="head"><h1>Tous les Aniimos</h1><span class="count">' + list.length + " / " + S.aniimos.length + "</span></div>" +
      toolbar({}) + '<div class="tablewrap"><table class="tight roster' + animClass() + '"><thead><tr>' +
      '<th class="w-rank">#</th><th class="w-ico"></th>' + th("N°", "no", "w-no") + th("Nom", "name", "w-nm") +
      th("Élément", "elem") + th("Rôle", "role") + th("Métier", "job") + th("Type", "type") +
      th("ATK", "atk", "num") + th("PV", "hp", "num") + th("D.P", "pdef", "num") +
      th("D.M", "mdef", "num") + th("BRK", "brk", "num") + th("RGN", "regen", "num") +
      th("Total", "total", "num") + "</tr></thead><tbody>";
    list.forEach(function (a, i) {
      h += '<tr class="fxi" style="--i:' + Math.min(i, 26) + '">' +
        '<td class="rank">' + (i + 1) + "</td><td>" + aniLink(a, icon(a)) + '</td><td class="no">' + esc(a.no) + "</td>" +
        '<td class="nm">' + aniLink(a, esc(a.name)) + "</td><td>" + a.elems.map(elemChip).join(" ") + "</td>" +
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
    ["dmg", "Dégâts du meilleur coup"], ["atk", "ATK"], ["name", "Nom"]];

  function viewPower() {
    if (["score", "best", "dmg", "atk", "name"].indexOf(view.sort) < 0) { view.sort = "score"; view.dir = -1; }
    var list = rows(null);
    var maxScore = Math.max.apply(null, S.aniimos.map(score));
    var h = '<div class="head"><h1>Les compétences</h1><span class="count">' + list.length + " / " +
      S.aniimos.length + "</span></div>" +
      '<p class="sub">Score = somme des 3 compétences les plus puissantes (valeur « Might » du jeu). « Dégâts du meilleur coup » = ATK × puissance de la meilleure compétence : ce que l\'Aniimo place réellement en un coup.</p>' +
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
        '<div class="pi"><b>' + aniLink(a, esc(a.name)) + '</b><div class="chips">' + a.elems.map(elemChip).join(" ") +
        roleChip(a.role) + typeChip(a) + "</div></div></div>" +
        '<div class="powstats">' +
        '<div><span class="lbl">Score</span><b>' + score(a) + "</b></div>" +
        '<div><span class="lbl">ATK</span><b>' + a.atk + "</b></div>" +
        '<div><span class="lbl">Meilleur coup</span><b>' + hit(a) + "</b></div></div>" +
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
    list.forEach(function (s) {
      h += '<div class="skrow"><div class="skmain">' + skIcon(s.t, skKey(a.name, s.n), s.n) +
        '<div class="skname"><b>' + esc(s.nf || s.n) + "</b>" +
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
    var maxes = { hp: 0, atk: 0, pdef: 0, mdef: 0, brk: 0, regen: 0, total: 0, hit: 0 };
    S.aniimos.forEach(function (x) {
      Object.keys(maxes).forEach(function (k) { if (x[k] > maxes[k]) maxes[k] = x[k]; });
      if (total(x) > maxes.total) maxes.total = total(x);
      if (hit(x) > maxes.hit) maxes.hit = hit(x);
    });
    var rc = (S.roles[a.role] || {}).color || "#888";

    /* place dans le classement de son rôle, sur les formes finales comme la Tiers List */
    var ranked = roleScores(a.role).filter(function (r) { return isFinal(r.a); }), pos = 0, sc = null;
    ranked.forEach(function (r, i) { if (r.a.name === a.name) { pos = i + 1; sc = r; } });
    var band = sc && ranked.length ? tierOf(sc.s, ranked[0].s) : null;
    var evoTxt = isFinal(a) ? "Forme finale"
      : "Évolue en " + (a.evo || []).join(" ou ");

    var h = '<div class="dlg-back" data-close="1"></div><div class="dlgwrap">' +
      '<div class="dlg" role="dialog" aria-modal="true" aria-label="' +
      esc(a.name) + '"><button class="dlgx" data-close="1" aria-label="Fermer">✕</button>' +
      '<div class="dlghead">' + icon(a, 92) +
      '<div><div class="no">N° ' + esc(a.no) + "</div><h2>" + esc(a.name) + "</h2>" +
      '<div class="chips">' + a.elems.map(elemChip).join(" ") + roleChip(a.role) + typeChip(a) +
      jobChips(a) + "</div>" +
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
      statRow("Meilleur coup", hit(a), maxes.hit, "#D2453F") +
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
    var h = '<aside class="dlgside" aria-label="Équipes de ' + esc(a.name) + '">' +
      '<div class="dsh"><b>Ses équipes</b><span>compositions conseillées par élément</span></div>' +
      '<div class="dsbody">';

    if (!found.length) {
      h += '<p class="dsnone">' + esc(a.name) +
        " ne figure dans aucune des compositions conseillées. Voici celle qu'il affrontera " +
        "s'il croise un boss de son propre élément.</p>";
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
          aniLink(x, icon(x, 34)) + "<b>" + aniLink(x, esc(x.name)) + "</b>" +
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
      (cur.note ? goldNote("Attention", cur.note) : "");
    if (!cur.items.length) {
      return h + '<div class="card"><h3>Rien pour le moment</h3>' +
        "<p>Cette catégorie attend ses abilités : envoie-moi les fiches du jeu et je les ajoute ici, " +
        "dans la même présentation que « HomeLand ».</p></div>";
    }
    h += '<div class="grid cards2' + animClass() + '">';
    cur.items.forEach(function (p, pi) {
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
  function viewJobs() {
    var counts = {}, none = 0;
    S.jobs.forEach(function (j) { counts[j.key] = 0; });
    S.aniimos.forEach(function (a) {
      if (!a.jobs || !a.jobs.length) { none++; return; }
      a.jobs.forEach(function (k) { if (counts[k] != null) counts[k]++; });
    });
    var sorted = S.jobs.slice().sort(function (a, b) { return a.rank - b.rank; });
    var h = '<div class="head"><h1>Métiers Aniimo</h1><span class="count">' + S.jobs.length + " métiers</span></div>" +
      '<p class="sub">Classés par niveau maximum atteint puis par rendement. Chaque métier a sa couleur et son pictogramme, repris partout ailleurs.</p>' +
      '<div class="grid cards4' + animClass() + '">';
    sorted.forEach(function (j, ji) {
      h += '<div class="card jobcard fxi" style="--i:' + ji + '"><div class="badge" style="background:' + j.color + '">' +
        jobIcon(j, 30) + "</div>" +
        "<div><h3>" + esc(j.name) + "</h3>" +
        (j.excl ? '<div class="lbl"><span class="excl">' + esc(j.excl) + "</span></div>" : "") +
        "<p>" + esc(j.desc) + "</p>" +
        '<dl class="kv"><dt>Rang</dt><dd>' + j.rank + " / " + S.jobs.length + "</dd>" +
        "<dt>Niveau max</dt><dd><b>Lv." + j.max + "</b></dd>" +
        "<dt>Rendement</dt><dd>" + j.rate + "/min" +
        (j.rate > 60 ? ' <span class="rank">+' + Math.round((j.rate / 60 - 1) * 100) + "%</span>" : "") + "</dd>" +
        "<dt>Aniimo</dt><dd>" + counts[j.key] + "</dd></dl></div></div>";
    });
    h += '<div class="card jobcard fxi" style="--i:5"><div class="badge" style="background:var(--surface-2);color:var(--muted)">∅</div><div>' +
      "<h3>Aucun métier</h3><p>Le métier est un attribut que tous les Aniimo n'ont pas : ceux-là sont purement des combattants.</p>" +
      '<dl class="kv"><dt>Aniimo</dt><dd>' + none + "</dd></dl></div></div></div>";

    h += '<h2 class="sec">Spécialités du Foyer</h2>' +
      '<p class="sub">Chaque élément donne accès à des installations différentes. Un Aniimo apporte la spécialité de son ou ses éléments.</p>' +
      '<div class="grid cards3' + animClass() + '">';
    (S.specs || []).forEach(function (sp, si) {
      var n = S.aniimos.filter(function (a) { return specsOf(a).indexOf(sp.name) >= 0; }).length;
      h += '<div class="card speccard fxi" style="--i:' + si + '">' +
        '<div class="spechead"><span class="specbadge" style="background:' + sp.color + '">' +
        (sp.img ? '<img src="' + sp.img + '" alt="">' : "") + "</span>" +
        "<div><b>" + esc(sp.name) + '</b><div class="rank">' + n + " Aniimo</div></div></div>" +
        '<p class="specdesc">' + esc(sp.desc || "") + "</p>" +
        (sp.note ? '<div class="specnote">' + esc(sp.note) + "</div>" : "") + "</div>";
    });
    h += "</div>";

    h += '<h2 class="sec">Échelle de rendement</h2><div class="tablewrap"><table class="tight"><thead><tr>' +
      "<th>Niveau</th><th>Rendement</th><th>Écart vs Lv.1</th><th>Métiers concernés</th></tr></thead><tbody>";
    S.levels.forEach(function (l) {
      var m = sorted.filter(function (j) { return j.max === l.lv; }).map(function (j) { return j.name; }).join(", ") || "—";
      h += "<tr><td><b>Lv." + l.lv + '</b></td><td class="num">' + l.rate + ' charge/min</td><td class="num">' +
        (l.lv === 1 ? "—" : "+" + Math.round((l.rate / 60 - 1) * 100) + "%") + "</td><td>" + esc(m) + "</td></tr>";
    });
    h += "</tbody></table></div>";

    h += '<h2 class="sec">Les Aniimo regroupés par métier</h2>' + toolbar({}) +
      '<div class="tablewrap"><table class="tight' + animClass() + '"><thead><tr><th class="w-ico"></th>' + th("Nom", "name", "w-nm") +
      th("Élément", "elem") + th("Rôle", "role") + "<th>Métier</th>" + th("Niv.", "lvl", "num") +
      "</tr></thead><tbody>";
    var list = rows(null).slice().sort(function (a, b) {
      var ja = mainJob(a) ? mainJob(a).rank : 9, jb = mainJob(b) ? mainJob(b).rank : 9;
      if (ja !== jb) return ja - jb;
      return a.name.localeCompare(b.name);
    });
    list.forEach(function (a, li) {
      h += '<tr class="fxi" style="--i:' + Math.min(li, 26) + '"><td>' + aniLink(a, icon(a)) +
        '</td><td class="nm">' + aniLink(a, esc(a.name)) + "</td><td>" +
        a.elems.map(elemChip).join(" ") + "</td><td>" + roleChip(a.role) + "</td><td>" + jobChips(a) +
        '</td><td class="num">' + (a.jobLevel ? "Lv." + a.jobLevel : "—") + "</td></tr>";
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
                    ["REGEN", "Regen"], ["HEAL", "Soin"], ["ALL", "Tout"]];
  /* ---------------- Tiers List ---------------- */
  /* listes personnalisées : créées ici, partagées par code/lien (site statique) */
  function tLists() { S.tierLists = S.tierLists || []; return S.tierLists; }
  function tPublic() { S.tierPublic = S.tierPublic || []; return S.tierPublic; }
  /* toutes les listes visibles : celles publiées avec le site + celles de ce navigateur */
  function tAll() {
    var seen = {}, out = [];
    tPublic().forEach(function (l) { seen[l.id] = 1; out.push(l); });
    tLists().forEach(function (l) { if (!seen[l.id]) out.push(l); });
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
  function bandOf(r, best, list) {
    var k = list ? (list.tiers || {})[r.a.name] : tFix()[r.a.name];
    var b = k ? bandByKey(k) : null;
    return b || (list ? null : tierOf(r.s, best));
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
    var finals = S.aniimos.filter(isFinal);
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
      '<button class="btn tierbtn tiernew" id="tcreate">✦ Créer</button>' +
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
            (pub ? "publiée" : mine ? "la mienne" : "reçue par lien") + "</span></div>" +
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
      h += '<p class="tfnote">Une liste se partage par son lien : il contient la liste entière, ' +
        "aucun compte n'est nécessaire. Les listes marquées <b>publiée</b> sont livrées avec le site : " +
        "tout le monde les voit en arrivant.</p></div>";
    }
    h += "</div>";

    /* --- formulaire de création --- */
    if (view.tcreate) {
      h += '<form class="card tcreate" id="tcform"><h3>Créer ma Tiers List</h3>' +
        "<p>Ta liste reste dans ce navigateur. Pour la faire voir, copie son lien de partage : il contient la liste entière, aucun compte n'est nécessaire.</p>" +
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
        " sur " + S.aniimos.length + ") : une pré-évolution finit toujours par devenir sa forme finale.</p>";
    }
    h += "</div>";
    h += goldNote("À noter",
      "Cette Tiers List vaut pour le Monde ouvert (Open World). " +
      "En donjon, en raid ou en combat chronométré, l'ordre change : les BREAK et " +
      "les soigneurs y prennent plus de valeur qu'un DPS bien placé ici.");

    /* --- barre d'outils --- */
    h += '<div class="toolbar"><div class="field"><label for="q">Chercher</label><input id="q" type="search" placeholder="nom…" value="' + esc(view.q) + '"></div>' +
      '<div class="field"><label for="fe">Élément</label><select id="fe"><option value="">tous</option>' +
      ELEM_ORDER.map(function (e) { return '<option value="' + e + '"' + (view.elem === e ? " selected" : "") + ">" + e + "</option>"; }).join("") +
      '</select></div><button class="btn" id="reset">Réinitialiser</button>' +
      (list ? '<span style="flex:1"></span>' +
        '<button class="btn" id="tshare">Copier le lien de partage</button>' +
        (tIsMine(list.id) ? "" : '<button class="btn" id="tfork">Reprendre à mon compte</button>') +
        (tIsPublic(list.id) ? "" : '<button class="btn danger" id="tdel">Supprimer</button>') : "") + "</div>";

    /* --- colonnes affichées --- */
    var groups = list || role === "ALL"
      ? TIER_GROUPS.filter(function (g) {
          return shown.some(function (r) { return g.roles.indexOf(r.a.role) >= 0; });
        })
      : [grpOf(role)];
    if (!groups.length) groups = TIER_GROUPS.slice();

    /* --- répartition dans les bandes --- */
    var best = ranked.length ? ranked[0].s : 0;
    var bands = TIERS.map(function (t) { return { t: t, cells: {} }; });
    bands.forEach(function (b) { groups.forEach(function (g) { b.cells[g.key] = []; }); });
    var pool = {};
    groups.forEach(function (g) { pool[g.key] = []; });
    shown.forEach(function (r) {
      var g = grpOf(r.a.role);
      if (!pool[g.key]) return;
      var band = bandOf(r, best, list);
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
    var edit = !!(list && tIsMine(list.id));
    var picked = list && view.tpick === a.name;
    return '<div class="tcard' + (picked ? " picked" : "") + '"' +
      (edit ? ' draggable="true" data-drag="' + esc(a.name) + '"' : "") +
      ' title="' + esc(a.name + " — " + (KLAB[rr] || "Score") + " " + kv + " · score " + r.s +
        " (stats " + r.stat + ", kit " + r.kit + ")\n" + whyOf(a)) + '">' +
      '<div class="tcimg">' + (edit ? icon(a, 58) : aniLink(a, icon(a, 58))) +
      '<span class="tcpos">' + (ranked.indexOf(r) + 1) + "</span>" +
      (edit ? '<button type="button" class="tcinfo" data-ani="' + esc(a.name) +
        '" title="Voir la fiche">i</button>' : "") + "</div>" +
      '<div class="tcname">' + (edit ? esc(a.name) : aniLink(a, esc(a.name))) + "</div>" +
      '<div class="tcel">' + a.elems.map(elemChip).join("") +
      (role === "ALL" ? roleChip(a.role) : "") + "</div>" +
      '<div class="tcwhy">' + esc(whyOf(a)) + "</div></div>";
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
  function elemTeamOf(elem) {
    var saved = elemTeams()[elem] || {};
    var picked = (saved.members || []).filter(Boolean);
    var auto = autoElemTeam(elem);
    var txt = { note: saved.note || "", lead: saved.lead || "",
                points: saved.points || [], risk: saved.risk || "",
                alts: saved.alts || [] };
    var out;
    if (!picked.length) {
      out = { members: auto ? auto.members : [], notes: (auto || {}).notes || {}, auto: true };
    } else {
      out = { members: picked, notes: (auto || {}).notes || {}, auto: false };
    }
    out.note = txt.note; out.lead = txt.lead; out.points = txt.points; out.risk = txt.risk;
    out.alts = txt.alts;
    return out;
  }
  function setBossAlt(id, v) {
    var i = id.lastIndexOf(":");
    var elem = id.slice(0, i), slot = +id.slice(i + 1);
    var t = elemTeams();
    t[elem] = t[elem] || { members: ["", "", "", ""], note: "" };
    t[elem].alts = t[elem].alts || [];
    while (t[elem].alts.length < 4) t[elem].alts.push({ n: "", d: "" });
    t[elem].alts[slot].n = v;
  }
  function setBossTeam(id, v) {
    var i = id.lastIndexOf(":");
    var elem = id.slice(0, i), slot = +id.slice(i + 1);
    var t = elemTeams();
    t[elem] = t[elem] || { members: ["", "", "", ""], note: "" };
    while (t[elem].members.length < 4) t[elem].members.push("");
    t[elem].members[slot] = v;
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
    if (view.teamMode === "auto") {
      var t = autoTeam(view.teamMain, { pins: pins() });
      return t ? { members: t.members, notes: t.notes, main: t.main, pinned: t.pinned } : null;
    }
    var ms = view.teamSlots.map(findAni).filter(Boolean);
    if (!ms.length) return null;
    return { members: ms, notes: {}, main: ms[0] };
  }

  function aniPicker(id, val, ph) {
    var cur = val ? findAni(val) : null;
    var open = view.openPicker === id;
    var list = S.aniimos.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (open && view.pickerQ) {
      var q = view.pickerQ.toLowerCase();
      list = list.filter(function (a) {
        return a.name.toLowerCase().indexOf(q) >= 0 || a.role.toLowerCase().indexOf(q) >= 0 ||
          a.elems.join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    var h = '<div class="apick' + (open ? " open" : "") + '" data-pid="' + id + '">' +
      '<button type="button" class="apickbtn" data-popen="' + id + '" aria-expanded="' + open + '">' +
      (cur ? icon(cur, 26) + "<b>" + esc(cur.name) + '</b><span class="rank">' + esc(cur.role) + " · " +
        esc(cur.elems.join("/")) + "</span>" : '<span class="ph">' + esc(ph || "— choisir un Aniimo —") + "</span>") +
      '<span class="caret">▾</span></button>';
    if (open) {
      h += '<div class="apickmenu"><input class="apickq" type="search" placeholder="Chercher un Aniimo…" value="' +
        esc(view.pickerQ) + '">';
      if (val) h += '<button type="button" class="apickitem clear" data-pchoose="' + id + '" data-pval="">Vider ce slot</button>';
      h += '<div class="apicklist">';
      list.forEach(function (a) {
        h += '<button type="button" class="apickitem' + (a.name === val ? " on" : "") + '" data-pchoose="' + id +
          '" data-pval="' + esc(a.name) + '">' + icon(a, 24) + "<b>" + esc(a.name) + "</b>" +
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

  /* les 9 équipes types, une par élément de boss */
  /* ordre demandé pour l'affichage des équipes par élément */
  var ELEM_TEAM_ORDER = ["Foudre", "Feu", "Glace", "Plante", "Eau", "Ténèbres", "Lumière", "Vent", "Roche"];
  function elemTeamOrder() {
    return ELEM_TEAM_ORDER.filter(function (e) { return ELEM_ORDER.indexOf(e) >= 0; })
      .concat(ELEM_ORDER.filter(function (e) { return ELEM_TEAM_ORDER.indexOf(e) < 0; }));
  }
  function elemTeamsPanel() {
    var h = '<section class="etsec">' + skHead("Les meilleures équipes par élément") +
      '<p class="etlead">Une équipe conseillée face à un boss de chaque élément : un DPS qui le frappe en ×1,6, ' +
      "un BREAK pour ouvrir la garde, un soutien et un soin. Clique une vignette pour ouvrir sa fiche.</p>" +
      goldNote("À savoir",
        "Les teams proposées ont été faites de manière à optimiser au mieux vos combats. " +
        "Chaque place propose un remplaçant : le second Aniimo fait aussi bien, autrement.") +
      /* même effet d'arrivée que la Tiers List */
      '<div class="etboard"><div class="etgrid' + animClass("tiers") + '">';
    elemTeamOrder().forEach(function (e, ei) {
      var t = elemTeamOf(e);
      var ch = chartOf(e);
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
      h += '<div class="etwhy"><span>Frappé fort par</span>' +
        (ch.weak.map(elemChip).join(" ") || "—") + "</div>";
      if (t.points && t.points.length) {
        h += '<ul class="etpts">' + t.points.map(function (pt) {
          var a2 = findAni(pt.t);
          return "<li>" + (a2 ? icon(a2, 22) : "") +
            "<div><b>" + esc(pt.t) + "</b>" + esc(pt.d) + "</div></li>";
        }).join("") + "</ul>";
      }
      if ((t.alts || []).some(function (x) { return x && x.n; })) {
        h += '<div class="etaltbox"><span class="etalth">Team 2</span><ul>' +
          t.alts.map(function (x, i) {
            if (!x || !x.n) return "";
            var b = findAni(x.n);
            return "<li>" + (b ? icon(b, 20) : "") + "<div><b>" + esc(x.n) + "</b>" +
              (t.members[i] ? '<span class="etfor">à la place de ' + esc(t.members[i]) + "</span>" : "") +
              esc(x.d || "") + "</div></li>";
          }).join("") + "</ul></div>";
      }
      if (t.risk) h += '<p class="etrisk"><span>Piège à éviter</span>' + esc(t.risk) + "</p>";
      if (t.note) h += '<p class="etnote">' + esc(t.note) + "</p>";
      h += "</div>";
    });
    return h + "</div></div></section>";
  }

  function viewTeam() {
    var h = '<div class="head"><h1>Team</h1></div>' +
      "";

    h += '<div class="modes"><button class="btn' + (view.teamMode === "auto" ? " primary" : "") + '" data-mode="auto">Team automatique</button>' +
      '<button class="btn' + (view.teamMode === "manuel" ? " primary" : "") + '" data-mode="manuel">Composer moi-même</button>' +
      '<button class="btn' + (view.teamMode === "boss" ? " primary" : "") + '" data-mode="boss">Contre un Élément</button></div>';

    if (view.teamMode === "auto") {
      h += '<div class="card pickcard"><div class="f"><label>Aniimo principal</label>' + aniPicker("tmain", view.teamMain) + "</div>" +
        '<p class="rank">Les 3 autres sont choisis automatiquement : rôles complémentaires, bonus élémentaires qui profitent à ton principal, et couverture de ses faiblesses.</p></div>';
    } else if (view.teamMode === "boss") {
      h += elemTeamsPanel();
      return h;
    } else {
      h += '<div class="card pickcard"><div class="row4">' +
        view.teamSlots.map(function (v, i) {
          return '<div class="f"><label>Aniimo ' + (i + 1) + "</label>" + aniPicker("ts" + i, v) + "</div>";
        }).join("") + "</div>" +
        '<p class="rank">Les conseils s\'adaptent à ta composition : forces, faiblesses et rotation sont recalculés à chaque changement.</p></div>';
    }

    var T = teamMembers();
    if (!T) {
      h += '<div class="card"><h3>Choisis au moins un Aniimo</h3>' +
        "<p>Sélectionne un Aniimo ci-dessus pour lancer l'analyse.</p></div>";
      return h;
    }
    var A = analyse(T.members, T.main);
    if (T.boss) {
      var bch = chartOf(T.boss.elem);
      var hitters = T.members.filter(function (a) {
        return elemsOf(a).some(function (e) { return chartOf(e).strong.indexOf(T.boss.elem) >= 0; });
      });
      var fragile = T.members.filter(function (a) {
        return elemsOf(a).some(function (e) { return bch.strong.indexOf(e) >= 0; });
      });
      var resist = T.members.filter(function (a) {
        return elemsOf(a).some(function (e) { return chartOf(e).resist.indexOf(T.boss.elem) >= 0; });
      });
      if (hitters.length) A.strong.unshift("Contre ce boss " + esc(T.boss.elem) + " : <b>" +
        hitters.map(function (a) { return esc(a.name); }).join(", ") + "</b> frappe" +
        (hitters.length > 1 ? "nt" : "") + " en ×1,6.");
      if (resist.length) A.strong.push("<b>" + resist.map(function (a) { return esc(a.name); }).join(", ") +
        "</b> résiste" + (resist.length > 1 ? "nt" : "") + " à ses attaques " + esc(T.boss.elem) + ".");
      if (fragile.length) A.weak.unshift("<b>" + fragile.map(function (a) { return esc(a.name); }).join(", ") +
        "</b> prend ×1,6 du boss : sors-le" + (fragile.length > 1 ? "s" : "") + " dès qu'il cible.");
      if (T.bt && T.bt.key === "raid") A.weak.push("Combat long : garde une réserve d'EP pour le soin, le burst ne suffira pas seul.");
      if (T.bt && T.bt.key === "entrainement") A.strong.push("Cible immobile qui ne riposte pas : tu peux enchaîner le cycle sans jamais reculer.");
      if (T.bt && T.bt.key === "alpha") A.weak.push("Zones au sol et phases multiples : replace-toi entre deux compétences plutôt que de cracher tout le burst d'un coup.");
    }

    h += '<div class="grid cards4' + animClass() + '" style="margin-top:14px">';
    T.members.forEach(function (a, mi) {
      var isMain = a.name === T.main.name;
      var why = T.notes[a.name];
      var isPinned = pins().indexOf(a.name) >= 0;
      h += '<div class="card teamcard fxi' + (isMain ? " main" : "") + '" style="--i:' + mi + '">' +
        '<div class="icocell">' + aniLink(a, icon(a, 44)) + "<div><b>" + aniLink(a, esc(a.name)) + "</b>" +
        '<div class="chips">' + a.elems.map(elemChip).join(" ") + " " + roleChip(a.role) + "</div></div>" +
        (view.teamMode === "auto" && !isMain
          ? '<button class="pinbtn' + (isPinned ? " on" : "") + '" data-pin="' + esc(a.name) +
            '" title="' + (isPinned ? "Ne plus garder cet Aniimo" : "Garder cet Aniimo dans l\'équipe") +
            '" aria-pressed="' + isPinned + '">' + (isPinned ? "★" : "☆") + "</button>"
          : "") + "</div>" +
        (isMain ? '<div class="tag">Aniimo principal</div>' : (isPinned ? '<div class="tag pin">Gardé</div>' : "")) +
        '<dl class="kv mini"><dt>ATK</dt><dd class="mono">' + a.atk + '</dd><dt>BREAK</dt><dd class="mono">' + a.brk +
        '</dd><dt>REGEN</dt><dd class="mono">' + a.regen + '</dd><dt>Meilleur coup</dt><dd class="mono">' + hit(a) + "</dd></dl>" +
        '<p class="tr">' + esc(a.traitFr || a.trait) + "</p>" +
        (why && why.length ? '<p class="why"><span class="lbl">Pourquoi lui</span>' + esc(why.join(" · ")) + "</p>" : "") +
        "</div>";
    });
    h += "</div>";

    h += '<div class="grid two" style="margin-top:14px">' +
      '<div class="card"><h3>Points forts</h3><ul class="bul good">' +
      A.strong.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul></div>" +
      '<div class="card"><h3>Points faibles</h3><ul class="bul bad">' +
      A.weak.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul></div></div>";

    h += '<h2 class="sec">Rotation conseillée</h2><ol class="steps">';
    A.rotation.forEach(function (r, i) {
      h += "<li" + (r.main ? ' class="hl"' : "") + '><span class="n">' + (i + 1) +
        '</span><span class="who"><b>' + esc(r.who) + "</b></span><span>" + r.what + "</span></li>";
    });
    h += "</ol>";

    h += '<h2 class="sec">Couverture élémentaire</h2><div class="card"><div class="cover">';
    ELEM_ORDER.forEach(function (e) {
      var ok = A.covered.indexOf(e) >= 0;
      h += '<div class="cv' + (ok ? " on" : "") + '">' + elemChip(e) + "<span>" + (ok ? "×1,6" : "—") + "</span></div>";
    });
    h += '</div><p class="note" style="margin-top:10px">Table des types : chaque élément inflige ×1,6 à deux ou trois autres. Une case grise n\'est pas rédhibitoire — elle veut dire que l\'équipe frappe en neutre sur cet élément.</p></div>';
    return h;
  }

  /* ---------------- admin ---------------- */
  function viewAdmin() {
    var secs = [["aniimo", "Aniimo"], ["skico", "Icônes de compétences"], ["specs", "Spécialités"],
      ["jobs", "Métiers"], ["abil", "Abilités"], ["bosses", "Boss"], ["tiers", "Tiers List"],
      ["effets", "Effets"], ["team", "Équipe par défaut"]];
    var h = '<div class="head"><h1>Panneau admin</h1><span class="count">' + S.aniimos.length + " fiches</span></div>" +
      '<p class="sub">Modifie les données ici : toutes les fiches, classements et tiers lists se recalculent à partir de ces valeurs.</p>' +
      '<div class="banner"><b>' + (draftLoaded ? "Brouillon local" : "Version publiée") + "</b>" +
      '<span style="color:var(--ink-2)">Publier remplace la page pour tous ceux qui ont le lien.</span><span style="flex:1"></span>' +
      '<button class="btn primary" id="publish">Publier</button>' +
      '<button class="btn" id="exportjson">Exporter le JSON</button>' +
      '<button class="btn" id="importjson">Importer un JSON</button>' +
      '<button class="btn danger" id="revert">Abandonner le brouillon</button></div>' +
      '<div class="modes">' + secs.map(function (s) {
        return '<button class="btn' + (view.adminSec === s[0] ? " primary" : "") + '" data-asec="' + s[0] + '">' + s[1] + "</button>";
      }).join("") + "</div>";

    if (view.adminSec === "aniimo") h += adminAniimo();
    else if (view.adminSec === "skico") h += adminSkillIcons();
    else if (view.adminSec === "specs") h += adminSpecs();
    else if (view.adminSec === "jobs") h += adminJobs();
    else if (view.adminSec === "bosses") h += adminBosses();
    else if (view.adminSec === "abil") h += adminAbil();
    else if (view.adminSec === "tiers") h += adminTiers();
    else if (view.adminSec === "effets") h += adminEffects();
    else h += adminTeam() + adminLockCard();
    return h;
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
      "<th>Icône</th><th>Nom</th><th>Anglais</th><th>Rang</th><th>Niv. max</th><th>Rendement</th><th>Couleur</th><th>Description</th><th></th></tr></thead><tbody>";
    S.jobs.forEach(function (j, i) {
      h += "<tr data-job='" + i + "'>" +
        '<td><input value="' + esc(j.icon) + '" data-k="icon" style="width:44px"></td>' +
        '<td><input value="' + esc(j.name) + '" data-k="name" style="width:100px"></td>' +
        '<td><input value="' + esc(j.en) + '" data-k="en" style="width:100px"></td>' +
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
      var alt = (saved.alts || []).map(function (x) { return (x || {}).n || ""; });
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

  /* ---------------- admin : Tiers List ---------------- */
  function adminTiers() {
    var ranked = allScores().filter(function (r) { return isFinal(r.a); });
    var best = ranked.length ? ranked[0].s : 0;
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
      var a = r.a, auto = tierOf(r.s, best), cur = tFix()[a.name] || "";
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
      "<p>Les listes <b>publiées</b> partent avec le site : tout le monde les voit dans le dépliant en arrivant sur la Tiers List. Les autres ne vivent que dans ce navigateur. Pour ajouter la liste d'un joueur, demande-lui son lien de partage et colle-le ci-dessous.</p>" +
      '<div class="toolbar"><div class="field" style="flex:1"><label for="tadd">Lien ou code reçu</label>' +
      '<input id="tadd" type="text" placeholder="https://…/#liste=… ou le code seul"></div>' +
      '<button class="btn primary" id="taddgo">Ajouter et publier</button></div>';
    if (!LS.length) h += '<p class="note">Aucune liste pour le moment.</p>';
    else {
      h += '<div class="tablewrap"><table class="tight"><thead><tr><th>Liste</th><th>Pseudo</th>' +
        "<th>Placés</th><th>Visibilité</th><th></th></tr></thead><tbody>";
      LS.forEach(function (l) {
        var pub = tIsPublic(l.id);
        h += "<tr><td><b>" + esc(l.title || "Liste") + "</b></td><td>" + esc(l.pseudo || "anonyme") + "</td>" +
          "<td>" + Object.keys(l.tiers || {}).length + "</td>" +
          "<td>" + (pub ? '<span class="tfbadge pub">publiée</span>'
            : '<span class="tfbadge">ce navigateur</span>') + "</td>" +
          '<td><button type="button" class="btn" data-lgo="' + esc(l.id) + '">Voir</button> ' +
          '<button type="button" class="btn" data-lcopy="' + esc(l.id) + '">Copier le lien</button> ' +
          (pub ? '<button type="button" class="btn" data-lunpub="' + esc(l.id) + '">Dépublier</button> '
               : '<button type="button" class="btn primary" data-lpub="' + esc(l.id) + '">Publier pour tous</button> ') +
          '<button type="button" class="btn danger" data-ldel="' + esc(l.id) + '">Supprimer</button></td></tr>';
      });
      h += "</tbody></table></div>";
    }
    h += '<p class="note">Publier une liste ici la place dans <code>state.json</code> : elle devient visible pour tous après un « Publier » puis un commit du dossier. Un envoi automatique par les visiteurs demanderait un serveur, ce que ce site — entièrement statique — n\'a pas.</p>';
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
      };
    });
    document.querySelectorAll("[data-lpub]").forEach(function (b) {
      b.onclick = function () {
        var l = tListOf(b.dataset.lpub); if (!l || tIsPublic(l.id)) return;
        tPublic().push(JSON.parse(JSON.stringify(l)));
        persist("Liste publiée pour tous"); render();
      };
    });
    document.querySelectorAll("[data-lunpub]").forEach(function (b) {
      b.onclick = function () {
        S.tierPublic = tPublic().filter(function (x) { return x.id !== b.dataset.lunpub; });
        persist("Liste retirée du site"); render();
      };
    });
    on("taddgo", "onclick", function () {
      var el = document.getElementById("tadd"), t = el ? el.value.trim() : "";
      if (!t) return;
      var d;
      try { d = tDec(t); } catch (e) { toast("Ce code ne correspond à aucune Tiers List."); return; }
      if (!d || !d.x) { toast("Ce code ne correspond à aucune Tiers List."); return; }
      tPublic().push({ id: newListId(), pseudo: d.p || "anonyme", title: d.t || "Liste partagée",
                       tiers: d.x, at: Date.now() });
      persist("Liste ajoutée et publiée"); render();
    });
  }

  function adminEffects() {
    var FX = S.effects || [], SP = S.speeds || [], PG = S.pages || [];
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
    var pool = S.aniimos.filter(function (a) { return a.img; });
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
    S.aniimos.forEach(function (a) { c[a.role] = (c[a.role] || 0) + 1; });
    var groups = ["Fiches", "Gestion"];
    var h = '<div class="brand"><b>Aniimo France</b><span>Codex</span></div>' +
      '<div class="railnote">' + S.aniimos.length + " Aniimo — mise à jour du " + esc(S.meta.updated) + ".</div>" +
      /* enveloppe neutre sur grand écran, ruban défilant sur mobile */
      '<div class="railnav">';
    groups.forEach(function (g) {
      /* le panneau est masqué aux visiteurs : on y accède par #admin */
      if (g === "Gestion" && adminLocked() && view.tab !== "admin") return;
      h += '<div class="navgroup">' + g + "</div>";
      TABS.filter(function (t) { return t.grp === g; }).forEach(function (t) {
        var dot = t.role ? '<span class="dot" style="background:' + (S.roles[t.role] || {}).color + '"></span>' : "";
        var n = t.role ? '<span class="n">' + (c[t.role] || 0) + "</span>" :
          (t.id === "tous" ? '<span class="n">' + S.aniimos.length + "</span>" : "");
        var on = view.tab === t.id;
        /* la catégorie ouverte pétille quand la souris passe dessus */
        var sp = "";
        for (var k = 1; k <= 5; k++) sp += '<span class="sp sp' + k + '">' + STAR + "</span>";
        var lab = on
          ? '<span class="tablab"><span class="shine">' + esc(t.label) + "</span>" + sp + "</span>"
          : "<span>" + esc(t.label) + "</span>";
        h += '<button class="tab" data-tab="' + t.id + '"' + (on ? ' aria-current="true"' : "") + ">" +
          dot + lab + n + "</button>";
      });
    });
    h += "</div>" + discordCard();
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

  /* bouton « remonter » : un Aniimo qui dépasse du haut de la pastille */
  var TOPANI = null;
  function topBtn() {
    if (!TOPANI) {
      var pool = S.aniimos.filter(function (a) { return a.img; });
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

  /* on retient la page ouverte pour la retrouver après un rafraîchissement */
  var VIEW_KEY = "aniimo.view";
  var VIEW_KEEP = ["tab", "tier", "abil", "teamMode", "teamMain", "adminSec", "tfold"];
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
      /* une liste perso supprimée entre-temps ne doit pas bloquer la page */
      if (typeof view.tier === "string" && view.tier.indexOf("L:") === 0 &&
          !tListOf(view.tier.slice(2))) view.tier = "ALL";
      if (!tabOf(view.tab) || tabOf(view.tab).id !== view.tab) view.tab = "tous";
    } catch (e) {}
  }

  function render() {
    var t = tabOf(view.tab), body;
    if (t.kind === "roster") body = viewRoster();
    else if (t.kind === "power") body = viewPower();
    else if (t.kind === "abil") body = viewAbil();
    else if (t.kind === "jobs") body = viewJobs();
    else if (t.kind === "tier") body = viewTier();
    else if (t.kind === "team") body = viewTeam();
    else body = adminLocked() ? viewLock() : viewAdmin();

    document.getElementById("app").innerHTML = defs() +
      '<div class="shell"><nav class="rail">' + renderRail() + '</nav><main class="main">' + banner() + body + "</main></div>" +
      topBtn() +
      (view.detail ? viewDetail(view.detail) : "");
    wire();
    bindTop();
    saveView();
    if (t.kind === "admin" && adminLocked()) return;
    if (t.kind === "admin" && view.adminSec === "aniimo" && view.pick) { fillForm(); bindSkillIcons(); }
    if (t.kind === "admin" && view.adminSec === "skico") bindSkillIcons();
    if (t.kind === "admin" && view.adminSec === "tiers") bindAdminTiers();
    if (t.kind === "admin" && view.adminSec === "abil") bindAdminAbil();
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
        var best = ranked.length ? ranked[0].s : 0;
        ranked.forEach(function (r) {
          var b = tFix()[r.a.name] ? bandByKey(tFix()[r.a.name]) : tierOf(r.s, best);
          if (b) tiers[r.a.name] = b.k;
        });
      }
      var l = { id: newListId(), pseudo: pseudo, title: title, tiers: tiers, at: Date.now() };
      tLists().push(l);
      view.tcreate = false; view.tier = "L:" + l.id;
      persist("Tiers list créée");
      render(); window.scrollTo(0, 0);
    };

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
      view.tier = "ALL"; persist("Tiers list supprimée"); render();
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
        if (t !== "puissance" && view.tab === "puissance") { view.sort = "atk"; view.dir = -1; }
        view.tab = t; animate = true; render(); animate = false; window.scrollTo(0, 0);
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
      b.onclick = function (e) { e.stopPropagation(); view.detail = b.dataset.ani; render(); };
    });
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.onclick = function () { view.detail = null; render(); };
    });
    document.querySelectorAll("[data-tier]").forEach(function (b) {
      b.onclick = function () {
        view.tier = b.dataset.tier; view.tcreate = false; view.tpick = null;
        animate = true; render(); animate = false; window.scrollTo(0, 0);
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
          a.jobLevel = a.jobs.length ? Math.max.apply(null, a.jobs.map(function (k) {
            var jj = jobOf(k); return jj ? jj.max : 0;
          })) : null;
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
        a.jobLevel = (a.jobs && a.jobs.length) ? Math.max.apply(null, a.jobs.map(function (k) {
          var j = jobOf(k); return j ? j.max : 0;
        })) : null;
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
      (S.pages || []).forEach(function (p) {
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
    on("revert", "onclick", function () {
      if (!confirm("Abandonner le brouillon local et revenir à la version publiée ?")) return;
      S = JSON.parse(RAW); draftLoaded = false;
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
    a.jobLevel = a.jobs.length ? Math.max.apply(null, a.jobs.map(function (k) { var j = jobOf(k); return j ? j.max : 0; })) : null;
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
    if (!window.open(u, "_blank")) toast("Autorise les pop-ups pour voir le JSON.");
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
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
    (window.claude && window.claude.use ? window.claude.use("artifact") : Promise.resolve(null))
      .then(function (api) {
        if (!api) throw { code: "not_granted" };
        return api.publish(renderDoc(S));
      })
      .then(function () {
        try { localStorage.removeItem("aniimo.draft"); } catch (e) {}
        toast("Publié — la page est à jour pour tout le monde.");
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
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && view.detail) { view.detail = null; render(); }
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
  animate = true; render(); animate = false;
})();
