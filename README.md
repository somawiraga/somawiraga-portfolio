# Soma Wiraga — Portfolio

Personal portfolio site, built as static HTML/CSS/JS from the "Portfolio Rebuild" Figma design.

## Pages

| File | Description |
|---|---|
| `index.html` | Home |
| `project-ai-education.html` | Project — AI Education Agent |
| `project-customs-portal.html` | Project — AI Powered Custom Clearance Portal |
| `process-landing-page.html` | Process — 1-Day Landing Page delivery |
| `team-growth.html` | Story — 5x Team Growth |

## Structure

- `styles.css` — single shared stylesheet (design tokens, layout, components, responsive rules)
- `js/site.js` — shared behaviour: page-transition animation and scroll reveals
- `js/<page>.js` — per-page script (card stagger, back-to-top, hero parallax, etc.)
- `assets/` — exported images, icons and SVGs

## Running locally

No build step — serve the folder with any static server, e.g.:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/index.html`.
