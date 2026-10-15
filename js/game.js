/* Who Could Have Known? A static, client-side trivia game. No network calls beyond this site's own JSON. */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var REVIEW = params.has("review");
  var ROUND_SIZE = 10;
  var YEAR_MIN = 2008;
  var YEAR_MAX = new Date().getFullYear();
  var HINT_COST = 10;

  var DATA_TYPES = {
    "check-ins": "Social check-ins",
    "wifi-payload": "Home Wi-Fi traffic",
    "device-cache": "A phone's hidden location log",
    "crime-weighted-routing": "Crime statistics fed into routing",
    "phone-metadata": "Phone call and location metadata",
    "ride-location": "Ride-hail trip locations",
    "trip-records": "Taxi trip records",
    "outreach-records": "Charity outreach records",
    "fitness-gps": "Fitness app GPS routes",
    "social-profiles": "Social media profiles",
    "account-location": "Account location history",
    "ad-sdk-location": "App location data sold through ad tech",
    "carrier-location": "Mobile carrier location",
    "app-location": "An app's own location data",
    "bluetooth-tracker": "Bluetooth item trackers",
    "license-plate-reads": "License plate camera reads",
    "photo-exif": "GPS metadata in photos"
  };
  /* Types close enough that one could defensibly stand for another; never offered together. */
  var CONFUSABLE = [
    ["ad-sdk-location", "app-location", "account-location"],
    ["check-ins", "social-profiles", "photo-exif"],
    ["phone-metadata", "carrier-location"],
    ["ride-location", "trip-records"]
  ];

  var OUTCOMES = [
    ["nothing", "Nothing"],
    ["pr-tweak", "A statement and a settings tweak"],
    ["product-pulled", "A product or feature was pulled"],
    ["fine-settlement-order", "A fine, settlement or regulatory order"],
    ["ruling-law", "A court ruling or new law"]
  ];

  var app = document.getElementById("app");
  var statusEl = document.getElementById("status");
  var state = { all: [], byId: {}, sets: [], round: [], i: 0, results: [], setTitle: null, notice: null, review: {} };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function year(c) { return parseInt(String(c.date).slice(0, 4), 10); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function txt(field) { return field && field.text ? field.text : ""; }
  function vals(field) { return (field && field.value) || []; }
  function isDraft(field) { return !!field && field.by === "claude" && field.status !== "approved"; }
  function badge(field) { return isDraft(field) ? ' <span class="badge" title="Provisional, awaiting the authors\' review">drafted by Claude</span>' : ""; }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }
  function link(item) {
    var a = safeUrl(item.archive_url) || safeUrl(item.url);
    if (!a) return "";
    var o = safeUrl(item.url);
    return '<a href="' + esc(a) + '" rel="noopener noreferrer">archived copy</a>' + (o && o !== a ? ' · <a href="' + esc(o) + '" rel="noopener noreferrer">original</a>' : "");
  }
  function fmtDate(d) {
    if (!d) return "";
    var p = String(d).split("-");
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (p.length === 1) return p[0];
    if (p.length === 2) return months[+p[1] - 1] + " " + p[0];
    return +p[2] + " " + months[+p[1] - 1] + " " + p[0];
  }
  function announce(msg) { if (statusEl) { statusEl.textContent = ""; setTimeout(function () { statusEl.textContent = msg; }, 30); } }

  /* Swap the screen, move focus to its heading, return to the top. */
  function show(html) {
    app.innerHTML = html;
    var h = app.querySelector("[data-focus]");
    window.scrollTo(0, 0);
    if (h) h.focus({ preventScroll: true });
  }

  /* Viridis encodes time: older is purple, newer is yellow. Each theme trims the end that vanishes into its background. */
  var VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  function yearColor(y) {
    var dark = document.documentElement.dataset.theme === "dark";
    var lo = dark ? 0.16 : 0, hi = dark ? 1 : 0.8;
    var u = Math.min(1, Math.max(0, (y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)));
    var t = (lo + u * (hi - lo)) * (VIRIDIS.length - 1);
    var i = Math.min(VIRIDIS.length - 2, Math.floor(t)), f = t - i;
    var a = VIRIDIS[i], b = VIRIDIS[i + 1];
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(",") + ")";
  }

  /* Replace company / product names with redaction bars. Matches on the raw text (curly and straight
     apostrophes treated alike), merges overlaps, then escapes each piece. */
  function redact(text, terms) {
    var raw = String(text);
    var norm = raw.replace(/[‘’]/g, "'");
    var hits = [];
    (terms || []).forEach(function (t) {
      var pat = String(t).replace(/[‘’]/g, "'").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp("(^|[^\\p{L}\\p{N}])(" + pat + ")(?![\\p{L}\\p{N}])", "giu");
      var m;
      while ((m = re.exec(norm))) {
        var start = m.index + m[1].length;
        hits.push([start, start + m[2].length]);
        re.lastIndex = start + Math.max(1, m[2].length);
      }
    });
    hits.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var out = "", pos = 0;
    hits.forEach(function (h) {
      if (h[0] < pos) return;
      out += esc(raw.slice(pos, h[0])) +
        '<span class="redact" role="img" aria-label="redacted"><span aria-hidden="true">' + "x".repeat(h[1] - h[0]) + "</span></span>";
      pos = h[1];
    });
    return out + esc(raw.slice(pos));
  }

  /* ---------- data preparation ---------- */
  /* Links between cases are stored on whichever card they were drafted for; make them symmetric. */
  function symmetrizeLinks() {
    function ensure(c, key) { if (!c[key] || !c[key].value) c[key] = { value: [], by: "claude", status: "draft" }; return c[key].value; }
    state.all.forEach(function (c) {
      vals(c.recurrences).forEach(function (id) { var x = state.byId[id]; if (x && ensure(x, "precedents").indexOf(c.id) < 0) x.precedents.value.push(c.id); });
      vals(c.precedents).forEach(function (id) { var x = state.byId[id]; if (x && ensure(x, "recurrences").indexOf(c.id) < 0) x.recurrences.value.push(c.id); });
    });
  }
  function usable(c) {
    return c && c.playable && c.headlines && c.headlines.length && c.what_happened && c.outcome && c.outcome_detail && c.date;
  }

  function buildRound() {
    var playable = state.all.filter(usable);
    var ids = null;
    if (params.get("set")) {
      var s = state.sets.find(function (x) { return x.id === params.get("set"); });
      if (s) { ids = s.cases; state.setTitle = s.title; }
      else state.badLink = state.notice = "There's no classroom set called “" + params.get("set") + "”. Here's a random round instead.";
    } else if (params.get("cases")) {
      ids = params.get("cases").split(",");
      state.setTitle = "A custom set";
    }
    if (ids) {
      var picked = ids.map(function (id) { return state.byId[id]; }).filter(usable);
      if (picked.length) return picked;
      state.badLink = state.notice = "None of the cards in that link exist any more. Here's a random round instead.";
      state.setTitle = null;
    }
    return shuffle(playable).slice(0, ROUND_SIZE);
  }
  function shareUrl() {
    var base = location.origin + location.pathname;
    if (params.get("set") && !state.badLink) return base + "?set=" + encodeURIComponent(params.get("set"));
    if (params.get("cases") && !state.badLink) return base + "?cases=" + state.round.map(function (c) { return encodeURIComponent(c.id); }).join(",");
    return base;
  }

  /* ---------- screens ---------- */
  function authorSlot(label) {
    return REVIEW ? '<div class="author-slot">Author slot: ' + esc(label) + " (empty)</div>" : "";
  }

  function intro() {
    var n = state.round.length;
    var pool = state.all.filter(usable).length;
    show(
      '<section class="intro reveal-in">' + blot(YEAR_MIN + 3, "blot-a") + blot(YEAR_MAX - 2, "blot-b") +
        '<h1 class="visually-hidden" tabindex="-1" data-focus>Who Could Have Known?</h1>' +
        (state.notice ? '<p class="notice">' + esc(state.notice) + "</p>" : "") +
        '<p class="lede">Each card is a real headline about a scandal involving location or personal data, with the company names blacked out.</p>' +
        '<ol class="how">' +
          '<li><span class="n">1</span><span>Guess the year it broke, and what kind of data was involved. Extra headlines are available as hints, for ' + HINT_COST + " points each.</span></li>" +
          '<li><span class="n">2</span><span>See what happened, then guess what changed afterward.</span></li>' +
          '<li><span class="n">3</span><span>See what actually changed, and the earlier and later cases in this collection.</span></li>' +
        "</ol>" +
        (state.setTitle ? '<p class="set-note">Classroom set: <strong>' + esc(state.setTitle) + "</strong> (" + n + " cards)</p>" : '<p class="set-note">' + n + " cards, drawn at random from " + pool + " cases.</p>") +
        '<div class="btn-row"><button class="btn" id="start">Start</button></div>' +
        authorSlot("introduction") +
      "</section>"
    );
    document.getElementById("start").addEventListener("click", function () { state.i = 0; state.results = []; guess(); });
  }

  function progress(label) {
    var pips = state.round.map(function (_, k) {
      return '<span class="' + (k < state.i ? "done" : k === state.i ? "now" : "") + '"></span>';
    }).join("");
    var score = state.results.reduce(function (s, r) { return s + r.points; }, 0);
    return '<h1 class="visually-hidden" tabindex="-1" data-focus>Card ' + (state.i + 1) + " of " + state.round.length + ": " + esc(label) + "</h1>" +
      '<div class="progress" aria-hidden="true"><span>Card <strong>' + (state.i + 1) + "</strong> of " + state.round.length + "</span><span>Score <strong>" + score + "</strong></span></div>" +
      '<div class="pips" aria-hidden="true">' + pips + "</div>" + derive() +
      '<div class="thesis-no" aria-hidden="true">' + (state.i + 1) + "</div>";
  }

  /* M3 · the round drawn as a dérive: a wandering route, walked so far in solid red */
  function derive() {
    var n = state.round.length, W = 1000, H = 46;
    var pts = state.round.map(function (_, k) {
      var x = 14 + k * (W - 28) / Math.max(1, n - 1);
      var y = H / 2 + Math.sin(k * 2.3 + 1) * 12 + Math.cos(k * 1.7) * 5;
      return [Math.round(x), Math.round(y)];
    });
    var line = function (ps) { return ps.map(function (p, k) { return (k ? "L" : "M") + p[0] + " " + p[1]; }).join(" "); };
    return '<svg class="derive" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="route" d="' + line(pts) + '"/>' +
      (state.i > 0 ? '<path class="walked" d="' + line(pts.slice(0, state.i + 1)) + '"/>' : "") +
      pts.map(function (p, k) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" class="' + (k < state.i ? "done" : k === state.i ? "now" : "") + '" vector-effect="non-scaling-stroke"/>'; }).join("") +
      "</svg>";
  }

  /* M5 · an ink blot after Jorn, in a time colour */
  function blot(y, cls) {
    var col = yearColor(y);
    return '<svg class="blot ' + (cls || "") + '" viewBox="0 0 200 200" aria-hidden="true"><path filter="url(#ink)" fill="' + col + '" d="M100 18 C150 14 186 52 182 100 C178 150 146 186 98 182 C52 178 16 150 20 100 C24 54 52 22 100 18 Z"/></svg>';
  }

  function clipping(c, h, k, redacted) {
    var text = redacted ? redact(h.text, c.redact) : esc(h.text);
    return '<article class="clipping reveal-in" id="clip-' + k + '" tabindex="-1"><div class="frag-wrap"><div class="frag">' +
      '<p class="kicker">' + (k === 0 ? "Headline" : "Another headline") + "</p>" +
      '<h2 class="headline">' + text + "</h2>" +
      (redacted ? "" : '<p class="meta">' + esc(h.outlet) + " · " + esc(fmtDate(h.date)) + " · " + link(h) + "</p>") +
      "</div></div></article>";
  }

  function dataTypeChoices(c) {
    var blocked = [c.data_type];
    CONFUSABLE.forEach(function (g) { if (g.indexOf(c.data_type) >= 0) blocked = blocked.concat(g); });
    var others = shuffle(Object.keys(DATA_TYPES).filter(function (k) { return blocked.indexOf(k) < 0; })).slice(0, 3);
    return shuffle(others.concat([c.data_type]));
  }
  function typeLabel(t) { return DATA_TYPES[t] || t; }

  function guess() {
    var c = state.round[state.i];
    var heads = c.headlines.filter(function (h) { return h.phase !== "aftermath"; });
    if (!heads.length) heads = c.headlines.slice(0, 1);
    var shown = 1;
    var types = dataTypeChoices(c);
    var mid = Math.round((YEAR_MIN + YEAR_MAX) / 2);
    var yr = mid, dt = null;

    function render(focusClip) {
      var clips = "";
      for (var k = 0; k < shown; k++) clips += clipping(c, heads[k], k, true);
      var more = shown < heads.length;
      show(progress("guess") + clips +
        '<p class="redact-hint">Company and product names are blacked out; each bar is as long as the name it hides. Clue: it involves ' + esc(c.redaction_label) + ".</p>" +
        (more ? '<button class="link-button" id="hint" type="button">Show another headline (−' + HINT_COST + " points)</button>" : "") +
        '<form id="g">' +
          '<fieldset><legend id="yr-legend">When did this story break?</legend>' +
            '<div class="year-wrap"><output class="year-out" id="yo" for="yr" aria-hidden="true">' + yr + "</output>" +
            '<input type="range" id="yr" name="yr" min="' + YEAR_MIN + '" max="' + YEAR_MAX + '" step="1" value="' + yr + '" aria-labelledby="yr-legend">' +
            '<div class="range-ends" aria-hidden="true"><span>' + YEAR_MIN + "</span><span>" + YEAR_MAX + "</span></div></div>" +
          "</fieldset>" +
          (c.data_type_scored === false ? "" :
          '<fieldset><legend>What kind of data was it?</legend><div class="choices">' +
            types.map(function (t, k) {
              return '<label class="choice"><input type="radio" name="dt" value="' + esc(t) + '"' + (dt === t ? " checked" : "") + (k === 0 ? " required" : "") + "> " + esc(typeLabel(t)) + "</label>";
            }).join("") +
          "</div></fieldset>") +
          '<div class="btn-row"><button class="btn" type="submit">Lock in</button></div>' +
        "</form>");
      if (focusClip) { var el = document.getElementById("clip-" + (shown - 1)); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center" }); } }
      var slider = document.getElementById("yr");
      slider.addEventListener("input", function () { document.getElementById("yo").textContent = slider.value; yr = +slider.value; });
      app.querySelectorAll("input[name=dt]").forEach(function (r) { r.addEventListener("change", function () { dt = r.value; }); });
      if (more) document.getElementById("hint").addEventListener("click", function () { shown++; render(true); });
      document.getElementById("g").addEventListener("submit", function (e) {
        e.preventDefault();
        afterGuess(c, yr, (app.querySelector("input[name=dt]:checked") || {}).value, shown - 1);
      });
    }
    render(false);
  }

  function yearPoints(miss) { return Math.max(0, 100 - 20 * miss); }
  function outcomeCorrect(c, oc) { return oc === c.outcome.value || (c.outcome.also_accept || []).indexOf(oc) >= 0; }
  function scored(c) { return c.outcome.scored !== false; }

  function responsesList(c) {
    var items = (c.responses || []).map(function (x) {
      return "<li><strong>" + esc(x.party) + ":</strong> " + esc(x.summary) + badge(x) + (x.url ? ' <span class="links-out">(' + link(x) + ")</span>" : "") + "</li>";
    }).join("");
    return items ? "<h3>What they said</h3><ul>" + items + "</ul>" : '<p class="links-out">No response from the people or companies involved was found in the sources checked.</p>';
  }

  function afterGuess(c, y, dt, hints) {
    var miss = Math.abs(y - year(c));
    var r = {
      id: c.id, title: c.title, year: year(c), guess: y, miss: miss, hints: hints, scored: scored(c),
      yearPts: yearPoints(miss), dtScored: c.data_type_scored !== false, dtOk: dt === c.data_type, outcomeOk: null, points: 0
    };
    if (!r.dtScored) r.dtOk = false;
    r.points = Math.max(0, r.yearPts + (r.dtOk ? 50 : 0) - hints * HINT_COST);
    var cls = miss === 0 ? "hit" : miss <= 2 ? "near" : "miss";
    var heads = c.headlines.filter(function (h) { return !r.scored || h.phase !== "aftermath"; })
      .map(function (h, k) { return clipping(c, h, k, false); }).join("");
    show(progress("what happened") +
      '<div class="result-line reveal-in">' +
        "<span>It broke in <strong>" + year(c) + "</strong>. You said " + y + ' · <span class="' + cls + '">' + (miss === 0 ? "exactly right" : miss + (miss === 1 ? " year off" : " years off")) + '</span> <span class="pts">+' + r.yearPts + "</span></span>" +
        (r.dtScored ? '<span>Data: <span class="' + (r.dtOk ? "hit" : "miss") + '">' + (r.dtOk ? "right" : "it was " + esc(typeLabel(c.data_type)).toLowerCase()) + '</span> <span class="pts">+' + (r.dtOk ? 50 : 0) + "</span></span>" : "") +
        (hints ? '<span>Hints <span class="pts">−' + hints * HINT_COST + "</span></span>" : "") +
      "</div>" +
      heads +
      '<section class="section reveal-in"><h2>What happened</h2>' +
        '<p class="prose">' + esc(txt(c.what_happened)) + badge(c.what_happened) + "</p>" +
        '<dl class="facts"><dt>Involved</dt><dd>' + esc((c.companies || []).join(", ")) + "</dd><dt>Date</dt><dd>" + esc(fmtDate(c.date)) + "</dd></dl>" +
        (c.contested ? '<p class="disputed">Disputed: the people or companies involved contest this account.</p>' + responsesList(c) : "") +
      "</section>" +
      (r.scored ?
        '<form id="o" class="section"><fieldset><legend>What changed afterward for the company or practice involved?</legend><div class="choices">' +
          OUTCOMES.map(function (o, k) {
            return '<label class="choice"><input type="radio" name="oc" value="' + o[0] + '"' + (k === 0 ? " required" : "") + "> " + esc(o[1]) + "</label>";
          }).join("") +
        '</div></fieldset><div class="btn-row"><button class="btn" type="submit">Lock in</button></div></form>'
      :
        '<section class="section"><p class="notice">What changed after this case is still being checked, so it isn\'t scored.</p>' +
        '<div class="btn-row"><button class="btn" id="see">See what changed</button></div></section>'));
    if (r.scored) {
      document.getElementById("o").addEventListener("submit", function (e) {
        e.preventDefault();
        var oc = app.querySelector("input[name=oc]:checked").value;
        r.outcomeGuess = oc;
        r.outcomeOk = outcomeCorrect(c, oc);
        r.points = Math.max(0, r.yearPts + (r.dtOk ? 50 : 0) + (r.outcomeOk ? 50 : 0) - hints * HINT_COST);
        state.results.push(r);
        outcome(c, r);
      });
    } else {
      document.getElementById("see").addEventListener("click", function () { state.results.push(r); outcome(c, r); });
    }
  }

  /* ---------- the chain: earlier and later cases, drawn as cut-out fragments joined by arrows (after Debord & Jorn's The Naked City) ---------- */
  function byYear(ids) {
    return ids.map(function (id) { return state.byId[id]; }).filter(Boolean)
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }
  function chainNode(x, role) {
    return '<div class="frag-wrap" data-role="' + role + '" data-year="' + year(x) + '">' +
      '<div class="frag node' + (role === "now" ? " now" : "") + '" style="--yr:' + yearColor(year(x)) + '">' +
      "<b>" + year(x) + "</b>" + esc(x.title) + "</div></div>";
  }
  function chainMap(c) {
    var pre = byYear(vals(c.precedents)), rec = byYear(vals(c.recurrences));
    var col = function (nodes, role, label) {
      return '<div class="col ' + role + '-col">' + (nodes.length ? '<p class="col-label">' + label + "</p>" : "") +
        nodes.map(function (x) { return chainNode(x, role); }).join("") + "</div>";
    };
    var listed = pre.concat([c]).concat(rec);
    return '<div class="chainmap" aria-hidden="true">' +
        '<svg class="arrows"></svg>' +
        '<div class="cols">' + col(pre, "pre", "Earlier cases") + col([c], "now", "This card") + col(rec, "rec", "Later cases") + "</div>" +
      "</div>" +
      '<ol class="visually-hidden">' + listed.map(function (x) {
        return "<li>" + year(x) + ": " + esc(x.title) + (x === c ? " (this card)" : "") + "</li>";
      }).join("") + "</ol>";
  }
  function drawArrows() {
    var map = app.querySelector(".chainmap");
    if (!map) return;
    var svg = map.querySelector("svg.arrows");
    var box = map.getBoundingClientRect();
    var now = map.querySelector('[data-role="now"]');
    var pairs = [];
    map.querySelectorAll('[data-role="pre"]').forEach(function (n) { pairs.push([n, now]); });
    map.querySelectorAll('[data-role="rec"]').forEach(function (n) { pairs.push([now, n]); });
    var NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";
    var defs = document.createElementNS(NS, "defs");
    svg.appendChild(defs);
    pairs.forEach(function (p, k) {
      var a = p[0].getBoundingClientRect(), b = p[1].getBoundingClientRect();
      var x1, y1, x2, y2, d;
      if (b.left >= a.right - 4) {
        // side by side: right edge to left edge
        x1 = a.right - box.left - 4; y1 = a.top + a.height / 2 - box.top;
        x2 = b.left - box.left - 12; y2 = b.top + b.height / 2 - box.top;
        var mx = (x1 + x2) / 2;
        if (document.documentElement.classList.contains("debord")) {
          // a Naked City swoop: overshoot upward and come down into the next piece
          var lift = Math.max(40, Math.abs(x2 - x1) * 0.45);
          d = "M" + x1 + " " + y1 + " C " + (x1 + 40) + " " + (y1 - lift) + ", " + (x2 - 60) + " " + (y2 - lift) + ", " + x2 + " " + y2;
        } else {
          d = "M" + x1 + " " + y1 + " C " + mx + " " + y1 + ", " + mx + " " + y2 + ", " + x2 + " " + y2;
        }
      } else {
        // stacked: each arrow runs down its own lane in the left gutter, so arrows never pass behind other cards
        var debx = document.documentElement.classList.contains("debord");
        var gx = debx ? 12 + (k % 3) * 13 : 7 + (k % 3) * 8, r = debx ? 12 : 9;
        x1 = a.left - box.left + 2; y1 = a.top + a.height * 0.5 - box.top;
        var into = pairs.filter(function (q) { return q[1] === p[1]; }), slot = into.indexOf(p);
        x2 = b.left - box.left - 10; y2 = b.top + b.height * 0.5 - box.top + (slot - (into.length - 1) / 2) * 26;
        d = "M" + x1 + " " + y1 + " L" + (gx + r) + " " + y1 + " Q" + gx + " " + y1 + " " + gx + " " + (y1 + r) +
            " L" + gx + " " + (y2 - r) + " Q" + gx + " " + y2 + " " + (gx + r) + " " + y2 + " L" + x2 + " " + y2;
      }
      var deb = document.documentElement.classList.contains("debord");
      var c1 = deb ? "var(--mark)" : yearColor(+p[0].dataset.year), c2 = deb ? getComputedStyle(document.documentElement).getPropertyValue("--mark").trim() : yearColor(+p[1].dataset.year);
      if (deb) c1 = c2;
      var g = document.createElementNS(NS, "linearGradient");
      g.setAttribute("id", "chain-g" + k); g.setAttribute("gradientUnits", "userSpaceOnUse");
      g.setAttribute("x1", x1); g.setAttribute("y1", y1); g.setAttribute("x2", x2); g.setAttribute("y2", y2);
      g.innerHTML = '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>';
      var m = document.createElementNS(NS, "marker");
      m.setAttribute("id", "chain-m" + k); m.setAttribute("viewBox", "0 0 10 10"); m.setAttribute("refX", "4"); m.setAttribute("refY", "5");
      m.setAttribute("markerWidth", deb ? "3.2" : "2.4"); m.setAttribute("markerHeight", deb ? "3.2" : "2.4"); m.setAttribute("orient", "auto");
      m.innerHTML = '<path d="M0 0L10 5L0 10z" fill="' + c2 + '"/>';
      defs.appendChild(g); defs.appendChild(m);
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", "url(#chain-g" + k + ")");
      path.setAttribute("stroke-width", deb ? (b.left >= a.right - 4 ? "15" : "9") : "8"); path.setAttribute("stroke-linecap", deb ? "butt" : "round"); path.setAttribute("stroke-linejoin", "round");
      if (deb) path.setAttribute("filter", "url(#cut)");
      path.setAttribute("marker-end", "url(#chain-m" + k + ")");
      svg.appendChild(path);
    });
  }
  var chainObserver = typeof ResizeObserver === "function" ? new ResizeObserver(function () { drawArrows(); }) : null;
  window.addEventListener("resize", drawArrows);

  function outcome(c, r) {
    var last = state.i === state.round.length - 1;
    var hasLinks = vals(c.precedents).length || vals(c.recurrences).length;
    var choices = r.scored ? OUTCOMES.map(function (o) {
      var right = o[0] === c.outcome.value || (c.outcome.also_accept || []).indexOf(o[0]) >= 0;
      var cls = right ? "correct" : o[0] === r.outcomeGuess ? "wrong" : "";
      var tag = right ? "What happened" : o[0] === r.outcomeGuess ? "Your guess" : "";
      return "<li class=\"choice " + cls + '">' + esc(o[1]) + (tag ? '<span class="tag">' + tag + "</span>" : "") + "</li>";
    }).join("") : "";
    var sources = (c.sources || []).map(function (s) {
      return "<li>" + esc(s.label) + (s.url ? " (" + link(s) + ")" : "") + "</li>";
    }).join("");
    var notes = (state.review[c.id] || {}).verify || [];
    var hasCommentary = c.commentary && c.commentary.text;

    show(progress("what changed") +
      '<div class="result-line reveal-in">' +
        (r.scored ? '<span>What changed: <span class="' + (r.outcomeOk ? "hit" : "miss") + '">' + (r.outcomeOk ? "right" : "not quite") + '</span> <span class="pts">+' + (r.outcomeOk ? 50 : 0) + "</span></span>" : "<span>What changed: not scored</span>") +
        '<span>This card <span class="pts">' + r.points + "</span></span></div>" +
      '<h2 class="headline-title">' + esc(c.title) + "</h2>" +
      (r.scored ? '<ul class="choices outcome-list">' + choices + "</ul>" + (isDraft(c.outcome) ? '<p class="links-out">Outcome category' + badge(c.outcome) + "</p>" : "") : "") +
      '<section class="section"><h2>What actually changed</h2><p class="prose">' + esc(txt(c.outcome_detail)) + badge(c.outcome_detail) + "</p>" +
        (r.scored ? c.headlines.filter(function (h) { return h.phase === "aftermath"; }).map(function (h, k) { return clipping(c, h, 100 + k, false).replace("Another headline", "Later headline"); }).join("") : "") +
      "</section>" +
      (hasLinks ?
        '<section class="section"><h2 class="detourne"><s>Unprecedented</s> <em>Who could have known?</em></h2>' +
          chainMap(c) +
          (isDraft(c.precedents) || isDraft(c.recurrences) ? '<p class="links-out">Links between cases' + badge(isDraft(c.precedents) ? c.precedents : c.recurrences) + "</p>" : "") +
        "</section>" : "") +
      (!c.contested ? '<section class="section">' + responsesList(c) + "</section>" : "") +
      (hasCommentary ? '<section class="section"><h2>From the authors</h2><p class="prose">' + esc(c.commentary.text) + "</p></section>" : authorSlot("commentary on this case")) +
      (c.book_refs && c.book_refs.length ? '<p class="links-out">In <cite>Data Power</cite>: ' + c.book_refs.map(function (b) { return (/[–,-]/.test(b.pages) ? "pp. " : "p. ") + esc(b.pages); }).join("; ") + ' (<a href="https://doi.org/10.2307/j.ctv249sg9w" rel="noopener noreferrer">open access</a>)</p>' : "") +
      (sources ? '<section class="section"><h3>Sources</h3><ul class="links-out">' + sources + "</ul></section>" : "") +
      (REVIEW && notes.length ? '<div class="verify"><strong>To verify</strong><ul>' + notes.map(function (v) { return "<li>" + esc(v) + "</li>"; }).join("") + "</ul></div>" : "") +
      '<div class="btn-row"><button class="btn" id="next">' + (last ? "See your results" : "Next card") + "</button></div>");
    var map = app.querySelector(".chainmap");
    if (map) {
      requestAnimationFrame(drawArrows);
      if (chainObserver) { chainObserver.disconnect(); chainObserver.observe(map); }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawArrows);
    }
    document.getElementById("next").addEventListener("click", function () {
      if (last) return end();
      state.i++;
      guess();
    });
  }

  function end() {
    var res = state.results;
    var total = res.reduce(function (s, r) { return s + r.points; }, 0);
    var max = res.reduce(function (s, r) { return s + 100 + (r.dtScored ? 50 : 0) + (r.scored ? 50 : 0); }, 0);
    var avg = res.reduce(function (s, r) { return s + r.miss; }, 0) / res.length;
    var years = res.map(function (r) { return r.miss === 0 ? "🟩" : r.miss <= 2 ? "🟨" : "⬜"; }).join("");
    var changed = res.map(function (r) { return !r.scored ? "➖" : r.outcomeOk ? "✅" : "❌"; }).join("");
    var share = "Who Could Have Known? " + total + "/" + max + "\nYear  " + years + "\nWhat changed  " + changed + "\nAverage miss: " + avg.toFixed(1) + " years\n" + shareUrl();
    show(
      '<section class="reveal-in results">' + blot(YEAR_MIN + 8, "blot-c") +
        '<h1 class="visually-hidden" tabindex="-1" data-focus>Your results</h1>' +
        '<p class="kicker">Your score</p><p class="final-score">' + total + " <span>/ " + max + "</span></p>" +
        "<p>On average your year guess was <strong>" + avg.toFixed(1) + " years</strong> off.</p>" +
        '<div class="share-grid" aria-hidden="true">' + years + "<br>" + changed + "</div>" +
        authorSlot("end-of-round reflection") +
        '<section class="section"><h2>Your round</h2><ul class="recap">' +
          res.map(function (r) {
            return '<li data-year="' + r.year + '" style="--yr:' + yearColor(r.year) + '"><span class="yr">' + r.year + "</span><span>" + esc(r.title) + '</span><span class="pts">' + r.points + "</span></li>";
          }).join("") +
        "</ul></section>" +
        '<section class="section"><h3 id="share-h">Share (nothing is sent anywhere until you paste it)</h3><textarea class="share-text" rows="5" readonly aria-labelledby="share-h">' + esc(share) + "</textarea>" +
          '<div class="btn-row"><button class="btn secondary" id="copy">Copy</button><button class="btn" id="again">Play another round</button></div></section>' +
      "</section>"
    );
    document.getElementById("copy").addEventListener("click", function (e) {
      var t = app.querySelector(".share-text");
      var ok = function () { e.target.textContent = "Copied"; announce("Copied to clipboard"); };
      var fallback = function () {
        t.select();
        var done = false;
        try { done = document.execCommand("copy"); } catch (err) { done = false; }
        if (done) ok(); else { e.target.textContent = "Select and copy the text above"; announce("Copy failed. Select the text and copy it."); }
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t.value).then(ok, fallback); else fallback();
    });
    document.getElementById("again").addEventListener("click", function () {
      if (!state.setTitle) state.round = buildRound();
      state.i = 0; state.results = []; guess();
    });
  }

  /* ---------- theme ---------- */
  var toggle = document.getElementById("theme-toggle");
  function syncToggle() { toggle.setAttribute("aria-pressed", document.documentElement.dataset.theme === "dark" ? "true" : "false"); }
  syncToggle();
  toggle.addEventListener("click", function () {
    var t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("wchk-theme", t); } catch (e) {}
    syncToggle();
    app.querySelectorAll("[data-year]").forEach(function (el) {
      var target = el.querySelector(".node") || el;
      target.style.setProperty("--yr", yearColor(+el.dataset.year));
    });
    drawArrows();
  });

  /* ---------- boot ---------- */
  if (REVIEW) document.getElementById("review-banner").hidden = false;
  Promise.all([
    fetch("./data/cases.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("./data/sets.json").then(function (r) { return r.json(); }).catch(function () { return { sets: [] }; }),
    REVIEW ? fetch("./data/review.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }) : Promise.resolve({})
  ]).then(function (res) {
    state.all = res[0].cases || [];
    state.all.forEach(function (c) { state.byId[c.id] = c; });
    state.sets = res[1].sets || [];
    state.review = res[2] || {};
    symmetrizeLinks();
    state.round = buildRound();
    if (!state.round.length) { show('<p tabindex="-1" data-focus>There are no playable cards yet.</p>'); return; }
    intro();
  }).catch(function () {
    show('<p tabindex="-1" data-focus>Couldn\'t load the cases. If you opened this file directly, serve the folder over HTTP instead (for example <code>python3 -m http.server</code>).</p>');
  });
})();
