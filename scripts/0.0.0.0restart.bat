@echo off
REM Wrapper to run the PowerShell restart script by double-clicking this .bat
REM Usage: double-click or run from cmd. Any args will be forwarded to the PS1.

SETLOCAL
SET SCRIPT_DIR=%~dp0
SET SCRIPT=%SCRIPT_DIR%0.0.0.0restart.ps1

REM Change to project root (parent of scripts)
PUSHD "%SCRIPT_DIR%.."

powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%SCRIPT%' %*"

SET RC=%ERRORLEVEL%
POPD
ENDLOCAL & EXIT /B %RC%
