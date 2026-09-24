/* =============================================================================
   Demo Group — calendar-inquiry.js
   Initial-anchor coordinator for the calendar inquiry section (Batch 9).

   Problem: on single-column screens the availability/cart blocks above the
   inquiry section render only after the shared inventory JSON has loaded, so
   a page opened directly at "#upit" lands where the section WAS before those
   blocks existed — a few hundred pixels too high.

   What this does (only on pages that opt in with <section id="upit"
   data-kal-inquiry>, only when the page opens with exactly "#upit", only in
   the single-column layout, only on a normal navigation):
     1. waits for the existing memoized window.dgInventory.load() promise to
        settle (resolve or reject) — no second fetch — with a finite fallback
        timeout for a request that never settles;
     2. then waits until the layout has actually stopped moving (the section's
        document offset and the scroll position unchanged for a few frames,
        bounded), so consumers have rendered and the native anchor scroll has
        finished;
     3. makes at most ONE instant correction to the section's position (using
        the real scroll-padding-top / sticky header geometry) if it is off.
   The user always wins: any wheel, touch, pointer, scrolling key, Tab,
   focus or typing inside the form, a hash change or leaving the page cancels
   the pending correction and removes every listener/timer/frame. The initial
   native anchor scroll itself is not treated as user intent (no "scroll"
   listener). Nothing is focused, no URL/history change, no polling loop.
   Progress is published on the section as data-kal-inquiry-state for QA.
   ========================================================================== */
(function () {
  "use strict";

  var section = document.querySelector('section#upit[data-kal-inquiry]');
  if (!section) return;
  function state(v) { section.setAttribute("data-kal-inquiry-state", v); }

  /* ---- activation gate ------------------------------------------------- */
  if (window.location.hash !== "#upit") { state("idle:no-fragment"); return; }
  var navEntry = null;
  try { navEntry = performance.getEntriesByType("navigation")[0] || null; } catch (e) { navEntry = null; }
  if (navEntry && navEntry.type === "back_forward") { state("idle:history"); return; }
  if (!window.matchMedia("(max-width: 1080px)").matches) { state("idle:two-column"); return; }

  var form = section.querySelector("form");
  var done = false, raf = 0, fallbackTimer = 0;
  var FALLBACK_MS = 6000;      /* inventory request that never settles */
  var SETTLE_MAX_MS = 2500;    /* layout/scroll stability wait after settle */
  var STABLE_FRAMES = 8;       /* consecutive unchanged frames before acting */
  var MIN_LIFETIME_MS = 350;   /* never act before the native anchor scroll has had a chance to start */
  var started = performance.now();

  /* ---- cancellation: the user takes control ---------------------------- */
  var SCROLL_KEYS = { ArrowDown: 1, ArrowUp: 1, PageDown: 1, PageUp: 1, Home: 1, End: 1, " ": 1, Spacebar: 1, Tab: 1 };
  function onWheel() { cancel("wheel"); }
  function onTouch() { cancel("touch"); }
  function onPointer() { cancel("pointer"); }
  function onKey(e) { if (SCROLL_KEYS[e.key]) cancel("key"); }
  function onFocus(e) { if (form && form.contains(e.target)) cancel("focus"); }
  function onInput() { cancel("input"); }
  function onHash() { if (window.location.hash !== "#upit") cancel("hash"); }
  function onHide() { cancel("pagehide"); }
  var opts = { passive: true, capture: true };
  window.addEventListener("wheel", onWheel, opts);
  window.addEventListener("touchstart", onTouch, opts);
  window.addEventListener("pointerdown", onPointer, opts);
  window.addEventListener("keydown", onKey, opts);
  document.addEventListener("focusin", onFocus, opts);
  if (form) form.addEventListener("input", onInput, opts);
  window.addEventListener("hashchange", onHash);
  window.addEventListener("pagehide", onHide);

  function cleanup() {
    window.removeEventListener("wheel", onWheel, opts);
    window.removeEventListener("touchstart", onTouch, opts);
    window.removeEventListener("pointerdown", onPointer, opts);
    window.removeEventListener("keydown", onKey, opts);
    document.removeEventListener("focusin", onFocus, opts);
    if (form) form.removeEventListener("input", onInput, opts);
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("pagehide", onHide);
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    if (fallbackTimer) { window.clearTimeout(fallbackTimer); fallbackTimer = 0; }
  }
  function cancel(reason) {
    if (done) return;
    done = true; cleanup();
    state("cancelled:" + reason);
  }

  /* ---- geometry: where the section should sit --------------------------- */
  function sectionTop() {
    /* offsetTop chain: layout position, unaffected by any reveal transform */
    var y = 0, el = section;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }
  function targetY() {
    var spt = parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return Math.min(max, Math.max(0, Math.round(sectionTop() - spt)));
  }

  /* ---- 1. wait for the shared inventory load to settle ------------------ */
  state("waiting:inventory");
  var inv = window.dgInventory;
  var settled;
  if (inv && typeof inv.load === "function") {
    settled = inv.load().then(function () { return "loaded"; }, function () { return "failed"; });
  } else {
    settled = Promise.resolve("no-inventory");
  }
  var fallback = new Promise(function (resolve) {
    fallbackTimer = window.setTimeout(function () { fallbackTimer = 0; resolve("timeout"); }, FALLBACK_MS);
  });
  Promise.race([settled, fallback]).then(function (why) {
    if (done) return;
    if (fallbackTimer) { window.clearTimeout(fallbackTimer); fallbackTimer = 0; }
    waitForStableLayout(why);
  });

  /* ---- 2. wait until layout and scroll have stopped moving -------------- */
  function waitForStableLayout(why) {
    state("waiting:layout:" + why);
    var start = performance.now();
    var lastTop = null, topStable = 0, lastScroll = window.scrollY, scrollStable = 0;
    function tick() {
      if (done) return;
      var top = sectionTop(), sy = window.scrollY;
      if (top === lastTop) topStable++; else { topStable = 0; lastTop = top; }
      if (Math.abs(sy - lastScroll) < 1) scrollStable++; else { scrollStable = 0; lastScroll = sy; }
      var settledEnough = topStable >= STABLE_FRAMES && scrollStable >= STABLE_FRAMES && performance.now() - started > MIN_LIFETIME_MS;
      if (settledEnough || performance.now() - start > SETTLE_MAX_MS) { finish(why); return; }
      raf = window.requestAnimationFrame(tick);
    }
    raf = window.requestAnimationFrame(tick);
  }

  /* ---- 3. at most one instant correction -------------------------------- */
  function finish(why) {
    if (done) return;
    done = true; cleanup();
    var target = targetY(), current = window.scrollY, delta = target - current;
    if (Math.abs(delta) > 4) {
      /* explicit "instant": the site sets html { scroll-behavior: smooth }, and
         "auto" would follow that CSS and animate — a second smooth scroll racing
         the native one. "instant" jumps in one frame regardless of the CSS, which
         is also what reduced-motion users expect (Batch 9.1 correction). */
      window.scrollTo({ top: target, left: 0, behavior: "instant" });
      state("corrected:" + why + ":" + Math.round(delta));
    } else {
      state("stable:" + why);
    }
  }
})();
