// Intercepta todos os headers de XHR/fetch de vídeo e salva no chrome.storage
(function interceptVideoRequests() {
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._vd_url = url;
    return originalXHROpen.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("readystatechange", function () {
      if (
        this.readyState === 4 &&
        this._vd_url &&
        this.responseURL &&
        this.getAllResponseHeaders
      ) {
        // Só salva se for vídeo ou m3u8/mpd
        if (/\.(mp4|m3u8|mpd|webm|mov|ts)([?#].*)?$/i.test(this.responseURL)) {
          const headers = {};
          try {
            const raw = this.getAllResponseHeaders();
            raw.split(/\r?\n/).forEach((line) => {
              const idx = line.indexOf(":");
              if (idx > 0)
                headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            });
          } catch {}
          // Salva no chrome.storage
          chrome.storage.local.set({
            ["headers_" + this.responseURL]: headers,
          });
        }
      }
    });
    return originalXHRSend.apply(this, args);
  };

  // Intercepta fetch
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await originalFetch(input, init);
    try {
      let url = typeof input === "string" ? input : input.url;
      if (/\.(mp4|m3u8|mpd|webm|mov|ts)([?#].*)?$/i.test(url)) {
        const headers = {};
        response.headers.forEach((v, k) => {
          headers[k] = v;
        });
        chrome.storage.local.set({ ["headers_" + url]: headers });
      }
    } catch {}
    return response;
  };
})();
// Content script UNIVERSAL - Detecta vídeos em QUALQUER site
console.log("Video Downloader Assistant - Modo Universal carregado");

class UniversalVideoDetector {
  constructor() {
    this.detectedVideos = new Set();
    this.observer = null;
    this.networkUrls = new Set();
    this.init();
  }

  init() {
    // Detecta vídeos já existentes na página
    this.scanForVideos();

    // Monitora mudanças na página
    this.setupMutationObserver();

    // Monitora mudanças na URL
    this.setupURLMonitoring();

    // Monitora requisições de rede
    this.setupNetworkMonitoring();

    // Escaneamento contínuo para sites dinâmicos
    setInterval(() => this.scanForVideos(), 3000);
  }

  scanForVideos() {
    const videos = [];

    // 1. ELEMENTOS <video> nativos
    document.querySelectorAll("video").forEach((video) => {
      const src = video.src || video.currentSrc;
      if (src && src.startsWith("http")) {
        videos.push({
          type: "video_element",
          url: src,
          title: this.getVideoTitle(video),
          element: video,
          source: "HTML5 Video",
        });
      }

      // Sources dentro do video
      video.querySelectorAll("source").forEach((source) => {
        if (source.src && source.src.startsWith("http")) {
          videos.push({
            type: "video_source",
            url: source.src,
            title: this.getVideoTitle(video),
            element: source,
            source: "HTML5 Source",
          });
        }
      });
    });

    // 2. URL DA PÁGINA ATUAL
    const currentUrl = window.location.href;
    if (this.isVideoURL(currentUrl)) {
      videos.push({
        type: "page_url",
        url: currentUrl,
        title: document.title,
        element: null,
        source: "Page URL",
      });
    }

    // 3. IFRAMES (embeds)
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (iframe.src && this.isVideoURL(iframe.src)) {
        videos.push({
          type: "iframe",
          url: iframe.src,
          title: this.getVideoTitle(iframe),
          element: iframe,
          source: "iframe Embed",
        });
      }
    });

    // 4. LINKS DIRETOS para arquivos de vídeo
    document.querySelectorAll("a[href]").forEach((link) => {
      const href = link.href;
      if (this.isDirectVideoFile(href)) {
        videos.push({
          type: "direct_link",
          url: href,
          title: link.textContent.trim() || this.extractTitleFromURL(href),
          element: link,
          source: "Direct Link",
        });
      }
    });

    // 5. DATA ATTRIBUTES (players customizados)
    document
      .querySelectorAll("[data-src], [data-video], [data-url], [data-stream]")
      .forEach((el) => {
        const dataSrc =
          el.getAttribute("data-src") ||
          el.getAttribute("data-video") ||
          el.getAttribute("data-url") ||
          el.getAttribute("data-stream");
        if (dataSrc && this.isVideoURL(dataSrc)) {
          videos.push({
            type: "data_attribute",
            url: dataSrc,
            title: this.getVideoTitle(el),
            element: el,
            source: "Data Attribute",
          });
        }
      });

    // 6. PLAYERS CUSTOMIZADOS CONHECIDOS
    this.detectCustomPlayers().forEach((player) => {
      videos.push(player);
    });

    // 7. URLs DE VÍDEO NO TEXTO
    this.findVideoURLsInText().forEach((url) => {
      videos.push({
        type: "text_url",
        url: url,
        title: this.extractTitleFromURL(url),
        element: null,
        source: "Text Content",
      });
    });

    // 8. URLs capturadas da rede
    this.networkUrls.forEach((url) => {
      videos.push({
        type: "network_request",
        url: url,
        title: this.extractTitleFromURL(url),
        element: null,
        source: "Network Request",
      });
    });

    this.processDetectedVideos(videos);
  }

  isVideoURL(url) {
    if (!url || typeof url !== "string") return false;

    const patterns = [
      // === PLATAFORMAS PRINCIPAIS ===
      /youtube\.com\/watch/i,
      /youtu\.be\//i,
      /youtube\.com\/playlist/i,
      /youtube\.com\/embed\//i,
      /vimeo\.com\//i,
      /player\.vimeo\.com\//i,
      /dailymotion\.com\//i,
      /dai\.ly\//i,
      /twitch\.tv\//i,
      /tiktok\.com\//i,
      /instagram\.com\/p\//i,
      /instagram\.com\/reel\//i,
      /facebook\.com\/.*\/videos\//i,
      /fb\.watch\//i,
      /twitter\.com\/.*\/status/i,
      /x\.com\/.*\/status/i,
      /reddit\.com\/.*\/comments/i,
      /v\.redd\.it\//i,

      // === STREAMING E EDUCAÇÃO ===
      /netflix\.com\/watch/i,
      /primevideo\.com\//i,
      /disneyplus\.com\//i,
      /hulu\.com\/watch/i,
      /crunchyroll\.com\/watch/i,
      /udemy\.com\/course\//i,
      /coursera\.org\//i,
      /edx\.org\//i,
      /khanacademy\.org\//i,
      /rocketseat\.com\.br\//i,
      /rocketseat\.com\.br\/.*\/video/i,
      /rocketseat\.com\.br\/.*\/aula/i,
      /rocketseat\.com\.br\/.*\/lesson/i,

      // === MÍDIA BRASILEIRA ===
      /globo\.com\/.*\/video/i,
      /globoplay\.globo\.com\//i,
      /uol\.com\.br\/.*\/video/i,
      /g1\.globo\.com\/.*\/video/i,
      /band\.uol\.com\.br\/.*\/video/i,
      /sbt\.com\.br\/.*\/video/i,
      /record\.tv\/.*\/video/i,

      // === MÍDIA INTERNACIONAL ===
      /cnn\.com\/videos/i,
      /bbc\.com\/.*\/video/i,
      /nytimes\.com\/.*\/video/i,
      /washingtonpost\.com\/.*\/video/i,

      // === PLATAFORMAS REGIONAIS ===
      /bilibili\.com\/video/i,
      /niconico\.jp\/watch/i,
      /ok\.ru\/video/i,
      /rutube\.ru\/video/i,
      /vk\.com\/video/i,

      // === FORMATOS DE ARQUIVO ===
      /\.(mp4|webm|avi|mov|mkv|flv|wmv|m4v|3gp|ogv|ogg)(\?.*)?$/i,
      /\.(m3u8|mpd)(\?.*)?$/i,

      // === PROTOCOLOS DE STREAMING ===
      /^rtmp:\/\//i,
      /^rtsp:\/\//i,

      // === CDNs E SERVIÇOS ===
      /amazonaws\.com\/.*\.(mp4|webm|avi|m4v)/i,
      /cloudfront\.net\/.*\.(mp4|webm|avi|m4v)/i,
      /googleapis\.com\/.*video/i,
      /googlevideo\.com\//i,
      /ytimg\.com\//i,
      /cdninstagram\.com\//i,
      /scontent\..*\.fbcdn\.net\//i,

      // === CDNs EDUCACIONAIS ===
      /\.b-cdn\.net\/.*\.(mp4|webm|m3u8)/i,
      /\.fastly\.com\/.*\.(mp4|webm|m3u8)/i,
      /\.jsdelivr\.net\/.*video/i,
      /cloudflare\.com\/.*\.(mp4|webm|m3u8)/i,
      /vimeocdn\.com\//i,
      /\.wistia\.com\//i,
      /\.vzaar\.com\//i,
      /\.brightcove\.com\//i,

      // === PATTERNS GENÉRICOS ===
      /\/video[s]?\//i,
      /\/stream[s]?\//i,
      /\/media\//i,
      /\/embed\//i,
      /\/player\//i,
      /\/watch\?/i,
      /\/play\?/i,
      /videoplayback\?/i,
      /manifest\.m3u8/i,
      /playlist\.m3u8/i,
      /chunk.*\.ts$/i,
      /segment.*\.ts$/i,
    ];

    return patterns.some((pattern) => pattern.test(url));
  }

  isDirectVideoFile(url) {
    if (!url) return false;

    return /\.(mp4|webm|avi|mov|mkv|flv|wmv|m4v|3gp|ogv|ogg|m3u8|mpd)(\?.*)?$/i.test(
      url
    );
  }

  detectCustomPlayers() {
    const players = [];

    // JW Player
    document
      .querySelectorAll('[id*="jwplayer"], [class*="jwplayer"], [class*="jw-"]')
      .forEach((el) => {
        const config = this.extractJWPlayerConfig(el);
        if (config?.file) {
          players.push({
            type: "jwplayer",
            url: config.file,
            title: config.title || this.getVideoTitle(el),
            element: el,
            source: "JW Player",
          });
        }
      });

    // Video.js
    document
      .querySelectorAll("[data-vjs-player], .video-js, .vjs-tech")
      .forEach((el) => {
        const sources = el.querySelectorAll("source");
        sources.forEach((source) => {
          if (source.src && this.isVideoURL(source.src)) {
            players.push({
              type: "videojs",
              url: source.src,
              title: this.getVideoTitle(el),
              element: el,
              source: "Video.js",
            });
          }
        });
      });

    // Flowplayer
    document
      .querySelectorAll('[class*="flowplayer"], [data-flowplayer]')
      .forEach((el) => {
        const config = el.getAttribute("data-flowplayer");
        if (config) {
          try {
            const parsed = JSON.parse(config);
            if (parsed.clip?.sources) {
              parsed.clip.sources.forEach((source) => {
                if (source.src && this.isVideoURL(source.src)) {
                  players.push({
                    type: "flowplayer",
                    url: source.src,
                    title: this.getVideoTitle(el),
                    element: el,
                    source: "Flowplayer",
                  });
                }
              });
            }
          } catch (e) {
            // Ignora erro de parsing
          }
        }
      });

    // Plyr
    document.querySelectorAll("[data-plyr-provider], .plyr").forEach((el) => {
      const sources = el.querySelectorAll("source");
      sources.forEach((source) => {
        if (source.src && this.isVideoURL(source.src)) {
          players.push({
            type: "plyr",
            url: source.src,
            title: this.getVideoTitle(el),
            element: el,
            source: "Plyr",
          });
        }
      });
    });

    // Rocketseat específico
    if (window.location.hostname.includes("rocketseat.com.br")) {
      this.detectRocketseatVideos().forEach((video) => {
        players.push(video);
      });
    }

    return players;
  }

  detectRocketseatVideos() {
    const videos = [];

    // Procura por elementos específicos do Rocketseat
    document
      .querySelectorAll(
        '.video-player, [class*="video"], [class*="player"], [id*="video"], [id*="player"]'
      )
      .forEach((el) => {
        // Procura por URLs em atributos data
        const possibleUrls = [
          el.getAttribute("data-src"),
          el.getAttribute("data-video-url"),
          el.getAttribute("data-stream-url"),
          el.getAttribute("data-url"),
          el.getAttribute("src"),
        ].filter(Boolean);

        possibleUrls.forEach((url) => {
          if (this.isVideoURL(url) || this.isDirectVideoFile(url)) {
            videos.push({
              type: "rocketseat_player",
              url: url,
              title: this.getVideoTitle(el) || document.title,
              element: el,
              source: "Rocketseat Player",
            });
          }
        });
      });

    // Procura em scripts por configurações de vídeo
    document.querySelectorAll("script").forEach((script) => {
      const content = script.textContent;
      if (
        content.includes("video") ||
        content.includes("stream") ||
        content.includes(".mp4") ||
        content.includes(".m3u8")
      ) {
        const urlMatches = content.match(
          /https?:\/\/[^\s"']+\.(?:mp4|m3u8|webm|avi|mov|mkv|flv|wmv|m4v)/gi
        );
        if (urlMatches) {
          urlMatches.forEach((url) => {
            videos.push({
              type: "rocketseat_script",
              url: url,
              title: document.title,
              element: null,
              source: "Rocketseat Script",
            });
          });
        }
      }
    });

    return videos;
  }

  findVideoURLsInText() {
    const urls = [];
    const textContent = document.body.innerText || "";

    const urlRegex = /https?:\/\/[^\s<>"'()[\]{}]+/gi;
    const foundUrls = textContent.match(urlRegex) || [];

    foundUrls.forEach((url) => {
      if (this.isVideoURL(url)) {
        urls.push(url);
      }
    });

    return [...new Set(urls)];
  }

  setupNetworkMonitoring() {
    // Intercepta fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      this.analyzeNetworkRequest(args[0]);
      return response;
    };

    // Intercepta XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url && typeof url === "string") {
        videoDetector.analyzeNetworkRequest(url);
      }
      return originalOpen.apply(this, arguments);
    };
  }

  analyzeNetworkRequest(url) {
    if (typeof url === "string") {
      // Verifica se é URL de vídeo
      if (this.isVideoURL(url) || this.isDirectVideoFile(url)) {
        this.networkUrls.add(url);
        console.log("Video URL detectada na rede:", url);
      }

      // Também procura por URLs que podem conter parâmetros de vídeo
      if (
        url.includes("video") ||
        url.includes("stream") ||
        url.includes("media") ||
        url.includes("player")
      ) {
        if (
          url.includes(".mp4") ||
          url.includes(".m3u8") ||
          url.includes(".webm") ||
          url.includes("manifest")
        ) {
          this.networkUrls.add(url);
          console.log("Video URL com parâmetros detectada:", url);
        }
      }

      // Limita o tamanho do Set para evitar memory leak
      if (this.networkUrls.size > 100) {
        const firstItem = this.networkUrls.values().next().value;
        this.networkUrls.delete(firstItem);
      }
    }
  }

  extractJWPlayerConfig(element) {
    try {
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent;
        if (content.includes("jwplayer") && content.includes("setup")) {
          const configMatch = content.match(/setup\s*\(\s*({.*?})\s*\)/s);
          if (configMatch) {
            try {
              return JSON.parse(configMatch[1]);
            } catch (e) {
              // Tenta eval como fallback (menos seguro mas funcional)
              try {
                return eval("(" + configMatch[1] + ")");
              } catch (e2) {
                // Ignora
              }
            }
          }
        }
      }
    } catch (e) {
      // Ignora erros
    }
    return null;
  }

  extractTitleFromURL(url) {
    try {
      const urlObj = new URL(url);

      // Extrai título baseado no domínio
      if (urlObj.hostname.includes("youtube")) {
        const params = new URLSearchParams(urlObj.search);
        return `YouTube - ${params.get("v") || "Video"}`;
      }

      if (urlObj.hostname.includes("vimeo")) {
        const id = urlObj.pathname.split("/").pop();
        return `Vimeo - ${id}`;
      }

      // Nome do arquivo
      const filename = urlObj.pathname.split("/").pop();
      if (filename && filename.includes(".")) {
        return filename.replace(
          /\.(mp4|webm|avi|mov|mkv|flv|wmv|m4v|3gp)$/i,
          ""
        );
      }

      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch (e) {
      return "Vídeo detectado";
    }
  }

  getVideoTitle(element) {
    if (!element) return "Vídeo sem título";

    // Tenta várias fontes de título
    const sources = [
      element.title,
      element.alt,
      element.getAttribute("data-title"),
      element.getAttribute("aria-label"),
      element.textContent?.trim(),
    ];

    for (const source of sources) {
      if (source && source.length > 0 && source.length < 200) {
        return source;
      }
    }

    // Procura por título próximo
    const titleSelectors = [
      "h1",
      "h2",
      "h3",
      ".title",
      ".video-title",
      "[data-title]",
      ".media-title",
      ".content-title",
      ".player-title",
    ];

    for (const selector of titleSelectors) {
      const titleEl = document.querySelector(selector);
      if (titleEl?.textContent?.trim()) {
        const title = titleEl.textContent.trim();
        if (title.length > 0 && title.length < 200) {
          return title;
        }
      }
    }

    return document.title || "Vídeo sem título";
  }

  processDetectedVideos(videos) {
    if (videos.length === 0) return;

    // Remove duplicatas baseado na URL
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
    // Remove UI anterior
    const existingUI = document.getElementById("video-downloader-ui");
    if (existingUI) existingUI.remove();

    // Cria overlay mais chamativo
    const overlay = document.createElement("div");
    overlay.id = "video-downloader-ui";
    overlay.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        max-width: 350px;
        cursor: pointer;
        transition: all 0.3s ease;
        border: 2px solid rgba(255,255,255,0.2);
        backdrop-filter: blur(10px);
      " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 24px; animation: pulse 2s infinite;">🎬</span>
          <div>
            <div style="font-weight: bold; font-size: 16px;">${
              videos.length
            } vídeo(s) detectado(s)!</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
              ${videos.map((v) => v.source).join(", ")}<br>
              🚀 Clique para baixar agora!
            </div>
          </div>
        </div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      </style>
    `;

    document.body.appendChild(overlay);

    // Auto-remove após 8 segundos
    setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
    }, 8000);

    // Click para enviar o primeiro vídeo
    overlay.addEventListener("click", () => {
      this.sendToDownloader(videos[0]);
      overlay.remove();
    });
  }

  notifyExtension(videos) {
    try {
      chrome.runtime.sendMessage({
        type: "videos_detected",
        videos: videos,
        url: window.location.href,
        title: document.title,
      });
    } catch (e) {
      // Extensão pode não estar ativa
    }
  }

  sendToDownloader(video) {
    // Múltiplas estratégias de envio
    Promise.race([this.sendViaHTTP(video), this.sendViaClipboard(video)]).then(
      (success) => {
        if (success) {
          this.showSuccess(video);
        } else {
          this.showInstructions(video);
        }
      }
    );
  }

  async sendViaHTTP(video) {
    try {
      const response = await fetch("http://localhost:8765/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: video.url,
          title: video.title,
          source: video.source || "browser_extension",
        }),
        signal: AbortSignal.timeout(3000), // 3 segundo timeout
      });

      return response.ok;
    } catch (error) {
      console.log("App não está rodando:", error.message);
      return false;
    }
  }

  async sendViaClipboard(video) {
    try {
      await navigator.clipboard.writeText(video.url);
      return true;
    } catch (error) {
      return false;
    }
  }

  showSuccess(video) {
    const success = document.createElement("div");
    success.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #56ab2f 0%, #a8e6cf 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 2147483648;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        font-weight: bold;
      ">
        ✅ Enviado para Video Downloader!<br>
        <small style="font-weight: normal; opacity: 0.9;">${video.title}</small>
      </div>
    `;

    document.body.appendChild(success);
    setTimeout(() => success.remove(), 4000);
  }

  showInstructions(video) {
    const instructions = `🎬 VÍDEO DETECTADO!

URL: ${video.url}

📋 A URL foi copiada para o clipboard.
👉 Cole no Video Downloader app!

💡 Dica: Ative "🌐 Integração com navegador" no app para envio automático.`;

    alert(instructions);
  }

  setupMutationObserver() {
    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              if (
                node.tagName === "VIDEO" ||
                node.tagName === "IFRAME" ||
                node.querySelector?.("video") ||
                node.querySelector?.("iframe") ||
                (typeof node.className === "string" &&
                  node.className.includes("player")) ||
                (typeof node.id === "string" && node.id.includes("player"))
              ) {
                shouldScan = true;
              }
            }
          });
        }
      });

      if (shouldScan) {
        setTimeout(() => this.scanForVideos(), 2000);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  setupURLMonitoring() {
    let currentUrl = window.location.href;

    const urlCheck = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(() => this.scanForVideos(), 3000);
      }
    };

    setInterval(urlCheck, 1000);

    window.addEventListener("popstate", () => {
      setTimeout(() => this.scanForVideos(), 3000);
    });
  }
}

// Inicia detector universal
let videoDetector;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    videoDetector = new UniversalVideoDetector();
  });
} else {
  videoDetector = new UniversalVideoDetector();
}

// Escuta mensagens da extensão
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "force_scan") {
    videoDetector.scanForVideos();
  }
});
