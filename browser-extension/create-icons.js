// Criar ícones SVG simples para a extensão
const iconSVG = `
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="20" fill="#4299e1"/>
  <text x="64" y="80" font-family="Arial" font-size="60" fill="white" text-anchor="middle">🎬</text>
</svg>
`;

// Função para converter SVG em Canvas e depois em PNG
function createIcon(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Fundo azul
  ctx.fillStyle = "#4299e1";
  ctx.roundRect = function (x, y, w, h, r) {
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };

  ctx.roundRect(0, 0, size, size, size * 0.15).fill();

  // Emoji de câmera
  ctx.font = `${size * 0.5}px Arial`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎬", size / 2, size / 2);

  return canvas.toDataURL("image/png");
}

// Se estiver rodando em contexto de navegador, cria os ícones
if (typeof document !== "undefined") {
  console.log("Para criar ícones, execute:");
  console.log("1. Abra o DevTools (F12)");
  console.log("2. Cole este código no Console");
  console.log("3. Os ícones serão criados automaticamente");

  // Criar ícones de diferentes tamanhos
  [16, 48, 128].forEach((size) => {
    const dataURL = createIcon(size);
    const link = document.createElement("a");
    link.download = `icon${size}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}
