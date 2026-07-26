const API_BASE = "https://demo-group-api.marko-demogroup.workers.dev";
const params = new URLSearchParams(window.location.search);
const requestedModel = params.get("model");
const requestedShade = params.get("shade");
const editCartIndex = Number.parseInt(params.get("editCart"), 10);
const editMode = Number.isInteger(editCartIndex) && editCartIndex >= 0;
const editCartItem = editMode ? window.DemoCart?.read()?.[editCartIndex] : null;

const elements = {
  message: document.getElementById("productMessage"),
  detail: document.getElementById("productDetail"),
  mainImage: document.getElementById("mainImage"),
  thumbs: document.getElementById("thumbs"),
  galleryModes: document.getElementById("galleryModes"),
  galleryImagesButton: document.getElementById("galleryImagesButton"),
  galleryDimensionsButton: document.getElementById("galleryDimensionsButton"),
  breadcrumb: document.getElementById("breadcrumb"),
  productBadges: document.getElementById("productBadges"),
  name: document.getElementById("productName"),
  model: document.getElementById("modelCode"),
  price: document.getElementById("price"),
  priceWithVat: document.getElementById("priceWithVat"),
  colorOptions: document.getElementById("colorOptions"),
  selectedShadeLabel: document.getElementById("selectedShadeLabel"),
  sizeBlock: document.getElementById("sizeBlock"),
  sizeOptions: document.getElementById("sizeOptions"),
  selectedSizeLabel: document.getElementById("selectedSizeLabel"),
  variantTableBlock: document.getElementById("variantTableBlock"),
  variantTableBody: document.getElementById("variantTableBody"),
  variantCode: document.getElementById("variantCode"),
  stock: document.getElementById("stock"),
  arrivalBlock: document.getElementById("arrivalBlock"),
  arrival: document.getElementById("arrival"),
  quoteButton: document.getElementById("quoteButton"),
  quantity: document.getElementById("quantity"),
  quantityMinus: document.getElementById("quantityMinus"),
  quantityPlus: document.getElementById("quantityPlus"),
  packageHint: document.getElementById("packageHint"),
  cartFeedback: document.getElementById("cartFeedback"),
  productExtra: document.getElementById("productExtra"),
  productDescription: document.getElementById("productDescription"),
  productDescriptionLong: document.getElementById("productDescriptionLong"),
  productSpecifications: document.getElementById("productSpecifications"),
  productLogistics: document.getElementById("productLogistics"),
  productPrintMethodsBlock: document.getElementById("productPrintMethodsBlock"),
  productPrintMethods: document.getElementById("productPrintMethods"),
  productVideoSection: document.getElementById("productVideoSection"),
  productVideo: document.getElementById("productVideo"),
  productDocumentsSection: document.getElementById("productDocumentsSection"),
  productDocuments: document.getElementById("productDocuments"),
  productMeasurementsSection: document.getElementById("productMeasurementsSection"),
  productMeasurements: document.getElementById("productMeasurements"),
  relatedProductsSection: document.getElementById("relatedProductsSection"),
  relatedProductsGrid: document.getElementById("relatedProductsGrid"),
  relatedProductsLink: document.getElementById("relatedProductsLink"),
};

let product;
let selectedColor;
let selectedVariant;
let loadedVariantDetail;
let variantRequestNumber = 0;
let colorRequestNumber = 0;
let dimensionProbeNumber = 0;
let galleryImages = [];
let activeGalleryImage = null;
let dimensionImageUrl = null;
let galleryMode = "images";
const detailCache = new Map();
const VAT_RATE = 0.2;
let activePackageStep = 1;
let activePackageMaximum = null;
let activeQuantity = 1;

