@echo off
cd /d "%~dp0"
start "" http://localhost:3490
node server.js
pause
