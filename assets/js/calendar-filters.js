/* =============================================================================
   Demo Group — calendar-filters.js
   Search, theme filter and sorting for one catalogue grid on a category page.

   Markup contract (see /kalendari/stoni/ and /kalendari/4-lista/):
     <form data-kal-filter data-kal-catalog="#id-of-grid" hidden>
       input[name="q"]      search by product name (type="search")
       select[name="tema"]  "" = all themes, otherwise a theme id
       select[name="format"] OPTIONAL (desk category): "" = all formats, otherwise
                            a format id matched against data-kal-format
     [data-kal-type-chips] a[data-kal-type]  OPTIONAL (all-calendar catalog): chips that
                            link to the category pages; with JavaScript a click filters
                            the grid in place by data-kal-type ("" = all) instead;
                            the "" chip ("Svi") clears every criterion
       select[name="sort"]  "" = original order, "az" = name A–Ž
       button[type="reset"] full reset
       [data-kal-status]    polite results line "Prikazano: X od Y"
     </form>
     <div id="…" data-kal-catalog data-kal-year="2027"> direct children a.card
       each card: data-kal-theme="orthodox|nature|tradition", name in <h3>,
                  optional data-kal-format="uspravni|polozeni", data-kal-type="7|4|stoni|poslovni",
                  optional data-kal-alias="…" (former names, searchable but never shown)
     [data-kal-empty]       zero-result message, hidden until needed

   Only direct children of the catalogue root are touched; cards are hidden
   with the `hidden` attribute or re-appended to change order, never cloned.
   The form is revealed only after a successful initialisation, so without
   JavaScript (or if this file fails) the page keeps every card, in its
   original order, and no dead controls.

   State lives in the address (replaceState, never a new history entry):
     ?vrsta=7|4|stoni|poslovni  ?q=…  ?tema=…  ?format=…  ?sort=az
   Every value is validated against the controls on the page; unknown values
   are ignored. The state is applied before the first paint (this file runs
   before DOMContentLoaded), so a filtered address, a reload and Back/Forward
   restore the same cards AND the browser's own scroll position lands on the
   same layout. While the document is restoring, the stylesheet's smooth
   scrolling is switched off so no animated travel through the catalogue.
   ========================================================================== */
