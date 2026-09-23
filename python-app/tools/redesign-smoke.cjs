/* UI regression checks with an isolated HTTP server and mocked APIs.
   Run with Playwright available on NODE_PATH. No production accounts or AI calls. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../frontend');
const output = process.env.SMOKE_OUTPUT || path.resolve(__dirname, '../artifacts/conversa-de-bolso');
const pages = {
  '/': 'index.html', '/login': 'login.html', '/signup': 'signup.html',
  '/forgot-password': 'forgot-password.html', '/reset-password': 'reset-password.html',
  '/privacy': 'privacy.html', '/terms': 'terms.html', '/dashboard': 'dashboard.html',
  '/dashboard/account': 'account.html', '/dashboard/settings': 'settings.html',
  '/dashboard/chat/preview': 'chat.html',
};
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
for (const file of fs.readdirSync(path.join(root, 'js'))) {
  if (file.endsWith('.js')) new vm.Script(fs.readFileSync(path.join(root, 'js', file), 'utf8'), { filename: file });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, pages[url.pathname] || '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [], requests = [];
    let title = 'Uma conversa para começar', delay = 0;
    const mock = { failCancel: false, failSend: false, handoff: false, failDelete: false, createDelay: 0 };
    let messages = [
      { role: 'user', content: 'Hoje eu queria conversar um pouco.' },
      { role: 'assistant', content: 'Bora! Me conta: como foi seu dia? Pode começar de onde quiser.' },
    ];
    const user = { id: 'preview', name: 'Alex', display_name: 'Alex', email: 'alex@example.test', image: 'avatar:avatar_cat', interests: ['Música', 'Games'], pronoun: '', created_at: '2026-09-01T12:00:00Z' };
    const chat = () => ({ id: 'preview', title, personality: 'trashtalker', effort: 'trash' });
    const data = () => ({ user, chats: [chat()], personalities: [
      { id: 'trashtalker', name: 'TrashTalker', subtitle: 'Conversa descontraída' },
      { id: 'mathias', name: 'MathIAs', subtitle: 'Outra personalidade' },
    ], efforts: [{ id: 'trash', name: 'Trash', subtitle: 'Mais rápido' }, { id: 'talker', name: 'Talker', subtitle: 'Respostas melhores' }] });
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push('Unexpected dialog: ' + dialog.message()); await dialog.dismiss(); });
    await context.route('**/api/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const body = request.postDataJSON();
      requests.push({ pathname, method: request.method(), body });
      let result = { ok: true }, status = 200;
      if (pathname === '/api/me') { result = { error: 'Guest fixture' }; status = 401; }
      else if (pathname === '/api/dashboard') result = data();
      else if (pathname === '/api/chats' && request.method() === 'POST') {
        if (mock.createDelay) await new Promise(resolve => setTimeout(resolve, mock.createDelay));
        result = { id: 'preview' };
      }
      else if (pathname.endsWith('/messages')) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        result = { chat: chat(), assistantMessage: { content: 'Resposta de teste recebida.' } };
        if (mock.handoff) result.handoffMessage = { content: 'Vou passar esta conversa adiante.' };
        if (mock.failSend) { status = 503; result = { error: 'Rede indisponível (teste)' }; }
      }
      else if (pathname.endsWith('/cancel') && mock.failCancel) { status = 500; result = { error: 'Cancelamento indisponível (teste)' }; }
      else if (pathname.endsWith('/delete') && mock.failDelete) { status = 500; result = { error: 'Exclusão indisponível (teste)' }; }
      else if (pathname.endsWith('/title')) title = body.title;
      else if (pathname === '/api/chats/preview') result = { chat: chat(), messages };
      else if (pathname === '/api/account') Object.assign(user, { display_name: body.displayName, name: body.name, interests: body.interests, image: body.image });
      else if (pathname === '/api/account/export') result = { profile: { email: user.email, name: user.name }, chats: [chat()] };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) }).catch(() => {});
    });
    await page.goto(base);
    fs.mkdirSync(output, { recursive: true });

    // Compare original text, IDs, placeholders and links if a baseline was supplied.
    {
      for (const file of Object.values(pages)) {
        const before = process.env.REDESIGN_BASELINE
          ? fs.readFileSync(path.join(process.env.REDESIGN_BASELINE, file), 'utf8')
          : execFileSync('git', ['show', 'main:python-app/frontend/' + file], { encoding: 'utf8' });
        const after = fs.readFileSync(path.join(root, file), 'utf8');
        const diff = await page.evaluate(({ before, after }) => {
          function parse(source) {
            const doc = new DOMParser().parseFromString(source, 'text/html');
            doc.querySelectorAll('script, style, .skip-link, .tt-preloader').forEach(el => el.remove());
            return { text: doc.body.textContent.replace(/\s+/g, ' ').trim(),
              ids: Array.from(doc.querySelectorAll('[id]'), el => el.id),
              links: Array.from(doc.querySelectorAll('a[href]'), el => el.getAttribute('href')),
              placeholders: Array.from(doc.querySelectorAll('[placeholder]'), el => el.getAttribute('placeholder')) };
          }
          return { before: parse(before), after: parse(after) };
        }, { before, after });
        if (['privacy.html', 'terms.html'].includes(file)) assert.equal(diff.after.text, diff.before.text, file + ': legal text changed');
        if (file === 'index.html') assert(after.includes('jogue<br/><span class="lp-gradient-text">o silêncio fora.</span>'), 'Original slogan retained');
        assert.deepEqual(diff.after.placeholders, diff.before.placeholders, file + ': placeholders changed');
        for (const id of diff.before.ids) assert(diff.after.ids.includes(id), file + ': missing ID ' + id);
        for (const link of diff.before.links) assert(diff.after.links.includes(link), file + ': missing link ' + link);
      }
    }

    let viewChecks = 0, passwordChecks = 0;
    const contrastResults = {};
    for (const theme of process.env.SKIP_VIEWS ? [] : ['light', 'dark']) {
      await page.evaluate(theme => localStorage.setItem('theme', theme), theme);
      for (const width of [320, 360, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 });
        for (const [url, file] of Object.entries(pages)) {
          await page.goto(base + url + (url === '/reset-password' ? '?token=fixture' : ''));
          await page.waitForLoadState('networkidle');
          assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()),
            theme === 'light' ? '#f7d834' : '#eb6a40', 'Light theme must use logo yellow; dark theme must retain orange');
          if (file === 'index.html' && width === 320) {
            const contrasts = await page.evaluate(() => {
              const style = getComputedStyle(document.documentElement);
              const luminance = token => {
                const hex = style.getPropertyValue(token).trim().slice(1);
                const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
                  .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
                return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
              };
              return [
                ['text', '--foreground', '--background', 4.5],
                ['surface text', '--foreground', '--card', 4.5],
                ['focus', '--ring', '--card', 3],
                ['secondary text', '--muted-foreground', '--card', 4.5],
                ['action', '--primary-foreground', '--primary', 4.5],
                ['destructive action', '--destructive-foreground', '--destructive', 4.5],
                ['error text', '--danger-text', '--background', 4.5],
                ['input boundary', '--input', '--card', 3],
              ].map(([name, a, b, minimum]) => {
                const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
                return { name, ratio: (values[0] + 0.05) / (values[1] + 0.05), minimum };
              });
            });
            for (const item of contrasts) assert(item.ratio >= item.minimum, `${theme} ${item.name}: insufficient contrast ${item.ratio}`);
            contrastResults[theme] = contrasts;
          }
          const state = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            mains: document.querySelectorAll('main').length,
            missingCss: !getComputedStyle(document.documentElement).getPropertyValue('--brand-ink').trim(),
            brokenImages: Array.from(document.images).some(img => !img.complete || img.naturalWidth === 0),
            formOverflow: Array.from(document.querySelectorAll('main input, main textarea, main form, main .card')).some(el => {
              const r = el.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1);
            }),
          }));
          assert.deepEqual(state, { overflow: false, mains: 1, missingCss: false, brokenImages: false, formOverflow: false }, `${file} ${width} ${theme}`);
          assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'), '/logo-talker.svg', 'Original logo must be the favicon');
          if (['login.html', 'signup.html'].includes(file)) {
            assert.equal(await page.locator('.auth-aside').isVisible(), width >= 1024, 'Small composition only on desktop');
            assert.equal(await page.locator('.auth-card').evaluate(el => Math.round(el.getBoundingClientRect().width)) <= 440, true);
          }
          if (file === 'chat.html') {
            const assistantBox = await page.locator('.msg-assistant .msg-content').first().evaluate(el => {
              const style = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return { filled: style.backgroundColor !== 'rgba(0, 0, 0, 0)',
                padded: parseFloat(style.paddingLeft) >= 12 && parseFloat(style.paddingTop) >= 12,
                bordered: parseFloat(style.borderTopWidth) >= 1,
                fits: el.scrollWidth <= el.clientWidth && r.left >= 0 && r.right <= innerWidth };
            });
            assert.deepEqual(assistantBox, { filled: true, padded: true, bordered: true, fits: true }, `Assistant message box ${width} ${theme}`);
          }
          { // Capture every page in both themes at all verification widths.
            await page.screenshot({ path: path.join(output, `${file.replace('.html', '')}-${theme}-${width}.png`), fullPage: true });
          }
          if (['signup.html', 'reset-password.html', 'settings.html'].includes(file)) {
            const password = page.locator(file === 'settings.html' ? '#new-password' : '#password');
            const confirm = page.locator(file === 'settings.html' ? '#confirm-new-password' : '#confirm-password');
            const rules = page.locator('.password-requirements');
            assert(!(await rules.isVisible()), `${file}: rules must start hidden`);
            await password.click();
            assert(await rules.isVisible(), `${file}: click must reveal rules`);
            assert((await password.getAttribute('aria-describedby')).includes(await rules.getAttribute('id')));
            await password.fill('A');
            assert.equal(await rules.locator('li.met').count(), 1);
            await password.fill('Teste123!');
            assert.equal(await rules.locator('li.met').count(), 5);
            assert(await rules.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), `${file}: rules overflow`);
            if (file === 'signup.html') await page.screenshot({ path: path.join(output, `signup-focused-${theme}-${width}.png`), fullPage: true });
            await confirm.focus();
            assert(!(await rules.isVisible()), `${file}: blur must hide rules`);
            await page.keyboard.press('Shift+Tab');
            assert(await password.evaluate(el => el === document.activeElement));
            assert(await rules.isVisible(), `${file}: keyboard focus must reveal rules`);
            passwordChecks++;
          }
          viewChecks++;
        }
      }
    }

    // The compact composition responds to saved and live themes.
    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.goto(base + '/login');
      await page.evaluate(theme => setTheme(theme), theme);
      assert(await page.locator('.auth-illustration').evaluate(el => el.complete && el.naturalWidth > 0));
      assert.equal(await page.locator('.auth-illustration').getAttribute('src'), '/images/auth-login-icon.svg');
      await page.goto(base + '/signup');
      assert.equal(await page.locator('.auth-illustration').getAttribute('src'), '/images/auth-signup-icon.svg');
      assert.equal(await page.evaluate(() => localStorage.getItem('theme')), theme);
    }
    // Tablet/mobile drawer: focus containment, Escape, and breakpoint transitions.
    for (const width of [320, 900]) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(base + '/dashboard');
      await page.locator('#personality-picker .personality-picker-trigger').waitFor();
      assert(await page.locator('.sidebar').evaluate(el => el.inert));
      await page.locator('.topbar .sidebar-toggle').click();
      assert(await page.locator('.app-main').evaluate(el => el.inert));
      await page.locator('.logout-btn').focus();
      await page.keyboard.press('Tab');
      assert(await page.locator('.sidebar .brand').evaluate(el => el === document.activeElement));
      await page.keyboard.press('Escape');
      assert(await page.locator('.topbar .sidebar-toggle').evaluate(el => el === document.activeElement));
      assert(!(await page.locator('.app-main').evaluate(el => el.inert)));
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '/dashboard/chat/preview');
    await page.locator('.chat-link-text').waitFor();
    const alignment = await page.evaluate(() => {
      const center = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return r.x + r.width / 2; };
      const navCenters = ['.sidebar-new-chat .icon', '.chat-link-icon', '.sidebar-secondary .icon'].map(center);
      return { navSpread: Math.max(...navCenters) - Math.min(...navCenters),
        chatOffset: Math.abs(center('.msg-bubble') - center('.composer')) };
    });
    assert(alignment.navSpread < 1, 'Sidebar icons must share a vertical axis');
    assert(alignment.chatOffset < 1, 'Message column and composer must share a center');
    await page.locator('.sidebar-header .sidebar-toggle').click();
    assert(await page.locator('html').evaluate(el => el.classList.contains('sidebar-collapsed')));
    await page.reload();
    assert(await page.locator('html').evaluate(el => el.classList.contains('sidebar-collapsed')));
    await page.locator('.topbar .sidebar-toggle').click();

    // Keyboard selection remains grouped; closed options cannot receive focus.
    const picker = page.locator('#personality-picker .personality-picker-trigger');
    assert(await page.locator('#personality-picker-menu').evaluate(el => el.inert));
    await picker.focus(); await page.keyboard.press('ArrowDown');
    await page.locator('.personality-picker-menu.open').waitFor();
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.personality-picker-trigger').textContent.includes('Mais elaborada'));
    assert(requests.some(r => r.pathname.endsWith('/effort') && r.body.effort === 'talker'));
    assert(await picker.evaluate(el => el === document.activeElement));

    // Text sending, shift-enter, autosize, and cancel keep their API contracts.
    await page.locator('#chat-input').fill('Linha um');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Linha dois');
    assert((await page.locator('#chat-input').inputValue()).includes('\n'));
    await page.locator('#chat-submit').click();
    await page.getByText('Resposta de teste recebida.', { exact: true }).waitFor();
    assert(await page.locator('.chat-link-icon').count());
    assert(await page.locator('.voice-speak-button').count());
    delay = 500;
    await page.locator('#chat-input').fill('Cancelar este envio');
    await page.locator('#chat-submit').click();
    await page.locator('#chat-submit.is-stop').click();
    assert.equal(await page.locator('#chat-input').inputValue(), 'Cancelar este envio');
    await page.waitForFunction(() => !document.querySelector('#chat-input').disabled);
    await page.waitForTimeout(550);
    assert(requests.some(r => r.pathname.endsWith('/cancel')));
    delay = 0;

    // Rename dialog: text prefill, focus trap, Escape, and submission.
    await page.locator('.chat-actions button').first().click();
    await page.locator('.modal-input').waitFor();
    assert.equal(await page.locator('.modal-input').inputValue(), title);
    await page.locator('.modal-input').focus(); await page.keyboard.press('Shift+Tab');
    assert(await page.locator('.modal .btn-primary').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
    await page.locator('.modal-overlay').waitFor({ state: 'detached' });
    assert(await page.locator('.chat-actions button').first().evaluate(el => el === document.activeElement));
    await page.locator('.chat-actions button').first().click();
    await page.locator('.modal-input').fill('Conversa renomeada');
    await page.locator('.modal .btn-primary').click();
    await page.getByText('Conversa renomeada', { exact: true }).waitFor();
    await page.locator('.chat-actions button').last().click();
    await page.locator('.modal .btn-outline').click();
    await page.locator('.modal-overlay').waitFor({ state: 'detached' });
    assert(!requests.some(r => r.pathname.endsWith('/delete')));

    await page.goto(base + '/dashboard/account');
    await page.locator('#name').waitFor();
    await page.locator('#displayName').fill('Alex UI');
    await page.locator('[data-avatar-id="avatar_robot"]').click();
    assert.equal(await page.locator('[data-avatar-id="avatar_robot"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#tag-input').fill('Design');
    await page.locator('#tag-add-btn').click();
    await page.locator('#account-form button[type="submit"]').click();
    await page.locator('#account-success').waitFor({ state: 'visible' });
    assert(requests.some(r => r.pathname === '/api/account' && r.body.interests.includes('Design')));

    await page.goto(base + '/dashboard/settings');
    await page.locator('[data-theme-btn="light"]').click();
    await page.reload();
    assert.equal(await page.locator('[data-theme-btn="light"]').getAttribute('aria-pressed'), 'true');
    const download = page.waitForEvent('download');
    await page.locator('#export-data-btn').click();
    assert.equal((await download).suggestedFilename(), 'trash-talker-dados.json');
    await page.locator('#delete-account-btn').click();
    await page.locator('.modal-input').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.modal-overlay').waitFor({ state: 'detached' });
    assert(!requests.some(r => r.pathname === '/api/account/delete'));

    // Hiding the helper must not weaken password validation or submission.
    await page.goto(base + '/reset-password?token=fixture');
    await page.locator('#password').fill('aaaaaaaa');
    await page.locator('#confirm-password').fill('aaaaaaaa');
    const resetCount = () => requests.filter(r => r.pathname === '/api/reset-password').length;
    const beforeReset = resetCount();
    await page.locator('#reset-password-form button[type="submit"]').click();
    await page.locator('#reset-error').waitFor({ state: 'visible' });
    assert.equal(resetCount(), beforeReset, 'Weak password must not be submitted');
    await page.locator('#password').fill('Teste123!');
    await page.locator('#confirm-password').fill('Teste123!');
    await page.locator('#reset-password-form button[type="submit"]').click();
    await page.waitForURL('**/login?reset=success');
    assert.equal(resetCount(), beforeReset + 1);

    // First message starts a chat directly from the dashboard.
    await page.goto(base + '/dashboard');
    await page.locator('#welcome-input').fill('Primeira conversa');
    await page.locator('#welcome-submit').click();
    await page.waitForURL('**/dashboard/chat/preview');
    assert(requests.some(r => r.pathname.endsWith('/messages') && r.body.content === 'Primeira conversa'));
    const betaChecks = await require('./socializacao-smoke.cjs')({ page, context, base, requests, mock, user, output,
      setDelay: value => { delay = value; }, setMessages: value => { messages = value; } });
    assert.deepEqual(errors, [], 'Browser errors');
    const result = { passed: true, viewChecks, passwordChecks, contrastResults, legalAndSloganPreserved: true, betaChecks, mockedAPIs: true, output };
    if (!process.env.SKIP_VIEWS) fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
