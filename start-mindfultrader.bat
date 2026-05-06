@echo off
title MindfulTrader Launcher
echo Starting MindfulTrader...

start "Backend" /d "C:\Users\yasir\onedrive\documents\journal" cmd /k "node server.cjs"

timeout /t 2 /nobreak >nul
start "Frontend" /d "C:\Users\yasir\onedrive\documents\journal" cmd /k "npx vite"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"