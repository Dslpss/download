@echo off
REM Ativa venv se existir e executa a aplicação
REM Atualiza PATH para reconhecer ffmpeg instalado via Chocolatey
set "PATH=%PATH%;C:\ProgramData\chocolatey\bin"
IF EXIST .venv\Scripts\activate.bat (
  echo Ativando ambiente virtual...
  call .venv\Scripts\activate.bat
) ELSE (
  echo Ambiente virtual não encontrado, usando Python do sistema
)
echo Iniciando Video Downloader...
python -m src.videodl.main
