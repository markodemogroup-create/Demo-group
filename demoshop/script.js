const API_BASE = "https://demo-group-api.marko-demogroup.workers.dev";
const PAGE_LIMIT = 20;
const DETAIL_CONCURRENCY = 4;

const CUSTOM_COLLECTIONS = {
  "swiss-pens": { label: "Swiss Made olovke", terms: ["10.222", "10.220", "10.218", "10.217"] },
  "eco-writing": { label: "KIND SOFT i ZED", terms: ["10.216", "10.215", "10.214"] },
  "business-notes": { label: "DOMINGO A5 i FUTRO", terms: ["DOMINGO A5", "FUTRO"] },
  pigna: { label: "PIGNA kolekcija", terms: ["44.185", "44.184", "44.183"] },
  "summer-picks": { label: "Letnja kolekcija", terms: ["32.321", "37.018"] },
  "target-shirts": { label: "TARGET kolekcija", terms: ["50.070", "50.071", "50.072"] },
  "edison-baracuda": { label: "EDISON i BARACUDA", terms: ["38.215", "38.216"] },
  "everyday-bags": { label: "Kolekcija torbi", terms: ["34.782", "34.783"] },
};

const els = {
  apiStatus: document.getElementById("apiStatus"),
  heroTotal: document.getElementById("heroTotal"),
  totalMatches: document.getElementById("totalMatches"),
  resultsLabel: document.getElementById("resultsLabel"),
  pageInfo: document.getElementById("pageInfo"),
  message: document.getElementById("message"),
  grid: document.getElementById("productGrid"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  catalogStart: document.getElementById("catalogStart"),
  clearSearch: document.getElementById("clearSearch"),
  categoriesToggle: document.getElementById("categoriesToggle"),
  categoriesMenu: document.getElementById("categoriesMenu"),
  categoriesGrid: document.getElementById("categoriesGrid"),
  newMenuToggle: document.getElementById("newMenuToggle"),
  newMenu: document.getElementById("newMenu"),
  activeFilter: document.getElementById("activeFilter"),
  activeFilterName: document.getElementById("activeFilterName"),
  clearCategory: document.getElementById("clearCategory"),
  prev: document.getElementById("prevPage"),
  next: document.getElementById("nextPage"),
  paginationText: document.getElementById("paginationText"),
  pagination: document.querySelector(".pagination"),
  heroShowcase: document.getElementById("heroShowcase"),
  newProductsGrid: document.getElementById("newProductsGrid"),
  newProductsMessage: document.getElementById("newProductsMessage"),
  newProductsPrev: document.getElementById("newProductsPrev"),
  newProductsNext: document.getElementById("newProductsNext"),
  newProductsDots: document.getElementById("newProductsDots"),
  promoStoriesTrack: document.getElementById("promoStoriesTrack"),
  promoStoriesDots: document.getElementById("promoStoriesDots"),
  promoStoriesPrev: document.getElementById("promoStoriesPrev"),
  promoStoriesNext: document.getElementById("promoStoriesNext"),
  catalogFilters: document.getElementById("catalogFilters"),
  dynamicFilters: document.getElementById("dynamicFilters"),
  categoryFilterTree: document.getElementById("categoryFilterTree"),
  clearAllFilters: document.getElementById("clearAllFilters"),
  mobileFiltersToggle: document.getElementById("mobileFiltersToggle"),
  mobileFilterCount: document.getElementById("mobileFilterCount"),
};

const state = {
  page: 1,
  totalPages: 1,
  search: "",
  collection: "",
  category: "",
  subCategory: "",
  collectionLabel: "",
  status: "",
  filters: {
    brand: [], color: [], size: [], facetStatus: [], print: [], material: [],
    capacity: [], theme: [], equipment: [], minPrice: "", maxPrice: "",
  },
  requestId: 0,
  suggestionRequestId: 0,
  suggestionIndex: -1,
};

const variantDetailCache = new Map();
const groupAvailabilityCache = new Map();
let heroSlideIndex = 0;
let heroRotationTimer;
let newProductsCarousel;
let promoStoriesCarousel;
let menuCategories = [];
const menuSelection = { categoryCode: "", subCategoryCode: "" };

const initialUrlParams = new URLSearchParams(window.location.search);
state.search = initialUrlParams.get("search") || "";
state.collection = initialUrlParams.get("collection") || "";
state.category = initialUrlParams.get("category") || "";
state.subCategory = initialUrlParams.get("subCategory") || "";
if (CUSTOM_COLLECTIONS[state.collection]) state.collectionLabel = CUSTOM_COLLECTIONS[state.collection].label;
Object.keys(state.filters).forEach(key => {
  state.filters[key] = ["minPrice", "maxPrice"].includes(key)
    ? (initialUrlParams.get(key) || "")
    : initialUrlParams.getAll(key);
});
if (els.searchInput) els.searchInput.value = state.search;

const CATEGORY_LABELS = {
  TX: "Tekstil", UB: "USB memorije", KS: "Kućni program", TP: "Torbe i putovanje",
  KA: "Kancelarija", TE: "Tehnologija", OL: "Olovke", PT: "Privesci i ID oprema",
  RK: "Rokovnici i notesi", RL: "Slobodno vreme i lepota", UP: "Upaljači",
  AO: "Alati i oprema", KI: "Kišobrani",
};

const SUBCATEGORY_LABELS = {
  "TX - 06":"Radna i sportska odeća","TX - 07":"Pantalone","TX - 12":"Majice, duksevi i jakne",
  "UB - 02":"USB ambalaža","UB - 04":"USB memorije","UB - 07":"SSD memorije",
  "KS - 01":"Šolje","KS - 02":"Boce i termosi","KS - 03":"Vinski setovi",
  "TP - 01":"Poslovne torbe","TP - 02":"Putni program","TP - 03":"Kese i cegeri","TP - 04":"Rančevi","TP - 06":"Sportske torbe",
  "KA - 02":"Kancelarijski pribor","KA - 03":"Vizitari i novčanici","KA - 05":"Promo pultovi i panoi","KA - 10":"Satovi","KA - 99":"Poklon kutije",
  "TE - 01":"Gedžeti i punjači","TE - 02":"Pomoćne baterije","TE - 03":"Audio uređaji",
  "OL - 01":"Plastične olovke","OL - 02":"Metalne olovke","OL - 03":"Drvene olovke","OL - 04":"Setovi olovaka",
  "PT - 01":"Privesci","PT - 02":"Držači za ID kartice",
  "RK - 06":"Notesi i rokovnici","RK - 08":"Portfolio i poklon setovi",
  "RL - 01":"Sport i zabava","RL - 02":"Antistres proizvodi","RL - 03":"Lepota","RL - 04":"Zdravlje i putovanje","RL - 05":"Bočice i zatvarači",
  "UP - 01":"Brener upaljači","UP - 02":"Kremen upaljači","UP - 03":"Metalni upaljači","UP - 04":"Elektronski upaljači",
  "AO - 01":"Lampe","AO - 02":"Višenamenski alati","AO - 03":"Ručni i auto alati","AO - 04":"Merni pribor",
  "KI - 01":"Kišobrani",
};

function categoryLabel(code) { return CATEGORY_LABELS[code] || code; }
function subCategoryLabel(code) { return SUBCATEGORY_LABELS[code] || code; }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

const DISPLAY_COLOR_WORDS = /^(crn|crna|crni|crno|crne|bel|bela|beli|belo|bele|bijel|bijela|plav|plava|plavi|plavo|crven|crvena|crveni|crveno|zelen|zelena|zeleni|zeleno|žut|žuta|žuti|žuto|zut|zuta|zuti|zuto|siv|siva|sivi|sivo|roze|roza|pink|narandžast|narandžasta|narandzast|narandzasta|ljubičast|ljubičasta|ljubicast|ljubicasta|braon|teget|bež|bez|bordo|tirkiz|tirkizna|ciklama|lila|srebrn|srebrna|zlatn|zlatna|transparentan|transparentna)$/i;

function productDisplayName(value) {
  const parts = String(value || "").split(",").map(part => part.trim()).filter(Boolean);
  const title = parts.shift() || "Bez naziva";
  while (parts.length && DISPLAY_COLOR_WORDS.test(parts[parts.length - 1])) parts.pop();
  return { title, description: parts.join(", ") };
}

function stripVariantSize(value) {
  return String(value || "").trim().replace(
    /-(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-9]XL|[2-9]XS|UNI|UNIV|UNIVERSAL|ONE\s?SIZE|[0-9]{1,3}(?:\/[0-9]{1,3})?M?)$/i,
    ""
  );
}

