"use strict";
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { marked } = require("marked");
const sanitizeHtml = require("sanitize-html");
const app = express();
const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";
const PUBLIC_DIRECTORY = path.join(__dirname, "public");
const CONTENT_FILE =
  process.env.CONTENT_FILE ||
  path.join(__dirname, "content.md");
/*
 * Prevent Express from exposing implementation details.
 */
app.disable("x-powered-by");
/*
 * Serve files from the public directory.
 */
app.use(express.static(PUBLIC_DIRECTORY));
/*
 * Serve GitHub Markdown CSS when the package is installed.
 *
 * This route does not prevent the application from starting when
 * the directory does not exist. It will simply return 404 for the
 * stylesheet.
 */
app.use(
  "/vendor/github-markdown-css",
  express.static(
    path.join(
      __dirname,
      "node_modules",
      "github-markdown-css"
    )
  )
);
/*
 * Convert a heading into a URL-safe identifier.
 */
function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "section";
}
/*
 * Extract readable plain text from Marked heading tokens.
 */
function tokensToPlainText(tokens = []) {
  return tokens
    .map(token => {
      if (
        Array.isArray(token.tokens) &&
        token.tokens.length > 0
      ) {
        return tokensToPlainText(token.tokens);
      }
      return token.text || token.raw || "";
    })
    .join("")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/*
 * Read DESCRIPTIONn and BODYn blocks from content.md.
 */
function parseSpecialMarkdown(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const sections = [];
  const descriptionPattern =
    /^\s*DESCRIPTION\s*(\d+)\s*$/i;
  const bodyPattern =
    /^\s*BODY\s*(\d+)\s*$/i;
  let currentSection = null;
  let currentMode = null;
  /*
   * Track fenced code blocks so marker-like text inside a code
   * block is not accidentally treated as a new section.
   */
  let activeFence = null;
  function finishCurrentSection() {
    if (!currentSection) {
      return;
    }
    sections.push(currentSection);
    currentSection = null;
    currentMode = null;
    activeFence = null;
  }
  for (const line of lines) {
    /*
     * While reading BODY content, preserve fenced code blocks.
     */
    if (currentMode === "body") {
      const fenceMatch = line.match(
        /^\s*(`{3,}|~{3,})/
      );
      if (fenceMatch) {
        const fence = fenceMatch[1];
        if (!activeFence) {
          activeFence = {
            character: fence[0],
            length: fence.length
          };
          currentSection.bodyLines.push(line);
          continue;
        }
        if (
          fence[0] === activeFence.character &&
          fence.length >= activeFence.length
        ) {
          currentSection.bodyLines.push(line);
          activeFence = null;
          continue;
        }
      }
      if (activeFence) {
        currentSection.bodyLines.push(line);
        continue;
      }
    }
    const descriptionMatch = line.match(
      descriptionPattern
    );
    const bodyMatch = line.match(bodyPattern);
    if (descriptionMatch) {
      finishCurrentSection();
      currentSection = {
        number: descriptionMatch[1],
        descriptionLines: [],
        bodyLines: []
      };
      currentMode = "description";
      continue;
    }
    if (bodyMatch) {
      /*
       * Allow a BODY block even when its DESCRIPTION block is
       * missing.
       */
      if (!currentSection) {
        currentSection = {
          number: bodyMatch[1],
          descriptionLines: [],
          bodyLines: []
        };
      }
      currentMode = "body";
      continue;
    }
    if (!currentSection || !currentMode) {
      continue;
    }
    if (currentMode === "description") {
      currentSection.descriptionLines.push(line);
    }
    if (currentMode === "body") {
      currentSection.bodyLines.push(line);
    }
  }
  finishCurrentSection();
  return sections
    .map((section, index) => {
      const sectionNumber =
        section.number || String(index + 1);
      return {
        number: sectionNumber,
        /*
         * Include the array index so duplicate section numbers
         * cannot create duplicate HTML IDs.
         */
        id: `document-section-${sectionNumber}-${index + 1}`,
        description: section.descriptionLines
          .join("\n")
          .trim(),
        markdown: section.bodyLines
          .join("\n")
          .trim()
      };
    })
    .filter(section => {
      return section.description || section.markdown;
    });
}
/*
 * Render every BODY block and collect its headings separately.
 *
 * This lets app.js group outline headings beneath their matching
 * DESCRIPTION block.
 */
function renderDocument(sections) {
  const usedHeadingIds = new Map();
  const allowedTags = Array.from(
    new Set([
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6"
    ])
  );
  const renderedSections = sections.map(
    (section, sectionIndex) => {
      const sectionOutline = [];
      const renderer = new marked.Renderer();
      /*
       * Use a normal function instead of an arrow function because
       * Marked supplies its parser through `this`.
       */
      renderer.heading = function headingRenderer(
        headingToken
      ) {
        const tokens = headingToken.tokens || [];
        const depth = Math.max(
          1,
          Math.min(
            6,
            Number(headingToken.depth) || 1
          )
        );
        const renderedHeadingText =
          this.parser.parseInline(tokens);
        const plainText =
          tokensToPlainText(tokens) ||
          `Untitled heading`;
        const baseId = slugify(plainText);
        const previousCount =
          usedHeadingIds.get(baseId) || 0;
        usedHeadingIds.set(
          baseId,
          previousCount + 1
        );
        const headingId =
          previousCount === 0
            ? baseId
            : `${baseId}-${previousCount + 1}`;
        sectionOutline.push({
          id: headingId,
          text: plainText,
          level: depth
        });
        return [
          `<h${depth}`,
          ` id="${headingId}"`,
          ` class="anchored-heading">`,
          renderedHeadingText,
          `</h${depth}>`,
          "\n"
        ].join("");
      };
      const renderedMarkdown = marked.parse(
        section.markdown || "",
        {
          gfm: true,
          breaks: true,
          renderer
        }
      );
      const cleanHtml = sanitizeHtml(
        renderedMarkdown,
        {
          allowedTags,
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            a: [
              "href",
              "name",
              "target",
              "rel",
              "title"
            ],
            img: [
              "src",
              "alt",
              "title",
              "width",
              "height",
              "loading"
            ],
            code: ["class"],
            h1: ["id", "class"],
            h2: ["id", "class"],
            h3: ["id", "class"],
            h4: ["id", "class"],
            h5: ["id", "class"],
            h6: ["id", "class"]
          },
          allowedSchemes: [
            "http",
            "https",
            "mailto"
          ],
          transformTags: {
            a: sanitizeHtml.simpleTransform(
              "a",
              {
                target: "_blank",
                rel: "noopener noreferrer"
              },
              true
            ),
            img: sanitizeHtml.simpleTransform(
              "img",
              {
                loading: "lazy"
              },
              true
            )
          }
        }
      );
      return {
        ...section,
        index: sectionIndex,
        html: cleanHtml,
        outline: sectionOutline
      };
    }
  );
  return {
    sections: renderedSections
  };
}
/*
 * Document API.
 */
app.get("/api/document", async (_request, response) => {
  try {
    const source = await fs.readFile(
      CONTENT_FILE,
      "utf8"
    );
    const sections = parseSpecialMarkdown(source);
    if (sections.length === 0) {
      return response.status(422).json({
        error:
          "No sections were found. Use DESCRIPTION1 followed by BODY1 in content.md."
      });
    }
    const documentData = renderDocument(sections);
    response.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );
    return response.json(documentData);
  } catch (error) {
    console.error(
      "Unable to load the Markdown document:",
      error
    );
    if (error && error.code === "ENOENT") {
      return response.status(500).json({
        error:
          `The Markdown file was not found: ${CONTENT_FILE}`
      });
    }
    return response.status(500).json({
      error:
        "The server could not read or render content.md."
    });
  }
});
/*
 * Render health check.
 */
app.get("/health", (_request, response) => {
  response.status(200).send("ok");
});
/*
 * Frontend fallback.
 *
 * Using app.use here avoids the wildcard route syntax problems
 * that can occur with Express 5 and path-to-regexp.
 */
app.use((request, response, next) => {
  if (request.method !== "GET") {
    return next();
  }
  return response.sendFile(
    path.join(PUBLIC_DIRECTORY, "index.html"),
    error => {
      if (error) {
        next(error);
      }
    }
  );
});
/*
 * Final error handler.
 */
app.use((error, _request, response, _next) => {
  console.error("Unhandled server error:", error);
  if (response.headersSent) {
    return;
  }
  response.status(500).json({
    error: "An unexpected server error occurred."
  });
});
/*
 * Start the web service.
 */
app.listen(PORT, HOST, () => {
  console.log(
    `Markdown reader running at http://${HOST}:${PORT}`
  );
  console.log(
    `Reading Markdown from ${CONTENT_FILE}`
  );
});