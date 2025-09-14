# 🎥 Video Downloader - Sistema Completo

Um sistema avançado de download de vídeos com interface IDM personalizada e extensão Chrome integrada.

## 📦 Instalação Rápida

### Para Usuários Finais:

1. Baixe o arquivo `VideoDownloader_Setup.exe`
2. Execute como administrador
3. Siga o assistente de instalação
4. A extensão do Chrome será instalada automaticamente

### Para Desenvolvedores:

```bash
# Clone e instale dependências
git clone <repo>
cd video-downloader
pip install -r requirements.txt

# Build completo
build_complete.bat
```

## 🚀 Funcionalidades

### ✅ Sistema Principal

- **Interface IDM Personalizada**: Janela com título editável e barra de progresso
- **Download com Headers**: Suporte completo a sites protegidos
- **Títulos Inteligentes**: Detecção automática de títulos reais por site
- **Multi-thread**: Downloads simultâneos eficientes

### ✅ Extensão Chrome

- **Interceptação Universal**: Detecta vídeos em qualquer site
- **Notificações IDM**: Interface familiar para usuários IDM
- **Headers Completos**: Captura cookies, referrer e autenticação
- **Suporte Específico**: YouTube, Rocketseat, Hotmart e outros

### ✅ Sistema de Distribuição

- **Instalador Profissional**: Interface em português/inglês
- **Instalação Automática**: Extensão Chrome configurada automaticamente
- **Ícones Integrados**: Área de trabalho e menu iniciar
- **Desinstalação Limpa**: Remove todos os vestígios

## 🛠️ Arquitetura Técnica

### Backend (Python)

```
main.py                 # Servidor Flask principal
simple_idm_window.py    # Interface gráfica personalizada
requirements.txt        # Dependências Python
```

### Frontend (JavaScript)

```
browser-extension/
├── manifest.json           # Configuração da extensão
├── background.js           # Service worker
├── content-universal.js    # Injeção universal
├── popup.html/js          # Interface popup
└── icons/                 # Recursos visuais
```

### Build System

```
build_complete.bat      # Build automatizado completo
installer_script.iss    # Script Inno Setup
install_extension.ps1   # Instalador Chrome automático
create_icon.py         # Gerador de ícones
```

## 🎯 Fluxo de Funcionamento

1. **Detecção**: Extensão monitora requisições de vídeo
2. **Captura**: Headers completos e metadados são coletados
3. **Envio**: Dados transmitidos para aplicação Python via HTTP
4. **Interface**: Janela IDM personalizada com progresso real-time
5. **Download**: Multi-thread com retry automático

## 🔧 Configuração Avançada

### Sites Suportados

O sistema inclui detecção específica para:

- **YouTube**: Títulos e thumbnails automáticos
- **Rocketseat**: Aulas e conteúdo premium
- **Hotmart**: Cursos e materiais
- **Genérico**: Qualquer site com vídeos

### Personalização

```javascript
// Adicionar novo site em content-universal.js
function getSpecificVideoTitle(url) {
  if (url.includes("novosite.com")) {
    return document.querySelector(".titulo-video")?.textContent;
  }
  // ...
}
```

## 📋 Requisitos do Sistema

### Mínimos:

- Windows 10/11
- Chrome 88+
- Python 3.8+ (para desenvolvimento)
- 2GB RAM
- 100MB espaço em disco

### Recomendados:

- Windows 11
- Chrome 100+
- 8GB RAM
- SSD para downloads

## 🚀 Como Usar

### 1. Instalação

- Execute `VideoDownloader_Setup.exe`
- Aceite a instalação da extensão Chrome
- Reinicie o Chrome se necessário

### 2. Download de Vídeos

- Navegue até qualquer site com vídeos
- Clique no ícone da extensão ou aguarde notificação
- Personalize o nome do arquivo se desejar
- Acompanhe o progresso na janela IDM

### 3. Configurações

- Pasta de destino padrão: `Downloads/VideoDownloader`
- Qualidade automática: Melhor disponível
- Retry automático: 3 tentativas

## 🔧 Desenvolvimento

### Build Local

```bash
# Instalar dependências
pip install pyinstaller flask requests

# Build executável
pyinstaller --onefile --windowed main.py

# Build instalador (requer Inno Setup)
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer_script.iss
```

### Estrutura de Arquivos

```
video-downloader/
├── main.py                     # Backend Flask
├── simple_idm_window.py        # Interface gráfica
├── browser-extension/          # Extensão Chrome
├── dist/                       # Builds
├── assets/                     # Recursos
└── docs/                       # Documentação
```

### APIs Principais

```python
# Endpoint de download
POST /download
{
    "url": "https://video.mp4",
    "title": "Meu Vídeo",
    "headers": {"Referer": "..."}
}

# Resposta
{
    "success": true,
    "filename": "meu-video.mp4",
    "size": 50000000
}
```

## 📝 Licença

MIT License - Veja `LICENSE` para detalhes completos.

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📞 Suporte

- **Issues**: GitHub Issues
- **Documentação**: `docs/` folder
- **Exemplos**: `examples/` folder

---

**Desenvolvido com ❤️ usando Python, JavaScript e tecnologias web modernas.**
