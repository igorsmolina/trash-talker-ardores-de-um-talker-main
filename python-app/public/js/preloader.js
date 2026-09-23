// preloader.js
// ============
// Tela de carregamento (index.html, login.html, signup.html - ver o
// .tt-preloader no início do <body> de cada uma, e o CSS em app.css).
// As cores vêm de var(--primary)/var(--background)/var(--muted-foreground),
// então funciona igual nos dois temas sem lógica extra aqui - o script
// inline no <head> de cada página já aplica html.dark antes do
// primeiro paint, então o preloader já nasce com a cor certa.
//
// A porcentagem reflete o carregamento real da página, não uma
// animação de tempo fixo: quando este script roda (DOMContentLoaded),
// o HTML/CSS/scripts já terminaram de carregar - o parser só chega até
// aqui depois disso (um <script> sempre espera qualquer <link
// rel="stylesheet"> anterior no documento antes de rodar, e o
// DOMContentLoaded só dispara depois de todo <script> síncrono
// executar). Então o que falta de verdade são as imagens da página
// (document.images) - a porcentagem é a fração delas já carregadas.

document.addEventListener("DOMContentLoaded", function () {
  var preloader = document.getElementById("ttPreloader");
  if (!preloader) return;

  var pctEl = document.getElementById("ttPct");
  var barEl = preloader.querySelector(".tt-bar");
  var fillEl = preloader.querySelector(".tt-fill");
  var images = Array.prototype.slice.call(document.images);
  var total = images.length;
  var loaded = 0;
  var hidden = false;

  function setProgress(pct) {
    pct = Math.max(0, Math.min(100, pct));
    if (pctEl) pctEl.textContent = Math.round(pct) + "%";
    if (barEl) barEl.style.transform = "scaleX(" + pct / 100 + ")";
    if (fillEl) fillEl.style.clipPath = "inset(" + (100 - pct) + "% 0 0 0)";
  }

  function hide() {
    if (hidden) return;
    hidden = true;
    setProgress(100);
    preloader.classList.add("is-done");
  }

  function onImageSettled() {
    loaded++;
    setProgress((loaded / total) * 100);
    if (loaded >= total) hide();
  }

  if (total === 0) {
    setProgress(100);
    hide();
    return;
  }

  images.forEach(function (img) {
    if (img.complete) {
      onImageSettled();
    } else {
      // "error" também conta como "resolvida" - uma imagem quebrada
      // não pode travar a tela de carregamento pra sempre.
      img.addEventListener("load", onImageSettled);
      img.addEventListener("error", onImageSettled);
    }
  });

  // Rede de segurança: se alguma imagem nunca disparar load/error por
  // algum motivo fora do previsto, o window.load ainda garante que o
  // preloader não fica preso na tela pra sempre.
  window.addEventListener("load", hide);
});
