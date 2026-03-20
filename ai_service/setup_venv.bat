@echo off
echo ==========================================================
echo  VoxBill Python AI Service – Virtual Environment Setup
echo ==========================================================
echo.

cd /d "%~dp0"

echo [1/4] Creating Python virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.9+ first.
    pause & exit /b 1
)

echo [2/4] Activating virtual environment...
call venv\Scripts\activate.bat

echo [3/4] Installing dependencies from requirements.txt...
pip install -r requirements.txt

echo [4/4] Done! To start the AI service:
echo.
echo    venv\Scripts\activate
echo    python ai_service.py
echo.
pause
