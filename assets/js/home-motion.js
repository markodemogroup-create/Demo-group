/* =============================================================================
   Demo Group — home-motion.js (homepage only)
   Two small, independent progressive enhancements. Nothing here fetches,
   resizes or swaps an image, and nothing is ever left hidden.

   1. Hero entrance gated on REAL image readiness (Hero V2 corrections,
      2026-09-16). The stylesheet shows the finished static arrangement by
      default; the inline head snippet adds html.home-hero-wait only when
      motion is allowed, and this module then decides per product:
        · an image counts as ready on its load event, or — when already
          cached — when complete && naturalWidth > 0; decode() is only a hint
          bounded to 200 ms (it can hang, reject or not exist);
        · images that become ready within 250 ms of each other enter as one
          group with the approved centre → left → right stagger (.is-in
          .is-staggered — delays live in CSS); an image ready later gets its
          own entrance (.is-in) at that moment, never an animation that has
          already finished on an empty wrapper;
        · a failed image is shown at once (.is-shown: alt text and link stay
          accessible, no replacement artwork); a wrapper still waiting after
          3 s is shown as it is, and still gets its entrance if the image
          arrives afterwards; the stylesheet's own 3 s failsafe covers the
          case where this script never runs;
        · reduced motion (initial or a live change) shows everything without
          motion; classes are set once, so scroll, resize, hover and back-
          forward restoration never restart a finished entrance.
   2. One short entrance for below-fold homepage sections the first time they
      scroll into view. Strict progressive enhancement:
        · without this script, or if reduced motion is on, IntersectionObserver
          is missing or observer creation throws, nothing is ever hidden;
        · only sections that are entirely below the viewport when the script
          runs receive "is-pending" (hidden by CSS while <html> has
          "home-motion"); everything already on screen is left alone;
        · a section is revealed by the observer, by receiving focus (keyboard
          users never tab into an invisible control), by a fragment navigation,
          by a scroll-position fallback, or when the page is being hidden;
        · there is NO global timer that reveals everything early, so entrances
          still happen if the reader waits before scrolling;
        · a live change to prefers-reduced-motion reveals everything at once.
   ========================================================================== */
