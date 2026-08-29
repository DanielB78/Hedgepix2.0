@echo off
cd /d "%~dp0backend"
call npm run update-data
pause
