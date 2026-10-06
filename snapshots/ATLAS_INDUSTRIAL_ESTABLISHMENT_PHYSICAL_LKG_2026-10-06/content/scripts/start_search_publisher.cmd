@echo off
REM ============================================================================
REM ATLAS SEARCH PUBLISHER WORKER
REM ============================================================================
title Atlas Search Publisher
echo Starting Atlas Search Publisher...
echo.
node --experimental-vm-modules scripts/atlas_search_publisher.mjs
pause
