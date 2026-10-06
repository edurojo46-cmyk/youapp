@echo off
cd /d "C:\Users\Eduardo\YOUAPP"
"C:\Program Files\nodejs\node.exe" "C:\Users\Eduardo\YOUAPP\scripts\atlas_watchdog.mjs" >> "C:\Users\Eduardo\YOUAPP\reports\atlas\realtime\watchdog_stdout.log" 2>&1
