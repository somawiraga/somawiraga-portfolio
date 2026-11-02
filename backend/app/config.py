import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# Source PDFs live in the repo's data/ folder; convert_pdfs.py turns them into
# text files in knowledge/, which ingest.py embeds.
PDF_DIR = ROOT.parent / "data"
KNOWLEDGE_DIR = ROOT / "knowledge"
CHROMA_DIR = ROOT / "chroma_db"
COLLECTION = "knowledge"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
TOP_K = int(os.getenv("TOP_K", "5"))
MIN_SIMILARITY = float(os.getenv("MIN_SIMILARITY", "0.25"))
# Origins of the website allowed to call the API (comma-separated), e.g.
# https://somawiraga.com,https://www.somawiraga.com
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:5501,http://127.0.0.1:5501",
    ).split(",")
    if origin.strip()
]
