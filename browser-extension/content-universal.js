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
    this.dismissedVideos = new Set(); // Vídeos que o usuário dispensou
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

    // Primeiro tenta capturar título real da página uma vez
    const pageVideoTitle = this.findRealVideoTitle();

    // 1. ELEMENTOS <video> nativos
    document.querySelectorAll("video").forEach((video, index) => {
      const src = video.src || video.currentSrc;
      if (src && src.startsWith("http")) {
        let videoTitle = this.getVideoTitle(video);

        // Se não encontrou título específico, usa o título real da página
        if (
          (videoTitle === document.title ||
            videoTitle.includes("Vídeo sem título")) &&
          pageVideoTitle
        ) {
          videoTitle = pageVideoTitle;
        } else if (
          videoTitle === document.title ||
          videoTitle.includes("Vídeo sem título")
        ) {
          videoTitle = `HTML5 Video ${index + 1} - ${this.extractTitleFromURL(
            src
          )}`;
        }

        videos.push({
          type: "video_element",
          url: src,
          title: videoTitle,
          element: video,
          source: "HTML5 Video",
        });
      }

      // Sources dentro do video
      video.querySelectorAll("source").forEach((source, sourceIndex) => {
        if (source.src && source.src.startsWith("http")) {
          let sourceTitle = this.getVideoTitle(video);

          // Se não encontrou título específico, usa o título real da página
          if (
            (sourceTitle === document.title ||
              sourceTitle.includes("Vídeo sem título")) &&
            pageVideoTitle
          ) {
            sourceTitle = pageVideoTitle;
          } else if (
            sourceTitle === document.title ||
            sourceTitle.includes("Vídeo sem título")
          ) {
            sourceTitle = `HTML5 Source ${index + 1}.${
              sourceIndex + 1
            } - ${this.extractTitleFromURL(source.src)}`;
          }

          videos.push({
            type: "video_source",
            url: source.src,
            title: sourceTitle,
            element: source,
            source: "HTML5 Source",
          });
        }
      });
    });

    // 3. IFRAMES (embeds) - PRIORIDADE ALTA para BunnyCDN
    document.querySelectorAll("iframe").forEach((iframe, index) => {
      if (iframe.src && this.isVideoURL(iframe.src)) {
        // Prioridade para iframe de vídeo (BunnyCDN, etc.)
        const priority = iframe.src.includes("iframe.mediadelivery.net")
          ? 1
          : 5;

        // Título mais específico para iframes
        let iframeTitle = this.getVideoTitle(iframe);

        // Se não encontrou título específico, usa o título real da página
        if (
          (iframeTitle === document.title ||
            iframeTitle.includes("Vídeo sem título")) &&
          pageVideoTitle
        ) {
          iframeTitle = pageVideoTitle;
        } else if (
          iframeTitle === document.title ||
          iframeTitle.includes("Vídeo sem título")
        ) {
          const iframeSrc = iframe.src;
          if (iframeSrc.includes("mediadelivery.net")) {
            const urlParts = iframeSrc.split("/");
            const videoId =
              urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
            iframeTitle = `BunnyCDN Video - ${videoId}`;
          } else {
            iframeTitle = `iframe Video ${
              index + 1
            } - ${this.extractTitleFromURL(iframeSrc)}`;
          }
        }

        videos.push({
          type: "iframe",
          url: iframe.src,
          title: iframeTitle,
          element: iframe,
          source: "iframe Embed",
          priority: priority,
        });
      }
    });

    // 2. URL DA PÁGINA ATUAL - PRIORIDADE BAIXA
    const currentUrl = window.location.href;
    if (this.isVideoURL(currentUrl) && !currentUrl.includes("classroom")) {
      videos.push({
        type: "page_url",
        url: currentUrl,
        title: document.title,
        element: null,
        source: "Page URL",
        priority: 10, // Baixa prioridade para URLs de página
      });
    }

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

      // Extrai título baseado no domínio com mais detalhes
      if (urlObj.hostname.includes("youtube")) {
        const params = new URLSearchParams(urlObj.search);
        const videoId = params.get("v");
        const listId = params.get("list");
        if (videoId && listId) {
          return `YouTube - ${videoId} (Playlist: ${listId.substring(0, 8)})`;
        } else if (videoId) {
          return `YouTube - ${videoId}`;
        }
        return "YouTube - Video";
      }

      if (urlObj.hostname.includes("vimeo")) {
        const id = urlObj.pathname.split("/").pop();
        return `Vimeo - ${id}`;
      }

      if (
        urlObj.hostname.includes("bunnycdn") ||
        urlObj.hostname.includes("mediadelivery")
      ) {
        const pathParts = urlObj.pathname.split("/").filter((p) => p);
        if (pathParts.length >= 2) {
          return `BunnyCDN - ${pathParts[pathParts.length - 1]}`;
        }
        return "BunnyCDN - Video";
      }

      // Rocketseat - extrai título da URL de referência se disponível
      if (
        urlObj.hostname.includes("rocketseat") ||
        document.referrer.includes("rocketseat")
      ) {
        try {
          const referrerUrl = document.referrer || window.location.href;
          const lessonMatch = referrerUrl.match(/\/lesson\/([^\/\?&#]+)/);
          if (lessonMatch && lessonMatch[1]) {
            const lessonSlug = lessonMatch[1];
            const lessonTitle = lessonSlug
              .replace(/-/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase());
            return `Rocketseat - ${lessonTitle}`;
          }
        } catch (e) {}
      }

      // Nome do arquivo com mais contexto
      const filename = urlObj.pathname.split("/").pop();
      if (filename && filename.includes(".")) {
        const nameWithoutExt = filename.replace(
          /\.(mp4|webm|avi|mov|mkv|flv|wmv|m4v|3gp|m3u8|ts|mpd)$/i,
          ""
        );
        return `${urlObj.hostname} - ${nameWithoutExt}`;
      }

      // Se não tem filename, usa path segments
      const pathSegments = urlObj.pathname
        .split("/")
        .filter((s) => s && s !== "");
      if (pathSegments.length > 0) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        const secondLastSegment = pathSegments[pathSegments.length - 2];

        if (secondLastSegment && lastSegment) {
          return `${urlObj.hostname} - ${secondLastSegment}/${lastSegment}`;
        } else {
          return `${urlObj.hostname} - ${lastSegment}`;
        }
      }

      // Inclui parâmetros de query se existirem
      if (urlObj.search) {
        const params = new URLSearchParams(urlObj.search);
        const paramStr = Array.from(params.entries())
          .slice(0, 2) // Pega apenas os 2 primeiros parâmetros
          .map(([k, v]) => `${k}=${v.substring(0, 10)}`)
          .join("&");
        return `${urlObj.hostname} - ${paramStr}`;
      }

      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch (e) {
      // Se falhar, gera um título único com timestamp
      return `Vídeo detectado - ${Date.now()}`;
    }
  }

  getVideoTitle(element) {
    if (!element) return "Vídeo sem título";

    // Primeiro tenta encontrar o título específico do vídeo baseado na sua URL
    const videoUrl =
      element.src || element.href || element.getAttribute("data-src");
    if (videoUrl) {
      const specificTitle = this.getSpecificVideoTitle(videoUrl, element);
      if (specificTitle) {
        return specificTitle;
      }
    }

    // Depois tenta encontrar o título real do vídeo na página
    const realTitle = this.findRealVideoTitle();
    if (realTitle && realTitle !== document.title) {
      return realTitle;
    }

    // Tenta várias fontes de título específicas do elemento
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

    // Procura por título próximo ao elemento (mais específico)
    const parent = element.closest(
      "[data-title], .video-container, .player-container, .media-item"
    );
    if (parent) {
      const titleAttr = parent.getAttribute("data-title");
      if (titleAttr && titleAttr.trim()) {
        return titleAttr.trim();
      }
    }

    // Procura por elementos de título próximos hierarquicamente
    const nearbyTitleSelectors = [
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

    // Primeiro tenta dentro do container pai
    if (element.parentElement) {
      for (const selector of nearbyTitleSelectors) {
        const titleEl = element.parentElement.querySelector(selector);
        if (titleEl?.textContent?.trim()) {
          const title = titleEl.textContent.trim();
          if (title.length > 0 && title.length < 200) {
            return title;
          }
        }
      }
    }

    // Se ainda não encontrou, procura globalmente mas com mais critério
    for (const selector of nearbyTitleSelectors) {
      const titleEl = document.querySelector(selector);
      if (titleEl?.textContent?.trim()) {
        const title = titleEl.textContent.trim();
        if (title.length > 0 && title.length < 200) {
          return title;
        }
      }
    }

    // Como último recurso, usa document.title mas torna único
    const baseTitle = document.title || "Vídeo sem título";

    // Se o elemento tem src/href, adiciona uma parte da URL para tornar único
    if (videoUrl) {
      try {
        const urlObj = new URL(videoUrl);
        const filename = urlObj.pathname.split("/").pop();
        const params = urlObj.searchParams.toString();

        // Adiciona identificador único baseado na URL
        if (filename && filename !== "") {
          return `${baseTitle} - ${filename}`;
        } else if (params) {
          const shortParams = params.substring(0, 20);
          return `${baseTitle} - ${shortParams}`;
        } else {
          const pathSegments = urlObj.pathname.split("/").filter((s) => s);
          const lastSegment = pathSegments[pathSegments.length - 1];
          if (lastSegment) {
            return `${baseTitle} - ${lastSegment}`;
          }
        }
      } catch (e) {
        // Se falhar ao processar URL, adiciona timestamp para tornar único
        return `${baseTitle} - ${Date.now()}`;
      }
    }

    return baseTitle;
  }

  getSpecificVideoTitle(videoUrl, element) {
    try {
      // Para BunnyCDN/mediadelivery, tenta extrair ID único
      if (
        videoUrl.includes("mediadelivery.net") ||
        videoUrl.includes("bunnycdn")
      ) {
        const urlObj = new URL(videoUrl);
        const pathParts = urlObj.pathname.split("/").filter((p) => p);

        // Tenta pegar ID do vídeo da URL
        if (pathParts.length >= 2) {
          const videoId = pathParts[pathParts.length - 1];
          const libraryId = pathParts[pathParts.length - 2];

          // Se estamos no Rocketseat, tenta extrair título da página atual
          if (window.location.hostname.includes("rocketseat")) {
            const lessonMatch = window.location.pathname.match(
              /\/lesson\/([^\/\?&#]+)/
            );
            if (lessonMatch && lessonMatch[1]) {
              const lessonSlug = lessonMatch[1];
              const lessonTitle = lessonSlug
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase());
              return `${lessonTitle} - ${videoId.substring(0, 8)}`;
            }
          }

          return `BunnyCDN Video - ${videoId.substring(0, 12)}`;
        }
      }

      // Para outros vídeos, tenta extrair do contexto da página
      if (element) {
        // Procura por atributos específicos de vídeo
        const videoTitle =
          element.getAttribute("data-video-title") ||
          element.getAttribute("data-title") ||
          element.getAttribute("aria-label");

        if (videoTitle && videoTitle.trim()) {
          return videoTitle.trim();
        }

        // Procura por elementos próximos que podem ter o título específico
        const container = element.closest(
          "[data-video-title], .lesson-item, .video-item, .media-item"
        );
        if (container) {
          const containerTitle =
            container.getAttribute("data-video-title") ||
            container
              .querySelector(".title, .video-title, h1, h2, h3")
              ?.textContent?.trim();
          if (containerTitle) {
            return containerTitle;
          }
        }
      }

      return null;
    } catch (e) {
      console.log("Erro ao extrair título específico:", e);
      return null;
    }
  }

  findRealVideoTitle() {
    const hostname = window.location.hostname.toLowerCase();

    // Primeiro tenta metadados Open Graph e Twitter Cards
    const ogTitle = document.querySelector(
      'meta[property="og:title"]'
    )?.content;
    const twitterTitle = document.querySelector(
      'meta[name="twitter:title"]'
    )?.content;
    const ogVideoTitle = document.querySelector(
      'meta[property="og:video:title"]'
    )?.content;

    if (ogVideoTitle && ogVideoTitle.trim()) {
      return ogVideoTitle.trim();
    }

    if (ogTitle && ogTitle.trim() && ogTitle !== document.title) {
      return ogTitle.trim();
    }

    if (
      twitterTitle &&
      twitterTitle.trim() &&
      twitterTitle !== document.title
    ) {
      return twitterTitle.trim();
    }

    // YouTube
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      const selectors = [
        "#title h1.ytd-video-primary-info-renderer", // Novo layout
        ".ytd-video-primary-info-renderer .title",
        "h1.title.style-scope.ytd-video-primary-info-renderer",
        ".watch-main-col h1",
        "#eow-title",
        ".ytp-title-text",
        "h1.ytd-watch-metadata yt-formatted-string",
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }

      // Tenta extrair do player do YouTube
      try {
        if (
          window.ytplayer &&
          window.ytplayer.config &&
          window.ytplayer.config.args
        ) {
          const title = window.ytplayer.config.args.title;
          if (title) return title;
        }
      } catch (e) {}
    }

    // Vimeo
    if (hostname.includes("vimeo.com")) {
      const selectors = [
        ".video-title",
        ".player_title",
        'h1[data-test-id="video-title"]',
        ".clip-quote-display-title",
        ".video_title",
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    // Twitch
    if (hostname.includes("twitch.tv")) {
      const selectors = [
        'h1[data-a-target="stream-title"]',
        ".channel-header__title",
        ".video-info-card__title",
        'h2[data-a-target="stream-title"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    // TikTok
    if (hostname.includes("tiktok.com")) {
      const selectors = [
        '[data-e2e="browse-video-desc"]',
        ".video-meta-title",
        ".tt-video-meta-caption",
        '[data-e2e="video-desc"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    // Instagram
    if (hostname.includes("instagram.com")) {
      const selectors = [
        "article h1",
        ".media-caption",
        '[data-testid="caption-text"]',
        'meta[property="og:description"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim() || el?.content?.trim()) {
          return (el.textContent || el.content).trim();
        }
      }
    }

    // Facebook
    if (hostname.includes("facebook.com")) {
      const selectors = [
        '[data-testid="post_message"]',
        ".userContent",
        ".video-title",
        '[data-ad-preview="message"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    // Dailymotion
    if (hostname.includes("dailymotion.com")) {
      const selectors = [
        ".video-title",
        ".VideoTitle__title",
        "h1.title",
        ".player_box_title",
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    // Sites educacionais comuns
    if (hostname.includes("udemy.com")) {
      const selectors = [
        '[data-purpose="video-curriculum-item-title"]',
        ".curriculum-item-title",
        ".lecture-title",
        ".curriculum-item-title--curriculum-item--title",
        'h1[data-purpose="course-header-title"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    if (hostname.includes("coursera.org")) {
      const selectors = [
        ".video-title",
        ".item-title",
        ".lecture-title",
        'h1[data-e2e="lesson-title"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    // Rocketseat (já que você mencionou antes)
    if (
      hostname.includes("rocketseat.com") ||
      hostname.includes("app.rocketseat.com")
    ) {
      const selectors = [
        ".lesson-title",
        ".video-title",
        "h1.title",
        '[data-testid="lesson-title"]',
        ".content-title",
        ".lesson-header__title",
        'h1[class*="lesson"]',
        ".lesson-content h1",
        ".lesson-header h1",
        "[data-lesson-title]",
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }

      // Se não encontrou pelo DOM, tenta extrair da URL
      try {
        const path = window.location.pathname;
        const lessonMatch = path.match(/\/lesson\/([^\/]+)/);
        if (lessonMatch && lessonMatch[1]) {
          // Converte o slug da URL em título legível
          const lessonSlug = lessonMatch[1];
          const lessonTitle = lessonSlug
            .replace(/-/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase());
          return `Rocketseat - ${lessonTitle}`;
        }

        // Também tenta extrair do hash se existir
        const hash = window.location.hash;
        if (hash.includes("lesson")) {
          const hashMatch = hash.match(/lesson[\/=]([^\/&#]+)/);
          if (hashMatch && hashMatch[1]) {
            const lessonSlug = hashMatch[1];
            const lessonTitle = lessonSlug
              .replace(/-/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase());
            return `Rocketseat - ${lessonTitle}`;
          }
        }
      } catch (e) {
        console.log("Erro ao extrair título do Rocketseat da URL:", e);
      }
    }

    // Streaming e outros sites de vídeo
    if (hostname.includes("netflix.com")) {
      const selectors = [
        ".video-title",
        ".previewModal--player-titleTreatmentWrapper h3",
        ".video-metadata h3",
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    if (hostname.includes("primevideo.com") || hostname.includes("amazon.")) {
      const selectors = [
        '[data-testid="title"]',
        ".title",
        'h1[data-automation-id="title"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
    }

    // Seletores genéricos para outros sites
    const genericSelectors = [
      "h1.video-title",
      ".video-title h1",
      ".player-title",
      ".media-title",
      ".content-title",
      'h1[class*="title"]',
      'h2[class*="title"]',
      "[data-title]",
      '.title[class*="video"]',
      ".lesson-title",
      ".episode-title",
      ".course-title",
      ".stream-title",
      ".player-info h1",
      ".video-header h1",
      ".video-description h1",
      ".video-info h1",
      ".media-header h1",
    ];

    for (const selector of genericSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        const title = el.textContent.trim();
        // Filtra títulos muito genéricos ou iguais ao document.title
        if (
          title.length > 5 &&
          title.length < 300 &&
          !title.toLowerCase().includes("undefined") &&
          !title.toLowerCase().includes("null") &&
          !title.toLowerCase().includes("loading") &&
          !title.toLowerCase().includes("untitled") &&
          title !== document.title
        ) {
          return title;
        }
      }
    }

    // Última tentativa: procura em JSON-LD structured data
    try {
      const jsonLdScripts = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      for (const script of jsonLdScripts) {
        const data = JSON.parse(script.textContent);
        if (data["@type"] === "VideoObject" && data.name) {
          return data.name;
        }
        if (data.video && data.video.name) {
          return data.video.name;
        }
      }
    } catch (e) {}

    return null; // Não encontrou título específico
  }

  processDetectedVideos(videos) {
    if (videos.length === 0) return;

    // Ordena vídeos por prioridade (iframes de vídeo primeiro)
    const sortedVideos = videos.sort((a, b) => {
      const priorityA = a.priority || 5;
      const priorityB = b.priority || 5;
      return priorityA - priorityB;
    });

    // Remove duplicatas baseado na URL, mantendo ordem de prioridade
    const uniqueVideos = [];
    const seenUrls = new Set();

    sortedVideos.forEach((video) => {
      if (!seenUrls.has(video.url) && !this.dismissedVideos.has(video.url)) {
        seenUrls.add(video.url);
        uniqueVideos.push(video);
        this.detectedVideos.add(video.url);
      }
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
        transition: all 0.3s ease;
        border: 2px solid rgba(255,255,255,0.2);
        backdrop-filter: blur(10px);
      " id="video-notification-card">
        <div style="display: flex; align-items: center; gap: 12px; position: relative;">
          <span style="font-size: 24px; animation: pulse 2s infinite;">🎬</span>
          <div style="flex: 1; cursor: pointer;" id="notification-content">
            <div style="font-weight: bold; font-size: 16px;">Download Video</div>
          </div>
          <button style="
            position: absolute;
            top: -8px;
            right: -8px;
            background: rgba(255,255,255,0.2);
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            color: white;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s ease;
            backdrop-filter: blur(5px);
          " id="close-notification" 
            onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
            onmouseout="this.style.background='rgba(255,255,255,0.2)'">×</button>
        </div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        #notification-content:hover {
          transform: scale(1.02);
        }
      </style>
    `;

    document.body.appendChild(overlay);

    // Auto-remove após 8 segundos
    const autoRemoveTimeout = setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
    }, 8000);

    // Botão de fechar
    const closeBtn = overlay.querySelector("#close-notification");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Evita que o clique dispare o download
      clearTimeout(autoRemoveTimeout);

      // Adiciona todos os vídeos desta notificação à lista de dispensados
      videos.forEach((video) => {
        this.dismissedVideos.add(video.url);
      });

      console.log("🚫 Notificação dispensada pelo usuário");
      overlay.remove();

      // Mostra confirmação rápida
      this.showDismissConfirmation(videos.length);
    });

    // Clique na área de conteúdo para baixar
    const content = overlay.querySelector("#notification-content");
    content.addEventListener("click", (e) => {
      e.stopPropagation();
      clearTimeout(autoRemoveTimeout);
      this.sendToDownloader(videos[0]);
      overlay.remove();
    });
  }

  showDismissConfirmation(count) {
    const confirmation = document.createElement("div");
    confirmation.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
      ">
        ✅ Notificação dispensada (${count} vídeo${count > 1 ? "s" : ""})
      </div>
    `;

    document.body.appendChild(confirmation);

    // Remove após 2 segundos
    setTimeout(() => {
      if (confirmation.parentNode) {
        confirmation.remove();
      }
    }, 2000);
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
      // Coleta headers completos como no popup.js
      let allHeaders = {};

      // 1. Tenta buscar headers do webRequest
      try {
        const requestKey = `request_${video.url}`;
        const result = await chrome.storage.local.get([requestKey]);
        if (result[requestKey] && result[requestKey].headers) {
          allHeaders = result[requestKey].headers;
          console.log(
            "[NotificationIDM] Headers de requisição encontrados:",
            allHeaders
          );
        }
      } catch (e) {}

      // 2. Fallback: buscar headers do userscript/XHR
      if (Object.keys(allHeaders).length === 0) {
        try {
          const key = `headers_${video.url}`;
          const result = await chrome.storage.local.get([key]);
          if (result[key] && Object.keys(result[key]).length > 0) {
            allHeaders = result[key];
          }
        } catch (e) {}
      }

      // 3. Adiciona cookies da página atual
      try {
        const cookies = await chrome.cookies.getAll({
          url: window.location.href,
        });
        if (cookies.length > 0) {
          allHeaders["Cookie"] = cookies
            .map((c) => `${c.name}=${c.value}`)
            .join("; ");
        }
      } catch (e) {}

      // 4. Garante Referer e User-Agent
      if (!allHeaders["Referer"]) allHeaders["Referer"] = window.location.href;
      if (!allHeaders["User-Agent"])
        allHeaders["User-Agent"] = navigator.userAgent;

      // 5. Melhora o título do vídeo baseado na URL específica e contexto
      let improvedTitle = video.title;

      // Para BunnyCDN no Rocketseat, tenta extrair título da lição atual
      if (
        video.url.includes("mediadelivery.net") &&
        window.location.hostname.includes("rocketseat")
      ) {
        try {
          const lessonMatch = window.location.pathname.match(
            /\/lesson\/([^\/\?&#]+)/
          );
          if (lessonMatch && lessonMatch[1]) {
            const lessonSlug = lessonMatch[1];
            const lessonTitle = lessonSlug
              .replace(/-/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase());

            // Adiciona ID do vídeo para diferenciá-lo
            const videoUrlObj = new URL(video.url);
            const pathParts = videoUrlObj.pathname.split("/").filter((p) => p);
            const videoId = pathParts[pathParts.length - 1];
            const shortId = videoId
              ? videoId.substring(0, 8)
              : Math.random().toString(36).substring(2, 8);

            improvedTitle = `${lessonTitle} - ${shortId}`;
            console.log(
              "[NotificationIDM] Título específico para vídeo:",
              improvedTitle
            );
          }
        } catch (e) {}
      }

      // Para outros sites, se o Referer contém informações úteis
      else if (allHeaders["Referer"]) {
        try {
          const refererUrl = new URL(allHeaders["Referer"]);

          // Rocketseat genérico
          if (refererUrl.hostname.includes("rocketseat")) {
            const lessonMatch = refererUrl.pathname.match(
              /\/lesson\/([^\/\?&#]+)/
            );
            if (lessonMatch && lessonMatch[1]) {
              const lessonSlug = lessonMatch[1];
              const lessonTitle = lessonSlug
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase());

              // Se já não começar com o nome da lição, adiciona
              if (
                !improvedTitle.toLowerCase().includes(lessonTitle.toLowerCase())
              ) {
                improvedTitle = `${lessonTitle}`;
              }
            }
          }

          // Outros sites educacionais
          else if (
            refererUrl.hostname.includes("udemy") ||
            refererUrl.hostname.includes("coursera")
          ) {
            const pathSegments = refererUrl.pathname
              .split("/")
              .filter((s) => s);
            if (pathSegments.length > 2) {
              const courseSection = pathSegments[pathSegments.length - 1];
              const readableSection = courseSection
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase());
              improvedTitle = `${readableSection}`;
            }
          }
        } catch (e) {}
      }

      console.log("[NotificationIDM] Enviando headers:", allHeaders);

      const response = await fetch("http://localhost:8765/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: video.url,
          title: improvedTitle, // Usa o título melhorado
          source: video.source || "browser_extension",
          headers: allHeaders, // Agora inclui headers completos!
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
        // Limpa vídeos dispensados quando a URL muda
        this.dismissedVideos.clear();
        console.log("🔄 URL mudou - limpando vídeos dispensados");
        setTimeout(() => this.scanForVideos(), 3000);
      }
    };

    setInterval(urlCheck, 1000);

    window.addEventListener("popstate", () => {
      // Limpa vídeos dispensados no botão voltar/avançar
      this.dismissedVideos.clear();
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
