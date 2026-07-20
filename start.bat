@echo off
chcp 65001 >nul
REM ============================================================
REM ResearchKit OS One-Click Start Script (Windows) - Fast Boot
REM ============================================================

setlocal
cd /d "%~dp0"

set "NEXT_BIN=node_modules\.bin\next.cmd"
set "NEXT_TELEMETRY_DISABLED=1"
set "NODE_ENV=development"

echo.
echo ============================================================
echo   ResearchKit OS - AI Research Operating System
echo   Read Less. Learn More. Build Faster.
echo ============================================================
echo.

REM === Step 1: Check Node.js ===
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js not found. Please install Node.js 18+
  echo     Download: https://nodejs.org/
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js: %NODE_VER%

REM === Step 2: Check if this is a Next.js project ===
if not exist "package.json" (
  echo [X] Not a Next.js project - package.json not found in current directory
  echo     Please run this script from the project root
  pause
  exit /b 1
)
echo [OK] package.json exists

REM === Step 3: Check .env.local ===
if not exist ".env.local" (
  if exist ".env.local.example" (
    copy ".env.local.example" ".env.local" >nul
    echo [!] Created .env.local - please fill in DeepSeek API Key
    notepad ".env.local"
    pause >nul
  ) else (
    echo [X] .env.local not found
    pause
    exit /b 1
  )
)

REM === Step 4: Check node_modules + next installed ===
if not exist "node_modules\next" (
  echo [!] Dependencies missing - installing...
  call npm install --no-audit --no-fund --prefer-offline
  if errorlevel 1 (
    echo [X] npm install failed
    pause
    exit /b 1
  )
)

REM === Step 5: Check next binary exists ===
if not exist "%NEXT_BIN%" (
  echo [X] Next.js binary not found at %NEXT_BIN%
  echo     Please run: npm install
  pause
  exit /b 1
)
echo [OK] Next.js binary found

REM === Step 6: Fast port cleanup (taskkill, no PowerShell) ===
echo [..] Cleaning up leftover node processes...
taskkill /F /IM node.exe >nul 2>nul
echo [OK] Cleanup done

REM === Step 7: Launch dev server + open browser (compat-safe) ===
echo.
echo ============================================================
echo   Starting ResearchKit OS...
echo   Press Ctrl+C to stop
echo ============================================================
echo.

REM Open browser after 4 seconds (cmd-native, no PowerShell, compatible with all Next versions)
start "" /B cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

REM Start Next.js dev (no --open flag - not all Next versions support it)
call "%NEXT_BIN%" dev
pause
