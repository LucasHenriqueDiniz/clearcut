@echo off
setlocal

set ROOT=%~dp0..

cd /d "%ROOT%\backend"
if not exist .venv (
  py -3 -m venv .venv
)
call .venv\Scripts\activate
pip install -r requirements.txt
start "backend" cmd /k "python run.py"

cd /d "%ROOT%\frontend"
call npm install
start "frontend" cmd /k "npm run dev"

echo Backend: http://127.0.0.1:8000
 echo Frontend: http://127.0.0.1:3000
