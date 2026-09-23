// Shared accessibility enhancements; existing copy and form handlers are retained.
document.addEventListener("DOMContentLoaded", function () {
  if (new URLSearchParams(location.search).get("limpeza-local") === "erro") showUIMessage("A exclusão no servidor foi concluída, mas a limpeza local falhou. Limpe os dados deste site nas configurações do navegador.");
  document.querySelectorAll('button svg, a svg').forEach(function (icon) { icon.setAttribute('aria-hidden', 'true'); });
  document.querySelectorAll('input[type="email"]').forEach(function (input) { input.spellcheck = false; });
  document.querySelectorAll("button[title]").forEach(function (button) {
    if (!button.hasAttribute("aria-label")) {
      button.setAttribute("aria-label", button.title);
    }
  });
  document.querySelectorAll(".field").forEach(function (field, index) {
    var input = field.querySelector("input:not([type=hidden]), textarea");
    var hint = field.querySelector(".field-hint");
    if (input && hint) {
      hint.id = hint.id || "field-hint-" + index;
      input.setAttribute("aria-describedby", hint.id);
    }
  });
  document.querySelectorAll(".banner-error, .field-error").forEach(function (el) {
    el.setAttribute("role", "alert");
  });
  document.querySelectorAll(".banner-success").forEach(function (el) {
    el.setAttribute("role", "status");
  });
  document.querySelectorAll('.sidebar a[href]').forEach(function (link) {
    if (link.getAttribute("href") === window.location.pathname) {
      link.setAttribute("aria-current", "page");
    }
  });
  document.querySelectorAll('input[type="email"]').forEach(function (input) {
    input.autocomplete = "email";
  });
  document.querySelectorAll('.auth-card input[type="password"]').forEach(function (input) {
    input.autocomplete = location.pathname === "/login" ? "current-password" : "new-password";
  });
});


// Explicit lifecycle events; payloads come from API responses, never DOM text.
window.TTState = { user: null, chat: null, generating: false };
function emitTT(name, detail) {
  if (name === 'user') TTState.user = detail;
  if (name === 'chat' || name === 'response') TTState.chat = detail.chat;
  if (name === 'generating') TTState.generating = detail;
  if (name === 'logout') TTState = { user: null, chat: null, generating: false };
  document.dispatchEvent(new CustomEvent('tt:' + name, { detail: detail }));
  return detail;
}
function showUIMessage(message, anchor, isError) {
  var host = typeof anchor === 'string' ? document.querySelector(anchor) : anchor;
  host = host || document.querySelector('.chat-composer, .welcome-screen, .app-content, main');
  if (!host) return;
  var status = host.querySelector(':scope > .ui-message');
  if (!status) {
    status = document.createElement('div');
    status.className = 'ui-message';
    host.appendChild(status);
  }
  status.setAttribute('role', isError === false ? 'status' : 'alert');
  status.textContent = (isError === false ? '' : 'Aviso: ') + message;
  return status;
}
