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

## Chat assistant (RAG)

A chat window with Soma's Rive avatar (`avatar/soma.riv`) sits on the middle right of every page.
It answers only from the PDFs in `data/`. Full details are in `BUILD_GUIDE.md`.

- `coach/` — widget (`chat.css`, `chat.js`); each page includes it with three lines
- `backend/` — Python RAG service (FastAPI + Chroma + OpenAI)

First run, from `backend/`:

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env              # then add OPENAI_API_KEY
.venv/bin/python convert_pdfs.py  # data/*.pdf -> knowledge/*.txt
.venv/bin/python ingest.py        # embed into chroma_db/
.venv/bin/uvicorn app.main:app --port 8000
```

Then serve the site on port 5500 (or VS Code Live Server on 5501) and open `http://localhost:5500`.
After changing the PDFs, run `convert_pdfs.py` and `ingest.py` again and restart the backend.
