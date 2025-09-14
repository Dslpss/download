// Script de debug AVANÇADO para executar no console da Udemy
// Copie e cole este código no console do DevTools (F12) na página da Udemy

console.log("🎯 Udemy Video Debug Script AVANÇADO - Iniciando...");

// 1. Verifica extensão
if (typeof chrome !== "undefined" && chrome.storage) {
  console.log("✅ Extensão detectada");
} else {
  console.log("❌ Extensão não detectada");
}

// 2. Monitora todas as requisições da Udemy
const originalFetch = window.fetch;
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

let requestCount = 0;
let interceptedUrls = [];

// Intercepta fetch com análise de resposta
window.fetch = async function (...args) {
  const [url] = args;
  requestCount++;

  if (url && typeof url === "string" && url.includes("udemy.com")) {
    console.log(`🌐 Fetch ${requestCount} (Udemy):`, url);

    const response = await originalFetch.apply(this, args);

    // Analisa resposta se for API relevante
    if (
      url.includes("course-taking") ||
      url.includes("lecture") ||
      url.includes("media-src")
    ) {
      try {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();

        // Busca por URLs de vídeo
        const patterns = [
          /https:\/\/[^"'\s]*\.cloudfront\.net\/[^"'\s]*\.(?:mp4|m3u8|webm)(?:\?[^"'\s]*)?/gi,
          /"manifest_url":\s*"([^"]+)"/gi,
          /"src":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
          /"file":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
        ];

        patterns.forEach((pattern) => {
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const videoUrl = match[1] || match[0];
            console.log("� URL DE VÍDEO ENCONTRADA (Fetch):", videoUrl);
            interceptedUrls.push({ url: videoUrl, source: "fetch", api: url });
          }
        });
      } catch (e) {
        console.log("Erro ao analisar resposta:", e);
      }
    }

    return response;
  }

  return originalFetch.apply(this, args);
};

// Intercepta XHR com análise de resposta
XMLHttpRequest.prototype.open = function (method, url, ...args) {
  this._debugUrl = url;
  return originalXHROpen.call(this, method, url, ...args);
};

XMLHttpRequest.prototype.send = function (...args) {
  if (this._debugUrl && this._debugUrl.includes("udemy.com")) {
    this.addEventListener("load", function () {
      requestCount++;
      console.log(`🌐 XHR ${requestCount} (Udemy):`, this._debugUrl);

      if (
        this._debugUrl.includes("course-taking") ||
        this._debugUrl.includes("lecture") ||
        this._debugUrl.includes("media-src")
      ) {
        try {
          const text = this.responseText;
          const patterns = [
            /https:\/\/[^"'\s]*\.cloudfront\.net\/[^"'\s]*\.(?:mp4|m3u8|webm)(?:\?[^"'\s]*)?/gi,
            /"manifest_url":\s*"([^"]+)"/gi,
            /"src":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
            /"file":\s*"([^"]*\.(?:mp4|m3u8|webm)[^"]*)"/gi,
          ];

          patterns.forEach((pattern) => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
              const videoUrl = match[1] || match[0];
              console.log("🎯 URL DE VÍDEO ENCONTRADA (XHR):", videoUrl);
              interceptedUrls.push({
                url: videoUrl,
                source: "xhr",
                api: this._debugUrl,
              });
            }
          });
        } catch (e) {
          console.log("Erro ao analisar resposta XHR:", e);
        }
      }
    });
  }

  return originalXHRSend.apply(this, args);
};

// 3. Monitora Shaka Player
if (window.shaka) {
  console.log("� Shaka Player já disponível");
  interceptShaka();
} else {
  // Aguarda o Shaka ser carregado
  Object.defineProperty(window, "shaka", {
    set: function (value) {
      console.log("📺 Shaka Player carregado:", value);
      this._shaka = value;
      if (value) interceptShaka();
    },
    get: function () {
      return this._shaka;
    },
    configurable: true,
  });
}

function interceptShaka() {
  if (window.shaka && window.shaka.Player) {
    const originalPlayer = window.shaka.Player;

    window.shaka.Player = function (...args) {
      const player = new originalPlayer(...args);
      console.log("🎬 Novo Shaka Player criado");

      const originalLoad = player.load;
      player.load = function (manifestUri, ...loadArgs) {
        console.log("🎯 MANIFEST CARREGADO:", manifestUri);
        interceptedUrls.push({
          url: manifestUri,
          source: "shaka",
          type: "manifest",
        });
        return originalLoad.call(this, manifestUri, ...loadArgs);
      };

      return player;
    };

    Object.setPrototypeOf(window.shaka.Player, originalPlayer);
    Object.assign(window.shaka.Player, originalPlayer);
  }
}

// 4. Função para listar URLs encontradas
window.listInterceptedUrls = function () {
  console.log("📋 URLs interceptadas:", interceptedUrls);
  return interceptedUrls;
};

// 5. Verifica storage da extensão
setInterval(() => {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(null, (data) => {
      const udemyKeys = Object.keys(data).filter((k) =>
        k.startsWith("udemy_video_")
      );
      if (udemyKeys.length > 0) {
        console.log(
          `📦 ${udemyKeys.length} URLs da Udemy no storage:`,
          udemyKeys.map((k) => data[k])
        );
      }
    });
  }
}, 5000);

console.log("🎯 Debug script ativo!");
console.log("📋 Execute 'listInterceptedUrls()' para ver URLs encontradas");
console.log("🎬 Inicie o vídeo agora e observe os logs...");
