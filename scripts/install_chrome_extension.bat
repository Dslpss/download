@echo off
chcp 65001 >nul
echo.
echo 🌐 INSTALADOR DA EXTENSÃO CHROME
echo ================================
echo.

set "EXTENSION_PATH=%~dp0..\extension"

echo 📁 Extensão localizada em: %EXTENSION_PATH%
echo.

if not exist "%EXTENSION_PATH%\manifest.json" (
    echo ❌ Extensão não encontrada em: %EXTENSION_PATH%
    pause
    exit /b 1
)

echo ✅ Extensão encontrada!
echo.

echo 🚀 Abrindo Chrome na página de extensões...
start chrome://extensions/

echo.
echo 📋 INSTRUÇÕES PARA INSTALAÇÃO:
echo ================================
echo.
echo 1. ✅ Ative o "Modo do desenvolvedor" (toggle no canto superior direito)
echo 2. 🔄 Clique em "Carregar sem compactação"
echo 3. 📁 Selecione a pasta que será aberta automaticamente
echo 4. ✅ Clique "Selecionar pasta"
echo.
echo A pasta da extensão será aberta em 3 segundos...

timeout /t 3 /nobreak >nul
explorer "%EXTENSION_PATH%"

echo.
echo 🎉 Pronto! A extensão estará disponível na barra do Chrome
echo 💡 Dica: Fixe a extensão clicando no ícone de puzzle e depois no pin
echo.
echo ⚠️  IMPORTANTE: NÃO mova ou delete a pasta da extensão!
echo    Se mover, a extensão para de funcionar.
echo.
pause