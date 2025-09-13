# Video Downloader GUI (yt-dlp)

Aplicativo desktop simples em Python (Tkinter) para baixar vídeos ou áudio de diversas plataformas suportadas pelo `yt-dlp`.

## Funcionalidades (MVP)

- Inserir URL de vídeo ou playlist
- Listar formatos disponíveis (resolução, codec, tipo)
- Selecionar formato e diretório de destino
- Barra de progresso e status em tempo real
- Cancelar download
- Opção de extrair somente áudio (MP3)

## Requisitos

- Python 3.11+
- Dependências em `requirements.txt`
- (Opcional para áudio MP3 / thumbnail): `ffmpeg` instalado e presente no PATH

## Instalação

```bash
python -m venv .venv
source .venv/Scripts/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Uso (após implementação)

```bash
python -m src.videodl.main
```

Ou use o script de atalho (Windows):

```bash
run_app.bat
```

Linux/macOS:

```bash
chmod +x run_app.sh
./run_app.sh
```

## Aviso Legal

Este software deve ser utilizado apenas para baixar conteúdo que você tem permissão legal para armazenar. Respeite direitos autorais e termos de serviço das plataformas.

## Roadmap

- [x] Somente áudio (mp3)
- [x] Suporte básico playlist (download em lote com índice)
- [x] Thumbnail opcional
- [ ] Melhorar barra para múltiplos vídeos (progresso agregado)
- [ ] Testes unitários
- [ ] Empacotamento (PyInstaller)
- [ ] Verificação mais rica de ffmpeg (mostrar versão)
