@echo off
echo ========================================
echo ProTrader Platform - Complete Startup
echo ========================================
echo.
echo This will start:
echo 1. Main Trading Platform (Node.js on port 3000)
echo 2. AI Chatbot Backend (Python/FastAPI on port 3001)
echo.
echo ========================================
echo.

REM Start Main Trading Platform
echo [1/2] Starting Main Trading Platform...
echo.
start "ProTrader Main Server" cmd /k "cd /d %~dp0 && npm start"
timeout /t 3 /nobreak >nul

REM Start Chatbot Backend
echo [2/2] Starting AI Chatbot Backend...
echo.
start "ProTrader Chatbot" cmd /k "cd /d %~dp0chatbot-backend && start-chatbot.bat"
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo ✅ All Services Started!
echo ========================================
echo.
echo 🌐 Main Platform: http://localhost:3000
echo 🤖 Chatbot API: http://localhost:3001
echo.
echo Two new windows have opened:
echo - ProTrader Main Server
echo - ProTrader Chatbot
echo.
echo To stop the servers, close those windows or press Ctrl+C
echo.
echo Opening browser in 5 seconds...
timeout /t 5 /nobreak >nul
start http://localhost:3000
echo.
echo Press any key to close this window...
pause >nul