function modelAssetIds(...values) {
  const ids = [];

  values.filter(Boolean).forEach(value => {
    const code = stripVariantSize(value);
    const parts = code.split(".").filter(Boolean);

    if (parts.length >= 3 && /^\d{1,4}$/.test(parts[parts.length - 1])) {
      ids.push(parts.slice(0, -1).join("").replace(/[^a-zA-Z0-9]/g, ""));
    }

    ids.push(code.replace(/[^a-zA-Z0-9]/g, ""));
  });

  return [...new Set(ids.filter(Boolean))];
}

function highlightSearchMatch(value, query) {
  const text = String(value || "");
  const needle = String(query || "").trim();
  if (!needle) return escapeHtml(text);
  const index = text.toLocaleLowerCase("sr-Latn").indexOf(needle.toLocaleLowerCase("sr-Latn"));
  if (index < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + needle.length))}</mark>${escapeHtml(text.slice(index + needle.length))}`;
}

function hideSearchSuggestions() {
  state.suggestionIndex = -1;
  els.searchSuggestions?.classList.add("hidden");
  if (els.searchSuggestions) els.searchSuggestions.innerHTML = "";
  els.searchInput?.setAttribute("aria-expanded", "false");
}

function selectSearchSuggestion(index) {
  const items = [...(els.searchSuggestions?.querySelectorAll(".search-suggestion") || [])];
  if (!items.length) return;
  state.suggestionIndex = Math.max(0, Math.min(index, items.length - 1));
  items.forEach((item, itemIndex) => item.classList.toggle("active", itemIndex === state.suggestionIndex));
  items[state.suggestionIndex]?.scrollIntoView({ block: "nearest" });
}

async function loadSearchSuggestions() {
  const query = els.searchInput?.value.trim() || "";
  const requestId = ++state.suggestionRequestId;
  if (query.length < 2) return hideSearchSuggestions();

  try {
    const searchParams = new URLSearchParams({ search: query, page: "1", limit: "6" });
    const response = await fetch(`${API_BASE}/products-grouped?${searchParams}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== state.suggestionRequestId) return;
    const products = Array.isArray(data.products) ? data.products : [];
    if (!products.length) {
      els.searchSuggestions.innerHTML = `<div class="search-suggestion-empty">Nema pronađenih proizvoda.</div>`;
    } else {
      els.searchSuggestions.innerHTML = products.map((product, index) => {
        const display = productDisplayName(product.name);
        const model = product.modelCode || "";
        const href = `product.html?model=${encodeURIComponent(model)}&v=39`;
        return `<a class="search-suggestion" role="option" href="${href}">
          <span class="search-suggestion-copy"><strong>${highlightSearchMatch(display.title, query)}</strong><small>${highlightSearchMatch(model, query)}</small>${display.description ? `<em>${highlightSearchMatch(display.description, query)}</em>` : ""}</span>
          <img class="search-suggestion-image" data-suggestion-index="${index}" alt="">
        </a>`;
      }).join("");
    }
    state.suggestionIndex = -1;
    els.searchSuggestions.classList.remove("hidden");
    els.searchInput.setAttribute("aria-expanded", "true");
    hydrateSearchSuggestionImages(products, requestId);
  } catch (error) {
    if (requestId === state.suggestionRequestId) hideSearchSuggestions();
    console.error("Predlozi pretrage nisu dostupni", error);
  }
}

function loadImageFromCandidates(image, candidates) {
  const urls = [...new Set(candidates.filter(Boolean))];
  let cursor = 0;

  function tryNext() {
    const url = urls[cursor++];
    if (!url) {
      image.hidden = true;
      image.classList.remove("loaded");
      image.removeAttribute("src");
      return;
    }

    image.hidden = false;
    image.classList.remove("loaded");
    image.onload = () => {
      image.classList.add("loaded");
      image.onload = null;
      image.onerror = null;
    };
    image.onerror = tryNext;
    image.src = url;
  }

  tryNext();
}

async function hydrateSearchSuggestionImages(products, requestId) {
  await Promise.all(products.map(async (product, index) => {
    const detail = await fetchVariantDetail(product.representativeVariantId);
    if (requestId !== state.suggestionRequestId) return;

    const image = els.searchSuggestions?.querySelector(`[data-suggestion-index="${index}"]`);
    if (!image) return;

    const imageIds = modelAssetIds(product.modelCode, product.representativeCode);
    const modelImages = imageIds.map(id =>
      `https://apiv2.promosolution.services/content/ModelItem/${id}_000.webp`
    );

    loadImageFromCandidates(image, [
      ...modelImages,
      detail?.image,
      ...(Array.isArray(detail?.images) ? detail.images : []),
    ]);
  }));
}

let suggestionTimer;
function scheduleSearchSuggestions() {
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(loadSearchSuggestions, 250);
}

function formatPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0
    ? `${price.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : "Cena na upit";
}

function formatPriceRange(minValue, maxValue) {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (!Number.isFinite(min) || min <= 0) return "Cena na upit";
  if (!Number.isFinite(max) || max <= 0 || Math.abs(max - min) < 0.005) return formatPrice(min);
  return `${formatPrice(min)} – ${formatPrice(max)}`;
}

function formatPriceRangeWithVat(minValue, maxValue) {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (!Number.isFinite(min) || min <= 0) return "";
  return `${formatPriceRange(min * 1.2, Number.isFinite(max) && max > 0 ? max * 1.2 : min * 1.2)} sa PDV-om`;
}

function productBadgeState(detail) {
  const statuses = Array.isArray(detail?.statuses) ? detail.statuses : [];
  const printMethods = Array.isArray(detail?.printMethods) ? detail.printMethods : [];
  const specifications = Array.isArray(detail?.specifications) ? detail.specifications : [];
  const certificates = Array.isArray(detail?.certificates) ? detail.certificates : [];
  const statusNames = statuses.map(item => String(item?.name || "").trim());
  const printNames = printMethods.map(item => String(item?.name || "").trim());
  const badgeText = [...statuses, ...printMethods, ...specifications, ...certificates]
    .map(item => `${item?.name || ""} ${item?.value || ""}`)
    .join(" ");
  const originCode = String(detail?.logistics?.originCode || "").trim().toUpperCase();
  const originName = String(detail?.logistics?.originName || "").trim();

  return {
    isNew: Boolean(detail?.badges?.isNew) || statusNames.some(name => /^(novo|new)$/i.test(name)),
    isSublimation: Boolean(detail?.badges?.isSublimation) || printMethods.some((item, index) =>
      Number(item?.id) === 381 || /sublimacij/i.test(printNames[index])
    ),
    isHitPrice: Boolean(detail?.badges?.isHitPrice) || Boolean(detail?.discount) || statusNames.some(name => /hit\s*cena/i.test(name)),
    isOrganic: Boolean(detail?.badges?.isOrganic) || [...statusNames, ...printNames].some(name => /organi(c|k)|organski\s+pamuk/i.test(name)),
    isSwissMade: Boolean(detail?.badges?.isSwissMade) || /^(CH|CHE)$/.test(originCode) || /(?:swiss\s*made|switzerland|švajcarsk|svajcarsk)/i.test(`${originName} ${badgeText}`),
    isMadeInItaly: Boolean(detail?.badges?.isMadeInItaly) || /^(IT|ITA)$/.test(originCode) || /(?:made\s+in\s+italy|italija|italy|italian)/i.test(`${originName} ${badgeText}`),
    isRpet: Boolean(detail?.badges?.isRpet) || /(?:\br\s*-?pet\b|recycled\s+pet|recikliran\w*\s+pet)/i.test(badgeText),
  };
}

function productBadgesHtml(detail) {
  const badges = productBadgeState(detail);
  return [
    badges.isNew ? '<span class="status-badge status-new">NEW</span>' : "",
    badges.isSublimation ? '<span class="status-badge status-sublimation" title="Pogodno za sublimaciju">S</span>' : "",
    badges.isHitPrice ? '<span class="status-badge status-hit" title="Hit cena">%</span>' : "",
    badges.isOrganic ? '<span class="status-badge status-organic" title="Organski pamuk"><i aria-hidden="true"></i>ORGANIC</span>' : "",
    badges.isSwissMade ? '<span class="status-badge status-origin status-swiss" title="Swiss Made"><i aria-hidden="true"></i><b>SWISS</b><small>MADE</small></span>' : "",
    badges.isMadeInItaly ? '<span class="status-badge status-origin status-italy" title="Made in Italy"><i aria-hidden="true"></i><b>MADE IN</b><small>ITALY</small></span>' : "",
    badges.isRpet ? '<span class="status-badge status-rpet" title="Proizvedeno od recikliranog PET materijala"><b>RPET</b></span>' : "",
  ].filter(Boolean).join("");
}

function parseCardArrivalDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const dotNetMatch = text.match(/\/Date\((\d+)\)\//);
  const localMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\.?$/);
  const localYear = localMatch ? Number(localMatch[3]) + (localMatch[3].length === 2 ? 2000 : 0) : 0;
  const date = localMatch
    ? new Date(localYear, Number(localMatch[2]) - 1, Number(localMatch[1]))
    : new Date(dotNetMatch ? Number(dotNetMatch[1]) : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cardArrivalSummary(detail) {
  const arrivals = (Array.isArray(detail?.arrivals) ? detail.arrivals : [])
    .map(item => ({ ...item, parsedDate: parseCardArrivalDate(item?.date) }))
    .filter(item => item.parsedDate || Number(item?.quantity) > 0)
    .sort((a, b) => (a.parsedDate?.getTime() || Number.MAX_SAFE_INTEGER) - (b.parsedDate?.getTime() || Number.MAX_SAFE_INTEGER));
  const arrival = arrivals[0];
  if (!arrival) return null;
  const quantity = Number(arrival.quantity);
  return {
    date: arrival.parsedDate ? arrival.parsedDate.toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "Dolazak najavljen",
    quantity: Number.isFinite(quantity) && quantity > 0 ? `${Math.floor(quantity).toLocaleString("sr-RS")} kom. očekivano` : "Očekuje se dopuna lagera",
  };
}

function variantPreviewItems(product) {
  const seen = new Set();
  return (Array.isArray(product?.colors) ? product.colors : []).map(color => {
    const rawCode = stripVariantSize(color?.representativeCode || "");
    const assetId = rawCode.replace(/[^a-zA-Z0-9]/g, "") || String(color?.representativeVariantId || "").split("-")[0].replace(/[^a-zA-Z0-9]/g, "");
    const url = assetId ? `https://apiv2.promosolution.services/content/ModelItem/${assetId}_001.webp` : "";
    if (!url || seen.has(url)) return null;
    seen.add(url);
    return { url, label: color?.colorCode || "Varijanta proizvoda" };
  }).filter(Boolean).slice(0, 5);
}

