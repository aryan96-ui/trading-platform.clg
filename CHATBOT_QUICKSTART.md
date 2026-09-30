# 🚀 ProTrader Chatbot - Quick Reference

## ⚡ Start in 30 Seconds

```bash
# Terminal 1
ollama serve

# Terminal 2
cd chatbot-backend
start-nodejs.bat

# Browser
# Open index.html → Click 🤖 button
```

## 📋 Files Created

✅ `chatbot-backend/server.js` - Node.js backend (UPDATED)
✅ `chatbot-backend/main.py` - Python backend  
✅ `js/chatbot-widget.js` - Frontend widget
✅ `css/chatbot-widget.css` - Widget styles
✅ `index.html` - Updated with chatbot
✅ `dashboard-pro.html` - Updated with chatbot

## 🎯 Choose Your Backend

**Node.js (Recommended):**
```bash
cd chatbot-backend
start-nodejs.bat
```

**Python:**
```bash
cd chatbot-backend
start-chatbot.bat
```

## 🎨 Choose Your Widget

**Option 1: Minimal (Quick & Easy):**
- Copy content from `chatbot-widget-minimal.html`
- Paste at bottom of your HTML page
- Done!

**Option 2: Modular (Production):**
- Add to `<head>`: `<link rel="stylesheet" href="css/chatbot-widget.css">`
- Add before `</body>`: `<script src="js/chatbot-widget.js"></script>`
- Done!

See `WIDGET_OPTIONS.md` for detailed comparison.

## 🧪 Test Commands

```bash
# Health check
curl http://localhost:3001/health

# Chat test
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"What is RSI?\"}"
```

## 📚 Documentation

- `CHATBOT_COMPLETE.md` - Full summary
- `CHATBOT_SETUP.md` - Setup guide
- `chatbot-backend/CHOOSE_YOUR_BACKEND.md` - Backend comparison
- `chatbot-backend/README.md` - API docs

## ✅ Success Checklist

- [ ] Ollama installed
- [ ] llama3 downloaded (`ollama pull llama3:latest`)
- [ ] Ollama running (`ollama serve`)
- [ ] Backend running (Node.js or Python)
- [ ] Chat button visible on pages
- [ ] Chat works and responds

## 🎉 Done!

You now have a fully functional AI chatbot integrated into your ProTrader platform!
