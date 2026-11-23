@echo off
setlocal
cd /d "%~dp0"
title AppISERIES

rem Algunos equipos tienen la variable ComSpec mal definida (dos rutas unidas con ;)
rem y eso rompe npm y la instalacion de Electron. Aqui se corrige solo para esta ventana.
set "ComSpec=%SystemRoot%\System32\cmd.exe"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Primera vez: instalando dependencias. Puede tardar unos minutos...
  call npm install --ignore-scripts
  if errorlevel 1 goto :error
  node node_modules\electron\install.js
  if errorlevel 1 goto :error
)

echo Preparando la aplicacion...
node node_modules\vite\bin\vite.js build >nul 2>nul
if errorlevel 1 (
  echo La compilacion fallo. Detalle:
  echo.
  node node_modules\vite\bin\vite.js build
  goto :error
)

start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:error
echo.
echo Ocurrio un error. Revisa los mensajes de arriba.
pause
exit /b 1
