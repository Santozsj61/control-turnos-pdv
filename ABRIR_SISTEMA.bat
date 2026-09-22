@echo off
title Control de Turnos PDV
cd /d "%~dp0"

echo ========================================================
echo        CONTROL DE TURNOS PDV & CONCILIACION BUK
echo ========================================================
echo.

:: Verificar si el servidor ya está activo
curl.exe -s http://localhost:3001/api/config >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo El servidor ya esta en ejecucion en http://localhost:3001
    start "" "http://localhost:3001"
    goto :fin
)

echo Iniciando servidor local en http://localhost:3001 ...
start "" "http://localhost:3001"
"%~dp0node.exe" "%~dp0server\index.js"

:fin
