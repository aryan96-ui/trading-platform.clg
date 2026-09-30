# ------------------------------------------------------------
# FastAPI + Ollama proxy
# ------------------------------------------------------------
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import ollama
import os
import json
import asyncio
import uuid
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="ProTrader Chatbot API",
    description="Proxy to the local Ollama model (llama3).",
    version="1.0.0",
)

# ---- CORS (adjust allowed origins to your website domain) ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Configuration ------------------------------------------------
MODEL = os.getenv("OLLAMA_MODEL", "llama3:latest")
MAX_TURNS = int(os.getenv("MAX_CONVERSATION_LENGTH", "10"))
PORT = int(os.getenv("PORT", "3001"))

# ---- A tiny in‑memory store for per‑user history (demo only) ----
# In production replace with Redis / DB / JWT‑encoded token
_user_histories: dict[str, list[dict]] = {}

def get_history(session_id: str) -> list[dict]:
    return _user_histories.setdefault(session_id, [])

def trim_history(hist: list[dict]) -> None:
    """Keep only the last MAX_TURNS exchanges (2 * MAX_TURNS messages)."""
    if len(hist) > 2 * MAX_TURNS:
        # keep system prompt (if any) + last N exchanges
        system = [msg for msg in hist if msg["role"] == "system"]
        last = hist[-2 * MAX_TURNS:]
        hist[:] = system + last

# ------------------------------------------------------------
# Helper to produce a system prompt that steers the model
# ------------------------------------------------------------
SYSTEM_PROMPT = """
You are **ProTraderBot**, a professional financial trading assistant for the ProTrader platform.

Your capabilities include:
- Market analysis and insights
- Trading strategies and risk management
- Portfolio optimization advice
- Technical indicator explanations (RSI, MACD, Bollinger Bands, etc.)
- Financial news interpretation
- Chart pattern recognition

Guidelines:
- Be concise and professional; keep replies under 150 tokens when possible
- Provide informative responses, NOT personalized investment advice
- Always remind users that you provide information for educational purposes, not financial advice
- If a question is out of scope or you're unsure, reply: "I'm sorry, I can't help with that."
- Use clear, plain English
- Focus on helping users understand trading concepts and platform features

Remember: You are an educational assistant, not a financial advisor.
"""

# ------------------------------------------------------------
# API: GET /health - Health check endpoint
# ------------------------------------------------------------
@app.get("/health")
async def health_check():
    return JSONResponse(
        content={
            "status": "ok",
            "timestamp": str(asyncio.get_event_loop().time()),
            "model": MODEL,
        }
    )

# ------------------------------------------------------------
# API: POST /api/chat
# Request body:
# {
#   "session_id": "optional‑uuid",   # if omitted a new one is created
#   "message": "User text"
# }
# ------------------------------------------------------------
@app.post("/api/chat")
async def chat(request: Request):
    payload = await request.json()
    user_msg = payload.get("message")
    if not user_msg:
        raise HTTPException(status_code=422, detail="`message` field required")

    # Session handling – generate if client didn't send one
    session_id = payload.get("session_id") or str(uuid.uuid4())
    hist = get_history(session_id)

    # Initialise with system prompt on first use
    if not any(m["role"] == "system" for m in hist):
        hist.append({"role": "system", "content": SYSTEM_PROMPT.strip()})

    # Append user message
    hist.append({"role": "user", "content": user_msg})
    trim_history(hist)

    # Call Ollama (non‑streaming – fast & simple)
    try:
        resp = ollama.chat(
            model=MODEL,
            messages=hist,
            stream=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ollama error: {str(exc)}")

    # Ollama returns {"message": {"role":"assistant","content":"..."}}
    assistant_msg = resp.get("message", {})
    answer = assistant_msg.get("content", "").strip()

    # Append assistant reply for the next turn
    hist.append({"role": "assistant", "content": answer})
    trim_history(hist)

    return JSONResponse(
        content={
            "session_id": session_id,
            "reply": answer,
            "conversationId": session_id,  # For compatibility with frontend
        }
    )

# ------------------------------------------------------------
# (Optional) Streaming endpoint – returns SSE (Server Sent Events)
# Useful if you want token‑by‑token UI.
# ------------------------------------------------------------
@app.post("/api/chat/stream")
async def chat_stream(request: Request):
    payload = await request.json()
    user_msg = payload.get("message")
    if not user_msg:
        raise HTTPException(status_code=422, detail="`message` field required")

    session_id = payload.get("session_id") or str(uuid.uuid4())
    hist = get_history(session_id)

    if not any(m["role"] == "system" for m in hist):
        hist.append({"role": "system", "content": SYSTEM_PROMPT.strip()})

    hist.append({"role": "user", "content": user_msg})
    trim_history(hist)

    # Ollama supports streaming via "stream": True
    async def event_generator():
        full_response = ""
        try:
            # Use the ollama library's streaming capability
            stream = ollama.chat(
                model=MODEL,
                messages=hist,
                stream=True,
            )
            
            for chunk in stream:
                text = chunk.get("message", {}).get("content", "")
                if text:
                    full_response += text
                    # Send as SSE data field
                    yield f"data: {json.dumps({'text': text})}\n\n"
            
            # After stream ends, store the assistant reply in history
            hist.append({"role": "assistant", "content": full_response})
            trim_history(hist)
            
            # Send final event with session_id
            yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# ------------------------------------------------------------
# API: DELETE /api/chat/{session_id} - Clear conversation history
# ------------------------------------------------------------
@app.delete("/api/chat/{session_id}")
async def clear_conversation(session_id: str):
    if session_id in _user_histories:
        del _user_histories[session_id]
        return JSONResponse(content={"status": "cleared", "session_id": session_id})
    return JSONResponse(content={"status": "not_found", "session_id": session_id})

# ------------------------------------------------------------
# Run with: uvicorn main:app --host 0.0.0.0 --port 3001 --reload
# ------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
