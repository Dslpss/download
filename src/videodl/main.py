import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import logging
from typing import List, Optional
import os
import shutil
import json

from .downloader import VideoDownloader, FormatInfo, DownloadCancelled
from . import downloader as downloader_module

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Video Downloader (yt-dlp)")
        self.geometry("880x560")

        self.downloader = VideoDownloader()
        self.formats: List[FormatInfo] = []
        self.selected_format: Optional[str] = None

        self._build_ui()
        self._load_prefs()
        self._check_ffmpeg()
        # salva preferências ao fechar
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        url_frame = ttk.Frame(self)
        url_frame.pack(fill='x', padx=6, pady=4)
        ttk.Label(url_frame, text="URL:").pack(side='left')
        self.url_var = tk.StringVar()
        ttk.Entry(url_frame, textvariable=self.url_var, width=80).pack(side='left', fill='x', expand=True, padx=4)
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
        if getattr(downloader_module, 'YoutubeDL', None) is None:
            messagebox.showerror("Dependência ausente", "yt_dlp não está instalado. Instale com: pip install yt-dlp")
            return
        url = self.url_var.get().strip()
        if not url:
            messagebox.showwarning("Aviso", "Informe a URL")
            return
        if not (url.startswith('http://') or url.startswith('https://')):
            messagebox.showwarning("Aviso", "URL inválida")
            return
        self.status_var.set("Listando formatos...")
        self.formats = []
        self.format_combo.set('')
        def worker():
            try:
                fmts = self.downloader.list_formats(url)
                self.formats = fmts
                def _label(fmt: FormatInfo) -> str:
                    audio_flag = '' if (fmt.acodec and fmt.acodec != 'none') else ' [sem áudio]'
                    fps = f"@{fmt.fps}fps" if fmt.fps else ''
                    size = f" ~{fmt.filesize/1_000_000:.1f}MB" if fmt.filesize else ''
                    return f"{fmt.itag} | {fmt.resolution}{fps} | {fmt.ext}{audio_flag}{size} | {fmt.note}"

                items = [_label(f) for f in fmts]
                def update():
                    self.format_combo['values'] = items
                    self.status_var.set(f"{len(items)} formatos encontrados")
                self.after(0, update)
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Erro", str(e)))
                self.after(0, lambda: self.status_var.set("Erro ao listar"))
        threading.Thread(target=worker, daemon=True).start()

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
                self.after(0, lambda p=global_percent, s=speed, e=eta, pi=playlist_index, pc=playlist_count, pi_pct=percent_item: self._update_progress(p, s, e, pi, pc, pi_pct))
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
                self.downloader.download(url, outdir, fmt_id, only_audio,
                                         playlist_mode=playlist_mode,
                                         write_thumbnail=write_thumb,
                                         prefer_mp4=self.prefer_mp4_var.get(),
                                         ensure_audio=True,
                                         progress_cb=progress_hook)
                self.after(0, lambda: self.status_var.set("Concluído"))
                self.after(0, lambda: self.log("Concluído"))
            except DownloadCancelled:
                self.after(0, lambda: self.status_var.set("Cancelado"))
                self.after(0, lambda: self.log("Cancelado"))
            except Exception as e:
                self.after(0, lambda: self.status_var.set("Erro"))
                self.after(0, lambda: self.log(f"Erro: {e}"))
            finally:
                self.after(0, lambda: self.download_btn.config(state='normal'))
                self.after(0, lambda: self.cancel_btn.config(state='disabled'))
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

    def _save_prefs(self):
        data = {
            'dest_dir': self.dest_var.get().strip(),
            'prefer_mp4': bool(self.prefer_mp4_var.get()),
            'audio_only': bool(self.audio_only_var.get()),
            'playlist': bool(self.playlist_var.get()),
            'thumbnail': bool(self.thumb_var.get()),
        }
        try:
            with open(self._config_path(), 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _on_close(self):
        self._save_prefs()
        self.destroy()


def main():
    app = App()
    app.mainloop()

if __name__ == '__main__':
    main()
