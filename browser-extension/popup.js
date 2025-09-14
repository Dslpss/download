// Popup script
document.addEventListener("DOMContentLoaded", async () => {
  const videoList = document.getElementById("videoList");
  const openAppBtn = document.getElementById("openApp");
  const refreshBtn = document.getElementById("refresh");

  let currentVideos = [];

  // Verifica se content script está disponível na aba
  async function isContentScriptAvailable(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
          if (chrome.runtime.lastError) {
            console.log(
              "[PopupIDM] Content script não disponível:",
              chrome.runtime.lastError.message
            );
            resolve(false);
          } else {
            console.log("[PopupIDM] Content script disponível");
            resolve(true);
          }
        });
      } catch (error) {
        console.log("[PopupIDM] Erro ao verificar content script:", error);
        resolve(false);
      }
    });
  }

  // Carrega vídeos detectados
  async function loadVideos() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const result = await chrome.storage.local.get([
        `videos_${tab.id}`,
        `page_${tab.id}`,
      ]);

      const videos = result[`videos_${tab.id}`] || [];
      const pageInfo = result[`page_${tab.id}`] || {};

      // Carrega URLs universais (video_url_*) e Udemy (udemy_video_*)
      let universalVideos = [];
      let udemyVideos = [];
      let debugHtml = "";
      const allItems = await chrome.storage.local.get(null);
      // UNIVERSAL: pega as últimas 10 video_url_*
      universalVideos = Object.keys(allItems)
        .filter((key) => key.startsWith("video_url_"))
        .map((key) => ({ ...allItems[key], id: key }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

      // UDEMY: pega as últimas 10 udemy_video_*, só .m3u8
      udemyVideos = Object.keys(allItems)
        .filter((key) => key.startsWith("udemy_video_"))
        .map((key) => ({ ...allItems[key], id: key }))
        .filter((v) => v.url && v.url.includes(".m3u8"))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

      // DEBUG: Mostra todas as chaves udemy_video_* e video_url_* encontradas
      const allDebug = Object.keys(allItems)
        .filter(
          (key) =>
            key.startsWith("udemy_video_") || key.startsWith("video_url_")
        )
        .map((key) => ({ ...allItems[key], id: key }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
      debugHtml = "";

      // Adiciona as URLs universais e Udemy à lista principal
      const combinedVideos = [
        ...videos,
        ...universalVideos.map((v) => ({
          url: v.url,
          title: v.title || "Vídeo Interceptado (Universal)",
          source: v.source,
          type: "universal_intercepted",
        })),
        ...udemyVideos.map((v) => ({
          url: v.url,
          title: v.title || "Vídeo Udemy Interceptado (.m3u8)",
          source: v.source,
          type: "udemy_intercepted",
        })),
      ];
      currentVideos = combinedVideos;
      displayVideos(combinedVideos, pageInfo, debugHtml);
    } catch (error) {
      console.error("Erro ao carregar vídeos:", error);
      videoList.innerHTML =
        '<div class="no-videos">❌ Erro ao carregar vídeos</div>';
    }
  }

  function displayVideos(videos, pageInfo, udemyDebugHtml = "") {
    let html = "";
    if (udemyDebugHtml) {
      html += udemyDebugHtml;
    }
    if (videos.length === 0) {
      html += `
        <div class="no-videos">
          <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
          <div>Nenhum vídeo detectado</div>
          <div style="margin-top: 8px; font-size: 12px;">
            Navegue para uma página com vídeos<br>
            (YouTube, Vimeo, etc.)
          </div>
        </div>
      `;
      videoList.innerHTML = html;
      return;
    }

    const videosHTML = videos
      .map((video, index) => {
        const typeText = getTypeText(video.type);
        const shortUrl =
          video.url.length > 50
            ? video.url.substring(0, 50) + "..."
            : video.url;

        return `
        <div class="video-item" data-index="${index}">
          <div class="video-title">${escapeHtml(video.title)}</div>
          <div class="video-url">${escapeHtml(shortUrl)}</div>
          <span class="video-type">${typeText}</span>
        </div>
      `;
      })
      .join("");

    html += videosHTML;
    videoList.innerHTML = html;

    // Adiciona event listeners aos vídeos
    document.querySelectorAll(".video-item").forEach((item) => {
      item.addEventListener("click", async () => {
        try {
          const index = parseInt(item.dataset.index);
          console.log(`[POPUP] Clique no vídeo ${index}:`, videos[index]);
          showMessage(
            `🎬 Iniciando download: ${videos[index].title.substring(0, 30)}...`
          );

          // Log explícito antes de chamar downloadVideo
          console.log(
            `[POPUP] Chamando downloadVideo para:`,
            videos[index].url
          );
          await downloadVideo(videos[index]);
          console.log(`[POPUP] downloadVideo completou`);
        } catch (error) {
          console.error(`[POPUP] Erro no card click:`, error);
          showMessage(`❌ Erro: ${error.message}`);
        }
      });
    });
  }

  function getTypeText(type) {
    const types = {
      video_element: "🎥 Elemento Video",
      page_url: "🌐 URL da Página",
      iframe: "📦 iframe",
      udemy_intercepted: "🎯 Vídeo Udemy Interceptado",
      universal_intercepted: "🎯 Vídeo Interceptado (Universal)",
    };
    return types[type] || "❓ Desconhecido";
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async function checkAppStatus() {
    try {
      const r = await fetch("http://localhost:8765/status", {
        method: "GET",
        cache: "no-store",
      });
      if (!r.ok) return false;
      const data = await r.json();
      return data.status === "running";
    } catch (e) {
      return false;
    }
  }

  async function ensureAppReady() {
    const ok = await checkAppStatus();
    if (!ok) {
      showMessage("⚠️ App não responde.");
      openAppBtn.classList.add("pulse");
      openAppBtn.textContent = "🟡 Abrir App antes";
      return false;
    }
    return true;
  }

  async function downloadVideo(video) {
    console.log(`[POPUP] downloadVideo chamado para:`, video.url);
    showMessage(`🔍 Verificando se app está rodando...`);

    if (!(await ensureAppReady())) return; // novo

    showMessage(`✅ App OK! Enviando vídeo...`);
    console.log(`[POPUP] App responde, prosseguindo com download`);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || !tab.id) {
        showMessage("❌ Não foi possível identificar a aba ativa.");
        return;
      }
      const referer = tab.url;

      // 1. Tenta buscar headers completos do webRequest (IDM-like)
      let allHeaders = {};
      let foundHeaders = false;
      try {
        const requestKey = `request_${video.url}`;
        const result = await chrome.storage.local.get([requestKey]);
        if (result[requestKey] && result[requestKey].headers) {
          allHeaders = result[requestKey].headers;
          foundHeaders = true;
          console.log(
            "[IDM-like] Headers de requisição encontrados:",
            allHeaders
          );
        }
      } catch (e) {}

      // 2. Fallback: buscar headers do userscript/XHR
      if (!foundHeaders) {
        try {
          const key = `headers_${video.url}`;
          const result = await chrome.storage.local.get([key]);
          if (result[key] && Object.keys(result[key]).length > 0) {
            allHeaders = result[key];
            foundHeaders = true;
          }
        } catch (e) {}
      }

      // 3. Se não encontrou headers, faz fallback para método antigo (chrome.debugger/fetch)
      if (!foundHeaders) {
        if (!chrome.debugger || !chrome.scripting) {
          showMessage(
            "❌ Permissões insuficientes para capturar headers. Verifique o manifest.json."
          );
          return;
        }
        const debuggee = { tabId: tab.id };
        try {
          await chrome.debugger.attach(debuggee, "1.3");
        } catch (e) {
          showMessage("❌ Não foi possível ativar o debugger nesta aba.");
          return;
        }
        // Intercepta eventos de rede
        chrome.debugger.onEvent.addListener(function listener(
          source,
          method,
          params
        ) {
          if (
            source.tabId === tab.id &&
            method === "Network.requestWillBeSent"
          ) {
            if (params.request && params.request.url === video.url) {
              allHeaders = Object.assign({}, params.request.headers || {});
              chrome.debugger.onEvent.removeListener(listener);
            }
          }
        });
        await chrome.debugger.sendCommand(debuggee, "Network.enable");
        await fetch(video.url, { method: "HEAD", mode: "no-cors" }).catch(
          () => {}
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await chrome.debugger.detach(debuggee);
      }

      // Cookies extras (garante que Cookie sempre será enviado)
      const cookies = await chrome.cookies.getAll({ url: referer });
      if (cookies.length > 0) {
        allHeaders["Cookie"] = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
      }

      // Sempre reforça Referer e User-Agent se não vieram do storage/debugger
      if (!allHeaders["Referer"]) allHeaders["Referer"] = referer;
      if (!allHeaders["User-Agent"]) {
        let userAgent = "";
        try {
          userAgent = await chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              func: () => navigator.userAgent,
            })
            .then((res) => res[0]?.result || navigator.userAgent);
        } catch (e) {
          userAgent = navigator.userAgent;
        }
        allHeaders["User-Agent"] = userAgent;
      }

      // Log para depuração
      console.log("[VideoDownloader] Headers enviados:", allHeaders);
      // Mostra visualmente os headers capturados para debug
      let debugHeaders = Object.entries(allHeaders)
        .map(
          ([k, v]) =>
            `<b>${k}</b>: <span style='word-break:break-all'>${v}</span>`
        )
        .join("<br>");
      showMessage(`Headers capturados:<br>${debugHeaders}`);

      // Tenta enviar para o app via HTTP
      const success = await sendToApp(video, allHeaders);

      if (!success) {
        // Fallback: copia para clipboard
        await copyToClipboard(video.url);
        showMessage("📋 URL copiada! Cole no Video Downloader app");
      } else {
        showMessage("✅ Enviado para Video Downloader!");
      }

      // Fecha popup após envio
      setTimeout(() => window.close(), 1500);
    } catch (error) {
      console.error("Erro ao baixar vídeo:", error);
      showMessage("❌ Erro ao enviar vídeo");
    }
  }

  async function sendToApp(video, allHeaders = {}) {
    console.log(`[POPUP] sendToApp chamado para:`, video.url);
    console.log(`[POPUP] Headers para enviar:`, allHeaders);

    try {
      console.log(`[POPUP] Fazendo POST para http://localhost:8765/download`);

      // Para vídeos interceptados da Udemy, adiciona informações especiais
      const payload = {
        url: video.url,
        title: video.title,
        source: "browser_extension",
        headers: allHeaders,
      };

      if (video.type === "udemy_intercepted") {
        payload.udemy_intercepted = true;
        payload.direct_video_url = true;
        payload.original_source = video.source;
        console.log(
          "[POPUP] Enviando URL direta interceptada da Udemy:",
          video.url
        );
      }

      const response = await fetch("http://localhost:8765/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log(
        `[POPUP] Resposta recebida:`,
        response.status,
        response.statusText
      );
      const isOk = response.ok;
      console.log(`[POPUP] response.ok =`, isOk);
      return isOk;
    } catch (error) {
      return false;
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fallback para navegadores mais antigos
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    }
  }

  function showMessage(message) {
    const messageDiv = document.createElement("div");
    messageDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      background: #38a169;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      z-index: 1000;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => messageDiv.remove(), 3000);
  }

  // Event listeners
  openAppBtn.addEventListener("click", async () => {
    try {
      // Tenta abrir o app via protocolo personalizado (se implementado)
      const appUrl = "videodownloader://open";
      window.open(appUrl, "_blank");
    } catch (error) {
      showMessage("⚠️ Abra o Video Downloader app manualmente");
    }
  });

  refreshBtn.addEventListener("click", () => {
    loadVideos();
    showMessage("🔄 Lista atualizada");
  });

  // Força nova varredura da página atual
  refreshBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !tab.id) {
        console.error("[PopupIDM] Nenhuma aba ativa encontrada");
        return;
      }

      // Verifica se é uma URL válida para content scripts
      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("moz-extension://")
      ) {
        console.log("[PopupIDM] URL não suporta content scripts:", tab.url);
        videoList.innerHTML = `
          <div class="no-videos">
            <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
            <div>Esta página não suporta detecção de vídeos</div>
            <div style="margin-top: 8px; font-size: 12px;">
              Navegue para uma página web normal<br>
              (YouTube, Vimeo, etc.)
            </div>
          </div>
        `;
        return;
      }

      console.log(
        "[PopupIDM] Verificando se content script está disponível..."
      );
      const isAvailable = await isContentScriptAvailable(tab.id);

      if (!isAvailable) {
        console.log(
          "[PopupIDM] Content script não disponível, carregando vídeos do storage apenas"
        );
        loadVideos(); // Carrega do storage sem forçar scan
        return;
      }

      console.log("[PopupIDM] Enviando força scan para tab:", tab.id);

      chrome.tabs.sendMessage(tab.id, { type: "force_scan" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[PopupIDM] Erro ao comunicar com content script:",
            chrome.runtime.lastError.message
          );
          // Tenta recarregar mesmo com erro
          setTimeout(loadVideos, 1000);
        } else {
          console.log("[PopupIDM] Resposta do content script:", response);
          setTimeout(loadVideos, 1000);
        }
      });
    } catch (error) {
      console.error("[PopupIDM] Erro ao forçar varredura:", error);
    }
  });

  // Carrega vídeos ao abrir popup
  loadVideos();
});
