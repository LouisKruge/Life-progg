@echo off
rem LEVEL ONE launcher for Windows. Double-click to start; close this window (or press Ctrl+C) to stop.
rem It installs and rebuilds automatically when the code has changed (for example after git pull).
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or 24 LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)

for /f %%s in ('node scripts\needs-setup.mjs') do set STEP=%%s

if "%STEP%"=="install" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund || goto :failed
  set STEP=build
)

if "%STEP%"=="build" (
  echo Building LEVEL ONE...
  call npm run build || goto :failed
)

call npm run start:open
goto :eof

:failed
echo.
echo Setup failed. Scroll up for the error, or run "npm install" and "npm run build" manually.
pause
exit /b 1
