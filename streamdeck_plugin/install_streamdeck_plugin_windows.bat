@echo off
setlocal
set SRC=%~dp0com.pepslive.dock.sdPlugin
set DST=%APPDATA%\Elgato\StreamDeck\Plugins\com.pepslive.dock.sdPlugin
if not exist "%SRC%" (
  echo Plugin folder not found: %SRC%
  pause
  exit /b 1
)
echo Installing PepsLive Dock Stream Deck plugin...
if exist "%DST%" rmdir /s /q "%DST%"
xcopy "%SRC%" "%DST%" /E /I /Y >nul
if errorlevel 1 (
  echo Install failed.
  pause
  exit /b 1
)
echo Done. Restart Stream Deck software.
pause
