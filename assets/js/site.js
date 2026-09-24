/* =============================================================================
   Demo Group — site.js
   Shared behaviour for every page: navigation, drawer, modals, forms.
   No dependencies.
   ========================================================================== */
(function () {
  "use strict";

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),' +
                  'select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* -- 1. Desktop services dropdown --------------------------------------- */
  $$(".nav__item").forEach(function (item) {
    var trigger = $(".nav__trigger", item);
    var panel = $(".nav__panel", item);
    if (!trigger || !panel) return;

    var closeTimer;
    var pinned = false;      /* opened by click — hover-out must not close it */

    function open(state) {
      window.clearTimeout(closeTimer);
      item.dataset.open = state ? "true" : "false";
      trigger.setAttribute("aria-expanded", state ? "true" : "false");
      if (!state) pinned = false;
    }
    function delayedClose() {
      if (pinned) return;
      closeTimer = window.setTimeout(function () { open(false); }, 140);
    }

    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      var next = item.dataset.open !== "true" || !pinned;
      open(next);
      pinned = next;
    });
    item.addEventListener("mouseenter", function () { open(true); });
    item.addEventListener("mouseleave", delayedClose);
    item.addEventListener("focusin", function () { open(true); });
    item.addEventListener("focusout", function () {
      window.setTimeout(function () {
        if (!item.contains(document.activeElement)) open(false);
      }, 0);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && item.dataset.open === "true") {
        /* focus first: moving focus back to the trigger fires focusin, which
           would otherwise re-open the panel we just closed */
        trigger.focus();
        open(false);
      }
    });
    document.addEventListener("click", function (e) {
      if (!item.contains(e.target)) open(false);
    });
  });

  /* -- 2. Overlay controller (drawer, modals) ------------------------------ */
  /* Handles: body lock, focus trap, Escape, focus restore. */
  var openOverlay = null;
  var lastFocused = null;

  function trapFocus(e) {
    if (!openOverlay || e.key !== "Tab") return;
    var nodes = $$(FOCUSABLE, openOverlay).filter(function (n) {
      return n.offsetParent !== null || n === document.activeElement;
    });
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* The hamburger mirrors the navigation drawer's real state on every route —
     toggle, close button, backdrop, menu link, Escape, or being replaced by
     another overlay — so aria-expanded can never go stale. Other overlays
     (lightbox, cart drawer) leave it alone. */
  function syncNavToggle(el, open) {
    if (!el || el.id !== "drawer") return;
    var t = $(".nav-toggle");
    if (t) t.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function show(el, focusTarget) {
    if (openOverlay) hide(openOverlay);
    lastFocused = document.activeElement;
    el.hidden = false;
    document.body.classList.add("is-locked");
    openOverlay = el;
    syncNavToggle(el, true);
    window.requestAnimationFrame(function () {
      var target = focusTarget || $(FOCUSABLE, el);
      if (target) target.focus();
    });
  }

  function hide(el) {
    el.hidden = true;
    syncNavToggle(el, false);
    if (openOverlay === el) {
      openOverlay = null;
      document.body.classList.remove("is-locked");
      if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
    }
  }

  document.addEventListener("keydown", function (e) {
    if (!openOverlay) return;
    if (e.key === "Escape") { e.preventDefault(); hide(openOverlay); }
    else trapFocus(e);
  });

  window.dgOverlay = { show: show, hide: hide };

  /* -- 3. Mobile drawer ---------------------------------------------------- */
  var drawer = $("#drawer");
  var toggle = $(".nav-toggle");
  if (drawer && toggle) {
    toggle.addEventListener("click", function () {
      /* aria-expanded is kept in step by show()/hide() themselves */
      if (!drawer.hidden) hide(drawer);
      else show(drawer, $(".drawer__close", drawer));
    });
    $$("[data-drawer-close], .drawer__panel a", drawer).forEach(function (el) {
      el.addEventListener("click", function () { hide(drawer); });
    });
  }

  /* -- 4. Product preselect ------------------------------------------------ */
  /* Links may carry ?proizvod=… so the quote form on the target page opens
     with the right product already chosen. */
  (function () {
    var wanted = new URLSearchParams(window.location.search).get("proizvod");
    if (!wanted) return;
    $$("[data-product-select]").forEach(function (select) {
      var match = $$("option", select).filter(function (o) {
        return o.value.toLowerCase() === wanted.toLowerCase();
      })[0];
      if (match) select.value = match.value;
    });
  })();

  /* -- 4b. Quantity preselect ---------------------------------------------- */
  /* The cart links to a product's inquiry with ?kolicina=N when the wanted
     quantity exceeds current stock; the field is prefilled, never overwritten. */
  (function () {
    var qty = null;
    try { qty = new URLSearchParams(window.location.search).get("kolicina"); } catch (e) { qty = null; }
    if (!qty || !/^\d{1,6}$/.test(qty)) return;
    var field = document.querySelector('form.form input[name="Količina ili tiraž"]');
    if (field && !field.value) field.value = qty;
  })();

  /* -- 5. Forms ------------------------------------------------------------ */
  var MAX_BYTES = 10 * 1024 * 1024;
  var FILE_HINT = "PDF, JPG, PNG, ZIP, RAR, AI, EPS ili CDR · do 10 MB";

  $$("form.form").forEach(function (form) {
    var status = $(".form__status", form);
    var fileInput = $('input[type="file"]', form);
    var fileName = $("[data-file-name]", form);

    /* file size guard */
    if (fileInput && fileName) {
      fileInput.addEventListener("change", function () {
        var file = fileInput.files[0];
        if (status) status.textContent = "";
        if (!file) { fileName.textContent = FILE_HINT; return; }
        if (file.size > MAX_BYTES) {
          if (status) status.textContent = "Fajl je veći od 10 MB. Dodajte Drive ili WeTransfer link u poruku.";
          fileInput.value = "";
          fileName.textContent = FILE_HINT;
          return;
        }
        var size = file.size < 1048576
          ? Math.ceil(file.size / 1024) + " KB"
          : (file.size / 1048576).toFixed(1) + " MB";
        fileName.textContent = file.name + " · " + size;
      });
    }

    /* at least one contact method (phone OR email) */
    var phone = form.querySelector('input[type="tel"]');
    var email = form.querySelector('input[type="email"]');
    if (phone && email) {
      form.addEventListener("submit", function (e) {
        if (!phone.value.trim() && !email.value.trim()) {
          e.preventDefault();
          if (status) status.textContent = "Unesite broj telefona ili e-adresu da bismo mogli da odgovorimo.";
          phone.focus();
        }
      });
    }

    /* prevent double submission — but never lock the button on a submission
       that our own validation just blocked */
    form.addEventListener("submit", function (e) {
      if (e.defaultPrevented) return;
      var submit = $('button[type="submit"]', form);
      if (submit && !submit.disabled) {
        window.setTimeout(function () {
          submit.disabled = true;
          submit.dataset.label = submit.textContent;
          submit.textContent = "Šaljemo…";
        }, 0);
      }
    });
  });

  /* -- 6. Client wall: show all -------------------------------------------- */
  $$("[data-clients-toggle]").forEach(function (btn) {
    var grid = $("#" + btn.getAttribute("data-clients-toggle"));
    if (!grid) return;
    btn.addEventListener("click", function () {
      var collapsed = grid.getAttribute("data-collapsed") === "true";
      grid.setAttribute("data-collapsed", collapsed ? "false" : "true");
      btn.textContent = collapsed ? "Prikaži manje" : btn.getAttribute("data-label-more");
    });
  });

  /* -- 7. Reveal on first appearance --------------------------------------- */
  /* One motion device for the whole site: a short rise the first time an
     element scrolls into view. It never repeats and never runs if the person
     has asked for reduced motion. */
  (function () {
    var targets = $$("[data-reveal]");
    if (!targets.length) return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    targets.forEach(function (el) {
      /* anything already on screen at load appears immediately */
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add("is-in");
      } else {
        io.observe(el);
      }
    });
  })();

  /* -- 8. Mark the current nav item ---------------------------------------- */
  (function () {
    var here = window.location.pathname.replace(/index\.html$/, "");
    $$(".nav > a, .nav__col a").forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) !== "/") return;
      if (href === here) a.setAttribute("aria-current", "page");
    });
  })();
})();
