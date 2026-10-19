/* ===========================================================================
 * accessibility.js — the "Make it easier" toolbar at the top of the page.
 *
 * Four switches, each remembered on the student's own device:
 *   font   – easy-read font (Lexend) with extra letter and line spacing
 *   big    – bigger text everywhere
 *   calm   – softer colours, no floating blobs, no animations
 *   cb     – colour-blind mode: Z/X letters on every spider
 * plus "read aloud", which speaks the guide tips (and card text on request)
 * using the browser's built-in voice.
 *
 * Other scripts use window.A11Y:
 *   A11Y.colourBlind()  → true when colour-blind mode is on
 *   A11Y.announce(html) → reads a guide tip aloud if read-aloud is on
 *   A11Y.speak(text)    → reads any text aloud
 * and can listen for the "a11ychange" event on document.
 * ======================================================================== */
(function () {
  "use strict";

  const STORE_KEY = "qlv-a11y";
  const SWITCHES = ["font", "big", "calm", "cb", "read"];
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const root = document.documentElement;

  /* ---- saved settings (wrapped in try/catch: storage can be blocked) ---- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (_) { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
  }

  const settings = load();

  /* ---- apply one setting to the page ---- */
  function apply(name, on) {
    root.classList.toggle("a11y-" + name, on);
    if (name === "font" && on) loadEasyFont();
    if (name === "read" && !on && canSpeak) window.speechSynthesis.cancel();
    document.querySelectorAll('[data-a11y="' + name + '"]').forEach((b) =>
      b.setAttribute("aria-pressed", on ? "true" : "false"));
  }

  let fontLoaded = false;
  function loadEasyFont() {
    if (fontLoaded) return;
    fontLoaded = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap";
    document.head.appendChild(link);
  }

  /* ---- reading aloud ---- */
  // Turn maths symbols into words so the voice says them properly.
  function speakable(text) {
    return text
      .replace(/\|([01]+)⟩/g, (_, bits) => " ket " + bits.split("").join(" ") + " ")
      .replace(/(\d*)π\/(\d+)/g, (_, n, d) => (n ? n + " " : "") + "pi over " + d)
      .replace(/π/g, " pi ")
      .replace(/(\d+)\/(\d+)/g, "$1 $2")          // 50/50 → "50 50"
      .replace(/[✨🎲🧭▶✕⚠🎯]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function speak(text) {
    if (!canSpeak) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.lang = "en-GB";
    u.rate = 0.95;
    const voice = synth.getVoices().find((v) => v.lang === "en-GB");
    if (voice) u.voice = voice;
    synth.speak(u);
  }

  function htmlToText(html) {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent || "";
  }

  /* ---- public helpers for app.js ---- */
  window.A11Y = {
    colourBlind: () => !!settings.cb,
    reading: () => !!settings.read && canSpeak,
    speak: speak,
    announce(html) { if (settings.read && canSpeak) speak(htmlToText(html)); },
  };

  /* ---- keep the sticky toolbar from covering things we scroll to ---- */
  function trackBarHeight(bar) {
    const setH = () => root.style.setProperty("--a11y-h", bar.offsetHeight + "px");
    setH();
    if ("ResizeObserver" in window) new ResizeObserver(setH).observe(bar);
    else window.addEventListener("resize", setH);
  }

  /* ---- wire up the toolbar and the "Listen" buttons ---- */
  function init() {
    const bar = document.querySelector(".a11y-bar");
    if (!bar) return;

    if (!canSpeak) {
      document.querySelectorAll('[data-a11y="read"], .listen-btn, #guide-speak')
        .forEach((el) => { el.hidden = true; });
    }

    bar.querySelectorAll("[data-a11y]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.a11y;
        settings[name] = !settings[name];
        save(settings);
        apply(name, settings[name]);
        if (name === "read" && settings[name]) speak("Read aloud is on.");
        document.dispatchEvent(new CustomEvent("a11ychange", { detail: { name: name, on: settings[name] } }));
      });
    });

    // "🔊 Listen" on each concept card reads its heading and text.
    document.querySelectorAll(".listen-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".card");
        const title = card.querySelector("h3").textContent;
        const body = card.querySelector("p").textContent;
        speak(title + ". " + body);
      });
    });

    // 🔊 replay button inside the playground guide tip
    const replay = document.getElementById("guide-speak");
    if (replay) replay.addEventListener("click", () =>
      speak(document.getElementById("guide-text").textContent));

    trackBarHeight(bar);
  }

  // Apply saved settings straight away (this script loads before the page is
  // drawn), then wire up the buttons once the page exists.
  SWITCHES.forEach((name) => { if (settings[name]) root.classList.add("a11y-" + name); });
  if (settings.font) loadEasyFont();
  document.addEventListener("DOMContentLoaded", () => {
    SWITCHES.forEach((name) => apply(name, !!settings[name]));
    init();
  });
})();