function cardStockState(value) {
  const stock = Number(value);

  if (!Number.isFinite(stock)) {
    return {
      className: "unavailable",
      label: "Stanje nije dostupno",
      amount: "Pokušajte ponovo",
    };
  }

  if (stock <= 0) {
    return {
      className: "empty",
      label: "Trenutno nema na stanju",
      amount: "0 kom.",
    };
  }

  if (stock <= 100) {
    return {
      className: "low",
      label: "Malo na stanju",
      amount: `${Math.floor(stock).toLocaleString("sr-RS")} kom.`,
    };
  }

  return {
    className: "available",
    label: "Na stanju",
    amount: `${Math.floor(stock).toLocaleString("sr-RS")} kom.`,
  };
}

function cardTemplate(product, index) {
  const model = product.modelCode || "";
  const imageIds = modelAssetIds(model, product.representativeCode);
  const modelImageId = imageIds[0] || "";
  const href = `product.html?model=${encodeURIComponent(model)}&v=39`;
  const category = [product.category, product.subCategory].filter(Boolean).join(" · ");
  const display = productDisplayName(product.name);
  const previews = variantPreviewItems(product);
  const groupStockState = product.stockKnown
    ? cardStockState(product.stock)
    : { className: "loading", label: "Provera stanja…", amount: "" };
  const groupPrice = formatPriceRange(product.priceMin, product.priceMax);

  return `
    <article class="product-card" data-detail-id="${escapeHtml(product.representativeVariantId || "")}" data-model="${escapeHtml(model)}" data-group-stock-known="${product.stockKnown ? "true" : "false"}" data-group-stock="${product.stockKnown ? escapeHtml(product.stock) : ""}" data-group-price-min="${escapeHtml(product.priceMin ?? "")}" data-group-price-max="${escapeHtml(product.priceMax ?? "")}" data-model-image-id="${escapeHtml(modelImageId)}" data-model-image-ids="${escapeHtml(imageIds.join(","))}" data-index="${index}">
      <a class="card-image-link" href="${href}" aria-label="Otvori ${escapeHtml(product.name || model)}">
        <div class="card-media">
          <div class="image-skeleton"></div>
          <img class="card-image card-image-primary" alt="" loading="lazy">
          <img class="card-image card-image-hover" alt="" loading="lazy" aria-hidden="true">
          <span class="card-badge">${product.colorCount > 1 ? `${product.colorCount} boja` : "1 varijanta"}</span>
          <span class="product-status-badges" aria-label="Oznake proizvoda"></span>
        </div>
      </a>
      <div class="card-content">
        <p class="card-category">${escapeHtml(category || "Promotivni proizvodi")}</p>
        <h2><a href="${href}">${escapeHtml(display.title)}</a></h2>
        ${display.description ? `<p class="card-description">${escapeHtml(display.description)}</p>` : ""}
        <p class="card-code">Model ${escapeHtml(model)}</p>
        ${previews.length > 1 ? `<div class="card-variant-previews" aria-label="Dostupne varijante">
          ${previews.map((preview, previewIndex) => `<button type="button" data-preview-src="${escapeHtml(preview.url)}" aria-label="Prikaži varijantu ${escapeHtml(preview.label)}" ${previewIndex === 0 ? 'class="active"' : ""}><img src="${escapeHtml(preview.url)}" alt="" loading="lazy"></button>`).join("")}
          ${Number(product.colorCount || 0) > previews.length ? `<small>+${Number(product.colorCount) - previews.length} više</small>` : ""}
        </div>` : ""}
        <div class="card-stock card-stock-${groupStockState.className}" aria-live="polite">
          <span class="card-stock-dot" aria-hidden="true"></span>
          <span><strong>${escapeHtml(groupStockState.label)}</strong><small>${escapeHtml(groupStockState.amount)}</small></span>
        </div>
        <div class="card-arrival hidden"><span class="arrival-truck" aria-hidden="true"></span><span><strong></strong><small></small></span></div>
        <div class="card-meta">
          <div><span class="card-price">${escapeHtml(groupPrice)}</span><small>po komadu bez PDV-a</small><small class="card-price-vat">${escapeHtml(formatPriceRangeWithVat(product.priceMin, product.priceMax))}</small></div>
          <a class="card-arrow" href="${href}" aria-label="Detalji proizvoda">→</a>
        </div>
        <div class="variant-summary">
          ${product.sizeCount ? `<span>${product.sizeCount} veličina</span>` : ""}
          <span>${product.variantCount || 1} varijanti</span>
        </div>
      </div>
    </article>`;
}

async function fetchVariantDetail(id) {
  if (!id) return null;
  if (variantDetailCache.has(id)) return variantDetailCache.get(id);

  const detailPromise = fetch(`${API_BASE}/variant-detail?id=${encodeURIComponent(id)}&v=49`, {
    headers: { Accept: "application/json" },
  })
    .then(async response => {
      if (!response.ok) return null;
      const data = await response.json();
      return data.success ? data.variant : null;
    })
    .catch(() => null);

  variantDetailCache.set(id, detailPromise);
  return detailPromise;
}