(function () {
  "use strict";

  var forms = Array.prototype.slice.call(document.querySelectorAll("form[data-kal-filter]"));
  if (!forms.length) return;

  /* ---- no animated scroll restoration ---------------------------------- */
  /* html{scroll-behavior:smooth} also animates the position the browser
     restores on reload / Back / Forward and the initial "#fragment" jump.
     An inline "auto" during load prevents that; it is released shortly after
     load, or at the first user input, so anchor links stay smooth. */
  var docEl = document.documentElement;
  var released = false;
  function releaseScroll() {
    if (released) return;
    released = true;
    try { docEl.style.scrollBehavior = ""; } catch (e) {}
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach(function (t) {
      window.removeEventListener(t, releaseScroll, true);
    });
  }
  try {
    docEl.style.scrollBehavior = "auto";
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach(function (t) {
      window.addEventListener(t, releaseScroll, true);
    });
    var afterLoad = function () { window.setTimeout(releaseScroll, 700); };
    if (document.readyState === "complete") afterLoad(); else window.addEventListener("load", afterLoad);
  } catch (e) { released = true; }

  /* ---- text normalisation --------------------------------------------- */
  /* Serbian Cyrillic → the same Latin ASCII representation as normalised
     Latin: đ/Ђ → dj, љ → lj, њ → nj, џ → dž → dz; š č ć ž lose their marks. */
  var CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "dj", "е": "e", "ж": "z",
    "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj", "м": "m", "н": "n",
    "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "ћ": "c", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "c", "џ": "dz", "ш": "s"
  };
  var LAT = { "š": "s", "đ": "dj", "č": "c", "ć": "c", "ž": "z" };

  function normalize(text) {
    var s = String(text == null ? "" : text).toLowerCase();
    /* single-code-point Latin digraphs (ǆ ǉ ǌ and their title/upper forms) */
    s = s.replace(/[Ǆǅǆ]/g, "dz").replace(/[Ǉǈǉ]/g, "lj").replace(/[Ǌǋǌ]/g, "nj");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += LAT[ch] || CYR[ch] || ch;
    }
    if (out.normalize) out = out.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return out.replace(/[^a-z0-9]+/g, " ").replace(/^ +| +$/g, "");
  }

  function tokens(text) {
    var n = normalize(text);
    return n ? n.split(" ") : [];
  }

  /* ---- sorting ---------------------------------------------------------- */
  var collator = null;
  try { collator = new Intl.Collator("sr-Latn", { sensitivity: "base", numeric: true }); } catch (e) { collator = null; }
  function compareNames(a, b) {
    if (collator) return collator.compare(a, b);
    return a.localeCompare(b);
  }

  /* ---- address state ---------------------------------------------------- */
  var PARAMS = ["vrsta", "q", "tema", "format", "sort"];
  function readUrl() {
    var p = {};
    try {
      var u = new URLSearchParams(window.location.search);
      PARAMS.forEach(function (k) { var v = u.get(k); if (v != null) p[k] = String(v); });
    } catch (e) {}
    return p;
  }
  function writeUrl(state) {
    try {
      var u = new URLSearchParams();
      PARAMS.forEach(function (k) { if (state[k]) u.set(k, state[k]); });
      var qs = u.toString();
      var next = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
      var cur = window.location.pathname + window.location.search + window.location.hash;
      if (next !== cur && window.history && window.history.replaceState) {
        window.history.replaceState(window.history.state, "", next);
      }
    } catch (e) { /* file:// or a sandbox that forbids it — filtering still works */ }
  }
  function hasOption(sel, value) {
    if (!sel || !value) return false;
    var opts = sel.options;
    if (!opts || typeof opts.length !== "number") return false;
    for (var i = 0; i < opts.length; i++) if (opts[i].value === value) return true;
    return false;
  }

  /* ---- one catalogue ---------------------------------------------------- */
  function setup(form) {
    var root = form.dataset.kalCatalog ? document.querySelector(form.dataset.kalCatalog) : null;
    if (!root) return false;
    var cards = Array.prototype.slice.call(root.children).filter(function (el) {
      return el.classList && el.classList.contains("card");
    });
    if (!cards.length) return false;

    var q = form.querySelector('input[name="q"]');
    var theme = form.querySelector('select[name="tema"]');
    var format = form.querySelector('select[name="format"]');      /* optional: only the desk category has it */
    var typeChips = Array.prototype.slice.call(document.querySelectorAll("[data-kal-type-chips] [data-kal-type]"));   /* optional: all-calendar catalog */
    var typeId = "";
    var countEl = document.querySelector("[data-kal-count]");
    var sort = form.querySelector('select[name="sort"]');
    var status = form.querySelector("[data-kal-status]");
    var empty = document.querySelector("[data-kal-empty]");
    if (!q || !theme || !sort) return false;
    /* optional small-screen group: theme + sorting behind a "Filteri" toggle
       (markup: [data-kal-more] wrapper, [data-kal-more-toggle] button with a
       [data-kal-active-count] badge). Search and reset stay visible. Without
       these elements everything below is a no-op. */
    var more = null, toggle = null, badge = null;
    try {
      more = form.querySelector("[data-kal-more]");
      toggle = form.querySelector("[data-kal-more-toggle]");
      badge = toggle ? toggle.querySelector("[data-kal-active-count]") : null;
    } catch (err) { more = null; toggle = null; badge = null; }        /* optional markup: absent is fine */
    var small = null;
    try { small = (more && toggle && window.matchMedia) ? window.matchMedia("(max-width: 640px)") : null; } catch (err) { small = null; }
    var userOpened = false;
    function setOpen(open) {
      if (!more || !toggle) return;
      more.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    function syncSmall() {
      if (!more || !toggle) return;
      if (small && small.matches) { if (!userOpened) setOpen(false); }
      else setOpen(true);                                    /* wide screens: every control visible */
    }
    function optionLabel(sel) {
      var o = sel && sel.options ? sel.options[sel.selectedIndex] : null;
      /* the visible option carries a trailing " — <count>"; the status line does not repeat the count */
      return o ? String(o.textContent || o.text || "").replace(/\s+/g, " ").replace(/\s+—\s+\d+$/, "").trim() : "";
    }
    function themeLabel() { return optionLabel(theme); }

    var year = root.dataset.kalYear || "";

    /* index once: name, search haystack (name + year + former names), numeric tokens, original position */
    var items = cards.map(function (card, i) {
      var h = card.querySelector("h3");
      var name = h ? h.textContent.replace(/\s+/g, " ").trim() : "";
      var alias = card.dataset.kalAlias || "";
      var hayTokens = tokens(name + " " + year + " " + alias);
      return {
        el: card,
        index: i,
        name: name,
        theme: card.dataset.kalTheme || "",
        format: card.dataset.kalFormat || "",
        type: card.dataset.kalType || "",
        hay: " " + hayTokens.join(" ") + " ",
        numbers: hayTokens.filter(function (t) { return /^\d+$/.test(t); })
      };
    });
    var total = items.length;

    function matches(item, queryTokens, themeId, formatId) {
      if (typeId && item.type !== typeId) return false;
      if (themeId && item.theme !== themeId) return false;
      if (formatId && item.format !== formatId) return false;
      for (var i = 0; i < queryTokens.length; i++) {
        var t = queryTokens[i];
        if (/^\d+$/.test(t)) {
          if (item.numbers.indexOf(t) < 0) return false;      /* whole numeric token only */
        } else if (item.hay.indexOf(t) < 0) {
          return false;                                       /* substring of the name */
        }
      }
      return true;
    }

    function chipFor(id) {
      return typeChips.filter(function (c) { return (c.dataset.kalType || "") === id; })[0] || null;
    }
    function setType(id) {
      typeId = id;
      typeChips.forEach(function (c) {
        var on = (c.dataset.kalType || "") === id;
        c.classList.toggle("kal-chip--on", on);
        if (on) c.setAttribute("aria-current", "page"); else c.removeAttribute("aria-current");
      });
      if (countEl) countEl.textContent = (typeId ? items.filter(function (it) { return it.type === typeId; }).length : total) + " modela za 2027.";
    }

    function apply(persist) {
      var queryTokens = tokens(q.value);
      var themeId = theme.value;
      var formatId = format ? format.value : "";
      var order = items.slice();
      if (sort.value === "az") {
        order.sort(function (a, b) {
          var c = compareNames(a.name, b.name);
          return c !== 0 ? c : a.index - b.index;
        });
      }
      var shown = 0;
      order.forEach(function (item) {
        var on = matches(item, queryTokens, themeId, formatId);
        item.el.hidden = !on;
        if (on) shown++;
        root.appendChild(item.el);                              /* move, never clone */
      });
      var active = (formatId ? 1 : 0) + (themeId ? 1 : 0) + (sort.value ? 1 : 0);
      var detail = "";
      if (typeId) { var chip = chipFor(typeId); detail += " · Vrsta: " + (chip ? chip.textContent.replace(/\s+/g, " ").trim() : typeId); }
      if (formatId) detail += " · Format: " + optionLabel(format);
      if (themeId) detail += " · Tema: " + themeLabel();
      if (sort.value === "az") detail += " · Sortiranje: naziv A–Ž";
      if (status) status.textContent = "Prikazano: " + shown + " od " + total + detail;
      if (empty) empty.hidden = shown !== 0;
      if (toggle) toggle.setAttribute("data-active", String(active));
      if (badge) badge.textContent = String(active);
      /* "default" = nothing narrows the catalogue; phones then fold the result-count/reset row (CSS §29),
         the live status stays in the accessibility tree */
      form.setAttribute("data-kal-state", (active || typeId || queryTokens.length) ? "filtered" : "default");
      if (persist !== false) {
        writeUrl({ vrsta: typeId, q: q.value.replace(/\s+/g, " ").trim().slice(0, 60), tema: themeId, format: formatId, sort: sort.value === "az" ? "az" : "" });
      }
    }

    /* address → controls (validated against what this page actually offers) */
    function loadFromUrl() {
      var p = readUrl();
      q.value = typeof p.q === "string" ? p.q.replace(/\s+/g, " ").trim().slice(0, 60) : "";
      theme.value = hasOption(theme, p.tema) ? p.tema : "";
      if (format) format.value = hasOption(format, p.format) ? p.format : "";
      sort.value = p.sort === "az" && hasOption(sort, "az") ? "az" : "";
      if (typeChips.length) setType(p.vrsta && chipFor(p.vrsta) ? p.vrsta : "");
    }

    /* ---- events (all scoped to this form) ---- */
    var timer = null, composing = false;
    function cancel() {
      if (timer) { window.clearTimeout(timer); timer = null; }
    }
    function schedule() {
      if (composing) return;
      cancel();
      timer = window.setTimeout(function () {
        timer = null;
        if (composing) return;                                  /* IME still open: wait for compositionend */
        apply();
      }, 120);
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });
    q.addEventListener("input", schedule);
    q.addEventListener("search", schedule);                     /* native clear control */
    q.addEventListener("compositionstart", function () { composing = true; cancel(); });   /* drop any pending pre-IME update */
    q.addEventListener("compositionend", function () { composing = false; schedule(); });
    theme.addEventListener("change", function () { apply(); });
    if (format) format.addEventListener("change", function () { apply(); });
    /* type chips: the links keep working without JavaScript (they open the category page);
       with it they select a type in place; the "Svi" chip clears every criterion */
    typeChips.forEach(function (c) {
      c.addEventListener("click", function (e) {
        e.preventDefault();
        var id = c.dataset.kalType || "";
        if (!id) { form.reset(); return; }                      /* the reset handler restores everything, then the grid */
        setType(id);
        apply();
      });
    });
    sort.addEventListener("change", function () { apply(); });
    form.addEventListener("reset", function (e) {
      /* native reset restores the defaults first, then the grid follows */
      window.setTimeout(function () {
        if (timer) { window.clearTimeout(timer); timer = null; }
        if (typeChips.length) setType("");
        apply();
        if (e.isTrusted) q.focus();
      }, 0);
    });
    /* Back/Forward between two addresses of this page (hash or query) */
    try {
      window.addEventListener("popstate", function () { cancel(); loadFromUrl(); apply(false); });
    } catch (err) {}

    if (toggle && more) {
      toggle.addEventListener("click", function () {
        var open = !!more.hidden;
        userOpened = open;
        setOpen(open);
        if (open) { try { (format || theme).focus(); } catch (err) {} }
      });
      if (small && small.addEventListener) small.addEventListener("change", syncSmall);
      else if (small && small.addListener) small.addListener(syncSmall);
    }

    loadFromUrl();                                              /* address state first (validated) */
    apply(false);                                               /* initial: the address's cards, before first paint; address untouched */
    syncSmall();                                                /* phones: theme/sorting folded, search + reset visible */
    if (toggle && more && small && small.matches && (theme.value || (format && format.value) || sort.value)) {
      userOpened = true; setOpen(true);                         /* a filtered address on a phone shows its active controls */
    }
    form.hidden = false;
    return true;
  }

  forms.forEach(function (form) {
    try { setup(form); } catch (e) { /* leave the form hidden and the grid untouched */ }
  });
})();
