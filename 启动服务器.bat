@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=8141"
set "PY="
set "NODE="

rem =====================================================================
rem  1. 先找一个"真能跑"的 Python
rem     注意：Windows 自带的 WindowsApps\python.exe 是 Microsoft Store 的
rem     占位空壳，执行后既不输出也不报错（退出码 9009），必须跳过。
rem     验证方式：真的执行一次 print(1)，看输出里有没有 1。
rem     探测顺序：用户自己装的优先，WorkBuddy 自带的放最后兜底。
rem =====================================================================

rem 1.1 新版安装器布局 LOCALAPPDATA\Python\pythoncore-*
for /d %%D in ("%LOCALAPPDATA%\Python\pythoncore-*") do (
  if not defined PY if exist "%%~D\python.exe" (
    "%%~D\python.exe" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%~D\python.exe"
  )
)

rem 1.2 经典安装器布局 LOCALAPPDATA\Programs\Python\Python3xx
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
  if not defined PY if exist "%%~D\python.exe" (
    "%%~D\python.exe" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%~D\python.exe"
  )
)

rem 1.3 全机器安装 C:\Python3xx 与 C:\Program Files\Python3xx
for /d %%D in ("C:\Python3*") do (
  if not defined PY if exist "%%~D\python.exe" (
    "%%~D\python.exe" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%~D\python.exe"
  )
)
for /d %%D in ("C:\Program Files\Python3*") do (
  if not defined PY if exist "%%~D\python.exe" (
    "%%~D\python.exe" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%~D\python.exe"
  )
)

rem 1.4 py 启动器注册的版本（解析 py -0p 每行最后一段路径）
if not defined PY (
  for /f "tokens=*" %%L in ('py -0p 2^>nul') do (
    for %%P in (%%L) do (
      if not defined PY if exist "%%P" (
        echo %%P | findstr /i "python.exe$" >nul && set "PY=%%P"
      )
    )
  )
)

rem 1.5 PATH 里的 python（能通过验证的才认，占位程序会被挡掉）
if not defined PY (
  for /f "delims=" %%W in ('where python 2^>nul') do (
    if not defined PY (
      "%%W" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%W"
    )
  )
)

rem 1.6 兜底：WorkBuddy 自带的解释器
if not defined PY (
  for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\python\versions\*") do (
    if not defined PY if exist "%%~D\python.exe" (
      "%%~D\python.exe" -c "print(1)" 2>nul | findstr "^1$" >nul && set "PY=%%~D\python.exe"
    )
  )
)

rem =====================================================================
rem  2. 没有 Python 就走 Node 兜底
rem     server_nocache.mjs 是同一套静态服务的 Node 版（同样发 no-store 头）。
rem     这里不只看 node 在不在 PATH，而是真让它跑一次 --check，
rem     跑不通就当没有（避免选到一个坏掉的 node）。
rem =====================================================================
if not defined PY (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    if not defined NODE (
      "%%N" "%~dp0server_nocache.mjs" --check 2>nul | findstr /c:"node-ok" >nul && set "NODE=%%N"
    )
  )
)

if not defined PY if not defined NODE (
  echo.
  echo   [启动失败] 找不到可用的 Python，也找不到可用的 Node.js
  echo.
  echo   本机 PATH 里的 python 是 Microsoft Store 的占位程序，不能执行；
  echo   Node.js 也不在 PATH 上或运行失败，所以本地服务器起不来，
  echo   浏览器自然打不开页面。
  echo.
  echo   解决办法（任选其一，装完重新双击本文件即可）：
  echo     1^) 安装 Python 3：https://www.python.org/downloads/
  echo        安装时务必勾选 "Add python.exe to PATH"
  echo     2^) 安装 Node.js：https://nodejs.org/
  echo     3^) 或直接在 WorkBuddy 里说一句「启动服务器」，由助手代起
  echo.
  echo   页面本身没有损坏——它必须通过 HTTP 打开，
  echo   直接双击 index.html（file:// 协议）是打不开的。
  echo.
  pause
  exit /b 1
)

rem =====================================================================
rem  3. 端口上已经有服务了，就别重复启动，直接开浏览器
rem     --noproxy 是防止系统代理把 127.0.0.1 拦截成 502
rem =====================================================================
curl -s --noproxy "*" --max-time 2 -o nul -w "%%{http_code}" "http://127.0.0.1:%PORT%/" 2>nul | findstr "200" >nul
if not errorlevel 1 goto :open

rem =====================================================================
rem  4. 启动本地服务器（禁缓存版，改完刷新即生效）
rem =====================================================================
echo.
echo   正在启动本地服务器 http://127.0.0.1:%PORT%/ ...
if defined PY (
  echo   使用解释器: %PY%
  start "concert1 本地服务器（关掉这个窗口即停止）" /min "%PY%" "%~dp0server_nocache.py"
) else (
  echo   使用解释器: %NODE%  ^(没有可用的 Python，改用 Node 兜底^)
  start "concert1 本地服务器（关掉这个窗口即停止）" /min "%NODE%" "%~dp0server_nocache.mjs"
)
rem 轮询等待服务起来（最多约 15 秒）。
rem 不用 timeout 命令：某些机器 PATH 里先命中的是 GNU coreutils 的 timeout，
rem 不认 /t 参数会直接报错退出——服务其实起来了，脚本却判成失败。
rem ping -n 2 在这里当作"睡约 1 秒"用，任何 Windows 都有。
set "TRIES=0"
:waitserv
ping -n 2 -w 1000 127.0.0.1 >nul 2>nul
curl -s --noproxy "*" --max-time 2 -o nul -w "%%{http_code}" "http://127.0.0.1:%PORT%/" 2>nul | findstr "200" >nul
if not errorlevel 1 goto :open
set /a TRIES+=1
if !TRIES! lss 15 goto :waitserv

echo   [警告] 服务器似乎没有起来，请检查 %PORT% 端口是否被占用。
echo          可以试着关掉其他占用该端口的程序后重试。
pause
exit /b 1

:open
if /i "%~1"=="--noopen" exit /b 0
start "" "http://127.0.0.1:%PORT%/"
endlocal
exit /b 0
