/* =============================================================================
   Demo Group — gallery.js
   Enhances the server-rendered portfolio: category filters, in-card photo
   navigation, and the lightbox. The cards exist in the HTML, so the portfolio
   is visible without JavaScript and to crawlers.
   ========================================================================== */
(function () {
  "use strict";

  var grid = document.getElementById("work-grid");
  if (!grid) return;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var cards = $$(".work-card", grid);
  var lightbox = document.getElementById("lightbox");
  var lbImage = $("[data-lightbox-image]", lightbox);
  var lbTitle = $("[data-lightbox-title]", lightbox);
  var lbMeta = $("[data-lightbox-meta]", lightbox);

  /* Photo lists are declared on each card as data-photos="a|b|c" and
     data-rotations="0|180|0" so JS needs no duplicate copy of the dataset. */
  function photosOf(card) { return (card.dataset.photos || "").split("|").filter(Boolean); }
  function rotationsOf(card) { return (card.dataset.rotations || "").split("|"); }

  function paintCard(card, index) {
    var photos = photosOf(card);
    var img = $("img", card);
    img.src = card.dataset.base + photos[index] + ".webp";
    img.style.setProperty("--rotation", (rotationsOf(card)[index] || 0) + "deg");
    card.dataset.active = String(index);
    var count = $(".work-count", card);
    if (count) count.textContent = (index + 1) + " / " + photos.length;
  }

  /* -- in-card photo navigation ------------------------------------------- */
  grid.addEventListener("click", function (e) {
    var nav = e.target.closest(".work-nav");
    var card = e.target.closest(".work-card");
    if (!card) return;

    if (nav) {
      e.preventDefault();
      var photos = photosOf(card);
      var step = nav.classList.contains("work-nav--next") ? 1 : -1;
      var next = (Number(card.dataset.active || 0) + step + photos.length) % photos.length;
      paintCard(card, next);
      return;
    }
    if (e.target.closest(".work-card__open")) {
      e.preventDefault();
      openLightbox(card);
    }
  });

  /* -- lightbox ------------------------------------------------------------ */
  var lbCard = null;
  var lbIndex = 0;

  function renderLightbox() {
    var photos = photosOf(lbCard);
    var id = photos[lbIndex];
    lbImage.src = lbCard.dataset.base + id + ".webp";
    lbImage.alt = lbCard.dataset.title;
    lbImage.style.setProperty("--lightbox-rotation", (rotationsOf(lbCard)[lbIndex] || 0) + "deg");
    lbTitle.textContent = lbCard.dataset.title;
    lbMeta.textContent = lbCard.dataset.category + " · " + (lbIndex + 1) + " / " + photos.length;
    var multiple = photos.length > 1;
    $(".lightbox__nav--prev", lightbox).hidden = !multiple;
    $(".lightbox__nav--next", lightbox).hidden = !multiple;
  }

  function openLightbox(card) {
    lbCard = card;
    lbIndex = Number(card.dataset.active || 0);
    renderLightbox();
    window.dgOverlay.show(lightbox, $(".lightbox__close", lightbox));
  }

  function move(step) {
    var photos = photosOf(lbCard);
    lbIndex = (lbIndex + step + photos.length) % photos.length;
    renderLightbox();
  }

  $$("[data-lightbox-close]", lightbox).forEach(function (el) {
    el.addEventListener("click", function () { window.dgOverlay.hide(lightbox); });
  });
  $(".lightbox__nav--prev", lightbox).addEventListener("click", function () { move(-1); });
  $(".lightbox__nav--next", lightbox).addEventListener("click", function () { move(1); });

  document.addEventListener("keydown", function (e) {
    if (lightbox.hidden) return;
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "ArrowRight") move(1);
  });

  var touchX = 0;
  lightbox.addEventListener("touchstart", function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
  lightbox.addEventListener("touchend", function (e) {
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 55) move(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* -- category filters ---------------------------------------------------- */
  var filters = $$("[data-filter]");
  var countLabel = $("[data-work-count]");
  var moreWrap = document.getElementById("work-more");
  var moreButton = moreWrap ? $("button", moreWrap) : null;
  var emptyState = document.getElementById("work-empty");

  /* Serbian numeral agreement: 1 projekat / 2–4 projekta / 5+ projekata */
  function projekatForm(n) {
    if (n % 100 >= 11 && n % 100 <= 14) return "projekata";
    var r = n % 10;
    if (r === 1) return "projekat";
    if (r >= 2 && r <= 4) return "projekta";
    return "projekata";
  }

  var batch = function () {
    return window.matchMedia("(max-width: 640px)").matches ? 8
         : window.matchMedia("(max-width: 1200px)").matches ? 9 : 12;
  };
  var limit = batch();
  var active = "all";

  function refresh() {
    var shown = 0;
    var matching = 0;
    cards.forEach(function (card) {
      var match = active === "all" || card.dataset.category === active;
      if (match) matching++;
      var visible = match && shown < limit;
      card.hidden = !visible;
      if (visible) shown++;
    });
    if (countLabel) countLabel.textContent = matching + " " + projekatForm(matching);
    if (moreWrap) moreWrap.hidden = shown >= matching;
    if (emptyState) emptyState.hidden = matching !== 0;
  }

  filters.forEach(function (btn) {
    btn.addEventListener("click", function () {
      active = btn.getAttribute("data-filter");
      limit = batch();
      filters.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      refresh();
    });
  });

  if (moreButton) {
    moreButton.addEventListener("click", function () {
      limit += batch();
      refresh();
      });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var next = batch();
      if (next > limit) { limit = next; refresh(); }
    }, 180);
  });

  refresh();
})();
