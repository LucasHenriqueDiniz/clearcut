@echo off
setlocal

set ROOT=%~dp0..
cd /d "%ROOT%"

if not exist runtime\backend\data mkdir runtime\backend\data
if not exist runtime\backend\uploads mkdir runtime\backend\uploads
if not exist runtime\backend\outputs mkdir runtime\backend\outputs
if not exist runtime\backend\models mkdir runtime\backend\models

docker compose up -d --build

echo Frontend: http://localhost:3000
echo Backend : http://localhost:8000/docs
