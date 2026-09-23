const assert = require('node:assert/strict');
module.exports = async function ({ page, context, base, requests, mock, user, output, setDelay, setMessages }) {
  let checks = 0;
  const capture = name => page.screenshot({ path: require('node:path').join(output, name + '.png'), fullPage: true });
  const localKey = 'tt-social:v1:preview:preview';
  const go = async route => { await page.goto(base + route); await page.waitForLoadState('networkidle'); };
  const close = async () => { await page.keyboard.press('Escape'); await page.locator('.modal-overlay').waitFor({ state: 'detached' }); };
  const confirm = async () => { await page.locator('.modal-actions .btn-primary').click(); await page.locator('.modal-overlay').waitFor({ state: 'detached' }); };
  const chooseAction = async name => {
    await page.getByRole('button', { name: 'Opções', exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  const sends = () => requests.filter(r => r.pathname.endsWith('/messages')).length;
  // The composer menu must fit both themes and narrow screens, with keyboard access.
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 360, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ['/dashboard', '/dashboard/chat/preview']) {
        await go(route);
        await page.evaluate(theme => setTheme(theme), theme);
        const trigger = page.getByRole('button', { name: 'Opções', exact: true });
        const menu = page.getByRole('menu', { name: 'Opções da conversa' });
        assert(await page.locator('#social-actions-menu').evaluate(el => el.inert));
        assert.equal(await page.locator('.composer-actions').evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
        await trigger.focus(); await page.keyboard.press('ArrowDown');
        await menu.waitFor();
        assert.equal(await menu.getByRole('menuitem').count(), route === '/dashboard' ? 5 : 2);
        assert.equal(await menu.getByRole('menuitem', { name: 'Levar para a vida real (beta)', exact: true }).isDisabled(), route === '/dashboard');
        assert(await menu.evaluate(el => {
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
        }), `Menu fits ${theme} ${width} ${route}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
        if (route === '/dashboard' && [360, 1280].includes(width)) await capture(`menu-${theme}-${width}`);
        await page.keyboard.press('End');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), route === '/dashboard' ? 'Ensaiar conversa (beta)' : 'Levar para a vida real (beta)');
        await page.keyboard.press('Escape');
        assert(await trigger.evaluate(el => el === document.activeElement));
        assert(await page.locator('#social-actions-menu').evaluate(el => el.inert));
        await trigger.click();
        await page.locator('.topbar-title').click();
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
        await page.locator('#personality-picker .personality-picker-trigger').click();
        await page.locator('#personality-picker-menu.open').waitFor();
        await page.keyboard.press('Escape');
        if (route === '/dashboard' && [360, 1280].includes(width)) await capture(`composer-${theme}-${width}`);
        await trigger.click();
        await page.evaluate(() => emitTT('generating', true));
        assert(await trigger.isDisabled());
        assert(await page.locator('#social-actions-menu').evaluate(el => el.inert));
        await page.evaluate(() => emitTT('generating', false));
        checks++;
      }
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await go('/dashboard');
  await page.evaluate(() => setTheme('light'));
  const before = sends();
  assert(await page.locator('.social-tools').evaluate(el => {
    const composer = document.getElementById('welcome-form').getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return rect.top >= composer.top && rect.bottom <= composer.bottom;
  }), 'Actions are inside the composer');
  await chooseAction('Colega novo');
  assert((await page.locator('#welcome-input').inputValue()).includes('colega novo'));
  assert.equal(sends(), before); checks++;
  await chooseAction('Uma festa');
  await close();
  assert((await page.locator('#welcome-input').inputValue()).includes('colega novo'));
  await chooseAction('Uma festa');
  await confirm();
  assert((await page.locator('#welcome-input').inputValue()).includes('festa'));
  assert(await page.locator('#welcome-input').evaluate(el => el === document.activeElement)); checks++;

  await page.locator('#welcome-input').fill('');
  await chooseAction('Ensaiar conversa (beta)');
  assert.equal(await page.locator('#rehearsal-kind option').count(), 6);
  await page.locator('#rehearsal-kind').selectOption('5');
  await page.locator('#rehearsal-scenario').fill('pedir uma informação');
  await page.locator('#rehearsal-role').fill('um colega');
  await capture('ensaio-light-360');
  await confirm();
  assert.equal(sends(), before);
  assert((await page.locator('#welcome-input').inputValue()).includes('Faça o papel de um colega'));
  assert(await page.getByText('Ensaio (beta)', { exact: true }).isVisible());
  await page.locator('#welcome-submit').click(); await page.waitForURL('**/dashboard/chat/preview'); await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).rehearsal, localKey), true);
  assert(await page.getByText('Ensaio (beta)', { exact: true }).isVisible()); checks++;
  await page.getByRole('link', { name: 'Sair do ensaio' }).click(); await page.waitForURL('**/dashboard');
  assert(!(await page.getByText('Ensaio (beta)', { exact: true }).isVisible()));
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).rehearsal, localKey), true); checks++;

  await go('/dashboard/chat/preview');
  assert.deepEqual(await page.locator('.msg-author').allTextContents(), ['IA']);
  const noteSends = sends();
  await chooseAction('Levar para a vida real (beta)');
  await page.locator('#social-note').fill('Primeira versão da nota'); await confirm();
  await chooseAction('Levar para a vida real (beta)');
  await page.locator('#social-note').fill('Versão editada'); await confirm();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).note, localKey), 'Versão editada');
  await chooseAction('Levar para a vida real (beta)');
  await page.getByRole('button', { name: 'Apagar próximo passo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar exclusão do próximo passo', exact: true }).click();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).note, localKey), '');
  await close(); checks++;
  await chooseAction('Levar para a vida real (beta)');
  await page.locator('#social-note').fill('Dar oi para um colega amanhã.');
  await capture('proximo-passo-light-360');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).note, localKey), '');
  await confirm();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).note, localKey), 'Dar oi para um colega amanhã.');
  assert.equal(sends(), noteSends); checks++;
  await chooseAction('Levar para a vida real (beta)');
  await page.locator('#social-note').fill('Meu rascunho ainda não salvo');
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Denied', 'QuotaExceededError'); }; });
  await page.locator('.modal-actions .btn-primary').click();
  await page.getByText(/Não foi salvo:/).waitFor();
  assert.equal(await page.locator('#social-note').inputValue(), 'Meu rascunho ainda não salvo');
  await close(); await go('/dashboard/chat/preview'); checks++;

  user.id = 'outra-conta';
  await go('/dashboard/chat/preview');
  await chooseAction('Levar para a vida real (beta)');
  assert.equal(await page.locator('#social-note').inputValue(), '');
  await close(); user.id = 'preview'; await go('/dashboard/chat/preview'); checks++;

  mock.handoff = true;
  await page.locator('#chat-input').fill('Uma mensagem longa de teste');
  await page.locator('#chat-submit').click();
  await page.getByText('O TrashTalker assumiu para continuar esta conversa mais longa.', { exact: true }).waitFor();
  assert.equal(await page.locator('.msg-mathias .msg-author').textContent(), 'MathIAs');
  assert.equal(await page.locator('.msg-trashtalker .msg-author').textContent(), 'TrashTalker');
  assert.equal(await page.locator('.msg-mathias img').getAttribute('src'), '/mathias-mark.svg');
  await capture('passagem-light-360');
  mock.handoff = false; checks++;

  mock.failCancel = true; setDelay(600);
  await page.locator('#chat-input').fill('Rascunho para cancelamento');
  await page.locator('#chat-submit').click();
  assert((await page.locator('#chat-submit').textContent()).includes('Parar e desfazer envio'));
  await page.locator('#chat-submit').click();
  await page.getByText(/Não foi possível confirmar a exclusão do envio/).waitFor();
  assert(await page.locator('#chat-submit').isDisabled());
  assert.equal(await page.locator('#chat-input').inputValue(), 'Rascunho para cancelamento');
  assert(await page.getByText('Rascunho para cancelamento', { exact: true }).count());
  mock.failCancel = false; setDelay(0); await go('/dashboard/chat/preview'); checks++;
  mock.failSend = true;
  await page.locator('#chat-input').fill('Teste de falha de rede'); await page.locator('#chat-submit').click();
  await page.getByText(/A resposta falhou/).waitFor(); assert(await page.locator('#chat-submit').isDisabled());
  mock.failSend = false; checks++;

  await go('/dashboard/settings');
  await page.waitForFunction(() => TTState.user !== null);
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-data-btn').click();
  const download = await downloadPromise;
  const fs = require('node:fs');
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.equal(exported.socializacaoLocal.conversas.preview.note, 'Dar oi para um colega amanhã.'); checks++;

  // Rehearsal from existing chat opens a new composer, not the old AI context.
  await go('/dashboard/chat/preview');
  await chooseAction('Ensaiar conversa (beta)'); await confirm();
  await page.waitForURL('**/dashboard'); await page.waitForLoadState('networkidle');
  assert((await page.locator('#welcome-input').inputValue()).startsWith('Quero ensaiar:')); checks++;

  // Removal is gated by server confirmation.
  await page.setViewportSize({ width: 1280, height: 900 }); await go('/dashboard/chat/preview');
  mock.failDelete = true;
  await page.locator('.chat-actions button').last().click(); await page.locator('.modal .btn-destructive').click();
  await page.locator('.modal-error').waitFor({ state: 'visible' });
  assert(await page.evaluate(key => !!localStorage.getItem(key), localKey)); await close();
  mock.failDelete = false;
  await page.locator('.chat-actions button').last().click(); await page.locator('.modal .btn-destructive').click();
  await page.waitForURL('**/dashboard'); assert.equal(await page.evaluate(key => localStorage.getItem(key), localKey), null); checks++;

  // Offline storage must not crash auth/theme or prevent writing a note.
  await context.addInitScript(() => {
    if (location.search.includes('storage-denied')) {
      Storage.prototype.getItem = Storage.prototype.setItem = function () { throw new DOMException('Denied', 'SecurityError'); };
    }
  });
  await go('/dashboard/chat/preview?storage-denied');
  await chooseAction('Levar para a vida real (beta)');
  await page.locator('#social-note').fill('Texto preservado'); await page.locator('.modal-actions .btn-primary').click();
  await page.getByText(/Não foi salvo:/).waitFor(); assert.equal(await page.locator('#social-note').inputValue(), 'Texto preservado');
  await close(); checks++;

  // Unsupported voice and speech errors never invoke a native alert.
  await context.addInitScript(() => {
    if (location.search.includes('voice-unsupported')) {
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    }
    if (location.search.includes('voice-mock')) {
      window.SpeechRecognition = class {
        constructor() { window.testRecognition = this; }
        start() {}
        stop() { if (this.onend) this.onend(); }
        abort() { if (this.onend) this.onend(); }
      };
    }
  });
  await go('/dashboard/chat/preview?voice-unsupported');
  assert.equal(await page.locator('.voice-mic-button').count(), 0);
  assert((await page.locator('#voice-beta-label').textContent()).includes('indisponível')); checks++;
  await go('/dashboard/chat/preview?voice-mock');
  const beforeVoice = sends();
  await page.locator('.voice-mic-button').click();
  await page.evaluate(() => {
    const result = [{ transcript: 'Mensagem ditada para revisar' }]; result.isFinal = true;
    testRecognition.onresult({ resultIndex: 0, results: [result] });
    testRecognition.onerror({ error: 'network' });
  });
  assert.equal(await page.locator('#chat-input').inputValue(), 'Mensagem ditada para revisar');
  assert.equal(sends(), beforeVoice);
  await page.getByText(/O reconhecimento de voz precisa de internet/).waitFor(); checks++;

  // Logout clears memory, not another account's persistent notes.
  await go('/dashboard/chat/preview');
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ note: 'Nota privada' })), localKey);
  await page.locator('.logout-btn').click(); await page.waitForURL('**/login');
  assert.equal(await page.locator('.social-ui').count(), 0);
  assert(await page.evaluate(key => !!localStorage.getItem(key), localKey)); checks++;

  // A real fake browser clock exercises the production idle/visibility accounting.
  await go('/dashboard/chat/preview');
  await page.evaluate(() => sessionStorage.removeItem('tt-social:pause-shown'));
  await page.clock.install(); await page.reload(); await page.waitForLoadState('networkidle');
  await page.clock.fastForward(25 * 60 * 1000);
  assert.equal(await page.locator('.social-pause').count(), 0, 'Idle time is not active time');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(30 * 60 * 1000);
  assert.equal(await page.locator('.social-pause').count(), 0, 'Hidden time is not active time');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    emitTT('generating', true);
  });
  for (let minute = 0; minute < 21; minute++) {
    await page.locator('#chat-input').dispatchEvent('input');
    await page.clock.runFor(60000);
  }
  assert.equal(await page.locator('.social-pause').count(), 0, 'No pause during generation');
  await page.evaluate(() => emitTT('generating', false));
  assert.equal(await page.locator('.social-pause').count(), 1);
  await page.getByRole('button', { name: 'Agora não' }).click();
  await page.clock.runFor(60000); assert.equal(await page.locator('.social-pause').count(), 0);
  await page.clock.resume(); checks++;

  // OS preference is live until an explicit choice is stored.
  await go('/login'); await page.evaluate(() => localStorage.removeItem('theme'));
  await page.emulateMedia({ colorScheme: 'dark' }); await page.reload();
  assert(await page.locator('html').evaluate(el => el.classList.contains('dark')));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  assert(!(await page.locator('html').evaluate(el => el.classList.contains('dark'))));
  await page.evaluate(() => setTheme('dark')); await page.emulateMedia({ colorScheme: 'light' });
  assert(await page.locator('html').evaluate(el => el.classList.contains('dark'))); checks++;

  // Flag disabled removes every experiment, not the existing chat controls.
  await context.route('**/js/socializacao.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const SOCIALIZACAO_BETA_ENABLED = true;', 'const SOCIALIZACAO_BETA_ENABLED = false;') });
  });
  await go('/dashboard'); assert.equal(await page.locator('.social-ui').count(), 0);
  await page.locator('#welcome-input').fill('Beta desligado'); await page.locator('#welcome-submit').click();
  await page.waitForURL('**/dashboard/chat/preview'); checks++;
  await context.unroute('**/js/socializacao.js');

  // Cancellation before creation resolves must wait for the server and avoid sending.
  await go('/dashboard'); mock.createDelay = 400;
  const countBeforeCancel = sends();
  await page.locator('#welcome-input').fill('Cancelar antes de criar'); await page.locator('#welcome-submit').click();
  await page.locator('#welcome-submit.is-stop').click();
  await page.getByText('Envio desfeito. Seu rascunho foi restaurado.', { exact: true }).waitFor();
  assert.equal(sends(), countBeforeCancel); assert.equal(await page.locator('#welcome-input').inputValue(), 'Cancelar antes de criar');
  mock.createDelay = 0; checks++;

  // Existing auth/settings flows are still frontend API submissions (not real accounts).
  await go('/signup'); await page.locator('#name').fill('Conta de teste'); await page.locator('#email').fill('teste@example.test');
  await page.locator('#password').fill('Teste123!'); await page.locator('#confirm-password').fill('Teste123!');
  await page.locator('.auth-form button[type=submit]').click(); await page.waitForURL('**/login');
  assert(requests.some(r => r.pathname === '/api/signup' && r.body.name === 'Conta de teste')); checks++;
  await page.locator('#email').fill('teste@example.test'); await page.locator('#password').fill('Teste123!');
  await page.locator('.auth-form button[type=submit]').click(); await page.waitForURL('**/dashboard'); checks++;
  await go('/forgot-password'); await page.locator('#email').fill('teste@example.test');
  await page.locator('button[type=submit]').click(); await page.locator('#forgot-success').waitFor({ state: 'visible' }); checks++;
  await go('/dashboard/settings');
  await page.locator('#current-password').fill('Teste123!'); await page.locator('#new-password').fill('NovaSenha123!');
  await page.locator('#confirm-new-password').fill('NovaSenha123!'); await page.locator('#password-form button[type=submit]').click();
  await page.locator('#password-success').waitFor({ state: 'visible' });
  assert(requests.some(r => r.pathname === '/api/account/password' && r.body.newPassword === 'NovaSenha123!')); checks++;

  // Long content and 200% layout zoom, plus historical author neutrality.
  setMessages([{ role: 'assistant', content: 'PalavraMuitoLonga'.repeat(100) }]);
  await page.setViewportSize({ width: 640, height: 900 }); await go('/dashboard/chat/preview');
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  assert(await page.locator('.msg-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  setMessages([{ role: 'assistant', content: 'Mensagem histórica' }]); checks++;
  await go('/dashboard/chat/preview');
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ rehearsal: true, note: 'Apagar com conta' })), localKey);
  await go('/dashboard/settings');
  await page.locator('#delete-account-btn').click(); await page.locator('.modal-input').fill('Teste123!');
  await page.locator('.modal .btn-destructive').click(); await page.waitForURL(base + '/');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), localKey), null); checks++;
  return checks;
};
