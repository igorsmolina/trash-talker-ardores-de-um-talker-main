/* Frontend-only experiments. Change this one flag to remove all beta UI.
   Lifecycle events are emitted explicitly by layout.js and chat.js. */
const SOCIALIZACAO_BETA_ENABLED = true;
window.Socializacao = (function () {
  'use strict';
  var userId = null, chatId = null, empty = true, generating = false;
  var pendingRehearsal = false, drafts = Object.create(null), controls, suggestions, badge;
  var menu, menuTrigger, tools, menuOpen = false;
  var prefix = 'tt-social:v1:', pauseKey = 'tt-social:pause-shown';
  var activeMs = 0, lastTick = Date.now(), lastInteraction = Date.now(), pauseShown = false;
  var sessionAvailable = true;
  try { pauseShown = sessionStorage.getItem(pauseKey) === '1'; } catch (_) { sessionAvailable = false; }
  function key(id) { return prefix + encodeURIComponent(userId) + ':' + encodeURIComponent(id); }
  function read(id) {
    var value = JSON.parse(localStorage.getItem(key(id)) || '{}');
    return { rehearsal: value.rehearsal === true, note: typeof value.note === 'string' ? value.note : '' };
  }
  function write(id, changes) {
    if (!userId || !id) throw Error('Identifique sua conta e abra uma conversa antes de salvar.');
    var value = Object.assign(read(id), changes);
    localStorage.setItem(key(id), JSON.stringify(value));
  }
  function input() { return document.getElementById('chat-input') || document.getElementById('welcome-input'); }
  function button(text, action, className) {
    var el = document.createElement('button');
    el.type = 'button'; el.className = className || 'btn-outline'; el.textContent = text;
    el.addEventListener('click', action); return el;
  }
  function fill(text, after) {
    if (generating || !input() || input().disabled) return;
    var apply = function () {
      input().value = text; input().dispatchEvent(new Event('input', { bubbles: true }));
      input().focus(); if (after) after();
    };
    if (input().value.trim() && input().value !== text) {
      var accepted = false;
      showConfirmModal({ title: 'Substituir seu rascunho?', message: 'Seu texto atual será substituído. Nada será enviado.',
        confirmText: 'Substituir rascunho', onConfirm: function () { accepted = true; },
        onClose: function () { if (accepted) apply(); } });
    } else apply();
  }
  function field(host, labelText, id, value, multiline) {
    var wrap = document.createElement('div'); wrap.className = 'field social-field';
    var label = document.createElement('label'); label.htmlFor = id; label.textContent = labelText;
    var el = document.createElement(multiline ? 'textarea' : 'input');
    el.id = id; el.name = id; el.value = value || ''; el.maxLength = 2000;
    if (multiline) el.rows = 4;
    wrap.append(label, el); host.appendChild(wrap); return el;
  }
  function rehearsal() {
    if (!userId || generating) return;
    if (input().value.trim()) {
      var approved = false;
      showConfirmModal({ title: 'Preparar um ensaio?', message: 'Ao usar o modelo, ele substituirá o rascunho atual. Nada será enviado automaticamente.',
        confirmText: 'Preparar ensaio', onConfirm: function () { approved = true; },
        onClose: function () { if (approved) rehearsalEditor(); } });
    } else rehearsalEditor();
  }
  function rehearsalEditor() {
    var scenario, role, select, accepted = false, prompt;
    showConfirmModal({
      title: 'Ensaiar conversa (beta)',
      message: 'Prepare uma nova conversa. Você poderá editar a mensagem antes de enviar. A IA pode não seguir o ensaio como esperado.',
      confirmText: 'Usar modelo',
      renderContent: function (host) {
        var label = document.createElement('label'); label.htmlFor = 'rehearsal-kind'; label.textContent = 'Situação';
        select = document.createElement('select'); select.id = 'rehearsal-kind'; select.name = 'rehearsal-kind';
        var cases = [
          ['Iniciar conversa', 'iniciar uma conversa com um colega novo', 'um colega novo'],
          ['Pedir ajuda', 'pedir ajuda com uma tarefa', 'um colega'],
          ['Recusar convite', 'recusar um convite com gentileza', 'quem fez o convite'],
          ['Reencontrar amigo', 'reencontrar um amigo depois de muito tempo', 'um amigo'],
          ['Entrevista', 'participar de uma entrevista', 'uma pessoa entrevistadora'],
          ['Situação personalizada', '', '']
        ];
        cases.forEach(function (item, index) {
          var option = document.createElement('option'); option.value = index; option.textContent = item[0]; select.appendChild(option);
        });
        host.append(label, select);
        scenario = field(host, 'O que você quer ensaiar?', 'rehearsal-scenario', cases[0][1], true);
        role = field(host, 'Qual será o papel da outra pessoa?', 'rehearsal-role', cases[0][2]);
        select.addEventListener('change', function () {
          scenario.value = cases[select.value][1]; role.value = cases[select.value][2];
          if (select.value === '5') scenario.focus();
        });
      },
      onConfirm: function () {
        if (!scenario.value.trim() || !role.value.trim()) throw Error('Preencha a situação e o papel da outra pessoa.');
        prompt = 'Quero ensaiar: ' + scenario.value.trim() + '. Faça o papel de ' + role.value.trim() + ', responda curto, e me dê um retorno ao final.';
        if (chatId) {
          // Explicit transfer to a NEW conversation; never pretend old context was cleared.
          try { sessionStorage.setItem(prefix + 'pending:' + encodeURIComponent(userId), prompt); }
          catch (_) { throw Error('Não foi possível preparar a nova conversa neste navegador. Abra Nova conversa e prepare o ensaio lá.'); }
        }
        accepted = true;
      },
      onClose: function () {
        if (!accepted) return;
        if (chatId) { location.href = '/dashboard'; return; }
        pendingRehearsal = true; input().value = prompt;
        input().dispatchEvent(new Event('input', { bubbles: true })); input().focus(); renderBadge();
      }
    });
  }
  function notes() {
    if (!userId || !chatId || generating) return;
    var owner = userId, id = chatId, draftKey = key(id), area, status, saved;
    try { saved = read(id).note; } catch (_) { saved = ''; }
    showConfirmModal({
      title: 'Levar para a vida real (beta)',
      message: 'Escreva um pequeno próximo passo. Só fica neste navegador, sem sincronização e sem envio à IA.',
      confirmText: 'Salvar próximo passo',
      renderContent: function (host) {
        area = field(host, 'Meu próximo passo', 'social-note', drafts[draftKey] !== undefined ? drafts[draftKey] : saved, true);
        area.addEventListener('input', function () { drafts[draftKey] = area.value; });
        status = document.createElement('p'); status.setAttribute('role', 'status'); host.appendChild(status);
        var armed = false;
        host.appendChild(button('Apagar próximo passo', function (event) {
          if (!armed) { armed = true; event.currentTarget.textContent = 'Confirmar exclusão do próximo passo'; status.textContent = 'Confirme para apagar a nota salva neste navegador.'; return; }
          try {
            if (owner !== userId || id !== chatId) throw Error('A conta ou conversa mudou. Reabra o painel.');
            write(id, { note: '' }); area.value = ''; delete drafts[draftKey];
            status.textContent = 'Próximo passo apagado deste navegador.'; armed = false; event.currentTarget.textContent = 'Apagar próximo passo';
          } catch (_) { status.textContent = 'Não foi possível apagar a nota neste navegador. O texto foi mantido.'; }
        }));
      },
      onConfirm: function () {
        if (owner !== userId || id !== chatId) throw Error('A conta ou conversa mudou. Reabra o painel.');
        drafts[draftKey] = area.value;
        try { write(id, { note: area.value }); }
        catch (_) { throw Error('Não foi salvo: o armazenamento está indisponível. Seu texto continua aqui; copie-o ou tente novamente.'); }
        delete drafts[draftKey];
        showUIMessage('Próximo passo salvo somente neste navegador.', null, false);
      }
    });
  }
  function renderBadge() {
    if (!badge) return;
    var rehearsalActive = pendingRehearsal;
    if (userId && chatId) {
      try { rehearsalActive = read(chatId).rehearsal; }
      catch (_) { rehearsalActive = false; }
    }
    badge.hidden = !rehearsalActive;
    badge.replaceChildren();
    if (rehearsalActive) {
      var label = document.createElement('span'); label.textContent = 'Ensaio (beta)';
      var exit = document.createElement('a'); exit.href = '/dashboard'; exit.textContent = 'Sair do ensaio';
      exit.title = 'Abrir uma nova conversa normal. O histórico e seu contexto serão preservados.';
      badge.append(label, exit);
    }
  }
  function closeMenu(restoreFocus) {
    if (!menuOpen) return;
    menuOpen = false;
    menuTrigger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    if (restoreFocus !== false && menu.contains(document.activeElement)) menuTrigger.focus();
    menu.inert = true;
    document.removeEventListener('click', outsideMenu);
    window.removeEventListener('resize', closeMenu);
  }
  function outsideMenu(event) {
    if (controls && !controls.contains(event.target)) closeMenu(false);
  }
  function openMenu() {
    if (menuOpen || menuTrigger.disabled) return;
    menuOpen = true;
    menuTrigger.setAttribute('aria-expanded', 'true');
    var rect = menuTrigger.getBoundingClientRect();
    var above = rect.top - 16, below = window.innerHeight - rect.bottom - 16;
    var down = above < 280 && below > above;
    menu.style.top = down ? 'calc(100% + 0.5rem)' : 'auto';
    menu.style.bottom = down ? 'auto' : 'calc(100% + 0.5rem)';
    menu.style.maxHeight = Math.max(80, down ? below : above) + 'px';
    menu.inert = false;
    menu.classList.add('open');
    menu.querySelector('div:not([hidden]) > button:not(:disabled)').focus();
    document.addEventListener('click', outsideMenu);
    window.addEventListener('resize', closeMenu);
  }
  function menuAction(text, action) {
    var el = button(text, function () { closeMenu(); action(); }, 'personality-picker-option');
    el.setAttribute('role', 'menuitem');
    return el;
  }
  function render() {
    if (!SOCIALIZACAO_BETA_ENABLED || !input()) return;
    if (!controls) {
      controls = document.createElement('div'); controls.className = 'social-tools social-ui personality-picker';
      menuTrigger = button('Opções', function () { if (menuOpen) closeMenu(); else openMenu(); }, 'personality-picker-trigger social-menu-trigger');
      var chevron = document.createElement('span'); chevron.className = 'personality-picker-chevron';
      chevron.innerHTML = '<svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 8 10 13 15 8"></polyline></svg>';
      menuTrigger.appendChild(chevron);
      menuTrigger.setAttribute('aria-haspopup', 'menu');
      menuTrigger.setAttribute('aria-expanded', 'false');
      menuTrigger.setAttribute('aria-controls', 'social-actions-menu');
      menu = document.createElement('div'); menu.className = 'personality-picker-menu social-actions-menu';
      menu.id = 'social-actions-menu'; menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'Opções da conversa'); menu.inert = true;
      suggestions = document.createElement('div'); suggestions.className = 'social-suggestions personality-picker-group';
      suggestions.setAttribute('role', 'group');
      suggestions.setAttribute('aria-label', 'Sugestões para começar');
      [['Colega novo', 'Quero conversar com um colega novo, mas não sei como começar.'],
       ['Uma festa', 'Vou a uma festa e gostaria de pensar em como puxar assunto.'],
       ['Desabafar', 'Quero desabafar um pouco sobre meu dia.']].forEach(function (item) {
        suggestions.appendChild(menuAction(item[0], function () { fill(item[1]); }));
      });
      tools = document.createElement('div'); tools.className = 'personality-picker-group';
      tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Praticar e planejar');
      tools.append(menuAction('Ensaiar conversa (beta)', rehearsal), menuAction('Levar para a vida real (beta)', notes));
      menu.append(suggestions, tools); controls.append(menuTrigger, menu);
      input().closest('form').querySelector('button[type="submit"]').before(controls);
      controls.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && menuOpen) { event.preventDefault(); event.stopPropagation(); closeMenu(); return; }
        if (event.key === 'Tab') { closeMenu(); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) === -1) return;
        event.preventDefault();
        if (!menuOpen) { openMenu(); return; }
        var options = Array.from(menu.querySelectorAll('div:not([hidden]) > button:not(:disabled)'));
        var index = options.indexOf(document.activeElement);
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = options.length - 1;
        else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        if (options[index]) options[index].focus();
      });
      controls.addEventListener('focusout', function (event) {
        if (event.relatedTarget && !controls.contains(event.relatedTarget)) closeMenu(false);
      });
      badge = document.createElement('div'); badge.className = 'social-badge social-ui';
      document.querySelector('.topbar').appendChild(badge);
    }
    suggestions.hidden = !empty || !userId;
    controls.hidden = !userId;
    tools.classList.toggle('personality-picker-group-divided', !suggestions.hidden);
    if (generating || !userId) closeMenu();
    menuTrigger.disabled = generating;
    tools.querySelectorAll('button').forEach(function (el, index) {
      el.disabled = generating || (index === 1 && !chatId);
      if (index === 1) el.title = chatId ? 'Escrever um próximo passo' : 'Disponível depois de iniciar uma conversa';
    });
    suggestions.querySelectorAll('button').forEach(function (el) { el.disabled = generating; });
    renderBadge();
  }
  function clearMemory() {
    closeMenu(false);
    var note = document.getElementById('social-note'); if (note) note.value = '';
    userId = null; chatId = null; pendingRehearsal = false; drafts = Object.create(null);
    document.querySelectorAll('.social-ui').forEach(function (el) { el.remove(); });
    controls = suggestions = badge = menu = menuTrigger = tools = null; activeMs = 0;
  }
  function deleteLocal(id) {
    if (!userId) return false;
    try { localStorage.removeItem(key(id)); delete drafts[key(id)]; return true; }
    catch (_) { return false; }
  }
  // Cleanup/export remain available with beta disabled: hiding experiments must not orphan data.
  document.addEventListener('tt:user', function (event) {
    if (userId !== String(event.detail.id)) clearMemory();
    userId = String(event.detail.id);
    chatId = location.pathname.startsWith('/dashboard/chat/') ? location.pathname.split('/').pop() : null;
    if (SOCIALIZACAO_BETA_ENABLED && !chatId && input()) {
      try {
        var pendingKey = prefix + 'pending:' + encodeURIComponent(userId);
        var pending = sessionStorage.getItem(pendingKey);
        if (pending) { pendingRehearsal = true; input().value = pending; input().dispatchEvent(new Event('input', { bubbles: true })); sessionStorage.removeItem(pendingKey); }
      } catch (_) {}
    }
    render();
  });
  document.addEventListener('tt:chat', function (event) {
    chatId = String(event.detail.chat.id); empty = event.detail.messages.length === 0; render();
  });
  document.addEventListener('tt:created', function (event) {
    if (!SOCIALIZACAO_BETA_ENABLED || !pendingRehearsal || !userId) return;
    try { write(event.detail.id, { rehearsal: true }); pendingRehearsal = false; }
    catch (_) { showUIMessage('O ensaio foi preparado, mas seu marcador não pôde ser salvo neste navegador.'); }
  });
  document.addEventListener('tt:response', function () { empty = false; render(); });
  document.addEventListener('tt:generating', function (event) {
    generating = event.detail; render(); maybePause();
  });
  document.addEventListener('tt:deleted', function (event) { event.detail.cleanupFailed = !deleteLocal(event.detail.id); });
  document.addEventListener('tt:account-deleted', function (event) {
    if (!userId) return;
    try {
      var accountPrefix = prefix + encodeURIComponent(userId) + ':';
      Object.keys(localStorage).filter(function (name) { return name.startsWith(accountPrefix); }).forEach(function (name) { localStorage.removeItem(name); });
      sessionStorage.removeItem(prefix + 'pending:' + encodeURIComponent(userId));
    } catch (_) { event.detail.cleanupFailed = true; }
    clearMemory();
  });
  document.addEventListener('tt:logout', clearMemory);
  window.addEventListener('pagehide', clearMemory);
  window.addEventListener('pageshow', function (event) { if (event.persisted) location.reload(); });
  function maybePause() {
    if (!SOCIALIZACAO_BETA_ENABLED || !sessionAvailable || pauseShown || activeMs < 20 * 60 * 1000 || generating || !userId || !chatId || document.hidden) return;
    pauseShown = true;
    try { sessionStorage.setItem(pauseKey, '1'); } catch (_) {}
    var notice = document.createElement('div'); notice.className = 'social-pause social-ui'; notice.setAttribute('role', 'status');
    var text = document.createElement('p'); text.textContent = 'Já faz um tempo por aqui. Se quiser, faça uma pausa e volte depois.';
    notice.append(text, button('Agora não', function () { notice.remove(); }));
    input().closest('form').before(notice);
  }
  if (SOCIALIZACAO_BETA_ENABLED) {
    ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'].forEach(function (name) {
      document.addEventListener(name, function () { lastInteraction = Date.now(); }, { passive: true });
    });
    function tick() {
      var now = Date.now();
      if (userId && chatId && !document.hidden) activeMs += Math.max(0, Math.min(now, lastInteraction + 60000) - lastTick);
      lastTick = now; maybePause();
    }
    document.addEventListener('visibilitychange', function () { lastTick = Date.now(); });
    setInterval(tick, 5000);
    document.addEventListener('DOMContentLoaded', render);
  }
  return {
    exportLocal: function (id) {
      if (!userId || String(id) !== userId) return null;
      var result = { origem: 'Dados somente deste navegador, sem sincronização', conversas: {} };
      try {
        var accountPrefix = prefix + encodeURIComponent(userId) + ':';
        Object.keys(localStorage).filter(function (name) { return name.startsWith(accountPrefix); }).forEach(function (name) {
          var id = decodeURIComponent(name.slice(accountPrefix.length)); result.conversas[id] = read(id);
        });
      } catch (_) { result.aviso = 'Armazenamento indisponível; dados locais não puderam ser exportados.'; }
      return result;
    }
  };
})();