async function fetchGroupAvailability(model) {
  if (!model) return null;
  if (groupAvailabilityCache.has(model)) return groupAvailabilityCache.get(model);
  const promise = fetch(`${API_BASE}/group-availability?model=${encodeURIComponent(model)}&v=49`, {
    headers: { Accept: "application/json" },
  }).then(async response => {
    if (!response.ok) return null;
    const data = await response.json();
    return data.success ? data : null;
  }).catch(() => null);
  groupAvailabilityCache.set(model, promise);
  return promise;
}

function applyCardDetail(card, detail, availability = null) {
  const skeleton = card.querySelector(".image-skeleton");
  const image = card.querySelector(".card-image-primary");
  const hoverImage = card.querySelector(".card-image-hover");
  const media = card.querySelector(".card-media");
  const price = card.querySelector(".card-price");
  const priceWithVat = card.querySelector(".card-price-vat");
  const stockElement = card.querySelector(".card-stock");
  const arrivalElement = card.querySelector(".card-arrival");
  image?.addEventListener("load", () => {
    if (!media?.classList.contains("previewing-variant")) card.dataset.primaryImageSrc = image.currentSrc || image.src;
  });
  skeleton?.remove();

  const modelImageId = card.dataset.modelImageId || "";
  const modelImageUrl = modelImageId
    ? `https://apiv2.promosolution.services/content/ModelItem/${modelImageId}_000.webp`
    : "";
  const fallbackImage = detail?.image || availability?.image || "";

  if (modelImageUrl) {
    image.alt = detail?.name || "Proizvod";
    image.onload = () => {
      image.classList.add("loaded");
      if (!media?.classList.contains("previewing-variant")) card.dataset.primaryImageSrc = image.currentSrc || image.src;
    };
    image.onerror = () => {
      image.onerror = null;
      if (fallbackImage) {
        image.src = fallbackImage;
      } else {
        media?.classList.add("no-image");
      }
    };
    image.src = modelImageUrl;
  } else if (fallbackImage) {
    image.src = fallbackImage;
    image.alt = detail?.name || "Proizvod";
    image.classList.add("loaded");
  } else {
    const rawId = card.dataset.detailId || "";
    const baseImageId = rawId.split("-")[0].replace(/[^a-zA-Z0-9]/g, "");
    if (baseImageId) {
      image.src = `https://apiv2.promosolution.services/content/ModelItem/${baseImageId}_001.webp`;
      image.alt = "Proizvod";
      image.onload = () => image.classList.add("loaded");
      image.onerror = () => card.querySelector(".card-media")?.classList.add("no-image");
    } else {
      card.querySelector(".card-media")?.classList.add("no-image");
    }
  }
  const groupPriceMin = Number(card.dataset.groupPriceMin);
  const groupPriceMax = Number(card.dataset.groupPriceMax);
  const resolvedPriceMin = Number.isFinite(groupPriceMin) && groupPriceMin > 0 ? groupPriceMin : (availability?.priceMin ?? detail?.price);
  const resolvedPriceMax = Number.isFinite(groupPriceMin) && groupPriceMin > 0 ? groupPriceMax : (availability?.priceMax ?? detail?.price);
  price.textContent = formatPriceRange(resolvedPriceMin, resolvedPriceMax);
  if (priceWithVat) priceWithVat.textContent = formatPriceRangeWithVat(resolvedPriceMin, resolvedPriceMax);
  if (stockElement) {
    const groupStockKnown = card.dataset.groupStockKnown === "true";
    const stockValue = groupStockKnown
      ? Number(card.dataset.groupStock)
      : availability?.stockKnown
        ? availability.stock
        : detail?.stock;
    const stockState = cardStockState(stockValue);
    stockElement.className = `card-stock card-stock-${stockState.className}`;
    const label = stockElement.querySelector("strong");
    const amount = stockElement.querySelector("small");
    if (label) label.textContent = stockState.label;
    if (amount) amount.textContent = stockState.amount;
  }
  const badges = card.querySelector(".product-status-badges");
  if (badges) badges.innerHTML = productBadgesHtml(detail);

  const arrival = cardArrivalSummary(detail);
  if (arrivalElement && arrival) {
    arrivalElement.classList.remove("hidden");
    arrivalElement.querySelector("strong").textContent = arrival.date;
    arrivalElement.querySelector("small").textContent = arrival.quantity;
  }

  card.querySelectorAll("[data-preview-src]").forEach(button => {
    const showPreview = () => {
      if (!button.dataset.previewSrc) return;
      if (!card.dataset.primaryImageSrc) card.dataset.primaryImageSrc = image.currentSrc || image.src;
      media?.classList.add("previewing-variant");
      image.src = button.dataset.previewSrc;
      card.querySelectorAll("[data-preview-src]").forEach(item => item.classList.toggle("active", item === button));
    };
    const restorePreview = () => {
      media?.classList.remove("previewing-variant");
      if (card.dataset.primaryImageSrc) image.src = card.dataset.primaryImageSrc;
    };
    button.addEventListener("pointerenter", showPreview);
    button.addEventListener("focus", showPreview);
    button.addEventListener("pointerleave", restorePreview);
    button.addEventListener("blur", restorePreview);
    button.querySelector("img")?.addEventListener("error", () => button.remove(), { once: true });
  });

  const detailImages = [...new Set([
    detail?.image,
    ...(Array.isArray(detail?.images) ? detail.images : []),
    availability?.image,
    ...(Array.isArray(availability?.images) ? availability.images : []),
  ].filter(Boolean))];
  const modelImageIds = String(card.dataset.modelImageIds || modelImageId)
    .split(",")
    .filter(Boolean);
  const marketingHoverUrls = modelImageIds.map(id =>
    `https://apiv2.promosolution.services/content/ModelItem/${id}_090.webp`
  );
  const hoverCandidates = [...new Set([
    ...marketingHoverUrls,
    ...detailImages.filter(url => url !== modelImageUrl),
  ].filter(Boolean))];

  if (hoverImage && hoverCandidates.length) {
    const loadHoverImage = () => {
      if (hoverImage.dataset.loaded) return;
      hoverImage.dataset.loaded = "true";
      let candidateIndex = 0;

      const tryNextHoverImage = () => {
        const nextUrl = hoverCandidates[candidateIndex++];
        if (!nextUrl) {
          media?.classList.remove("has-hover-image");
          return;
        }

        hoverImage.onload = () => {
          hoverImage.classList.add("loaded");
          media?.classList.add("has-hover-image");
        };
        hoverImage.onerror = tryNextHoverImage;
        hoverImage.src = nextUrl;
      };

      tryNextHoverImage();
    };

    card.addEventListener("pointerenter", loadHoverImage, { once: true });
    card.addEventListener("focusin", loadHoverImage, { once: true });
  }
}

async function enrichCards(requestId, root = els.grid) {
  const isCurrent = () => requestId === null || requestId === state.requestId;
  const cards = [...root.querySelectorAll(".product-card")];
  let cursor = 0;

  async function worker() {
    while (cursor < cards.length && isCurrent()) {
      const card = cards[cursor++];
      try {
        const detail = await fetchVariantDetail(card.dataset.detailId);
        const availability = !detail
          ? await fetchGroupAvailability(card.dataset.model || "")
          : null;
        if (isCurrent()) applyCardDetail(card, detail, availability);
      } catch {
        const availability = await fetchGroupAvailability(card.dataset.model || "");
        if (isCurrent()) applyCardDetail(card, null, availability);
      }
    }
  }

  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
}

function activateHeroSlide(index, restartRotation = true) {
  if (!els.heroShowcase) return;
  const slides = [...els.heroShowcase.querySelectorAll("[data-hero-slide]")];
  if (!slides.length) return;

  heroSlideIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === heroSlideIndex;
    slide.classList.toggle("active", active);
    slide.setAttribute("aria-hidden", String(!active));
    slide.tabIndex = active && slide.matches("a, button") ? 0 : -1;
    slide.querySelectorAll("a, button").forEach(control => {
      control.tabIndex = active ? 0 : -1;
    });
  });
  els.heroShowcase.querySelectorAll("[data-hero-dot]").forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === heroSlideIndex);
    dot.setAttribute("aria-current", dotIndex === heroSlideIndex ? "true" : "false");
  });

  if (restartRotation) startHeroRotation();
}

