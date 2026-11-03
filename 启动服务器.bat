@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=8141"
set "PY="

rem =====================================================================
rem  1. 找一个"真能跑"的 Python
rem     注意：Windows 自带的 WindowsApps\python.exe 是 Microsoft Store 的
rem     占位空壳，敲命令没有任何输出也不报错，必须跳过它。
rem     验证方式：真的执行一次 print(1)，看有没有输出 1。
rem =====================================================================
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\python\versions\*") do (
  if not defined PY if exist "%%~D\python.exe" (
    "%%~D\python.exe" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%~D\python.exe"
  )
)
for %%C in (
  "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
  "C:\Python313\python.exe"
  "C:\Python312\python.exe"
  "C:\Python311\python.exe"
  "C:\Program Files\Python313\python.exe"
  "C:\Program Files\Python312\python.exe"
) do (
  if not defined PY if exist "%%~C" (
    "%%~C" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%~C"
  )
)
if not defined PY (
  for /f "delims=" %%W in ('where python 2^>nul') do (
    if not defined PY (
      "%%W" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%W"
    )
  )
)

if not defined PY (
  echo.
  echo   [启动失败] 找不到可用的 Python
  echo.
  echo   本机 PATH 里的 python 是 Microsoft Store 的占位程序，不能执行，
  echo   所以本地服务器起不来，浏览器自然打不开页面。
  echo.
  echo   解决办法，任选其一：
  echo     1^) 安装 Python 3：https://www.python.org/downloads/
  echo        安装时务必勾选 "Add python.exe to PATH"
  echo     2^) 直接在 WorkBuddy 里说一句「启动服务器」，由助手代起
  echo.
  echo   页面本身没有损坏——它必须通过 HTTP 打开，
  echo   直接双击 index.html（file:// 协议）是打不开的。
  echo.
  pause
  exit /b 1
)

rem =====================================================================
rem  2. 端口上已经有服务了，就别重复启动，直接开浏览器
rem     --noproxy 是防止系统代理把 127.0.0.1 拦截成 502
rem =====================================================================
curl -s --noproxy "*" --max-time 2 -o nul -w "%%{http_code}" "http://127.0.0.1:%PORT%/" 2>nul | findstr "200" >nul
if not errorlevel 1 goto :open

rem =====================================================================
rem  3. 启动本地服务器（禁缓存版，改完刷新即生效）
rem =====================================================================
echo.
echo   正在启动本地服务器 http://127.0.0.1:%PORT%/ ...
echo   使用解释器: %PY%
echo.
start "concert1 本地服务器（关掉这个窗口即停止）" /min "%PY%" "%~dp0server_nocache.py"
timeout /t 2 /nobreak >nul

rem 再确认一次是否真的起来了
curl -s --noproxy "*" --max-time 3 -o nul -w "%%{http_code}" "http://127.0.0.1:%PORT%/" 2>nul | findstr "200" >nul
if errorlevel 1 (
  echo   [警告] 服务器似乎没有起来，请检查 %PORT% 端口是否被占用。
  echo          可以试着关掉其他占用该端口的程序后重试。
  pause
  exit /b 1
)

:open
if /i "%~1"=="--noopen" exit /b 0
start "" "http://127.0.0.1:%PORT%/"
endlocal
exit /b 0
