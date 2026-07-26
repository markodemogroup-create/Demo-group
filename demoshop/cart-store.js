(function () {
  const KEY = "demoshop_quote_cart_v1";
  const VAT_RATE = 0.2;

  const integer = (value, fallback = 1) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  function normalizeItem(item) {
    const packStep = integer(item?.packStep, 1);
    const stock = Number(item?.maxStock);
    const maxStock = Number.isFinite(stock) && stock > 0
      ? Math.floor(stock / packStep) * packStep
      : null;
    let quantity = integer(item?.quantity, packStep);
    quantity = Math.max(packStep, Math.ceil(quantity / packStep) * packStep);
    if (maxStock && quantity > maxStock) quantity = maxStock;
    return { ...item, packStep, maxStock, quantity };
  }

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value.map(normalizeItem) : [];
    } catch {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(KEY, JSON.stringify((Array.isArray(items) ? items : []).map(normalizeItem)));
    updateBadges();
    renderDrawer();
  }

  function updateBadges() {
    const total = read().length;
    document.querySelectorAll("[data-cart-count]").forEach(element => {
      element.textContent = String(total);
      element.classList.toggle("has-items", total > 0);
    });
  }

  function add(item) {
    const normalized = normalizeItem(item);
    const items = read();
    const existing = items.find(entry => String(entry.id) === String(normalized.id));
    if (existing) {
      Object.assign(existing, normalized, {
        quantity: normalizeItem({ ...normalized, quantity: existing.quantity + normalized.quantity }).quantity,
      });
    } else {
      items.push(normalized);
    }
    write(items);
    openDrawer();
  }

  function replace(index, item) {
    const items = read();
    if (!items[index]) return false;
    const normalized = normalizeItem(item);
    items.splice(index, 1);
    const existing = items.find(entry => String(entry.id) === String(normalized.id));
    if (existing) {
      Object.assign(existing, normalized, {
        quantity: normalizeItem({ ...normalized, quantity: existing.quantity + normalized.quantity }).quantity,
      });
    } else {
      items.splice(Math.min(index, items.length), 0, normalized);
    }
    write(items);
    return true;
  }

  function change(index, direction) {
    const items = read();
    const item = items[index];
    if (!item) return;
    const delta = Number(direction) < 0 ? -1 : 1;
    const next = item.quantity + integer(item.packStep, 1) * delta;
    if (next < item.packStep) return;
    if (item.maxStock && next > item.maxStock) return;
    item.quantity = next;
    write(items);
  }

  function remove(index) {
    const items = read();
    items.splice(index, 1);
    write(items);
  }

  const money = value => `${Number(value || 0).toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);

  function ensureDrawer() {
    if (document.getElementById("cartDrawer")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="cartDrawerBackdrop" class="cart-drawer-backdrop hidden" data-drawer-close></div>
      <aside id="cartDrawer" class="cart-drawer hidden" aria-hidden="true" aria-label="Vaš upit">
        <div class="cart-drawer-head"><h2>Upit <small data-drawer-count></small></h2><button type="button" data-drawer-close aria-label="Zatvori korpu">×</button></div>
        <div class="cart-drawer-items" data-drawer-items></div>
        <div class="cart-drawer-footer">
          <div class="drawer-total-line"><span>Ukupno bez PDV-a</span><strong data-drawer-subtotal>0,00 €</strong></div>
          <div class="drawer-total-line"><span>PDV (20%)</span><strong data-drawer-vat>0,00 €</strong></div>
          <div class="drawer-total-line drawer-total-final"><span>Ukupno sa PDV-om</span><strong data-drawer-total>0,00 €</strong></div>
          <a class="drawer-primary" href="cart.html">Nastavi na upit</a>
          <button class="drawer-secondary" type="button" data-drawer-close>Nastavi kupovinu</button>
        </div>
      </aside>`);

    document.getElementById("cartDrawerBackdrop")?.addEventListener("click", closeDrawer);
    document.getElementById("cartDrawer")?.addEventListener("click", event => {
      const close = event.target.closest("[data-drawer-close]");
      if (close) return closeDrawer();
      const changeButton = event.target.closest("[data-drawer-change]");
      if (changeButton) return change(Number(changeButton.dataset.drawerIndex), Number(changeButton.dataset.drawerChange));
      const removeButton = event.target.closest("[data-drawer-remove]");
      if (removeButton) remove(Number(removeButton.dataset.drawerRemove));
    });
  }

  function renderDrawer() {
    ensureDrawer();
    const items = read();
    const list = document.querySelector("[data-drawer-items]");
    const count = document.querySelector("[data-drawer-count]");
    if (!list) return;
    if (count) count.textContent = `(${items.length} ${items.length === 1 ? "proizvod" : "proizvoda"})`;

    list.innerHTML = items.length ? items.map((item, index) => {
      const price = Number(item.price);
      const lineTotal = Number.isFinite(price) && price > 0 ? price * item.quantity : null;
      const packages = Math.max(1, Math.round(item.quantity / item.packStep));
      return `<article class="cart-drawer-item">
        <div class="cart-drawer-image">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ""}</div>
        <div class="cart-drawer-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code)}${item.colorCode ? ` · boja ${escapeHtml(item.colorCode)}` : ""}${item.size ? ` · ${escapeHtml(item.size)}` : ""}</small>
          <span>${item.packStep > 1 ? `${item.quantity.toLocaleString("sr-RS")} kom. = ${packages} pak.` : `${item.quantity.toLocaleString("sr-RS")} kom.`}</span>
          <div class="drawer-stepper"><button type="button" data-drawer-change="-1" data-drawer-index="${index}" ${item.quantity <= item.packStep ? "disabled" : ""}>−</button><output>${item.quantity.toLocaleString("sr-RS")}</output><button type="button" data-drawer-change="1" data-drawer-index="${index}" ${item.maxStock && item.quantity >= item.maxStock ? "disabled" : ""}>+</button></div>
        </div>
        <div class="cart-drawer-price"><strong>${lineTotal === null ? "Cena na upit" : money(lineTotal)}</strong>${lineTotal === null ? "" : `<small>${money(lineTotal * (1 + VAT_RATE))} sa PDV-om</small>`}<button type="button" data-drawer-remove="${index}" aria-label="Ukloni proizvod">Ukloni</button></div>
      </article>`;
    }).join("") : '<div class="cart-drawer-empty"><strong>Upit je prazan</strong><span>Dodajte proizvode iz kataloga.</span></div>';

    const subtotal = items.reduce((sum, item) => {
      const price = Number(item.price);
      return sum + (Number.isFinite(price) && price > 0 ? price * item.quantity : 0);
    }, 0);
    document.querySelector("[data-drawer-subtotal]").textContent = money(subtotal);
    document.querySelector("[data-drawer-vat]").textContent = money(subtotal * VAT_RATE);
    document.querySelector("[data-drawer-total]").textContent = money(subtotal * (1 + VAT_RATE));
  }

  function openDrawer() {
    ensureDrawer();
    renderDrawer();
    document.getElementById("cartDrawer")?.classList.remove("hidden");
    document.getElementById("cartDrawerBackdrop")?.classList.remove("hidden");
    document.getElementById("cartDrawer")?.setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-drawer-open");
  }

  function closeDrawer() {
    document.getElementById("cartDrawer")?.classList.add("hidden");
    document.getElementById("cartDrawerBackdrop")?.classList.add("hidden");
    document.getElementById("cartDrawer")?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-drawer-open");
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDrawer();
  });

  window.DemoCart = { read, write, add, replace, change, remove, openDrawer, closeDrawer, updateBadges, VAT_RATE };
  ensureDrawer();
  updateBadges();
  renderDrawer();
})();
