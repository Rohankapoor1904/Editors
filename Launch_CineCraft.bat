@echo off
title CineCraft AI Launcher
echo ========================================================
echo        Starting CineCraft AI Desktop Studio...
echo ========================================================
echo.

:: Kill any stuck previous background instances to prevent WebView2 lock
taskkill /F /IM cinecraft-ai-desktop.exe >nul 2>&1

:: Launch the application
start "" "%~dp0src-tauri\target\debug\cinecraft-ai-desktop.exe"

echo CineCraft AI launched successfully!
timeout /t 2 >nul
exit
