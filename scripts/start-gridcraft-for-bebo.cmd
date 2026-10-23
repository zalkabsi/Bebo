@echo off
setlocal
cd /d "%~dp0.."
if not exist "node_modules\vite\bin\vite.js" (
  echo Bebo dependencies are missing. Open this folder in a terminal and run: npm install
  pause
  exit /b 1
)
node scripts\start-gridcraft-for-bebo.mjs
if errorlevel 1 pause
