@echo off
cd /d "%~dp0"
if not exist node_modules\ws (
  echo Installing dependencies...
  call npm install --silent
)
start "" http://localhost:8080
node server\server.js
