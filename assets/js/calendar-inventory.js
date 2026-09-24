/* =============================================================================
   Demo Group — calendar-inventory.js
   Availability and retail pricing for the calendar catalogue, read from ONE
   central file the owner edits:

     assets/data/calendar-inventory.json

   Page slots this script fills (all ship hidden and empty):

     <span class="avail" data-avail data-product-id="ikone" hidden></span>
       — compact badge on catalogue/featured cards; when the product is
         sellable, a price line is rendered right after it

     <div class="kal-avail" data-avail-panel data-product-id="ikone" hidden></div>
       — richer block on the product page information panel

   Two ORDER MODES (config.orderMode), so confirmed stock can be switched on
   later without rebuilding commerce:

     "confirmation" (current, owner decision 2026-09-24): every sellable model
       is "Dostupno za poručivanje"; stock is UNKNOWN (null) — never zero, never
       an invented figure; no low-stock badges, arrival dates, sold-out states
       or stock caps. Quantity and delivery date are confirmed by Demo Group
       after the order request arrives.
     "stock": the original behaviour —
       stock >  lowStockThreshold                  → "Na stanju"
       0 < stock <= lowStockThreshold              → "Mala količina"
       stock == 0 and arrivalDate (YYYY-MM-DD)     → "Stiže uskoro" + date
       stock == 0 and no arrivalDate               → "Rasprodato"
       A valid manualStatus in the JSON overrides the computed status.

   Commerce switch: config.commercePreview === true enables prices and the cart
   on the whole site (false = availability + inquiries only, no prices, no cart).
   A product is
     sellable  = switch on && commerceEnabled !== false && price is a positive number
     orderable = sellable && (mode "confirmation" || status "na-stanju"/"mala-kolicina")

   Money: config.currency (EUR — the owner's price list is in euros WITHOUT
   20 % VAT, payable in dinars; the site never converts or adds tax itself) and
   config.priceBasis (the short wording shown next to prices). Amounts are
   formatted sr-RS with two decimals: "0,97 EUR".

   This file also publishes the shared API `window.dgInventory` so that
   calendar-cart.js reads the same data from the same single fetch:
     load() / reload()          → Promise resolving to the parsed JSON
     mode(d)                    → "confirmation" | "stock"
     statusFor(e, t, d)         → status key or null
     sellable(d,e) / orderable(d,e) / stockKnown(d,e)
     priceFor(d,e)              → number or null
     formatMoney(n) / currency(d) / priceBasis(d) / confirmNote
     formatDate(s), threshold(d), rootUrl, STATUS

   Fail-safe: if the JSON is missing or invalid, load() rejects, every slot
   stays hidden, and the site behaves exactly as before this feature existed.
   ========================================================================== */
