# Build Guide: RAG Chat Coach with an Animated Avatar

A step-by-step guide for building a retrieval-augmented (RAG) chat assistant and adding it
to a plain HTML, CSS and JavaScript website. The assistant answers **only** from a folder of
knowledge files, and a Rive avatar's face reacts to the conversation.

This guide is written for Claude (or a developer) working in a **new repository**. Every
file needed is given in full below, taken from a working implementation ("Academy Coach").
Follow the steps in order.

---

## 0. Instructions for the agent

Before writing code, **ask the user** for anything below that is not already clear from the
repo or the conversation. Do not invent these.

| # | Ask for | Why |
|---|---------|-----|
| 1 | **The knowledge files** (or where they are). Plain `.txt` or `.md`. | The assistant can only answer from these. Without them there is nothing to ingest. |
| 2 | **The existing website's files**: which HTML page(s) should show the chat. | The widget is added to those pages. |
| 3 | **The assistant's name and topic** (e.g. "Academy Coach", "your course material"). | Used in the system prompt, the not-found reply and the widget text. |
| 4 | **The Rive avatar file** (`.riv`), and whether it follows the contract in step 8. | The avatar animation. Without it, the chat works but shows an empty circle. |
| 5 | **An OpenAI API key.** Ask the user to put it in `backend/.env` themselves. Never ask them to paste it into the chat, and never write it into any frontend file. | Embeddings and answers both call OpenAI. |
| 6 | **Where the backend will be hosted** (only needed for step 11). | A static site cannot run the backend. |

Rules while building:

- Keep the backend and the website separate (layout in step 1).
- Copy the code below as given, then change only what each step says to change.
- Run each step's check before moving on.
- Do not commit `.env` or `chroma_db/`.

---

## 1. How it works

The language model is never trained on the knowledge. Instead:

1. **Ingest (once, and again whenever the knowledge changes).** Each knowledge file is split
   into chunks of at most 1,500 characters. Each chunk is turned into a vector (a list of
   numbers that captures its meaning) by **OpenAI's embedding model**. **Chroma** stores the
   vectors, the chunk text and metadata in a folder on disk (`chroma_db/`).
2. **Question time (every message).** The question is embedded the same way. Chroma returns
   the `TOP_K` closest chunks. Chunks below `MIN_SIMILARITY` are dropped.
   - **None left:** the backend replies "I couldn't find that…" and does **not** call the chat model.
   - **Some left:** they are numbered and given to the chat model as the only allowed source.

> Note on roles: **Chroma does not create the embeddings here.** OpenAI
> `text-embedding-3-small` creates them, and the code passes them to Chroma. Chroma only
> stores them and finds the nearest ones. This keeps the vectors for chunks and questions
> guaranteed to come from the same model.

```
 BUILD TIME
   knowledge/**/*.txt|md ──► split + pack ──► OpenAI embeddings ──► Chroma (chroma_db/)

 QUESTION TIME
   website widget ── POST /api/chat ──► FastAPI backend
                                          1. embed (previous question + this question)
                                          2. Chroma: TOP_K nearest chunks
                                          3. drop chunks below MIN_SIMILARITY
                                          4. none? refuse : chat model + excerpts
   website widget ◄── { answer, sources, found } ──┘   avatar face follows `found`
```

### Technology

| Layer | Technology |
|-------|-----------|
| Backend language | Python 3.9 or newer |
| Web framework | FastAPI 0.128 (Pydantic 2), run by Uvicorn 0.39 |
| Vector store | ChromaDB 1.5, persistent on disk, cosine similarity |
| Embeddings | OpenAI `text-embedding-3-small` |
| Chat model | OpenAI `gpt-4o-mini` (configurable) |
| Frontend | Plain HTML, CSS and JavaScript, no build step |
| Avatar | Rive, `@rive-app/canvas` 2.44.0 from unpkg |

### Target layout of the new repo

The website's existing files stay where they are. Add a `backend/` folder and a `coach/`
folder of widget files next to the site's pages:

```
<repo>/
├── backend/                  the RAG service (Python). Never served as part of the site.
│   ├── app/
│   │   ├── __init__.py       empty
│   │   ├── config.py         paths and .env settings
│   │   ├── rag.py            retrieval, prompt, refusal, OpenAI calls
│   │   └── main.py           FastAPI: POST /api/chat
│   ├── knowledge/            the knowledge files (the assistant's only source)
│   ├── chroma_db/            generated vector store (git-ignored)
│   ├── ingest.py             chunk → embed → store
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                  secrets (git-ignored)
├── coach/                    widget files, served with the website
│   ├── chat.css
│   ├── chat.js
│   └── avatar.riv
├── index.html                existing site page(s), plus the widget markup (step 9)
└── .gitignore
```

If the site's files live in a subfolder (for example `public/` or `site/`), put `coach/`
inside that folder instead.

---

## 2. Install the backend

Run from the repo root.

```bash
mkdir -p backend/app backend/knowledge coach
touch backend/app/__init__.py
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Create the files first:

**`backend/requirements.txt`** (versions the reference build was tested with):

```text
chromadb==1.5.9
openai==2.48.0
fastapi==0.128.8
uvicorn==0.39.0
python-dotenv==1.2.1
```

**`backend/.env.example`** (copy it to `backend/.env`, then ask the user to fill in the key):

```bash
# Copy to .env and fill in your key
OPENAI_API_KEY=

# Optional overrides
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
# Number of knowledge chunks sent to the model per question
TOP_K=5
# Below this similarity (0-1) the agent answers "I don't know" without calling the model
MIN_SIMILARITY=0.25
# Website origin(s) allowed to call the API, comma-separated
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

