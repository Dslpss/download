import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
import time
from typing import Dict, Optional

class SimpleIDMWindow:
    """Janela de download simples estilo IDM."""
    
    def __init__(self, parent, url: str, title: str, headers: Optional[Dict] = None):
        self.parent = parent
        self.url = url
        self.title = title
        self.headers = headers or {}
        self.result = None
        self.custom_title = None  # Título personalizado
        self.downloading = False  # Estado do download
        self.download_progress = 0  # Progresso do download
        
        # Cria janela modal simples
        self.window = tk.Toplevel(parent)
        self.window.title("Download Video")
        self.window.geometry("600x480")
        self.window.resizable(False, False)
        
        # Força a janela a aparecer
        self.window.withdraw()  # Esconde primeiro
        
        # Centraliza na tela
        self.center_window()
        
        # Configura como modal
        self.window.transient(parent)
        
        # Cria interface
        self.create_interface()
        
        # Agora mostra a janela
        self.window.deiconify()  # Mostra a janela
        self.window.grab_set()   # Torna modal
        self.window.focus_set()  # Foca
        self.window.lift()       # Traz para frente
        
        # Evento de fechar
        self.window.protocol("WM_DELETE_WINDOW", self.on_cancel)
    
    def center_window(self):
        """Centraliza janela na tela."""
        self.window.update_idletasks()
        x = (self.window.winfo_screenwidth() // 2) - (600 // 2)
        y = (self.window.winfo_screenheight() // 2) - (480 // 2)
        self.window.geometry(f"600x480+{x}+{y}")
    
    def create_interface(self):
        """Cria interface IDM-like simples."""
        # Frame principal
        main_frame = ttk.Frame(self.window, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Ícone e título
        title_frame = ttk.Frame(main_frame)
        title_frame.pack(fill=tk.X, pady=(0, 15))
        
        ttk.Label(title_frame, text="🎬", font=("Arial", 24)).pack(side=tk.LEFT)
        ttk.Label(title_frame, text="Download de Vídeo Detectado", 
                 font=("Arial", 14, "bold")).pack(side=tk.LEFT, padx=(10, 0))
        
        # Separador
        ttk.Separator(main_frame, orient="horizontal").pack(fill=tk.X, pady=(0, 15))
        
        # Informações do vídeo
        info_frame = ttk.Frame(main_frame)
        info_frame.pack(fill=tk.X, pady=(0, 20))
        
        # Título do vídeo (editável)
        ttk.Label(info_frame, text="Título do arquivo:", font=("Arial", 10, "bold")).pack(anchor=tk.W)
        
        # Campo de entrada para o título
        self.title_var = tk.StringVar(value=self.title)
        title_entry_frame = ttk.Frame(info_frame)
        title_entry_frame.pack(fill=tk.X, pady=(2, 10))
        
        self.title_entry = ttk.Entry(title_entry_frame, textvariable=self.title_var, font=("Arial", 10))
        self.title_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # Botão para resetar título original
        ttk.Button(title_entry_frame, text="🔄", width=3, 
                  command=self.reset_title).pack(side=tk.RIGHT, padx=(5, 0))
        
        # URL (somente leitura)
        ttk.Label(info_frame, text="URL:", font=("Arial", 10, "bold")).pack(anchor=tk.W, pady=(10, 0))
        url_text = self.url[:70] + "..." if len(self.url) > 70 else self.url
        ttk.Label(info_frame, text=url_text, font=("Arial", 9)).pack(anchor=tk.W, pady=(0, 10))
        
        # Status
        if self.headers:
            ttk.Label(info_frame, text=f"✅ Headers capturados: {len(self.headers)}", 
                     font=("Arial", 9), foreground="green").pack(anchor=tk.W)
        
        # Separador
        ttk.Separator(main_frame, orient="horizontal").pack(fill=tk.X, pady=(15, 15))
        
        # Seção de progresso (inicialmente oculta)
        self.progress_frame = ttk.Frame(main_frame)
        self.progress_frame.pack(fill=tk.X, pady=(0, 15))
        
        # Status do download
        self.status_label = ttk.Label(self.progress_frame, text="Aguardando confirmação...", 
                                     font=("Arial", 10))
        self.status_label.pack(anchor=tk.W)
        
        # Barra de progresso
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(self.progress_frame, variable=self.progress_var, 
                                           maximum=100, length=550)
        self.progress_bar.pack(fill=tk.X, pady=(5, 5))
        
        # Informações detalhadas (velocidade, tempo, etc)
        self.detail_label = ttk.Label(self.progress_frame, text="", 
                                     font=("Arial", 9), foreground="gray")
        self.detail_label.pack(anchor=tk.W)
        
        # Botões estilo IDM
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=(20, 0))
        
        # Botão Cancelar (esquerda)
        ttk.Button(button_frame, text="Cancelar", command=self.on_cancel).pack(side=tk.LEFT)
        
        # Botões principais (direita)
        right_buttons = ttk.Frame(button_frame)
        right_buttons.pack(side=tk.RIGHT)
        
        ttk.Button(right_buttons, text="📋 Copiar URL", 
                  command=self.copy_url).pack(side=tk.LEFT, padx=(0, 10))
        ttk.Button(right_buttons, text="📥 Baixar Agora", 
                  command=self.on_download, style="Accent.TButton").pack(side=tk.LEFT)
    
    def copy_url(self):
        """Copia URL para área de transferência."""
        self.window.clipboard_clear()
        self.window.clipboard_append(self.url)
        messagebox.showinfo("Copiado", "URL copiada para área de transferência!")
    
    def reset_title(self):
        """Reseta o título para o original."""
        self.title_var.set(self.title)
        messagebox.showinfo("Resetado", "Título resetado para o original!")
    
    def on_download(self):
        """Confirma download com título personalizado."""
        # Salva o título personalizado
        self.custom_title = self.title_var.get().strip()
        if not self.custom_title:
            messagebox.showwarning("Aviso", "O título não pode estar vazio!")
            return
        
        # Marca como iniciando download
        self.downloading = True
        self.result = True
        
        # Atualiza interface para mostrar progresso
        self.status_label.config(text="🚀 Iniciando download...")
        self.progress_var.set(0)
        
        # Desabilita botões
        for widget in self.window.winfo_children():
            if isinstance(widget, ttk.Frame):
                for child in widget.winfo_children():
                    if isinstance(child, ttk.Frame):
                        for btn in child.winfo_children():
                            if isinstance(btn, ttk.Button):
                                btn.config(state='disabled')
        
        # Atualiza título da janela
        self.window.title("Download Video - Baixando...")
        
        # NÃO fecha a janela - ela permanece aberta durante o download
    
    def on_cancel(self):
        """Cancela download."""
        if self.downloading:
            # Se está baixando, pergunta se quer cancelar
            if messagebox.askyesno("Cancelar Download", 
                                  "O download está em progresso. Deseja cancelar?"):
                self.result = False
                self.window.destroy()
        else:
            # Se não está baixando, cancela normalmente
            self.result = False
            self.window.destroy()
    
    def update_progress(self, percent: float, status: str = "", details: str = ""):
        """Atualiza o progresso do download."""
        try:
            self.progress_var.set(percent)
            if status:
                self.status_label.config(text=status)
            if details:
                self.detail_label.config(text=details)
            self.window.update_idletasks()
        except tk.TclError:
            pass  # Janela foi fechada
    
    def finish_download(self, success: bool = True, message: str = ""):
        """Finaliza o download e fecha a janela."""
        try:
            if success:
                self.status_label.config(text="✅ Download concluído com sucesso!")
                self.progress_var.set(100)
                self.detail_label.config(text=message or "Arquivo salvo com sucesso")
            else:
                self.status_label.config(text="❌ Download falhou")
                self.detail_label.config(text=message or "Erro durante o download")
            
            self.window.update_idletasks()
            
            # Aguarda 2 segundos e fecha a janela
            self.window.after(2000, self.window.destroy)
        except tk.TclError:
            pass  # Janela foi fechada
    
    def show(self):
        """Mostra janela e retorna resultado e título personalizado."""
        # Garante que a janela está visível
        self.window.deiconify()
        self.window.lift()
        self.window.focus_force()
        
        # Aguarda até o usuário tomar uma decisão
        while self.result is None:
            try:
                self.window.update()
                time.sleep(0.01)  # Evita uso excessivo de CPU
            except tk.TclError:
                # Janela foi fechada
                self.result = False
                break
                
        return self.result, self.custom_title