function stopHeroRotation() {
  window.clearInterval(heroRotationTimer);
  heroRotationTimer = undefined;
}

function startHeroRotation() {
  stopHeroRotation();
  const slideCount = els.heroShowcase?.querySelectorAll("[data-hero-slide]").length || 0;
  if (slideCount < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  heroRotationTimer = window.setInterval(() => activateHeroSlide(heroSlideIndex + 1, false), 5800);
}

function initializePromoBanner() {
  if (!els.heroShowcase) return;
  stopHeroRotation();

  els.heroShowcase.querySelectorAll(".promo-product img").forEach(image => {
    image.addEventListener("error", () => {
      image.closest(".promo-product")?.classList.add("image-unavailable");
      image.remove();
    }, { once: true });
  });

  els.heroShowcase.querySelector("[data-hero-prev]")?.addEventListener("click", event => {
    event.preventDefault();
    activateHeroSlide(heroSlideIndex - 1);
  });
  els.heroShowcase.querySelector("[data-hero-next]")?.addEventListener("click", event => {
    event.preventDefault();
    activateHeroSlide(heroSlideIndex + 1);
  });
  els.heroShowcase.querySelectorAll("[data-hero-dot]").forEach(dot => {
    dot.addEventListener("click", event => {
      event.preventDefault();
      activateHeroSlide(Number(dot.dataset.heroDot || 0));
    });
  });
  els.heroShowcase.addEventListener("pointerenter", stopHeroRotation);
  els.heroShowcase.addEventListener("pointerleave", startHeroRotation);
  els.heroShowcase.addEventListener("focusin", stopHeroRotation);
  els.heroShowcase.addEventListener("focusout", startHeroRotation);
  let heroTouchX = null;
  els.heroShowcase.addEventListener("touchstart", event => { heroTouchX = event.touches[0]?.clientX ?? null; }, { passive: true });
  els.heroShowcase.addEventListener("touchend", event => {
    if (heroTouchX === null) return;
    const distance = (event.changedTouches[0]?.clientX ?? heroTouchX) - heroTouchX;
    heroTouchX = null;
    if (Math.abs(distance) > 45) activateHeroSlide(heroSlideIndex + (distance < 0 ? 1 : -1));
  }, { passive: true });

  activateHeroSlide(0, false);
  startHeroRotation();
}

function createCircularCarousel({ track, dots, previous, next, itemSelector, autoMs = 0, label = "slajd" }) {
  if (!track || !dots) return null;
  const total = track.querySelectorAll(itemSelector).length;
  if (!total) return null;

  let current = 0;
  let animating = false;
  let timer;

  const itemStep = () => {
    const item = track.querySelector(itemSelector);
    if (!item) return 320;
    const styles = window.getComputedStyle(track);
    return item.getBoundingClientRect().width + (Number.parseFloat(styles.columnGap || styles.gap) || 16);
  };

  const syncDots = () => {
    dots.querySelectorAll("button").forEach((dot, index) => {
      const active = index === current;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  };

  const stop = () => {
    window.clearInterval(timer);
    timer = undefined;
  };

  const start = () => {
    stop();
    if (!autoMs || total < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer = window.setInterval(() => move(1, false), autoMs);
  };

  const completeAfterTransition = callback => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      track.removeEventListener("transitionend", finish);
      callback();
    };
    track.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, 620);
  };

  const move = (direction, restart = true) => {
    if (animating || total < 2) return;
    animating = true;
    stop();
    const step = itemStep();

    if (direction > 0) {
      track.style.transition = "transform .48s cubic-bezier(.2,.72,.2,1)";
      track.style.transform = `translate3d(-${step}px,0,0)`;
      completeAfterTransition(() => {
        track.append(track.firstElementChild);
        track.style.transition = "none";
        track.style.transform = "translate3d(0,0,0)";
        current = (current + 1) % total;
        animating = false;
        syncDots();
        if (restart) start();
      });
    } else {
      track.prepend(track.lastElementChild);
      track.style.transition = "none";
      track.style.transform = `translate3d(-${step}px,0,0)`;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        track.style.transition = "transform .48s cubic-bezier(.2,.72,.2,1)";
        track.style.transform = "translate3d(0,0,0)";
        completeAfterTransition(() => {
          current = (current - 1 + total) % total;
          animating = false;
          syncDots();
          if (restart) start();
        });
      }));
    }
  };

  const jumpTo = target => {
    if (animating || target === current) return;
    stop();
    const distance = (target - current + total) % total;
    for (let index = 0; index < distance; index += 1) track.append(track.firstElementChild);
    track.style.transition = "none";
    track.style.transform = "translate3d(0,0,0)";
    current = target;
    syncDots();
    start();
  };

  dots.innerHTML = Array.from({ length: total }, (_, index) =>
    `<button type="button" class="${index === 0 ? "active" : ""}" aria-label="Prikaži ${label} ${index + 1}" aria-current="${index === 0 ? "true" : "false"}" data-carousel-dot="${index}"></button>`
  ).join("");
  dots.querySelectorAll("button").forEach(dot => {
    dot.addEventListener("click", () => jumpTo(Number(dot.dataset.carouselDot || 0)));
  });
  previous?.addEventListener("click", () => move(-1));
  next?.addEventListener("click", () => move(1));
  track.closest("section")?.addEventListener("pointerenter", stop);
  track.closest("section")?.addEventListener("pointerleave", start);
  track.closest("section")?.addEventListener("focusin", stop);
  track.closest("section")?.addEventListener("focusout", start);
  let touchX = null;
  track.addEventListener("touchstart", event => { touchX = event.touches[0]?.clientX ?? null; stop(); }, { passive: true });
  track.addEventListener("touchend", event => {
    if (touchX === null) return start();
    const distance = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1);
    else start();
  }, { passive: true });
  start();

  return { move, start, stop, refresh: () => { track.style.transition = "none"; track.style.transform = "translate3d(0,0,0)"; } };
}

async function loadNewProducts() {
  if (!els.newProductsGrid) return;

  try {
    const response = await fetch(`${API_BASE}/new-products?limit=12&v=49`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "Noviteti nisu dostupni.");

    const products = Array.isArray(data.products) ? data.products : [];
    if (!products.length) {
      els.newProductsMessage.textContent = "Novi proizvodi se trenutno ažuriraju.";
      return;
    }

    els.newProductsMessage.classList.add("hidden");
    els.newProductsGrid.innerHTML = products.map(cardTemplate).join("");
    enrichCards(null, els.newProductsGrid);
    newProductsCarousel?.stop();
    newProductsCarousel = createCircularCarousel({
      track: els.newProductsGrid,
      dots: els.newProductsDots,
      previous: els.newProductsPrev,
      next: els.newProductsNext,
      itemSelector: ".product-card",
      autoMs: 4800,
      label: "novitet",
    });
  } catch (error) {
    els.newProductsMessage.textContent = "Noviteti će se pojaviti nakon sledećeg osvežavanja kataloga.";
    console.error("Noviteti nisu dostupni", error);
  }
}

function closeCategoriesMenu() {
  els.categoriesMenu.classList.add("hidden");
  els.categoriesToggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-open");
}

function closeNewMenu() {
  els.newMenu?.classList.add("hidden");
  els.newMenuToggle?.setAttribute("aria-expanded", "false");
}

function applyStatusCollection(status, label) {
  clearAdvancedFilters();
  state.status = status;
  state.category = "";
  state.subCategory = "";
  state.search = "";
  state.collection = "";
  state.collectionLabel = label;
  state.page = 1;
  els.searchInput.value = "";
  closeCategoriesMenu();
  closeNewMenu();
  loadProducts();
  const catalogTop = els.catalogStart
    ? els.catalogStart.getBoundingClientRect().top + window.scrollY - 145
    : 300;
  window.scrollTo({ top: Math.max(0, catalogTop), behavior: "smooth" });
}

function applyCategory(category, subCategory = "", options = {}) {
  if (!options.preserveFilters) clearAdvancedFilters();
  state.status = "";
  state.category = category;
  state.subCategory = subCategory;
  state.search = options.search || "";
  state.collection = "";
  state.collectionLabel = options.label || "";
  state.page = 1;
  els.searchInput.value = state.search;
  closeCategoriesMenu();
  loadProducts();
  const catalogTop = els.catalogStart
    ? els.catalogStart.getBoundingClientRect().top + window.scrollY - 145
    : 300;
  window.scrollTo({ top: Math.max(0, catalogTop), behavior: "smooth" });
}

