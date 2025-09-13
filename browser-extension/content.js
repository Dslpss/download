// Content script que roda em todas as páginas
console.log("Video Downloader Assistant carregado");

class VideoDetector {
  constructor() {
    this.detectedVideos = new Set();
    this.observer = null;
    this.init();
  }

  init() {
    // Detecta vídeos já existentes na página
    this.scanForVideos();

    // Monitora mudanças na página (SPAs, vídeos carregados dinamicamente)
    this.setupMutationObserver();

    // Monitora mudanças na URL (navegação SPA)
    this.setupURLMonitoring();
  }

  scanForVideos() {
    const videos = [];

    // Detecta elementos <video>
    document.querySelectorAll("video").forEach((video) => {
      if (video.src || video.currentSrc) {
        videos.push({
          type: "video_element",
          url: video.src || video.currentSrc,
          title: this.getVideoTitle(video),
          element: video,
        });
      }
    });

    // Detecta URLs conhecidas de vídeo
    const currentUrl = window.location.href;
    if (this.isVideoURL(currentUrl)) {
      videos.push({
        type: "page_url",
        url: currentUrl,
        title: document.title,
        element: null,
      });
    }

    // Detecta iframes de vídeo (YouTube, Vimeo, etc.)
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (iframe.src && this.isVideoURL(iframe.src)) {
        videos.push({
          type: "iframe",
          url: iframe.src,
          title: this.getVideoTitle(iframe),
          element: iframe,
        });
      }
    });

    this.processDetectedVideos(videos);
  }

  isVideoURL(url) {
    const videoPatterns = [
      /youtube\.com\/watch/i,
      /youtu\.be\//i,
      /youtube\.com\/playlist/i,
      /vimeo\.com\//i,
      /dailymotion\.com\//i,
      /twitch\.tv\//i,
      /tiktok\.com\//i,
      /instagram\.com\//i,
      /facebook\.com\/.*video/i,
      /twitter\.com\/.*status/i,
      /reddit\.com\/.*comments/i,
      /\.mp4$/i,
      /\.webm$/i,
      /\.avi$/i,
      /\.mov$/i,
    ];

    return videoPatterns.some((pattern) => pattern.test(url));
  }

  getVideoTitle(element) {
    // Tenta extrair título do vídeo
    if (element.title) return element.title;
    if (element.alt) return element.alt;

    // Procura por título próximo
    const titleSelectors = [
      "h1",
      "h2",
      ".title",
      ".video-title",
      "[data-title]",
    ];

    for (const selector of titleSelectors) {
      const titleEl = document.querySelector(selector);
      if (titleEl && titleEl.textContent.trim()) {
        return titleEl.textContent.trim();
      }
    }

    return document.title || "Vídeo sem título";
  }

  processDetectedVideos(videos) {
    if (videos.length === 0) return;

    // Remove duplicatas
    const uniqueVideos = videos.filter((video) => {
      const key = video.url;
      if (this.detectedVideos.has(key)) return false;
      this.detectedVideos.add(key);
      return true;
    });

    if (uniqueVideos.length > 0) {
      this.showVideoDetectionUI(uniqueVideos);
      this.notifyExtension(uniqueVideos);
    }
  }

  showVideoDetectionUI(videos) {
    // Remove UI anterior se existir
    const existingUI = document.getElementById("video-downloader-ui");
    if (existingUI) existingUI.remove();

    // Cria overlay discreto
    const overlay = document.createElement("div");
    overlay.id = "video-downloader-ui";
    overlay.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2d3748;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        max-width: 300px;
        cursor: pointer;
        transition: all 0.3s ease;
      " onmouseover="this.style.background='#4a5568'" onmouseout="this.style.background='#2d3748'">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🎬</span>
          <div>
            <div style="font-weight: bold;">${videos.length} vídeo(s) detectado(s)</div>
            <div style="font-size: 12px; opacity: 0.8;">Clique para baixar</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Auto-remove após 5 segundos
    setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
    }, 5000);

    // Click para abrir app
    overlay.addEventListener("click", () => {
      this.sendToDownloader(videos[0]); // Envia o primeiro vídeo
      overlay.remove();
    });
  }

  notifyExtension(videos) {
    // Notifica a extensão sobre vídeos detectados
    chrome.runtime
      .sendMessage({
        type: "videos_detected",
        videos: videos,
        url: window.location.href,
        title: document.title,
      })
      .catch(() => {
        // Ignora erro se extensão não estiver ativa
      });
  }

  sendToDownloader(video) {
    // Tenta várias formas de comunicar com o app desktop

    // 1. Via localhost (se servidor estiver rodando)
    this.sendViaHTTP(video);

    // 2. Via clipboard (fallback)
    this.sendViaClipboard(video);

    // 3. Mostra instruções para o usuário
    this.showInstructions(video);
  }

  async sendViaHTTP(video) {
    try {
      const response = await fetch("http://localhost:8765/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: video.url,
          title: video.title,
          source: "browser_extension",
        }),
      });

      if (response.ok) {
        this.showSuccess();
        return true;
      }
    } catch (error) {
      console.log("App não está rodando na porta 8765");
    }
    return false;
  }

  sendViaClipboard(video) {
    // Copia URL para clipboard
    navigator.clipboard
      .writeText(video.url)
      .then(() => {
        console.log("URL copiada para clipboard:", video.url);
      })
      .catch(() => {
        console.log("Erro ao copiar para clipboard");
      });
  }

  showInstructions(video) {
    alert(
      `🎬 Vídeo detectado!\\n\\nURL: ${video.url}\\n\\nA URL foi copiada para o clipboard. Cole no Video Downloader app!`
    );
  }

  showSuccess() {
    const success = document.createElement("div");
    success.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #38a169;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
      ">
        ✅ Enviado para Video Downloader!
      </div>
    `;

    document.body.appendChild(success);
    setTimeout(() => success.remove(), 3000);
  }

  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Verifica se foram adicionados elementos de vídeo
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              // Element node
              if (
                node.tagName === "VIDEO" ||
                node.tagName === "IFRAME" ||
                (node.querySelector &&
                  (node.querySelector("video") || node.querySelector("iframe")))
              ) {
                shouldScan = true;
              }
            }
          });
        }
      });

      if (shouldScan) {
        setTimeout(() => this.scanForVideos(), 1000); // Delay para carregamento
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  setupURLMonitoring() {
    let currentUrl = window.location.href;

    // Monitora mudanças de URL (SPAs)
    const urlCheck = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(() => this.scanForVideos(), 2000); // Delay para carregamento da página
      }
    };

    setInterval(urlCheck, 1000);

    // Monitora eventos de navegação
    window.addEventListener("popstate", () => {
      setTimeout(() => this.scanForVideos(), 2000);
    });
  }
}

// Inicia detector quando página carrega
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new VideoDetector();
  });
} else {
  new VideoDetector();
}
