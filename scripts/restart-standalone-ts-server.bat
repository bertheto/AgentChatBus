@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
set "TS_SERVER_DIR=%REPO_ROOT%\agentchatbus-ts"
set "SERVER_PORT=39765"
set "SERVER_HOST=127.0.0.1"

echo.
echo [AgentChatBus] Restarting standalone TypeScript server...
echo [AgentChatBus] Repo root: %REPO_ROOT%
echo [AgentChatBus] Server dir: %TS_SERVER_DIR%
echo [AgentChatBus] Target URL: http://%SERVER_HOST%:%SERVER_PORT%
echo.

if not exist "%TS_SERVER_DIR%\package.json" (
  echo [AgentChatBus] ERROR: agentchatbus-ts\package.json not found.
  exit /b 1
)

pushd "%TS_SERVER_DIR%" >nul

echo [1/4] Stopping previous standalone tsx server processes...
echo [AgentChatBus] Skipping command-line process scan. Port cleanup will handle stale listeners.

echo [2/4] Waiting for port %SERVER_PORT% to clear...
for /l %%N in (1,1,20) do (
  set "FOUND_PORT="
  for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%SERVER_PORT% .*LISTENING"') do (
    set "FOUND_PORT=1"
    taskkill /PID %%P /T /F >nul 2>nul
  )
  if not defined FOUND_PORT goto :port_clear
  timeout /t 1 /nobreak >nul
)
:port_clear

echo [3/4] Running TypeScript check...
call npm run check
if errorlevel 1 (
  echo [AgentChatBus] ERROR: TypeScript check failed. Server was not restarted.
  popd >nul
  exit /b 1
)

echo [4/4] Launching fresh standalone server window...
set "AGENTCHATBUS_WEB_UI_DIR=%REPO_ROOT%\web-ui"
set "LAUNCHER=%TS_SERVER_DIR%\.tmp-standalone\launch-standalone-ts-server.cmd"
if not exist "%TS_SERVER_DIR%\.tmp-standalone" mkdir "%TS_SERVER_DIR%\.tmp-standalone" >nul 2>nul
(
  echo @echo off
  echo setlocal EnableExtensions
  echo cd /d "%TS_SERVER_DIR%"
  echo set "AGENTCHATBUS_HOST=%SERVER_HOST%"
  echo set "AGENTCHATBUS_PORT=%SERVER_PORT%"
  echo set "AGENTCHATBUS_WEB_UI_DIR=%AGENTCHATBUS_WEB_UI_DIR%"
  echo echo [AgentChatBus] Starting standalone TypeScript server on http://%SERVER_HOST%:%SERVER_PORT%
  echo npm exec -- tsx .\src\cli\index.ts serve --host=%SERVER_HOST% --port=%SERVER_PORT%
  echo echo.
  echo echo [AgentChatBus] Server exited. Press any key to close this window.
  echo pause ^>nul
) > "%LAUNCHER%"

start "AgentChatBus Standalone TS Server" "%ComSpec%" /k call "%LAUNCHER%"

echo.
echo [AgentChatBus] Standalone server launch requested.
echo [AgentChatBus] Open http://%SERVER_HOST%:%SERVER_PORT% after the new window says it is listening.
echo.

popd >nul
exit /b 0
