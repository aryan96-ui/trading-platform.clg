# 🚀 ProTrader Platform - Complete Startup Guide

## Quick Start (Easiest Method)

### Option 1: One-Click Startup
Simply double-click the `START-PROJECT.bat` file in the project root directory. This will:
- ✅ Start the main trading platform on port 3000
- ✅ Start the AI chatbot backend on port 3001
- ✅ Automatically open your browser to http://localhost:3000

---

## Manual Startup (Step by Step)

If you prefer to start services manually or need to troubleshoot:

### Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js (v18+) installed
- ✅ Python (3.8+) installed
- ✅ MongoDB running (local or Atlas)
- ✅ Ollama installed (for AI chatbot)

### Step 1: Start Main Trading Platform

Open a terminal in the project root directory:

```bash
# Install dependencies (first time only)
npm install

# Start the server
npm start
```

**Expected Output:**
```
Server running on port 3000
MongoDB Connected Successfully
```

**Access at:** http://localhost:3000

---

### Step 2: Start AI Chatbot Backend

Open a **NEW** terminal and navigate to the chatbot directory:

```bash
cd chatbot-backend

# Windows users can use the batch file:
start-chatbot.bat

# OR manually:
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3001 --reload
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:3001
INFO:     Application startup complete
```

**Access at:** http://localhost:3001

---

## 🌐 Available URLs

Once both services are running:

| Service | URL | Description |
|---------|-----|-------------|
| **Landing Page** | http://localhost:3000 | Main entry point |
| **Login/Register** | http://localhost:3000/login.html | User authentication |
| **Trading Dashboard** | http://localhost:3000/dashboard-pro.html | Main trading interface |
| **Portfolio** | http://localhost:3000/portfolio.html | Portfolio management |
| **Pricing** | http://localhost:3000/pricing.html | Premium plans |
| **Chatbot API** | http://localhost:3001 | AI assistant backend |

---

## 🛠️ Troubleshooting

### Main Server Won't Start

**Problem:** Port 3000 already in use
```bash
# Find and kill the process using port 3000
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

**Problem:** MongoDB connection error
- Check if MongoDB is running
- Verify `.env` file has correct `MONGODB_URI`
- Try demo mode: `npm run dev-no-db`

### Chatbot Won't Start

**Problem:** Python not found
```bash
# Verify Python installation
python --version
```

**Problem:** Ollama not running
```bash
# Start Ollama service
ollama serve

# Pull required model (in another terminal)
ollama pull llama2
```

**Problem:** Port 3001 already in use
```bash
# Find and kill the process
netstat -ano | findstr :3001
taskkill /PID <PID_NUMBER> /F
```

---

## 📋 Environment Variables

Make sure your `.env` file in the root directory contains:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

---

## 🎯 Development Modes

### With MongoDB (Full Features)
```bash
npm start
# or
npm run dev  # with auto-reload
```

### Without MongoDB (Demo Mode)
```bash
npm run dev-no-db
```

This mode is useful for:
- Testing frontend features
- Demos without database setup
- Development when MongoDB is unavailable

---

## 🔄 Stopping the Services

### If using START-PROJECT.bat:
- Close the two terminal windows that opened
- Or press `Ctrl+C` in each window

### If running manually:
- Press `Ctrl+C` in each terminal window
- Wait for graceful shutdown

---

## 📦 First Time Setup Checklist

- [ ] Clone the repository
- [ ] Run `npm install` in root directory
- [ ] Run `pip install -r requirements.txt` in chatbot-backend
- [ ] Create `.env` file with required variables
- [ ] Start MongoDB service
- [ ] Install and start Ollama
- [ ] Pull Ollama model: `ollama pull llama2`
- [ ] Run `START-PROJECT.bat` or start services manually

---

## 🎓 Project Structure

```
trading-platform.clg/
├── START-PROJECT.bat          # 👈 One-click startup script
├── server.js                  # Main backend server
├── server-no-db.js            # Demo mode server
├── package.json               # Node.js dependencies
├── .env                       # Environment variables
├── index.html                 # Landing page
├── login.html                 # Authentication
├── dashboard-pro.html         # Main dashboard
├── chatbot-backend/           # AI Chatbot service
│   ├── start-chatbot.bat      # Chatbot startup script
│   ├── main.py                # FastAPI application
│   ├── requirements.txt       # Python dependencies
│   └── venv/                  # Python virtual environment
├── css/                       # Stylesheets
├── js/                        # Frontend JavaScript
└── models/                    # MongoDB schemas
```

---

## 💡 Tips

1. **Always start MongoDB first** before running the main server
2. **Ollama must be running** for the chatbot to work
3. **Use Chrome/Edge** for best compatibility
4. **Check console logs** if something doesn't work
5. **Demo mode** (`npm run dev-no-db`) works without MongoDB

---

## 🆘 Need Help?

Check these files for more information:
- `CHATBOT_QUICKSTART.md` - Chatbot specific setup
- `PROJECT_DOCUMENTATION.md` - Full project documentation
- `CHATBOT_TROUBLESHOOTING.md` - Common chatbot issues

---

**Happy Trading! 📈**
