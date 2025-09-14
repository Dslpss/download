@echo off
echo ================================
echo  Video Downloader - Instalacao da Extensao
echo ================================
echo.

set "EXTENSION_PATH=%~dp0browser-extension"

echo 📁 Pasta da extensao: %EXTENSION_PATH%
echo.

if not exist "%EXTENSION_PATH%" (
    echo ❌ Pasta da extensao nao encontrada!
    pause
    exit /b 1
)

if not exist "%EXTENSION_PATH%\manifest.json" (
    echo ❌ Arquivo manifest.json nao encontrado!
    pause
    exit /b 1
)

echo ✅ Extensao encontrada!
echo.
echo 📋 INSTRUCOES PARA INSTALAR:
echo ================================
echo.
echo 1. Abra o Chrome, Edge ou Brave
echo 2. Digite na barra de endereco: chrome://extensions/
echo 3. Ative o 'Modo do desenvolvedor' (canto superior direito)
echo 4. Clique em 'Carregar sem compactacao'
echo 5. Selecione a pasta: %EXTENSION_PATH%
echo.
echo ✅ A extensao sera carregada e estara pronta para uso!
echo.
echo 🔧 CARACTERISTICAS DA EXTENSAO:
echo • Detecta videos automaticamente
echo • Intercepta headers para sites protegidos  
echo • Notificacoes popup para download rapido
echo • Funciona com Rocketseat, YouTube, Vimeo e outros
echo.

echo Abrindo pasta da extensao...
explorer "%EXTENSION_PATH%"

echo.
echo ⚠️  IMPORTANTE: Mantenha esta pasta no mesmo local!
echo    A extensao para de funcionar se a pasta for movida.
echo.
pause