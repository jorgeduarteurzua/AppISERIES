@echo off
setlocal
cd /d "%~dp0"
title AppISERIES (desarrollo)

rem Modo desarrollo: se recarga solo al guardar cambios en el codigo.
rem Deja esta ventana abierta mientras uses la aplicacion; al cerrarla se detiene todo.
set "ComSpec=%SystemRoot%\System32\cmd.exe"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Faltan las dependencias. Abre primero "Iniciar AppISERIES.bat", que las instala.
  pause
  exit /b 1
)

node node_modules\vite\bin\vite.js
pause
