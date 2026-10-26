@echo off
chcp 65001 >nul
cd /d "C:\Users\25718\Desktop\concert1"
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8141/ 2>nul | findstr "200" >nul
if errorlevel 1 (
  echo Starting local server on port 8141 ...
  start "" /min cmd /c "python -m http.server 8141 --bind 127.0.0.1"
  timeout /t 2 /nobreak >nul
)
start "" "http://127.0.0.1:8141/"
exit
