/* =============================================================================
   Demo Group — calendar-cart.js
   Retail cart for the calendar catalogue. One module, three duties:

   1. HEADER CART — injects a compact cart control (icon + unit badge) into the
      existing .header-actions on every page that loads this script. The badge
      counts UNITS (2 × Moja Srbija + 1 × Ikone = 3), and hides at zero.

   2. PRODUCT PAGE — fills <div class="kal-buy" data-commerce
      data-product-id="…" hidden> with price, an accessible quantity control
      and "Dodaj u korpu". A quantity above current stock is never silently
      cut: the cart takes what is available, the message says how many were
      asked for and offers the inquiry form (prefilled) for the larger run.

   3. CART PAGE (/korpa/) — renders line items (thumbnail, catalog name,
      family/format, SKU, unit price, editable quantity, line total, remove),
      the order summary (merchandise amount; imprint, delivery and final
      conditions confirmed by Demo Group), the order form and the submission.

   Storage: localStorage key "dgCalendarCartV1", an array of minimal lines
     { "productId": "ikone", "quantity": 2, "lastPrice": 0.77, "wanted": 100 }
   lastPrice is the unit price (in the inventory currency) the customer LAST
   SAW for that line; "wanted" (optional, stock mode only) remembers a requested
   quantity above stock so the inquiry offer survives a reload. The price that
   is displayed, summed and sent ALWAYS comes fresh from
   assets/data/calendar-inventory.json via window.dgInventory (single source of
   truth; a stale stored price is never trusted). Amounts are computed in
   integer minor units (cents) — no floating-point drift. No customer data is
   ever written to localStorage. Older carts load as-is (a legacy "lastPriceRsd"
   from the RSD test period is ignored, never compared with euro prices).

   PRICES (owner decision 2026-09-24): the approved price list is in EUR
   WITHOUT 20 % VAT, payable in dinars. The site shows and sums exactly those
   amounts with the basis wording from the inventory config; it never converts
   to RSD, never adds tax and never prices imprint or delivery — those are
   settled on the invoice. Order mode "confirmation": every model is orderable
   with unknown stock; quantity and delivery date are confirmed after receipt.
   Owner decision 2026-09-26 (final): the whole site shows ONLY net EUR prices;
   every amount carries the basis wording ("bez PDV-a") — unit prices, line
   amounts, the one amount of goods and the order e-mail fields. No gross price,
   no separate VAT line. Owner decision 2026-10-06: the main price on the
   product page ("0,97 EUR po komadu") and the catalogue card price show the
   amount without the wording; amounts, basis and calculation are unchanged.

   Consistency rules (independent review 2026-09-24, R1–R3):
   - evaluate() is a pure comparison of the stored cart against CURRENT data; it
     never writes. What was shown is persisted by commit() right after it was
     rendered, so a later change of price, stock or availability is DETECTED
     (out.changed) — and a detected change always stops the submission, shows
     the new amount with a per-line note, and asks for a fresh confirmation.
     Only an unchanged cart is sent, and exactly the displayed amount.
   - While a request is pending the page's cart controls are locked; the order
     is a snapshot taken at submission. After success only the SENT quantities
     are removed from storage: anything added meanwhile (this page could not,
     but another tab can) stays in the cart and is pointed out.
   - Line items are updated in place; a re-render never steals keyboard focus.
     After "Ukloni" the focus moves to the neighbouring line (or the empty
     state) instead of falling back to <body>.

   Ordering (NO online payment): the order is sent to the existing FormSubmit
   endpoint of info@demogroup.rs as an AJAX request; the "sent" state appears
   only after the service answers success. A rejected or failed request shows
   an actionable error, re-renders the cart from current data and keeps the
   typed data. Browsers without fetch fall back to the classic form POST with
   the redirect marker.
   SAFETY: on localhost/127.0.0.1 nothing is sent unless QA explicitly sets
   sessionStorage "dgQaSend" = "1" (the QA harness intercepts that request in
   the browser); otherwise a clearly marked preview state is shown.

   Fail-safe: without dgInventory or without valid JSON, commerce UI simply
   does not appear; navigation, galleries and inquiry forms are untouched.
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "dgCalendarCartV1";
  var inv = window.dgInventory || null;

  var script = document.currentScript ||
               document.querySelector('script[src*="calendar-cart"]');
  var rootUrl = null;
  try {
    if (inv && inv.rootUrl) rootUrl = inv.rootUrl;
    else if (script && script.src) rootUrl = new URL("../../", script.src).href;
  } catch (e) { rootUrl = null; }

  /* --- tiny helpers ------------------------------------------------------- */

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Serbian numeral agreement: 1 komad / 2–4 komada / 5+ komada */
  function komad(n) {
    if (n % 100 >= 11 && n % 100 <= 14) return "komada";
    return n % 10 === 1 ? "komad" : "komada";
  }

  function two(n) { return (n < 10 ? "0" : "") + n; }

  function orderRef(now) {
    var d = now || new Date();
    var stamp = "" + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) +
                "-" + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
    var rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return "DG-KAL-" + stamp + "-" + rand;
  }

  function stampNice(d) {
    return two(d.getDate()) + "." + two(d.getMonth() + 1) + "." + d.getFullYear() +
           ". " + two(d.getHours()) + ":" + two(d.getMinutes());
  }

  /* money: integer minor units (cents) everywhere, formatted only for display */
  function toPara(amount) { return Math.round(Number(amount) * 100); }
  function money(para) { return inv.formatMoney(para / 100); }
  /* an amount with its basis, e.g. "0,77 EUR bez PDV-a" — no amount is shown without it */
  function net(para, data) { return money(para) + " " + inv.priceBasis(data); }
  /* input sanity limit for a quantity field — NOT a stock figure: larger runs go through the inquiry form */
  var QTY_LIMIT = 100000;
  function fmtInt(n) { try { return new Intl.NumberFormat("sr-RS").format(n); } catch (e) { return String(n); } }
  function qtyRangeText(min, max) { return "Unesite ceo broj od " + fmtInt(min) + " do " + fmtInt(max) + "." + (max === QTY_LIMIT ? " Za veći tiraž pošaljite upit." : ""); }
  function skuNice(sku) { var s = String(sku || "").replace(/\D/g, ""); return s.length === 6 ? s.slice(0, 3) + " " + s.slice(3) : String(sku || ""); }

  /* --- cart store --------------------------------------------------------- */

  function readCart() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (l) {
        return l && typeof l.productId === "string" &&
               typeof l.quantity === "number" && isFinite(l.quantity) &&
               Math.floor(l.quantity) === l.quantity && l.quantity > 0;
      });
    } catch (e) { return []; }
  }

  function writeCart(lines) {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch (e) {}
    updateBadge();
    window.dispatchEvent(new Event("dg:cart-change"));
  }

  function cartCount() {
    return readCart().reduce(function (n, l) { return n + l.quantity; }, 0);
  }

  function lineFor(lines, id) {
    for (var i = 0; i < lines.length; i++) if (lines[i].productId === id) return lines[i];
    return null;
  }

  /* opts: { price: number, wanted: number|null } — wanted = requested quantity above stock (kept), null = clear */
  function setQuantity(id, qty, opts) {
    opts = opts || {};
    var lines = readCart();
    var line = lineFor(lines, id);
    qty = Math.max(0, Math.floor(qty));
    if (qty === 0) {
      lines = lines.filter(function (l) { return l.productId !== id; });
    } else {
      if (!line) { line = { productId: id, quantity: qty }; lines.push(line); }
      line.quantity = qty;
      if (typeof opts.price === "number") { line.lastPrice = opts.price; delete line.lastPriceRsd; }
      if ("wanted" in opts) { if (opts.wanted && opts.wanted > qty) line.wanted = opts.wanted; else delete line.wanted; }
    }
    writeCart(lines);
    return lines;
  }

  /* --- success marker (classic POST fallback only) ------------------------- */
  /* The classic form POST (browsers without fetch) clears the cart only after
     FormSubmit's redirect lands on /porudzbina-primljena/ with this marker. */
  var PENDING_KEY = "dgPendingCalendarOrder";
  var PENDING_MAX_AGE = 60 * 60 * 1000;

  if (document.querySelector("[data-order-complete]")) {
    try {
      var pendingRaw = sessionStorage.getItem(PENDING_KEY);
      if (pendingRaw) {
        var pending = JSON.parse(pendingRaw);
        if (pending && typeof pending.t === "number" &&
            Date.now() - pending.t < PENDING_MAX_AGE) {
          localStorage.removeItem(KEY);
        }
        sessionStorage.removeItem(PENDING_KEY);
      }
    } catch (e) {}
  }

  /* --- header cart control ------------------------------------------------ */

  var CART_SVG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2.4l2.5 11.5h10.4L21 8H7"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="16.9" cy="19.5" r="1.5"/></svg>';
  var badgeEl = null;
  var cartLinkEl = null;

  function updateBadge() {
    if (!badgeEl) return;
    var n = cartCount();
    badgeEl.textContent = n > 99 ? "99+" : String(n);
    badgeEl.hidden = n === 0;
    if (cartLinkEl) {
      cartLinkEl.setAttribute("aria-label",
        n === 0 ? "Korpa je prazna" : "Korpa, " + n + " " + komad(n));
    }
  }

  (function mountHeaderCart() {
    if (!rootUrl) return;
    var actions = document.querySelector(".site-header .header-actions");
    if (!actions || actions.querySelector(".header-cart")) return;

    cartLinkEl = el("a", "header-cart");
    cartLinkEl.href = rootUrl + "korpa/index.html";
    cartLinkEl.innerHTML = CART_SVG;             /* fixed trusted markup */
    badgeEl = el("span", "header-cart__badge");
    badgeEl.setAttribute("aria-hidden", "true"); /* the aria-label carries it */
    badgeEl.hidden = true;
    cartLinkEl.appendChild(badgeEl);

    var beforeNode = actions.querySelector(".btn") || actions.querySelector(".nav-toggle");
    actions.insertBefore(cartLinkEl, beforeNode || null);
    var header = actions.closest(".site-header");
    if (header) header.classList.add("has-cart");   /* lets the phone label yield space */

    cartLinkEl.addEventListener("click", function (e) {
      if (!window.dgOverlay || !inv) return;
      e.preventDefault();
      openDrawer(null);
    });
    updateBadge();
  })();

  /* keep the badge honest across tabs */
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) updateBadge();
  });

  /* --- accessible quantity control ---------------------------------------- */
  /* opts.onChange(value, capped, requested) — capped = the requested value was
     above opts.max (value is the max), requested = what was typed.
     opts.onInvalid(text) — a non-numeric / negative / fractional entry; the
     field is restored to the last valid value.
     Returned API: root, input, set(v), setMax(m) — the control is updated in
     place so keyboard focus on it is never lost (R3). */
  function buildQty(opts) {
    var wrap = el("div", "qty");
    var minus = el("button", "qty__btn", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", "Smanji količinu");
    var input = document.createElement("input");
    input.className = "qty__input";
    input.type = "number";
    input.inputMode = "numeric";
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = "1";
    input.value = String(opts.value);
    input.setAttribute("aria-label", "Količina");
    var plus = el("button", "qty__btn", "+");
    plus.type = "button";
    plus.setAttribute("aria-label", "Povećaj količinu");
    if (opts.focusKey) {
      minus.setAttribute("data-focus-key", opts.focusKey + ":minus");
      input.setAttribute("data-focus-key", opts.focusKey + ":input");
      plus.setAttribute("data-focus-key", opts.focusKey + ":plus");
    }
    wrap.appendChild(minus); wrap.appendChild(input); wrap.appendChild(plus);

    var last = opts.value;
    function current() {
      var raw = String(input.value).trim();
      if (!/^\d+$/.test(raw)) return NaN;
      return parseInt(raw, 10);
    }
    function apply(v) {
      if (isNaN(v) || v < 0 || (opts.max === QTY_LIMIT && v > QTY_LIMIT)) {
        /* not a whole number, negative, or beyond the input sanity limit: restore, explain (no silent clipping) */
        input.value = String(last);
        if (opts.onInvalid) opts.onInvalid(qtyRangeText(opts.min, opts.max));
        return;
      }
      var requested = v, capped = false;
      if (v > opts.max) { v = opts.max; capped = true; }
      if (v < opts.min) v = opts.min;
      if (input.value !== String(v)) input.value = String(v);
      last = v;
      opts.onChange(v, capped, requested);
    }
    minus.addEventListener("click", function () {
      var v = current(); if (isNaN(v)) v = last;
      v = v - 1;
      if (v < opts.min && opts.onBelowMin) { opts.onBelowMin(); return; }
      apply(v);
    });
    plus.addEventListener("click", function () { var v = current(); apply((isNaN(v) ? last : v) + 1); });
    input.addEventListener("change", function () { apply(current()); });
    if (opts.live) input.addEventListener("input", function () {
      var v = current();
      if (!isNaN(v) && v >= opts.min && v <= opts.max) apply(v);
    });
    return {
      root: wrap, input: input, minus: minus, plus: plus,
      set: function (v) { input.value = String(v); last = v; },
      setMax: function (m) { opts.max = m; input.max = String(m); }
    };
  }

  /* --- one evaluated view of the cart against CURRENT inventory ------------ */
  /* Shared by the drawer and /korpa/ — there is exactly one pricing/stock
     truth. PURE: compares the stored lines (quantity + the price the customer
     last saw) with current data and reports every difference:
       row.capped        stored quantity above current stock → row.quantity is the stock
       row.priceChanged  { fromPara, toPara } when the unit price differs from the last seen one
       row.notes         the human-readable change notes for those two cases
       row.messages      persistent state (unavailable, requested quantity kept)
       out.changed       any capped/priceChanged row — the submission must stop and
                         re-ask for confirmation of the newly displayed amount
       out.blocked       a line that cannot be ordered at all
     Nothing is written here; commit(view) persists what was rendered. All money in para. */
  function evaluate(data) {
    var lines = readCart();
    var out = { rows: [], units: 0, totalPara: 0, blocked: false, changed: false };
    lines.forEach(function (l) {
      var entry = data.products[l.productId];
      var row = { id: l.productId, quantity: l.quantity, wanted: (typeof l.wanted === "number" && l.wanted > l.quantity) ? l.wanted : null,
                  entry: entry || null, messages: [], notes: [], available: false, pricePara: null, stock: null, inquiry: null, capped: false, priceChanged: null };
      var key = entry ? inv.statusFor(entry, inv.threshold(data), data) : null;

      if (!entry || !key) {
        row.messages.push("Proizvod više nije u ponudi.");
      } else if (!inv.sellable(data, entry)) {
        row.messages.push("Poručivanje ovog proizvoda trenutno nije dostupno.");
      } else if (!inv.orderable(data, entry)) {
        row.messages.push("Proizvod trenutno nije dostupan.");
        if (inv.isDate(entry.arrivalDate)) {
          row.messages.push("Najavljeni dolazak: " + inv.formatDate(entry.arrivalDate));
        }
      } else {
        row.available = true;
        row.pricePara = toPara(inv.priceFor(data, entry));
        var known = inv.stockKnown(data, entry);          /* "stock" mode with a real figure; in "confirmation" mode stock is unknown */
        row.stock = known ? entry.stock : null;
        if (known && l.quantity > entry.stock) {
          row.capped = true;
          row.wanted = l.quantity;
          row.quantity = entry.stock;
          row.notes.push("Stanje se promenilo: tražili ste " + l.quantity + " " + komad(l.quantity) +
                         ", trenutno je dostupno " + entry.stock + " " + komad(entry.stock) + " — toliko je u korpi.");
        } else if (known && row.wanted) {
          row.messages.push("Tražili ste " + row.wanted + " " + komad(row.wanted) + " — trenutno je dostupno " +
                            entry.stock + " " + komad(entry.stock) + ", toliko je u korpi.");
        } else if (!known) {
          row.wanted = null;                                /* nothing is capped when stock is unknown */
        }
        if (row.wanted && entry.url) row.inquiry = { qty: row.wanted, href: rootUrl + entry.url + "?kolicina=" + row.wanted + "#upit" };
        if (typeof l.lastPrice === "number" && toPara(l.lastPrice) !== row.pricePara) {
          row.priceChanged = { fromPara: toPara(l.lastPrice), toPara: row.pricePara };
          row.notes.push("Cena je ažurirana: ranije " + net(row.priceChanged.fromPara, data) + ", sada " + net(row.pricePara, data) + " po komadu.");
        }
        row.subtotalPara = row.pricePara * row.quantity;
        out.units += row.quantity;
        out.totalPara += row.subtotalPara;
        if (row.capped || row.priceChanged) out.changed = true;
      }
      if (!row.available) out.blocked = true;
      out.rows.push(row);
    });
    return out;
  }

  /* Persist exactly what was just shown (quantity cut to stock, the current
     unit price, the kept "wanted"): the snapshot the next evaluate() compares
     against. Called right after a render, never before one. */
  function commit(view) {
    var dirty = false;
    view.rows.forEach(function (r) { if (r.available && (r.capped || r.priceChanged)) dirty = true; });
    if (!dirty) return;
    var lines = readCart();
    view.rows.forEach(function (r) {
      if (!r.available) return;
      var line = lineFor(lines, r.id);
      if (!line) return;
      if (r.capped) { line.quantity = r.quantity; if (r.wanted && r.wanted > r.quantity) line.wanted = r.wanted; else delete line.wanted; }
      line.lastPrice = r.pricePara / 100;
      delete line.lastPriceRsd;
    });
    writeCart(lines);
  }

  function nameOf(row) { return (row.entry && row.entry.name) ? row.entry.name : row.id; }
  function variantOf(row) { return row.entry && row.entry.variant ? row.entry.variant : ""; }
  function skuOf(row) { return row.entry && row.entry.sku ? skuNice(row.entry.sku) : ""; }
  /* "Šifra artikla 400 001" on its own line; the number in its own element so it stands out (style.css §44) */
  function skuLine(className, sku) {
    var p = el("p", className, "Šifra artikla ");
    p.appendChild(el("span", "sku-num", sku));
    return p;
  }

  function inquiryLink(row, className) {
    var a = el("a", className || "cart-item__inquiry", "Pošaljite upit za " + row.inquiry.qty + " " + komad(row.inquiry.qty));
    a.href = row.inquiry.href;
    return a;
  }

  /* --- mini-cart drawer ---------------------------------------------------- */
  var drawerEl = null;

  function hideDrawer() {
    if (drawerEl && window.dgOverlay) window.dgOverlay.hide(drawerEl);
  }

  function ensureDrawer() {
    if (drawerEl) return drawerEl;
    if (!rootUrl || !document.body) return null;

    drawerEl = el("div", "cart-drawer");
    drawerEl.id = "cart-drawer";
    drawerEl.hidden = true;

    var backdrop = el("div", "cart-drawer__backdrop");
    var panel = el("div", "cart-drawer__panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Korpa");

    var head = el("div", "cart-drawer__head");
    head.appendChild(el("strong", null, "Korpa"));
    var close = el("button", "cart-drawer__close");
    close.type = "button";
    close.setAttribute("aria-label", "Zatvori korpu");
    close.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    head.appendChild(close);
    panel.appendChild(head);

    var added = el("div", "cart-drawer__added");
    added.hidden = true;
    panel.appendChild(added);
    panel.appendChild(el("div", "cart-drawer__list"));
    panel.appendChild(el("div", "cart-drawer__foot"));

    drawerEl.appendChild(backdrop);
    drawerEl.appendChild(panel);
    document.body.appendChild(drawerEl);

    backdrop.addEventListener("click", hideDrawer);
    close.addEventListener("click", hideDrawer);
    return drawerEl;
  }

  /* a line amount with its basis right under the figure */
  function lineSub(para, data) {
    var p = el("p", "cart-line__sub", money(para) + " ");
    p.appendChild(el("small", null, inv.priceBasis(data)));
    return p;
  }

  /* whole calendar image (contain, never cropped) — a link to the product page when the entry has one */
  function drawerThumb(entry) {
    var linked = !!(entry && entry.url);
    var media = el(linked ? "a" : "span", "cart-line__media");
    if (linked) { media.href = rootUrl + entry.url; media.setAttribute("aria-label", (entry.name || "Kalendar") + " — strana proizvoda"); }
    if (entry && entry.image) {
      var img = document.createElement("img");
      img.src = rootUrl + entry.image;
      img.alt = "";
      img.width = 60; img.height = 80;
      img.loading = "lazy";
      media.appendChild(img);
    }
    return media;
  }

  /* after a line was removed with the keyboard: the same position in the list, else the close button —
     focus must stay inside the dialog */
  function focusDrawerLine(index) {
    if (!drawerEl) return;
    var removes = drawerEl.querySelectorAll(".cart-line .cart-item__remove");
    var t = removes.length ? removes[Math.min(index, removes.length - 1)] : drawerEl.querySelector(".cart-drawer__close");
    if (t) { try { t.focus(); } catch (e) {} }
  }

  var drawerData = null;
  function renderDrawer(data, addedId) {
    drawerData = data;
    var focused = drawerEl.contains(document.activeElement) ? document.activeElement.getAttribute("data-focus-key") : null;
    var view = evaluate(data);
    var addedRow = null;
    view.rows.forEach(function (r) { if (r.id === addedId) addedRow = r; });

    var addedBox = drawerEl.querySelector(".cart-drawer__added");
    addedBox.textContent = "";
    if (addedRow && addedRow.available) {
      var flag = el("p", "cart-drawer__flag");
      flag.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';
      flag.appendChild(document.createTextNode("Dodato u korpu"));
      addedBox.appendChild(flag);

      var line = el("div", "cart-line");
      line.appendChild(drawerThumb(addedRow.entry));
      var body = el("div", null);
      body.appendChild(el("p", "cart-line__name", nameOf(addedRow)));
      body.appendChild(el("p", "cart-line__meta",
        addedRow.quantity + " kom × " + net(addedRow.pricePara, data)));
      line.appendChild(body);
      line.appendChild(lineSub(addedRow.subtotalPara, data));
      addedBox.appendChild(line);
      addedBox.hidden = false;
    } else {
      addedBox.hidden = true;
    }

    var list = drawerEl.querySelector(".cart-drawer__list");
    list.textContent = "";
    if (!view.rows.length) {
      list.appendChild(el("p", "cart-drawer__empty", "Vaša korpa je prazna."));
    }
    view.rows.forEach(function (row, index) {
      var nameText = nameOf(row);
      var line = el("div", "cart-line" + (row.available ? "" : " cart-line--off"));
      line.appendChild(drawerThumb(row.entry));

      var body = el("div", null);
      body.appendChild(el("p", "cart-line__name", nameText));
      if (variantOf(row)) body.appendChild(el("p", "cart-line__meta", variantOf(row)));
      if (skuOf(row)) body.appendChild(skuLine("cart-line__meta cart-sku", skuOf(row)));
      var quantityMeta = null;
      if (row.available) {
        quantityMeta = el("p", "cart-line__meta", row.quantity + " kom × " + net(row.pricePara, data));
        body.appendChild(quantityMeta);
      }
      row.notes.concat(row.messages).forEach(function (m) {
        body.appendChild(el("p", "cart-line__msg", m));
      });
      if (row.inquiry) body.appendChild(inquiryLink(row, "cart-line__inquiry"));
      if (row.available) {
        var qtyMessage = el("p", "cart-line__msg");
        qtyMessage.setAttribute("aria-live", "polite");
        var change = function (v, capped, requested) {
          if (sending) return;
          setQuantity(row.id, v, { price: row.pricePara / 100, wanted: capped ? requested : null });
          if (lastData) render(data);
          if (v > 0 && !capped && !row.wanted) {
            // Keep the active control attached and its native caret/selection intact.
            // Only price labels and the inquiry link change during ordinary editing.
            row.quantity = v;
            quantityMeta.textContent = v + " kom × " + net(row.pricePara, data);
            side.querySelector(".cart-line__sub").firstChild.nodeValue = money(row.pricePara * v) + " ";
            quote.href = rootUrl + row.entry.url + "?kolicina=" + v + "#upit";
            qtyMessage.textContent = "";
            addedBox.hidden = true;
            var next = evaluate(data);
            drawerEl.querySelector(".cart-drawer__total b").textContent = money(next.totalPara);
            commit(next);
          } else {
            renderDrawer(data, null);
            if (!v) focusDrawerLine(index);
          }
        };
        var qty = buildQty({
          min: 1, max: row.stock === null ? QTY_LIMIT : row.stock,
          value: row.quantity, focusKey: "drawer:" + row.id, live: true,
          onChange: change,
          onBelowMin: function () { change(0, false, 0); },
          onInvalid: function (message) { qtyMessage.textContent = message; }
        });
        [qty.minus, qty.input, qty.plus].forEach(function (control) { control.disabled = !!sending; });
        body.appendChild(qty.root);
        body.appendChild(qtyMessage);
        var quote = el("a", "cart-line__inquiry", "Upit za uštampavanje");
        quote.href = rootUrl + row.entry.url + "?kolicina=" + row.quantity + "#upit";
        body.appendChild(quote);
      }
      line.appendChild(body);

      var side = el("div", "cart-line__side");
      if (row.available) side.appendChild(lineSub(row.subtotalPara, data));
      var remove = el("button", "cart-item__remove", "Ukloni");
      remove.type = "button";
      remove.setAttribute("aria-label", "Ukloni " + nameText + " iz korpe");
      remove.disabled = !!sending;
      remove.addEventListener("click", function () {
        if (sending) return;
        setQuantity(row.id, 0);
        if (lastData) render(data);
        renderDrawer(data, null);
        focusDrawerLine(index);
      });
      side.appendChild(remove);
      line.appendChild(side);
      list.appendChild(line);
    });

    var foot = drawerEl.querySelector(".cart-drawer__foot");
    foot.textContent = "";
    if (view.rows.length) {
      var total = el("p", "cart-drawer__total");
      total.appendChild(el("span", null, "Iznos robe " + inv.priceBasis(data)));
      total.appendChild(document.createTextNode(" "));   /* read as "label amount", not "PDV-a0,77" */
      total.appendChild(el("b", null, money(view.totalPara)));
      foot.appendChild(total);
      foot.appendChild(el("p", "cart-drawer__note", "Cene " + inv.priceBasis(data) + ". Uštampavanje i dostava nisu uključeni. Bez online plaćanja — porudžbinu šaljete iz korpe. " + inv.confirmNote));

      var view_ = el("a", "btn btn--block", "Pogledajte korpu");
      view_.href = rootUrl + "korpa/index.html";
      foot.appendChild(view_);
    }
    var cont = el("button", "btn btn--outline btn--block", "Nastavite kupovinu");
    cont.type = "button";
    cont.addEventListener("click", hideDrawer);
    foot.appendChild(cont);
    commit(view);                                   /* what the drawer shows is now the seen state */
    if (focused) Array.prototype.some.call(drawerEl.querySelectorAll("[data-focus-key]"), function (control) {
      if (control.getAttribute("data-focus-key") !== focused) return false;
      control.focus(); return true;
    });
  }

  function openDrawer(addedId) {
    if (!inv || !window.dgOverlay) return false;
    var d = ensureDrawer();
    if (!d) return false;
    /* fresh stock/prices on every open; the page-load snapshot is the
       fallback so a momentary fetch hiccup still shows a correct-enough cart */
    inv.reload().catch(function () { return inv.load(); }).then(function (data) {
      renderDrawer(data, addedId);
      window.dgOverlay.show(d, d.querySelector(".cart-drawer__close"));
    }).catch(function () { /* no data at all — the header link still works */ });
    return true;
  }

  window.addEventListener("storage", function (e) {
    if (e.key !== KEY || sending || !drawerEl || drawerEl.hidden || !drawerData) return;
    inv.reload().catch(function () { return drawerData; }).then(function (data) {
      if (!sending && !drawerEl.hidden) renderDrawer(data, null);
    });
  });

  /* --- product page commerce block ---------------------------------------- */

  (function mountProductCommerce() {
    var box = document.querySelector("[data-commerce][data-product-id]");
    if (!box || !inv) return;

    inv.load().then(function (data) {
      var id = box.getAttribute("data-product-id");
      var entry = data.products[id];
      var key = inv.statusFor(entry, inv.threshold(data), data);
      if (!entry || !key || !inv.sellable(data, entry)) return;   /* stays hidden */

      var price = inv.priceFor(data, entry);
      var known = inv.stockKnown(data, entry);
      var maxQty = known ? entry.stock : QTY_LIMIT;
      box.textContent = "";

      var priceRow = el("p", "kal-buy__price", inv.formatMoney(price));
      var unit = el("small", null, " po komadu");    /* owner decision 2026-10-06: no basis wording beside the main price */
      priceRow.appendChild(unit);
      box.appendChild(priceRow);
      /* the list price never includes the imprint — said right beside the price, above the purchase controls */
      box.appendChild(el("p", "kal-buy__note", "Cena kalendara bez uštampavanja. Uštampavanje se obračunava prema dogovoru."));
      /* the confirmation sentence is shown once per page — in the availability panel above (calendar-inventory.js) */

      if (inv.orderable(data, entry)) {
        var row = el("div", "kal-buy__row");
        var msg = el("p", "kal-buy__msg");
        msg.setAttribute("aria-live", "polite");
        msg.hidden = true;
        function say(text, inquiryQty) {
          msg.textContent = text;
          if (inquiryQty) {
            msg.appendChild(document.createTextNode(" "));
            var a = el("a", "kal-buy__link", "Pošaljite upit za " + inquiryQty + " " + komad(inquiryQty));
            a.href = "#upit";
            a.addEventListener("click", function () {
              var field = document.querySelector('form.form input[name="Količina ili tiraž"]');
              if (field) field.value = String(inquiryQty);
            });
            msg.appendChild(a);
          }
          msg.hidden = false;
        }

        var requested = null;                 /* stock mode: a quantity above stock the customer typed — kept for the cart line and the e-mail */
        var qty = buildQty({
          min: 1, max: maxQty, value: 1,
          onChange: function (v, capped, asked) {
            if (capped && known) {
              requested = asked;
              say("Tražili ste " + asked + " " + komad(asked) + " — trenutno je dostupno " + entry.stock + " " +
                  komad(entry.stock) + ", u korpu možete dodati najviše toliko. Za veći tiraž:", asked);
            } else {
              requested = null;
              msg.hidden = true;
            }
          },
          onInvalid: function (text) { say(text); }
        });
        row.appendChild(qty.root);

        var add = el("button", "btn btn--lg kal-buy__add");
        add.type = "button";
        add.innerHTML = 'Dodaj u korpu <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
        row.appendChild(add);
        box.appendChild(row);
        box.appendChild(msg);

        var done = el("p", "kal-buy__done");
        done.hidden = true;
        box.appendChild(done);

        add.addEventListener("click", function () {
          var want = parseInt(qty.input.value, 10);
          if (isNaN(want) || want < 1 || want > maxQty) { say(qtyRangeText(1, maxQty)); return; }
          var lines = readCart();
          var line = lineFor(lines, id);
          var already = line ? line.quantity : 0;
          var total = Math.min(already + want, maxQty);
          var delta = total - already;

          if (delta <= 0) {
            /* nothing could be added — the cart already holds the maximum. A failed add never opens the drawer. */
            say(known
              ? "U korpi je već " + already + " " + komad(already) + " — trenutno je dostupno " + entry.stock + " " + komad(entry.stock) + " ukupno. Za veći tiraž:"
              : "U korpi je već " + fmtInt(already) + " " + komad(already) + " ovog modela — to je najveća količina koju korpa prima. Za veći tiraž:", already + want);
            return;
          }
          var wanted = known ? ((already + want > entry.stock) ? already + want : ((requested && requested > total) ? requested : null)) : null;
          setQuantity(id, total, { price: price, wanted: wanted });   /* same product merges, never duplicates */
          msg.hidden = true;
          done.hidden = true;
          if (!openDrawer(id)) {
            /* overlay controller unavailable: quiet inline confirmation */
            done.textContent = "";
            done.appendChild(document.createTextNode(
              "Dodato u korpu (" + total + " " + komad(total) + " ukupno). "));
            var link = el("a", "kal-buy__link", "Pogledajte korpu");
            link.href = rootUrl + "korpa/index.html";
            done.appendChild(link);
            done.hidden = false;
          }
        });
      } else {
        /* arriving soon / sold out: visible price, honest disabled action */
        var dis = el("button", "btn btn--lg kal-buy__add");
        dis.type = "button";
        dis.disabled = true;
        dis.textContent = key === "stize-uskoro" ? "Uskoro dostupno" : "Trenutno rasprodato";
        box.appendChild(dis);
        var hint = el("p", "kal-buy__msg",
          key === "stize-uskoro"
            ? "Poručivanje će biti moguće kada nova količina stigne."
            : "Model trenutno nije moguće poručiti.");
        box.appendChild(hint);
      }

      box.hidden = false;
    }).catch(function () { /* no data — commerce stays hidden */ });
  })();

  /* Whole-cart inquiry: only a mode flag travels in the URL. The automatic
     list is rebuilt from the cart; the customer's message stays separate. */
  (function mountCartInquiry() {
    var inquiry = document.querySelector("form[data-cart-inquiry]");
    if (!inquiry || !inv || new URLSearchParams(location.search).get("upit") !== "korpa") return;
    var draftKey = "dgCalendarInquiryMessageV1";
    var message = inquiry.querySelector('textarea[name="Poruka"]');
    var qtyField = inquiry.querySelector('input[name="Količina ili tiraž"]');
    if (qtyField) { qtyField.disabled = true; qtyField.closest("label").hidden = true; }
    var section = el("div", "field cart-inquiry-selection");
    var label = el("label", null, "Izabrani kalendari");
    label.htmlFor = "cart-inquiry-items";
    var list = el("textarea", null);
    list.id = "cart-inquiry-items"; list.name = "Proizvodi iz korpe";
    list.rows = 2; list.readOnly = true;
    list.setAttribute("aria-describedby", "cart-inquiry-help");
    var note = el("p", "form__note", "Spisak prati trenutnu korpu. Vašu poruku pišite odvojeno ispod; promena spiska je ne briše.");
    note.id = "cart-inquiry-help";
    var status = el("p", "form__status"); status.setAttribute("role", "status");
    section.appendChild(label); section.appendChild(list); section.appendChild(note); section.appendChild(status);
    inquiry.insertBefore(section, inquiry.firstChild);
    var button = inquiry.querySelector('button[type="submit"]');
    var snapshot = null, data = null;
    function sizeList() {
      list.style.height = "auto";
      list.style.height = Math.min(list.scrollHeight + 2, 420) + "px";
      note.textContent = (list.scrollHeight > list.clientHeight + 2 ? "Spisak se nastavlja — pomerite sadržaj polja naniže. " : "") + "Spisak prati korpu. Vašu poruku pišite odvojeno ispod; promene korpe je ne brišu.";
    }
    window.addEventListener("resize", sizeList);
    function cartSignature() { return JSON.stringify(readCart().map(function (line) { return [line.productId, line.quantity]; })); }
    function refresh() {
      if (!data) return;
      var lines = readCart();
      list.value = lines.map(function (line, i) {
        var product = data.products[line.productId];
        return (i + 1) + ". " + (product ? product.name + (product.variant ? " — " + product.variant : "") : line.productId) +
          "\nŠifra: " + (product && product.sku ? skuNice(product.sku) : "nije dostupna") + "\nKoličina: " + line.quantity;
      }).join("\n\n");
      sizeList();
      var current = cartSignature();
      status.textContent = !lines.length ? "Korpa je prazna. Dodajte proizvode pre slanja upita. Vaša poruka je sačuvana." :
        snapshot !== null && current !== snapshot ? "Spisak je ažuriran prema korpi. Proverite stavke pre slanja." : "";
      snapshot = current;
      if (button) button.disabled = !lines.length;
    }
    try { if (message && !message.value) message.value = sessionStorage.getItem(draftKey) || ""; } catch (e) {}
    if (message) message.addEventListener("input", function () {
      try { sessionStorage.setItem(draftKey, message.value); } catch (e) {}
    });
    if (button) button.disabled = true;
    inv.load().then(function (loaded) { data = loaded; refresh(); }).catch(function () {
      status.textContent = "Spisak proizvoda trenutno nije dostupan. Osvežite stranicu; upit nije poslat.";
    });
    window.addEventListener("storage", function (event) { if (event.key === KEY) refresh(); });
    window.addEventListener("dg:cart-change", refresh);
    window.addEventListener("pageshow", refresh);
    inquiry.addEventListener("submit", function (event) {
      if (!data || !readCart().length || snapshot !== cartSignature()) {
        event.preventDefault(); refresh();
        if (data && readCart().length) status.textContent = "Korpa je izmenjena. Proverite ažurirani spisak i ponovo pošaljite upit.";
      }
    }, true);
  })();

  /* --- cart page ----------------------------------------------------------- */

  var cartRoot = document.querySelector("[data-cart-page]");
  if (!cartRoot || !inv) return;

  var itemsEl   = cartRoot.querySelector("[data-cart-items]");
  var summaryEl = cartRoot.querySelector("[data-cart-summary]");
  var layoutEl  = cartRoot.querySelector("[data-cart-layout]");
  var emptyEl   = cartRoot.querySelector("[data-cart-empty]");
  var orderEl   = cartRoot.querySelector("[data-order-section]");
  var noticeEl  = cartRoot.querySelector("[data-cart-notice]");
  var successEl = cartRoot.querySelector("[data-order-success]");
  var form      = cartRoot.querySelector("[data-order-form]");

  var lastData = null;      /* the most recent inventory data every re-render uses */
  var rowEls = {};          /* productId → { li, qty, sub, unit, msgBox, available, stock, pricePara } — rows are updated in place */
  var noteMemory = {};      /* productId → change notes kept on screen until the customer touches that line */
  var sending = false;
  var shownLines = null;    /* in-memory record of what THIS page last displayed: [{ id, quantity, pricePara }] after the
                               render's commit — the evidence of what the customer confirmed; shared storage (another tab may
                               already have stored a newer price or quantity) is not */

  function linesOf(view) { return view.rows.map(function (r) { return { id: r.id, quantity: r.quantity, pricePara: r.available ? r.pricePara : null }; }); }
  /* what differs between the confirmed view and a fresh one: "lines" (membership/quantities), "price", or null */
  function diffLines(a, b) {
    if (!a || !b || a.length !== b.length) return "lines";
    var price = false;
    for (var i = 0; i < a.length; i++) {
      var match = null;
      for (var j = 0; j < b.length; j++) if (b[j].id === a[i].id) match = b[j];
      if (!match || match.quantity !== a[i].quantity) return "lines";
      if (match.pricePara !== a[i].pricePara) price = true;
    }
    return price ? "price" : null;
  }

  function notice(text) {
    if (!noticeEl) return;
    noticeEl.textContent = text || "";
    noticeEl.hidden = !text;
  }
  /* a stopped submission is decided at the top of the page (line notes + new total) while the customer
     stands at the button below: bring the notice into view and hand it the focus (announced, not just live) */
  function revealNotice() {
    if (!noticeEl || noticeEl.hidden) return;
    try {
      noticeEl.setAttribute("tabindex", "-1");
      noticeEl.scrollIntoView({ block: "center" });
      noticeEl.focus({ preventScroll: true });
    } catch (e) { try { noticeEl.scrollIntoView(); } catch (e2) {} }
  }

  /* --- keyboard focus across re-renders (R3) --- */
  function activeInfo() {
    var a = document.activeElement;
    if (!a || a === document.body || !cartRoot.contains(a)) return null;
    var li = a.closest ? a.closest(".cart-item") : null;
    var idx = -1;
    if (li && itemsEl) { var all = itemsEl.querySelectorAll(".cart-item"); for (var i = 0; i < all.length; i++) if (all[i] === li) idx = i; }
    return { el: a, key: a.getAttribute ? a.getAttribute("data-focus-key") : null, rowIndex: idx };
  }
  function restoreFocus(info) {
    if (!info) return;
    if (document.contains(info.el) && !info.el.disabled) return;   /* untouched control — focus never left it */
    var t = null;
    if (info.key) t = cartRoot.querySelector('[data-focus-key="' + info.key + '"]');
    if (!t && info.rowIndex >= 0 && itemsEl) {
      var rows = itemsEl.querySelectorAll(".cart-item");
      if (rows.length) { var li = rows[Math.min(info.rowIndex, rows.length - 1)]; t = li.querySelector(".cart-item__remove") || li.querySelector("button, input, a"); }
    }
    if (!t && emptyEl && !emptyEl.hidden) t = emptyEl.querySelector("a, button");
    if (!t && summaryEl && layoutEl && !layoutEl.hidden) t = summaryEl.querySelector("a, button");
    if (t) { try { t.focus(); } catch (e) {} }
  }

  function fillMsgs(msgBox, row) {
    msgBox.textContent = "";
    if (row.notes.length) noteMemory[row.id] = row.notes.slice();
    var notes = noteMemory[row.id] || [];
    notes.concat(row.messages).forEach(function (m) { msgBox.appendChild(el("p", "cart-item__msg", m)); });
    if (row.inquiry) msgBox.appendChild(inquiryLink(row));
  }

  function buildRow(row) {
    var ref = { li: null, qty: null, sub: null, unit: null, msgBox: null, available: row.available, stock: row.stock, pricePara: row.pricePara, id: row.id };
    var li = el("article", "cart-item" + (row.available ? "" : " cart-item--off"));
    li.setAttribute("data-cart-line", row.id);

    var linked = !!(row.entry && row.entry.url);
    var media = el(linked ? "a" : "span", "cart-item__media");
    if (linked) { media.href = rootUrl + row.entry.url; media.setAttribute("aria-label", nameOf(row) + " — strana proizvoda"); }
    if (row.entry && row.entry.image) {
      var img = document.createElement("img");
      img.src = rootUrl + row.entry.image;
      img.alt = "";
      img.width = 84; img.height = 112;
      img.loading = "lazy";
      media.appendChild(img);
    }
    li.appendChild(media);

    var body = el("div", "cart-item__body");
    var name = el("p", "cart-item__name");
    var nameText = nameOf(row);
    if (row.entry && row.entry.url) {
      var a = el("a", null, nameText);
      a.href = rootUrl + row.entry.url;
      name.appendChild(a);
    } else {
      name.textContent = nameText;
    }
    body.appendChild(name);
    if (variantOf(row)) body.appendChild(el("p", "cart-item__meta", variantOf(row)));
    if (skuOf(row)) body.appendChild(skuLine("cart-item__meta cart-sku", skuOf(row)));
    if (row.available) {
      ref.unit = el("p", "cart-item__unit", money(row.pricePara) + " po komadu · " + inv.priceBasis(lastData));
      body.appendChild(ref.unit);
    }
    ref.msgBox = el("div", "cart-item__msgs");
    fillMsgs(ref.msgBox, row);
    body.appendChild(ref.msgBox);

    var remove = el("button", "cart-item__remove", "Ukloni");
    remove.type = "button";
    remove.setAttribute("aria-label", "Ukloni " + nameText + " iz korpe");
    remove.setAttribute("data-focus-key", row.id + ":remove");
    remove.addEventListener("click", function () {
      if (sending) return;
      delete noteMemory[row.id];
      setQuantity(row.id, 0);
      render(lastData);
    });

    var side = el("div", "cart-item__side");
    if (row.available) {
      ref.qty = buildQty({
        min: 1, max: row.stock === null ? QTY_LIMIT : row.stock, value: row.quantity, focusKey: row.id,
        onBelowMin: function () { if (sending) return; delete noteMemory[row.id]; setQuantity(row.id, 0); render(lastData); },
        onChange: function (v, capped, requested) {
          if (sending) return;
          delete noteMemory[row.id];
          setQuantity(row.id, v, { price: ref.pricePara / 100, wanted: capped ? requested : null });
          render(lastData);
        },
        onInvalid: function (text) {
          ref.msgBox.textContent = "";
          ref.msgBox.appendChild(el("p", "cart-item__msg", text));
        }
      });
      side.appendChild(ref.qty.root);
      var sub = el("p", "cart-item__subtotal");
      sub.appendChild(el("small", null, "Stavka " + inv.priceBasis(lastData)));
      ref.sub = el("b", null, money(row.subtotalPara));
      sub.appendChild(ref.sub);
      side.appendChild(sub);
    }
    side.appendChild(remove);

    li.appendChild(body);
    li.appendChild(side);
    ref.li = li;
    return ref;
  }

  function updateRow(ref, row) {
    ref.stock = row.stock; ref.pricePara = row.pricePara;
    if (ref.qty) { ref.qty.setMax(row.stock === null ? QTY_LIMIT : row.stock); ref.qty.set(row.quantity); }
    if (ref.unit) ref.unit.textContent = money(row.pricePara) + " po komadu · " + inv.priceBasis(lastData);
    if (ref.sub) ref.sub.textContent = money(row.subtotalPara);
    fillMsgs(ref.msgBox, row);
  }

  function render(data) {
    if (!data) return;
    lastData = data;
    var focus = activeInfo();
    var view = evaluate(data);
    var hasLines = view.rows.length > 0;
    if (layoutEl) layoutEl.hidden = !hasLines;
    if (emptyEl) emptyEl.hidden = hasLines;
    if (orderEl) orderEl.hidden = !hasLines || view.units === 0;
    notice(view.blocked
      ? "Deo proizvoda iz korpe trenutno nije dostupan. Uklonite nedostupne stavke da biste poslali porudžbinu."
      : "");
    if (!hasLines) {
      if (itemsEl) itemsEl.textContent = "";
      if (summaryEl) summaryEl.textContent = "";
      rowEls = {}; noteMemory = {};
      shownLines = [];
      updateBadge();
      restoreFocus(focus);
      return;
    }

    /* line items: same product with the same availability → updated in place (focus stays);
       availability changed → that row rebuilt; gone from the cart → removed */
    var seen = {};
    view.rows.forEach(function (row) {
      var ex = rowEls[row.id];
      if (ex && ex.available === row.available && ex.li.parentNode === itemsEl) {
        updateRow(ex, row);
      } else {
        var built = buildRow(row);
        if (ex && ex.li.parentNode === itemsEl) itemsEl.replaceChild(built.li, ex.li);
        else itemsEl.appendChild(built.li);
        rowEls[row.id] = built;
      }
      seen[row.id] = true;
    });
    Object.keys(rowEls).forEach(function (id) {
      if (seen[id]) return;
      var gone = rowEls[id].li;
      if (gone.parentNode) gone.parentNode.removeChild(gone);
      delete rowEls[id]; delete noteMemory[id];
    });

    if (summaryEl) {
      summaryEl.textContent = "";
      summaryEl.appendChild(el("h2", "cart-summary__title", "Pregled porudžbine"));
      var r1 = el("p", "cart-summary__row");
      r1.appendChild(el("span", null, "Proizvodi"));
      r1.appendChild(el("b", null, view.units + " " + komad(view.units)));
      summaryEl.appendChild(r1);
      var basis = inv.priceBasis(data);
      /* only the net amount of goods (owner decision 2026-09-26); imprint and delivery are said to be outside it */
      [["Uštampavanje i dostava", "nisu uključeni", "cart-summary__row cart-summary__row--muted"],
       ["Iznos robe " + basis, money(view.totalPara), "cart-summary__row cart-summary__row--total"]].forEach(function (t) {
        var r = el("p", t[2]);
        r.appendChild(el("span", null, t[0]));
        r.appendChild(document.createTextNode(" "));
        r.appendChild(el("b", null, t[1]));
        summaryEl.appendChild(r);
      });
      summaryEl.appendChild(el("p", "cart-summary__note",
        "Cene su iz Cenovnika kalendara 2027: u evrima, " + basis + " (PDV 20 %), plative u dinarima — iznos u dinarima i PDV obračunavaju se na računu. " +
        "Uštampavanje logotipa i dostava nisu uključeni; za iznose kupovine preko 12.000 dinara troškove dostave snosi Demo Group. Iznos nije račun."));
      var pay = el("p", "cart-summary__pay");
      pay.appendChild(el("b", null, "Bez online plaćanja. "));
      pay.appendChild(document.createTextNode(inv.confirmNote));
      summaryEl.appendChild(pay);

      var go = el("a", "btn btn--block cart-summary__go", "Nastavite ka porudžbini");
      go.href = "#porudzbina";
      summaryEl.appendChild(go);
      var back = el("a", "cart-summary__back", "Nastavite kupovinu");
      back.href = rootUrl + "kalendari/index.html";
      summaryEl.appendChild(back);
      var ask = el("p", "cart-summary__ask");
      ask.appendChild(document.createTextNode("Veći tiraž ili posebno uštampavanje? "));
      var askA = el("a", null, "Zatražite ponudu");
      askA.href = rootUrl + "kalendari/index.html?upit=korpa#upit";
      ask.appendChild(askA);
      ask.appendChild(document.createTextNode("."));
      summaryEl.appendChild(ask);

      /* manual clear, behind a small branded confirmation — never instant */
      var clear = el("div", "cart-clear");
      var clearBtn = el("button", "cart-clear__btn", "Isprazni korpu");
      clearBtn.type = "button";
      clearBtn.setAttribute("data-focus-key", "clear:btn");
      var confirmBox = el("div", "cart-clear__confirm");
      confirmBox.hidden = true;
      confirmBox.appendChild(el("span", null, "Isprazniti celu korpu?"));
      var yes = el("button", "btn btn--sm", "Isprazni");
      yes.type = "button";
      yes.setAttribute("data-focus-key", "clear:yes");
      var no = el("button", "btn btn--sm btn--outline", "Otkaži");
      no.type = "button";
      no.setAttribute("data-focus-key", "clear:no");
      confirmBox.appendChild(yes);
      confirmBox.appendChild(no);
      clearBtn.addEventListener("click", function () {
        clearBtn.hidden = true;
        confirmBox.hidden = false;
        no.focus();
      });
      no.addEventListener("click", function () {
        confirmBox.hidden = true;
        clearBtn.hidden = false;
        clearBtn.focus();
      });
      yes.addEventListener("click", function () {
        if (sending) return;
        noteMemory = {};
        writeCart([]);
        render(lastData);
      });
      clear.appendChild(clearBtn);
      clear.appendChild(confirmBox);
      summaryEl.appendChild(clear);
    }
    updateBadge();
    commit(view);                                   /* what is on screen is now the seen state */
    shownLines = linesOf(view);                     /* …and this is the exact cart (lines, quantities, prices) the page now displays */
    if (sending) lockCart(true);                    /* a re-render never unlocks a pending submission */
    restoreFocus(focus);
  }

  /* --- the order payload ---------------------------------------------------- */
  function fieldValue(name) {
    var f = form.querySelector('[name="' + name + '"]');
    if (!f) return "";
    if (f.type === "radio") { var c = form.querySelector('[name="' + name + '"]:checked'); return c ? c.value : ""; }
    if (f.type === "checkbox") return f.checked ? "Da" : "Ne";
    return String(f.value || "").trim();
  }

  function orderLines(view) {
    return view.rows.filter(function (r) { return r.available; }).map(function (row, i) {
      return (i + 1) + ". " + nameOf(row) + (variantOf(row) ? " — " + variantOf(row) : "") + (skuOf(row) ? " — šifra " + skuOf(row) : "") +
             " — " + row.quantity + " kom × " + net(row.pricePara, lastData) + " = " + net(row.subtotalPara, lastData) +
             (row.wanted ? " (traženo " + row.wanted + " kom — potreban upit za veći tiraž)" : "");
    });
  }

  function orderText(view, ref, now) {
    var out = ["Broj porudžbine: " + ref, "Vreme: " + stampNice(now), "", "Stavke:"];
    out = out.concat(orderLines(view));
    out.push("");
    out.push("Ukupno komada: " + view.units);
    out.push("Iznos robe " + inv.priceBasis(lastData) + ": " + money(view.totalPara) + " (plativo u dinarima; bez uštampavanja i dostave)");
    out.push("Uštampavanje logotipa: " + fieldValue("Uštampavanje"));
    out.push("Preuzimanje: " + (fieldValue("Način preuzimanja") || "nije navedeno"));
    if (isDelivery()) out.push("Adresa za dostavu: " + [fieldValue("Adresa"), [fieldValue("Poštanski broj"), fieldValue("Grad")].filter(Boolean).join(" ")].filter(Boolean).join(", "));
    out.push("");
    out.push("Iznosi su izračunati na sajtu prema Cenovniku kalendara 2027 u trenutku porudžbine (u evrima, bez PDV-a) i zahtevaju proveru pre izdavanja računa; iznos u dinarima, PDV, uštampavanje i dostava obračunavaju se na računu. Bez online plaćanja — " + inv.confirmNote);
    return out.join("\n");
  }

  function fillHidden(view, ref, now) {
    var set = function (name, value) { var f = form.querySelector('[name="' + name + '"]'); if (f) f.value = value; };
    set("Broj porudžbine", ref);
    set("Porudžbina", orderText(view, ref, now));
    set("Iznos robe bez PDV-a", money(view.totalPara));
    set("Broj komada", String(view.units));
    set("Valuta", inv.currency(lastData));
    set("Osnova cene", "Cenovnik kalendara 2027 — " + inv.currency(lastData) + ", " + inv.priceBasis(lastData) + " (PDV 20 %), plativo u dinarima; bez uštampavanja i dostave");
    set("_subject", "Nova porudžbina " + ref + " — Kalendari 2027");
  }

  /* --- submission ------------------------------------------------------------ */
  var IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  var AJAX_URL = "https://formsubmit.co/ajax/info@demogroup.rs";

  function submitButton() { return form.querySelector('button[type="submit"]'); }

  /* while a request is pending nothing on this page may change the cart (R2):
     quantity controls, "Ukloni" and "Isprazni korpu" are disabled together with the submit button */
  function lockCart(on) {
    if (layoutEl) { layoutEl.classList.toggle("cart-layout--sending", !!on); layoutEl.setAttribute("aria-busy", on ? "true" : "false"); }
    var ctrls = document.querySelectorAll("[data-cart-items] button, [data-cart-items] input, [data-cart-summary] button, .cart-drawer__list button, .cart-drawer__list input");
    Array.prototype.forEach.call(ctrls, function (c) { c.disabled = !!on; });
  }
  function setSending(on) {
    sending = !!on;
    lockCart(on);
    var b = submitButton(); if (!b) return;
    if (on) { b.dataset.label = b.dataset.label || b.textContent; b.disabled = true; b.textContent = "Šaljemo…"; }
    else { b.disabled = false; if (b.dataset.label) b.innerHTML = 'Pošaljite porudžbinu <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'; }
  }
  function formStatus(text, kind) {
    var s = form.querySelector(".form__status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("form__status--error", kind === "error");
  }

  function validateForm() {
    var required = [
      ['[name="Ime i prezime"]', "Unesite ime i prezime."],
      ['[name="Telefon"]', "Unesite broj telefona."],
      ['[name="_replyto"]', "Unesite e-adresu."]
    ];
    for (var i = 0; i < required.length; i++) {
      var f = form.querySelector(required[i][0]);
      if (f && !String(f.value).trim()) { formStatus(required[i][1], "error"); f.focus(); return false; }
    }
    var email = form.querySelector('[name="_replyto"]');
    if (email && email.value && email.checkValidity && !email.checkValidity()) { formStatus("E-adresa nije ispravna.", "error"); email.focus(); return false; }
    if (isDelivery()) {
      /* same order as on screen: city, postal code, street address */
      var city = form.querySelector('[name="Grad"]'), zip = form.querySelector('[name="Poštanski broj"]'), addr = form.querySelector('[name="Adresa"]');
      if (city && !city.value.trim()) { formStatus("Za dostavu unesite grad.", "error"); city.focus(); return false; }
      if (zip && !/^\d{5}$/.test(zip.value.replace(/\s+/g, ""))) { formStatus(zip.value.trim() ? "Poštanski broj ima pet cifara (npr. 15000)." : "Za dostavu unesite poštanski broj.", "error"); zip.focus(); return false; }
      if (addr && !addr.value.trim()) { formStatus("Za dostavu unesite adresu (ulicu i broj).", "error"); addr.focus(); return false; }
    }
    var consent = form.querySelector('.consent input[type="checkbox"][required]');   /* the imprint option is a .consent-styled checkbox too, but optional */
    if (consent && !consent.checked) { formStatus("Potrebna je saglasnost za obradu podataka.", "error"); consent.focus(); return false; }
    formStatus("");
    return true;
  }

  /* keepCart: the cart still holds lines that were NOT part of the sent order (changed meanwhile) —
     they stay visible under the confirmation instead of being wiped */
  function showSent(ref, preview, keepCart) {
    if (!keepCart) {
      if (layoutEl) layoutEl.hidden = true;
      if (orderEl) orderEl.hidden = true;
      notice("");
    } else if (successEl && noticeEl && noticeEl.parentNode === successEl.parentNode) {
      /* confirmation first, then the notice and the lines that were not part of it */
      successEl.parentNode.insertBefore(successEl, noticeEl);
    }
    if (emptyEl) emptyEl.hidden = true;
    if (successEl) {
      var pv = successEl.querySelector("[data-order-preview]");
      if (pv) pv.hidden = !preview;
      successEl.querySelector("[data-order-ref]").textContent = ref;
      successEl.hidden = false;
      try { successEl.focus(); } catch (e) {}
    }
  }

  /* After a confirmed send only the SENT quantities leave the cart. A line that grew or was added
     while the request was pending (another tab) keeps the difference — nothing disappears silently. */
  function settleAfterSend(snapshot) {
    var current = readCart(), remaining = [];
    current.forEach(function (line) {
      var sent = null;
      snapshot.forEach(function (s) { if (s.id === line.productId) sent = s; });
      if (!sent) { remaining.push(line); return; }
      var rem = line.quantity - sent.quantity;
      if (rem > 0) {
        var keep = { productId: line.productId, quantity: rem };
        if (typeof line.lastPrice === "number") keep.lastPrice = line.lastPrice;
        remaining.push(keep);
      }
    });
    if (remaining.length) writeCart(remaining);
    else { try { localStorage.removeItem(KEY); } catch (e) {} updateBadge(); }
    return remaining;
  }

  function payloadFromForm() {
    var data = {};
    var fields = form.querySelectorAll("input, textarea, select");
    Array.prototype.forEach.call(fields, function (f) {
      if (!f.name || f.type === "submit" || f.type === "button" || f.type === "file") return;
      if (f.disabled) return;                    /* e.g. the address fields while pickup in Šabac is chosen */
      if (f.type === "radio") { if (f.checked) data[f.name] = f.value; return; }
      if (f.type === "checkbox") { if (f.name) data[f.name] = f.checked ? "Da" : "Ne"; return; }
      data[f.name] = f.value;
    });
    return data;
  }

  /* --- pickup or delivery ------------------------------------------------------ */
  /* "Lično u Šapcu" needs no address: the city / postal code / address group is hidden AND its inputs disabled —
     a disabled field is neither validated nor submitted (AJAX payload and the classic POST fallback alike), so it can
     never block the order or appear as a delivery address. The typed values stay in the inputs: switching back to
     "Dostava na adresu" shows them again, now required. */
  var deliveryBox = form ? form.querySelector("[data-delivery-fields]") : null;
  function isDelivery() { return !!form && fieldValue("Način preuzimanja") === "Dostava na adresu"; }
  function syncDelivery() {
    if (!deliveryBox) return;
    var on = isDelivery();
    deliveryBox.hidden = !on;
    Array.prototype.forEach.call(deliveryBox.querySelectorAll("input, select, textarea"), function (f) {
      f.disabled = !on;
      f.required = on;
    });
  }
  if (form && deliveryBox) {
    Array.prototype.forEach.call(form.querySelectorAll('input[name="Način preuzimanja"]'), function (r) {
      r.addEventListener("change", syncDelivery);
    });
    syncDelivery();
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();                        /* always: validate stock first, then send ourselves */
      if (sending) return;
      if (!validateForm()) return;
      setSending(true);
      var confirmed = shownLines ? shownLines.slice() : null;   /* what this tab displayed when the customer clicked */
      inv.reload().then(function (data) {
        var view = evaluate(data);
        if (view.blocked || view.units === 0) {
          setSending(false);
          render(data);
          notice("Deo proizvoda iz korpe trenutno nije dostupan. Uklonite nedostupne stavke da biste poslali porudžbinu.");
          formStatus("Porudžbina nije poslata: deo proizvoda više nije dostupan — proverite korpu iznad.", "error");
          revealNotice();
          return;
        }
        var diff = diffLines(confirmed, linesOf(view));
        if (diff === "lines") {
          /* the cart itself (lines or quantities, e.g. edited in another tab) changed while the inventory
             preflight was in flight — the confirmed view is stale: nothing is sent, the current cart is
             rendered and the customer confirms again. Nothing is added to or dropped from an order silently. */
          setSending(false);
          render(data);
          notice("Korpa je u međuvremenu izmenjena. Proverite stavke i novi iznos, pa ponovo potvrdite porudžbinu.");
          formStatus("Porudžbina nije poslata: korpa je u međuvremenu izmenjena — proverite stavke iznad, pa pošaljite ponovo.", "error");
          revealNotice();
          return;
        }
        if (view.changed || diff === "price") {
          /* diff === "price": THIS tab still shows the old unit price although another tab has already seen
             (and stored) the new one — the displayed total is not what would be sent, so reconfirm here too */
          /* R1: a price, stock or availability change since the cart was shown — nothing is sent;
             the new amount and the per-line note are rendered, the page moves to them and the
             customer confirms again. The line by the button says the same, for whoever stays there. */
          setSending(false);
          if (diff === "price") {
            /* the stored lastPrice was already advanced by the other tab, so evaluate() has no note — write it
               from THIS tab's displayed price so the customer sees old → new */
            view.rows.forEach(function (r) { var c = null; confirmed.forEach(function (x) { if (x.id === r.id) c = x; });
              if (r.available && c && c.pricePara !== null && c.pricePara !== r.pricePara) noteMemory[r.id] = ["Cena je ažurirana: ranije " + net(c.pricePara, data) + ", sada " + net(r.pricePara, data) + " po komadu."]; });
          }
          render(data);
          notice("Podaci u korpi su se u međuvremenu promenili (cena ili dostupnost). Proverite novi iznos robe — " +
                 net(view.totalPara, data) + " — pa pošaljite porudžbinu ponovo.");
          formStatus("Porudžbina nije poslata: iznos robe je promenjen na " + net(view.totalPara, data) +
                     " — proverite korpu iznad, pa pošaljite ponovo.", "error");
          revealNotice();
          return;
        }
        lastData = data;
        /* the form stays editable while the stock check is pending (e.g. pickup → delivery with an empty address,
           a cleared phone): validate again what will actually be sent — nothing invalid leaves this page */
        if (!validateForm()) { setSending(false); return; }
        var snapshot = view.rows.filter(function (r) { return r.available; }).map(function (r) { return { id: r.id, quantity: r.quantity }; });
        var now = new Date();
        var ref = orderRef(now);
        fillHidden(view, ref, now);

        var qaSend = false;
        try { qaSend = sessionStorage.getItem("dgQaSend") === "1"; } catch (err) { qaSend = false; }
        if (IS_LOCAL && !qaSend) {
          /* PREVIEW GUARD: the endpoint is live — never post from localhost. The intended
             confirmation is shown, clearly marked; the cart is kept so QA can repeat the flow. */
          window.setTimeout(function () { setSending(false); showSent(ref, true, false); }, 250);
          return;
        }

        if (!window.fetch || !window.Promise) {
          /* classic POST fallback: the redirect page clears the cart when it finds the marker */
          try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ref: ref, t: Date.now() })); } catch (err) {}
          form.submit();
          return;
        }

        var body = payloadFromForm();
        var timeout = null;
        var controller = window.AbortController ? new AbortController() : null;
        if (controller) timeout = window.setTimeout(function () { controller.abort(); }, 20000);
        fetch(AJAX_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(body),
          signal: controller ? controller.signal : undefined
        }).then(function (res) {
          return res.text().then(function (txt) {
            var json = null; try { json = JSON.parse(txt); } catch (err) { json = null; }
            var ok = res.ok && json && (json.success === true || json.success === "true");
            if (!ok) {
              var why = (json && json.message) ? String(json.message) : ("odgovor servisa " + res.status);
              throw new Error(why);
            }
            return json;
          });
        }).then(function () {
          if (timeout) window.clearTimeout(timeout);
          var remaining = settleAfterSend(snapshot);
          noteMemory = {};
          setSending(false);
          if (remaining.length) {
            var n = remaining.reduce(function (a, l) { return a + l.quantity; }, 0);
            render(data);
            showSent(ref, false, true);
            notice("Porudžbina " + ref + " je poslata sa tačno prikazanim stavkama. U korpi su ostale izmene napravljene tokom slanja (" +
                   n + " " + komad(n) + ") — nisu deo poslate porudžbine. Proverite ih pre nove porudžbine.");
          } else {
            if (itemsEl) itemsEl.textContent = "";
            rowEls = {};
            showSent(ref, false, false);
          }
        }).catch(function (err) {
          if (timeout) window.clearTimeout(timeout);
          setSending(false);
          render(data);                          /* the display follows current data even after a failure */
          var reason = (err && err.name === "AbortError") ? "istek vremena" : ((err && err.message) ? err.message : "greška u mreži");
          formStatus("Slanje nije uspelo (" + reason + "). Korpa i uneti podaci su sačuvani — pokušajte ponovo ili nas pozovite na 063 227 674.", "error");
          notice("Porudžbina nije poslata. Možete pokušati ponovo — ništa iz korpe nije obrisano.");
        });
      }).catch(function () {
        /* inventory unreachable: nothing was sent; show the cart as it is NOW (another tab may have changed it)
           so a retry confirms a consistent, visible order; typed data stays */
        setSending(false);
        if (lastData) render(lastData);
        notice("Trenutno nije moguće proveriti stanje. Porudžbina nije poslata — proverite korpu i pokušajte ponovo za nekoliko trenutaka.");
        formStatus("Porudžbina nije poslata: stanje proizvoda trenutno nije moguće proveriti. Pokušajte ponovo.", "error");
      });
    }, true);   /* capture phase: runs before site.js's generic double-submit guard, so a validation stop
                   here (preventDefault) keeps that guard from disabling the button */
  }

  /* the cart changed in another tab: redraw from the latest data (never while a request is pending —
     the pending order is a snapshot and the change is reconciled when the answer arrives) */
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY || sending || !lastData) return;
    render(lastData);
  });

  inv.load().then(render).catch(function () {
    if (layoutEl) layoutEl.hidden = true;
    if (orderEl) orderEl.hidden = true;
    if (emptyEl) emptyEl.hidden = readCart().length > 0 ? true : false;
    notice(readCart().length
      ? "Trenutno nije moguće učitati stanje proizvoda. Osvežite stranu ili pokušajte kasnije."
      : "");
  });
})();
