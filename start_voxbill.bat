@echo off
echo ============================================
echo  VoxBill – Starting All Services (Fast Mode)
echo ============================================
echo.

:: 1. Start Python AI Service
start "VoxBill AI Service" cmd /k "cd /d d:\voxbill\ai_service && venv\Scripts\activate && python ai_service.py"

:: 2. Start MongoDB Backend
start "VoxBill Backend" cmd /k "cd /d d:\voxbill\backend && node server.js"

:: 3. Start Node Dashboard Server
start "VoxBill Dashboard" cmd /k "cd /d d:\voxbill\frontend && node server.js"

echo.
echo All 3 services are launching in separate windows:
echo  -> Frontend:    http://localhost:3000
echo  -> Backend API: http://localhost:4000
echo  -> AI Service:  http://localhost:5000
echo.
echo TIP: You can also run "npm start" from the project root.
echo.
echo Press any key to close this launcher (servers will keep running).
pause >nul
