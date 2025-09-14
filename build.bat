@echo off
echo 🚀 Video Downloader - Build Automatico
echo ========================================
echo.

REM Verifica se Python esta instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python não encontrado! Instale Python primeiro.
    pause
    exit /b 1
)

REM Verifica se pip esta disponivel
pip --version >nul 2>&1
if errorlevel 1 (
    echo ❌ pip não encontrado!
    pause
    exit /b 1
)

echo 📦 Instalando dependências...
pip install pyinstaller yt-dlp requests

echo.
echo 🎨 Criando ícone (se necessário)...
if not exist "assets\icon.ico" (
    echo 📁 Criando pasta assets...
    if not exist "assets" mkdir "assets"
    
    echo 🖼️ Tentando criar ícone...
    python create_icon.py
    
    if not exist "assets\icon.ico" (
        echo ⚠️ Ícone não encontrado! 
        echo 📋 Baixe um ícone .ico e coloque em: assets\icon.ico
        echo 🌐 Sites recomendados: flaticon.com, icons8.com
        echo.
        echo Pressione qualquer tecla para continuar sem ícone...
        pause >nul
        set ICON_PARAM=
    ) else (
        echo ✅ Ícone criado!
        set ICON_PARAM=--icon=assets\icon.ico
    )
) else (
    echo ✅ Ícone encontrado: assets\icon.ico
    set ICON_PARAM=--icon=assets\icon.ico
)

echo.
echo 🔨 Criando executável...
pyinstaller --onefile --windowed --name=VideoDownloader --add-data=browser-extension;browser-extension %ICON_PARAM% src/videodl/main.py

if errorlevel 1 (
    echo ❌ Erro ao criar executável!
    pause
    exit /b 1
)

echo.
echo 📁 Copiando arquivos adicionais...
if not exist "dist\extension" mkdir "dist\extension"
xcopy "browser-extension\*" "dist\extension\" /E /I /Y

echo.
echo 🔍 Verificando Inno Setup...
set INNO_PATH=""
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set INNO_PATH="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set INNO_PATH="C:\Program Files\Inno Setup 6\ISCC.exe"

if %INNO_PATH%=="" (
    echo ⚠️ Inno Setup não encontrado!
    echo 📋 Para criar instalador:
    echo 1. Download Inno Setup: https://jrsoftware.org/isdl.php
    echo 2. Execute: ISCC.exe installer_script.iss
    echo.
    echo ✅ Executável criado: dist\VideoDownloader.exe
) else (
    echo 📦 Criando instalador com Inno Setup...
    %INNO_PATH% installer_script.iss
    
    if errorlevel 1 (
        echo ❌ Erro ao criar instalador!
    ) else (
        echo ✅ Instalador criado: dist\installer\VideoDownloader_Setup.exe
    )
)

echo.
echo 🎉 Build concluído!
echo 📁 Arquivos em: dist\
if exist "dist\installer\VideoDownloader_Setup.exe" (
    echo 📦 Instalador: dist\installer\VideoDownloader_Setup.exe
) else (
    echo 🚀 Executável: dist\VideoDownloader.exe
)

echo.
pause