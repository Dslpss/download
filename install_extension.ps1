# Script PowerShell para instalar extensão do Video Downloader
# Executar como: powershell -ExecutionPolicy Bypass -File install_extension.ps1

param(
    [switch]$Silent = $false
)

$ErrorActionPreference = "SilentlyContinue"

function Write-ColoredOutput {
    param($Text, $Color = "White")
    if (!$Silent) {
        Write-Host $Text -ForegroundColor $Color
    }
}

function Show-Instructions {
    param($ExtensionPath)
    
    Write-ColoredOutput "`n📋 INSTRUÇÕES PARA INSTALAR A EXTENSÃO:" "Yellow"
    Write-ColoredOutput "=" * 50 "Yellow"
    Write-ColoredOutput ""
    Write-ColoredOutput "🌐 CHROME / EDGE / BRAVE:" "Cyan"
    Write-ColoredOutput "1. Abra o navegador"
    Write-ColoredOutput "2. Digite na barra de endereços: chrome://extensions/"
    Write-ColoredOutput "3. Ative o 'Modo do desenvolvedor' (canto superior direito)"
    Write-ColoredOutput "4. Clique em 'Carregar sem compactação'"
    Write-ColoredOutput "5. Selecione a pasta: $ExtensionPath"
    Write-ColoredOutput ""
    Write-ColoredOutput "✅ A extensão será carregada e estará pronta para uso!"
    Write-ColoredOutput ""
    Write-ColoredOutput "🔧 CARACTERÍSTICAS DA EXTENSÃO:" "Green"
    Write-ColoredOutput "• Detecta vídeos automaticamente"
    Write-ColoredOutput "• Intercepta headers para sites protegidos"
    Write-ColoredOutput "• Notificações popup para download rápido"
    Write-ColoredOutput "• Funciona com Rocketseat, YouTube, Vimeo e outros"
    Write-ColoredOutput ""
}

function Install-ChromeExtension {
    param($ExtensionPath)
    
    Write-ColoredOutput "🚀 Instalando extensão do Video Downloader..." "Green"
    Write-ColoredOutput "📁 Caminho da extensão: $ExtensionPath"
    
    # Verifica se a pasta da extensão existe
    if (!(Test-Path $ExtensionPath)) {
        Write-ColoredOutput "❌ Pasta da extensão não encontrada: $ExtensionPath" "Red"
        return $false
    }
    
    # Verifica manifest.json
    $ManifestPath = Join-Path $ExtensionPath "manifest.json"
    if (!(Test-Path $ManifestPath)) {
        Write-ColoredOutput "❌ Arquivo manifest.json não encontrado!" "Red"
        return $false
    }
    
    try {
        # Lê informações do manifest
        $ManifestContent = Get-Content $ManifestPath -Raw | ConvertFrom-Json
        $ExtensionName = $ManifestContent.name
        $ExtensionVersion = $ManifestContent.version
        
        Write-ColoredOutput "📦 Extensão encontrada: $ExtensionName v$ExtensionVersion" "Cyan"
        
        # Procura por navegadores instalados
        $ChromePaths = @(
            "$env:LOCALAPPDATA\Google\Chrome\User Data",
            "$env:LOCALAPPDATA\Microsoft\Edge\User Data",
            "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data"
        )
        
        $BrowserFound = $false
        foreach ($BrowserPath in $ChromePaths) {
            if (Test-Path $BrowserPath) {
                $BrowserName = Split-Path (Split-Path $BrowserPath) -Leaf
                Write-ColoredOutput "✅ Navegador encontrado: $BrowserName" "Green"
                $BrowserFound = $true
            }
        }
        
        if (!$BrowserFound) {
            Write-ColoredOutput "⚠️ Nenhum navegador compatível encontrado." "Yellow"
            Write-ColoredOutput "Instale Chrome, Edge ou Brave para usar a extensão."
        }
        
        # Cria atalho para instalação manual
        $DesktopPath = [Environment]::GetFolderPath("Desktop")
        $ShortcutPath = Join-Path $DesktopPath "Instalar Extensão Video Downloader.bat"
        
        $BatchContent = @"
@echo off
echo Abrindo pasta da extensão...
explorer "$ExtensionPath"
echo.
echo Instruções:
echo 1. Abra Chrome/Edge/Brave
echo 2. Vá para chrome://extensions/
echo 3. Ative 'Modo do desenvolvedor'
echo 4. Clique 'Carregar sem compactação'
echo 5. Selecione a pasta que foi aberta
pause
"@
        
        Set-Content -Path $ShortcutPath -Value $BatchContent -Encoding UTF8
        Write-ColoredOutput "🔗 Atalho criado na área de trabalho: Instalar Extensão Video Downloader.bat" "Green"
        
        # Mostra instruções
        Show-Instructions -ExtensionPath $ExtensionPath
        
        return $true
        
    } catch {
        Write-ColoredOutput "❌ Erro ao processar extensão: $_" "Red"
        return $false
    }
}

# Função principal
function Main {
    Write-ColoredOutput "🎯 Video Downloader - Instalador de Extensão" "Magenta"
    Write-ColoredOutput "=" * 50 "Magenta"
    
    # Determina caminho da extensão
    $ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ExtensionPath = Join-Path $ScriptPath "extension"
    
    # Instala a extensão
    $Success = Install-ChromeExtension -ExtensionPath $ExtensionPath
    
    if ($Success) {
        Write-ColoredOutput "`n🎉 Processo concluído!" "Green"
        if (!$Silent) {
            Write-ColoredOutput "`nPressione qualquer tecla para continuar..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        }
    } else {
        Write-ColoredOutput "`n❌ Falha na instalação da extensão." "Red"
        if (!$Silent) {
            Write-ColoredOutput "`nPressione qualquer tecla para continuar..."
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        }
        exit 1
    }
}

# Executa função principal
Main