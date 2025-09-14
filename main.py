#!/usr/bin/env python3
"""
Video Downloader - Aplicação Principal
Sistema de download de vídeos com interface IDM e extensão Chrome
"""

import sys
import os

def setup_environment():
    """Configura o ambiente para execução da aplicação"""
    
    # Verificar se estamos rodando como executável PyInstaller
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # Executável PyInstaller
        bundle_dir = sys._MEIPASS
        src_dir = os.path.join(bundle_dir, 'src')
        
        # Configurar paths para tkinter se necessário
        tcl_dir = os.path.join(bundle_dir, 'tcl')
        tk_dir = os.path.join(bundle_dir, 'tk')
        
        if os.path.exists(tcl_dir):
            os.environ['TCL_LIBRARY'] = tcl_dir
        if os.path.exists(tk_dir):
            os.environ['TK_LIBRARY'] = tk_dir
    else:
        # Desenvolvimento
        current_dir = os.path.dirname(os.path.abspath(__file__))
        src_dir = os.path.join(current_dir, 'src')
    
    # Adicionar diretório src ao path
    if src_dir not in sys.path:
        sys.path.insert(0, src_dir)
    
    return src_dir

def main():
    """Entry point principal da aplicação"""
    
    try:
        # Configurar ambiente
        src_dir = setup_environment()
        
        # Tentar importar tkinter primeiro para validar
        try:
            import tkinter as tk
            # Teste básico do tkinter
            root = tk.Tk()
            root.withdraw()  # Oculta janela de teste
            root.destroy()
            print("✅ Tkinter carregado com sucesso")
        except Exception as e:
            print(f"❌ Erro ao carregar tkinter: {e}")
            input("Pressione Enter para continuar mesmo assim...")
        
        # Tentar import do módulo principal
        try:
            from videodl.main import main as app_main
            print("✅ Módulo principal carregado")
            app_main()
        except ImportError as e:
            print(f"⚠️ Erro ao importar videodl.main: {e}")
            print("Tentando fallback...")
            
            # Fallback para import direto
            try:
                sys.path.insert(0, os.path.join(src_dir, 'videodl'))
                import main as main_module
                print("✅ Módulo carregado via fallback")
                main_module.main()
            except Exception as e2:
                print(f"❌ Erro crítico: {e2}")
                print("\nInformações de debug:")
                print(f"Python: {sys.version}")
                print(f"Executable: {sys.executable}")
                print(f"Frozen: {getattr(sys, 'frozen', False)}")
                print(f"MEIPASS: {getattr(sys, '_MEIPASS', 'N/A')}")
                print(f"Paths: {sys.path[:3]}...")
                input("Pressione Enter para sair...")
                sys.exit(1)
                
    except Exception as e:
        print(f"❌ Erro fatal na inicialização: {e}")
        import traceback
        traceback.print_exc()
        input("Pressione Enter para sair...")
        sys.exit(1)

if __name__ == "__main__":
    main()