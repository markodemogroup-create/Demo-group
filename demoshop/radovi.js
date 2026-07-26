const filterButtons = [...document.querySelectorAll("[data-work-filter]")];
const workCards = [...document.querySelectorAll("[data-work-card]")];
const modal = document.getElementById("workModal");
const modalImage = document.getElementById("workModalImage");
const modalTitle = document.getElementById("workModalTitle");
const modalDescription = document.getElementById("workModalDescription");

filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    const filter = button.dataset.workFilter || "all";
    filterButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    workCards.forEach(card => {
      const categories = (card.dataset.categories || "").split(/\s+/);
      card.classList.toggle("hidden", filter !== "all" && !categories.includes(filter));
    });
  });
});

function closeWorkModal() {
  modal?.classList.add("hidden");
  document.body.style.overflow = "";
}

workCards.forEach(card => {
  card.addEventListener("click", () => {
    if (!modal || !modalImage || !modalTitle || !modalDescription) return;
    modalImage.src = card.dataset.image || "";
    modalImage.alt = card.dataset.title || "Realizovani projekat";
    modalTitle.textContent = card.dataset.title || "Realizovani projekat";
    modalDescription.textContent = card.dataset.description || "";
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    modal.querySelector(".work-modal-close")?.focus();
  });
});

modal?.querySelector(".work-modal-close")?.addEventListener("click", closeWorkModal);
modal?.addEventListener("click", event => { if (event.target === modal) closeWorkModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeWorkModal(); });
