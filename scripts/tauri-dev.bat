@echo off
cd /d %~dp0\..
cd frontend
call npm run tauri:dev
