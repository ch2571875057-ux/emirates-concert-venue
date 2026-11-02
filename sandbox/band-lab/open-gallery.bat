@echo off
rem ============================================================
rem  Open the static gallery (no server needed) in a real browser.
rem  Content is pure ASCII on purpose: cmd.exe garbles UTF-8
rem  Chinese inside .bat files, and double-clicking .html here
rem  is bound to Internet Explorer, which cannot render this page.
rem ============================================================
setlocal
cd /d "%~dp0"

set "TARGET=%~dp0gallery.html"
if not exist "%TARGET%" (
  echo [ERROR] gallery.html not found next to this script.
  pause
  exit /b 1
)

set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER (
  echo [WARN] Edge/Chrome not found, falling back to system default.
  start "" "%TARGET%"
  exit /b 0
)

echo Opening gallery with:
echo   %BROWSER%
start "" "%BROWSER%" --new-window "file:///%TARGET:\=/%"
exit /b 0