**`.gitignore`** at the repo root:

```text
.env
.venv/
chroma_db/
__pycache__/
.DS_Store
```

**Check:** `backend/.venv/bin/python -c "import chromadb, openai, fastapi; print('ok')"` prints `ok`.

---

## 3. Add the knowledge

Ask the user for the files, then put them in `backend/knowledge/`.

- **Formats:** `.txt` and `.md`, UTF-8.
- **Folders mean something.** The first folder becomes the `course` metadata, and every folder
  name appears in the chunk's context header. For example
  `knowledge/Product Guide/Setup/Chapter 1.txt`.
- **Sections:** put a line of three or more underscores (`____`) between sections. The first
  line after a divider is the section heading and should be 120 characters or fewer.
- **Paragraphs** go on their own lines. A chunk is built from whole paragraphs where possible.

Example file:

```text
Installing the app
The app runs on Windows and macOS. Download it from the account page.
You need an active licence to sign in.
____
Resetting your password
Open Settings, then Account, then choose "Reset password".
A reset link is emailed to you and expires after one hour.
```

If the user's material has no `____` dividers (for example Markdown with `##` headings),
either convert it, or change `SECTION_BREAK` in `ingest.py` (step 6) to split on the
headings instead. Then check the result with `--dry-run`.

---

## 4. Configuration: `backend/app/config.py`

```python
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

KNOWLEDGE_DIR = ROOT / "knowledge"
CHROMA_DIR = ROOT / "chroma_db"
COLLECTION = "knowledge"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
TOP_K = int(os.getenv("TOP_K", "5"))
MIN_SIMILARITY = float(os.getenv("MIN_SIMILARITY", "0.25"))
# Origins of the website allowed to call the API (comma-separated), e.g.
# https://www.example.com,https://example.com
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",")
    if origin.strip()
]
```

Settings (all optional except the key):

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENAI_API_KEY` | none | Required. |
| `CHAT_MODEL` | `gpt-4o-mini` | Model that writes the answer. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Model that makes the vectors. If you change it, delete `chroma_db/` and re-ingest, because vectors from different models cannot be compared. |
| `TOP_K` | `5` | Chunks sent to the model per question. Raise it if answers feel incomplete. |
| `MIN_SIMILARITY` | `0.25` | Below this (0 to 1) the assistant refuses without calling the model. Raise it for stricter answers, lower it if it says "I don't know" too often. |

---

## 5. Embedding, storage and retrieval: `backend/app/rag.py`

This file holds the Chroma setup, the embedding calls, retrieval, the refusal rule and the
grounded answer.

```python
"""Retrieval and grounded answering over the Chroma knowledge store."""
from typing import Dict, List

import chromadb
from openai import OpenAI

from . import config

SYSTEM_PROMPT = """You are Academy Coach, a study assistant for a course.

Rules:
- Answer ONLY with information found in the course excerpts given in the user message.
- Do not use outside knowledge, and do not guess or fill gaps.
- If the excerpts do not contain the answer, say that the course material you have does not cover it.
- If the excerpts only partly answer the question, answer that part and say what is not covered.
- Write in plain text without markdown. Be clear and concise."""

NOT_FOUND = (
    "I couldn't find that in the course material I've been given. "
    "Try rephrasing, or ask about a topic covered in the course."
)


class MissingKeyError(RuntimeError):
    pass


class EmptyStoreError(RuntimeError):
    pass


_client = None
_collection = None


def client() -> OpenAI:
    global _client
    if _client is None:
        if not config.OPENAI_API_KEY:
            raise MissingKeyError("OPENAI_API_KEY is not set. Add it to the .env file.")
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def collection():
    global _collection
    if _collection is None:
        db = chromadb.PersistentClient(path=str(config.CHROMA_DIR))
        _collection = db.get_or_create_collection(
            config.COLLECTION, metadata={"hnsw:space": "cosine"}
        )
    return _collection


def embed(texts: List[str]) -> List[List[float]]:
    vectors = []
    for i in range(0, len(texts), 100):
        response = client().embeddings.create(
            model=config.EMBEDDING_MODEL, input=texts[i : i + 100]
        )
        vectors.extend(item.embedding for item in response.data)
    return vectors


def retrieve(query: str) -> List[Dict]:
    """Return the chunks relevant enough to answer from, best first."""
    if collection().count() == 0:
        raise EmptyStoreError("The knowledge base is empty. Run: .venv/bin/python ingest.py")
    result = collection().query(
        query_embeddings=embed([query]),
        n_results=config.TOP_K,
        include=["documents", "metadatas", "distances"],
    )
    chunks = []
    for text, meta, distance in zip(
        result["documents"][0], result["metadatas"][0], result["distances"][0]
    ):
        similarity = 1 - distance
        if similarity >= config.MIN_SIMILARITY:
            chunks.append({"text": text, "meta": meta, "similarity": round(similarity, 3)})
    return chunks


def answer(question: str, history: List[Dict]) -> Dict:
    # Include the previous question so follow-ups like "why?" still retrieve well.
    previous = [m["content"] for m in history if m["role"] == "user"][-1:]
    chunks = retrieve("\n".join(previous + [question]))
    if not chunks:
        return {"answer": NOT_FOUND, "sources": [], "found": False}

    excerpts = "\n\n".join(
        "[{}] {}".format(i + 1, chunk["text"]) for i, chunk in enumerate(chunks)
    )
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += history[-6:]
    messages.append(
        {
            "role": "user",
            "content": "Course excerpts:\n\n{}\n\nQuestion: {}".format(excerpts, question),
        }
    )
    response = client().chat.completions.create(
        model=config.CHAT_MODEL, messages=messages, temperature=0.1
    )

    sources = []
    for chunk in chunks:
        meta = chunk["meta"]
        label = "{} — {}".format(meta["chapter"], meta["section"])
        if label not in sources:
            sources.append(label)
    return {
        "answer": response.choices[0].message.content.strip(),
        "sources": sources,
        "found": True,
    }
