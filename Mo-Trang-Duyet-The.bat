@echo off
cd /d "%~dp0"
start "GomDon Card Admin Server" /min cmd /c "node admin-server.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:8787/admin.html
