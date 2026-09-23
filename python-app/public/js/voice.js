// MODO DE VOZ — PROTÓTIPO BETA / EXPERIMENTAL
// Implementado 100% no navegador (Web Speech API), sem custo de API.
// Feature em teste: pode ser removida sem impacto no resto do app.
//
// voice.js
// ========
// Tudo que é voz mora aqui. O resto do app não sabe como isto funciona -
// chat.js só chama initVoiceInput() e addSpeakButton(), e chat.html só
// carrega este arquivo e tem um <div id="voice-controls"> vazio. Para
// remover a feature: apagar este arquivo, a tag <script>, o <div> e as
// duas chamadas em chat.js. Nada no backend depende disto.
//
// Duas metades:
//   - STT (fala -> texto): botão de microfone no campo de mensagem, em
//     push-to-talk. O texto reconhecido só PREENCHE o campo; quem envia
//     continua sendo a pessoa, do jeito de sempre.
//   - TTS (texto -> fala): botão de alto-falante em cada resposta da IA.
//
// Requisitos do navegador:
//   - Contexto seguro: só funciona em HTTPS ou em localhost/127.0.0.1.
//     Servido por IP da rede local (ex.: http://192.168.x.x:5000) o
//     navegador bloqueia o microfone.
//   - SpeechRecognition existe no Chrome/Edge/Safari (com prefixo
//     webkit) e NÃO existe no Firefox. Onde faltar, os botões
//     simplesmente não aparecem e o chat de texto segue igual - é por
//     isso que toda a montagem passa por feature detection.

var VOICE_LANG = "pt-BR";

var ReconhecimentoDeFala =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function temReconhecimento() {
  return typeof ReconhecimentoDeFala === "function";
}

// Checa o valor, não só a existência da chave: `"speechSynthesis" in
// window` continua verdadeiro quando a propriedade existe valendo
// undefined, e aí addSpeakButton criaria botões que não falam nada.
function temSintese() {
  return !!(
    window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function"
  );
}

var ICONE_MIC =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="2.5" width="5" height="9" rx="2.5"></rect><path d="M4.8 9.2a5.2 5.2 0 0 0 10.4 0"></path><line x1="10" y1="14.4" x2="10" y2="17.5"></line></svg>';

var ICONE_MIC_PARAR =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor"><rect x="5.6" y="5.6" width="8.8" height="8.8" rx="1.6"></rect></svg>';

var ICONE_SOM =
  '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.6h2.6L10 4.6v10.8l-3.4-3H4z"></path><path d="M13 7.4a3.6 3.6 0 0 1 0 5.2"></path></svg>';

var ICONE_SOM_PARAR =
  '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.6h2.6L10 4.6v10.8l-3.4-3H4z"></path><line x1="13" y1="7.6" x2="16.4" y2="12.4"></line><line x1="16.4" y1="7.6" x2="13" y2="12.4"></line></svg>';

// --------------------------------------------------------------------------
// Fala -> texto (STT)
// --------------------------------------------------------------------------

/**
 * Monta o botão de microfone e liga o reconhecimento de fala ao campo de
 * mensagem. Não faz nada (e devolve null) se o navegador não suportar -
 * quem chama não precisa checar.
 *
 * O texto reconhecido é escrito em `inputEl` e NUNCA enviado sozinho: a
 * pessoa revisa e manda como sempre. Se já houver algo digitado, o que
 * for falado é acrescentado no fim em vez de apagar o que estava lá.
 *
 * @param {HTMLTextAreaElement|HTMLInputElement} inputEl - campo de mensagem
 * @param {(texto: string) => void} [onFinalTranscript] - avisado com o
 *   texto final quando o reconhecimento termina (opcional)
 * @returns {HTMLButtonElement|null} o botão criado, ou null se não houver suporte
 */
