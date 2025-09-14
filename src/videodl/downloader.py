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

    def get_playlist_info(self, url: str, extra_headers: Optional[dict] = None) -> Dict[str, Any]:
        """Retorna informações da playlist/vídeo: título, contagem, etc."""
        if YoutubeDL is None:
            raise RuntimeError("yt_dlp não está instalado ou falhou ao importar.")
        ydl_opts = {
            "skip_download": True, 
            "quiet": True, 
            "no_warnings": True,
            "extract_flat": True,  # Extração rápida, só metadados
        }
        
        # Aplica headers para get_playlist_info também (IDM-like)
        if extra_headers:
            logger.info(f"[IDM-like] Aplicando {len(extra_headers)} headers para playlist_info")
            ydl_opts['http_headers'] = extra_headers
            
            # Configurações específicas para CDNs protegidos
            if 'Referer' in extra_headers:
                ydl_opts['referer'] = extra_headers['Referer']
            if 'User-Agent' in extra_headers:
                ydl_opts['user_agent'] = extra_headers['User-Agent']
            
            # Configurações adicionais para BunnyCDN e similares
            ydl_opts['cookiefile'] = None  # Usa cookies dos headers
            ydl_opts['nocheckcertificate'] = True  # Ignora certificados SSL problemáticos
            
            # Configuração especial para iframe embeds (como BunnyCDN)
            if 'iframe.mediadelivery.net' in url or 'bunnycdn' in url.lower():
                logger.info("[IDM-like] Detectado BunnyCDN em playlist_info - aplicando configurações específicas")
                ydl_opts['extract_flat'] = False  # Precisamos de dados completos para BunnyCDN
                # Configurações específicas para BunnyCDN
                ydl_opts['extractor_args'] = {
                    'generic': {
                        'allow_unplayable_formats': True,
                    }
                }
                # Força user agent específico para BunnyCDN
                ydl_opts['user_agent'] = extra_headers.get('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                # Força headers específicos
                ydl_opts['http_headers'].update({
                    'Accept': '*/*',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'identity',
                    'Origin': 'https://app.rocketseat.com.br',
                    'Sec-Fetch-Dest': 'video',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
                })
            
            # Configuração especial para Udemy
            elif 'udemy.com' in url.lower():
                logger.info("[IDM-like] Detectado Udemy - aplicando configurações específicas")
                ydl_opts['extract_flat'] = False  # Precisamos de dados completos 
                ydl_opts['nocheckcertificate'] = True
                # Headers específicos para Udemy
                ydl_opts['http_headers'].update({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                })
                # Configurações específicas para contornar proteções da Udemy
                ydl_opts['extractor_args'] = {
                    'udemy': {
                        'skip_subtitles': False,
                        'skip_hls': False,
                    }
                }
                # Força sleep entre requisições para evitar rate limiting
                ydl_opts['sleep_interval'] = 1
                ydl_opts['max_sleep_interval'] = 5
        with YoutubeDL(ydl_opts) as ydl:  # type: ignore
            info = ydl.extract_info(url, download=False)
            if not info:
                return {}
            if isinstance(info, dict):
                playlist_count = 0
                title = info.get('title', 'Desconhecido')
                
                if info.get('entries'):
                    # É uma playlist
                    entries = [e for e in info.get('entries', []) if e]
                    playlist_count = len(entries)
                    # Usa playlist_count do info se disponível
                    actual_count = info.get('playlist_count') or playlist_count
                    playlist_title = info.get('title') or 'Playlist'
                    first_title = entries[0].get('title', 'Sem título') if entries else ''
                    
                    return {
                        'is_playlist': True,
                        'title': playlist_title,
                        'count': actual_count,
                        'first_video_title': first_title,
                    }
                else:
                    # É um vídeo único
                    return {
                        'is_playlist': False,
                        'title': title,
                        'count': 1,
                        'first_video_title': title,
                    }
        return {}

    def get_playlist_videos(self, url: str, extra_headers: Optional[dict] = None) -> List[Dict[str, Any]]:
        """Retorna lista detalhada de vídeos de uma playlist."""
        if YoutubeDL is None:
            return []
        
        try:
            ydl_opts = {
                'quiet': True,
                'extract_flat': False,  # Precisamos dos dados completos
                'force_json': True,
            }
            
            # Aplica headers para get_playlist_videos também (IDM-like)
            if extra_headers:
                logger.info(f"[IDM-like] Aplicando {len(extra_headers)} headers para playlist_videos")
                ydl_opts['http_headers'] = extra_headers
                
                # Configurações específicas para CDNs protegidos
                if 'Referer' in extra_headers:
                    ydl_opts['referer'] = extra_headers['Referer']
                if 'User-Agent' in extra_headers:
                    ydl_opts['user_agent'] = extra_headers['User-Agent']
                
                # Configurações adicionais para BunnyCDN
                ydl_opts['cookiefile'] = None
                ydl_opts['nocheckcertificate'] = True
                
                # Configuração especial para Udemy
                if 'udemy.com' in url.lower():
                    logger.info("[IDM-like] Detectado Udemy em playlist_videos - aplicando configurações específicas")
                    # Headers específicos para Udemy
                    ydl_opts['http_headers'].update({
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'DNT': '1',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                    })
                    # Configurações específicas para contornar proteções da Udemy
                    ydl_opts['extractor_args'] = {
                        'udemy': {
                            'skip_subtitles': False,
                            'skip_hls': False,
                        }
                    }
                    # Força sleep entre requisições
                    ydl_opts['sleep_interval'] = 1
                    ydl_opts['max_sleep_interval'] = 5
            
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
            if not info:
                return []
                
            if isinstance(info, dict):
                entries = info.get('entries', [])
                if not entries:
                    # Vídeo único
                    return [{
                        'index': 1,
                        'id': info.get('id', ''),
                        'title': info.get('title', 'Sem título'),
                        'duration': info.get('duration'),
                        'duration_string': info.get('duration_string', ''),
                        'uploader': info.get('uploader', ''),
                        'view_count': info.get('view_count'),
                        'upload_date': info.get('upload_date', ''),
                        'webpage_url': info.get('webpage_url', url)
                    }]
                
                # Playlist
                videos = []
                for i, entry in enumerate(entries, 1):
                    if entry:  # Ignorar entradas None
                        video_info = {
                            'index': i,
                            'id': entry.get('id', ''),
                            'title': entry.get('title', f'Vídeo {i}'),
                            'duration': entry.get('duration'),
                            'duration_string': entry.get('duration_string', ''),
                            'uploader': entry.get('uploader', ''),
                            'view_count': entry.get('view_count'),
                            'upload_date': entry.get('upload_date', ''),
                            'webpage_url': entry.get('webpage_url', '')
                        }
                        videos.append(video_info)
                        
                return videos
                
        except Exception as e:
            print(f"Erro ao listar vídeos da playlist: {e}")
            return []
        
        return []  # Fallback caso nenhum caminho anterior seja tomado

    def list_formats(self, url: str, extra_headers: Optional[dict] = None) -> List[FormatInfo]:
        """Retorna formatos do primeiro vídeo (mesmo em playlist).
        Mantemos simples para seleção única aplicada a todos os vídeos na playlist.
        """
        if YoutubeDL is None:
            raise RuntimeError("yt_dlp não está instalado ou falhou ao importar.")
        
        # Configurações IDM-like para análise de formatos
        ydl_opts = {
            "skip_download": True, 
            "quiet": True, 
            "no_warnings": True,
            "extract_flat": False  # Precisamos dos formatos completos
        }
        
        # Aplica headers para análise também (IDM-like)
        if extra_headers:
            logger.info(f"[IDM-like] Aplicando {len(extra_headers)} headers para análise")
            ydl_opts['http_headers'] = extra_headers
            
            # Configurações específicas para CDNs protegidos
            if 'Referer' in extra_headers:
                ydl_opts['referer'] = extra_headers['Referer']
            if 'User-Agent' in extra_headers:
                ydl_opts['user_agent'] = extra_headers['User-Agent']
            
            # Configurações adicionais para BunnyCDN e similares
            ydl_opts['cookiefile'] = None  # Usa cookies dos headers
            ydl_opts['nocheckcertificate'] = True  # Ignora certificados SSL problemáticos
        
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

    def download_direct_url(self, url: str, output_dir: str, 
                          title: str = "video",
                          extra_headers: Optional[dict] = None,
                          progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None):
        """
        Baixa URL direta de vídeo (especialmente URLs interceptadas da Udemy)
        sem usar extratores do yt-dlp
        """

        import mimetypes, subprocess, requests
        self.reset_cancel()
        os.makedirs(output_dir, exist_ok=True)

        # Prepara headers
        headers = dict(extra_headers) if extra_headers else {}
        cookie_val = headers.get('Cookie')
        if isinstance(cookie_val, dict):
            headers['Cookie'] = '; '.join(f"{k}={v}" for k, v in cookie_val.items())
        elif isinstance(cookie_val, list):
            headers['Cookie'] = '; '.join(cookie_val)
        if 'User-Agent' not in headers:
            headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        if 'Referer' not in headers:
            headers['Referer'] = 'https://www.udemy.com/'

        # IDM-like: .m3u8/.mpd usa ffmpeg, .mp4/.ts usa requests
        ext = os.path.splitext(url.split('?')[0])[1].lower()
        outbase = os.path.join(output_dir, self._sanitize(title))
        if ext in ['.m3u8', '.mpd']:
            # Monta comando ffmpeg
            ffmpeg_cmd = [
                'ffmpeg', '-y',
                '-hide_banner', '-loglevel', 'info',
                '-headers', '\r\n'.join(f'{k}: {v}' for k, v in headers.items()) + '\r\n',
                '-i', url,
                '-c', 'copy',
                f'{outbase}.mp4'
            ]
            logger.info(f"[IDM-like] ffmpeg: {' '.join(ffmpeg_cmd)}")
            import re
            try:
                process = subprocess.Popen(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
                duration = None
                time_pattern = re.compile(r'time=(\d+):(\d+):(\d+)\.(\d+)')
                duration_pattern = re.compile(r'Duration: (\d+):(\d+):(\d+)\.(\d+)')
                last_percent = 0
                for line in process.stderr:
                    logger.debug(f"[ffmpeg] {line.rstrip()}")
                    if duration is None:
                        m = duration_pattern.search(line)
                        if m:
                            h, m_, s, ms = map(int, m.groups())
                            duration = h*3600 + m_*60 + s + ms/100.0
                    m = time_pattern.search(line)
                    if m and duration:
                        h, m_, s, ms = map(int, m.groups())
                        current = h*3600 + m_*60 + s + ms/100.0
                        percent = min(100, int(current/duration*100))
                        if percent > last_percent:
                            if progress_cb:
                                progress_cb({'status': 'downloading', '_percent_str': str(percent), '_speed_str': '', 'filename': f'{outbase}.mp4'})
                            last_percent = percent
                process.wait()
                if process.returncode != 0:
                    raise Exception(f'ffmpeg failed: {process.returncode}')
                logger.info(f"[IDM-like] Download ffmpeg concluído: {outbase}.mp4")
                if progress_cb:
                    progress_cb({'status': 'finished', 'filename': f'{outbase}.mp4'})
                return
            except Exception as e:
                logger.error(f"[IDM-like] Erro ffmpeg: {e}")
                raise
        elif ext in ['.mp4', '.ts']:
            # Download bruto via requests
            logger.info(f"[IDM-like] Download bruto: {url}")
            resp = requests.get(url, headers=headers, stream=True)
            resp.raise_for_status()
            outpath = f'{outbase}{ext}'
            with open(outpath, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            logger.info(f"[IDM-like] Download requests concluído: {outpath}")
            if progress_cb:
                progress_cb({'status': 'finished', 'filename': outpath})
            return
        # Fallback: yt-dlp
        if YoutubeDL is None:
            raise RuntimeError("yt_dlp não está instalado ou falhou ao importar.")
        def _hook(d):
            if d.get('status') == 'downloading':
                try:
                    self._check_cancel()
                except DownloadCancelled:
                    raise
            if progress_cb:
                progress_cb(d)
        ydl_opts = {
            'outtmpl': os.path.join(output_dir, f'{self._sanitize(title)}.%(ext)s'),
            'progress_hooks': [_hook],
            'no_warnings': False,
            'extractaudio': False,
            'audioformat': 'mp3',
            'format': 'best',
            'writesubtitles': False,
            'writeautomaticsub': False,
            'nocheckcertificate': True,
            'http_headers': headers,
            'socket_timeout': 30,
            'retries': 3,
            'sleep_interval': 1,
            'max_sleep_interval': 3,
        }
        with YoutubeDL(ydl_opts) as ydl:
            try:
                logger.info(f"[Direct Download] Fallback yt-dlp: {url}")
                ydl.download([url])
                logger.info(f"[Direct Download] Download concluído com sucesso")
            except Exception as e:
                logger.error(f"[Direct Download] Erro no download: {e}")
                raise

    def download(self, url: str, output_dir: str, format_id: Optional[str], only_audio: bool,
                 playlist_mode: bool = False, write_thumbnail: bool = False,
                 prefer_mp4: bool = True,
                 ensure_audio: bool = True,
                 selected_items: Optional[List[int]] = None,
                 progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
                 extra_headers: Optional[dict] = None,
                 custom_filename: Optional[str] = None):
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
        # Template de saída - usa título personalizado se fornecido
        if custom_filename:
            # Limpa caracteres inválidos do nome do arquivo
            safe_filename = "".join(c for c in custom_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
            if not safe_filename:
                safe_filename = "video_download"
            outtmpl = f'{output_dir}/{safe_filename}.%(ext)s'
        else:
            outtmpl = f'{output_dir}/%(title)s.%(ext)s'
            
        if playlist_mode:
            # prefixo com índice para evitar overwrite e manter ordem
            if custom_filename:
                safe_filename = "".join(c for c in custom_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
                if not safe_filename:
                    safe_filename = "video_download"
                outtmpl = f'{output_dir}/%(playlist_index)03d - {safe_filename}.%(ext)s'
            else:
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
        if extra_headers:
            # IDM-like: replica requisição exata com todos os headers
            logger.info(f"[IDM-like] Aplicando {len(extra_headers)} headers HTTP")
            ydl_opts['http_headers'] = extra_headers
            
            # Configurações adicionais para replicar comportamento IDM
            if 'User-Agent' in extra_headers:
                ydl_opts['user_agent'] = extra_headers['User-Agent']
            if 'Referer' in extra_headers:
                ydl_opts['referer'] = extra_headers['Referer']
            
            # Configurações específicas para CDNs protegidos (BunnyCDN, etc.)
            ydl_opts['cookiefile'] = None  # Usa cookies dos headers
            ydl_opts['nocheckcertificate'] = True  # Ignora certificados SSL
            ydl_opts['socket_timeout'] = 30  # Timeout para conexões lentas
            
            # Headers de autenticação específicos
            auth_headers = [h for h in extra_headers.keys() if 'auth' in h.lower() or 'token' in h.lower() or 'bearer' in h.lower()]
            if auth_headers:
                logger.info(f"[IDM-like] Headers de autenticação detectados: {auth_headers}")
                
            # Configuração especial para iframe embeds (como BunnyCDN)
            if 'iframe.mediadelivery.net' in url or 'bunnycdn' in url.lower():
                logger.info("[IDM-like] Detectado BunnyCDN - aplicando configurações específicas")
                ydl_opts['extract_flat'] = False
                ydl_opts['format'] = 'best'  # Força melhor qualidade disponível
                # Configurações específicas para BunnyCDN
                ydl_opts['extractor_args'] = {
                    'generic': {
                        'allow_unplayable_formats': True,
                    }
                }
                # Headers específicos para BunnyCDN
                if 'http_headers' not in ydl_opts:
                    ydl_opts['http_headers'] = {}
                ydl_opts['http_headers'].update({
                    'Accept': '*/*',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'identity',
                    'Origin': 'https://app.rocketseat.com.br',
                    'Sec-Fetch-Dest': 'video',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
                })
            
            # Configuração especial para Udemy
            elif 'udemy.com' in url.lower():
                logger.info("[IDM-like] Detectado Udemy no download - aplicando configurações específicas")
                # Headers específicos para Udemy
                if 'http_headers' not in ydl_opts:
                    ydl_opts['http_headers'] = {}
                ydl_opts['http_headers'].update({
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-GPC': '1'
                })
                # Configurações específicas para contornar proteções da Udemy
                ydl_opts['extractor_args'] = {
                    'udemy': {
                        'skip_subtitles': False,
                        'skip_hls': False,
                        'business': True,  # Tenta modo business da Udemy
                    }
                }
                # Configurações adicionais para Udemy
                ydl_opts['sleep_interval'] = 2  # Mais sleep para evitar rate limiting
                ydl_opts['max_sleep_interval'] = 10
                ydl_opts['socket_timeout'] = 60  # Timeout maior para Udemy
                ydl_opts['retries'] = 3  # Mais tentativas
        
        
        # Se temos itens selecionados específicos da playlist
        if selected_items and playlist_mode:
            # Converte lista de índices para string de ranges do yt-dlp
            playlist_items = ','.join(str(i) for i in selected_items)
            ydl_opts['playlist_items'] = playlist_items
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
