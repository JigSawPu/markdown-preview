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

function createOutlineTree(items) {
  const root = {
    level: 0,
    children: []
  };

  const stack = [root];

  for (const item of items) {
    const node = {
      ...item,
      level: Math.max(1, Math.min(6, Number(item.level) || 1)),
      children: []
    };

    /*
     * Find the nearest previous heading with a lower level.
     *
     * This also handles skipped levels:
     * # Heading
     * ### Heading
     *
     * The H3 becomes a child of the H1.
     */
    while (
      stack.length > 1 &&
      stack[stack.length - 1].level >= node.level
    ) {
      stack.pop();
    }

    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root.children;
}

function renderOutlineNodes(nodes) {
  if (!nodes.length) return "";

  return `
    <ul class="outline-list">
      ${nodes.map(node => {
        const hasChildren = node.children.length > 0;

        return `
          <li
            class="outline-item ${hasChildren ? "has-children" : ""}"
            data-outline-id="${escapeText(node.id)}"
          >
            <div class="outline-row">
              ${
                hasChildren
                  ? `
                    <button
                      class="outline-toggle"
                      type="button"
                      aria-label="Collapse ${escapeText(node.text)}"
                      aria-expanded="true"
                    >
                      <span aria-hidden="true">▾</span>
                    </button>
                  `
                  : `
                    <span class="outline-toggle-spacer"></span>
                  `
              }

              <a
                class="nav-link"
                data-target="${escapeText(node.id)}"
                href="#${encodeURIComponent(node.id)}"
                title="${escapeText(node.text)}"
              >
                <span class="nav-link-text">
                  ${escapeText(node.text)}
                </span>
              </a>
            </div>

            ${renderOutlineNodes(node.children)}
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function buildNestedOutline(items) {
  if (!items.length) {
    return `
      <p class="empty-message">
        No Markdown headings found.
      </p>
    `;
  }

  const tree = createOutlineTree(items);
  return renderOutlineNodes(tree);
}

function buildNavigation(data) {
  outlineElement.innerHTML = buildNestedOutline(data.outline);

  descriptionsElement.innerHTML = data.sections.map((section, index) => `
    <a
      class="description-link"
      data-target="${escapeText(section.id)}"
      href="#${encodeURIComponent(section.id)}"
    >
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
    link.classList.toggle(
      "active",
      link.dataset.target === id
    );
  });

  const activeOutlineItem = document.querySelector(
    `.outline-item[data-outline-id="${CSS.escape(id)}"]`
  );

  if (!activeOutlineItem) return;

  /*
   * Expand all parent branches containing the active heading.
   */
  let parent = activeOutlineItem.parentElement?.closest(".outline-item");

  while (parent) {
    parent.classList.remove("collapsed");

    const toggle = parent.querySelector(
      ":scope > .outline-row > .outline-toggle"
    );

    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
    }

    parent = parent.parentElement?.closest(".outline-item");
  }

  /*
   * Keep the active outline item visible in the side panel.
   */
  activeOutlineItem.scrollIntoView({
    block: "nearest",
    behavior: "smooth"
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
  const toggleButton = event.target.closest(".outline-toggle");

  if (toggleButton) {
    const outlineItem = toggleButton.closest(".outline-item");
    const collapsed = outlineItem.classList.toggle("collapsed");

    toggleButton.setAttribute(
      "aria-expanded",
      collapsed ? "false" : "true"
    );

    toggleButton.setAttribute(
      "aria-label",
      collapsed ? "Expand heading" : "Collapse heading"
    );

    return;
  }

  const navigationLink = event.target.closest("[data-target]");

  if (navigationLink) {
    event.preventDefault();
    navigateTo(navigationLink.dataset.target);
    return;
  }

  const panelButton = event.target.closest("[data-panel]");

  if (panelButton) {
    openPanel(panelButton.dataset.panel);
  }

  if (
    event.target.closest(".close-button") ||
    event.target === backdrop
  ) {
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
