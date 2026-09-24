/* =============================================================================
   Demo Group — calendar.js
   Product gallery for the desk calendar catalogue.

   Entirely data-driven: the stage reads its image folder from
   data-base on [data-calendar], and each thumbnail carries its own
   data-kal-item / data-kal-label. Adding a calendar model requires no change
   to this file.

   File naming it expects (see build/convert_calendar.py):
     <base>/predlist.webp            cover, single panel
     <base>/<nn>-prednja.webp        month, calendar side
     <base>/<nn>-zadnja.webp         month, reverse side

   data-mode="shot" instead stages one composed product photograph per sheet
   from <base>/mockup/<nn>.webp. Such a collection may add data-zoom="mockup"
   when it ships no flat artwork, which points the lightbox at that same file.

   Per-thumbnail OPT-IN (read only when present; every existing collection
   keeps the behaviour above unchanged):
     data-kal-alt="…"          explicit alt text for the staged sheet and its
                               enlargement (no "prednja i poleđina" suffix)
     data-kal-zoom-src="…"     lightbox source, relative to data-base
                               (e.g. zoom/01.webp), shown as ONE frame
     data-kal-sheet="…"        caption line under the enlargement
   Used by wall calendars whose sheets carry several months and have no
   cover and no back side, e.g. the four-sheet B3 models.
   ========================================================================== */