function formatMenuCount(value) {
  return Number(value || 0).toLocaleString("sr-RS");
}

function updateHomeHighlightCounts(categories) {
  document.querySelectorAll("[data-highlight-count]").forEach(element => {
    const code = element.dataset.highlightCount || "";
    const categoryCode = code.split(" - ")[0];
    const category = categories.find(item => item.code === categoryCode);
    const source = code.includes(" - ")
      ? category?.subCategories?.find(item => item.code === code)
      : category;
    element.textContent = source ? formatMenuCount(source.count) : "—";
  });
}

function renderCategoriesMenu() {
  if (!menuCategories.length) return;

  const activeCategory = menuCategories.find(category => category.code === menuSelection.categoryCode)
    || menuCategories.find(category => category.code === state.category)
    || menuCategories[0];
  const subCategories = Array.isArray(activeCategory.subCategories) ? activeCategory.subCategories : [];
  const activeSubCategory = subCategories.find(sub => sub.code === menuSelection.subCategoryCode)
    || subCategories.find(sub => sub.code === state.subCategory)
    || subCategories[0]
    || null;
  const narrowerGroups = activeSubCategory
    ? (window.CATALOG_TAXONOMY?.[activeSubCategory.code] || [])
    : [];

  menuSelection.categoryCode = activeCategory.code;
  menuSelection.subCategoryCode = activeSubCategory?.code || "";

  els.categoriesGrid.innerHTML = `
    <div class="category-browser">
      <section class="category-level category-level-primary" aria-label="Kategorije">
        <div class="category-level-heading">
          <div><span>Korak 1</span><strong>Kategorije</strong></div>
          <button type="button" class="menu-all-link" data-menu-apply data-category="">Ceo katalog</button>
        </div>
        <div class="menu-step-list">
          ${menuCategories.map(category => `
            <button type="button" class="menu-step-button ${category.code === activeCategory.code ? "active" : ""}"
              data-menu-category="${escapeHtml(category.code)}" aria-pressed="${category.code === activeCategory.code}">
              <span>${escapeHtml(categoryLabel(category.code))}</span>
              <small>${formatMenuCount(category.count)}</small>
              <b aria-hidden="true">›</b>
            </button>`).join("")}
        </div>
      </section>

      <section class="category-level category-level-secondary" aria-label="Potkategorije">
        <div class="category-level-heading">
          <div><span>Korak 2</span><strong>${escapeHtml(categoryLabel(activeCategory.code))}</strong></div>
          <button type="button" class="menu-all-link" data-menu-apply data-category="${escapeHtml(activeCategory.code)}">
            Prikaži sve
          </button>
        </div>
        <div class="menu-step-list">
          ${subCategories.map(sub => `
            <button type="button" class="menu-step-button ${sub.code === activeSubCategory?.code ? "active" : ""}"
              data-menu-subcategory="${escapeHtml(sub.code)}" aria-pressed="${sub.code === activeSubCategory?.code}">
              <span>${escapeHtml(subCategoryLabel(sub.code))}</span>
              <small>${formatMenuCount(sub.count)}</small>
              <b aria-hidden="true">›</b>
            </button>`).join("") || `<p class="menu-empty-copy">Za ovu kategoriju trenutno nema potkategorija.</p>`}
        </div>
      </section>

      <section class="category-level category-level-tertiary" aria-label="Uže grupe proizvoda">
        <div class="category-level-heading">
          <div><span>Korak 3</span><strong>${escapeHtml(activeSubCategory ? subCategoryLabel(activeSubCategory.code) : "Izaberite grupu")}</strong></div>
        </div>
        ${activeSubCategory ? `
          <button type="button" class="menu-featured-action" data-menu-apply
            data-category="${escapeHtml(activeCategory.code)}" data-subcategory="${escapeHtml(activeSubCategory.code)}">
            <span>Prikaži sve: <strong>${escapeHtml(subCategoryLabel(activeSubCategory.code))}</strong></span>
            <b aria-hidden="true">→</b>
          </button>` : ""}
        <div class="menu-tertiary-list">
          ${narrowerGroups.map(item => `
            <button type="button" data-menu-apply
              data-category="${escapeHtml(activeCategory.code)}"
              data-subcategory="${escapeHtml(activeSubCategory.code)}"
              data-query="${escapeHtml(item.query)}"
              data-label="${escapeHtml(item.label)}">
              <span>${escapeHtml(item.label)}</span><b aria-hidden="true">→</b>
            </button>`).join("") || `<p class="menu-empty-copy">Nema dodatne podele. Izaberite „Prikaži sve“ za ovu potkategoriju.</p>`}
        </div>
      </section>
    </div>`;
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE}/catalog-filters`, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.success || !Array.isArray(data.categories)) return;

    menuCategories = data.categories;
    menuSelection.categoryCode = state.category;
    menuSelection.subCategoryCode = state.subCategory;
    renderCategoriesMenu();
    updateHomeHighlightCounts(menuCategories);
    renderCategoryFilterTree();
  } catch (error) {
    console.error("Kategorije nisu učitane", error);
  }
}

const FACET_CONFIG = [
  ["brands", "brand", "Brend"],
  ["colors", "color", "Boja"],
  ["statuses", "facetStatus", "Status"],
  ["sizes", "size", "Veličina"],
  ["printMethods", "print", "Štampa"],
  ["materials", "material", "Materijal"],
  ["capacities", "capacity", "Kapacitet"],
  ["themes", "theme", "Tema"],
  ["equipment", "equipment", "Dodatna oprema"],
];

const COLOR_FILTER_META = {
  "CRN": ["Crna", "#000000"], "PL": ["Plava", "#04386d"],
  "BL": ["Bela", "#ffffff"], "CV": ["Crvena", "#d90504"],
  "ZL": ["Zelena", "#094705"], "SI": ["Siva", "#b9bdc2"],
  "BŽ": ["Bež", "#e8dfc8"], "BZ": ["Bež", "#e8dfc8"],
  "OR": ["Narandžasta", "#ff6700"], "ŽT": ["Žuta", "#ffc711"],
  "ZT": ["Žuta", "#ffc711"], "PK": ["Roze", "#e22caa"],
  "LJ": ["Ljubičasta", "#5d00a8"], "BR": ["Braon", "#6d2508"],
  "PE": ["Petrolej", "#0b6170"], "TEG": ["Teget", "#063f73"],
  "SLV": ["Srebrna", "linear-gradient(90deg,#8d8f91,#f6f6f6,#8d8f91)"],
  "GD": ["Zlatna", "linear-gradient(90deg,#e2ad35,#fff0a6,#d5961d)"],
  "MT": ["Metallic", "linear-gradient(90deg,#9a9a9a,#f4f4f4,#777)"],
};

function colorFilterMeta(value) {
  const raw = String(value || "").trim();
  const code = raw.replace(/^B\s*-\s*/i, "").toUpperCase();
  const known = COLOR_FILTER_META[code];
  return known
    ? { name: known[0], background: known[1] }
    : { name: raw, background: "#d6d7da" };
}

function selectedFilterCount() {
  return Object.entries(state.filters).reduce((total, [key, value]) =>
    total + (Array.isArray(value) ? value.length : value ? 1 : 0), 0
  );
}

function updateFilterCounter() {
  const count = selectedFilterCount();
  if (els.mobileFilterCount) els.mobileFilterCount.textContent = String(count);
  if (els.clearAllFilters) els.clearAllFilters.hidden = !(count || state.category || state.subCategory);
}

function renderCategoryFilterTree() {
  if (!els.categoryFilterTree || !menuCategories.length) return;
  const activeCategory = menuCategories.find(item => item.code === state.category);
  const categoriesHtml = menuCategories.map(category => `
    <button type="button" class="${category.code === state.category ? "active" : ""}" data-side-category="${escapeHtml(category.code)}">
      <span>${escapeHtml(categoryLabel(category.code))}</span><small>${Number(category.count || 0).toLocaleString("sr-RS")}</small>
    </button>`).join("");
  const subHtml = activeCategory
    ? (activeCategory.subCategories || []).map(sub => `
      <button type="button" class="sub ${sub.code === state.subCategory ? "active" : ""}" data-side-category="${escapeHtml(activeCategory.code)}" data-side-subcategory="${escapeHtml(sub.code)}">
        <span>${escapeHtml(subCategoryLabel(sub.code))}</span><small>${Number(sub.count || 0).toLocaleString("sr-RS")}</small>
      </button>`).join("")
    : "";
  els.categoryFilterTree.innerHTML = `<div class="filter-category-title">Kategorija</div><div class="filter-category-list">${categoriesHtml}${subHtml}</div>`;
}

function renderFacetSection(items, stateKey, title, open = false) {
  if (!Array.isArray(items) || !items.length) return "";
  const selected = new Set(Array.isArray(state.filters[stateKey]) ? state.filters[stateKey] : []);
  if (stateKey === "color") {
    const swatches = items.map(item => {
      const value = String(item.value ?? "");
      const meta = colorFilterMeta(value);
      const count = Number(item.count || 0).toLocaleString("sr-RS");
      return `<label class="color-filter-option" title="${escapeHtml(meta.name)} (${count})"><input type="checkbox" data-filter-key="${stateKey}" value="${escapeHtml(value)}" ${selected.has(value) ? "checked" : ""}><span style="--swatch:${escapeHtml(meta.background)}" aria-hidden="true"></span><b class="sr-only">${escapeHtml(meta.name)}</b></label>`;
    }).join("");
    return `<details class="filter-section color-filter-section" ${open ? "open" : ""}><summary>${escapeHtml(title)}</summary><div class="color-filter-grid">${swatches}</div></details>`;
  }
  const options = items.map(item => {
    const value = String(item.value ?? "");
    const label = String(item.label ?? item.value ?? "");
    return `<label class="filter-option"><input type="checkbox" data-filter-key="${stateKey}" value="${escapeHtml(value)}" ${selected.has(value) ? "checked" : ""}><span>${escapeHtml(label)}</span><small>${Number(item.count || 0).toLocaleString("sr-RS")}</small></label>`;
  }).join("");
  return `<details class="filter-section" ${open ? "open" : ""}><summary>${escapeHtml(title)}</summary><div class="filter-options ${items.length > 10 ? "scrollable" : ""}">${options}</div></details>`;
}

function renderDynamicFilters(data) {
  if (!els.dynamicFilters) return;
  const facets = data?.facets || {};
  const sections = FACET_CONFIG.map(([facetKey, stateKey, title], index) =>
    renderFacetSection(facets[facetKey], stateKey, title, index < 3)
  ).join("");
  const price = facets.price;
  const priceSection = price ? `<details class="filter-section" open><summary>Cena</summary><div class="price-filter"><input id="filterMinPrice" type="number" min="0" step="0.01" placeholder="Min ${Number(price.min).toFixed(2)}" value="${escapeHtml(state.filters.minPrice)}"><input id="filterMaxPrice" type="number" min="0" step="0.01" placeholder="Max ${Number(price.max).toFixed(2)}" value="${escapeHtml(state.filters.maxPrice)}"><button type="button" data-apply-price>Primeni cenu</button></div></details>` : "";
  els.dynamicFilters.innerHTML = sections || priceSection ? `${sections}${priceSection}` : `<p class="filters-empty">Dodatni filteri će se pojaviti posle sledećeg osvežavanja kataloga.</p>`;
  updateFilterCounter();
}

async function loadFacetFilters() {
  if (!els.dynamicFilters) return;
  const params = new URLSearchParams({ v: "48" });
  if (state.category) params.set("category", state.category);
  if (state.subCategory) params.set("subCategory", state.subCategory);
  if (state.search) params.set("search", state.search);
  try {
    const response = await fetch(`${API_BASE}/catalog-filters?${params}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.success) renderDynamicFilters(data);
  } catch (error) {
    els.dynamicFilters.innerHTML = `<p class="filters-empty">Filteri trenutno nisu dostupni.</p>`;
    console.error("Filteri nisu učitani", error);
  }
}