```

**Change for the new site:** in `SYSTEM_PROMPT`, `NOT_FOUND` and the `"Course excerpts:"`
label, replace "Academy Coach" and the "course" wording with the assistant name and topic
the user gave you. Keep the rules themselves: answer only from the excerpts, no outside
knowledge, no guessing, say what is not covered, plain text.

How the pieces map to the RAG steps:

| Step | Code | Detail |
|------|------|--------|
| Create the store | `collection()` | `PersistentClient` writes to `chroma_db/`. `hnsw:space: cosine` makes distance = 1 − cosine similarity. |
| Embed | `embed()` | Sends text to OpenAI in batches of 100 and returns the vectors. |
| Retrieve | `retrieve()` | Embeds the query, asks Chroma for `TOP_K` results, converts distance to similarity, drops chunks under `MIN_SIMILARITY`. |
| Follow-ups | `answer()` | The previous user question is joined to the new one before retrieval, so "why?" still finds the right chunks. The last 6 messages are also sent to the model. |
| Refusal | `answer()` | No relevant chunk means `NOT_FOUND` with `found: false`, and no chat model call. The "I don't know" decision is made by similarity, not by the model. |
| Grounded answer | `answer()` | Numbered excerpts plus the question go to the chat model at temperature 0.1. |
| Sources | `answer()` | `"<chapter> — <section>"` labels, de-duplicated, returned in `sources`. |

---

## 6. Store the knowledge: `backend/ingest.py`

Splits each file, embeds the chunks and writes them to Chroma. It is incremental: it stores
each file's SHA-256 hash, skips unchanged files, re-embeds changed ones and removes chunks
for deleted files.

```python
"""Load the files in knowledge/ into the Chroma store.

Run again after adding, editing or removing files. Unchanged files are skipped.
    .venv/bin/python ingest.py
"""
import hashlib
import re
import sys
from pathlib import Path
from typing import Dict, List

from app import config, rag

MAX_CHARS = 1500
EXTENSIONS = {".txt", ".md"}
SECTION_BREAK = re.compile(r"^\s*_{3,}\s*$", re.MULTILINE)


def split_sections(text: str) -> List[Dict]:
    """Split on the ____ divider lines; the first line of each section is its heading."""
    sections = []
    for block in SECTION_BREAK.split(text):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        if len(lines) > 1 and len(lines[0]) <= 120:
            sections.append({"heading": lines[0], "lines": lines[1:]})
        else:
            sections.append({"heading": "", "lines": lines})
    return sections


def pack(lines: List[str]) -> List[str]:
    """Group consecutive paragraphs into pieces of at most MAX_CHARS."""
    pieces, current = [], ""
    for line in lines:
        while len(line) > MAX_CHARS:
            cut = line.rfind(" ", 0, MAX_CHARS)
            cut = cut if cut > 0 else MAX_CHARS
            head, line = line[:cut], line[cut:].strip()
            if current:
                pieces.append(current)
                current = ""
            pieces.append(head)
        if current and len(current) + len(line) + 1 > MAX_CHARS:
            pieces.append(current)
            current = ""
        current = current + "\n" + line if current else line
    if current:
        pieces.append(current)
    return pieces


def chunk_file(path: Path, file_hash: str) -> List[Dict]:
    relative = path.relative_to(config.KNOWLEDGE_DIR)
    source = relative.as_posix()
    chapter = path.name.split(".docx")[0] if ".docx" in path.name else path.stem
    folders = relative.parts[:-1]
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")

    chunks = []
    for section in split_sections(text):
        heading = section["heading"] or chapter
        for piece in pack(section["lines"]):
            chunks.append(
                {
                    "id": "{}::{}".format(source, len(chunks)),
                    # The heading is embedded with the body so each chunk keeps its context.
                    "text": "{} / {} — {}\n{}".format(" / ".join(folders), chapter, heading, piece),
                    "meta": {
                        "source": source,
                        "hash": file_hash,
                        "course": folders[0] if folders else "",
                        "chapter": chapter,
                        "section": heading,
                    },
                }
            )
    return chunks


def main(dry_run: bool) -> None:
    files = sorted(
        p for p in config.KNOWLEDGE_DIR.rglob("*") if p.is_file() and p.suffix.lower() in EXTENSIONS
    )
    if not files:
        sys.exit("No .txt or .md files found in {}".format(config.KNOWLEDGE_DIR))

    if dry_run:
        for path in files:
            chunks = chunk_file(path, "")
            sizes = [len(c["text"]) for c in chunks]
            print("{}: {} chunks, {}-{} chars".format(path.name, len(chunks), min(sizes), max(sizes)))
        return

    collection = rag.collection()
    stored = {}
    for meta in collection.get(include=["metadatas"])["metadatas"]:
        stored[meta["source"]] = meta["hash"]

    current = set()
    for path in files:
        source = path.relative_to(config.KNOWLEDGE_DIR).as_posix()
        current.add(source)
        file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if stored.get(source) == file_hash:
            print("unchanged  {}".format(source))
            continue
        chunks = chunk_file(path, file_hash)
        vectors = rag.embed([c["text"] for c in chunks])
        if source in stored:
            collection.delete(where={"source": source})
        collection.add(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[c["meta"] for c in chunks],
            embeddings=vectors,
        )
        print("ingested   {} ({} chunks)".format(source, len(chunks)))

    for source in set(stored) - current:
        collection.delete(where={"source": source})
        print("removed    {}".format(source))

    print("Done. {} chunks in the store.".format(collection.count()))


