@echo off
rem LEVEL ONE launcher for Windows. Double-click to start; close this window (or press Ctrl+C) to stop.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or 24 LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies - first run only...
  call npm install || goto :failed
)

if not exist dist\server\index.js (
  echo Building LEVEL ONE - first run only...
  call npm run build || goto :failed
)

call npm run start:open
goto :eof

:failed
echo.
echo Setup failed. Scroll up for the error, or run "npm install" and "npm run build" manually.
pause
exit /b 1
