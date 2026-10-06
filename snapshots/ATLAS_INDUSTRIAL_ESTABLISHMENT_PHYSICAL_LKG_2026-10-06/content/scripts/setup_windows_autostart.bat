@echo off
REM ==============================================================================
REM ATLAS WINDOWS AUTO-START CONFIGURATION SCRIPT
REM Configures Atlas Always-On Runtime to launch on Windows User Logon
REM ==============================================================================

set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set TARGET_BAT=%STARTUP_FOLDER%\AtlasAlwaysOnService.bat

echo Configuring Atlas 24/7 Auto-Start...
echo Target: %TARGET_BAT%

(
  echo @echo off
  echo start /min cmd /c "c:\Users\Eduardo\YOUAPP\scripts\run_atlas_service.bat"
) > "%TARGET_BAT%"

if exist "%TARGET_BAT%" (
  echo [SUCCESS] Atlas Auto-Start configured successfully in Windows Startup.
  echo Atlas will start automatically every time Windows boots.
) else (
  echo [ERROR] Failed to write to Windows Startup folder.
)