if __name__ == "__main__":
    try:
        main(dry_run="--dry-run" in sys.argv)
    except rag.MissingKeyError as error:
        sys.exit(str(error))
```

`chunk_file` strips `.docx` from file names like `Chapter 3.1.docx.txt` (files exported from
Word). Plain file names work as they are.

Run it from `backend/`:

```bash
.venv/bin/python ingest.py --dry-run   # chunk counts and sizes per file, no API calls, free
.venv/bin/python ingest.py             # embeds and stores; prints ingested / unchanged / removed
```

**Check:**
- `--dry-run` lists every file, and the maximum chunk size is about 1,500 characters plus the header.
- The real run ends with `Done. N chunks in the store.`, and N is more than 0.
- Running it a second time prints `unchanged` for every file.

---

## 7. The API: `backend/app/main.py`

The website and the backend run on **different origins**, so the API must allow CORS for the
site's origin. Without it, the browser blocks every request.

```python
from typing import List, Literal

import openai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, rag

app = FastAPI(title="Chat Coach")

# The website is served from another origin, so the browser needs CORS to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[Message] = []


@app.post("/api/chat")
def chat(request: ChatRequest):
    history = [{"role": m.role, "content": m.content} for m in request.history]
    try:
        return rag.answer(request.message.strip(), history)
    except (rag.MissingKeyError, rag.EmptyStoreError) as error:
        raise HTTPException(status_code=500, detail=str(error))
    except openai.OpenAIError as error:
        raise HTTPException(status_code=502, detail="OpenAI request failed: {}".format(error))
```

**Change for the new site:** set `ALLOWED_ORIGINS` in `backend/.env` to the site's real
origin(s), comma-separated. The default covers local testing (step 10).

API contract:

```json
// POST /api/chat, request
{ "message": "How do I reset my password?", "history": [{ "role": "user", "content": "…" }] }

// response
{ "answer": "…", "sources": ["Chapter 1 — Resetting your password"], "found": true }
```

Errors: `500` when the API key is missing or the store is empty, `502` when OpenAI fails,
`422` when the request is invalid (empty message, message over 2,000 characters).

Start it from `backend/`:

```bash
.venv/bin/uvicorn app.main:app --port 8000
```

**Check** (in another terminal):

```bash
# A question the knowledge answers: expect "found": true and a non-empty "sources"
curl -s -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"<a question taken from the knowledge files>","history":[]}'

# A question it does not cover: expect "found": false and the NOT_FOUND text
curl -s -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the capital of Peru?","history":[]}'
```

---

## 8. The Rive avatar

The avatar is a Rive animation. The page sets one number on the file's view model, and the
state machine in the file does the rest.

### Contract the `.riv` file must follow

| Item | Value in the reference file |
|------|-----------------------------|
| Artboard | `Chibi Face` |
| State machine | `State Machine 1` |
| View model | `Face`, bound automatically (`autoBind: true`) |
| Property | `expression`, a **number** |

### Expressions

| Value | Name | When it shows | How it ends |
|-------|------|---------------|-------------|
| `0` | Neutral | At load, and after a successful answer. The only resting state. | — |
| `1` | Confuse | Defined but not triggered. Reserved. | — |
| `2` | Thinking | From sending a question until the reply arrives. Also adds a shine to the avatar background. | Replaced by Neutral or Sad. |
| `3` | Happy | On the header avatar when the chat window opens (a greeting). | After 5 s, back to what the conversation calls for. |
| `4` | Sad | The answer was not found (`found: false`), or the request failed. | Back to Neutral after 6 s. |

```
 chat opens ──► Happy (5 s) ──► Neutral
 user sends ──► Thinking
 reply lands ─┬─ found: true  ──► Neutral
              ├─ found: false ──► Sad (6 s) ──► Neutral
              └─ error        ──► Sad (6 s) ──► Neutral
