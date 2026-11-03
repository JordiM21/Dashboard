@echo off
set /p PID=<"C:\Users\jordi\Documents\LET Academy\Brain\.watch.pid"
taskkill /PID %PID% /T /F
echo Brain watcher stopped.
pause
