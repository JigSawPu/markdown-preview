# Markdown Three-Pane Reader

A responsive Markdown reader designed for Render and iPhone.

## Content format

Edit `content.md`:

```text
DESCRIPTION1
A short plain-text description.

BODY1
# Markdown heading

Markdown content here.

DESCRIPTION2
Another description.

BODY2
## More Markdown

More content.
```

Rules:

- `DESCRIPTIONn` and `BODYn` must each be alone on a line.
- The number should match within a pair.
- Description text remains plain text.
- BODY text is rendered as GitHub-flavored Markdown.
- Markdown headings become links in the left outline.
- Each description becomes a link in the right panel.

## Deploy on Render

1. Put all files in a GitHub repository.
2. In Render, choose **New → Blueprint** and connect the repository.
3. Render reads `render.yaml`; approve the service.
4. After deployment, open the generated `onrender.com` address.

You can instead create a normal Web Service with:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

Every committed change to the connected branch can trigger a new deployment.

## Change the Markdown filename

The default file is `content.md`. To use another file, add an environment variable in Render:

```text
CONTENT_FILE=/opt/render/project/src/your-file.md
```

For most uses, keeping `content.md` is simpler.

## Local run

```bash
npm install
npm start
```

Then open `http://localhost:10000`.
