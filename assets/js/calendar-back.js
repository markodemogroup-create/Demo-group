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

   A recorded Navigation API entry is traversed for an explicit return. When
   unavailable, a one-shot restoration follows the filtered layout dependencies.
   Native Back/Forward and reload restoration remain browser-owned.
   ========================================================================== */
(function () {
  "use strict";
  var KEY = "dgKalBack", FLAG = "dgKalBackRestore", CHAIN_MAX = 12, FLAG_MAX_AGE = 60000;
  var LISTING = /^\/kalendari\/(?:(?:7-lista|4-lista|stoni|poslovni)\/)?(?:index\.html)?$/;
  var PRODUCT = /^\/kalendari\/[a-z0-9-]+\/index\.html$/;
  var PARAMS = { vrsta: 1, q: 1, tema: 1, format: 1, sort: 1, upit: 1 };

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
      return { entryKey: typeof o.entryKey === "string" ? o.entryKey : null, url: u.pathname + u.search, y: (typeof o.y === "number" && isFinite(o.y) && o.y > 0) ? Math.floor(o.y) : 0, chain: o.chain.slice() };
    } catch (e) { return null; }
  }
  function write(ctx) { try { sessionStorage.setItem(KEY, JSON.stringify({ url: ctx.url, y: ctx.y, chain: ctx.chain, entryKey: ctx.entryKey || null, t: Date.now() })); } catch (e) {} }
  function plainClick(e) { return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !e.defaultPrevented; }
  function cardOf(e) { return e.target && e.target.closest ? e.target.closest("a.card--product") : null; }

  /* --- product page: retarget the link only when this product is part of the recorded journey --- */
  var link = document.querySelector("a[data-kal-back]");
  if (link) {
    var ctx = read();
    if (ctx && ctx.chain.indexOf(here()) !== -1) {
      link.href = ctx.url;
      link.setAttribute("data-kal-back-context", "listing");
      link.addEventListener("click", function (e) {
        if (!plainClick(e)) return;
        // Return to the exact recorded history entry, preserving the browser's
        // scroll/layout restoration rather than creating a new page at y=0.
        if (ctx.entryKey && window.navigation && window.navigation.entries) {
          var entries = window.navigation.entries(), current = window.navigation.currentEntry;
          var destination = entries.filter(function (entry) { return entry.key === ctx.entryKey; })[0];
          if (current && destination && destination.index < current.index) {
            e.preventDefault(); history.go(destination.index - current.index); return;
          }
        }
        try { sessionStorage.setItem(FLAG, String(Date.now())); } catch (err) {}
      });
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
  window.dgKalRestoreHandler = true;
  function rememberPosition() {
    if (window.dgKalRestore || location.hash) return;
    var state = Object.assign({}, history.state || {});
    state.dgKalScroll = { url: location.pathname + location.search, y: Math.round(scrollY) };
    try { history.replaceState(state, ""); } catch (e) {}
  }
  window.addEventListener("pagehide", rememberPosition);
  document.addEventListener("click", function (e) {
    var a = cardOf(e); if (!a) return;
    var p = productPath(a.getAttribute("href")); if (!p) return;
    rememberPosition();
    write({ entryKey: window.navigation && window.navigation.currentEntry ? window.navigation.currentEntry.key : null, url: location.pathname + location.search, y: Math.round(window.scrollY), chain: [p] });
  }, true);

  var restore = false;
  try {
    var stamp = sessionStorage.getItem(FLAG);
    if (stamp !== null) { sessionStorage.removeItem(FLAG); var age = Date.now() - Number(stamp); restore = stamp === "1" || (isFinite(age) && age >= 0 && age <= FLAG_MAX_AGE); }
  } catch (e) {}
  var back = restore ? read() : null;
  var target = !window.dgKalRestoreAbandoned && (window.dgKalRestore || (back && back.url === location.pathname + location.search ? back : null));
  if (!target || location.hash) {
    delete window.dgKalRestore;
    document.documentElement.classList.remove("kal-restoring");
    return;
  }
  // The catalogue filters run synchronously. Network resources must never
  // hold the page hidden; the head's DOMContentLoaded handler restores and
  // reveals after the browser has applied its native history restoration.
})();
