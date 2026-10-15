/* Teacher page: curated sets and a custom-set builder. */
(function () {
  "use strict";
  var REVIEW = new URLSearchParams(location.search).has("review");
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var base = new URL("./", location.href).href;

  function copy(input, btn) {
    input.select();
    var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy link"; }, 1500); };
    var fallback = function () { var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} if (ok) done(); else btn.textContent = "Select and copy"; };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(input.value).then(done, fallback); else fallback();
  }

  Promise.all([
    fetch("./data/cases.json").then(function (r) { return r.json(); }),
    fetch("./data/sets.json").then(function (r) { return r.json(); })
  ]).then(function (res) {
    var cases = res[0].cases.filter(function (c) { return c.playable; });
    var byId = {};
    cases.forEach(function (c) { byId[c.id] = c; });

    document.getElementById("sets").innerHTML = res[1].sets.map(function (s) {
      var url = base + "?set=" + encodeURIComponent(s.id);
      var draft = s.selection && s.selection.by === "claude" && s.selection.status !== "approved";
      return '<article class="set-card"><div class="frag-wrap"><div class="frag">' +
        "<h2>" + esc(s.title) + (draft ? ' <span class="badge">drafted by Claude</span>' : "") + "</h2>" +
        (s.description && s.description.text ? '<p class="prose">' + esc(s.description.text) + "</p>" : (REVIEW ? '<div class="author-slot">Author slot: set description (empty)</div>' : "")) +
        "<ol>" + s.cases.map(function (id) { var c = byId[id]; return c ? "<li>" + esc(c.title) + " (" + c.date.slice(0, 4) + ")</li>" : ""; }).join("") + "</ol>" +
        (s.discussion_prompts && s.discussion_prompts.text ? '<p class="prose">' + esc(s.discussion_prompts.text) + "</p>" : (REVIEW ? '<div class="author-slot">Author slot: discussion prompts (empty)</div>' : "")) +
        '<div class="copy-row"><input readonly value="' + esc(url) + '" aria-label="Link to ' + esc(s.title) + '"><button class="btn secondary" type="button" data-copy>Copy link</button><a class="btn" href="' + esc(url) + '">Play it</a></div>' +
        "</div></div></article>";
    }).join("");
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copy(b.previousElementSibling, b); });
    });

    var picked = [];
    var builder = document.getElementById("builder");
    var out = document.getElementById("custom-url");
    var play = document.getElementById("custom-play");
    function update() {
      var url = base + (picked.length ? "?cases=" + picked.join(",") : "");
      out.value = url; play.href = url;
      builder.querySelectorAll("input").forEach(function (i) {
        var n = picked.indexOf(i.value);
        i.nextElementSibling.textContent = n >= 0 ? String(n + 1) : "";
      });
    }
    builder.innerHTML = cases.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (c) {
      return '<label><input type="checkbox" value="' + esc(c.id) + '"><span class="pts"></span>' + esc(c.date.slice(0, 4)) + " · " + esc(c.title) + "</label>";
    }).join("");
    builder.querySelectorAll("input").forEach(function (i) {
      i.addEventListener("change", function () {
        if (i.checked) picked.push(i.value); else picked = picked.filter(function (x) { return x !== i.value; });
        update();
      });
    });
    document.getElementById("custom-copy").addEventListener("click", function (e) { copy(out, e.target); });
    update();
  }).catch(function () {
    document.getElementById("sets").innerHTML = "<p>Couldn't load the sets. Serve this folder over HTTP rather than opening the file directly.</p>";
  });

  var toggle = document.getElementById("theme-toggle");
  function syncToggle() { toggle.setAttribute("aria-pressed", document.documentElement.dataset.theme === "dark" ? "true" : "false"); }
  syncToggle();
  toggle.addEventListener("click", function () {
    var t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("wchk-theme", t); } catch (e) {}
    syncToggle();
  });
})();