if (editMode && !editCartItem) {
  params.delete("editCart");
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
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

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function formatPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0
    ? `${price.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : "Cena na upit";
}

function formatPriceWithVat(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0
    ? `${formatPrice(price * (1 + VAT_RATE))} sa PDV-om`
    : "";
}

function packageStepFor(detail) {
  const direct = Number(detail?.packaging?.commercialPackage);
  if (Number.isFinite(direct) && direct > 0) return Math.max(1, Math.floor(direct));
  for (const value of [detail?.packaging?.packageInfo, detail?.packaging?.package]) {
    const numbers = String(value || "").match(/\d+(?:[.,]\d+)?/g) || [];
    const candidate = Number(String(numbers.at(-1) || "").replace(",", "."));
    if (Number.isFinite(candidate) && candidate > 0) return Math.max(1, Math.floor(candidate));
  }
  return 1;
}

function syncQuantity(nextValue = activeQuantity) {
  const stepped = Math.max(activePackageStep, Math.round(Number(nextValue || activePackageStep) / activePackageStep) * activePackageStep);
  activeQuantity = activePackageMaximum ? Math.min(stepped, activePackageMaximum) : stepped;
  if (elements.quantity) elements.quantity.textContent = activeQuantity.toLocaleString("sr-RS");
  if (elements.quantityMinus) elements.quantityMinus.disabled = activeQuantity <= activePackageStep;
  if (elements.quantityPlus) elements.quantityPlus.disabled = Boolean(activePackageMaximum && activeQuantity >= activePackageMaximum);
}

function configurePackaging(detail) {
  activePackageStep = packageStepFor(detail);
  const stock = Number(detail?.stock);
  activePackageMaximum = Number.isFinite(stock) && stock > 0 ? Math.floor(stock / activePackageStep) * activePackageStep : null;
  if (activePackageMaximum !== null && activePackageMaximum < activePackageStep) activePackageMaximum = null;
  activeQuantity = activePackageStep;
  if (editCartItem) {
    activeQuantity = Math.max(activePackageStep, Math.ceil(Number(editCartItem.quantity || activePackageStep) / activePackageStep) * activePackageStep);
  }
  if (elements.packageHint) {
    elements.packageHint.textContent = activePackageStep > 1
      ? `Minimalna količina i korak: ${activePackageStep.toLocaleString("sr-RS")} kom.`
      : "Količina se bira po komadu.";
  }
  syncQuantity(activeQuantity);
}

function productBadgesHtml(detail) {
  const statuses = Array.isArray(detail?.statuses) ? detail.statuses : [];
  const printMethods = Array.isArray(detail?.printMethods) ? detail.printMethods : [];
  const specifications = Array.isArray(detail?.specifications) ? detail.specifications : [];
  const certificates = Array.isArray(detail?.certificates) ? detail.certificates : [];
  const statusNames = statuses.map(item => String(item?.name || "").trim());
  const badgeText = [...statuses, ...printMethods, ...specifications, ...certificates]
    .map(item => `${item?.name || ""} ${item?.value || ""}`)
    .join(" ");
  const originCode = String(detail?.logistics?.originCode || "").trim().toUpperCase();
  const originName = String(detail?.logistics?.originName || "").trim();
  const isNew = Boolean(detail?.badges?.isNew) || statusNames.some(name => /^(novo|new)$/i.test(name));
  const isSublimation = Boolean(detail?.badges?.isSublimation) || printMethods.some(item =>
    Number(item?.id) === 381 || /sublimacij/i.test(String(item?.name || ""))
  );
  const isHitPrice = Boolean(detail?.badges?.isHitPrice) || Boolean(detail?.discount) || statusNames.some(name => /hit\s*cena/i.test(name));
  const isOrganic = Boolean(detail?.badges?.isOrganic) || [...statusNames, ...printMethods.map(item => String(item?.name || ""))].some(name => /organi(c|k)|organski\s+pamuk/i.test(name));
  const isSwissMade = Boolean(detail?.badges?.isSwissMade) || /^(CH|CHE)$/.test(originCode) || /(?:swiss\s*made|switzerland|švajcarsk|svajcarsk)/i.test(`${originName} ${badgeText}`);
  const isMadeInItaly = Boolean(detail?.badges?.isMadeInItaly) || /^(IT|ITA)$/.test(originCode) || /(?:made\s+in\s+italy|italija|italy|italian)/i.test(`${originName} ${badgeText}`);
  const isRpet = Boolean(detail?.badges?.isRpet) || /(?:\br\s*-?pet\b|recycled\s+pet|recikliran\w*\s+pet)/i.test(badgeText);

  return [
    isNew ? '<span class="status-badge status-new">NEW</span>' : "",
    isSublimation ? '<span class="status-badge status-sublimation" title="Pogodno za sublimaciju">S</span>' : "",
    isHitPrice ? '<span class="status-badge status-hit" title="Hit cena">%</span>' : "",
    isOrganic ? '<span class="status-badge status-organic" title="Organski pamuk"><i aria-hidden="true"></i>ORGANIC</span>' : "",
    isSwissMade ? '<span class="status-badge status-origin status-swiss" title="Swiss Made"><i aria-hidden="true"></i><b>SWISS</b><small>MADE</small></span>' : "",
    isMadeInItaly ? '<span class="status-badge status-origin status-italy" title="Made in Italy"><i aria-hidden="true"></i><b>MADE IN</b><small>ITALY</small></span>' : "",
    isRpet ? '<span class="status-badge status-rpet" title="Proizvedeno od recikliranog PET materijala"><b>RPET</b></span>' : "",
  ].filter(Boolean).join("");
}

function formatStock(value) {
  const stock = Number(value);
  if (!Number.isFinite(stock) || stock <= 0) return "Nema na lageru";
  return `${stock.toLocaleString("sr-RS")} kom. na lageru`;
}

function parseArrivalDate(value) {
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

function arrivalSummary(detail) {
  const arrivals = Array.isArray(detail?.arrivals) ? detail.arrivals : [];
  const arrival = arrivals.find(item => item?.date || Number(item?.quantity) > 0);
  if (!arrival) return null;

  const date = parseArrivalDate(arrival.date);
  const dateLabel = date
    ? date.toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const quantity = Number(arrival.quantity);
  const quantityLabel = Number.isFinite(quantity) && quantity > 0
    ? `${quantity.toLocaleString("sr-RS")} kom.`
    : "";

  return [quantityLabel, dateLabel].filter(Boolean).join(" · ") || null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;",
  })[character]);
}

const DISPLAY_COLOR_WORDS = /^(crn|crna|crni|crno|crne|bel|bela|beli|belo|bele|bijel|bijela|plav|plava|plavi|plavo|crven|crvena|crveni|crveno|zelen|zelena|zeleni|zeleno|žut|žuta|žuti|žuto|zut|zuta|zuti|zuto|siv|siva|sivi|sivo|roze|roza|pink|narandžast|narandžasta|narandzast|narandzasta|ljubičast|ljubičasta|ljubicast|ljubicasta|braon|teget|bež|bez|bordo|tirkiz|tirkizna|ciklama|lila|srebrn|srebrna|zlatn|zlatna|transparentan|transparentna)$/i;

function productDisplayName(value) {
  const parts = String(value || "").split(",").map(part => part.trim()).filter(Boolean);
  const title = parts.shift() || "Bez naziva";
  while (parts.length && DISPLAY_COLOR_WORDS.test(parts[parts.length - 1])) parts.pop();
  return { title, description: parts.join(", ") };
}

function modelAssetIds(...values) {
  const ids = [];

  values.filter(Boolean).forEach(value => {
    const code = String(value).trim().replace(/-(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-9]XL|[0-9]{2,3})$/i, "");
    const parts = code.split(".").filter(Boolean);

    if (parts.length >= 3 && /^\d{1,4}$/.test(parts[parts.length - 1])) {
      ids.push(parts.slice(0, -1).join("").replace(/[^a-zA-Z0-9]/g, ""));
    }

    ids.push(code.replace(/[^a-zA-Z0-9]/g, ""));
  });

  return [...new Set(ids.filter(Boolean))];
}

function specRows(rows) {
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

function normalizedPrintLabel(item) {
  return String(item?.name || item?.value || "")
    .trim()
    .toLocaleLowerCase("sr-Latn")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isRecommendedPrintMethod(item) {
  const label = normalizedPrintLabel(item);
  return /(sito|tampon|laser|preslik|dtg|dtf|digital|sublim|vez|gravur|\buv\b|foliotisak|transfer|dekal|doming|epoksi|embos|stamp)/i.test(label);
}

function safeDocumentUrl(item) {
  const candidate = String(item?.url || item?.image || "").trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function renderProductDocuments(detail) {
  const items = [
    ...(detail?.certificates || []).map(item => ({ ...item, type: "Sertifikat" })),
    ...(detail?.documents || []).map(item => ({ ...item, type: "Dokument" })),
  ].filter((item, index, all) => {
    const key = `${item.name || item.fileName || item.value || ""}|${safeDocumentUrl(item)}`;
    return key !== "|" && all.findIndex(candidate =>
      `${candidate.name || candidate.fileName || candidate.value || ""}|${safeDocumentUrl(candidate)}` === key
    ) === index;
  });

  elements.productDocumentsSection.classList.toggle("hidden", items.length === 0);
  elements.productDocuments.innerHTML = items.map((item, index) => {
    const label = item.name || item.fileName || item.value || `${item.type} ${index + 1}`;
    const url = safeDocumentUrl(item);
    return url
      ? `<a class="document-item" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(item.type)}</span><strong>${escapeHtml(label)}</strong><em>Otvori ↗</em></a>`
      : `<div class="document-item document-item-static"><span>${escapeHtml(item.type)}</span><strong>${escapeHtml(label)}</strong></div>`;
  }).join("");
}

function normalizedInfoLabel(value) {
  return String(value || "").trim().toLocaleLowerCase("sr-Latn").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isVideoSpecification(item) {
  const name = normalizedInfoLabel(item?.name);
  const value = String(item?.value || "");
  return /(^|\s)video(\s|$)/i.test(name) || /(?:player\.)?vimeo\.com|youtube(?:-nocookie)?\.com|youtu\.be|<iframe\b/i.test(value);
}

function extractProductVideo(detail) {
  const candidates = [
    detail?.video,
    detail?.videoUrl,
    detail?.model?.video,
    detail?.model?.videoUrl,
    ...(detail?.specifications || []).filter(isVideoSpecification).map(item => item?.value),
  ].filter(Boolean).map(String);

  for (const candidate of candidates) {
    const decoded = candidate.replace(/&amp;/gi, "&");
    const vimeo = decoded.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeo) return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeo[1]}?title=0&byline=0&portrait=0` };

    const youtube = decoded.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i);
    if (youtube) return { type: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${youtube[1]}` };
  }

  return null;
}

function renderProductVideo(detail) {
  const video = extractProductVideo(detail);
  elements.productVideoSection?.classList.toggle("hidden", !video);
  if (!elements.productVideo) return Boolean(video);

  elements.productVideo.innerHTML = video
    ? `<div class="product-video-frame"><iframe src="${escapeHtml(video.embedUrl)}" title="Video proizvoda" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : "";
  return Boolean(video);
}

