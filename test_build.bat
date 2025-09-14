@echo off
echo ====================================
echo   TESTE RÁPIDO - VIDEO DOWNLOADER
echo ====================================
echo.

echo Testando executável...
echo.

if not exist "dist\VideoDownloader.exe" (
    echo ❌ ERRO: VideoDownloader.exe não encontrado!
    echo Execute build_complete.bat primeiro.
    pause
    exit /b 1
)

echo ✅ Executável encontrado: 
dir "dist\VideoDownloader.exe" | find ".exe"

echo.
echo ✅ Instalador encontrado:
if exist "dist\installer\VideoDownloader_Setup.exe" (
    dir "dist\installer\VideoDownloader_Setup.exe" | find ".exe"
) else (
    echo ❌ Instalador não encontrado
)

echo.
echo ====================================
echo           TESTE MANUAL
echo ====================================
echo.
echo Para testar o executável:
echo 1. Execute: dist\VideoDownloader.exe
echo 2. Deve abrir a interface sem erros
echo.
echo Para testar o instalador:
echo 1. Execute como admin: dist\installer\VideoDownloader_Setup.exe
echo 2. Siga o assistente de instalação
echo.
echo ====================================
echo.
pause