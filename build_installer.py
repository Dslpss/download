#!/usr/bin/env python3
"""
Script para criar instalador do Video Downloader para Windows
"""

import os
import sys
import subprocess
import shutil
import json
from pathlib import Path

def build_executable():
    """Cria executável usando PyInstaller"""
    print("🔨 Criando executável com PyInstaller...")
    
    # Comando PyInstaller
    cmd = [
        'pyinstaller',
        '--onefile',
        '--windowed',
        '--name=VideoDownloader',
        '--icon=assets/icon.ico',  # Se tiver ícone
        '--add-data=browser-extension;browser-extension',
        '--hidden-import=tkinter',
        '--hidden-import=yt_dlp',
        '--hidden-import=requests',
        'src/videodl/main.py'
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print("✅ Executável criado com sucesso!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Erro ao criar executável: {e}")
        return False
    except FileNotFoundError:
        print("❌ PyInstaller não encontrado. Instale com: pip install pyinstaller")
        return False

def create_installer_script():
    """Cria script do Inno Setup para instalador"""
    
    installer_script = '''
[Setup]
AppName=Video Downloader IDM
AppVersion=1.0.0
AppPublisher=Seu Nome
AppPublisherURL=https://github.com/seu-usuario/video-downloader
DefaultDirName={autopf}\\VideoDownloader
DefaultGroupName=Video Downloader
AllowNoIcons=yes
OutputDir=dist\\installer
OutputBaseFilename=VideoDownloader_Setup
SetupIconFile=assets\\icon.ico
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar ícone na área de trabalho"; GroupDescription: "Ícones adicionais:"
Name: "quicklaunchicon"; Description: "Criar ícone na barra de tarefas"; GroupDescription: "Ícones adicionais:"
Name: "installextension"; Description: "Instalar extensão do Chrome automaticamente"; GroupDescription: "Extensão do navegador:"; Flags: checked

[Files]
Source: "dist\\VideoDownloader.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "browser-extension\\*"; DestDir: "{app}\\extension"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\\Video Downloader"; Filename: "{app}\\VideoDownloader.exe"
Name: "{group}\\{cm:UninstallProgram,Video Downloader}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\\Video Downloader"; Filename: "{app}\\VideoDownloader.exe"; Tasks: desktopicon
Name: "{userappdata}\\Microsoft\\Internet Explorer\\Quick Launch\\Video Downloader"; Filename: "{app}\\VideoDownloader.exe"; Tasks: quicklaunchicon

[Run]
Filename: "{app}\\VideoDownloader.exe"; Description: "Executar Video Downloader"; Flags: nowait postinstall skipifsilent
Filename: "{cmd}"; Parameters: "/c """echo Instalando extensão do Chrome...""""; Flags: runhidden; Tasks: installextension
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\\install_extension.ps1"""; Flags: runhidden; Tasks: installextension

[Code]
procedure InitializeWizard;
begin
  WizardForm.LicenseAcceptedRadio.Checked := True;
end;
'''
    
    # Salva o script
    script_path = Path("installer_script.iss")
    script_path.write_text(installer_script, encoding='utf-8')
    print(f"📄 Script do instalador criado: {script_path}")
    
    return script_path

def create_extension_installer():
    """Cria script PowerShell para instalar extensão"""
    
    powershell_script = '''
# Script para instalar extensão do Chrome automaticamente
$ErrorActionPreference = "SilentlyContinue"

Write-Host "Instalando extensão do Video Downloader..."

# Caminho da extensão
$ExtensionPath = Join-Path $PSScriptRoot "extension"
$ChromeExtensionsPath = "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Extensions"

# Cria diretório se não existir
if (!(Test-Path $ChromeExtensionsPath)) {
    New-Item -ItemType Directory -Path $ChromeExtensionsPath -Force
}

# Função para instalar extensão
function Install-ChromeExtension {
    param($ExtensionPath)
    
    try {
        # Lê manifest da extensão
        $ManifestPath = Join-Path $ExtensionPath "manifest.json"
        if (Test-Path $ManifestPath) {
            $Manifest = Get-Content $ManifestPath | ConvertFrom-Json
            $ExtensionId = [System.Guid]::NewGuid().ToString("N").Substring(0, 32)
            
            # Copia extensão para pasta do Chrome
            $TargetPath = Join-Path $ChromeExtensionsPath $ExtensionId
            Copy-Item -Path $ExtensionPath -Destination $TargetPath -Recurse -Force
            
            Write-Host "✅ Extensão instalada com sucesso!"
            
            # Registra no registry para ativar extensão
            $RegPath = "HKCU:\\Software\\Google\\Chrome\\Extensions\\$ExtensionId"
            New-Item -Path $RegPath -Force
            Set-ItemProperty -Path $RegPath -Name "path" -Value $TargetPath
            Set-ItemProperty -Path $RegPath -Name "version" -Value $Manifest.version
            
            Write-Host "📋 Instruções:"
            Write-Host "1. Abra o Chrome"
            Write-Host "2. Vá para chrome://extensions/"
            Write-Host "3. Ative 'Modo do desenvolvedor'"
            Write-Host "4. Clique em 'Carregar sem compactação'"
            Write-Host "5. Selecione a pasta: $TargetPath"
            
        } else {
            Write-Host "❌ Manifest.json não encontrado"
        }
    } catch {
        Write-Host "❌ Erro ao instalar extensão: $_"
        
        # Fallback: instruções manuais
        Write-Host ""
        Write-Host "📋 Instalação manual da extensão:"
        Write-Host "1. Abra o Chrome"
        Write-Host "2. Vá para chrome://extensions/"
        Write-Host "3. Ative 'Modo do desenvolvedor'"
        Write-Host "4. Clique em 'Carregar sem compactação'"
        Write-Host "5. Selecione a pasta: $ExtensionPath"
    }
}

# Instala a extensão
Install-ChromeExtension -ExtensionPath $ExtensionPath

Write-Host "Pressione qualquer tecla para continuar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
'''
    
    script_path = Path("install_extension.ps1")
    script_path.write_text(powershell_script, encoding='utf-8')
    print(f"📄 Script de instalação da extensão criado: {script_path}")
    
    return script_path

def create_build_script():
    """Cria script para automatizar todo o processo"""
    
    build_script = '''@echo off
echo 🚀 Construindo Video Downloader...
echo.

REM Instala dependências se necessário
echo 📦 Verificando dependências...
pip install pyinstaller yt-dlp requests tkinter

REM Cria executável
echo 🔨 Criando executável...
python build_installer.py

REM Se tiver Inno Setup instalado, cria instalador
if exist "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" (
    echo 📦 Criando instalador...
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" installer_script.iss
    echo ✅ Instalador criado em dist\\installer\\
) else (
    echo ⚠️ Inno Setup não encontrado. Download: https://jrsoftware.org/isdl.php
    echo ✅ Executável criado em dist\\VideoDownloader.exe
)

echo.
echo 🎉 Build concluído!
pause
'''
    
    script_path = Path("build.bat")
    script_path.write_text(build_script, encoding='utf-8')
    print(f"📄 Script de build criado: {script_path}")
    
    return script_path

def main():
    """Função principal"""
    print("🎯 Video Downloader - Criador de Instalador")
    print("=" * 50)
    
    # Verifica se está no diretório correto
    if not Path("src/videodl/main.py").exists():
        print("❌ Execute este script na raiz do projeto!")
        sys.exit(1)
    
    # Cria estrutura de diretórios
    Path("dist").mkdir(exist_ok=True)
    Path("dist/installer").mkdir(exist_ok=True)
    
    # Cria arquivos necessários
    create_installer_script()
    create_extension_installer()
    create_build_script()
    
    print("\n📋 Próximos passos:")
    print("1. Instale o Inno Setup: https://jrsoftware.org/isdl.php")
    print("2. Execute: build.bat")
    print("3. O instalador será criado em dist/installer/")
    
    print("\n🔧 Ou execute manualmente:")
    print("1. pip install pyinstaller")
    print("2. pyinstaller --onefile --windowed src/videodl/main.py")
    print("3. Use o Inno Setup com installer_script.iss")

if __name__ == "__main__":
    main()