@echo off
cd /d "%~dp0"
start "" http://localhost:8787/admin.html
node admin-server.js
pause
