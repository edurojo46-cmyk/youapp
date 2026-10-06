@echo off
REM ==============================================================================
REM ATLAS ALWAYS-ON 24/7 WINDOWS SERVICE LAUNCHER
REM ==============================================================================

cd /d "c:\Users\Eduardo\YOUAPP"
echo [%date% %time%] Starting Atlas 24/7 Supervisor... >> "reports\atlas\people\supervisor_boot.log"

REM Run under Node/TSX with MAX_CONCURRENT_WORKERS = 2
cmd /c npx tsx scripts/start_atlas_always_on.ts >> "reports\atlas\people\supervisor_runtime.log" 2>&1
