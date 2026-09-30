@echo off
echo ========================================
echo ProTrader AI Chatbot Backend
echo ========================================
echo.

REM Check if virtual environment exists
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat
echo.

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt
echo.

REM Start the server
echo Starting FastAPI server on port 3001...
echo Press Ctrl+C to stop the server
echo.
uvicorn main:app --host 0.0.0.0 --port 3001 --reload