function isMeasurementLabel(value) {
  return /(mera|mere|merna|dimenz|size|sizes|measurement|chest|body length|width|height|duzina|sirina|visina|precnik|zapremin|obim)/i.test(normalizedInfoLabel(value));
}

function renderProductMeasurements(detail) {
  const specificationItems = (detail?.specifications || []).filter(item => isMeasurementLabel(item?.name));
  const documentItems = [
    ...(detail?.documents || []),
    ...(detail?.certificates || []),
  ].filter(item => isMeasurementLabel(item?.name || item?.fileName || item?.value));

  const rows = specificationItems.map(item => `<div><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("");
  const documents = documentItems.map((item, index) => {
    const label = item.name || item.fileName || item.value || `Tabela mera ${index + 1}`;
    const url = safeDocumentUrl(item);
    if (!url) return "";
    const isImage = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(url);
    return isImage
      ? `<figure class="measurement-image"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure>`
      : `<a class="measurement-document" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(label)}</strong><span>Otvori tabelu mera ↗</span></a>`;
  }).join("");

  const hasMeasurements = Boolean(rows || documents);
  elements.productMeasurementsSection?.classList.toggle("hidden", !hasMeasurements);
  if (elements.productMeasurements) {
    elements.productMeasurements.innerHTML = `${rows ? `<div class="measurement-rows">${rows}</div>` : ""}${documents}`;
  }
}

function renderProductInformation(detail) {
  const model = detail?.model || {};
  elements.productDescription.textContent = model.description || "";
  elements.productDescriptionLong.textContent = model.descriptionLong || "";

  const publicSpecifications = (detail.specifications || []).filter(item => !isVideoSpecification(item));

  const specificationRows = [
    ["Šifra", detail.code], ["Model", model.name], ["Brend", detail.brand?.name],
    ["Boja", detail.shade?.name || detail.color?.name], ["Veličina", detail.size?.id],
    ["Pakovanje", detail.packaging?.packageInfo || detail.packaging?.package],
    ["Neto težina", detail.logistics?.netWeight != null ? `${detail.logistics.netWeight} ${detail.logistics.weightUnit || ""}` : null],
    ["EAN", detail.ean], ["Stranica kataloga", detail.catalog?.page],
    ...(publicSpecifications.map(item => [item.name, item.value])),
  ];
  elements.productSpecifications.innerHTML = specRows(specificationRows);

  const dimensions = detail.logistics?.width != null
    ? `${detail.logistics.depth} × ${detail.logistics.width} × ${detail.logistics.height} ${detail.logistics.dimensionUnit || ""}` : null;

  const piecesPerCarton = Number(detail.packaging?.piecesPerCarton);
  const grossWeightPerPiece = Number(detail.logistics?.grossWeight);
  const cartonWeight = Number.isFinite(piecesPerCarton) && piecesPerCarton > 0 &&
    Number.isFinite(grossWeightPerPiece) && grossWeightPerPiece > 0
      ? piecesPerCarton * grossWeightPerPiece
      : null;
  const cartonWeightText = cartonWeight === null
    ? null
    : `${Number(cartonWeight.toFixed(3)).toLocaleString("sr-RS")} ${detail.logistics?.weightUnit || ""}`.trim();

  elements.productLogistics.innerHTML = specRows([
    ["Komada po kartonu", detail.packaging?.piecesPerCarton], ["Dimenzije kartona", dimensions],
    ["Težina kartona", cartonWeightText],
    ["Zemlja porekla", detail.logistics?.originName], ["Carinska tarifa", detail.logistics?.customsTariff],
  ]);

  const printMethods = [
    ...(detail.printInfo || []),
    ...(detail.printMethods || []),
  ].filter(isRecommendedPrintMethod).filter((item, index, items) => {
    const label = normalizedPrintLabel(item);
    return label && items.findIndex(candidate => normalizedPrintLabel(candidate) === label) === index;
  });
  elements.productPrintMethods.innerHTML = printMethods.length
    ? printMethods.map(item => `<span>${escapeHtml(item.name || item.value)}</span>`).join("")
    : "";
  elements.productPrintMethodsBlock.classList.toggle("hidden", printMethods.length === 0);
  renderProductVideo(detail);
  renderProductDocuments(detail);
  renderProductMeasurements(detail);

  const hasInfo = Boolean(model.description || model.descriptionLong || specificationRows.length);
  elements.productExtra.classList.toggle("hidden", !hasInfo);
}

function uniqueImages(detail) {
  return [...new Set([detail?.image, ...(detail?.images || [])].filter(Boolean))];
}

function firstWorkingImage(urls) {
  const candidates = [...new Set(urls.filter(Boolean))];
  return new Promise(resolve => {
    let cursor = 0;
    const tryNext = () => {
      const url = candidates[cursor++];
      if (!url) return resolve(null);
      const image = new Image();
      image.onload = () => resolve(url);
      image.onerror = tryNext;
      image.src = url;
    };
    tryNext();
  });
}

function setGalleryMode(mode) {
  if (mode === "dimensions" && !dimensionImageUrl) return;
  galleryMode = mode;
  const dimensionsActive = mode === "dimensions";

  elements.galleryImagesButton?.classList.toggle("active", !dimensionsActive);
  elements.galleryImagesButton?.setAttribute("aria-pressed", String(!dimensionsActive));
  elements.galleryDimensionsButton?.classList.toggle("active", dimensionsActive);
  elements.galleryDimensionsButton?.setAttribute("aria-pressed", String(dimensionsActive));
  elements.thumbs?.classList.toggle("hidden", dimensionsActive);

  if (dimensionsActive) {
    elements.mainImage.src = dimensionImageUrl;
    elements.mainImage.alt = `Dimenzije proizvoda ${product?.name || ""}`.trim();
  } else if (activeGalleryImage || galleryImages[0]) {
    elements.mainImage.src = activeGalleryImage || galleryImages[0];
    elements.mainImage.alt = loadedVariantDetail?.name || product?.name || "Proizvod";
  }
}

async function prepareDimensionImage(detail) {
  const requestNumber = ++dimensionProbeNumber;
  dimensionImageUrl = null;
  elements.galleryModes?.classList.add("hidden");
  setGalleryMode("images");

  const assetRoot = "https://apiv2.promosolution.services/content/ModelItem/";
  const ids = modelAssetIds(product?.modelCode, detail?.code, selectedVariant?.code);
  const modelNames = [
    detail?.model?.name,
    product?.name?.split(",")[0]
  ]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean);

  const customNames = [];
  modelNames.forEach(name => {
    const words = name.split(/\s+/).filter(Boolean);
    const titleCase = words
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    const collapsed = words.join("");
    const collapsedTitle = collapsed
      ? collapsed.charAt(0).toUpperCase() + collapsed.slice(1).toLowerCase()
      : "";

    [collapsedTitle, titleCase, name, collapsed, name.replace(/\s+/g, "_")].forEach(value => {
      if (value && !customNames.includes(value)) customNames.push(value);
    });
  });

  const candidates = [
    ...ids.map(id => `${assetRoot}${id}_101.webp`),
    ...customNames.map(name => `${assetRoot}${encodeURIComponent(name)}_dim.webp`),
    ...customNames.map(name => `${assetRoot}${encodeURIComponent(name)}_dim.jpg`),
    ...ids.map(id => `${assetRoot}${id}_101.jpg`),
    ...customNames.map(name => `${assetRoot}${encodeURIComponent(name)}_dim.png`)
  ];
  const found = await firstWorkingImage(candidates);
  if (requestNumber !== dimensionProbeNumber || !found) return;

  dimensionImageUrl = found;
  elements.galleryModes?.classList.remove("hidden");
}

function fallbackImageForId(id) {
  const baseId = String(id || "").split("-")[0].replace(/[^a-zA-Z0-9]/g, "");
  return baseId ? `https://apiv2.promosolution.services/content/ModelItem/${baseId}_001.webp` : "";
}

