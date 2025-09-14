@echo off
echo ====================================
echo  BUILD COMPLETO - VIDEO DOWNLOADER
echo ====================================
echo.

:: Limpar builds anteriores
echo [1/4] Limpando builds anteriores...
if exist "dist" rmdir /s /q "dist"
if exist "build" rmdir /s /q "build"
mkdir "dist\installer"

:: Verificar se PyInstaller está instalado
echo [2/4] Verificando dependências...
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo Instalando PyInstaller...
    pip install pyinstaller
)

:: Criar ícone se não existir
if not exist "assets\icon.ico" (
    echo Criando ícone...
    python create_icon.py
)

:: Construir executável
echo [3/4] Criando executável...
pyinstaller --onefile --windowed ^
    --name "VideoDownloader" ^
    --icon "assets\icon.ico" ^
    --add-data "browser-extension;browser-extension" ^
    --add-data "src;src" ^
    --collect-all "tkinter" ^
    --hidden-import "json" ^
    --hidden-import "os" ^
    --hidden-import "sys" ^
    --hidden-import "threading" ^
    --hidden-import "logging" ^
    --hidden-import "shutil" ^
    --hidden-import "time" ^
    --hidden-import "re" ^
    --hidden-import "urllib.parse" ^
    --hidden-import "http.server" ^
    --distpath "dist" ^
    main.py

if errorlevel 1 (
    echo ERRO: Falha ao criar executável
    pause
    exit /b 1
)

:: Construir instalador
echo [4/4] Criando instalador...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer_script.iss

if errorlevel 1 (
    echo ERRO: Falha ao criar instalador
    pause
    exit /b 1
)

echo.
echo ====================================
echo         BUILD CONCLUÍDO!
echo ====================================
echo.
echo Arquivos criados:
echo - Executável: dist\VideoDownloader.exe
echo - Instalador: dist\installer\VideoDownloader_Setup.exe
echo.
echo O instalador inclui:
echo ✓ Aplicativo principal
echo ✓ Extensão do Chrome
echo ✓ Script de instalação automática
echo ✓ Licença MIT
echo ✓ Documentação
echo.
pause