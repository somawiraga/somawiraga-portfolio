"""Load the files in knowledge/ into the Chroma store.

Run again after adding, editing or removing files. Unchanged files are skipped.
    .venv/bin/python convert_pdfs.py   # if the PDFs in ../data changed
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
                    "text": "{} — {}\n{}".format(" / ".join(folders + (chapter,)), heading, piece),
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
        sys.exit("No .txt or .md files found in {}. Run convert_pdfs.py first.".format(config.KNOWLEDGE_DIR))

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
