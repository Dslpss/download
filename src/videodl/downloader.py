import threading
import logging
import os
import re
import shutil
from typing import List, Dict, Callable, Optional, Any
from dataclasses import dataclass

try:
    from yt_dlp import YoutubeDL  # type: ignore
except Exception:  # cobertura ampla: ImportError + outros problemas de ambiente
    YoutubeDL = None  # type: ignore

logger = logging.getLogger(__name__)

@dataclass
class FormatInfo:
    itag: str
    ext: str
    resolution: str
    fps: Optional[int]
    vcodec: str
    acodec: str
    filesize: Optional[int]
    note: str

class DownloadCancelled(Exception):
    pass

class VideoDownloader:
    def __init__(self):
        self._cancel_flag = False
        self._lock = threading.Lock()

    def cancel(self):
        with self._lock:
            self._cancel_flag = True

    def reset_cancel(self):
        with self._lock:
            self._cancel_flag = False

    def _check_cancel(self):
        with self._lock:
            if self._cancel_flag:
                raise DownloadCancelled("Download cancelado pelo usuário")

    def list_formats(self, url: str) -> List[FormatInfo]:
        """Retorna formatos do primeiro vídeo (mesmo em playlist).
        Mantemos simples para seleção única aplicada a todos os vídeos na playlist.
        """
        if YoutubeDL is None:
            raise RuntimeError("yt_dlp não está instalado ou falhou ao importar.")
        ydl_opts = {"skip_download": True, "quiet": True, "no_warnings": True}
        formats: List[FormatInfo] = []
        with YoutubeDL(ydl_opts) as ydl:  # type: ignore
            info = ydl.extract_info(url, download=False)
            if not info:
                return []
            if isinstance(info, dict) and info.get('entries'):
                for entry in info.get('entries', []) or []:
                    if entry:
                        info = entry
                        break
            # segurança: se ainda não for dict esperado
            if not isinstance(info, dict):
                return []
            for f in (info.get('formats') or []):
                if not isinstance(f, dict):
                    continue
                if not f.get('url'):
                    continue
                fmt = FormatInfo(
                    itag=str(f.get('format_id')),
                    ext=f.get('ext') or '',
                    resolution=f.get('resolution') or (f.get('height') and f"{f.get('height')}p") or 'audio',
                    fps=f.get('fps'),
                    vcodec=f.get('vcodec') or 'none',
                    acodec=f.get('acodec') or 'none',
                    filesize=f.get('filesize') or f.get('filesize_approx'),
                    note=f.get('format_note') or ''
                )
                formats.append(fmt)
        return formats

    def _sanitize(self, name: str) -> str:
        return re.sub(r'[\\/:*?"<>|]', '_', name)

    # Interface pública para sanitização (útil para testes e outras camadas)
    def sanitize_filename(self, name: str) -> str:
        return self._sanitize(name)

    def download(self, url: str, output_dir: str, format_id: Optional[str], only_audio: bool,
                 playlist_mode: bool = False, write_thumbnail: bool = False,
                 prefer_mp4: bool = True,
                 ensure_audio: bool = True,
                 progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None):
        """Baixa vídeo(s).
        playlist_mode: se True não força noplaylist e usa template indexado.
        write_thumbnail: salva thumbnail (se disponível) convertida para jpg.
        """
        if YoutubeDL is None:
            raise RuntimeError("yt_dlp não está instalado ou falhou ao importar.")
        self.reset_cancel()
        os.makedirs(output_dir, exist_ok=True)

        def _hook(d):
            if d.get('status') == 'downloading':
                try:
                    self._check_cancel()
                except DownloadCancelled:
                    raise
            if progress_cb:
                # Envia dados extras de playlist se existirem
                info_dict = d.get('info_dict') or {}
                if 'playlist_index' in info_dict and info_dict.get('playlist_count'):
                    d['playlist_index'] = info_dict.get('playlist_index')
                    d['playlist_count'] = info_dict.get('playlist_count')
                progress_cb(d)

        postprocessors = []
        ydl_format = format_id or 'best'
        ffmpeg_present = shutil.which('ffmpeg') is not None
        merging_attempted = False
        if only_audio:
            if not ffmpeg_present:
                raise RuntimeError("ffmpeg é necessário para extrair áudio em MP3. Instale o ffmpeg e tente novamente.")
            ydl_format = 'bestaudio/best'
            postprocessors.append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            })
        elif ensure_audio:
            if format_id:
                if ffmpeg_present:
                    # Tenta combinar vídeo selecionado com best audio; fallback para o próprio formato
                    if prefer_mp4:
                        # tenta priorizar streams que resultem em mp4
                        ydl_format = (
                            f"{format_id}+bestaudio[ext=m4a]/bestaudio/best/"
                            f"{format_id}"
                        )
                    else:
                        ydl_format = f"{format_id}+bestaudio/best/{format_id}"
                    merging_attempted = True
                else:
                    # Sem ffmpeg: preferir formato progressivo (com áudio embutido)
                    logger.info("ffmpeg ausente: escolhendo formato com áudio embutido (progressivo), ignorando merge.")
                    # Tenta preferir MP4 progressivo (h264+aac) pela compatibilidade
                    ydl_format = (
                        f"{format_id}/"
                        f"best[ext=mp4][acodec!=none][vcodec!=none]/"
                        f"best[acodec!=none][vcodec!=none]"
                    )
            else:
                if ffmpeg_present:
                    if prefer_mp4:
                        # prioriza trilhas que resultem em mp4 final
                        ydl_format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
                    else:
                        ydl_format = 'bestvideo+bestaudio/best'
                    merging_attempted = True
                else:
                    # Preferir MP4 progressivo
                    ydl_format = 'best[ext=mp4][acodec!=none][vcodec!=none]/best[acodec!=none][vcodec!=none]'
        if write_thumbnail:
            # baixa e converte para jpg
            postprocessors.append({'key': 'EmbedThumbnail'})
            postprocessors.append({'key': 'FFmpegMetadata'})
            postprocessors.append({'key': 'FFmpegThumbnailsConvertor', 'format': 'jpg'})
        outtmpl = f'{output_dir}/%(title)s.%(ext)s'
        if playlist_mode:
            # prefixo com índice para evitar overwrite e manter ordem
            outtmpl = f'{output_dir}/%(playlist_index)03d - %(title)s.%(ext)s'

        ydl_opts = {
            'format': ydl_format,
            'outtmpl': outtmpl,
            'progress_hooks': [_hook],
            'postprocessors': postprocessors,
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': True,
            'noplaylist': False if playlist_mode else True,
            'writethumbnail': write_thumbnail,
            'overwrites': False,  # prevenção overwrite básica
            'prefer_ffmpeg': True,
        }
        if merging_attempted:
            # Força container popular quando merge for necessário para maximizar compatibilidade
            ydl_opts['merge_output_format'] = 'mp4'
            # Otimiza cabeçalho para início rápido em alguns players
            ydl_opts['postprocessor_args'] = ['-movflags', '+faststart']
        with YoutubeDL(ydl_opts) as ydl:  # type: ignore
            try:
                ydl.download([url])
            except DownloadCancelled:
                logger.info("Download cancelado")
                raise

__all__ = ["VideoDownloader", "FormatInfo", "DownloadCancelled"]