function initVoiceInput(inputEl, onFinalTranscript) {
  if (!inputEl) return null;
  if (!temReconhecimento()) {
    var unsupported = document.getElementById("voice-beta-label");
    if (unsupported) unsupported.textContent = "Ditado indisponível neste navegador. Você pode digitar.";
    return null;
  }

  var container = document.getElementById("voice-controls");
  if (!container) return null;

  var botao = document.createElement("button");
  // "button" e não "submit": este botão vive dentro do <form> do
  // composer, e um submit aqui mandaria a mensagem sem querer.
  botao.type = "button";
  botao.className = "voice-mic-button";
  botao.innerHTML = ICONE_MIC;
  botao.title = "Falar (beta)";
  botao.setAttribute("aria-label", "Ditar mensagem por voz");

  container.appendChild(botao);

  // Aviso de "isto é experimental" fica acima do campo, e não colado no
  // botão: a fileira dentro do campo já carrega o seletor de
  // personalidade e a seta de enviar, e mais um elemento ali roubaria
  // espaço demais de quem está digitando.
  var rotulo = document.getElementById("voice-beta-label");
  if (rotulo) rotulo.textContent = "Voz (beta)";

  // O CSS só reserva o espaço extra do microfone quando ele realmente
  // existe - sem isso, navegador sem suporte (Firefox) ficaria com um
  // buraco no campo de mensagem.
  var composer = inputEl.closest(".composer");
  if (composer) composer.classList.add("has-voice");

  var reconhecedor = new ReconhecimentoDeFala();
  reconhecedor.lang = VOICE_LANG;
  // continuous = false: o próprio navegador encerra ao detectar silêncio,
  // que é justamente o comportamento de push-to-talk pedido.
  reconhecedor.continuous = false;
  reconhecedor.interimResults = true;
  reconhecedor.maxAlternatives = 1;

  var gravando = false;
  var textoBase = "";
  var textoFinal = "";

  function marcar(ativo) {
    gravando = ativo;
    botao.classList.toggle("is-recording", ativo);
    botao.innerHTML = ativo ? ICONE_MIC_PARAR : ICONE_MIC;
    botao.title = ativo ? "Parar de gravar" : "Falar (beta)";
    botao.setAttribute(
      "aria-label",
      ativo ? "Parar de gravar" : "Ditar mensagem por voz",
    );
  }

  // Escreve no campo E dispara o evento "input": sem isso o wireComposer
  // não reavalia nada e a seta de enviar continuaria desabilitada, mesmo
  // com texto na tela.
  function escrever(texto) {
    if (inputEl.disabled || cancelamentoEmAndamento) return;
    inputEl.value = texto;
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  document.addEventListener("tt:generating", function (event) {
    if (event.detail && gravando) { reconhecedor.abort(); marcar(false); }
  });
  reconhecedor.onresult = function (evento) {
    var parcial = "";
    for (var i = evento.resultIndex; i < evento.results.length; i++) {
      var trecho = evento.results[i][0].transcript;
      if (evento.results[i].isFinal) textoFinal += trecho;
      else parcial += trecho;
    }
    escrever(textoBase + textoFinal + parcial);
  };

  reconhecedor.onerror = function (evento) {
    var erro = evento.error;
    // "no-speech" e "aborted" são desfechos normais de push-to-talk (a
    // pessoa desistiu, ou tocou e não falou) - resetar o botão em
    // silêncio, sem alerta, é o comportamento menos irritante.
    if (erro === "no-speech" || erro === "aborted") return;

    var mensagens = {
      "not-allowed":
        "Preciso de permissão para usar o microfone. Libere o acesso nas " +
        "configurações do navegador e tente de novo.",
      "service-not-allowed":
        "O navegador bloqueou o reconhecimento de voz. Isso costuma " +
        "acontecer fora de HTTPS ou localhost.",
      "audio-capture":
        "Não encontrei nenhum microfone disponível neste dispositivo.",
      network:
        "O reconhecimento de voz precisa de internet e a conexão falhou. " +
        "Tente de novo em instantes.",
    };
    showUIMessage(
      mensagens[erro] ||
        "Não consegui te ouvir agora (" + erro + "). Tente de novo.",
    );
  };

  reconhecedor.onend = function () {
    marcar(false);
    if (textoFinal && onFinalTranscript) onFinalTranscript(textoFinal);
  };

  botao.addEventListener("click", function () {
    if (gravando) {
      reconhecedor.stop();
      return;
    }
    // Ditar por cima do que a IA está falando fica confuso, e o eco do
    // alto-falante ainda contamina o reconhecimento.
    pararFala();

    textoFinal = "";
    textoBase = inputEl.value;
    if (textoBase && !/\s$/.test(textoBase)) textoBase += " ";

    try {
      reconhecedor.start();
      marcar(true);
    } catch (_e) {
      // start() lança InvalidStateError se já estiver rodando - o
      // reconhecedor é o mesmo objeto, então basta ignorar.
      marcar(false);
    }
  });

  return botao;
}

// --------------------------------------------------------------------------
// Texto -> fala (TTS)
// --------------------------------------------------------------------------

var vozEscolhida = null;

/**
 * Melhor voz em português disponível. As vozes "Google"/"Natural"/
 * "Online" soam bem melhor que as offline do sistema, então têm
 * preferência; sem nenhuma delas, vale qualquer voz pt.
 */
function pickBestVoice() {
  if (!temSintese()) return null;
  var vozes = window.speechSynthesis.getVoices().filter(function (v) {
    return v.lang && (v.lang.indexOf("pt-BR") === 0 || v.lang.indexOf("pt") === 0);
  });
  if (!vozes.length) return null;
  for (var i = 0; i < vozes.length; i++) {
    if (/google|natural|online/i.test(vozes[i].name)) return vozes[i];
  }
  return vozes[0];
}

// Em vários navegadores getVoices() volta vazio na primeira chamada: a
// lista é carregada de forma assíncrona. Por isso a voz é recalculada
// quando o navegador avisa que a lista chegou.
if (temSintese()) {
  vozEscolhida = pickBestVoice();
  window.speechSynthesis.onvoiceschanged = function () {
    vozEscolhida = pickBestVoice();
  };
}

// { botao, utterance, manutencao } do que está sendo lido agora.
var falaAtual = null;

/** Interrompe a leitura em andamento, se houver. */
function pararFala() {
  if (!falaAtual) return;
  var anterior = falaAtual;
  falaAtual = null;
  clearInterval(anterior.manutencao);
  marcarBotaoDeFala(anterior.botao, false);
  window.speechSynthesis.cancel();
}

function marcarBotaoDeFala(botao, falando) {
  if (!botao) return;
  botao.classList.toggle("is-speaking", falando);
  botao.innerHTML = falando ? ICONE_SOM_PARAR : ICONE_SOM;
  botao.title = falando ? "Parar a leitura" : "Ouvir esta resposta (beta)";
  botao.setAttribute(
    "aria-label",
    falando ? "Parar a leitura" : "Ouvir esta resposta em voz alta",
  );
}

/**
 * Lê `texto` em voz alta, interrompendo qualquer leitura anterior.
 *
 * @param {string} texto
 * @param {HTMLButtonElement} [botao] - botão que dispara, para refletir o estado
 */
function speakMessage(texto, botao) {
  if (!temSintese() || !texto || !texto.trim()) return;
  pararFala();

  var fala = new SpeechSynthesisUtterance(texto);
  fala.lang = VOICE_LANG;
  if (!vozEscolhida) vozEscolhida = pickBestVoice();
  if (vozEscolhida) fala.voice = vozEscolhida;

  function encerrar() {
    if (!falaAtual || falaAtual.utterance !== fala) return;
    clearInterval(falaAtual.manutencao);
    marcarBotaoDeFala(falaAtual.botao, false);
    falaAtual = null;
  }
  fala.onend = encerrar;
  fala.onerror = encerrar;

  // Bug conhecido do Chrome: a síntese trava sozinha por volta dos 15
  // segundos e a fala é cortada no meio. As respostas do TrashTalker
  // passam disso com facilidade, então um pause()/resume() periódico
  // mantém a fila viva até o fim.
  var manutencao = setInterval(function () {
    if (!window.speechSynthesis.speaking) return;
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);

  falaAtual = { botao: botao, utterance: fala, manutencao: manutencao };
  marcarBotaoDeFala(botao, true);
  window.speechSynthesis.speak(fala);
}

/**
 * Acrescenta o botão de ouvir a uma bolha de resposta da IA. Sem suporte
 * à síntese, não faz nada - a bolha fica como sempre foi.
 *
 * O texto é lido do DOM só na hora do clique, e não agora, porque a
 * bolha nasce vazia e é preenchida aos poucos pelo efeito de digitação
 * (revealGradually em chat.js).
 *
 * @param {HTMLElement} bolha - elemento .msg-bubble.msg-assistant
 */
function addSpeakButton(bolha) {
  if (!temSintese() || !bolha) return;

  var botao = document.createElement("button");
  botao.type = "button";
  botao.className = "voice-speak-button";
  marcarBotaoDeFala(botao, false);

  botao.addEventListener("click", function () {
    if (falaAtual && falaAtual.botao === botao) {
      pararFala();
      return;
    }
    var conteudo = bolha.querySelector(".msg-content");
    speakMessage(conteudo ? conteudo.textContent : "", botao);
  });

  bolha.appendChild(botao);
}

// Sair da página com o navegador ainda falando é desagradável: a fala
// continua tocando depois que a tela já mudou.
window.addEventListener("pagehide", pararFala);
