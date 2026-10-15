/* Theme before first paint: ?theme=, then the last choice, then the OS. Loaded synchronously in <head>. */
(function () {
  var theme = new URLSearchParams(location.search).get("theme");
  try { theme = theme || localStorage.getItem("wchk-theme"); } catch (e) {}
  if (theme !== "light" && theme !== "dark") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  var look = new URLSearchParams(location.search).get("look");
  if (look !== "plain") document.documentElement.classList.add("debord");
})();
