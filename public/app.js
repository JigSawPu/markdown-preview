const outlineElement = document.querySelector("#outline");
const descriptionsElement = document.querySelector("#descriptions");
const documentElement = document.querySelector("#document");
const backdrop = document.querySelector("#backdrop");
const panels = {
  outline: document.querySelector("#outline-panel"),
  descriptions: document.querySelector("#descriptions-panel")
};

function escapeText(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function closePanels() {
  Object.values(panels).forEach(panel => panel.classList.remove("open"));
  backdrop.hidden = true;
  document.body.style.overflow = "";
}

function openPanel(name) {
  closePanels();
  panels[name].classList.add("open");
  backdrop.hidden = false;
  document.body.style.overflow = "hidden";
}

function navigateTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  closePanels();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${encodeURIComponent(id)}`);
}

function buildNavigation(data) {
  if (data.outline.length) {
    outlineElement.innerHTML = data.outline.map(item => `
      <a class="nav-link" data-target="${escapeText(item.id)}"
         data-level="${item.level}" href="#${encodeURIComponent(item.id)}">
        ${escapeText(item.text)}
      </a>
    `).join("");
  } else {
    outlineElement.innerHTML = '<p class="empty-message">No Markdown headings found.</p>';
  }

  descriptionsElement.innerHTML = data.sections.map((section, index) => `
    <a class="description-link" data-target="${escapeText(section.id)}"
       href="#${encodeURIComponent(section.id)}">
      ${escapeText(section.description || `Section ${index + 1}`)}
    </a>
  `).join("");
}

function buildDocument(data) {
  documentElement.innerHTML = data.sections.map((section, index) => `
    <section class="document-section" id="${escapeText(section.id)}">
      <p class="section-label">Section ${index + 1}</p>
      <div class="markdown-body">${section.html}</div>
    </section>
  `).join("");
}

function setActiveLink(id) {
  document.querySelectorAll("[data-target]").forEach(link => {
    link.classList.toggle("active", link.dataset.target === id);
  });
}

function observeSections() {
  const targets = [
    ...document.querySelectorAll(".document-section"),
    ...document.querySelectorAll(".anchored-heading")
  ];

  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setActiveLink(visible[0].target.id);
  }, {
    rootMargin: "-15% 0px -70% 0px",
    threshold: 0
  });

  targets.forEach(target => observer.observe(target));
}

document.addEventListener("click", event => {
  const navigationLink = event.target.closest("[data-target]");
  if (navigationLink) {
    event.preventDefault();
    navigateTo(navigationLink.dataset.target);
    return;
  }

  const panelButton = event.target.closest("[data-panel]");
  if (panelButton) openPanel(panelButton.dataset.panel);

  if (event.target.closest(".close-button") || event.target === backdrop) {
    closePanels();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closePanels();
});

async function loadDocument() {
  try {
    const response = await fetch("/api/document", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Could not load document.");

    buildNavigation(data);
    buildDocument(data);
    observeSections();

    const initialId = decodeURIComponent(location.hash.slice(1));
    if (initialId) requestAnimationFrame(() => navigateTo(initialId));
  } catch (error) {
    documentElement.innerHTML = `
      <p class="error-message"><strong>Unable to load the Markdown file.</strong><br>
      ${escapeText(error.message)}</p>
    `;
  }
}

loadDocument();
