@echo off
REM Ativa venv se existir e executa a aplicação
REM Atualiza PATH para reconhecer ffmpeg instalado via Chocolatey
set "PATH=%PATH%;C:\ProgramData\chocolatey\bin"
IF EXIST .venv\Scripts\activate.bat (
  call .venv\Scripts\activate.bat
)
python -m src.videodl.main
