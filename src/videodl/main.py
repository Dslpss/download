import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import logging
from typing import List, Optional
import os
import shutil
import json
import re
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse

# Import absoluto para evitar problemas no PyInstaller
try:
    from videodl.downloader import VideoDownloader, FormatInfo, DownloadCancelled
    from videodl import downloader as downloader_module
    from videodl.simple_idm_window import SimpleIDMWindow
except ImportError:
    # Fallback para desenvolvimento local
    from downloader import VideoDownloader, FormatInfo, DownloadCancelled
    import downloader as downloader_module
    from simple_idm_window import SimpleIDMWindow


# Verifica se pyperclip está disponível para monitoramento de clipboard
try:
    import importlib.util
    CLIPBOARD_AVAILABLE = importlib.util.find_spec("pyperclip") is not None
except Exception:
    CLIPBOARD_AVAILABLE = False
    print("pyperclip não disponível - funcionalidade de clipboard desabilitada")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VideoDownloaderHTTPHandler(BaseHTTPRequestHandler):
    """Handler HTTP para comunicação com extensão do navegador."""
    
    def __init__(self, app_instance, *args, **kwargs):
        self.app = app_instance
        super().__init__(*args, **kwargs)
    
    def do_OPTIONS(self):
        """Handle preflight CORS requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests from browser extension."""
        if self.path == '/download':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))

                url = data.get('url', '')
                title = data.get('title', '')
                source = data.get('source', 'unknown')
                # Novo: headers completos
                headers = data.get('headers', None)
                # Compatibilidade com formato antigo
                referer = data.get('referer', '')
                user_agent = data.get('user_agent', '')
                cookies = data.get('cookies', '')

                if url:
                    # Agenda na thread principal da GUI, agora com headers extras
                    self.app.after(0, self.app._handle_browser_request, url, title, source, headers, referer, user_agent, cookies)

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()

                    response = {'status': 'success', 'message': 'URL recebida'}
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                else:
                    self.send_error(400, 'URL não fornecida')

            except Exception as e:
                logger.error(f"Erro no servidor HTTP: {e}")
                self.send_error(500, str(e))
        else:
            self.send_error(404, 'Endpoint não encontrado')
    
    def do_GET(self):
        """Handle GET requests."""
        if self.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {'status': 'running', 'app': 'Video Downloader'}
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_error(404, 'Endpoint não encontrado')
    
    def log_message(self, format, *args):
        """Suprime logs do servidor HTTP."""
        pass


