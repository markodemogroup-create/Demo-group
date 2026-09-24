/* =============================================================================
   Demo Group — calendar-back.js
   "Nazad na izbor kalendara" on the 32 product pages.

   The link in the markup already points at the product's own category
   (works without JavaScript, with modified clicks and in new tabs). When the
   customer arrived from one of OUR calendar listings, this script points the
   link at THAT listing instead — with its search, filters, sorting (they live
   in the listing's URL, written by calendar-filters.js) and scroll position.

   Context is stored per tab (sessionStorage "dgKalBack") by the listing page
   when a product card is activated, together with the product it leads to.
   A product page accepts the context only after validation: same origin, a
   whitelisted calendar listing path, only the known filter parameters, AND the
   current product must be part of the recorded journey (listing → product →
   related products opened from product cards). A product reached any other
   way — typed address, menu, external link, a different family — falls back
   to the category link in the markup. Nothing else (referrer, history length,
   arbitrary URLs) is ever used as a destination.

   The position is restored on the listing only right after the back link was
   activated with a plain click; any user interaction (wheel, touch, pointer,
   keyboard) cancels a pending restoration. Native history restoration is not
   changed.
   ========================================================================== */
(function () {
  "use strict";
  var KEY = "dgKalBack", FLAG = "dgKalBackRestore", CHAIN_MAX = 12, FLAG_MAX_AGE = 60000;
  var LISTING = /^\/kalendari\/(?:(?:7-lista|4-lista|stoni|poslovni)\/)?(?:index\.html)?$/;
  var PRODUCT = /^\/kalendari\/[a-z0-9-]+\/index\.html$/;
  var PARAMS = { vrsta: 1, q: 1, tema: 1, format: 1, sort: 1 };

  function norm(p) { return /\/$/.test(p) ? p + "index.html" : p; }
  function here() { return norm(location.pathname); }
  /* normalised same-origin product path from an anchor href, or null */
  function productPath(href) {
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return null;
      var p = norm(u.pathname);
      return (PRODUCT.test(p) && !LISTING.test(p)) ? p : null;
    } catch (e) { return null; }
  }

  function read() {
    var raw = null;
    try { raw = sessionStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o.url !== "string" || !Array.isArray(o.chain) || !o.chain.length || o.chain.length > CHAIN_MAX) return null;
      var u = new URL(o.url, location.origin);
      if (u.origin !== location.origin || !LISTING.test(u.pathname)) return null;
      var ok = true;
      u.searchParams.forEach(function (v, k) { if (!PARAMS[k] || v.length > 80) ok = false; });
      if (!ok) return null;
      for (var i = 0; i < o.chain.length; i++) { if (typeof o.chain[i] !== "string" || !PRODUCT.test(o.chain[i]) || LISTING.test(o.chain[i])) return null; }
      return { url: u.pathname + u.search, y: (typeof o.y === "number" && isFinite(o.y) && o.y > 0) ? Math.floor(o.y) : 0, chain: o.chain.slice() };
    } catch (e) { return null; }
  }
  function write(ctx) { try { sessionStorage.setItem(KEY, JSON.stringify({ url: ctx.url, y: ctx.y, chain: ctx.chain, t: Date.now() })); } catch (e) {} }
  function plainClick(e) { return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !e.defaultPrevented; }
  function cardOf(e) { return e.target && e.target.closest ? e.target.closest("a.card--product") : null; }

  /* --- product page: retarget the link only when this product is part of the recorded journey --- */
  var link = document.querySelector("a[data-kal-back]");
  if (link) {
    var ctx = read();
    if (ctx && ctx.chain.indexOf(here()) !== -1) {
      link.href = ctx.url;
      link.setAttribute("data-kal-back-context", "listing");
      link.addEventListener("click", function (e) { if (!plainClick(e)) return; try { sessionStorage.setItem(FLAG, String(Date.now())); } catch (err) {} });
      /* related products opened from product cards continue the same journey */
      document.addEventListener("click", function (e) {
        var a = cardOf(e); if (!a) return;
        var p = productPath(a.getAttribute("href")); if (!p) return;
        var cur = read(); if (!cur || cur.chain.indexOf(here()) === -1) return;
        if (cur.chain.indexOf(p) === -1) { cur.chain.push(p); while (cur.chain.length > CHAIN_MAX) cur.chain.shift(); }
        write(cur);
      }, true);
    }
    return;
  }

  /* --- listing pages: remember where the customer left (and which product), restore on return --- */
  if (!LISTING.test(location.pathname)) return;
  document.addEventListener("click", function (e) {
    var a = cardOf(e); if (!a) return;
    var p = productPath(a.getAttribute("href")); if (!p) return;
    write({ url: location.pathname + location.search, y: Math.round(window.scrollY), chain: [p] });
  }, true);

  var restore = false;
  try {
    var stamp = sessionStorage.getItem(FLAG);
    if (stamp !== null) { sessionStorage.removeItem(FLAG); var age = Date.now() - Number(stamp); restore = stamp === "1" || (isFinite(age) && age >= 0 && age <= FLAG_MAX_AGE); }
  } catch (e) {}
  if (!restore) return;
  var back = read();
  if (!back || back.url !== location.pathname + location.search || !back.y) return;
  /* the filters are applied before first paint by calendar-filters.js; jump without animation, twice
     (lazy card images can still shift the layout a little during the first moments) — unless the
     customer starts scrolling or interacting first, which cancels whatever is still pending */
  var root = document.documentElement, prev = root.style.scrollBehavior, timers = [], done = false;
  var CANCEL = ["wheel", "touchstart", "pointerdown", "mousedown", "keydown"];
  function finish() {
    if (done) return;
    done = true;
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    for (var j = 0; j < CANCEL.length; j++) window.removeEventListener(CANCEL[j], finish, true);
    if (root.style.scrollBehavior === "auto") root.style.scrollBehavior = prev;
  }
  function jump() { if (!done) window.scrollTo(0, Math.min(back.y, Math.max(0, root.scrollHeight - window.innerHeight))); }
  root.style.scrollBehavior = "auto";
  for (var k = 0; k < CANCEL.length; k++) window.addEventListener(CANCEL[k], finish, { capture: true, passive: true });
  timers.push(window.setTimeout(jump, 40));
  timers.push(window.setTimeout(function () { jump(); finish(); }, 340));
})();
