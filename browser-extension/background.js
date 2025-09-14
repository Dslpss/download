// === Interceptação UNIVERSAL de vídeos ===
function isUniversalVideoUrl(url) {
  // Só aceita arquivos completos ou playlists (ignora segmentos .ts, .m4s, .chunk, .frag)
  // Aceita: mp4, webm, mov, avi, mkv, m4v, 3gp, flv, m3u8, mpd
  // Ignora: ts, m4s, chunk, frag
  return /\.(mp4|webm|mov|avi|mkv|m4v|3gp|flv|m3u8|mpd)([?#].*)?$/i.test(url);
}

function hashUrl(url) {
  // Simples hash para chave (evita problemas de tamanho)
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (isUniversalVideoUrl(details.url)) {
      const key = `video_url_${hashUrl(details.url)}`;
      chrome.storage.local.set({
        [key]: {
          url: details.url,
          timestamp: Date.now(),
          tabId: details.tabId,
          type: details.type,
        },
      });
      console.log("[UNIVERSAL-BG] URL de vídeo interceptada:", details.url);
    }
  },
  {
    urls: ["<all_urls>"],
  },
  []
);
// Background script - Intercepta requisições como o IDM
console.log("Video Downloader Background - Interceptação IDM-like iniciada");

// Intercepta headers ANTES das requisições serem enviadas (como IDM)
chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    // Filtra apenas requisições de vídeo/stream
    if (isVideoRequest(details.url)) {
      console.log("[IDM-like] Interceptando requisição de vídeo:", details.url);

      // Captura headers completos ANTES do envio
      const requestHeaders = {};
      if (details.requestHeaders) {
        details.requestHeaders.forEach((header) => {
          requestHeaders[header.name] = header.value;
        });
      }

      // Adiciona metadados extras
      const requestData = {
        url: details.url,
        method: details.method,
        headers: requestHeaders,
        timestamp: Date.now(),
        tabId: details.tabId,
        frameId: details.frameId,
        type: details.type,
        initiator: details.initiator,
      };

      // Salva no storage para uso posterior
      const key = `request_${details.url}`;
      chrome.storage.local.set({
        [key]: requestData,
      });

      console.log(
        "[IDM-like] Headers de requisição capturados:",
        requestHeaders
      );
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// Intercepta respostas para capturar headers de resposta também
chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (isVideoRequest(details.url)) {
      console.log("[IDM-like] Interceptando resposta de vídeo:", details.url);

      // Captura headers de resposta
      const responseHeaders = {};
      if (details.responseHeaders) {
        details.responseHeaders.forEach((header) => {
          responseHeaders[header.name] = header.value;
        });
      }

      // Atualiza dados da requisição com headers de resposta
      const key = `request_${details.url}`;
      chrome.storage.local.get([key]).then((result) => {
        if (result[key]) {
          result[key].responseHeaders = responseHeaders;
          result[key].statusCode = details.statusCode;
          chrome.storage.local.set({ [key]: result[key] });
        }
      });

      console.log(
        "[IDM-like] Headers de resposta capturados:",
        responseHeaders
      );
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Detecta se é uma requisição de vídeo/stream
function isVideoRequest(url) {
  // URLs diretas de vídeo
  if (/\.(mp4|webm|mov|avi|mkv|m4v|3gp|flv)([?#].*)?$/i.test(url)) {
    return true;
  }

  // Streams (HLS, DASH, etc.)
  if (/\.(m3u8|mpd|ts|m4s)([?#].*)?$/i.test(url)) {
    return true;
  }

  // PRIORIDADE: URLs diretas de CDNs de vídeo (BunnyCDN, etc.)
  if (url.includes("iframe.mediadelivery.net/embed/")) {
    return true;
  }
  if (url.includes("bunnycdn.com") || url.includes("b-cdn.net")) {
    return true;
  }

  // URLs específicas da Udemy que podem conter vídeos
  if (url.includes("udemy.com")) {
    // Intercepta requisições de API da Udemy que podem ter URLs de vídeo
    if (
      url.includes("/media-src/") ||
      url.includes("/assets/") ||
      url.includes("/course-taking/") ||
      url.includes("/video/") ||
      url.includes("cloudfront.net") ||
      url.includes("stream") ||
      url.includes("hls")
    ) {
      return true;
    }
  }

  // CloudFront (usado pela Udemy)
  if (
    url.includes("cloudfront.net") &&
    (url.includes("video") || url.includes("stream") || url.includes("media"))
  ) {
    return true;
  }

  // Domínios conhecidos de vídeo
  const videoDomains = [
    "googlevideo.com",
    "youtube.com",
    "youtu.be",
    "vimeo.com",
    "twitch.tv",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "udemy.com",
    "rocketseat.com.br",
    "amazonaws.com",
    "cloudfront.net",
    "cdnjs.com",
    "jsdelivr.net",
  ];

  return videoDomains.some((domain) => url.includes(domain));
}

// Limpa dados antigos periodicamente (evita acúmulo)
setInterval(() => {
  chrome.storage.local.get(null).then((items) => {
    const now = Date.now();
    const keysToRemove = [];

    Object.entries(items).forEach(([key, value]) => {
      if (key.startsWith("request_") && value.timestamp) {
        // Remove dados mais antigos que 10 minutos
        if (now - value.timestamp > 10 * 60 * 1000) {
          keysToRemove.push(key);
        }
      }
    });

    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove);
      console.log(
        "[IDM-like] Limpeza:",
        keysToRemove.length,
        "entradas antigas removidas"
      );
    }
  });
}, 60000); // Executa a cada minuto

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "videos_detected") {
    console.log("Vídeos detectados:", message.videos);

    // Atualiza badge da extensão
    chrome.action.setBadgeText({
      text: message.videos.length.toString(),
      tabId: sender.tab.id,
    });

    chrome.action.setBadgeBackgroundColor({
      color: "#ff6b6b",
    });

    // Armazena vídeos detectados
    chrome.storage.local.set({
      [`videos_${sender.tab.id}`]: message.videos,
      [`page_${sender.tab.id}`]: {
        url: message.url,
        title: message.title,
      },
    });
  }
});

// Limpa badge quando tab muda
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.action.setBadgeText({
    text: "",
    tabId: activeInfo.tabId,
  });
});

// Limpa dados quando tab é fechada
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove([`videos_${tabId}`, `page_${tabId}`]);
});
