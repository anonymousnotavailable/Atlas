@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed yet.
  echo Go to https://nodejs.org, download the LTS installer, run it with default options,
  echo then close this window and double-click start.bat again.
  pause
  exit /b 1
)

if not exist .env (
  echo No .env file found - creating one from .env.example.
  copy .env.example .env >nul
  echo Opening it in Notepad - paste in your API keys, then Save and close Notepad to continue.
  notepad .env
)

echo Installing dependencies (first run only, may take a minute)...
call npm install
if errorlevel 1 (
  echo npm install failed - see the error above.
  pause
  exit /b 1
)

echo Starting Atlas...
echo Once you see "Atlas backend listening on http://localhost:8787", open that address in your browser.
echo Keep this window open while using Atlas - closing it stops the server.
call npm start

pause
