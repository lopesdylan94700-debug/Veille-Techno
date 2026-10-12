@echo off
rem Veille techno : collecte les sources puis ouvre l'application dans le navigateur.
cd /d "%~dp0"
echo Collecte des sources (1 a 2 minutes)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect.ps1"
start "" "http://localhost:8080/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8080
