@echo off
setlocal

set "APP_EXE=%~dp0src-tauri\target\release\shit-vault.exe"

if not exist "%APP_EXE%" (
  echo SHIT VAULT executable was not found.
  echo Expected path:
  echo %APP_EXE%
  echo.
  echo Build it first with:
  echo npm run tauri:build-exe
  pause
  exit /b 1
)

start "" "%APP_EXE%"