(function () {
  "use strict";

  var script = document.currentScript ||
               document.querySelector('script[src*="calendar-inventory"]');
  if (!script || !script.src) return;

  var dataUrl, rootUrl;
  try {
    dataUrl = new URL("../data/calendar-inventory.json", script.src).href;
    rootUrl = new URL("../../", script.src).href;   /* site root, any page depth */
  } catch (e) { return; }

  var TRUCK = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>';

  var STATUS = {
    "dostupno":      { mod: "ok",   card: "Dostupno za poručivanje", panel: "Dostupno za poručivanje" },
    "na-stanju":     { mod: "ok",   card: "Na stanju",     panel: "Na stanju" },
    "mala-kolicina": { mod: "low",  card: "Mala količina", panel: "Mala količina" },
    "stize-uskoro":  { mod: "soon", card: "Stiže uskoro",  panel: "Stiže uskoro" },
    "rasprodato":    { mod: "out",  card: "Rasprodato",    panel: "Trenutno rasprodato" }
  };
  /* the owner-approved sentence shown wherever a purchase is offered */
  var CONFIRM_NOTE = "Količinu i rok isporuke potvrđujemo nakon prijema porudžbine.";

  function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  /* "2026-09-05" → "05.09.2026." — plain string work, no timezone surprises */
  function formatDate(s) {
    var p = s.split("-");
    return p[2] + "." + p[1] + "." + p[0] + ".";
  }

  var nf;
  try { nf = new Intl.NumberFormat("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { nf = null; }
  var currencyCode = "EUR";
  function formatMoney(n) {
    var s = nf ? nf.format(n) : (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
    return s + " " + currencyCode;
  }

  function mode(data) {
    return (data && data.config && data.config.orderMode === "stock") ? "stock" : "confirmation";
  }
  function currency(data) {
    return (data && data.config && typeof data.config.currency === "string" && data.config.currency) ? data.config.currency : "EUR";
  }
  function priceBasis(data) {
    return (data && data.config && typeof data.config.priceBasis === "string") ? data.config.priceBasis : "bez PDV-a";
  }

  function threshold(data) {
    return (data && data.config && typeof data.config.lowStockThreshold === "number")
      ? data.config.lowStockThreshold : 10;
  }

  function sellable(data, entry) {
    return !!(data && data.config && data.config.commercePreview === true &&
              entry && entry.commerceEnabled !== false &&
              typeof entry.price === "number" && entry.price > 0);
  }

  /* data is optional for the legacy "stock" reading; with data the order mode decides */
  function statusFor(entry, thr, data) {
    if (!entry) return null;
    if (data && mode(data) === "confirmation") {
      if (typeof entry.manualStatus === "string" && STATUS[entry.manualStatus] && entry.manualStatus !== "dostupno" && !sellable(data, entry)) {
        return entry.manualStatus;                 /* an explicit non-selling status still shows on a switched-off model */
      }
      return sellable(data, entry) ? "dostupno" : null;
    }
    if (typeof entry.manualStatus === "string" && STATUS[entry.manualStatus]) {
      return entry.manualStatus;
    }
    var stock = entry.stock;
    if (typeof stock !== "number" || isNaN(stock) || stock < 0) return null;
    if (stock > thr) return "na-stanju";
    if (stock > 0) return "mala-kolicina";
    if (isDate(entry.arrivalDate)) return "stize-uskoro";
    return "rasprodato";
  }

  /* true only in "stock" mode with a real non-negative integer stock figure */
  function stockKnown(data, entry) {
    return mode(data) === "stock" && !!entry && typeof entry.stock === "number" && isFinite(entry.stock) && entry.stock >= 0;
  }

  function orderable(data, entry) {
    if (!sellable(data, entry)) return false;
    if (mode(data) === "confirmation") return true;
    var key = statusFor(entry, threshold(data), data);
    return key === "na-stanju" || key === "mala-kolicina";
  }

  function priceFor(data, entry) {
    return sellable(data, entry) ? entry.price : null;
  }

  var loadPromise = null;
  function load() {
    if (!loadPromise) {
      loadPromise = fetch(dataUrl, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("inventory " + r.status);
        return r.json();
      }).then(function (data) {
        if (!data || typeof data !== "object" || !data.products) {
          throw new Error("inventory malformed");
        }
        currencyCode = currency(data);
        return data;
      });
    }
    return loadPromise;
  }

  window.dgInventory = {
    load: load, statusFor: statusFor, sellable: sellable, orderable: orderable, stockKnown: stockKnown,
    priceFor: priceFor, formatMoney: formatMoney, formatDate: formatDate, mode: mode, currency: currency, priceBasis: priceBasis,
    confirmNote: CONFIRM_NOTE,
    isDate: isDate, threshold: threshold, STATUS: STATUS, rootUrl: rootUrl,
    truckSvg: TRUCK,
    /* fresh read for moments that must not trust the page-load snapshot
       (cart revalidation just before an order is prepared) */
    reload: function () { loadPromise = null; return load(); }
  };

  /* --- slot rendering ------------------------------------------------------ */

  var slots = Array.prototype.slice.call(
    document.querySelectorAll("[data-avail][data-product-id], [data-avail-panel][data-product-id]"));
  if (!slots.length) return;

  function line(parent, className, text) {
    var p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    parent.appendChild(p);
    return p;
  }

  function renderCard(el, key, data, entry) {
    var s = STATUS[key];
    el.className = "avail avail--" + s.mod;
    if (key === "stize-uskoro") {
      el.innerHTML = TRUCK;                      /* fixed trusted markup */
      el.appendChild(document.createTextNode(s.card));
    } else {
      el.textContent = s.card;
    }
    el.hidden = false;

    /* retail price line, only while the product is sellable — created here so
       the card markup needs no extra slot and pages without commerce data
       render exactly as before */
    var price = priceFor(data, entry);
    if (price !== null && !el.parentNode.querySelector(".card-price")) {
      var pe = document.createElement("span");
      pe.className = "card-price";
      pe.textContent = formatMoney(price) + " ";
      var basis = document.createElement("small");
      basis.textContent = priceBasis(data);
      pe.appendChild(basis);
      el.parentNode.insertBefore(pe, el.nextSibling);
    }
  }

  function renderPanel(el, key, data, entry) {
    var s = STATUS[key];
    el.className = "kal-avail kal-avail--" + s.mod;
    el.textContent = "";

    var status = document.createElement("p");
    status.className = "kal-avail__status";
    if (key === "stize-uskoro") {
      status.innerHTML = TRUCK;                  /* fixed trusted markup */
      status.appendChild(document.createTextNode(s.panel));
    } else {
      status.textContent = s.panel;
    }
    el.appendChild(status);

    if (key === "dostupno") {
      line(el, "kal-avail__note", CONFIRM_NOTE);
    }
    if (key === "stize-uskoro" && isDate(entry.arrivalDate)) {
      var meta = document.createElement("p");
      meta.className = "kal-avail__meta";
      meta.appendChild(document.createTextNode("Najavljeni dolazak: "));
      var b = document.createElement("b");
      b.textContent = formatDate(entry.arrivalDate);
      meta.appendChild(b);
      el.appendChild(meta);
      line(el, "kal-avail__note", "Nova količina ovog modela je najavljena.");
    }
    if (key === "mala-kolicina") {
      line(el, "kal-avail__note", "Zalihe ovog modela su pri kraju.");
    }
    /* optional owner-written line from the JSON, shown only on product pages */
    if (typeof entry.note === "string" && entry.note.trim()) {
      line(el, "kal-avail__note", entry.note.trim());
    }
    el.hidden = false;
  }

  load().then(function (data) {
    var thr = threshold(data);
    slots.forEach(function (el) {
      var entry = data.products[el.getAttribute("data-product-id")];
      var key = statusFor(entry, thr, data);
      if (!key) return;                          /* unknown product → stays hidden */
      if (el.hasAttribute("data-avail-panel")) renderPanel(el, key, data, entry);
      else renderCard(el, key, data, entry);
    });
  }).catch(function () { /* no data — availability UI simply stays hidden */ });
})();
