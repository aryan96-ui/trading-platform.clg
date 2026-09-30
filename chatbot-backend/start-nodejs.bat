@echo off
echo ========================================
echo ProTrader AI Chatbot Backend (Node.js)
echo ========================================
echo.

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Start the server
echo Starting Express server on port 3001...
echo Press Ctrl+C to stop the server
echo.
npm start
