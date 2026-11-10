@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "TAURI_SIGNING_PRIVATE_KEY=%USERPROFILE%\.tauri\storehub.key"
cd /d "%~dp0"
call npm run build
