# ProTrader AI Chatbot Backend

FastAPI-based chatbot backend powered by Ollama (llama3) for the ProTrader trading platform.

## Features

- ✅ **FastAPI Framework**: Modern, fast, async Python web framework
- ✅ **Ollama Integration**: Local LLM (llama3) for AI responses
- ✅ **Conversation Management**: Session-based chat history
- ✅ **Streaming Support**: Real-time token-by-token responses (optional)
- ✅ **CORS Enabled**: Ready for frontend integration
- ✅ **Rate Limiting**: Built-in protection against abuse
- ✅ **Financial Assistant**: Specialized system prompt for trading assistance

## Prerequisites

1. **Python 3.8+** installed
2. **Ollama** installed and running
3. **llama3 model** downloaded in Ollama

### Install Ollama

**Windows:**
```bash
# Download from https://ollama.ai/download
# Or use winget:
winget install Ollama.Ollama
```

**Mac/Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Download llama3 Model

```bash
ollama pull llama3:latest
```

### Verify Ollama is Running

```bash
ollama list
# Should show llama3:latest
```

## Installation

### Option 1: Quick Start (Windows)

Simply double-click `start-chatbot.bat` - it will:
- Create a virtual environment
- Install dependencies
- Start the server on port 3001

### Option 2: Manual Setup

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --host 0.0.0.0 --port 3001 --reload
```

## Configuration

Edit `.env` file to customize:

```env
PORT=3001
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=llama3:latest
MAX_CONVERSATION_LENGTH=10
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
```

## API Endpoints

### 1. Health Check
```
GET /health
```
Returns server status and configuration.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "1234567890.123",
  "model": "llama3:latest"
}
```

### 2. Chat (Non-Streaming)
```
POST /api/chat
```

**Request:**
```json
{
  "message": "What is RSI indicator?",
  "session_id": "optional-uuid"
}
```

**Response:**
```json
{
  "session_id": "uuid-here",
  "reply": "RSI (Relative Strength Index) is a momentum indicator...",
  "conversationId": "uuid-here"
}
```

### 3. Chat (Streaming)
```
POST /api/chat/stream
```

**Request:** Same as non-streaming

**Response:** Server-Sent Events (SSE)
```
data: {"text": "RSI"}
data: {"text": " is"}
data: {"text": " a"}
...
data: {"done": true, "session_id": "uuid"}
```

### 4. Clear Conversation
```
DELETE /api/chat/{session_id}
```

**Response:**
```json
{
  "status": "cleared",
  "session_id": "uuid-here"
}
```

## System Prompt

The chatbot is configured with a specialized financial assistant prompt:

- Provides market analysis and insights
- Explains trading strategies and risk management
- Helps with portfolio optimization
- Explains technical indicators
- Interprets financial news
- **Always reminds users it provides information, not financial advice**

## Conversation Management

- Sessions are stored in-memory (for demo)
- Each session keeps last 10 message exchanges
- Older messages are automatically trimmed
- For production, replace with Redis/Database

## Frontend Integration

Add to your HTML pages:

```html
<!-- Chatbot CSS -->
<link rel="stylesheet" href="css/chatbot-widget.css">

<!-- Chatbot JS -->
<script src="js/chatbot-widget.js"></script>
```

The widget will automatically:
- Create a floating chat button
- Manage conversation state
- Persist history in localStorage
- Connect to the backend API

## Testing

### Test with cURL

```bash
# Health check
curl http://localhost:3001/health

# Send a message
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is a bull market?"}'
```

### Test in Browser

1. Start the backend: `start-chatbot.bat`
2. Open any HTML page with the chatbot widget
3. Click the chat button and start chatting!

## Troubleshooting

### "Ollama error: Connection refused"
- Make sure Ollama is running: `ollama serve`
- Check if llama3 is downloaded: `ollama list`

### "Port 3001 already in use"
- Change PORT in `.env` file
- Update frontend API URL in `js/chatbot-widget.js`

### "Module not found"
- Activate virtual environment
- Reinstall dependencies: `pip install -r requirements.txt`

## Production Deployment

For production:

1. **Use a proper database** for conversation storage (Redis, PostgreSQL)
2. **Add authentication** (JWT tokens)
3. **Configure CORS** properly in `main.py`
4. **Use environment variables** for sensitive data
5. **Add logging** and monitoring
6. **Deploy with Docker** (see docker-compose.yml)
7. **Use a reverse proxy** (Nginx)
8. **Enable HTTPS**

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────┐
│   Frontend  │─────▶│  FastAPI     │─────▶│ Ollama  │
│   Widget    │◀─────│  Backend     │◀─────│ (llama3)│
└─────────────┘      └──────────────┘      └─────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  In-Memory   │
                     │  Sessions    │
                     └──────────────┘
```

## License

MIT

## Support

For issues or questions, check:
- Ollama docs: https://ollama.ai/docs
- FastAPI docs: https://fastapi.tiangolo.com
