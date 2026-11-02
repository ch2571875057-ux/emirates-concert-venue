@echo off
rem ============================================================
rem  Open the 3D band sandbox in a real browser.
rem  This page needs http (ES modules + .glb), so we start a
rem  local server on port 8152 if it is not already running.
rem  Content is pure ASCII on purpose: cmd.exe garbles UTF-8
rem  Chinese inside .bat files.
rem ============================================================
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0..\.."
set "PORT=8152"
set "URL=http://127.0.0.1:%PORT%/sandbox/band-lab/index.html"

set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER set "BROWSER=explorer.exe"

echo ============================================================
echo   Band Lab - 3D scene
echo ============================================================
echo.
echo   URL: %URL%
echo.

echo [1/2] Checking port %PORT% ...
powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port %PORT% -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 goto STARTIT
echo       Server already running.
goto OPENIT

:STARTIT
echo       Starting local server ...
start "band-lab http" /min cmd /c "cd /d "%ROOT%" && python -m http.server %PORT% --bind 127.0.0.1"
powershell -NoProfile -Command "Start-Sleep -Milliseconds 2000"
echo       Started.

:OPENIT
echo [2/2] Opening browser ...
echo       %BROWSER%
start "" "%BROWSER%" --new-window "%URL%"
echo.
echo Done. Close this window does NOT stop the server.
echo To stop: close the minimized "band-lab http" window.
echo.
pause
