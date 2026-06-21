const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { marked } = require("marked");
const sanitizeHtml = require("sanitize-html");

const app = express();
const PORT = process.env.PORT || 10000;
const CONTENT_FILE = process.env.CONTENT_FILE || path.join(__dirname, "content.md");

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/github-markdown-css",
  express.static(
    path.join(__dirname, "node_modules", "github-markdown-css")
  )
);

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "section";
}

function parseSpecialMarkdown(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let current = null;
  let mode = null;

  const descriptionPattern = /^\s*DESCRIPTION\s*(\d+)\s*$/i;
  const bodyPattern = /^\s*BODY\s*(\d+)\s*$/i;

  for (const line of lines) {
    const descriptionMatch = line.match(descriptionPattern);
    const bodyMatch = line.match(bodyPattern);

    if (descriptionMatch) {
      if (current) sections.push(current);
      current = {
        number: descriptionMatch[1],
        descriptionLines: [],
        bodyLines: []
      };
      mode = "description";
      continue;
    }

    if (bodyMatch) {
      if (!current) {
        current = {
          number: bodyMatch[1],
          descriptionLines: [],
          bodyLines: []
        };
      }
      mode = "body";
      continue;
    }

    if (!current || !mode) continue;
    if (mode === "description") current.descriptionLines.push(line);
    if (mode === "body") current.bodyLines.push(line);
  }

  if (current) sections.push(current);

  return sections
    .map((section, index) => ({
      number: section.number || String(index + 1),
      id: `document-section-${section.number || index + 1}`,
      description: section.descriptionLines.join("\n").trim(),
      markdown: section.bodyLines.join("\n").trim()
    }))
    .filter(section => section.description || section.markdown);
}

function renderDocument(sections) {
  const usedIds = new Map();
  const outline = [];

  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map(token => token.raw || token.text || "").join("");
    const plainText = text.replace(/<[^>]*>/g, "").trim();
    const base = slugify(plainText);
    const count = usedIds.get(base) || 0;
    usedIds.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    outline.push({ id, text: plainText, level: depth });
    return `<h${depth} id="${id}" class="anchored-heading">${text}</h${depth}>`;
  };

  marked.setOptions({
    gfm: true,
    breaks: false,
    renderer
  });

  const allowedTags = sanitizeHtml.defaults.allowedTags.concat([
    "img", "h1", "h2", "h3", "h4", "h5", "h6"
  ]);

  const renderedSections = sections.map(section => {
    const html = marked.parse(section.markdown || "");
    return {
      ...section,
      html: sanitizeHtml(html, {
        allowedTags,
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          a: ["href", "name", "target", "rel"],
          img: ["src", "alt", "title", "width", "height", "loading"],
          code: ["class"],
          h1: ["id", "class"],
          h2: ["id", "class"],
          h3: ["id", "class"],
          h4: ["id", "class"],
          h5: ["id", "class"],
          h6: ["id", "class"]
        },
        allowedSchemes: ["http", "https", "mailto"],
        transformTags: {
          a: sanitizeHtml.simpleTransform("a", {
            target: "_blank",
            rel: "noopener noreferrer"
          }),
          img: sanitizeHtml.simpleTransform("img", {
            loading: "lazy"
          })
        }
      })
    };
  });

  return { sections: renderedSections, outline };
}

app.get("/api/document", async (_req, res) => {
  try {
    const source = await fs.readFile(CONTENT_FILE, "utf8");
    const sections = parseSpecialMarkdown(source);

    if (!sections.length) {
      return res.status(422).json({
        error: "No sections found. Use DESCRIPTION1 followed by BODY1."
      });
    }

    res.json(renderDocument(sections));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: `Could not read ${path.basename(CONTENT_FILE)}.`
    });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Markdown reader running on port ${PORT}`);
});
