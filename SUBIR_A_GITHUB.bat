@echo off
title Subir a GitHub - Control de Turnos PDV
cd /d "%~dp0"

echo ========================================================
echo        SUBIENDO ARCHIVOS A GITHUB (Santozsj61)
echo ========================================================
echo.
echo Conectando con tu repositorio en GitHub...
echo (Si es la primera vez, se abrira una ventana en tu navegador para dar clic en Autorizar)
echo.

"%LOCALAPPDATA%\Programs\Git\cmd\git.exe" push -u origin main

echo.
echo ========================================================
echo   Listo. Revisa el mensaje arriba.
echo ========================================================
pause
