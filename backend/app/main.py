from typing import List, Literal

import openai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, rag

app = FastAPI(title="Soma Portfolio Assistant")

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
