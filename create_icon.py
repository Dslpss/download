"""
Script para criar um ícone básico temporário para o Video Downloader
"""
try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    # Cria ícone básico 256x256
    size = 256
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background circular
    draw.ellipse([20, 20, size-20, size-20], fill=(25, 118, 210), outline=(13, 71, 161), width=4)
    
    # Símbolo de play/download
    play_points = [
        (size//2 - 30, size//2 - 40),
        (size//2 + 30, size//2),
        (size//2 - 30, size//2 + 40)
    ]
    draw.polygon(play_points, fill='white')
    
    # Seta para baixo (download)
    arrow_points = [
        (size//2 - 15, size//2 + 50),
        (size//2 + 15, size//2 + 50),
        (size//2 + 15, size//2 + 70),
        (size//2 + 25, size//2 + 70),
        (size//2, size//2 + 90),
        (size//2 - 25, size//2 + 70),
        (size//2 - 15, size//2 + 70)
    ]
    draw.polygon(arrow_points, fill='white')
    
    # Salva como ICO
    icon_path = 'assets/icon.ico'
    img.save(icon_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
    print(f"✅ Ícone criado: {icon_path}")
    
except ImportError:
    print("⚠️ Pillow não instalado. Criando arquivo placeholder...")
    # Cria arquivo placeholder
    with open('assets/icon.ico', 'wb') as f:
        f.write(b'')  # Arquivo vazio como placeholder
    
    print("📋 Para criar um ícone real:")
    print("1. pip install Pillow")
    print("2. python create_icon.py")
    print("3. Ou baixe um ícone .ico e coloque em assets/icon.ico")

except Exception as e:
    print(f"❌ Erro ao criar ícone: {e}")
    print("📋 Baixe um ícone .ico e coloque em assets/icon.ico")