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
        // Para APIs da Udemy, extrai URLs de vídeo da resposta
        if (
          this._vd_url &&
          this._vd_url.includes("udemy.com") &&
          (this._vd_url.includes("course-taking") ||
            this._vd_url.includes("media-src") ||
            this._vd_url.includes("assets") ||
            this._vd_url.includes("lecture"))
        ) {
          try {
            const responseText = this.responseText || this.response;
            if (typeof responseText === "string") {
              // Busca por URLs mais específicas da Udemy
              const patterns = [
                /https:\/\/[^"'\s]*\.cloudfront\.net\/[^"'\s]*\.(?:mp4|m3u8|webm)(?:\?[^"'\s]*)?/gi,
                /https:\/\/[^"'\s]*udemy[^"'\s]*\.(?:mp4|m3u8|webm)(?:\?[^"'\s]*)?/gi,
                /"manifest_url":\s*"([^"]+)"/gi,
                /"Video":\s*\[\s*\{\s*"[^"]*":\s*"([^"]+\.(?:mp4|m3u8|webm)[^"]*)"/gi,
                /"src":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
                /"file":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
                /"url":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
              ];

              let foundUrls = [];
              patterns.forEach((pattern) => {
                let match;
                while ((match = pattern.exec(responseText)) !== null) {
                  foundUrls.push(match[1] || match[0]);
                }
              });

              if (foundUrls.length > 0) {
                console.log(
                  "[Udemy Video Detector] URLs de vídeo encontradas via XHR:",
                  foundUrls
                );

                // Salva as URLs encontradas
                foundUrls.forEach((videoUrl) => {
                  chrome.storage.local.set({
                    [`udemy_video_${Date.now()}_${Math.random()}`]: {
                      url: videoUrl,
                      title: document.title,
                      source: "udemy_xhr_intercept",
                      timestamp: Date.now(),
                      api_url: this._vd_url,
                    },
                  });
                });
              }
            }
          } catch (e) {
            console.log(
              "[Udemy Video Detector] Erro ao processar resposta XHR:",
              e
            );
          }
        }

        // Salva se for vídeo, m3u8/mpd, ou URLs específicas da Udemy/streaming
        if (
          /\.(mp4|m3u8|mpd|webm|mov|ts)([?#].*)?$/i.test(this.responseURL) ||
          this.responseURL.includes("cloudfront.net") ||
          (this.responseURL.includes("udemy.com") &&
            this.responseURL.includes("video")) ||
          this.responseURL.includes("media-src") ||
          this.responseURL.includes("hls") ||
          this.responseURL.includes("stream")
        ) {
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

      // Intercepta respostas da API da Udemy que podem conter URLs de vídeo
      if (
        url.includes("udemy.com") &&
        (url.includes("course-taking") ||
          url.includes("media-src") ||
          url.includes("assets") ||
          url.includes("lecture"))
      ) {
        try {
          const clonedResponse = response.clone();
          const text = await clonedResponse.text();

          // Busca por URLs mais específicas da Udemy
          const patterns = [
            /https:\/\/[^"'\s]*\.cloudfront\.net\/[^"'\s]*\.(?:mp4|m3u8|webm)(?:\?[^"'\s]*)?/gi,
            /https:\/\/[^"'\s]*udemy[^"'\s]*\.(?:mp4|m3u8|webm)(?:\?[^"'\s]*)?/gi,
            /"manifest_url":\s*"([^"]+)"/gi,
            /"Video":\s*\[\s*\{\s*"[^"]*":\s*"([^"]+\.(?:mp4|m3u8|webm)[^"]*)"/gi,
            /"src":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
            /"file":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
            /"url":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
          ];

          let foundUrls = [];
          patterns.forEach((pattern) => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
              foundUrls.push(match[1] || match[0]);
            }
          });

          if (foundUrls.length > 0) {
            console.log(
              "[Udemy Video Detector] URLs de vídeo encontradas na API:",
              foundUrls
            );

            // Salva as URLs encontradas
            foundUrls.forEach((videoUrl) => {
              chrome.storage.local.set({
                [`udemy_video_${Date.now()}_${Math.random()}`]: {
                  url: videoUrl,
                  title: document.title,
                  source: "udemy_api_intercept",
                  timestamp: Date.now(),
                  api_url: url,
                },
              });
            });
          }
        } catch (e) {
          console.log(
            "[Udemy Video Detector] Erro ao processar resposta da API:",
            e
          );
        }
      }

      if (
        /\.(mp4|m3u8|mpd|webm|mov|ts)([?#].*)?$/i.test(url) ||
        url.includes("cloudfront.net") ||
        (url.includes("udemy.com") && url.includes("video")) ||
        url.includes("media-src") ||
        url.includes("hls") ||
        url.includes("stream")
      ) {
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
      try {
        let url = typeof args[0] === "string" ? args[0] : args[0].url;
        this.analyzeNetworkRequest(url);
        // Se for Udemy e for manifest/segmento, salva no storage
        if (
          url &&
          url.includes("udemycdn.com") &&
          (url.includes(".mpd") ||
            url.includes(".m3u8") ||
            url.includes(".mp4"))
        ) {
          chrome.storage.local.set({
            [`udemy_video_${Date.now()}_${Math.random()}`]: {
              url: url,
              title: document.title,
              source: "udemy_network_intercept",
              timestamp: Date.now(),
              api_url: url,
            },
          });
        }
      } catch {}
      return response;
    };

    // Intercepta XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url && typeof url === "string") {
        videoDetector.analyzeNetworkRequest(url);
        // Se for Udemy e for manifest/segmento, salva no storage
        if (
          url.includes("udemycdn.com") &&
          (url.includes(".mpd") ||
            url.includes(".m3u8") ||
            url.includes(".mp4"))
        ) {
          chrome.storage.local.set({
            [`udemy_video_${Date.now()}_${Math.random()}`]: {
              url: url,
              title: document.title,
              source: "udemy_network_intercept",
              timestamp: Date.now(),
              api_url: url,
            },
          });
        }
      }
      return originalOpen.apply(this, arguments);
    };
  }

  analyzeNetworkRequest(url) {
    if (typeof url === "string") {
      // Log global para debug de toda URL de rede
      console.log("[DEBUG VideoDetector] Network request:", url);

      // Verifica se é URL de vídeo
      if (this.isVideoURL(url) || this.isDirectVideoFile(url)) {
        this.networkUrls.add(url);
        console.log("[DEBUG VideoDetector] Video URL detectada na rede:", url);
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
          console.log(
            "[DEBUG VideoDetector] Video URL com parâmetros detectada:",
            url
          );
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
      // Removido: this.showVideoDetectionUI(uniqueVideos); - botão Download Video removido
      this.notifyExtension(uniqueVideos);
    }
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
    console.log(
      "[NotificationIDM] Iniciando sendToDownloader com video:",
      video
    );
    console.log("[NotificationIDM] URL do video:", video.url);
    console.log("[NotificationIDM] Título do video:", video.title);

    // Múltiplas estratégias de envio
    Promise.race([this.sendViaHTTP(video), this.sendViaClipboard(video)])
      .then((success) => {
        console.log("[NotificationIDM] Resultado do Promise.race:", success);

        if (success) {
          console.log(
            "[NotificationIDM] Sucesso! Mostrando notificação de sucesso"
          );
          this.showSuccess(video);
        } else {
          console.log(
            "[NotificationIDM] Falha no envio - mostrando instruções"
          );
          this.showInstructions(video);
        }
      })
      .catch((error) => {
        console.error("[NotificationIDM] Erro no sendToDownloader:", error);
      });
  }

  async sendViaHTTP(video) {
    console.log("[NotificationIDM] 🚀 Iniciando sendViaHTTP...");
    console.log("[NotificationIDM] Video URL:", video.url);
    console.log("[NotificationIDM] Video title:", video.title);

    try {
      console.log("[NotificationIDM] Coletando headers completos...");

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
        } else {
          console.log(
            "[NotificationIDM] Nenhum header webRequest encontrado para:",
            requestKey
          );
        }
      } catch (e) {
        console.log("[NotificationIDM] Erro ao buscar headers webRequest:", e);
      }

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

      console.log("[NotificationIDM] Título final melhorado:", improvedTitle);
      console.log(
        "[NotificationIDM] Headers finais que serão enviados:",
        allHeaders
      );

      const requestBody = {
        url: video.url,
        title: improvedTitle, // Usa o título melhorado
        source: video.source || "browser_extension",
        headers: allHeaders, // Agora inclui headers completos!
      };

      console.log(
        "[NotificationIDM] 📡 Fazendo POST para localhost:8765/download..."
      );
      console.log("[NotificationIDM] Body da requisição:", requestBody);

      const response = await fetch("http://localhost:8765/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(3000), // 3 segundo timeout
      });

      console.log(
        "[NotificationIDM] Resposta recebida - Status:",
        response.status
      );
      console.log("[NotificationIDM] Response.ok:", response.ok);

      if (response.ok) {
        console.log("[NotificationIDM] ✅ HTTP request enviado com sucesso!");
      } else {
        console.log(
          "[NotificationIDM] ❌ HTTP request falhou com status:",
          response.status
        );
        const responseText = await response.text();
        console.log("[NotificationIDM] Texto da resposta:", responseText);
      }

      return response.ok;
    } catch (error) {
      console.log("[NotificationIDM] ❌ Erro no sendViaHTTP:", error.message);
      console.log("[NotificationIDM] App não está rodando ou erro de conexão");
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

// Função para monitorar URLs de vídeo interceptadas da Udemy
function monitorUdemyVideoUrls() {
  setInterval(() => {
    chrome.storage.local.get(null, (items) => {
      const udemyVideos = Object.keys(items).filter((key) =>
        key.startsWith("udemy_video_")
      );
      if (udemyVideos.length > 0) {
        console.log(
          `[Udemy Monitor] ${udemyVideos.length} URLs de vídeo interceptadas:`,
          udemyVideos.map((key) => items[key])
        );
      }
    });
  }, 5000); // Verifica a cada 5 segundos
}

// Inicia o monitoramento se estivermos na Udemy
if (window.location.hostname.includes("udemy.com")) {
  monitorUdemyVideoUrls();
  console.log(
    "[Udemy Video Detector] Sistema de interceptação inicializado para Udemy"
  );

  // FORÇA interceptação imediata nas APIs existentes
  setTimeout(() => {
    console.log("[Udemy Video Detector] Forçando análise de APIs da Udemy...");

    // Intercepta todas as chamadas fetch/XHR futuras
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const [url] = args;

      if (url && url.includes("udemy.com")) {
        console.log("[Udemy Force Detector] Fetch interceptado:", url);

        if (
          url.includes("course-taking") ||
          url.includes("lecture") ||
          url.includes("media-src") ||
          url.includes("curriculum-item")
        ) {
          try {
            const clonedResponse = response.clone();
            const text = await clonedResponse.text();
            console.log("[Udemy Force Detector] Analisando resposta da API...");

            // Busca mais agressiva por URLs
            const allMatches = [
              ...text.matchAll(
                /https:\/\/[^"'\s,\]]*\.cloudfront\.net\/[^"'\s,\]]*\.(?:mp4|m3u8|webm|ts)(?:\?[^"'\s,\]]*)?/gi
              ),
              ...text.matchAll(/"manifest_url":\s*"([^"]+)"/gi),
              ...text.matchAll(
                /"src":\s*"([^"]*\.(?:mp4|m3u8|webm|ts)[^"]*)"/gi
              ),
              ...text.matchAll(
                /"file":\s*"([^"]*\.(?:mp4|m3u8|webm|ts)[^"]*)"/gi
              ),
              ...text.matchAll(/"video_url":\s*"([^"]+)"/gi),
              ...text.matchAll(/"stream_url":\s*"([^"]+)"/gi),
              ...text.matchAll(
                /https:\/\/[^"'\s,\]]*udemy[^"'\s,\]]*\.(?:mp4|m3u8|webm|ts)(?:\?[^"'\s,\]]*)?/gi
              ),
            ];

            if (allMatches.length > 0) {
              console.log(
                "[Udemy Force Detector] 🎯 URLS ENCONTRADAS:",
                allMatches
              );

              allMatches.forEach((match, index) => {
                const videoUrl = match[1] || match[0];
                if (videoUrl && videoUrl.startsWith("http")) {
                  console.log(
                    `[Udemy Force Detector] 🎯 Salvando URL ${index}:`,
                    videoUrl
                  );
                  chrome.storage.local.set({
                    [`udemy_video_${Date.now()}_${Math.random()}`]: {
                      url: videoUrl,
                      title: document.title,
                      source: "udemy_force_fetch",
                      timestamp: Date.now(),
                      api_url: url,
                    },
                  });
                }
              });
            }
          } catch (e) {
            console.log("[Udemy Force Detector] Erro:", e);
          }
        }
      }

      return response;
    };

    // Força refresh das APIs conhecidas da Udemy
    const lectureId = window.location.pathname.match(/lecture\/(\d+)/)?.[1];
    if (lectureId) {
      console.log("[Udemy Force Detector] Lecture ID encontrado:", lectureId);

      // Faz requisições diretas para APIs conhecidas
      const apiUrls = [
        `/api-2.0/courses/course/curriculum-items/${lectureId}/`,
        `/api-2.0/users/me/subscribed-courses/course/curriculum-items/${lectureId}/`,
        `/api-2.0/course-taking/course/curriculum-items/${lectureId}/lecture/`,
      ];

      apiUrls.forEach((apiPath) => {
        fetch(apiPath)
          .then((response) => response.text())
          .then((text) => {
            console.log(
              `[Udemy Force Detector] Resposta de ${apiPath}:`,
              text.length,
              "chars"
            );
            // A interceptação acima já vai processar isso
          })
          .catch((e) =>
            console.log(`[Udemy Force Detector] Erro em ${apiPath}:`, e)
          );
      });
    }
  }, 2000);

  // Interceptação adicional para elementos de vídeo
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Element node
          // Procura por elementos video
          const videos =
            node.tagName === "VIDEO"
              ? [node]
              : node.querySelectorAll?.("video") || [];
          videos.forEach((video) => {
            if (
              video.src &&
              (video.src.includes(".mp4") || video.src.includes(".m3u8"))
            ) {
              console.log(
                "[Udemy Video Detector] Elemento video encontrado:",
                video.src
              );
              chrome.storage.local.set({
                [`udemy_video_${Date.now()}_${Math.random()}`]: {
                  url: video.src,
                  title: document.title,
                  source: "udemy_video_element",
                  timestamp: Date.now(),
                },
              });
            }
          });

          // Procura por elementos source dentro de video
          const sources = node.querySelectorAll?.("source") || [];
          sources.forEach((source) => {
            if (
              source.src &&
              (source.src.includes(".mp4") || source.src.includes(".m3u8"))
            ) {
              console.log(
                "[Udemy Video Detector] Source element encontrado:",
                source.src
              );
              chrome.storage.local.set({
                [`udemy_video_${Date.now()}_${Math.random()}`]: {
                  url: source.src,
                  title: document.title,
                  source: "udemy_source_element",
                  timestamp: Date.now(),
                },
              });
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Interceptação por monitoramento de atributos src
  const srcObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.attributeName === "src") {
        const element = mutation.target;
        if (element.tagName === "VIDEO" || element.tagName === "SOURCE") {
          const src = element.src;
          if (
            src &&
            (src.includes(".mp4") ||
              src.includes(".m3u8") ||
              src.includes("cloudfront"))
          ) {
            console.log("[Udemy Video Detector] Src attribute mudou:", src);
            chrome.storage.local.set({
              [`udemy_video_${Date.now()}_${Math.random()}`]: {
                url: src,
                title: document.title,
                source: "udemy_src_change",
                timestamp: Date.now(),
              },
            });
          }
        }
      }
    });
  });

  // Observa mudanças nos atributos src de todos os elementos video/source
  document.querySelectorAll("video, source").forEach((element) => {
    srcObserver.observe(element, {
      attributes: true,
      attributeFilter: ["src"],
    });
  });

  // Interceptação de MediaSource APIs (para streaming moderno)
  if (window.MediaSource) {
    const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (mimeType) {
      console.log(
        "[Udemy Video Detector] MediaSource addSourceBuffer:",
        mimeType
      );
      return originalAddSourceBuffer.call(this, mimeType);
    };
  }

  // Interceptação específica para Shaka Player (usado pela Udemy)
  if (window.shaka) {
    console.log("[Udemy Video Detector] Shaka Player detectado!");

    // Intercepta criação de players
    const originalPlayerConstructor = window.shaka.Player;
    window.shaka.Player = function (...args) {
      const player = new originalPlayerConstructor(...args);
      console.log("[Udemy Video Detector] Novo Shaka Player criado:", player);

      // Intercepta load do manifest
      const originalLoad = player.load;
      player.load = function (manifestUri, ...loadArgs) {
        console.log(
          "[Udemy Video Detector] Shaka Player carregando manifest:",
          manifestUri
        );
        if (
          manifestUri &&
          (manifestUri.includes(".m3u8") || manifestUri.includes(".mpd"))
        ) {
          chrome.storage.local.set({
            [`udemy_video_${Date.now()}_${Math.random()}`]: {
              url: manifestUri,
              title: document.title,
              source: "udemy_shaka_manifest",
              timestamp: Date.now(),
              type: "manifest",
            },
          });
        }
        return originalLoad.call(this, manifestUri, ...loadArgs);
      };

      return player;
    };

    // Copia propriedades estáticas
    Object.setPrototypeOf(window.shaka.Player, originalPlayerConstructor);
    Object.assign(window.shaka.Player, originalPlayerConstructor);
  }

  // Interceptação global de window para detectar quando o Shaka é carregado
  Object.defineProperty(window, "shaka", {
    set: function (value) {
      console.log("[Udemy Video Detector] Shaka Player sendo definido:", value);
      this._shaka = value;

      if (value && value.Player) {
        // Mesmo código de interceptação acima
        const originalPlayerConstructor = value.Player;
        value.Player = function (...args) {
          const player = new originalPlayerConstructor(...args);
          console.log(
            "[Udemy Video Detector] Novo Shaka Player criado:",
            player
          );

          const originalLoad = player.load;
          player.load = function (manifestUri, ...loadArgs) {
            console.log(
              "[Udemy Video Detector] Shaka Player carregando manifest:",
              manifestUri
            );
            if (
              manifestUri &&
              (manifestUri.includes(".m3u8") || manifestUri.includes(".mpd"))
            ) {
              chrome.storage.local.set({
                [`udemy_video_${Date.now()}_${Math.random()}`]: {
                  url: manifestUri,
                  title: document.title,
                  source: "udemy_shaka_manifest",
                  timestamp: Date.now(),
                  type: "manifest",
                },
              });
            }
            return originalLoad.call(this, manifestUri, ...loadArgs);
          };

          return player;
        };

        Object.setPrototypeOf(value.Player, originalPlayerConstructor);
        Object.assign(value.Player, originalPlayerConstructor);
      }
    },
    get: function () {
      return this._shaka;
    },
    configurable: true,
  });

  // Interceptação de URL.createObjectURL (para blobs de vídeo)
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = originalCreateObjectURL.call(this, obj);
    if (obj instanceof Blob && obj.type && obj.type.includes("video")) {
      console.log("[Udemy Video Detector] Blob URL criada para vídeo:", url);
      chrome.storage.local.set({
        [`udemy_video_${Date.now()}_${Math.random()}`]: {
          url: url,
          title: document.title,
          source: "udemy_blob_url",
          timestamp: Date.now(),
          blob_type: obj.type,
        },
      });
    }
    return url;
  };

  // Log de todos os elementos video existentes na página
  setTimeout(() => {
    const existingVideos = document.querySelectorAll("video");
    console.log(
      `[Udemy Video Detector] ${existingVideos.length} elementos video encontrados na página`
    );
    existingVideos.forEach((video, index) => {
      console.log(`[Udemy Video Detector] Video ${index}:`, {
        src: video.src,
        currentSrc: video.currentSrc,
        readyState: video.readyState,
        networkState: video.networkState,
      });
    });
  }, 3000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    videoDetector = new UniversalVideoDetector();
  });
} else {
  videoDetector = new UniversalVideoDetector();
}

// Escuta mensagens da extensão
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    console.log("[NotificationIDM] Ping recebido do popup");
    sendResponse({ success: true, message: "Content script ativo" });
    return true;
  }

  if (message.type === "force_scan") {
    console.log("[NotificationIDM] Recebida mensagem force_scan do popup");
    try {
      videoDetector.scanForVideos();
      sendResponse({ success: true, message: "Scan forçado executado" });
    } catch (error) {
      console.error("[NotificationIDM] Erro no force_scan:", error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Indica que vai responder assincronamente
  }
});
