"use strict";
/* --------------------------------------------------
   Main elements
-------------------------------------------------- */
const outlineElement =
  document.querySelector("#outline");
const descriptionsElement =
  document.querySelector("#descriptions");
const documentElement =
  document.querySelector("#document");
const backdrop =
  document.querySelector("#backdrop");
const panels = {
  outline: document.querySelector("#outline-panel"),
  descriptions: document.querySelector(
    "#descriptions-panel"
  )
};
let activeTargetId = null;
let scrollSpyFrame = null;
/* --------------------------------------------------
   HTML escaping
-------------------------------------------------- */
function escapeText(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}
/* --------------------------------------------------
   Mobile side panels
-------------------------------------------------- */
function closePanels() {
  Object.values(panels).forEach(panel => {
    if (panel) {
      panel.classList.remove("open");
    }
  });
  if (backdrop) {
    backdrop.hidden = true;
  }
  document.body.style.overflow = "";
}
function openPanel(name) {
  const panel = panels[name];
  if (!panel) {
    return;
  }
  closePanels();
  panel.classList.add("open");
  if (backdrop) {
    backdrop.hidden = false;
  }
  document.body.style.overflow = "hidden";
}
/* --------------------------------------------------
   Navigation
-------------------------------------------------- */
function navigateTo(id) {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  closePanels();
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  target.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start"
  });
  const encodedId = encodeURIComponent(id);
  history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#${encodedId}`
  );
  setActiveLink(id);
}
/* --------------------------------------------------
   Outline tree construction
-------------------------------------------------- */
function createOutlineTree(items) {
  const root = {
    level: 0,
    children: []
  };
  const stack = [root];
  for (const item of items) {
    const level = Math.max(
      1,
      Math.min(6, Number(item.level) || 1)
    );
    const node = {
      id: String(item.id || ""),
      text: String(item.text || "Untitled heading"),
      level,
      children: []
    };
    /*
     * Locate the nearest preceding heading with a
     * lower heading level.
     *
     * This also handles skipped levels such as:
     *
     * # Heading
     * ### Subheading
     */
    while (
      stack.length > 1 &&
      stack[stack.length - 1].level >= level
    ) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}
/* --------------------------------------------------
   Outline tree HTML
-------------------------------------------------- */
function renderOutlineNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return "";
  }
  return `
    <ul class="outline-list">
      ${nodes
        .map(node => {
          const hasChildren =
            node.children.length > 0;
          const safeId = escapeText(node.id);
          const safeText = escapeText(node.text);
          return `
            <li
              class="outline-item ${
                hasChildren ? "has-children" : ""
              }"
              data-outline-id="${safeId}"
            >
              <div class="outline-row">
                ${
                  hasChildren
                    ? `
                      <button
                        class="outline-toggle"
                        type="button"
                        aria-expanded="true"
                        aria-label="Collapse ${safeText}"
                      >
                        <span aria-hidden="true">▾</span>
                      </button>
                    `
                    : `
                      <span
                        class="outline-toggle-spacer"
                        aria-hidden="true"
                      ></span>
                    `
                }
                <a
                  class="nav-link"
                  data-target="${safeId}"
                  href="#${encodeURIComponent(node.id)}"
                  title="${safeText}"
                >
                  <span class="nav-link-text">
                    ${safeText}
                  </span>
                </a>
              </div>
              ${renderOutlineNodes(node.children)}
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}
/* --------------------------------------------------
   Build grouped outline and descriptions
-------------------------------------------------- */
function buildNavigation(data) {
  const sections = Array.isArray(data.sections)
    ? data.sections
    : [];
  if (sections.length === 0) {
    outlineElement.innerHTML = `
      <p class="empty-message">
        No sections found.
      </p>
    `;
    descriptionsElement.innerHTML = `
      <p class="empty-message">
        No descriptions found.
      </p>
    `;
    return;
  }
  outlineElement.innerHTML = sections
    .map((section, index) => {
      const description =
        section.description ||
        `Section ${index + 1}`;
      const sectionId = String(section.id);
      const safeSectionId = escapeText(sectionId);
      const safeDescription =
        escapeText(description);
      const tree = createOutlineTree(
        Array.isArray(section.outline)
          ? section.outline
          : []
      );
      const groupContentId =
        `outline-group-content-${index + 1}`;
      return `
        <section
          class="outline-group"
          data-section-group="${safeSectionId}"
        >
          <div class="outline-group-header">
            <button
              class="outline-group-toggle"
              type="button"
              aria-expanded="true"
              aria-controls="${groupContentId}"
              aria-label="Collapse ${safeDescription}"
            >
              <span aria-hidden="true">▾</span>
            </button>
            <a
              class="outline-group-link"
              data-target="${safeSectionId}"
              href="#${encodeURIComponent(sectionId)}"
              title="${safeDescription}"
            >
              <span class="outline-group-link-text">
                ${safeDescription}
              </span>
            </a>
          </div>
          <div
            id="${groupContentId}"
            class="outline-group-content"
          >
            ${
              tree.length > 0
                ? renderOutlineNodes(tree)
                : `
                  <p class="outline-group-empty">
                    No headings in this section
                  </p>
                `
            }
          </div>
        </section>
      `;
    })
    .join("");
  descriptionsElement.innerHTML = sections
    .map((section, index) => {
      const sectionId = String(section.id);
      const description =
        section.description ||
        `Section ${index + 1}`;
      return `
        <a
          class="description-link"
          data-target="${escapeText(sectionId)}"
          href="#${encodeURIComponent(sectionId)}"
        >
          ${escapeText(description)}
        </a>
      `;
    })
    .join("");
}
/* --------------------------------------------------
   Build center document
-------------------------------------------------- */
function buildDocument(data) {
  const sections = Array.isArray(data.sections)
    ? data.sections
    : [];
  documentElement.innerHTML = sections
    .map((section, index) => {
      const sectionId = escapeText(section.id);
      return `
        <section
          class="document-section"
          id="${sectionId}"
        >
          <p class="section-label">
            Section ${index + 1}
          </p>
          <div class="markdown-body">
            ${section.html || ""}
          </div>
        </section>
      `;
    })
    .join("");
}
/* --------------------------------------------------
   Outline lookup helpers
-------------------------------------------------- */
function findOutlineItem(id) {
  return Array.from(
    outlineElement.querySelectorAll(
      ".outline-item"
    )
  ).find(item => {
    return item.dataset.outlineId === id;
  });
}
function findOutlineGroup(sectionId) {
  return Array.from(
    outlineElement.querySelectorAll(
      ".outline-group"
    )
  ).find(group => {
    return group.dataset.sectionGroup === sectionId;
  });
}
function findSectionIdForTarget(id) {
  const target = document.getElementById(id);
  if (!target) {
    return null;
  }
  const section = target.closest(
    ".document-section"
  );
  return section ? section.id : null;
}
/* --------------------------------------------------
   Expand active outline branches
-------------------------------------------------- */
function expandOutlineItemParents(outlineItem) {
  let parentItem = outlineItem
    .parentElement
    ?.closest(".outline-item");
  while (parentItem) {
    parentItem.classList.remove("collapsed");
    const parentToggle =
      parentItem.querySelector(
        ":scope > .outline-row > .outline-toggle"
      );
    if (parentToggle) {
      parentToggle.setAttribute(
        "aria-expanded",
        "true"
      );
      parentToggle.setAttribute(
        "aria-label",
        "Collapse heading"
      );
    }
    parentItem = parentItem
      .parentElement
      ?.closest(".outline-item");
  }
}
function expandOutlineGroup(group) {
  if (!group) {
    return;
  }
  group.classList.remove("collapsed");
  const toggle = group.querySelector(
    ":scope > .outline-group-header > .outline-group-toggle"
  );
  if (toggle) {
    toggle.setAttribute(
      "aria-expanded",
      "true"
    );
    toggle.setAttribute(
      "aria-label",
      "Collapse description group"
    );
  }
}
/* --------------------------------------------------
   Keep active outline entry visible
-------------------------------------------------- */
function keepOutlineEntryVisible(element) {
  const outlinePanel = panels.outline;
  if (!element || !outlinePanel) {
    return;
  }
  const panelRectangle =
    outlinePanel.getBoundingClientRect();
  const elementRectangle =
    element.getBoundingClientRect();
  const isAbove =
    elementRectangle.top <
    panelRectangle.top + 50;
  const isBelow =
    elementRectangle.bottom >
    panelRectangle.bottom - 30;
  if (!isAbove && !isBelow) {
    return;
  }
  const targetTop =
    outlinePanel.scrollTop +
    elementRectangle.top -
    panelRectangle.top -
    outlinePanel.clientHeight / 3;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  outlinePanel.scrollTo({
    top: Math.max(0, targetTop),
    behavior: reduceMotion ? "auto" : "smooth"
  });
}
/* --------------------------------------------------
   Active heading and section state
-------------------------------------------------- */
function setActiveLink(id) {
  if (!id || activeTargetId === id) {
    return;
  }
  activeTargetId = id;
  const sectionId =
    findSectionIdForTarget(id);
  document
    .querySelectorAll("[data-target]")
    .forEach(link => {
      const targetId = link.dataset.target;
      const isExactTarget =
        targetId === id;
      const isSectionNavigation =
        sectionId &&
        targetId === sectionId &&
        (
          link.classList.contains(
            "outline-group-link"
          ) ||
          link.classList.contains(
            "description-link"
          )
        );
      link.classList.toggle(
        "active",
        Boolean(
          isExactTarget ||
          isSectionNavigation
        )
      );
    });
  const activeGroup =
    sectionId
      ? findOutlineGroup(sectionId)
      : null;
  if (activeGroup) {
    expandOutlineGroup(activeGroup);
  }
  const activeOutlineItem =
    findOutlineItem(id);
  if (activeOutlineItem) {
    expandOutlineItemParents(
      activeOutlineItem
    );
    keepOutlineEntryVisible(
      activeOutlineItem
    );
  } else if (activeGroup) {
    keepOutlineEntryVisible(
      activeGroup
    );
  }
}
/* --------------------------------------------------
   Scroll spy
-------------------------------------------------- */
function getScrollSpyTargets() {
  return Array.from(
    documentElement.querySelectorAll(
      ".document-section, .anchored-heading"
    )
  );
}
function updateActiveTargetFromScroll() {
  scrollSpyFrame = null;
  const targets = getScrollSpyTargets();
  if (targets.length === 0) {
    return;
  }
  const mobileHeaderOffset =
    window.innerWidth <= 900 ? 90 : 50;
  let activeTarget = targets[0];
  for (const target of targets) {
    const rectangle =
      target.getBoundingClientRect();
    if (rectangle.top <= mobileHeaderOffset) {
      activeTarget = target;
    } else {
      break;
    }
  }
  setActiveLink(activeTarget.id);
}
function requestScrollSpyUpdate() {
  if (scrollSpyFrame !== null) {
    return;
  }
  scrollSpyFrame = requestAnimationFrame(
    updateActiveTargetFromScroll
  );
}
function startScrollSpy() {
  window.addEventListener(
    "scroll",
    requestScrollSpyUpdate,
    { passive: true }
  );
  window.addEventListener(
    "resize",
    requestScrollSpyUpdate
  );
  requestScrollSpyUpdate();
}
/* --------------------------------------------------
   Click handling
-------------------------------------------------- */
document.addEventListener("click", event => {
  const clickedElement =
    event.target instanceof Element
      ? event.target
      : event.target.parentElement;
  if (!clickedElement) {
    return;
  }
  /*
   * Description-group collapse button.
   */
  const groupToggle = clickedElement.closest(
    ".outline-group-toggle"
  );
  if (groupToggle) {
    const group = groupToggle.closest(
      ".outline-group"
    );
    if (!group) {
      return;
    }
    const collapsed =
      group.classList.toggle("collapsed");
    groupToggle.setAttribute(
      "aria-expanded",
      collapsed ? "false" : "true"
    );
    groupToggle.setAttribute(
      "aria-label",
      collapsed
        ? "Expand description group"
        : "Collapse description group"
    );
    return;
  }
  /*
   * Individual heading collapse button.
   */
  const outlineToggle =
    clickedElement.closest(
      ".outline-toggle"
    );
  if (outlineToggle) {
    const outlineItem =
      outlineToggle.closest(
        ".outline-item"
      );
    if (!outlineItem) {
      return;
    }
    const collapsed =
      outlineItem.classList.toggle(
        "collapsed"
      );
    outlineToggle.setAttribute(
      "aria-expanded",
      collapsed ? "false" : "true"
    );
    outlineToggle.setAttribute(
      "aria-label",
      collapsed
        ? "Expand heading"
        : "Collapse heading"
    );
    return;
  }
  /*
   * Outline and description navigation.
   */
  const navigationLink =
    clickedElement.closest(
      "[data-target]"
    );
  if (navigationLink) {
    event.preventDefault();
    navigateTo(
      navigationLink.dataset.target
    );
    return;
  }
  /*
   * Mobile panel buttons.
   */
  const panelButton =
    clickedElement.closest(
      "[data-panel]"
    );
  if (panelButton) {
    openPanel(
      panelButton.dataset.panel
    );
    return;
  }
  /*
   * Close buttons and backdrop.
   */
  if (
    clickedElement.closest(
      ".close-button"
    ) ||
    clickedElement === backdrop
  ) {
    closePanels();
  }
});
/* --------------------------------------------------
   Keyboard handling
-------------------------------------------------- */
document.addEventListener(
  "keydown",
  event => {
    if (event.key === "Escape") {
      closePanels();
    }
  }
);
/* --------------------------------------------------
   Initial URL hash
-------------------------------------------------- */
function getInitialHashId() {
  const hash = window.location.hash.slice(1);
  if (!hash) {
    return "";
  }
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}
/* --------------------------------------------------
   Load document
-------------------------------------------------- */
async function loadDocument() {
  try {
    const response = await fetch(
      "/api/document",
      {
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data.error ||
        "Could not load the document."
      );
    }
    if (
      !data ||
      !Array.isArray(data.sections)
    ) {
      throw new Error(
        "The server returned invalid document data."
      );
    }
    buildDocument(data);
    buildNavigation(data);
    startScrollSpy();
    const initialId = getInitialHashId();
    if (initialId) {
      requestAnimationFrame(() => {
        navigateTo(initialId);
      });
    } else {
      requestScrollSpyUpdate();
    }
  } catch (error) {
    console.error(
      "Unable to load document:",
      error
    );
    outlineElement.innerHTML = `
      <p class="empty-message">
        Outline unavailable.
      </p>
    `;
    descriptionsElement.innerHTML = `
      <p class="empty-message">
        Descriptions unavailable.
      </p>
    `;
    documentElement.innerHTML = `
      <div class="error-message">
        <p>
          <strong>
            Unable to load the Markdown file.
          </strong>
        </p>
        <p>
          ${escapeText(
            error instanceof Error
              ? error.message
              : "Unknown error"
          )}
        </p>
      </div>
    `;
  }
}
loadDocument();
