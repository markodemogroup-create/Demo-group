const API_BASE = "https://demo-group-api.marko-demogroup.workers.dev";
const VAT_RATE = 0.2;
const itemsElement = document.getElementById("cartItems");
const emptyElement = document.getElementById("emptyCart");
const summaryElement = document.getElementById("cartSummary");
const subtotalElement = document.getElementById("cartSubtotal");
const vatElement = document.getElementById("cartVat");
const totalElement = document.getElementById("cartTotal");
const formMessage = document.getElementById("formMessage");
const DRAFT_KEY = "demoshop_quote_customer_draft_v1";
const draftFields = ["customerName", "customerCompany", "customerPib", "customerEmail", "customerPhone", "customerAddress", "customerNote"];

function editUrl(item, index) {
  const url = new URL("product.html", window.location.href);
  url.searchParams.set("model", item.modelCode || "");
  if (item.colorCode) url.searchParams.set("shade", item.colorCode);
  url.searchParams.set("editCart", String(index));
  return `${url.pathname.split("/").pop()}${url.search}`;
}

function saveDraft() {
  const draft = Object.fromEntries(draftFields.map(id => [id, document.getElementById(id)?.value || ""]));
  draft.customerType = document.querySelector('input[name="customerType"]:checked')?.value || "Pravno lice";
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    draftFields.forEach(id => {
      const field = document.getElementById(id);
      if (field && typeof draft[id] === "string") field.value = draft[id];
    });
    const type = [...document.querySelectorAll('input[name="customerType"]')].find(input => input.value === draft.customerType);
    if (type) type.checked = true;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;",
  })[character]);
}

function money(value) {
  return `${Number(value || 0).toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function render() {
  const items = window.DemoCart.read();
  emptyElement.classList.toggle("hidden", items.length > 0);
  summaryElement.classList.toggle("hidden", items.length === 0);
  itemsElement.innerHTML = items.map((item, index) => {
    const price = Number(item.price);
    const hasPrice = Number.isFinite(price) && price > 0;
    const step = Math.max(1, Number(item.packStep) || 1);
    const packages = Math.max(1, Math.round(Number(item.quantity) / step));
    const url = editUrl(item, index);
    return `<article class="cart-item">
      <a class="cart-item-image cart-edit-link" href="${escapeHtml(url)}" aria-label="Izmeni ${escapeHtml(item.name)}">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ""}</a>
      <div class="cart-item-info"><p>${escapeHtml(item.modelCode)}</p><h2><a class="cart-edit-link" href="${escapeHtml(url)}">${escapeHtml(item.name)}</a></h2>
        <span>${escapeHtml(item.code)}${item.colorCode ? ` · boja ${escapeHtml(item.colorCode)}` : ""}${item.size ? ` · ${escapeHtml(item.size)}` : ""}</span>
        <small>${Number(item.quantity).toLocaleString("sr-RS")} kom. · ${packages} pak. po ${step.toLocaleString("sr-RS")} kom.</small>
        <a class="cart-edit-action" href="${escapeHtml(url)}">Izmeni boju ili veličinu →</a></div>
      <div class="cart-quantity-stepper" aria-label="Količina">
        <button type="button" data-cart-change="-1" data-index="${index}" aria-label="Smanji količinu">−</button>
        <output>${Number(item.quantity).toLocaleString("sr-RS")}</output>
        <button type="button" data-cart-change="1" data-index="${index}" aria-label="Povećaj količinu">+</button>
      </div>
      <div class="cart-item-price"><strong>${hasPrice ? money(price * item.quantity) : "Cena na upit"}</strong>
        <small>${hasPrice ? `${money(price * item.quantity * 1.2)} sa PDV-om` : "Ponuda nakon provere"}</small></div>
      <button class="remove-item" type="button" data-remove="${index}" aria-label="Ukloni proizvod">×</button>
    </article>`;
  }).join("");

  const subtotal = items.reduce((sum, item) => {
    const price = Number(item.price);
    return sum + (Number.isFinite(price) && price > 0 ? price * Number(item.quantity || 0) : 0);
  }, 0);
  subtotalElement.textContent = money(subtotal);
  vatElement.textContent = money(subtotal * VAT_RATE);
  totalElement.textContent = money(subtotal * (1 + VAT_RATE));
}

itemsElement.addEventListener("click", event => {
  const changeButton = event.target.closest("[data-cart-change]");
  if (changeButton) {
    const items = window.DemoCart.read();
    const index = Number(changeButton.dataset.index);
    const item = items[index];
    if (item) window.DemoCart.change(index, Number(changeButton.dataset.cartChange));
    render();
    return;
  }
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    window.DemoCart.remove(Number(removeButton.dataset.remove));
    render();
  }
});

document.getElementById("sendQuote").addEventListener("click", async () => {
  const sendButton = document.getElementById("sendQuote");
  const name = document.getElementById("customerName").value.trim();
  const email = document.getElementById("customerEmail").value.trim();
  if (!name || !email) {
    formMessage.textContent = "Unesite ime i email pre slanja upita.";
    formMessage.classList.add("form-error");
    return;
  }
  const buyerType = document.querySelector('input[name="customerType"]:checked')?.value || "Pravno lice";
  const company = document.getElementById("customerCompany").value.trim();
  const pib = document.getElementById("customerPib").value.trim();
  const address = document.getElementById("customerAddress").value.trim();
  const userNote = document.getElementById("customerNote").value.trim();
  const note = [`Tip kupca: ${buyerType}`, company && `Firma: ${company}`, pib && `PIB: ${pib}`, address && `Adresa: ${address}`, userNote && `Napomena: ${userNote}`].filter(Boolean).join("\n");

  sendButton.disabled = true;
  sendButton.textContent = "Slanje…";
  formMessage.classList.remove("form-error", "form-success");
  formMessage.textContent = "Šaljemo upit…";
  try {
    const response = await fetch(`${API_BASE}/send-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        website: document.getElementById("website").value,
        customer: { name, company, email, phone: document.getElementById("customerPhone").value.trim(), note },
        items: window.DemoCart.read(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "Upit nije poslat.");
    window.DemoCart.write([]);
    localStorage.removeItem(DRAFT_KEY);
    render();
    formMessage.textContent = data.quoteReference ? `Upit ${data.quoteReference} je uspešno poslat.` : "Upit je uspešno poslat na Demo Group email.";
    formMessage.classList.add("form-success");
    sendButton.textContent = "Upit je poslat ✓";
  } catch (error) {
    formMessage.textContent = `Slanje nije uspelo: ${error.message}`;
    formMessage.classList.add("form-error");
    sendButton.disabled = false;
    sendButton.textContent = "Pokušaj ponovo";
  }
});

restoreDraft();
summaryElement?.addEventListener("input", saveDraft);
summaryElement?.addEventListener("change", saveDraft);
render();