function showMessage(message) {
  elements.message.textContent = message;
  elements.message.classList.remove("hidden");
}

function hideMessage() {
  elements.message.classList.add("hidden");
}

function updateUrlShade(colorCode) {
  if (!colorCode) return;
  const url = new URL(window.location.href);
  url.searchParams.set("shade", colorCode);
  window.history.replaceState(null, "", url);
}

function renderGallery(detail) {
  const images = uniqueImages(detail);
  galleryImages = images;
  activeGalleryImage = images[0] || null;
  galleryMode = "images";
  dimensionImageUrl = null;
  elements.thumbs.innerHTML = "";
  elements.galleryModes?.classList.add("hidden");

  if (!images.length) {
    elements.mainImage.removeAttribute("src");
    elements.mainImage.alt = "Slika trenutno nije dostupna";
    return;
  }

  elements.mainImage.src = images[0];
  elements.mainImage.alt = detail?.name || product?.name || "Proizvod";
  elements.thumbs.innerHTML = images.map((image, index) => `
    <button class="thumb ${index === 0 ? "active" : ""}" type="button" data-image="${image}" aria-label="Prikaži sliku ${index + 1}">
      <img src="${image}" alt="" loading="lazy">
    </button>`).join("");

  elements.thumbs.querySelectorAll(".thumb").forEach(button => {
    button.addEventListener("click", () => {
      activeGalleryImage = button.dataset.image;
      elements.mainImage.src = activeGalleryImage;
      elements.thumbs.querySelectorAll(".thumb").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  prepareDimensionImage(detail);
}

elements.galleryImagesButton?.addEventListener("click", () => setGalleryMode("images"));
elements.galleryDimensionsButton?.addEventListener("click", () => setGalleryMode("dimensions"));

async function loadVariantDetail(variant) {
  if (!variant?.id) return showMessage("Izabrana varijanta nema ispravan ID.");
  selectedVariant = variant;
  const requestNumber = ++variantRequestNumber;
  elements.variantCode.textContent = variant.code || "—";
  elements.price.textContent = "Učitavanje cene…";
  elements.stock.textContent = "Provera lagera…";
  elements.mainImage.classList.add("loading-image");

  try {
    const detail = await getVariantDetail(variant.id);
    if (!detail) throw new Error("Detalji nisu dostupni.");
    if (requestNumber !== variantRequestNumber) return;

    loadedVariantDetail = detail;
    if (elements.productBadges) elements.productBadges.innerHTML = productBadgesHtml(detail);
    elements.variantCode.textContent = detail.code || variant.code || "—";
    elements.price.textContent = formatPrice(detail.price);
    if (elements.priceWithVat) elements.priceWithVat.textContent = formatPriceWithVat(detail.price);
    elements.stock.textContent = formatStock(detail.stock);
    const arrival = arrivalSummary(detail);
    elements.arrivalBlock.classList.toggle("hidden", !arrival);
    elements.arrival.textContent = arrival || "—";
    renderGallery(detail);
    renderProductInformation(detail);
    configurePackaging(detail);
    hideMessage();
  } catch (error) {
    if (requestNumber !== variantRequestNumber) return;
    elements.price.textContent = "Cena nije dostupna";
    if (elements.priceWithVat) elements.priceWithVat.textContent = "";
    elements.stock.textContent = "Lager nije dostupan";
    elements.arrivalBlock.classList.add("hidden");
    const fallbackImage = fallbackImageForId(variant.id);
    if (fallbackImage) renderGallery({ image: fallbackImage, name: variant.name || product?.name });
    showMessage("Nije uspelo učitavanje izabrane varijante. Pokušajte ponovo.");
    console.error(error);
  } finally {
    if (requestNumber === variantRequestNumber) elements.mainImage.classList.remove("loading-image");
  }
}

async function renderVariantTable(variants) {
  const requestNumber = ++colorRequestNumber;
  const hasSizes = variants.some(variant => Boolean(variant.size));
  elements.variantTableBlock.classList.toggle("hidden", !hasSizes);
  if (!hasSizes) return;

  elements.variantTableBody.innerHTML = variants.map(variant => `
    <button class="variant-table-row loading" type="button">
      <span><strong>${variant.size || "—"}</strong><small>${variant.code || ""}</small></span>
      <span>Učitavanje…</span><span>—</span><span>—</span>
    </button>`).join("");

  const details = await mapWithConcurrency(variants, 3, variant => getVariantDetail(variant.id));
  if (requestNumber !== colorRequestNumber) return;

  elements.variantTableBody.innerHTML = variants.map((variant, index) => {
    const detail = details[index];
    const stock = Number(detail?.stock);
    const arrival = arrivalSummary(detail);
    return `
      <button class="variant-table-row" type="button" data-index="${index}">
        <span><strong>${variant.size || "—"}</strong><small>${detail?.code || variant.code || ""}</small></span>
        <span>${formatPrice(detail?.price)}</span>
        <span class="${stock > 0 ? "in-stock" : "out-stock"}">${stock > 0 ? stock.toLocaleString("sr-RS") : "—"}</span>
        <span>${arrival || "—"}</span>
      </button>`;
  }).join("");

  elements.variantTableBody.querySelectorAll(".variant-table-row").forEach(button => {
    button.addEventListener("click", () => selectVariant(variants[Number(button.dataset.index)]));
  });
}

function selectVariant(variant) {
  if (!variant) return;
  selectedVariant = variant;
  const variants = selectedColor?.variants || [];
  elements.sizeOptions.querySelectorAll(".size-button").forEach(button => {
    button.classList.toggle("active", variants[Number(button.dataset.index)]?.id === variant.id);
  });
  elements.selectedSizeLabel.textContent = variant.size ? `Izabrano: ${variant.size}` : "";
  loadVariantDetail(variant);
}

function renderSizes(variants = []) {
  const hasSizes = variants.some(variant => Boolean(variant.size));
  elements.sizeBlock.classList.toggle("hidden", !hasSizes);
  elements.sizeOptions.innerHTML = hasSizes
    ? variants.map((variant, index) => `<button class="size-button" type="button" data-index="${index}">${variant.size || "—"}</button>`).join("")
    : "";

  elements.sizeOptions.querySelectorAll(".size-button").forEach(button => {
    button.addEventListener("click", () => selectVariant(variants[Number(button.dataset.index)]));
  });
  renderVariantTable(variants);
  const editVariant = editCartItem
    ? variants.find(variant => String(variant.id) === String(editCartItem.id))
      || variants.find(variant => String(variant.size || "") === String(editCartItem.size || ""))
    : null;
  selectVariant(editVariant || variants[0]);
}

function selectColor(colorCode, updateUrl = true) {
  const colors = product?.colors || [];
  selectedColor = colors.find(color => String(color.colorCode ?? "") === String(colorCode ?? "")) || colors[0];
  if (!selectedColor) return showMessage("Proizvod nema dostupne varijante.");

  elements.colorOptions.querySelectorAll(".color-button").forEach(button => {
    button.classList.toggle("active", button.dataset.color === String(selectedColor.colorCode ?? ""));
  });
  elements.selectedShadeLabel.textContent = selectedColor.colorCode ? `Šifra boje: ${selectedColor.colorCode}` : "Osnovna varijanta";
  if (updateUrl) updateUrlShade(selectedColor.colorCode);
  renderSizes(selectedColor.variants || []);
}

async function renderColors(colors = []) {
  elements.colorOptions.innerHTML = colors.map(color => `
    <button class="color-button color-photo-button loading" type="button" data-color="${color.colorCode ?? ""}" title="Nijansa ${color.colorCode ?? ""}">
      <span class="color-photo-wrap"><span class="color-photo-skeleton"></span><img alt=""></span>
      <span class="color-code">${color.colorCode ?? "—"}</span>
    </button>`).join("");
  elements.colorOptions.querySelectorAll(".color-button").forEach(button => {
    button.addEventListener("click", () => selectColor(button.dataset.color));
  });

  const details = await mapWithConcurrency(colors, 3, color => getVariantDetail(color.representativeVariantId));
  elements.colorOptions.querySelectorAll(".color-button").forEach((button, index) => {
    const detail = details[index];
    button.classList.remove("loading");
    const image = button.querySelector("img");
    button.querySelector(".color-photo-skeleton")?.remove();
    if (detail?.image) {
      image.src = detail.image;
      image.alt = detail.name || `Nijansa ${colors[index].colorCode}`;
    } else {
      const fallbackImage = fallbackImageForId(colors[index].representativeVariantId);
      if (fallbackImage) {
        image.src = fallbackImage;
        image.alt = `Nijansa ${colors[index].colorCode}`;
        image.onerror = () => button.querySelector(".color-photo-wrap").classList.add("no-photo");
      } else {
        button.querySelector(".color-photo-wrap").classList.add("no-photo");
      }
    }
  });
}

async function loadRelatedProducts() {
  if (!product?.category || !elements.relatedProductsGrid) return;

  try {
    const query = new URLSearchParams({ page: "1", limit: "8", category: product.category });
    if (product.subCategory) query.set("subCategory", product.subCategory);
    const response = await fetch(`${API_BASE}/products-grouped?${query}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    const related = (Array.isArray(data.products) ? data.products : [])
      .filter(item => String(item.modelCode || "") !== String(product.modelCode || ""))
      .slice(0, 4);
    if (!related.length) return;

    const allLink = new URL("index.html", window.location.href);
    allLink.searchParams.set("category", product.category);
    if (product.subCategory) allLink.searchParams.set("subCategory", product.subCategory);
    elements.relatedProductsLink.href = allLink.href;

    elements.relatedProductsGrid.innerHTML = related.map((item, index) => {
      const display = productDisplayName(item.name);
      const model = item.modelCode || "";
      const imageIds = modelAssetIds(model, item.representativeCode);
      const modelImageId = imageIds[0] || "";
      const href = `product.html?model=${encodeURIComponent(model)}&v=39`;
      const image = modelImageId ? `https://apiv2.promosolution.services/content/ModelItem/${modelImageId}_000.webp` : "";
      return `<article class="related-product-card" data-index="${index}" data-detail-id="${escapeHtml(item.representativeVariantId || "")}">
        <a class="related-product-media" href="${href}">
          ${image ? `<img class="related-product-primary" src="${image}" alt="${escapeHtml(display.title)}" loading="lazy">` : ""}
          <img class="related-product-hover" alt="" loading="lazy">
          <span class="product-status-badges" aria-label="Oznake proizvoda"></span>
        </a>
        <div><small>Model ${escapeHtml(model)}</small><h3><a href="${href}">${escapeHtml(display.title)}</a></h3>${display.description ? `<p>${escapeHtml(display.description)}</p>` : ""}<strong class="related-product-price">Učitavanje…</strong><small class="related-product-price-vat"></small></div>
      </article>`;
    }).join("");

    elements.relatedProductsSection.classList.remove("hidden");
    const cards = [...elements.relatedProductsGrid.querySelectorAll(".related-product-card")];
    const details = await mapWithConcurrency(related, 2, item => getVariantDetail(item.representativeVariantId));
    cards.forEach((card, index) => {
      const detail = details[index];
      card.querySelector(".related-product-price").textContent = formatPrice(detail?.price);
      const vatPrice = card.querySelector(".related-product-price-vat");
      if (vatPrice) vatPrice.textContent = formatPriceWithVat(detail?.price);
      const badges = card.querySelector(".product-status-badges");
      if (badges) badges.innerHTML = productBadgesHtml(detail);
      const primary = card.querySelector(".related-product-primary");
      if (primary && detail?.image) primary.onerror = () => { primary.onerror = null; primary.src = detail.image; };
      const hover = card.querySelector(".related-product-hover");
      const primaryUrl = primary?.getAttribute("src") || "";
      const actualImages = [...new Set([
        detail?.image,
        ...(Array.isArray(detail?.images) ? detail.images : []),
      ].filter(Boolean))];
      const relatedProduct = related[index] || {};
      const relatedImageIds = modelAssetIds(relatedProduct.modelCode, relatedProduct.representativeCode);
      const marketingHoverUrls = relatedImageIds.map(id =>
        `https://apiv2.promosolution.services/content/ModelItem/${id}_090.webp`
      );
      const hoverCandidates = [...new Set([
        ...marketingHoverUrls,
        ...actualImages.filter(url => url !== primaryUrl),
      ].filter(Boolean))];
      if (hover && hoverCandidates.length) {
        let candidateIndex = 0;
        const tryNextHoverImage = () => {
          const nextUrl = hoverCandidates[candidateIndex++];
          if (!nextUrl) {
            hover.remove();
            return;
          }
          hover.onload = () => card.classList.add("has-related-hover");
          hover.onerror = tryNextHoverImage;
          hover.src = nextUrl;
        };
        tryNextHoverImage();
      } else {
        hover?.remove();
      }
    });
  } catch (error) {
    console.error("Slični proizvodi nisu dostupni", error);
  }
}

async function loadProduct() {
  if (!requestedModel) return showMessage("Nedostaje model proizvoda u adresi.");
  showMessage("Učitavanje proizvoda…");

  try {
    const response = await fetch(`${API_BASE}/product-grouped?model=${encodeURIComponent(requestedModel)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success || !data.product) throw new Error(data.error || "Proizvod nije pronađen.");

    product = data.product;
    const display = productDisplayName(product.name);
    document.title = `${display.title || product.modelCode} — DemoShop`;
    elements.breadcrumb.textContent = [product.category, product.subCategory].filter(Boolean).join(" / ");
    elements.name.textContent = display.title;
    elements.model.textContent = product.modelCode || requestedModel;
    if (editCartItem) {
      elements.quoteButton.textContent = "Sačuvaj izmenu";
      elements.cartFeedback.textContent = "Izmenite boju ili veličinu. Postojeća stavka u upitu biće zamenjena.";
    }
    renderColors(product.colors || []);
    elements.detail.classList.remove("hidden");
    hideMessage();

    const initialColor = product.colors?.find(color => String(color.colorCode ?? "") === String(requestedShade ?? "")) || product.colors?.[0];
    if (initialColor) selectColor(initialColor.colorCode, false);
    loadRelatedProducts();
  } catch (error) {
    showMessage("Proizvod trenutno nije moguće učitati. Pokušajte ponovo.");
    console.error(error);
  }
}

elements.quantityMinus?.addEventListener("click", () => syncQuantity(activeQuantity - activePackageStep));
elements.quantityPlus?.addEventListener("click", () => syncQuantity(activeQuantity + activePackageStep));

elements.quoteButton.addEventListener("click", () => {
  if (!selectedVariant || !loadedVariantDetail) {
    elements.cartFeedback.textContent = "Sačekajte da se izabrana varijanta učita.";
    return;
  }
  const quantity = activeQuantity;
  const cartItem = {
    id: String(selectedVariant.id),
    modelCode: product?.modelCode || requestedModel || "",
    name: product?.name || loadedVariantDetail.name || "Proizvod",
    code: loadedVariantDetail.code || selectedVariant.code || "",
    colorCode: selectedColor?.colorCode || "",
    size: selectedVariant.size || "",
    price: Number.isFinite(Number(loadedVariantDetail.price)) && Number(loadedVariantDetail.price) > 0
      ? Number(loadedVariantDetail.price)
      : null,
    image: loadedVariantDetail.image || fallbackImageForId(selectedVariant.id),
    quantity,
    packStep: activePackageStep,
    maxStock: Number(loadedVariantDetail.stock) || null,
  };
  if (editCartItem && window.DemoCart.replace(editCartIndex, cartItem)) {
    window.location.href = "cart.html";
    return;
  }
  window.DemoCart.add(cartItem);
  elements.cartFeedback.innerHTML = `Dodato u upit: <strong>${quantity} kom.</strong> <a href="cart.html">Otvori upit →</a>`;
});

loadProduct();
