# 🎯 Guia de Debug - Udemy Video Downloader

## 📋 Implementação IDM-like para Udemy

### ✅ O que foi implementado:

1. **Interceptação de APIs da Udemy**

   - Monitora chamadas para `course-taking`, `media-src`, `assets`
   - Extrai URLs de vídeo das respostas JSON
   - Funciona tanto com XHR quanto Fetch

2. **Detecção de Streams**

   - CloudFront URLs (`.cloudfront.net`)
   - Arquivos de vídeo diretos (`.mp4`, `.m3u8`, `.webm`)
   - Caminhos específicos da Udemy (`/media-src/`, `/video/`)

3. **Monitoramento em Tempo Real**
   - Console logging para debug
   - Armazenamento das URLs interceptadas
   - Interface no popup da extensão

### 🔍 Como debugar:

#### 1. **Preparação**

```bash
# Carregue a extensão atualizada
1. Abra chrome://extensions/
2. Ative "Modo do desenvolvedor"
3. Clique "Carregar sem compactação"
4. Selecione a pasta: C:\Users\dslps\Desktop\Download\browser-extension
```

#### 2. **Teste na Udemy**

```bash
# Acesse uma aula na Udemy
1. Faça login na Udemy
2. Entre em um curso
3. Acesse uma aula com vídeo
4. Abra DevTools (F12)
5. Vá para a aba Console
```

#### 3. **Mensagens de Debug**

Procure por estas mensagens no console:

```javascript
// Inicialização
[Udemy Video Detector] Sistema de interceptação inicializado para Udemy

// URLs interceptadas via API
[Udemy Video Detector] URLs de vídeo encontradas na API: [array de URLs]

// URLs interceptadas via XHR
[Udemy Video Detector] URLs de vídeo encontradas via XHR: [array de URLs]

// Monitor periódico
[Udemy Monitor] X URLs de vídeo interceptadas: [objetos com detalhes]

// Popup
[Popup] URLs de vídeo da Udemy encontradas: [array de objetos]
```

#### 4. **Verificação no Storage**

```javascript
// Execute no console para ver dados salvos:
chrome.storage.local.get(null, (data) => {
  const udemyUrls = Object.keys(data).filter((k) =>
    k.startsWith("udemy_video_")
  );
  console.log(
    "URLs da Udemy salvas:",
    udemyUrls.map((k) => data[k])
  );
});
```

#### 5. **Teste do Popup**

```bash
1. Clique no ícone da extensão
2. Verifique se aparece "URLs de vídeo da Udemy encontradas" no console
3. Procure por itens marcados como "Vídeo Udemy Interceptado"
```

### 🐛 Troubleshooting:

#### ❌ **Problema: Nenhuma URL interceptada**

**Possíveis causas:**

- Udemy mudou as URLs da API
- Vídeo ainda não carregou
- Proteções anti-bot bloquearam

**Soluções:**

1. Aguarde o vídeo carregar completamente
2. Interaja com o player (play/pause)
3. Verifique se há erros no console

#### ❌ **Problema: URLs interceptadas mas download falha**

**Possíveis causas:**

- Headers de autenticação ausentes
- Token de sessão expirado
- Rate limiting da Udemy

**Soluções:**

1. Verifique se os headers estão sendo salvos
2. Execute o download imediatamente após interceptar
3. Use cookies de sessão válidos

#### ❌ **Problema: Erro 403 Forbidden**

**Possíveis causas:**

- Proteção anti-bot
- Headers insuficientes
- IP bloqueado

**Soluções:**

1. Use User-Agent do browser
2. Inclua cookies de sessão
3. Adicione Referer header
4. Diminua intervalo entre requests

### 📊 Análise de Rede:

Para entender melhor como a Udemy carrega vídeos:

1. **DevTools → Network**
2. **Filtre por:**

   - `course-taking`
   - `media-src`
   - `.m3u8`
   - `.mp4`
   - `cloudfront`

3. **Observe padrões:**
   - URLs de manifesto HLS
   - Segmentos de vídeo
   - Headers de autenticação

### 🎯 Próximos Passos:

Se a interceptação estiver funcionando mas o download falhar:

1. **Implementar proxy de headers**
2. **Adicionar rotação de User-Agents**
3. **Implementar download segmentado para HLS**
4. **Adicionar retry com backoff exponencial**

### 📝 Logs de Teste:

Documente aqui os resultados dos seus testes:

```
Data: ___________
Curso testado: ___________
URLs interceptadas: Sim/Não
Download funcionou: Sim/Não
Erro encontrado: ___________
```