function appendAdvancedFilters(params) {
  for (const [key, value] of Object.entries(state.filters)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== "") params.set(key, value);
  }
}

function clearAdvancedFilters() {
  Object.keys(state.filters).forEach(key => { state.filters[key] = ["minPrice", "maxPrice"].includes(key) ? "" : []; });
}

function applyFacetChange() {
  state.status = "";
  state.collection = "";
  state.collectionLabel = "";
  state.page = 1;
  updateFilterCounter();
  if (window.innerWidth <= 900) {
    els.catalogFilters?.classList.remove("open");
    els.mobileFiltersToggle?.setAttribute("aria-expanded", "false");
  }
  loadProducts();
}

function activeFilterSummary() {
  const parts = [];
  if (state.subCategory) parts.push(subCategoryLabel(state.subCategory));
  else if (state.category) parts.push(categoryLabel(state.category));
  if (state.collectionLabel) parts.push(state.collectionLabel);
  for (const [key, values] of Object.entries(state.filters)) {
    if (Array.isArray(values)) parts.push(...values.slice(0, 3));
    else if (values) parts.push(`${key === "minPrice" ? "od" : "do"} ${values} €`);
  }
  return parts.join(" · ");
}

async function fetchCustomCollection(collectionKey) {
  const definition = CUSTOM_COLLECTIONS[collectionKey];
  if (!definition) throw new Error("Nepoznata kolekcija.");

  const payloads = await Promise.all(definition.terms.map(async term => {
    const params = new URLSearchParams({ search: term, page: "1", limit: "20" });
    const response = await fetch(`${API_BASE}/products-grouped?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "Kolekcija trenutno nije dostupna.");
    return Array.isArray(data.products) ? data.products : [];
  }));

  const products = [];
  const seen = new Set();
  payloads.flat().forEach(product => {
    const key = product.modelCode || product.representativeVariantId || product.representativeCode;
    if (!key || seen.has(key)) return;
    seen.add(key);
    products.push(product);
  });

  return {
    success: true,
    page: 1,
    totalPages: 1,
    totalGroupedCards: products.length,
    totalMatchingProducts: products.length,
    hasPreviousPage: false,
    hasNextPage: false,
    products,
  };
}

async function loadProducts() {
  const requestId = ++state.requestId;
  els.message.classList.remove("hidden");
  els.message.textContent = "Učitavanje proizvoda…";
  els.grid.innerHTML = "";

  const params = new URLSearchParams({ page: String(state.page), limit: String(state.status ? 32 : PAGE_LIMIT) });
  if (state.search) params.set("search", state.search);
  if (state.category) params.set("category", state.category);
  if (state.subCategory) params.set("subCategory", state.subCategory);
  if (!state.status) appendAdvancedFilters(params);

  try {
    let data;
    if (state.collection) {
      data = await fetchCustomCollection(state.collection);
    } else {
      const endpoint = state.status
        ? `${API_BASE}/status-products?status=${encodeURIComponent(state.status)}&page=${state.page}&limit=32&v=49`
        : `${API_BASE}/products-grouped?${params}`;
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        cache: state.status ? "no-store" : "default",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      if (!data.success) throw new Error(data.error || "Katalog trenutno nije dostupan.");
    }
    if (requestId !== state.requestId) return;

    state.page = data.page || 1;
    state.totalPages = data.totalPages || 1;
    const total = Number(data.totalGroupedCards || 0);
    const matches = Number(data.totalMatchingProducts || 0);

    els.apiStatus.textContent = "Katalog ažuriran";
    if (!state.status) els.heroTotal.textContent = total.toLocaleString("sr-RS");
    els.totalMatches.textContent = matches.toLocaleString("sr-RS");
    const filterName = activeFilterSummary();
    els.resultsLabel.textContent = (state.status || state.collection) ? "proizvoda u kolekciji" : (state.search ? `rezultata za „${state.search}”` : "proizvoda");
    els.activeFilter.classList.toggle("hidden", !(state.category || state.status || state.collection || selectedFilterCount()));
    els.activeFilterName.textContent = filterName || "";
    els.pageInfo.textContent = (state.status || state.collection)
      ? `${state.collectionLabel} · Strana ${state.page} od ${state.totalPages}`
      : `Strana ${state.page} od ${state.totalPages}`;
    els.paginationText.textContent = `${state.page} / ${state.totalPages}`;
    els.prev.disabled = !data.hasPreviousPage;
    els.next.disabled = !data.hasNextPage;
    els.clearSearch.classList.toggle("hidden", !(state.search || state.collection));
    els.pagination?.classList.toggle("hidden", state.totalPages <= 1);

    const products = Array.isArray(data.products) ? data.products : [];
    renderCategoryFilterTree();
    loadFacetFilters();
    if (!products.length) {
      els.message.textContent = "Nema proizvoda koji odgovaraju pretrazi.";
      return;
    }

    els.message.classList.add("hidden");
    els.grid.innerHTML = products.map(cardTemplate).join("");
    enrichCards(requestId);
  } catch (error) {
    if (requestId !== state.requestId) return;
    els.apiStatus.textContent = "Veza nije dostupna";
    els.message.textContent = "Katalog trenutno nije moguće učitati. Pokušajte ponovo za nekoliko trenutaka.";
    console.error(error);
  }
}

els.searchForm?.addEventListener("submit", event => {
  event.preventDefault();
  hideSearchSuggestions();
  state.status = "";
  state.search = els.searchInput.value.trim();
  state.collection = "";
  state.collectionLabel = "";
  state.page = 1;
  loadProducts();
});

els.searchInput?.setAttribute("aria-autocomplete", "list");
els.searchInput?.setAttribute("aria-expanded", "false");
els.searchInput?.addEventListener("input", scheduleSearchSuggestions);
els.searchInput?.addEventListener("keydown", event => {
  const items = [...(els.searchSuggestions?.querySelectorAll(".search-suggestion") || [])];
  if (event.key === "ArrowDown" && items.length) {
    event.preventDefault();
    selectSearchSuggestion(state.suggestionIndex + 1);
  } else if (event.key === "ArrowUp" && items.length) {
    event.preventDefault();
    selectSearchSuggestion(state.suggestionIndex <= 0 ? items.length - 1 : state.suggestionIndex - 1);
  } else if (event.key === "Enter" && state.suggestionIndex >= 0 && items[state.suggestionIndex]) {
    event.preventDefault();
    window.location.href = items[state.suggestionIndex].href;
  } else if (event.key === "Escape") {
    hideSearchSuggestions();
  }
});

document.addEventListener("pointerdown", event => {
  if (!event.target.closest("#searchForm")) hideSearchSuggestions();
});

els.clearSearch?.addEventListener("click", () => {
  hideSearchSuggestions();
  state.status = "";
  state.search = "";
  state.collection = "";
  state.collectionLabel = "";
  state.page = 1;
  els.searchInput.value = "";
  loadProducts();
});

els.categoriesToggle?.addEventListener("click", () => {
  closeNewMenu();
  const willOpen = els.categoriesMenu.classList.contains("hidden");
  if (willOpen && menuCategories.length) {
    menuSelection.categoryCode = state.category;
    menuSelection.subCategoryCode = state.subCategory;
    renderCategoriesMenu();
  }
  els.categoriesMenu.classList.toggle("hidden", !willOpen);
  els.categoriesToggle.setAttribute("aria-expanded", String(willOpen));
  document.body.classList.toggle("menu-open", willOpen);
});

els.newMenuToggle?.addEventListener("click", () => {
  const willOpen = els.newMenu?.classList.contains("hidden");
  closeCategoriesMenu();
  els.newMenu?.classList.toggle("hidden", !willOpen);
  els.newMenuToggle.setAttribute("aria-expanded", String(willOpen));
});

els.newMenu?.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target.closest("[data-status-collection]") : null;
  if (!target) return;
  applyStatusCollection(target.dataset.statusCollection || "new", target.dataset.statusLabel || "Novo");
});

document.querySelectorAll(".quick-category").forEach(button => {
  button.addEventListener("click", () => applyCategory(button.dataset.category));
});

document.querySelectorAll(".highlight-card").forEach(button => {
  button.addEventListener("click", () => {
    applyCategory(button.dataset.highlightCategory || "", button.dataset.highlightSubcategory || "", {
      label: button.dataset.highlightLabel || "",
    });
  });
});

els.categoriesGrid?.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  event.stopPropagation();

  const categoryStep = target.closest("button[data-menu-category]");
  if (categoryStep) {
    menuSelection.categoryCode = categoryStep.dataset.menuCategory || "";
    menuSelection.subCategoryCode = "";
    renderCategoriesMenu();
    return;
  }

  const subCategoryStep = target.closest("button[data-menu-subcategory]");
  if (subCategoryStep) {
    menuSelection.subCategoryCode = subCategoryStep.dataset.menuSubcategory || "";
    renderCategoriesMenu();
    return;
  }

  const applyButton = target.closest("button[data-menu-apply]");
  if (applyButton) {
    applyCategory(applyButton.dataset.category || "", applyButton.dataset.subcategory || "", {
      search: applyButton.dataset.query || "",
      label: applyButton.dataset.label || "",
    });
  }
});

els.categoryFilterTree?.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("button[data-side-category]") : null;
  if (!button) return;
  applyCategory(button.dataset.sideCategory || "", button.dataset.sideSubcategory || "");
});

els.dynamicFilters?.addEventListener("change", event => {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  const key = input?.dataset.filterKey;
  if (!input || !key || !Array.isArray(state.filters[key])) return;
  const values = new Set(state.filters[key]);
  input.checked ? values.add(input.value) : values.delete(input.value);
  state.filters[key] = [...values];
  applyFacetChange();
});

els.dynamicFilters?.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("[data-apply-price]") : null;
  if (!button) return;
  state.filters.minPrice = document.getElementById("filterMinPrice")?.value.trim() || "";
  state.filters.maxPrice = document.getElementById("filterMaxPrice")?.value.trim() || "";
  applyFacetChange();
});

els.clearAllFilters?.addEventListener("click", () => {
  clearAdvancedFilters();
  state.status = "";
  state.category = "";
  state.subCategory = "";
  state.collection = "";
  state.collectionLabel = "";
  state.page = 1;
  updateFilterCounter();
  els.catalogFilters?.classList.remove("open");
  els.mobileFiltersToggle?.setAttribute("aria-expanded", "false");
  loadProducts();
});

els.mobileFiltersToggle?.addEventListener("click", () => {
  const open = !els.catalogFilters?.classList.contains("open");
  els.catalogFilters?.classList.toggle("open", open);
  els.mobileFiltersToggle.setAttribute("aria-expanded", String(open));
});

els.clearCategory?.addEventListener("click", () => applyCategory("", ""));

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeCategoriesMenu();
    closeNewMenu();
    els.catalogFilters?.classList.remove("open");
    els.mobileFiltersToggle?.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (!els.categoriesMenu.classList.contains("hidden") && !els.categoriesMenu.contains(target) && !els.categoriesToggle.contains(target)) closeCategoriesMenu();
  if (els.newMenu && !els.newMenu.classList.contains("hidden") && !els.newMenu.contains(target) && !els.newMenuToggle?.contains(target)) closeNewMenu();
});

els.prev?.addEventListener("click", () => {
  if (state.page > 1) { state.page -= 1; loadProducts(); window.scrollTo({ top: 260, behavior: "smooth" }); }
});

els.next?.addEventListener("click", () => {
  if (state.page < state.totalPages) { state.page += 1; loadProducts(); window.scrollTo({ top: 260, behavior: "smooth" }); }
});

window.addEventListener("resize", () => {
  window.clearTimeout(window.__demoShopCarouselResize);
  window.__demoShopCarouselResize = window.setTimeout(() => {
    newProductsCarousel?.refresh();
    promoStoriesCarousel?.refresh();
  }, 120);
});

initializePromoBanner();
promoStoriesCarousel = createCircularCarousel({
  track: els.promoStoriesTrack,
  dots: els.promoStoriesDots,
  previous: els.promoStoriesPrev,
  next: els.promoStoriesNext,
  itemSelector: ".promo-story",
  autoMs: 5400,
  label: "promotivni baner",
});
loadCategories();
loadNewProducts();
loadProducts();
