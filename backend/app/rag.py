"""Retrieval and grounded answering over the Chroma knowledge store."""
from typing import Dict, List

import chromadb
from openai import OpenAI

from . import config

SYSTEM_PROMPT = """You are Soma's portfolio assistant on somawiraga.com. Visitors ask you about
Soma Wiraga, an AI Product Designer: his experience, projects, talks, patent and way of working.

Rules:
- Answer ONLY with information found in the excerpts given in the user message.
- Do not use outside knowledge, and do not guess or fill gaps.
- If the excerpts do not contain the answer, say that the material Soma has shared does not cover it.
- If the excerpts only partly answer the question, answer that part and say what is not covered.
- Refer to Soma in the third person ("Soma", "he"). You are his assistant, not Soma himself.
- Write in plain text without markdown. Be clear, friendly and concise."""

NOT_FOUND = (
    "I couldn't find that in the material Soma has shared with me. "
    "Try rephrasing, or ask about his experience, projects, talks or patent."
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
            "content": "Excerpts about Soma:\n\n{}\n\nQuestion: {}".format(excerpts, question),
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
