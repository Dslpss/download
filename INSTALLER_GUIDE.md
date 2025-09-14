# Video Downloader - Guia de Criação de Instalador

## 🎯 Objetivo

Criar um instalador profissional para Windows que instala:

- ✅ Aplicativo Python (executável)
- ✅ Extensão do Chrome
- ✅ Ícones e atalhos
- ✅ Desinstalador

## 🛠️ Ferramentas Necessárias

### 1. PyInstaller

```bash
pip install pyinstaller
```

### 2. Inno Setup (Gratuito)

Download: https://jrsoftware.org/isdl.php

## 🚀 Processo de Build

### Opção 1: Automático

```bash
python build_installer.py
build.bat
```

### Opção 2: Manual

#### Passo 1: Criar Executável

```bash
pyinstaller --onefile --windowed --name=VideoDownloader --add-data=browser-extension;browser-extension src/videodl/main.py
```

#### Passo 2: Compilar Instalador

```bash
# Use o Inno Setup para compilar installer_script.iss
```

## 📁 Estrutura Final

```
VideoDownloader_Setup.exe          # Instalador principal
├── VideoDownloader.exe            # Aplicativo principal
├── extension/                     # Extensão do Chrome
│   ├── manifest.json
│   ├── content-universal.js
│   └── ...
├── install_extension.ps1          # Script de instalação da extensão
└── README.md                      # Documentação
```

## 🔧 Funcionalidades do Instalador

### Durante a Instalação:

- ✅ Instala aplicativo em Program Files
- ✅ Cria atalhos (Desktop, Menu Iniciar)
- ✅ Registra no Windows (Add/Remove Programs)
- ✅ Opção de instalar extensão automaticamente

### Instalação da Extensão:

- 🎯 **Automática**: Script PowerShell copia arquivos
- 🎯 **Manual**: Instruções claras para usuário
- 🎯 **Compatível**: Chrome, Edge, Brave

### Desinstalação:

- ✅ Remove aplicativo completamente
- ✅ Remove atalhos
- ✅ Opção de manter configurações

## 📋 Alternativas Simples

### 1. Portable (Sem Instalador)

```
VideoDownloader_Portable.zip
├── VideoDownloader.exe
├── extension/
└── LEIA-ME.txt (instruções)
```

### 2. NSIS (Nullsoft Installer)

- Mais leve que Inno Setup
- Interface mais simples

### 3. WiX Toolset

- Padrão Microsoft
- Mais complexo mas profissional

## 🎨 Personalização

### Ícones:

- Criar .ico para Windows
- Usar no PyInstaller e Inno Setup

### Assinatura Digital:

```bash
signtool sign /f certificado.pfx /p senha VideoDownloader.exe
```

### Auto-Update:

- Implementar verificação de versão
- Download automático de updates

## 📱 Distribuição

### Microsoft Store:

- Converter para MSIX
- Processo de certificação

### GitHub Releases:

- Upload automático via GitHub Actions
- Controle de versões

### Site Próprio:

- Download direto
- Analytics de download

## 🔐 Considerações de Segurança

### Antivírus:

- PyInstaller pode gerar falsos positivos
- Submeter para análise (VirusTotal)
- Assinatura digital ajuda

### Permissões:

- Extensão: permissões mínimas necessárias
- Aplicativo: evitar admin se possível

## 🎯 Exemplo de Uso

```bash
# 1. Preparar ambiente
pip install pyinstaller

# 2. Executar build
python build_installer.py

# 3. Compilar com Inno Setup
# (interface gráfica ou linha de comando)

# 4. Testar instalador
VideoDownloader_Setup.exe
```

## 📊 Métricas e Analytics

### Telemetria Básica:

- Versão instalada
- Sistema operacional
- Sucesso/falha da instalação

### Feedback:

- Sistema de crash reports
- Logs de instalação
- Surveys de usuário
