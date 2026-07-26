(function () {
  const API_BASE = "https://demo-group-api.marko-demogroup.workers.dev";
  const form = document.querySelector("[data-header-search]");
  const input = form?.querySelector("[data-header-search-input]");
  const suggestions = form?.querySelector("[data-header-search-suggestions]");
  if (!form || !input || !suggestions) return;

  let timer;
  let requestId = 0;
  let activeIndex = -1;
  const detailCache = new Map();

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);

  function closeSuggestions() {
    suggestions.classList.add("hidden");
    suggestions.innerHTML = "";
    activeIndex = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function setActive(index) {
    const items = [...suggestions.querySelectorAll(".search-suggestion")];
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((item, itemIndex) => item.classList.toggle("active", itemIndex === activeIndex));
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  function modelAssetIds(...values) {
    return [...new Set(values.filter(Boolean).flatMap(value => {
      const code = String(value).trim().replace(/-(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-9]XL|[0-9]{2,3})$/i, "");
      const parts = code.split(".").filter(Boolean);
      const candidates = [code.replace(/[^a-zA-Z0-9]/g, "")];
      if (parts.length >= 3 && /^\d{1,4}$/.test(parts.at(-1))) {
        candidates.unshift(parts.slice(0, -1).join("").replace(/[^a-zA-Z0-9]/g, ""));
      }
      return candidates;
    }).filter(Boolean))];
  }

  async function getVariantDetail(id) {
    if (!id) return null;
    if (detailCache.has(id)) return detailCache.get(id);
    const promise = fetch(`${API_BASE}/variant-detail?id=${encodeURIComponent(id)}&v=49`, {
      headers: { Accept: "application/json" },
    }).then(async response => {
      if (!response.ok) return null;
      const data = await response.json();
      return data.success ? data.variant : null;
    }).catch(() => null);
    detailCache.set(id, promise);
    return promise;
  }

  function loadImageFromCandidates(image, candidates) {
    const urls = [...new Set(candidates.filter(Boolean))];
    let cursor = 0;
    const tryNext = () => {
      const url = urls[cursor++];
      if (!url) {
        image.hidden = true;
        image.removeAttribute("src");
        return;
      }
      image.hidden = false;
      image.classList.remove("loaded");
      image.onload = () => image.classList.add("loaded");
      image.onerror = tryNext;
      image.src = url;
    };
    tryNext();
  }

  async function hydrateImages(products, currentRequest) {
    await Promise.all(products.map(async (product, index) => {
      const detail = await getVariantDetail(product.representativeVariantId);
      if (currentRequest !== requestId) return;
      const image = suggestions.querySelector(`[data-header-suggestion-image="${index}"]`);
      if (!image) return;
      const modelImages = modelAssetIds(product.modelCode, product.representativeCode)
        .map(id => `https://apiv2.promosolution.services/content/ModelItem/${id}_000.webp`);
      loadImageFromCandidates(image, [
        ...modelImages,
        detail?.image,
        ...(Array.isArray(detail?.images) ? detail.images : []),
      ]);
    }));
  }

  async function loadSuggestions() {
    const query = input.value.trim();
    if (query.length < 2) return closeSuggestions();
    const currentRequest = ++requestId;

    try {
      const params = new URLSearchParams({ search: query, page: "1", limit: "6" });
      const response = await fetch(`${API_BASE}/products-grouped?${params}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (currentRequest !== requestId) return;
      const products = Array.isArray(data.products) ? data.products : [];

      suggestions.innerHTML = products.length
        ? products.map((product, index) => {
            const model = String(product.modelCode || "");
            const title = String(product.name || model || "Proizvod").split(",")[0];
            return `<a class="search-suggestion" role="option" href="product.html?model=${encodeURIComponent(model)}&v=59">
              <span class="search-suggestion-copy"><strong>${escapeHtml(title)}</strong><small>Model ${escapeHtml(model)}</small></span>
              <img class="search-suggestion-image" data-header-suggestion-image="${index}" alt="">
            </a>`;
          }).join("")
        : '<div class="search-suggestion-empty">Nema pronađenih proizvoda.</div>';
      suggestions.classList.remove("hidden");
      input.setAttribute("aria-expanded", "true");
      activeIndex = -1;
      hydrateImages(products, currentRequest);
    } catch {
      closeSuggestions();
    }
  }

  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(loadSuggestions, 250);
  });
  input.addEventListener("keydown", event => {
    const items = [...suggestions.querySelectorAll(".search-suggestion")];
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === "Enter" && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      window.location.href = items[activeIndex].href;
    } else if (event.key === "Escape") {
      closeSuggestions();
    }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = input.value.trim();
    window.location.href = query ? `index.html?search=${encodeURIComponent(query)}#catalogStart` : "index.html";
  });
  document.addEventListener("click", event => {
    if (!form.contains(event.target)) closeSuggestions();
  });
})();
