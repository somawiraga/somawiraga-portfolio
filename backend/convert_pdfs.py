"""Turn the PDFs in ../data/ into text files in knowledge/ for ingest.py.

Each PDF page becomes one section, separated by a ____ line, so answers can
point back to a page. Run again after adding or changing a PDF, then run ingest.py.
    .venv/bin/python convert_pdfs.py
"""
import re
import sys
from collections import Counter
from typing import List

from pypdf import PdfReader

from app import config

# Friendlier names for the files the assistant cites. Files not listed keep their own name.
TITLES = {
    "AI in Digital Product Design-v4": "Talk - AI in Digital Product Design",
    "Sharing session - Astra": "Talk - UIUX Lab SRIN sharing session at Astra",
    "Soma_Wiraga_CV_Feb-2026": "Soma Wiraga CV (Feb 2026)",
    "US20220207851A1": "Patent US 2022-0207851 A1 - Automatic video reconstruction (Samsung)",
}

# Pages with less text than this (after cleanup) are skipped, e.g. patent drawing sheets.
MIN_PAGE_CHARS = 60


def clean(line: str) -> str:
    line = re.sub(r"\s+", " ", line).strip()
    # Patent text is extracted as "Pub . No ., 2022 ," — close up the stray spaces.
    # "R&D" comes out as "R&D;".
    line = re.sub(r"&([A-Za-z]{1,3});", r"&\1", line)
    return re.sub(r" ([.,;:)])", r"\1", line)


def page_lines(reader: PdfReader) -> List[List[str]]:
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append([clean(line) for line in text.splitlines() if clean(line)])
    return pages


def drop_running_headers(pages: List[List[str]]) -> List[List[str]]:
    """Remove lines that repeat on most pages (page headers and footers)."""
    if len(pages) < 4:
        return pages
    counts = Counter(line for lines in pages for line in set(lines))
    repeated = {line for line, n in counts.items() if n > len(pages) / 2}
    return [[line for line in lines if line not in repeated] for lines in pages]


def convert(path) -> int:
    pages = drop_running_headers(page_lines(PdfReader(str(path))))
    sections = []
    for number, lines in enumerate(pages, start=1):
        text = " ".join(lines)
        # Skip near-empty pages and patent drawing sheets ("Sheet 3 of 21").
        if len(text) < MIN_PAGE_CHARS or re.search(r"\bSheet \d+ of \d+\b", text):
            continue
        # The first line becomes the section heading in ingest.py; keep the page number in it.
        heading = lines[0] if len(lines[0]) <= 100 else lines[0][:100].rsplit(" ", 1)[0]
        body = lines[1:] if heading == lines[0] else lines
        sections.append("\n".join(["Page {}: {}".format(number, heading)] + body))

    title = TITLES.get(path.stem, path.stem)
    out = config.KNOWLEDGE_DIR / "{}.txt".format(title)
    out.write_text("\n____\n".join(sections) + "\n", encoding="utf-8")
    print("{} -> {} ({} of {} pages)".format(path.name, out.name, len(sections), len(pages)))
    return len(sections)


def main() -> None:
    pdfs = sorted(config.PDF_DIR.glob("*.pdf"))
    if not pdfs:
        sys.exit("No PDFs found in {}".format(config.PDF_DIR))
    config.KNOWLEDGE_DIR.mkdir(exist_ok=True)
    for path in pdfs:
        convert(path)


if __name__ == "__main__":
    main()
