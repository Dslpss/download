import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
import os
from typing import Dict, List, Optional
import time

class IDMDownloadWindow:
    """Janela de download estilo IDM que aparece ao capturar vídeo da extensão."""
    
    def __init__(self, parent, url: str, title: str, headers: Optional[Dict] = None):
        print(f"[IDM] Inicializando janela IDM para: {title}")
        self.parent = parent
        self.url = url
        self.title = title
        self.headers = headers or {}
        self.cancelled = False
        
        print(f"[IDM] Criando janela Toplevel...")
        # Cria janela modal
        self.window = tk.Toplevel(parent)
        self.window.title("Video Downloader - Novo Download")
        self.window.geometry("600x450")
        self.window.resizable(False, False)
        
        print(f"[IDM] Centralizando janela...")
        # Centraliza na tela
        self.center_window()
        
        print(f"[IDM] Configurando estilo...")
        # Ícone e estilo IDM-like
        self.setup_style()
        
        print(f"[IDM] Criando interface...")
        # Interface
        self.create_interface()
        
        print(f"[IDM] Configurando modal...")
        # Modal
        self.window.transient(parent)
        self.window.grab_set()
        self.window.focus_set()
        
        # Evento de fechar
        self.window.protocol("WM_DELETE_WINDOW", self.on_cancel)
        print(f"[IDM] Janela IDM criada com sucesso!")
    
    def center_window(self):
        """Centraliza janela na tela."""
        self.window.update_idletasks()
        x = (self.window.winfo_screenwidth() // 2) - (600 // 2)
        y = (self.window.winfo_screenheight() // 2) - (450 // 2)
        self.window.geometry(f"600x450+{x}+{y}")
    
    def setup_style(self):
        """Configura estilo IDM-like."""
        self.window.configure(bg='#f0f0f0')
        
        # Style para widgets
        style = ttk.Style()
        style.theme_use('clam')
        
        # Cores IDM-like
        style.configure('IDM.TFrame', background='#f0f0f0')
        style.configure('IDM.TLabel', background='#f0f0f0', font=('Segoe UI', 9))
        style.configure('IDM.TButton', font=('Segoe UI', 9))
    
    def create_interface(self):
        """Cria interface estilo IDM."""
        
        # Header com ícone
        header_frame = ttk.Frame(self.window, style='IDM.TFrame')
        header_frame.pack(fill='x', padx=10, pady=10)
        
        # Ícone de download (simula IDM)
        icon_label = ttk.Label(header_frame, text="⬇️", font=('Arial', 20))
        icon_label.pack(side='left', padx=(0, 10))
        
        title_label = ttk.Label(header_frame, text="Novo Download Detectado", 
                               font=('Segoe UI', 12, 'bold'), style='IDM.TLabel')
        title_label.pack(side='left')
        
        # Separador
        sep1 = ttk.Separator(self.window, orient='horizontal')
        sep1.pack(fill='x', padx=10, pady=5)
        
        # Informações do arquivo
        info_frame = ttk.LabelFrame(self.window, text="Informações do Arquivo", padding=10)
        info_frame.pack(fill='x', padx=10, pady=5)
        
        # URL
        ttk.Label(info_frame, text="URL:", style='IDM.TLabel').grid(row=0, column=0, sticky='w', pady=2)
        url_text = tk.Text(info_frame, height=3, width=70, wrap='word', font=('Consolas', 8))
        url_text.insert('1.0', self.url)
        url_text.config(state='disabled')
        url_text.grid(row=0, column=1, columnspan=2, sticky='ew', pady=2)
        
        # Título
        ttk.Label(info_frame, text="Título:", style='IDM.TLabel').grid(row=1, column=0, sticky='w', pady=2)
        self.title_var = tk.StringVar(value=self.title)
        title_entry = ttk.Entry(info_frame, textvariable=self.title_var, width=70, font=('Segoe UI', 9))
        title_entry.grid(row=1, column=1, columnspan=2, sticky='ew', pady=2)
        
        # Headers info
        if self.headers:
            ttk.Label(info_frame, text="Headers:", style='IDM.TLabel').grid(row=2, column=0, sticky='w', pady=2)
            headers_count = len(self.headers)
            has_auth = any('auth' in k.lower() or 'token' in k.lower() or 'cookie' in k.lower() 
                          for k in self.headers.keys())
            auth_text = " (🔐 Com autenticação)" if has_auth else ""
            ttk.Label(info_frame, text=f"{headers_count} headers capturados{auth_text}", 
                     style='IDM.TLabel').grid(row=2, column=1, sticky='w', pady=2)
        
        info_frame.columnconfigure(1, weight=1)
        
        # Configurações de download
        config_frame = ttk.LabelFrame(self.window, text="Configurações de Download", padding=10)
        config_frame.pack(fill='x', padx=10, pady=5)
        
        # Pasta de destino
        ttk.Label(config_frame, text="Salvar em:", style='IDM.TLabel').grid(row=0, column=0, sticky='w', pady=2)
        self.folder_var = tk.StringVar(value=self.parent.dest_var.get())
        folder_entry = ttk.Entry(config_frame, textvariable=self.folder_var, width=50, font=('Segoe UI', 9))
        folder_entry.grid(row=0, column=1, sticky='ew', pady=2, padx=(5, 5))
        
        folder_btn = ttk.Button(config_frame, text="📁", width=3, 
                               command=self.browse_folder)
        folder_btn.grid(row=0, column=2, pady=2)
        
        # Qualidade
        ttk.Label(config_frame, text="Qualidade:", style='IDM.TLabel').grid(row=1, column=0, sticky='w', pady=2)
        self.quality_var = tk.StringVar(value="Melhor disponível")
        quality_combo = ttk.Combobox(config_frame, textvariable=self.quality_var, 
                                   values=["Melhor disponível", "720p", "480p", "360p", "Apenas áudio"], 
                                   state="readonly", width=20)
        quality_combo.grid(row=1, column=1, sticky='w', pady=2, padx=(5, 0))
        
        config_frame.columnconfigure(1, weight=1)
        
        # Opções extras
        options_frame = ttk.LabelFrame(self.window, text="Opções", padding=10)
        options_frame.pack(fill='x', padx=10, pady=5)
        
        self.start_immediately_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(options_frame, text="Iniciar download imediatamente", 
                       variable=self.start_immediately_var).pack(anchor='w')
        
        self.save_thumbnail_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(options_frame, text="Salvar thumbnail", 
                       variable=self.save_thumbnail_var).pack(anchor='w')
        
        # Separador
        sep2 = ttk.Separator(self.window, orient='horizontal')
        sep2.pack(fill='x', padx=10, pady=10)
        
        # Botões estilo IDM
        button_frame = ttk.Frame(self.window, style='IDM.TFrame')
        button_frame.pack(fill='x', padx=10, pady=(0, 10))
        
        # Botão Download (azul IDM-like)
        self.download_btn = tk.Button(button_frame, text="📥 Baixar Agora", 
                                     bg='#0078d4', fg='white', font=('Segoe UI', 9, 'bold'),
                                     padx=20, pady=5, command=self.start_download)
        self.download_btn.pack(side='right', padx=(5, 0))
        
        # Botão Adicionar à fila
        queue_btn = tk.Button(button_frame, text="📋 Adicionar à Fila", 
                             bg='#6bb6ff', fg='white', font=('Segoe UI', 9),
                             padx=15, pady=5, command=self.add_to_queue)
        queue_btn.pack(side='right', padx=(5, 0))
        
        # Botão Cancelar
        cancel_btn = tk.Button(button_frame, text="❌ Cancelar", 
                              bg='#d13438', fg='white', font=('Segoe UI', 9),
                              padx=15, pady=5, command=self.on_cancel)
        cancel_btn.pack(side='right', padx=(5, 0))
        
        # Status inicial
        self.status_var = tk.StringVar(value="Pronto para download")
        status_label = ttk.Label(button_frame, textvariable=self.status_var, 
                                style='IDM.TLabel', font=('Segoe UI', 8))
        status_label.pack(side='left')
    
    def browse_folder(self):
        """Seleciona pasta de destino."""
        folder = filedialog.askdirectory(initialdir=self.folder_var.get())
        if folder:
            self.folder_var.set(folder)
    
    def start_download(self):
        """Inicia download imediatamente."""
        if not self.validate_inputs():
            return
        
        self.status_var.set("Iniciando download...")
        self.download_btn.config(state='disabled', text="Baixando...")
        
        # Atualiza configurações do app principal
        self.parent.dest_var.set(self.folder_var.get())
        self.parent.url_var.set(self.url)
        self.parent._last_headers = self.headers
        
        # Configura qualidade no app principal
        quality_map = {
            "Melhor disponível": "",
            "720p": "22", 
            "480p": "18",
            "360p": "134",
            "Apenas áudio": "bestaudio"
        }
        format_id = quality_map.get(self.quality_var.get(), "")
        only_audio = self.quality_var.get() == "Apenas áudio"
        
        # Fecha janela
        self.window.grab_release()
        self.window.destroy()
        
        # Inicia download no app principal
        threading.Thread(target=self._download_worker, 
                        args=(format_id, only_audio), daemon=True).start()
    
    def _download_worker(self, format_id, only_audio):
        """Worker thread para download."""
        try:
            # Força análise da URL primeiro no app principal
            self.parent.after(0, lambda: self.parent.on_list_formats())
            
            # Aguarda um pouco para análise completar
            time.sleep(2)
            
            # Configura formato se específico
            if format_id:
                self.parent.after(0, lambda: self.parent.format_combo.set(format_id))
            
            # Configura áudio apenas
            self.parent.after(0, lambda: self.parent.audio_only_var.set(only_audio))
            
            # Configura thumbnail
            self.parent.after(0, lambda: self.parent.thumb_var.set(self.save_thumbnail_var.get()))
            
            # Aguarda um pouco mais
            time.sleep(1)
            
            # Inicia download
            self.parent.after(0, self.parent.on_start_download)
            
        except Exception as e:
            self.parent.after(0, lambda: messagebox.showerror("Erro", f"Erro no download: {e}"))
    
    def add_to_queue(self):
        """Adiciona à fila de downloads."""
        if not self.validate_inputs():
            return
        
        # Por enquanto, só mostra mensagem (pode implementar fila depois)
        self.status_var.set("Adicionado à fila")
        messagebox.showinfo("Fila", "Download adicionado à fila!\n(Funcionalidade em desenvolvimento)")
        self.window.grab_release()
        self.window.destroy()
    
    def validate_inputs(self):
        """Valida entradas."""
        if not self.folder_var.get().strip():
            messagebox.showerror("Erro", "Selecione uma pasta de destino")
            return False
        
        if not os.path.isdir(self.folder_var.get()):
            try:
                os.makedirs(self.folder_var.get(), exist_ok=True)
            except:
                messagebox.showerror("Erro", "Não foi possível criar a pasta de destino")
                return False
        
        return True
    
    def on_cancel(self):
        """Cancela e fecha janela."""
        self.cancelled = True
        self.window.grab_release()
        self.window.destroy()