(function () {
  "use strict";
  var root = document.documentElement;

  /* ---- 1. hero entrance, coordinated with actual image readiness ---------- */
  (function heroEntrance() {
    if (!root.classList.contains("home-hero-wait")) return;      /* gate absent: static arrangement is already on screen */
    var ungate = function () { root.classList.remove("home-hero-wait"); };
    var items = Array.prototype.slice.call(document.querySelectorAll(".home-hero__scene .home-hero__item"));
    if (!items.length) { ungate(); return; }
    try {
      var GATHER = 250, CAP = 3000, DECODE_WAIT = 200;
      var mq = null;
      try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch (e) { mq = null; }
      var state = items.map(function (li) { return { li: li, img: li.querySelector("img"), ready: false, failed: false, done: false }; });
      var phase = "idle", gatherTimer = null, capTimer = null;

      function settled(s) { return s.ready || s.failed || s.done; }
      function allSettled() { for (var i = 0; i < state.length; i++) if (!settled(state[i])) return false; return true; }
      function finishIfDone() {
        for (var i = 0; i < state.length; i++) if (!state[i].done) return;
        if (gatherTimer) clearTimeout(gatherTimer);
        if (capTimer) clearTimeout(capTimer);
        if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
      }
      function show(s, final) {                                     /* visible at once, no motion */
        s.li.classList.remove("is-in", "is-staggered");
        s.li.classList.add("is-shown");
        if (final) { s.done = true; finishIfDone(); }
      }
      function enter(s, staggered) {                                /* its own entrance, from now, on real pixels */
        if (s.done) return;
        s.done = true;
        s.li.classList.remove("is-shown");
        if (staggered) s.li.classList.add("is-staggered");
        s.li.classList.add("is-in");
        finishIfDone();
      }
      function showAll() { state.forEach(function (s) { if (!s.done) show(s, true); }); }
      function onMq(e) { if (e.matches) showAll(); }
      if (mq && mq.matches) { showAll(); return; }
      if (mq && mq.addEventListener) mq.addEventListener("change", onMq);

      function flushGroup() {
        gatherTimer = null;
        phase = "done";
        state.forEach(function (s) { if (s.ready && !s.done) enter(s, true); });
      }
      function onReady(s) {
        if (s.done) return;
        s.ready = true;
        if (phase === "done") { enter(s, false); return; }        /* late arrival: own entrance, no stagger */
        if (phase === "idle") { phase = "gathering"; gatherTimer = setTimeout(flushGroup, GATHER); }
        if (allSettled()) { clearTimeout(gatherTimer); flushGroup(); }
      }
      function onFailed(s) {
        if (s.done) return;
        s.failed = true;
        show(s, true);
        if (phase === "gathering" && allSettled()) { clearTimeout(gatherTimer); flushGroup(); }
      }
      function decodeThen(s, cb) {                                  /* decode() is a hint with a hard 200 ms bound */
        var img = s.img, called = false;
        function go() { if (called) return; called = true; cb(); }
        if (img && typeof img.decode === "function") {
          var t = setTimeout(go, DECODE_WAIT);
          try { img.decode().then(function () { clearTimeout(t); go(); }, function () { clearTimeout(t); go(); }); }
          catch (e) { clearTimeout(t); go(); }
        } else { go(); }
      }
      function watch(s) {
        var img = s.img;
        if (!img) { show(s, true); return; }
        if (img.complete) {                                         /* cached, or already failed */
          if (img.naturalWidth > 0) decodeThen(s, function () { onReady(s); }); else onFailed(s);
          return;
        }
        img.addEventListener("load", function () { decodeThen(s, function () { onReady(s); }); }, { once: true });
        img.addEventListener("error", function () { onFailed(s); }, { once: true });
      }
      state.forEach(watch);
      capTimer = setTimeout(function () {                          /* bounded wait: show what is still pending, keep listening */
        capTimer = null;
        state.forEach(function (s) { if (!s.done && !s.li.classList.contains("is-shown")) show(s, false); });
      }, CAP);
    } catch (e) { ungate(); }
  })();

  /* ---- 2. below-fold section reveal --------------------------------------- */
  var targets = Array.prototype.slice.call(document.querySelectorAll("[data-home-reveal]"));
  if (!targets.length) return;
  var mq = null;
  try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch (e) { mq = null; }
  if ((mq && mq.matches) || !("IntersectionObserver" in window)) return;

  var io = null, pending = [];
  function reveal(el) {
    var i = pending.indexOf(el);
    if (i < 0) return;
    pending.splice(i, 1);
    el.classList.remove("is-pending");
    el.classList.add("is-in");
    if (io) { try { io.unobserve(el); } catch (e) {} }
    if (!pending.length) teardown();
  }
  function revealAll() { pending.slice().forEach(reveal); }
  function teardown() {
    if (io) { try { io.disconnect(); } catch (e) {} io = null; }
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("hashchange", revealAll);
    window.removeEventListener("pagehide", revealAll);
    document.removeEventListener("focusin", onFocus);
    if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      var vh = window.innerHeight || 0;
      pending.slice().forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) reveal(el); });
    });
  }
  function onFocus(e) { var el = e.target && e.target.closest ? e.target.closest("[data-home-reveal]") : null; if (el) reveal(el); }
  function onMq(e) { if (e.matches) revealAll(); }

  try {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) reveal(en.target); });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
  } catch (e) { return; }

  var vh = window.innerHeight || 0;
  targets.forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.top >= vh) { pending.push(el); }        /* only what is entirely below the fold */
  });
  if (!pending.length || window.location.hash) { pending = []; teardown(); return; }
  root.classList.add("home-motion");              /* the stylesheet may hide pending sections only from here on */
  pending.forEach(function (el) { el.classList.add("is-pending"); io.observe(el); });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("hashchange", revealAll);
  window.addEventListener("pagehide", revealAll);
  document.addEventListener("focusin", onFocus);
  if (mq && mq.addEventListener) mq.addEventListener("change", onMq);
})();
