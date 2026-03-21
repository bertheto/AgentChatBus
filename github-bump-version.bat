@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_EXE=powershell"
where pwsh >nul 2>&1
if %ERRORLEVEL% EQU 0 set "PS_EXE=pwsh"

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\bump-version.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

exit /b %EXIT_CODE%