class VideoDownloaderHTTPServer:
    """Servidor HTTP para comunicação com extensão do navegador."""
    
    def __init__(self, app_instance, port=8765):
        self.app = app_instance
        self.port = port
        self.server = None
        self.thread = None
        
    def create_handler(self):
        """Cria handler com referência ao app."""
        def handler(*args, **kwargs):
            return VideoDownloaderHTTPHandler(self.app, *args, **kwargs)
        return handler
    
    def start(self):
        """Inicia o servidor HTTP."""
        try:
            self.server = HTTPServer(('localhost', self.port), self.create_handler())
            self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.thread.start()
            logger.info(f"Servidor HTTP iniciado na porta {self.port}")
            return True
        except Exception as e:
            logger.error(f"Erro ao iniciar servidor HTTP: {e}")
            return False
    
    def stop(self):
        """Para o servidor HTTP."""
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            if self.thread:
                self.thread.join(timeout=1)
            logger.info("Servidor HTTP parado")


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Video Downloader (yt-dlp)")
        self.geometry("880x560")

        self.downloader = VideoDownloader()
        self.formats: List[FormatInfo] = []
        self.selected_format: Optional[str] = None
        self.playlist_info: Optional[dict] = None
        self.playlist_videos: List[dict] = []
        self.selected_video_indices: List[int] = []
        
        # Variáveis para monitoramento de clipboard
        self.clipboard_monitoring = False
        self.last_clipboard_content = ""
        self.clipboard_thread = None
        
        # Servidor HTTP para comunicação com extensão
        self.http_server = VideoDownloaderHTTPServer(self)
        self.browser_integration_enabled = False

        self._build_ui()
        self._load_prefs()
        self._check_ffmpeg()
        self._start_browser_integration()
        # salva preferências ao fechar
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        url_frame = ttk.Frame(self)
        url_frame.pack(fill='x', padx=6, pady=4)
        ttk.Label(url_frame, text="URL:").pack(side='left')
        self.url_var = tk.StringVar()
        self.url_entry = ttk.Entry(url_frame, textvariable=self.url_var, width=80)
        self.url_entry.pack(side='left', fill='x', expand=True, padx=4)
        # Bind para detectar quando URL é colada/digitada
        self.url_var.trace_add('write', self._on_url_changed)
        ttk.Button(url_frame, text="Listar Formatos", command=self.on_list_formats).pack(side='left')
        dest_frame = ttk.Frame(self)
        dest_frame.pack(fill='x', padx=6, pady=4)
        ttk.Label(dest_frame, text="Destino:").pack(side='left')
        self.dest_var = tk.StringVar()
        ttk.Entry(dest_frame, textvariable=self.dest_var, width=60).pack(side='left', fill='x', expand=True, padx=4)
        ttk.Button(dest_frame, text="Escolher...", command=self.on_choose_dir).pack(side='left')

        options_frame = ttk.Frame(self)
        options_frame.pack(fill='x', padx=6, pady=4)
        ttk.Label(options_frame, text="Formato:").pack(side='left')
        self.format_var = tk.StringVar()
        self.format_combo = ttk.Combobox(options_frame, textvariable=self.format_var, width=40, state='readonly')
        self.format_combo.pack(side='left', padx=4)

        self.audio_only_var = tk.BooleanVar()
        ttk.Checkbutton(options_frame, text="Somente áudio (mp3)", variable=self.audio_only_var, command=self.on_audio_only_toggle).pack(side='left', padx=8)
        self.playlist_var = tk.BooleanVar()
        ttk.Checkbutton(options_frame, text="Baixar playlist inteira", variable=self.playlist_var).pack(side='left', padx=8)
        self.thumb_var = tk.BooleanVar()
        ttk.Checkbutton(options_frame, text="Thumbnail", variable=self.thumb_var).pack(side='left', padx=8)
        self.prefer_mp4_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(options_frame, text="Preferir MP4 (compatível)", variable=self.prefer_mp4_var).pack(side='left', padx=8)

        # Segunda linha de opções para funcionalidades avançadas
        options_frame2 = ttk.Frame(self)
        options_frame2.pack(fill='x', padx=6, pady=2)
        
        if CLIPBOARD_AVAILABLE:
            self.clipboard_monitor_var = tk.BooleanVar()
            ttk.Checkbutton(options_frame2, text="🔍 Monitorar clipboard (detecta URLs automaticamente)", 
                           variable=self.clipboard_monitor_var, command=self.on_clipboard_toggle).pack(side='left', padx=8)
        
        self.always_on_top_var = tk.BooleanVar()
        ttk.Checkbutton(options_frame2, text="📌 Sempre no topo", 
                       variable=self.always_on_top_var, command=self.on_always_on_top_toggle).pack(side='left', padx=8)
        
        self.browser_integration_var = tk.BooleanVar()
        ttk.Checkbutton(options_frame2, text="🌐 Integração com navegador (como IDM)", 
                       variable=self.browser_integration_var, command=self.on_browser_integration_toggle).pack(side='left', padx=8)

        # Info frame para mostrar detalhes do vídeo/playlist
        info_frame = ttk.LabelFrame(self, text="Informações")
        info_frame.pack(fill='x', padx=6, pady=4)
        self.info_label = ttk.Label(info_frame, text="Cole uma URL e clique em 'Listar Formatos' para ver os detalhes", wraplength=800)
        self.info_label.pack(anchor='w', padx=4, pady=4)

        # disparar salvamento quando variáveis mudarem
        self.dest_var.trace_add('write', lambda *args: self._save_prefs())
        self.audio_only_var.trace_add('write', lambda *args: self._save_prefs())
        self.playlist_var.trace_add('write', lambda *args: self._save_prefs())
        self.thumb_var.trace_add('write', lambda *args: self._save_prefs())
        self.prefer_mp4_var.trace_add('write', lambda *args: self._save_prefs())

        action_frame = ttk.Frame(self)
        action_frame.pack(fill='x', padx=6, pady=4)
        self.download_btn = ttk.Button(action_frame, text="Baixar", command=self.on_download)
        self.download_btn.pack(side='left')
        self.cancel_btn = ttk.Button(action_frame, text="Cancelar", command=self.on_cancel, state='disabled')
        self.cancel_btn.pack(side='left', padx=4)
        self.select_videos_btn = ttk.Button(action_frame, text="📋 Selecionar Vídeos", command=self.on_select_videos, state='disabled')
        self.select_videos_btn.pack(side='left', padx=4)

        progress_frame = ttk.Frame(self)
        progress_frame.pack(fill='x', padx=6, pady=4)
        self.progress_var = tk.DoubleVar(value=0.0)
        self.progress_bar = ttk.Progressbar(progress_frame, variable=self.progress_var, maximum=100)
        self.progress_bar.pack(fill='x', expand=True)
        self.status_var = tk.StringVar(value="Pronto")
        ttk.Label(progress_frame, textvariable=self.status_var).pack(anchor='w')
        # variáveis para progresso de playlist
        self._playlist_total = 0
        self._current_index = 0

        log_frame = ttk.LabelFrame(self, text="Log")
        log_frame.pack(fill='both', expand=True, padx=6, pady=4)
        self.log_text = tk.Text(log_frame, height=12, wrap='word')
        self.log_text.pack(fill='both', expand=True)
        self.log_text.config(state='disabled')

    def log(self, msg: str):
        self.log_text.config(state='normal')
        self.log_text.insert('end', msg + "\n")
        self.log_text.see('end')
        self.log_text.config(state='disabled')

    def on_choose_dir(self):
        d = filedialog.askdirectory()
        if d:
            self.dest_var.set(d)

    def _check_ffmpeg(self):
        # Procura binário ffmpeg no PATH
        if not shutil.which('ffmpeg'):
            self.log("[AVISO] ffmpeg não encontrado no PATH. Funções de extração de áudio/thumbnail e mesclagem podem falhar.")
            # Aviso único via messagebox
            if not hasattr(self, '_ffmpeg_warned'):
                self._ffmpeg_warned = True
                try:
                    messagebox.showinfo(
                        "ffmpeg ausente",
                        "O ffmpeg não foi encontrado no PATH.\n\nSem ele, o app tentará baixar formatos 'progressivos' (vídeo+áudio juntos), mas nem sempre estão disponíveis.\n\nPara melhor compatibilidade, instale o ffmpeg (recomendado)."
                    )
                except Exception:
                    pass

    def on_audio_only_toggle(self):
        if self.audio_only_var.get():
            self.format_combo.set('')
            self.format_combo.config(state='disabled')
        else:
            self.format_combo.config(state='readonly')

    def on_list_formats(self):
        import logging
        logger = logging.getLogger("analyze_url")
        if getattr(downloader_module, 'YoutubeDL', None) is None:
            messagebox.showerror("Dependência ausente", "yt_dlp não está instalado. Instale com: pip install yt-dlp")
            return
        url = self.url_var.get().strip()
        logger.info(f"[on_list_formats] URL recebida: {url}")
        if not url:
            logger.warning("[on_list_formats] Campo de URL vazio!")
            messagebox.showwarning("Aviso", "Informe a URL")
            return
        if not (url.startswith('http://') or url.startswith('https://')):
            logger.warning(f"[on_list_formats] URL inválida: {url}")
            messagebox.showwarning("Aviso", "URL inválida")
            return
        # Log headers se existirem
        extra_headers = getattr(self, '_last_headers', None)
        if extra_headers:
            logger.info(f"[on_list_formats] Headers recebidos: {extra_headers}")
        else:
            logger.info("[on_list_formats] Nenhum header extra recebido.")
        self.status_var.set("Listando formatos...")
        self.formats = []
        self.format_combo.set('')
        self.info_label.config(text="🔍 Analisando URL... (pode demorar um pouco)")
        def worker():
            try:
                logger.info("[on_list_formats] Obtendo informações da playlist/vídeo...")
                self.after(0, lambda: self.info_label.config(text="📊 Obtendo informações da playlist..."))
                playlist_info = self.downloader.get_playlist_info(url, extra_headers)
                logger.info(f"[on_list_formats] playlist_info: {playlist_info}")
                # Atualizar UI com info da playlist primeiro
                if playlist_info:
                    if playlist_info.get('is_playlist'):
                        count_text = f"{playlist_info.get('count', 0)} vídeos"
                        info_text = f"📋 PLAYLIST: {playlist_info.get('title', 'Sem título')} ({count_text})"
                        if playlist_info.get('first_video_title'):
                            info_text += f"\n🎬 Primeiro vídeo: {playlist_info.get('first_video_title')}"
                    else:
                        info_text = f"🎬 VÍDEO: {playlist_info.get('title', 'Sem título')}"
                    self.after(0, lambda: self.info_label.config(text=info_text))
                # Depois, obter formatos (pode ser mais lento)
                self.after(0, lambda: self.status_var.set("Obtendo formatos de vídeo..."))
                logger.info("[on_list_formats] Chamando list_formats...")
                fmts = self.downloader.list_formats(url, extra_headers)
                logger.info(f"[on_list_formats] Formatos encontrados: {len(fmts)}")
                self.formats = fmts
                # Carregar lista de vídeos se for playlist
                playlist_videos = []
                if playlist_info and playlist_info.get('is_playlist'):
                    self.after(0, lambda: self.status_var.set("Carregando lista de vídeos..."))
                    playlist_videos = self.downloader.get_playlist_videos(url, extra_headers)
                def _label(fmt: FormatInfo) -> str:
                    audio_flag = '' if (fmt.acodec and fmt.acodec != 'none') else ' [sem áudio]'
                    fps = f"@{fmt.fps}fps" if fmt.fps else ''
                    size = f" ~{fmt.filesize/1_000_000:.1f}MB" if fmt.filesize else ''
                    return f"{fmt.itag} | {fmt.resolution}{fps} | {fmt.ext}{audio_flag}{size} | {fmt.note}"
                items = [_label(f) for f in fmts]
                def update():
                    self.format_combo['values'] = items
                    self.status_var.set(f"✅ {len(items)} formatos encontrados")
                    # Salvar informações da playlist
                    self.playlist_info = playlist_info
                    self.playlist_videos = playlist_videos
                    self.selected_video_indices = []  # Reset seleção
                    # Habilitar/desabilitar botão de seleção
                    if playlist_info and playlist_info.get('is_playlist'):
                        self.select_videos_btn.config(state='normal')
                    else:
                        self.select_videos_btn.config(state='disabled')
                    # Manter as informações da playlist na UI
                    if playlist_info and playlist_info.get('is_playlist'):
                        count_text = f"{playlist_info.get('count', 0)} vídeos"
                        info_text = f"📋 PLAYLIST: {playlist_info.get('title', 'Sem título')} ({count_text})"
                        if playlist_info.get('first_video_title'):
                            info_text += f"\n🎬 Primeiro vídeo: {playlist_info.get('first_video_title')}"
                        info_text += f"\n✅ Formatos carregados - pronto para download!"
                        self.info_label.config(text=info_text)
                    elif playlist_info:
                        info_text = f"🎬 VÍDEO: {playlist_info.get('title', 'Sem título')}\n✅ Formatos carregados - pronto para download!"
                        self.info_label.config(text=info_text)
                self.after(0, update)
            except Exception as e:
                logger.error(f"[on_list_formats] Erro ao analisar URL: {e}")
                self.after(0, lambda: messagebox.showerror("Erro", str(e)))
                self.after(0, lambda: self.status_var.set("❌ Erro ao listar"))
                self.after(0, lambda: self.info_label.config(text="❌ Erro ao carregar informações"))
        threading.Thread(target=worker, daemon=True).start()

    def on_select_videos(self):
        """Abre janela para seleção de vídeos da playlist."""
        if not self.playlist_videos:
            messagebox.showwarning("Aviso", "Nenhuma playlist carregada")
            return
            
        selector = PlaylistSelectorWindow(self, self.playlist_videos, self.downloader)
        self.wait_window(selector.window)
        
        # Atualizar seleção após fechar a janela
        if selector.selected_indices:
            self.selected_video_indices = selector.selected_indices
            count = len(self.selected_video_indices)
            
            # Atualizar info para mostrar quantos vídeos foram selecionados
            if self.playlist_info:
                total_count = self.playlist_info.get('count', 0)
                info_text = f"📋 PLAYLIST: {self.playlist_info.get('title', 'Sem título')} ({total_count} vídeos)\n"
                info_text += f"✅ {count} vídeos selecionados para download"
                self.info_label.config(text=info_text)
                
                # Habilitar modo playlist automaticamente
                self.playlist_var.set(True)
        else:
            # Reset se cancelou
            self.selected_video_indices = []

    def on_download(self):
        if getattr(downloader_module, 'YoutubeDL', None) is None:
            messagebox.showerror("Dependência ausente", "yt_dlp não está instalado. Instale com: pip install yt-dlp")
            return
        url = self.url_var.get().strip()
        outdir = self.dest_var.get().strip()
        if not url:
            messagebox.showwarning("Aviso", "Informe a URL")
            return
        if not outdir:
            messagebox.showwarning("Aviso", "Escolha a pasta de destino")
            return
        if not os.path.isdir(outdir):
            messagebox.showwarning("Aviso", "Diretório de destino inválido")
            return
        if not (url.startswith('http://') or url.startswith('https://')):
            messagebox.showwarning("Aviso", "URL inválida")
            return
        only_audio = self.audio_only_var.get()
        fmt_id = None
        if not only_audio:
            sel = self.format_combo.get()
            if sel:
                fmt_id = sel.split('|')[0].strip()
            elif self.formats:
                # Se nenhum selecionado, pega melhor (None) - ok
                pass
            else:
                self.log("Nenhum formato listado; usando 'best'")
        self.download_btn.config(state='disabled')
        self.cancel_btn.config(state='normal')
        self.status_var.set("Iniciando download...")
        self.progress_var.set(0)
        self.log(f"Iniciando: {url}")

        def progress_hook(d):
            status = d.get('status')
            playlist_index = d.get('playlist_index') or None
            playlist_count = d.get('playlist_count') or None
            if playlist_index and playlist_count:
                # inicializa se mudou
                if self._playlist_total != playlist_count:
                    self._playlist_total = playlist_count
                if playlist_index != self._current_index:
                    self._current_index = playlist_index
            if status == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes') or 0
                percent_item = (downloaded / total * 100) if total else 0
                # progresso agregado se playlist
                if self._playlist_total and self._current_index:
                    global_percent = ((self._current_index - 1) + percent_item / 100.0) / self._playlist_total * 100.0
                else:
                    global_percent = percent_item
                speed = d.get('speed')
                eta = d.get('eta')
                
                # Atualiza interface principal
                self.after(0, lambda p=global_percent, s=speed, e=eta, pi=playlist_index, pc=playlist_count, pi_pct=percent_item: self._update_progress(p, s, e, pi, pc, pi_pct))
                
                # Atualiza janela IDM se existir
                if hasattr(self, '_idm_window') and self._idm_window:
                    # Formata informações para a janela IDM
                    speed_text = f"{speed/1024/1024:.1f} MB/s" if speed else "Calculando..."
                    eta_text = f"{eta}s restantes" if eta else "Calculando tempo..."
                    size_text = f"{downloaded/1024/1024:.1f} MB / {total/1024/1024:.1f} MB" if total else f"{downloaded/1024/1024:.1f} MB"
                    
                    status_text = f"📥 Baixando... {global_percent:.1f}%"
                    details_text = f"🚀 {speed_text} | ⏱️ {eta_text} | 💾 {size_text}"
                    
                    self.after(0, lambda: self._idm_window.update_progress(global_percent, status_text, details_text))
                    
            elif status == 'finished':
                # ao terminar um item, atualizar para 100% daquele item e refletir agregado
                if self._playlist_total and self._current_index:
                    global_percent = (self._current_index / self._playlist_total) * 100.0
                else:
                    global_percent = 100.0
                self.after(0, lambda: self.progress_var.set(global_percent))
                self.after(0, lambda: self.status_var.set("Processando (pós) ..."))

        playlist_mode = self.playlist_var.get()
        write_thumb = self.thumb_var.get()

        def worker():
            try:
                # Usar seleção específica se disponível
                selected_items = self.selected_video_indices if self.selected_video_indices else None
                # Headers HTTP completos se vieram do navegador
                extra_headers = getattr(self, '_last_headers', None)
                # Título personalizado se fornecido
                custom_filename = getattr(self, '_custom_filename', None)
                if custom_filename:
                    self.log(f"📝 Usando título personalizado: {custom_filename}")
                
                self.downloader.download(
                    url, outdir, fmt_id, only_audio,
                    playlist_mode=playlist_mode,
                    write_thumbnail=write_thumb,
                    prefer_mp4=self.prefer_mp4_var.get(),
                    ensure_audio=True,
                    selected_items=selected_items,
                    progress_cb=progress_hook,
                    extra_headers=extra_headers,
                    custom_filename=custom_filename
                )
                self.after(0, lambda: self.status_var.set("Concluído"))
                self.after(0, lambda: self.log("Concluído"))
                
                # Finaliza janela IDM se existir
                if hasattr(self, '_idm_window') and self._idm_window:
                    filename = custom_filename or "Arquivo baixado"
                    self.after(0, lambda: self._idm_window.finish_download(True, f"Salvo como: {filename}"))
                    
            except DownloadCancelled:
                self.after(0, lambda: self.status_var.set("Cancelado"))
                self.after(0, lambda: self.log("Cancelado"))
                
                # Finaliza janela IDM com erro se existir
                if hasattr(self, '_idm_window') and self._idm_window:
                    self.after(0, lambda: self._idm_window.finish_download(False, "Download cancelado pelo usuário"))
                    
            except Exception as e:
                self.after(0, lambda: self.status_var.set("Erro"))
                self.after(0, lambda: self.log(f"Erro: {e}"))
                
                # Finaliza janela IDM com erro se existir
                if hasattr(self, '_idm_window') and self._idm_window:
                    self.after(0, lambda: self._idm_window.finish_download(False, f"Erro: {str(e)}"))
                    
            finally:
                self.after(0, lambda: self.download_btn.config(state='normal'))
                self.after(0, lambda: self.cancel_btn.config(state='disabled'))
                # Limpa referência da janela IDM
                if hasattr(self, '_idm_window'):
                    self._idm_window = None
        threading.Thread(target=worker, daemon=True).start()

    def _update_progress(self, global_percent, speed, eta, playlist_index=None, playlist_count=None, item_percent=None):
        self.progress_var.set(global_percent)
        speed_str = f" {speed/1024:.1f} KB/s" if speed else ''
        eta_str = f" ETA {eta}s" if eta else ''
        if playlist_index and playlist_count:
            item_part = f" Item {playlist_index}/{playlist_count}"
            if item_percent is not None:
                item_part += f" ({item_percent:.1f}% do item)"
            self.status_var.set(f"Playlist: {global_percent:.1f}%{item_part}{speed_str}{eta_str}")
        else:
            self.status_var.set(f"Baixando: {global_percent:.1f}%{speed_str}{eta_str}")

    def on_cancel(self):
        self.downloader.cancel()
        self.log("Cancelando...")
        self.status_var.set("Cancelando...")

    # ---------------- Preferências -----------------
    def _config_path(self) -> str:
        base = os.getenv('APPDATA') or os.path.expanduser('~')
        cfg_dir = os.path.join(base, 'VideoDL')
        try:
            os.makedirs(cfg_dir, exist_ok=True)
        except Exception:
            cfg_dir = os.path.expanduser('~')
        return os.path.join(cfg_dir, 'config.json')

    def _load_prefs(self):
        try:
            with open(self._config_path(), 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            data = {}
        # aplica prefs
        if isinstance(data, dict):
            dest_dir = data.get('dest_dir')
            if isinstance(dest_dir, str) and dest_dir and os.path.isdir(dest_dir):
                self.dest_var.set(dest_dir)
            if 'prefer_mp4' in data:
                self.prefer_mp4_var.set(bool(data['prefer_mp4']))
            if 'audio_only' in data:
                self.audio_only_var.set(bool(data['audio_only']))
                self.on_audio_only_toggle()
            if 'playlist' in data:
                self.playlist_var.set(bool(data['playlist']))
            if 'thumbnail' in data:
                self.thumb_var.set(bool(data['thumbnail']))
            if CLIPBOARD_AVAILABLE and 'clipboard_monitor' in data:
                self.clipboard_monitor_var.set(bool(data['clipboard_monitor']))
            if 'always_on_top' in data:
                self.always_on_top_var.set(bool(data['always_on_top']))
                self.attributes('-topmost', self.always_on_top_var.get())
            if 'browser_integration' in data:
                self.browser_integration_var.set(bool(data['browser_integration']))

    def _save_prefs(self):
        data = {
            'dest_dir': self.dest_var.get().strip(),
            'prefer_mp4': bool(self.prefer_mp4_var.get()),
            'audio_only': bool(self.audio_only_var.get()),
            'playlist': bool(self.playlist_var.get()),
            'thumbnail': bool(self.thumb_var.get()),
            'always_on_top': bool(self.always_on_top_var.get()),
            'browser_integration': bool(self.browser_integration_var.get()),
        }
        if CLIPBOARD_AVAILABLE:
            data['clipboard_monitor'] = bool(self.clipboard_monitor_var.get())
        try:
            with open(self._config_path(), 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _on_url_changed(self, *args):
        """Chamado quando a URL é alterada - oferece análise automática."""
        url = self.url_var.get().strip()
        if url and self._is_video_url(url):
            # Pequeno delay para não disparar enquanto o usuário ainda está digitando
            self.after(1500, self._suggest_auto_analysis, url)
    
    def _suggest_auto_analysis(self, url: str):
        """Sugere análise automática da URL após delay."""
        current_url = self.url_var.get().strip()
        if current_url == url and self._is_video_url(url):
            # Só sugere se não temos formatos carregados ainda
            if not self.formats:
                result = messagebox.askyesno(
                    "🎬 Analisar automaticamente?",
                    f"Detectei uma URL de vídeo!\n\nQuer que eu analise automaticamente para ver os formatos disponíveis?",
                    icon='question'
                )
            if result:
                self.on_list_formats()

    def _start_auto_download(self):
        """Inicia análise e download automático (estilo IDM)."""
        self.log("🚀 Iniciando download automático estilo IDM...")
        
        # Primeiro analisa o vídeo
        self.on_list_formats()
        
        # Agenda o download para depois da análise (aguarda 3 segundos)
        self.after(3000, self._try_auto_download)
    
    def _try_auto_download(self):
        """Tenta iniciar download automático se os formatos estiverem carregados."""
        if self.formats:
            self.log("✅ Formatos carregados, iniciando download automático...")
            # Seleciona automaticamente o melhor formato (primeiro da lista)
            if self.formats:
                self.selected_format = self.formats[0].itag
                self.log(f"📱 Formato selecionado automaticamente: {self.formats[0].itag} ({self.formats[0].resolution})")
                # Inicia o download
                self.on_download()
            else:
                self.log("⚠️ Nenhum formato encontrado para download automático")
        else:
            self.log("⏳ Aguardando formatos carregarem...")
            # Tenta novamente em 1 segundo
            self.after(1000, self._try_auto_download)
    
    def _is_video_url(self, url: str) -> bool:
        """Verifica se a URL é de um site de vídeo suportado."""
        video_patterns = [
            r'youtube\.com/watch',
            r'youtu\.be/',
            r'youtube\.com/playlist',
            r'vimeo\.com/',
            r'dailymotion\.com/',
            r'twitch\.tv/',
            r'tiktok\.com/',
            r'instagram\.com/',
            r'facebook\.com/.*video',
            r'twitter\.com/.*status',
            r'reddit\.com/.*comments'
        ]
        return any(re.search(pattern, url, re.IGNORECASE) for pattern in video_patterns)

    def _start_browser_integration(self):
        """Inicia integração com navegador se habilitada."""
        if self.browser_integration_var.get():
            self.browser_integration_enabled = self.http_server.start()
            if self.browser_integration_enabled:
                self.log("🌐 Integração com navegador ativada (porta 8765)")
            else:
                self.log("❌ Erro ao ativar integração com navegador")
                self.browser_integration_var.set(False)

    def on_browser_integration_toggle(self):
        """Liga/desliga integração com navegador."""
        if self.browser_integration_var.get():
            if not self.browser_integration_enabled:
                success = self.http_server.start()
                if success:
                    self.browser_integration_enabled = True
                    self.log("🌐 Integração com navegador ativada! Instale a extensão para usar.")
                    self._show_extension_instructions()
                else:
                    self.log("❌ Erro ao ativar integração - porta 8765 pode estar em uso")
                    self.browser_integration_var.set(False)
        else:
            if self.browser_integration_enabled:
                self.http_server.stop()
                self.browser_integration_enabled = False
                self.log("🌐 Integração com navegador desativada")

    def _show_extension_instructions(self):
        """Mostra instruções para instalar a extensão."""
        instructions = """
🌐 INTEGRAÇÃO COM NAVEGADOR ATIVADA!

Para usar como o IDM:

1. 📁 Abra a pasta: browser-extension/
2. 🌐 Chrome/Edge: chrome://extensions/
3. 🔧 Ative "Modo desenvolvedor"
4. 📦 Clique "Carregar extensão sem compactação"
5. 📂 Selecione a pasta browser-extension/

Depois:
• 🎬 Navegue para qualquer vídeo
• 🔔 A extensão detecta automaticamente!
• 📥 Clique para baixar direto no app!

Funciona em: YouTube, Vimeo, etc.
        """
        messagebox.showinfo("🌐 Como usar integração com navegador", instructions)

    def _handle_browser_request(self, url: str, title: str, source: str, headers: dict = None, referer: str = "", user_agent: str = "", cookies: str = ""):
        """Processa requisição vinda do navegador - Abre janela IDM-like."""
        self.log(f"🌐 Vídeo detectado pelo navegador: {title[:50]}...")
        self.log(f"🔗 URL: {url}")
        self.log(f"📡 Headers: {len(headers or {})} headers recebidos")

        # Salva headers extras para uso no download
        self._last_headers = headers or {}
        self._last_referer = referer
        self._last_user_agent = user_agent
        self._last_cookies = cookies

        # Foca a janela principal
        self.lift()
        self.focus_force()

        # Abre janela IDM-like simples no thread principal
        try:
            self.log("🔧 Abrindo janela IDM-like...")
            
            # Cria e mostra a janela IDM
            idm_window = SimpleIDMWindow(self, url, title, headers)
            self.log("✅ Janela IDM criada, aguardando usuário...")
            
            # Aguarda resposta do usuário
            result, custom_title = idm_window.show()
            
            if result:
                self.log("✅ Usuário confirmou download!")
                # Usa título personalizado se fornecido
                if custom_title and custom_title.strip():
                    self.log(f"📝 Título personalizado: {custom_title}")
                    # Salva o título personalizado para usar no download
                    self._custom_filename = custom_title.strip()
                
                # Salva referência da janela IDM para atualizar progresso
                self._idm_window = idm_window
                
                self.url_var.set(url)
                # Agenda análise E download automático
                self.after(100, self._start_auto_download)
            else:
                self.log("❌ Usuário cancelou download")
                
        except Exception as e:
            import traceback
            self.log(f"❌ Erro na janela IDM: {e}")
            self.log(f"🔍 Traceback: {traceback.format_exc()}")
            # Fallback
            result = messagebox.askyesno(
                "🎬 Vídeo detectado!",
                f"Título: {title}\n\nQuer baixar este vídeo?",
                icon='question'
            )
            if result:
                self.url_var.set(url)
                self.on_list_formats()

    def on_clipboard_toggle(self):
        """Liga/desliga monitoramento de clipboard."""
        if not CLIPBOARD_AVAILABLE:
            return
            
        if self.clipboard_monitor_var.get():
            self.clipboard_monitoring = True
            self._start_clipboard_monitoring()
            self.log("🔍 Monitoramento de clipboard ativado")
        else:
            self.clipboard_monitoring = False
            self.log("🔍 Monitoramento de clipboard desativado")

    def _start_clipboard_monitoring(self):
        """Inicia thread de monitoramento do clipboard."""
        if self.clipboard_thread and self.clipboard_thread.is_alive():
            return
            
        self.clipboard_thread = threading.Thread(target=self._monitor_clipboard_worker, daemon=True)
        self.clipboard_thread.start()

    def _monitor_clipboard_worker(self):
        """Worker thread que monitora o clipboard."""
        if not CLIPBOARD_AVAILABLE:
            return

        # Importa pyperclip localmente para evitar erro de análise estática
        import pyperclip  # type: ignore

        while self.clipboard_monitoring:
            try:
                current_clipboard = pyperclip.paste()

                # Verifica se o conteúdo mudou e é uma URL de vídeo
                if (current_clipboard != self.last_clipboard_content and 
                    current_clipboard and 
                    self._is_video_url(current_clipboard)):

                    self.last_clipboard_content = current_clipboard

                    # Agenda a notificação na thread principal
                    self.after(0, self._show_clipboard_notification, current_clipboard)

            except Exception as e:
                print(f"Erro no monitoramento de clipboard: {e}")

            time.sleep(1)  # Verifica a cada segundo

    def _show_clipboard_notification(self, url: str):
        """Mostra notificação de URL detectada e oferece ação."""
        result = messagebox.askyesno(
            "🎬 URL de Vídeo Detectada!",
            f"Detectei uma URL de vídeo no clipboard:\n\n{url[:100]}{'...' if len(url) > 100 else ''}\n\nQuer analisar este vídeo/playlist?",
            icon='question'
        )
        
        if result:
            self.url_var.set(url)
            self.on_list_formats()

    def on_always_on_top_toggle(self):
        """Liga/desliga sempre no topo."""
        self.attributes('-topmost', self.always_on_top_var.get())
        if self.always_on_top_var.get():
            self.log("📌 Janela sempre no topo ativada")
        else:
            self.log("📌 Janela sempre no topo desativada")

    def _on_close(self):
        self.clipboard_monitoring = False  # Para o monitoramento
        if self.browser_integration_enabled:
            self.http_server.stop()  # Para o servidor HTTP
        self._save_prefs()
        self.destroy()


class PlaylistSelectorWindow:
    def __init__(self, parent, videos: List, downloader: VideoDownloader):
        self.parent = parent
        self.videos = videos
        self.downloader = downloader
        self.selected_indices: List[int] = []
        
        # Criar janela
        self.window = tk.Toplevel(parent)
        self.window.title("Selecionar Vídeos da Playlist")
        self.window.geometry("900x600")
        self.window.transient(parent)
        self.window.grab_set()
        
        self._build_ui()
        
    def _build_ui(self):
        # Cabeçalho com informações
        header_frame = ttk.Frame(self.window)
        header_frame.pack(fill='x', padx=10, pady=5)
        
        title_label = ttk.Label(header_frame, text=f"📋 Playlist com {len(self.videos)} vídeos", 
                               font=('TkDefaultFont', 12, 'bold'))
        title_label.pack()
        
        # Frame para controles de seleção
        controls_frame = ttk.Frame(self.window)
        controls_frame.pack(fill='x', padx=10, pady=5)
        
        ttk.Button(controls_frame, text="✅ Selecionar Todos", 
                  command=self._select_all).pack(side='left', padx=2)
        ttk.Button(controls_frame, text="❌ Desmarcar Todos", 
                  command=self._deselect_all).pack(side='left', padx=2)
        
        # Label de status
        self.status_label = ttk.Label(controls_frame, text="0 vídeos selecionados")
        self.status_label.pack(side='right')
        
        # Frame principal com scrollbar
        main_frame = ttk.Frame(self.window)
        main_frame.pack(fill='both', expand=True, padx=10, pady=5)
        
        # Canvas e scrollbar para lista de vídeos
        canvas = tk.Canvas(main_frame)
        scrollbar = ttk.Scrollbar(main_frame, orient="vertical", command=canvas.yview)
        self.scrollable_frame = ttk.Frame(canvas)
        
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Adicionar checkboxes para cada vídeo
        self.video_vars = []
        for i, video in enumerate(self.videos):
            self._create_video_checkbox(i, video)
            
        # Bind mousewheel ao canvas
        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1*(event.delta/120)), "units")
        canvas.bind_all("<MouseWheel>", _on_mousewheel)
        
        # Frame para botões de ação
        action_frame = ttk.Frame(self.window)
        action_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Button(action_frame, text="📥 Baixar Selecionados", 
                  command=self._download_selected).pack(side='right', padx=5)
        ttk.Button(action_frame, text="❌ Cancelar", 
                  command=self._cancel).pack(side='right', padx=5)
        
    def _create_video_checkbox(self, index: int, video: dict):
        """Cria checkbox para um vídeo específico."""
        var = tk.BooleanVar()
        self.video_vars.append(var)
        
        # Frame para este vídeo
        video_frame = ttk.Frame(self.scrollable_frame)
        video_frame.pack(fill='x', padx=5, pady=2)
        
        # Checkbox
        checkbox = ttk.Checkbutton(video_frame, variable=var, 
                                  command=self._update_status)
        checkbox.pack(side='left')
        
        # Informações do vídeo
        info_frame = ttk.Frame(video_frame)
        info_frame.pack(side='left', fill='x', expand=True, padx=5)
        
        # Título (linha principal)
        title_text = f"{video.get('index', index+1):03d}. {video.get('title', 'Sem título')}"
        title_label = ttk.Label(info_frame, text=title_text, font=('TkDefaultFont', 9, 'bold'))
        title_label.pack(anchor='w')
        
        # Informações extras (linha secundária)
        details = []
        if video.get('duration_string'):
            details.append(f"⏱️ {video['duration_string']}")
        if video.get('uploader'):
            details.append(f"👤 {video['uploader']}")
        if video.get('view_count'):
            views = self._format_views(video['view_count'])
            details.append(f"👁️ {views}")
            
        if details:
            details_text = " | ".join(details)
            details_label = ttk.Label(info_frame, text=details_text, 
                                    font=('TkDefaultFont', 8), foreground='gray')
            details_label.pack(anchor='w')
    
    def _format_views(self, views: int) -> str:
        """Formata número de visualizações."""
        if views >= 1000000:
            return f"{views/1000000:.1f}M"
        elif views >= 1000:
            return f"{views/1000:.1f}K"
        else:
            return str(views)
    
    def _select_all(self):
        """Seleciona todos os vídeos."""
        for var in self.video_vars:
            var.set(True)
        self._update_status()
    
    def _deselect_all(self):
        """Desmarca todos os vídeos."""
        for var in self.video_vars:
            var.set(False)
        self._update_status()
    
    def _update_status(self):
        """Atualiza o status de seleção."""
        selected_count = sum(1 for var in self.video_vars if var.get())
        self.status_label.config(text=f"{selected_count} vídeos selecionados")
    
    def _download_selected(self):
        """Inicia download dos vídeos selecionados."""
        self.selected_indices = [
            video['index'] for i, video in enumerate(self.videos)
            if self.video_vars[i].get()
        ]
        
        if not self.selected_indices:
            messagebox.showwarning("Aviso", "Selecione pelo menos um vídeo para baixar!")
            return
            
        self.window.destroy()
        
    def _cancel(self):
        """Cancela a seleção."""
        self.selected_indices = []
        self.window.destroy()


def main():
    app = App()
    app.mainloop()

if __name__ == '__main__':
    main()
