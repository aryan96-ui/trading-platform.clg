# AI Financial Assistant Implementation Plan

## Overview
Build an AI-powered financial assistant chatbot using Ollama (llama3) integrated into the trading platform.

## Architecture

### 1. Backend (Node.js + Express)
- **Proxy Server**: `/api/chat` endpoint that forwards requests to Ollama
- **Conversation Management**: Store chat history in memory/database
- **Token Limit Handling**: Truncate old messages when context gets too long
- **System Prompt**: Financial assistant personality and guidelines
- **Rate Limiting**: Prevent abuse
- **CORS**: Allow frontend to communicate

### 2. Frontend (HTML + Vanilla JS)
- **Chat Widget**: Floating chat button + expandable chat window
- **Message Display**: User messages + AI responses
- **Typing Indicator**: Show when AI is thinking
- **Conversation History**: Persist in localStorage
- **Responsive Design**: Works on mobile and desktop

### 3. Integration
- Add chat widget to existing pages (dashboard, index, etc.)
- Style to match trading platform theme
- Connect to backend API

### 4. Deployment
- Docker Compose setup with:
  - Ollama service
  - Node.js backend
  - Nginx (optional, for production)

## Implementation Steps

### Step 1: Verify Ollama Setup ✓
- [x] Ollama installed
- [x] llama3:latest model available
- [ ] Start Ollama server (User needs to run: `ollama serve`)

### Step 2: Build Backend ✓
- [x] Create `chatbot-backend/` directory
- [x] Initialize Python project
- [x] Install dependencies (fastapi, uvicorn, ollama, etc.)
- [x] Create chat API endpoint (main.py)
- [x] Implement conversation management
- [x] Add financial assistant system prompt
- [x] Add streaming support
- [x] Create startup script (start-chatbot.bat)
- [x] Create README documentation

### Step 3: Build Frontend Widget ✓
- [x] Create `js/chatbot-widget.js`
- [x] Create `css/chatbot-widget.css`
- [x] Build chat UI components
- [x] Implement message sending/receiving
- [x] Add conversation persistence
- [x] Add typing indicators
- [x] Add error handling

### Step 4: Integration ✓
- [x] Add widget to index.html
- [x] Add widget to dashboard-pro.html
- [x] Create comprehensive setup guide
- [ ] Test on all pages (User needs to test)

### Step 5: Deployment (Optional)
- [ ] Docker setup (if needed for production)

## Technical Specifications

### Backend API
```
POST /api/chat
Request: { message: string, conversationId?: string }
Response: { reply: string, conversationId: string }
```

### System Prompt
```
You are a professional financial trading assistant. You help users with:
- Market analysis and insights
- Trading strategies and risk management
- Portfolio optimization
- Technical indicator explanations
- Financial news interpretation

Be concise, accurate, and professional. Always remind users that you provide 
information, not financial advice.
```

### Token Management
- Max context: ~4000 tokens
- Keep last 10 messages
- Summarize older context if needed

### Rate Limiting
- 20 requests per minute per IP
- 100 requests per hour per IP

## File Structure
```
trading-platform.clg/
├── chatbot-backend/
│   ├── package.json
│   ├── server.js
│   ├── routes/
│   │   └── chat.js
│   ├── services/
│   │   └── ollama.js
│   └── middleware/
│       └── rateLimit.js
├── js/
│   └── chatbot-widget.js
├── css/
│   └── chatbot-widget.css
├── docker-compose.yml
└── Dockerfile
```