```

### Set it up

1. Copy the user's `.riv` file to `coach/avatar.riv`. To reuse the Academy Coach avatar,
   copy `avatar/soma.riv` from that repo.
2. If the file uses different names, change `AVATAR_ARTBOARD` and `AVATAR_STATE_MACHINE` in
   `chat.js` (step 9). If the property is not called `expression`, change
   `instance.number("expression")`.
3. If the file has a different set of faces, change the `EXPRESSION` map in `chat.js` to
   match its values.

Two copies of the avatar run at once: one in the chat header and one in the minimised
launcher button. `chat.js` keeps them in sync.

If the property is missing, the browser console shows `Avatar: no 'expression' property
found.` The chat still works, but the face does not change.

---

## 9. The chat widget

Three files in `coach/` plus a block of markup pasted into each page that shows the chat.

### 9a. `coach/chat.css`

All selectors are scoped to the widget (`.chat…`, `.avatar…`, `.message…`, `.is-thinking`),
so the file does not restyle the host site.

```css
:root {
  --accent: #ffd894;
  --accent-2: #a8dfb8;
  --accent-strong: #ffd894;
  --accent-strong-2: #8fd0a4;
  --avatar-bg: #bf58ca;
  --avatar-bg-2: #ebeecc;
  /* Thinking shine: the darker band edge. Raise the 40% for a stronger shine, lower it for a softer one. */
  --avatar-bg-deep: color-mix(in srgb, var(--avatar-bg), #9aa23c 40%);
  --text: #111111;
  --muted: #4d5a52;
  --border: rgba(255, 255, 255, 0.65);
  --divider: rgba(0, 0, 0, 0.08);
  --glass: rgba(255, 255, 255, 0.42);
  --user-bubble: #ffd894;
  /* Open height of the chat window. The avatar overhangs its top edge, so keep
     room above it (about 110px) in the viewport. */
  --chat-h: min(780px, calc(100vh - 110px));
  --chat-bg: rgba(246, 242, 242, 0.49);
}

/* Scoped to the widget so the host page's own layout is left alone. */
.chat,
.chat *,
.chat-dock,
.chat-dock * {
  box-sizing: border-box;
}

.chat,
.chat-dock {
  z-index: 1000;
  color: var(--text);
}

/* Avatar in a circle (chat header and minimised launcher) */

.avatar {
  position: relative;
  flex: none;
  border-radius: 50%;
  border: 5px solid rgba(255, 255, 255, 0.92);
  background: var(--avatar-bg);
  overflow: hidden;
}

/* Soma's head fills ~82% of the canvas width, so a canvas just under the
   circle's size leaves the head at about 80% of the circle, with margin
   around it so the head shape stays visible. Change width/height to resize
   the head; keep left/top at half of (100% - width) to keep it centred. */
.avatar-canvas {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 2%;
  top: 5%;
}

/* Half of the header avatar (52px of 104px) sits inside the window, half
   overhangs its top edge. */
.avatar-header {
  position: absolute;
  z-index: 2;
  top: -53px;
  left: 50%;
  margin-left: -52px;
  width: 104px;
  height: 104px;
  box-shadow: 0 6px 16px rgba(40, 80, 50, 0.2);
}

/* Floating window: frosted glass that opens upward from the corner */

.chat {
  position: fixed;
  left: 24px;
  bottom: 24px;
  width: 400px;
  max-width: calc(100vw - 32px);
  height: var(--chat-h);
  background: var(--chat-bg);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--border);
  border-radius: 26px;
  box-shadow: 0 18px 44px rgba(40, 60, 50, 0.16);
  transition: height 0.5s cubic-bezier(0.22, 0.9, 0.28, 1), opacity 0.3s ease, visibility 0s;
}

.chat.is-closed {
  height: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  box-shadow: none;
  border-color: transparent;
  transition: height 0.32s cubic-bezier(0.5, 0, 0.75, 0.3), opacity 0.25s ease, visibility 0s 0.32s;
}

/* The clip hides the content while the window is short; the avatar sits outside it. */
.chat-clip {
  height: 100%;
  overflow: hidden;
  border-radius: 25px;
}

/* The content keeps its full size while the window grows around it. */
.chat-inner {
  height: calc(var(--chat-h) - 2px);
  display: flex;
  flex-direction: column;
}

.chat-header {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 66px 20px 14px;
}

.chat-title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.chat-subtitle {
  margin-top: 2px;
  font-size: 13px;
  color: var(--muted);
}

