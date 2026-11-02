"""Turn the site's pages (../*.html) into text files in knowledge/ for ingest.py.

Each h1/h2 starts a section, separated by a ____ line, so answers can point back
to a part of the page. Navigation, footer, scripts and decorative elements are
left out; image alt text is kept, since some content is only shown in images.
Run again after editing a page, then run ingest.py.
    .venv/bin/python extract_pages.py
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Optional

from app import config

SITE_DIR = config.ROOT.parent

# Friendlier names for the files the assistant cites. Pages not listed use their <title>.
TITLES = {
    "project-ai-education": "Page - Project - AI Education Agent",
    "project-customs-portal": "Page - Project - AI Powered Customs Clearance Portal",
    "process-landing-page": "Page - Process - Landing Page",
    "team-growth": "Page - Team Growth",
}

# Pages left out: the home page only lists and links the other pages.
SKIP_PAGES = {"index"}

# Elements whose whole subtree is left out.
SKIP_TAGS = {"script", "style", "noscript", "svg", "nav", "footer", "template", "video", "audio"}
# Elements that end a line of text.
BLOCK_TAGS = {
    "p", "li", "div", "section", "article", "header", "main", "aside", "figure",
    "figcaption", "blockquote", "dt", "dd", "tr", "td", "th", "h1", "h2", "h3",
    "h4", "h5", "h6", "br", "ul", "ol", "dl", "table",
}
# Headings that start a new section.
SECTION_TAGS = {"h1", "h2"}
# Link labels and similar lines that say nothing about the content.
NOISE = re.compile(r"^(<\s*)?back( to .*)?$", re.IGNORECASE)
# Labels that sit just before a heading ("Chapter 02") and belong to its section.
KICKER = re.compile(r"^chapter \d+$", re.IGNORECASE)
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


class PageText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.sections: List[List[str]] = [[]]
        self.line = ""
        # Open elements, each (tag, hides its subtree).
        self.stack: List[tuple] = []
        self.in_title = False

    @property
    def hidden(self) -> bool:
        return any(hide for _, hide in self.stack)

    def end_line(self) -> None:
        line = clean(self.line)
        self.line = ""
        section = self.sections[-1]
        if line and not NOISE.match(line) and (not section or section[-1] != line):
            section.append(line)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        a = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag in BLOCK_TAGS:
            self.end_line()
        if tag in SECTION_TAGS and not self.hidden:
            section = self.sections[-1]
            kicker = [section.pop()] if section and KICKER.match(section[-1]) else []
            if section:
                self.sections.append(kicker)
            else:
                section.extend(kicker)
        if tag == "img" and not self.hidden and clean(a.get("alt") or "") and a.get("aria-hidden") != "true":
            alt = clean(a["alt"])
            # Arrows and other connectors carry alt text like "leads to".
            if len(alt.split()) > 3:
                self.end_line()
                self.sections[-1].append("Image: " + alt)
        if tag in VOID_TAGS:
            return
        label = clean(a.get("aria-label") or "")
        hide = (
            tag in SKIP_TAGS
            or a.get("aria-hidden") == "true"
            or "page-wash" in (a.get("class") or "")
        )
        # A heading with an aria-label (the animated hero name) reads as its label.
        if label and tag in {"h1", "h2", "h3"} and not self.hidden:
            self.line += " " + label
            hide = True
        self.stack.append((tag, hide))

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False
        if tag in BLOCK_TAGS:
            self.end_line()
        # Pop up to the matching tag; this also closes elements left open (<p>, <li>).
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title += data
        elif not self.hidden:
            self.line += data


def heading_of(lines: List[str]) -> Optional[str]:
    return lines[0] if lines and len(lines[0]) <= 120 else None


def convert(path: Path) -> int:
    parser = PageText()
    parser.feed(path.read_text(encoding="utf-8"))
    parser.close()
    parser.end_line()

    sections = [lines for lines in parser.sections if lines]
    # A heading with nothing under it joins the next section.
    merged: List[List[str]] = []
    for lines in sections:
        if merged and len(merged[-1]) == 1:
            merged[-1] = merged[-1] + lines
        else:
            merged.append(lines)

    page_title = clean(parser.title)
    title = TITLES.get(path.stem, "Page - " + page_title.split("—")[0].strip())
    # The page's own title and address lead the file, so answers can name and link it.
    intro = ["About this page", "Web page: {}".format(page_title), "Address: {}".format(path.name)]
    body = [intro] + merged

    out = config.KNOWLEDGE_DIR / "{}.txt".format(title)
    out.write_text("\n____\n".join("\n".join(lines) for lines in body) + "\n", encoding="utf-8")
    print("{} -> {} ({} sections)".format(path.name, out.name, len(merged)))
    return len(merged)


def main() -> None:
    pages = sorted(p for p in SITE_DIR.glob("*.html") if p.stem not in SKIP_PAGES)
    if not pages:
        sys.exit("No .html pages found in {}".format(SITE_DIR))
    config.KNOWLEDGE_DIR.mkdir(exist_ok=True)
    for path in pages:
        convert(path)


if __name__ == "__main__":
    main()