(function () {
  "use strict";

  var stage = document.querySelector("[data-calendar]");
  if (!stage) return;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var base    = stage.dataset.base;
  var shotMode = stage.dataset.mode === "shot";
  var zoomMockup = stage.dataset.zoom === "mockup";
  var shot    = $(".kal-shot", stage);
  var name    = stage.dataset.name || "";
  var label   = $("[data-kal-now]", stage);
  var thumbs  = $$(".kal-thumb");
  var pieces  = $$(".kal-piece", stage);
  var index   = 0;
  var strip   = thumbs.length ? thumbs[0].parentNode : null;

  if (!thumbs.length || (!pieces.length && !shot)) return;

  /* Keep the chosen thumbnail inside its own horizontal strip. Unlike
     scrollIntoView() this never asks the document to scroll vertically, so
     the page stays where the reader left it; the strip scrolls only as far
     as needed, and not at all during initialisation. */
  function reveal(t) {
    if (!strip) return;
    var s = strip.getBoundingClientRect();
    var r = t.getBoundingClientRect();
    var pad = 8;
    var dx = 0;
    if (r.left < s.left + pad) dx = r.left - s.left - pad;
    else if (r.right > s.right - pad) dx = r.right - s.right + pad;
    if (!dx) return;
    /* no animation for reduced motion, and none while the document is not
       being shown (a background tab does not paint frames, so a smooth scroll
       would simply never arrive) */
    var instant = document.hidden ||
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof strip.scrollBy === "function") {
      try { strip.scrollBy({ left: dx, behavior: instant ? "auto" : "smooth" }); return; } catch (e) {}
    }
    strip.scrollLeft += dx;
  }

  function srcFor(item, single, side) {
    return base + "/" + (single ? "predlist" : item + "-" + side) + ".webp";
  }

  /* Two stacked <img> layers per panel let one decode fully before it is
     revealed, so a change never shows a half-painted or blank frame.

     Reveal paths, any one of which may finish the request first:
       1. img.decode() resolving (preferred: the frame is painted in full);
       2. the load event, or a synchronous cache hit, confirmed by
          complete && naturalWidth > 0;
       3. a bounded poll (every 100 ms, at most 15 s) that reveals the layer
          once the browser reports it complete — needed where decode() stays
          pending forever (background / hidden documents).
     A request finishes exactly once; its listeners and timer are removed on
     every exit. A newer request on the same panel cancels the older one, and
     going back to the frame already on screen cancels the one in flight.
     A load error leaves the previous good frame on screen and clears the
     broken layer, so nothing blank or broken is ever revealed. */
  var PAINT_POLL_MS = 100, PAINT_POLL_MAX = 150;

  function paint(piece, src, alt) {
    var a = $('[data-layer="a"]', piece);
    var b = $('[data-layer="b"]', piece);
    var showing = piece.dataset.showing === "b" ? b : a;
    var incoming = showing === a ? b : a;

    /* the most recent request wins */
    piece.dataset.want = src;
    if (piece.kalPending) { piece.kalPending(); piece.kalPending = null; }
    if (showing.getAttribute("src") === src) return;

    var settled = false, timer = null, ticks = 0;
    function cleanup() {
      settled = true;
      incoming.removeEventListener("load", onLoad);
      incoming.removeEventListener("error", onError);
      if (timer !== null) { window.clearInterval(timer); timer = null; }
      if (piece.kalPending === cancel) piece.kalPending = null;
    }
    function ready() { return incoming.complete && incoming.naturalWidth > 0; }
    function finish() {
      if (settled) return;
      if (!ready()) return;                       /* not a usable frame yet */
      cleanup();
      if (piece.dataset.want !== src) return;     /* superseded meanwhile */
      incoming.alt = alt;
      incoming.removeAttribute("aria-hidden");
      showing.setAttribute("aria-hidden", "true");
      piece.dataset.showing = incoming === b ? "b" : "a";
    }
    function fail() {
      if (settled) return;
      cleanup();
      if (piece.dataset.want !== src) return;
      /* keep the previous good frame; make sure the broken layer can never
         be mistaken for a loaded one */
      incoming.removeAttribute("src");
      incoming.alt = "";
      incoming.setAttribute("aria-hidden", "true");
    }
    function cancel() { if (!settled) cleanup(); }
    function onLoad() { finish(); }
    function onError() { fail(); }

    piece.kalPending = cancel;
    incoming.addEventListener("load", onLoad);
    incoming.addEventListener("error", onError);
    incoming.src = src;

    if (ready()) { finish(); return; }            /* synchronous cache hit */
    if (incoming.decode) {
      incoming.decode().then(finish, function () { /* rejected: load/error/poll decide */ });
    }
    timer = window.setInterval(function () {
      if (settled) { window.clearInterval(timer); timer = null; return; }
      if (incoming.complete) { if (incoming.naturalWidth > 0) finish(); else fail(); return; }
      if (++ticks >= PAINT_POLL_MAX) { window.clearInterval(timer); timer = null; }
    }, PAINT_POLL_MS);
  }

  function preload(i) {
    var t = thumbs[i];
    if (!t) return;
    var single = t.hasAttribute("data-kal-single");
    var item = t.dataset.kalItem;
    if (shotMode) {
      var m = new Image();
      m.src = base + "/mockup/" + item + ".webp";
      return;
    }
    [srcFor(item, single, "prednja"), srcFor(item, single, "zadnja")].forEach(function (src, n) {
      if (single && n === 1) return;
      var img = new Image();
      img.src = src;
    });
  }

  /* Rendered-mockup stage: one composed product image per sheet. */
  function selectShot(i, focusThumb, init) {
    index = (i + thumbs.length) % thumbs.length;
    var t = thumbs[index];
    var item = t.dataset.kalItem;
    var sheet = t.dataset.kalLabel;

    thumbs.forEach(function (x, n) {
      var on = n === index;
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
    });

    var alt = t.dataset.kalAlt ||
              (name + " — " + sheet.toLowerCase() +
               (t.hasAttribute("data-kal-single") ? "" : ", prednja i poleđina"));
    paint(shot, base + "/mockup/" + item + ".webp", alt);
    if (label) label.textContent = sheet;
    if (focusThumb) t.focus();
    if (!init) reveal(t);
    window.setTimeout(function () { preload(index + 1); preload(index - 1); }, 250);
  }

  /* init: true marks the page-load selection — state, label and image only,
     no strip scrolling and no focus, so a cold load or a #upit link lands
     exactly where the browser put it. */
  function select(i, focusThumb, init) {
    if (shotMode) return selectShot(i, focusThumb, init);
    index = (i + thumbs.length) % thumbs.length;
    var t = thumbs[index];
    var single = t.hasAttribute("data-kal-single");
    var item = t.dataset.kalItem;
    var sheet = t.dataset.kalLabel;

    thumbs.forEach(function (x, n) {
      var on = n === index;
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
    });

    stage.dataset.single = single ? "true" : "false";
    pieces[1].hidden = single;

    paint(pieces[0], srcFor(item, single, "prednja"), name + " — " + sheet +
          (single ? "" : ", kalendarska strana"));
    if (!single) {
      paint(pieces[1], srcFor(item, single, "zadnja"), name + " — " + sheet + ", poleđina");
    }

    if (label) label.textContent = sheet;
    if (focusThumb) t.focus();
    if (!init) reveal(t);

    /* keep the neighbours warm so arrow-browsing feels instant */
    window.setTimeout(function () { preload(index + 1); preload(index - 1); }, 250);
  }

  thumbs.forEach(function (t, i) {
    t.addEventListener("click", function () { select(i); });
    t.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); select(i + 1, true); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); select(i - 1, true); }
      if (e.key === "Home")       { e.preventDefault(); select(0, true); }
      if (e.key === "End")        { e.preventDefault(); select(thumbs.length - 1, true); }
    });
  });

  var prev = $(".kal-nav--prev", stage);
  var next = $(".kal-nav--next", stage);
  if (prev) prev.addEventListener("click", function () { select(index - 1); });
  if (next) next.addEventListener("click", function () { select(index + 1); });

  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") select(index + 1);
    if (e.key === "ArrowLeft") select(index - 1);
  });

  var touchX = null;
  stage.addEventListener("touchstart", function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) select(index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* --- enlarge in the shared lightbox ------------------------------------- */
  var lightbox = document.getElementById("lightbox");
  if (lightbox && window.dgOverlay) {
    var lbImage = $("[data-lightbox-image]", lightbox);
    var lbTitle = $("[data-lightbox-title]", lightbox);
    var lbMeta  = $("[data-lightbox-meta]", lightbox);
    var lbSide  = 0;

    function sideLabel(n, fallback) {
      if (!shotMode && pieces[n]) return pieces[n].querySelector("figcaption").textContent;
      return fallback;
    }

    function sides() {
      var t = thumbs[index];
      var single = t.hasAttribute("data-kal-single");
      var item = t.dataset.kalItem;
      /* A thumbnail that names its own enlargement (data-kal-zoom-src) is a
         single sheet with no back side: one frame, captioned by
         data-kal-sheet (or its label). Nothing below is reached for it. */
      if (t.dataset.kalZoomSrc) {
        return [{ src: base + "/" + t.dataset.kalZoomSrc,
                  label: t.dataset.kalSheet || t.dataset.kalLabel,
                  alt: t.dataset.kalAlt || "" }];
      }
      /* Collections that ship only rendered mockups declare data-zoom="mockup":
         the composed shot already carries both faces, so it is enlarged as one
         frame. Without the opt-in the flat-art pair is used exactly as before,
         so every collection that exports <nn>-prednja/-zadnja is unaffected. */
      if (zoomMockup) {
        return [{ src: base + "/mockup/" + item + ".webp",
                  label: single ? "Predlist" : "Prednja strana i poleđina" }];
      }
      var list = [{ src: srcFor(item, single, "prednja"), label: sideLabel(0, "Prednja strana") }];
      if (!single) {
        list.push({ src: srcFor(item, single, "zadnja"), label: sideLabel(1, "Poleđina") });
      }
      return list;
    }

    function renderLb() {
      var list = sides();
      lbSide = (lbSide + list.length) % list.length;
      var s = list[lbSide];
      lbImage.src = s.src;
      lbImage.alt = s.alt || (name + " — " + thumbs[index].dataset.kalLabel + ", " + s.label);
      lbTitle.textContent = name + " · " + thumbs[index].dataset.kalLabel;
      lbMeta.textContent = s.label;
      var many = list.length > 1;
      $(".lightbox__nav--prev", lightbox).hidden = !many;
      $(".lightbox__nav--next", lightbox).hidden = !many;
    }

    var zoomTargets = shotMode ? [shot] : pieces;
    zoomTargets.forEach(function (el, i) {
      $("[data-kal-zoom]", el).addEventListener("click", function () {
        lbSide = i;
        renderLb();
        window.dgOverlay.show(lightbox, $(".lightbox__close", lightbox));
      });
    });

    $$("[data-lightbox-close]", lightbox).forEach(function (el) {
      el.addEventListener("click", function () { window.dgOverlay.hide(lightbox); });
    });
    $(".lightbox__nav--prev", lightbox).addEventListener("click", function () { lbSide--; renderLb(); });
    $(".lightbox__nav--next", lightbox).addEventListener("click", function () { lbSide++; renderLb(); });
    document.addEventListener("keydown", function (e) {
      if (lightbox.hidden) return;
      if (e.key === "ArrowLeft") { lbSide--; renderLb(); }
      if (e.key === "ArrowRight") { lbSide++; renderLb(); }
    });
  }

  select(0, false, true);
})();