.chat-close {
  position: absolute;
  top: 14px;
  right: 16px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  color: var(--text);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.chat-messages.scrolling {
  scrollbar-color: rgba(0, 0, 0, 0.3) transparent;
}

.message {
  max-width: 86%;
  padding: 10px 14px;
  border-radius: 20px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message.user {
  align-self: flex-end;
  background: var(--user-bubble);
  border-bottom-right-radius: 6px;
}

.message.assistant {
  align-self: flex-start;
  background: #fff;
  border: 1.5px solid var(--avatar-bg);
  box-shadow: 0 1px 4px rgba(40, 60, 50, 0.08);
  border-bottom-left-radius: 6px;
}

.message.error {
  align-self: flex-start;
  background: rgba(253, 236, 236, 0.95);
  border-bottom-left-radius: 6px;
}

.message.pending {
  color: var(--muted);
  font-style: italic;
  /* Shiny outline: the border is a wide gradient that slides past, showing
     through a transparent border around the white bubble. */
  border: 2px solid transparent;
  background:
    linear-gradient(#fff, #fff) padding-box,
    linear-gradient(110deg, var(--avatar-bg) 30%, var(--avatar-bg-deep) 45%, #f9f3be 50%, var(--avatar-bg-deep) 55%, var(--avatar-bg) 70%) border-box;
  background-size: 100% 100%, 300% 100%;
  background-position: 0 0, 100% 0;
  animation: shine-border 1.8s linear infinite;
}

/* While the coach is thinking, a band of light sweeps across the avatar's
   background (chat.js sets .is-thinking on <body>). */
.is-thinking .avatar {
  background: linear-gradient(110deg, var(--avatar-bg) 30%, var(--avatar-bg-deep) 44%, #f9f3be 50%, var(--avatar-bg-deep) 56%, var(--avatar-bg) 70%);
  background-size: 300% 100%;
  background-position: 100% 0;
  animation: shine 1.8s linear infinite;
}

@keyframes shine {
  to { background-position: 0% 0; }
}

@keyframes shine-border {
  to { background-position: 0 0, 0% 0; }
}

.chat-form {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 12px 16px 16px;
}

.chat-form textarea {
  flex: 1;
  resize: none;
  max-height: 120px;
  padding: 12px 18px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}

/* No scrollbar in the box; it still scrolls once it reaches its maximum height. */
.chat-form textarea {
  scrollbar-width: none;
}

.chat-form textarea::-webkit-scrollbar {
  display: none;
}

.chat-form textarea:focus {
  outline: 2px solid var(--accent-strong);
  outline-offset: -1px;
}

.chat-form button {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: var(--text);
  cursor: pointer;
}

.chat-form button:hover {
  background: var(--accent-strong);
}

.chat-form button:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Minimised: the avatar circle (with a small label) replaces the chat window */

.chat-dock {
  position: fixed;
  left: 24px;
  bottom: 24px;
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: opacity 0.25s ease 0.15s, transform 0.25s ease 0.15s, visibility 0s;
}

.chat-dock.is-hidden {
  opacity: 0;
  transform: scale(0.9);
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease, visibility 0s 0.2s;
}

.chat-tip {
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(40, 60, 50, 0.12);
}

.chat-launcher {
  width: 96px;
  height: 96px;
  padding: 0;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(40, 60, 50, 0.25);
  transition: transform 0.15s ease;
}

.chat-launcher:hover {
  transform: scale(1.06);
}

.chat-launcher:focus-visible {
  outline: 3px solid var(--accent-strong);
  outline-offset: 3px;
}

@media (max-width: 480px) {
  :root {
    --chat-h: min(780px, calc(100vh - 92px));
  }

  .chat,
  .chat-dock {
    left: 16px;
    bottom: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat,
  .chat.is-closed,
  .chat-dock,
  .chat-dock.is-hidden {
    transition: none;
  }

  .message.pending,
  .is-thinking .avatar {
    animation: none;
  }
}
```

To change the look:
- Colours are the custom properties at the top (`--avatar-bg` is the avatar circle,
  `--accent` the send button, `--user-bubble` the user's messages).
- The widget sits in the **bottom-left**. To move it to the bottom-right, change `left` to
  `right` in `.chat`, `.chat-dock` and the `@media (max-width: 480px)` block.
- `--chat-h` is the open height. The header avatar overhangs the window's top edge, so leave
  about 110px above it.

### 9b. `coach/chat.js`

```javascript
// Backend URL, no trailing slash. Local testing: http://127.0.0.1:8000
const API_BASE = "http://127.0.0.1:8000";

const chat = document.getElementById("chat");
const dock = document.getElementById("chat-dock");
const launcher = document.getElementById("chat-launcher");
const closeButton = document.getElementById("chat-close");
const messages = document.getElementById("chat-messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendButton = document.getElementById("chat-send");

const history = [];

const AVATAR_SRC = "coach/avatar.riv";
const AVATAR_ARTBOARD = "Chibi Face";
const AVATAR_STATE_MACHINE = "State Machine 1";
const avatars = [];
// Values of the "expression" number in the Rive file's Face view model.
const EXPRESSION = { neutral: 0, confuse: 1, thinking: 2, happy: 3, sad: 4 };
const SAD_RESET_MS = 6000;
const GREET_MS = 5000;
let resetTimer;
let greetTimer;
// What the conversation currently calls for (Neutral / Thinking / Sad).
let flowExpression = EXPRESSION.neutral;

function setAvatarExpression(avatar, value) {
  if (!avatar) return;
  avatar.value = value;
  if (avatar.expression) avatar.expression.value = value;
}

function setExpression(value) {
  clearTimeout(resetTimer);
  clearTimeout(greetTimer);
  flowExpression = value;
  // Drives the shine on the avatar background (see .is-thinking in style.css).
  document.body.classList.toggle("is-thinking", value === EXPRESSION.thinking);
  avatars.forEach((avatar) => setAvatarExpression(avatar, value));
  // Sad is a reaction, not a resting state: go back to Neutral after a while.
  if (value === EXPRESSION.sad) {
    resetTimer = setTimeout(() => setExpression(EXPRESSION.neutral), SAD_RESET_MS);
  }
}

function headerAvatar() {
  return avatars.find((avatar) => avatar.isHeader);
}

// Opening the chat: the header avatar is Happy for a few seconds, then settles
// back to whatever the conversation calls for (Neutral at the start).
function greet() {
  clearTimeout(greetTimer);
  setAvatarExpression(headerAvatar(), EXPRESSION.happy);
  greetTimer = setTimeout(() => setAvatarExpression(headerAvatar(), flowExpression), GREET_MS);
}

function endGreeting() {
  clearTimeout(greetTimer);
  setAvatarExpression(headerAvatar(), flowExpression);
}

// One Rive instance per canvas: the header avatar and the minimised launcher.
function loadAvatars() {
  if (!window.rive) return;
  document.querySelectorAll(".avatar-canvas").forEach((canvas) => {
    const avatar = {
      canvas: canvas,
      isHeader: !!canvas.closest(".avatar-header"),
      expression: null,
      value: flowExpression,
    };
    avatar.rive = new rive.Rive({
      src: AVATAR_SRC,
      canvas: canvas,
      artboard: AVATAR_ARTBOARD,
      stateMachines: AVATAR_STATE_MACHINE,
      autoplay: true,
      autoBind: true,
      onLoad: () => {
        const instance = avatar.rive.viewModelInstance;
        avatar.expression = instance ? instance.number("expression") : null;
        if (avatar.expression) avatar.expression.value = avatar.value;
        else console.warn("Avatar: no 'expression' property found.");
      },
    });
    avatars.push(avatar);
  });
}

// The scrollbar stays hidden until the user scrolls, then fades out again.
let scrollTimer;
messages.addEventListener("scroll", () => {
  messages.classList.add("scrolling");
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => messages.classList.remove("scrolling"), 800);
});

// The window grows upward from the corner (see .chat in style.css); the
// launcher fades out while it is open.
function setOpen(open) {
  chat.classList.toggle("is-closed", !open);
  dock.classList.toggle("is-hidden", open);
  launcher.setAttribute("aria-expanded", String(open));
  if (open) {
    greet();
    input.focus();
  } else {
    endGreeting();
  }
}

// Show a long answer from its first line instead of jumping to its end.
function scrollToTopOf(bubble) {
  const offset = bubble.getBoundingClientRect().top - messages.getBoundingClientRect().top;
  const padding = parseFloat(getComputedStyle(messages).paddingTop) || 0;
  messages.scrollTo({ top: messages.scrollTop + offset - padding, behavior: "smooth" });
}

// align "top": scroll so the new bubble starts at the top of the list.
// Otherwise the list follows the conversation to the bottom.
function addMessage(kind, text, align) {
  const bubble = document.createElement("div");
  bubble.className = "message " + kind;
  bubble.textContent = text;
  messages.appendChild(bubble);
  if (align === "top") scrollToTopOf(bubble);
  else messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function send(question) {
  addMessage("user", question);
  const pending = addMessage("assistant pending", "Thinking…");
  sendButton.disabled = true;
  setExpression(EXPRESSION.thinking);

  try {
    const response = await fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question, history: history }),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "Request failed.";
      throw new Error(detail);
    }
    pending.remove();
    addMessage("assistant", data.answer, "top");
    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: data.answer });
    // found === false: the course material had nothing relevant to answer from.
    setExpression(data.found === false ? EXPRESSION.sad : EXPRESSION.neutral);
  } catch (error) {
    pending.remove();
    addMessage("error", error.message || "Something went wrong.");
    setExpression(EXPRESSION.sad);
  } finally {
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || sendButton.disabled) return;
  input.value = "";
  input.style.height = "auto";
  send(question);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

// Grow the box with its text. scrollHeight leaves out the border, which the
// border-box height includes, so add it back or the text always overflows by
// a few pixels and a scrollbar appears.
input.addEventListener("input", () => {
  input.style.height = "auto";
  const border = input.offsetHeight - input.clientHeight;
  input.style.height = input.scrollHeight + border + "px";
});

dock.addEventListener("click", () => setOpen(true));
closeButton.addEventListener("click", () => setOpen(false));

loadAvatars();
addMessage("assistant", "Hi! Ask me anything about your course material.");
// Open shortly after load so the opening animation is seen.
setTimeout(() => setOpen(true), 300);
```

**Change for the new site:**

| Value | Set to |
|-------|--------|
| `API_BASE` | The backend's URL with no trailing slash. `http://127.0.0.1:8000` for local testing, the hosted URL after step 11. |
| `AVATAR_SRC` | The path the page uses to reach `coach/avatar.riv`, relative to the page. |
| Greeting text (`addMessage("assistant", "Hi! …")`, near the end) | A greeting that fits the new site. |
| Auto-open (`setTimeout(() => setOpen(true), 300)`, last line) | Keep it to open the window on page load, or remove it to start minimised. |

Load this file with `type="module"` (step 9c). A module has its own scope, so its top-level
names (`chat`, `history`, `input`, `messages`, …) cannot clash with the site's own scripts.

### 9c. Markup for each page

Paste this just before `</body>` in every page that should show the chat. Change the title,
subtitle, placeholder and tip text to fit the new site.

```html
<link rel="stylesheet" href="coach/chat.css">  <!-- or in <head> -->

<!-- The window starts closed; chat.js opens it (it grows upward from the corner). -->
<section class="chat is-closed" id="chat" aria-label="Chat assistant">
  <!-- Outside the clipped area so it can overhang the top edge of the window -->
  <div class="avatar avatar-header">
    <canvas class="avatar-canvas" width="360" height="360" aria-hidden="true"></canvas>
  </div>

  <div class="chat-clip">
    <div class="chat-inner">
      <header class="chat-header">
        <div class="chat-title">Academy Coach</div>
        <div class="chat-subtitle">Answers from your course material</div>
        <button class="chat-close" id="chat-close" type="button" aria-label="Close chat">&times;</button>
      </header>

      <div class="chat-messages" id="chat-messages" aria-live="polite"></div>

      <form class="chat-form" id="chat-form">
        <textarea id="chat-input" rows="1" placeholder="Ask about the course…" maxlength="2000" required></textarea>
        <button id="chat-send" type="submit" aria-label="Send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </form>
    </div>
  </div>
</section>

<!-- Minimised: shown while the chat window is closed -->
<div class="chat-dock is-hidden" id="chat-dock">
  <span class="chat-tip">Ask your coach</span>
  <button class="chat-launcher avatar" id="chat-launcher" type="button" aria-label="Open chat" aria-controls="chat" aria-expanded="false">
    <canvas class="avatar-canvas" width="360" height="360" aria-hidden="true"></canvas>
  </button>
</div>

<script src="https://unpkg.com/@rive-app/canvas@2.44.0/rive.js"></script>
<script type="module" src="coach/chat.js"></script>
```

Rules:
- Keep the `id`s and class names. `chat.js` and `chat.css` depend on them.
- Keep the scripts in this order and after the markup: `rive.js` defines `window.rive`, and
  `chat.js` looks up the elements as soon as it runs.
- The widget uses the host page's font. For the reference look, also load Poppins in `<head>`
  and set `font-family: "Poppins", sans-serif;` on `.chat, .chat-dock` in `chat.css`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## 10. Test the whole system locally

Use two terminals.

```bash
# Terminal 1: the backend, from backend/
.venv/bin/uvicorn app.main:app --port 8000

# Terminal 2: the website, from the folder that holds index.html
python3 -m http.server 5500
```

Open `http://localhost:5500`. Do not open the HTML file directly (`file://`): module scripts
and the `.riv` file do not load that way. Port 5500 matches the default `ALLOWED_ORIGINS`.

Checklist:

| # | Do | Expect |
|---|----|--------|
| 1 | Load the page | The window opens from the bottom-left corner. The header avatar is Happy, then Neutral after 5 s. |
| 2 | Open the browser dev tools console and network tab | No CORS error. `avatar.riv` loads (a 404 means `AVATAR_SRC` is wrong). |
| 3 | Ask something only the knowledge covers | "Thinking…" bubble with a shine, avatar Thinking. Then an answer, and the avatar goes back to Neutral. |
| 4 | Ask a follow-up such as "why?" | The answer stays on the same topic. |
| 5 | Ask something unrelated ("What is the capital of Peru?") | The not-found reply. Avatar Sad for 6 s, then Neutral. |
| 6 | Stop the backend and ask again | A red error bubble, avatar Sad. |
| 7 | Close and reopen the window | The minimised launcher appears with its tip. Reopening greets again. |
| 8 | Shrink the window to phone width (about 375px) | The window fits on screen, with no horizontal scroll. |
| 9 | Press Enter, then Shift+Enter | Enter sends. Shift+Enter adds a new line, and the box grows. |

**Tuning:** if the assistant says it can't find things that are in the knowledge, lower
`MIN_SIMILARITY` (try `0.2`). If it answers off-topic questions, raise it (try `0.3`).
Restart the backend after changing `.env`.

---

## 11. Deploy

The website stays on its current static hosting. Only the backend needs a server.

### Backend

Any host that runs a Python process works (Render, Railway, Fly.io, a small VM). Using Render
as the example:

1. Create a **Web Service** from the repo, with root directory `backend`.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables: `OPENAI_API_KEY`, and `ALLOWED_ORIGINS` set to the site's origin
   (for example `https://www.example.com`).
5. **The vector store.** `chroma_db/` is a folder on disk. Free hosts usually wipe the disk on
   every deploy, and the API then answers `500` ("The knowledge base is empty"). Choose one:
   - Run ingest as part of the build: `pip install -r requirements.txt && python ingest.py`.
     It needs `OPENAI_API_KEY` available at build time, and re-embeds on every deploy. For a
     small knowledge folder this costs very little.
   - Or attach a persistent disk and mount it at `backend/chroma_db`.

The host gives you a URL such as `https://your-app.onrender.com`. That is the backend's
address. No custom domain is needed.

### Website

1. Set `API_BASE` in `coach/chat.js` to the backend URL.
2. Deploy the site as usual.
3. Repeat the checklist in step 10 on the live site.

Both must be HTTPS. A page on HTTPS cannot call an `http://` API.

### Before going public

Every question costs OpenAI credits, and the endpoint is open to anyone.

- **Rate limit** by IP, for example with `slowapi` on the backend, or at the host or CDN.
- **Restrict `ALLOWED_ORIGINS`** to the real site. CORS only stops other websites' browsers,
  not scripts, so it does not replace rate limiting.
- **Set a monthly spend limit** on the OpenAI key in the OpenAI dashboard.
- Requests are already capped at 2,000 characters per message and 8,000 per history entry.
  History comes from the browser and is not verified, so treat it as untrusted.

---

## 12. Maintenance

| Task | How |
|------|-----|
| Add, edit or remove knowledge | Change files in `backend/knowledge/`, run `python ingest.py`, restart the backend. |
| Update after editing a site page | Run `python extract_pages.py` (rewrites the `Page - *.txt` files from `../*.html`), then `python ingest.py`, restart the backend. |
| Start the store over | Delete `backend/chroma_db/` and run `python ingest.py`. |
| Change the chat model | Set `CHAT_MODEL` in `.env`, restart. No re-ingest needed. |
| Change the embedding model | Set `EMBEDDING_MODEL`, delete `chroma_db/`, re-ingest, restart. |
| Show sources in the UI | They already come back in `sources`. Render them under the answer in `send()` in `chat.js`. |

## 13. Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| CORS error in the console | The page's origin is not in `ALLOWED_ORIGINS`, or it differs by port or `www`. |
| `500` "OPENAI_API_KEY is not set" | Missing `.env`, or the host's environment variable is not set. |
| `500` "The knowledge base is empty" | Ingest has not run on this machine or host, or the disk was wiped. |
| `502` "OpenAI request failed" | Invalid key, no credit, or a wrong model name. |
| Always "couldn't find that" | `MIN_SIMILARITY` too high, the knowledge doesn't cover it, or the store was built with a different embedding model. |
| Avatar circle is empty | Wrong `AVATAR_SRC`, `rive.js` not loaded before `chat.js`, or the page opened via `file://`. |
| Avatar shows but never changes face | Artboard, state machine or `expression` name differs from the `.riv` file. |
| `chat.js` errors that an element is null | The markup is missing, or `chat.js` loads before it. |

## 14. Limits

- It answers only from the ingested knowledge. Off-topic questions get the not-found reply by design.
- Retrieval works by meaning, so a very short or vague question may retrieve poorly. Rephrasing helps.
- Answers are plain text, as the system prompt requires.
- Conversation history lives in the browser tab. Refreshing starts a new conversation.
