const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const route = pathname === '/' ? '/index.html' : ['/login', '/signup'].includes(pathname) ? pathname + '.html' : pathname;
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const base = 'http://127.0.0.1:' + server.address().port;
    let checks = 0;
    for (const theme of ['light', 'dark']) {
      for (const width of [320, 360, 390, 412, 480, 639, 640, 768, 1024, 1440]) {
        for (const signedIn of [false, true]) {
          const context = await browser.newContext({ viewport: { width, height: 892 }, colorScheme: theme });
          const page = await context.newPage();
          await page.route('**/api/me', route => route.fulfill({ status: signedIn ? 200 : 401, contentType: 'application/json', body: signedIn ? '{"id":"preview"}' : '{"error":"preview"}' }));
          await page.goto(base);
          await page.locator(signedIn ? '[data-nav-user]' : '[data-nav-guest]').first().waitFor({ state: 'visible' });
          const data = await page.evaluate(() => {
            const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, cy: r.y + r.height / 2, height: r.height, scroll: el.scrollWidth, width: el.clientWidth }; };
            const brand = rect(document.querySelector('.lp-nav .brand'));
            const buttons = [...document.querySelectorAll('.lp-nav-actions a')].filter(el => !el.hidden).map(rect);
            return { width: innerWidth, scroll: document.documentElement.scrollWidth, brand, buttons, art: getComputedStyle(document.querySelector('.hero-art')).display };
          });
          assert.equal(data.width, width);
          assert.ok(data.scroll <= width, JSON.stringify({ theme, width, signedIn, data }));
          if (width <= 639) {
            assert.equal(data.art, 'none');
            for (const b of data.buttons) {
              assert.ok(Math.abs(b.cy - data.brand.cy) < 1, 'Header not aligned: ' + width);
              assert.ok(b.x >= data.brand.right && b.right <= width, 'Header overlap: ' + width);
              assert.ok(b.height >= 44 && b.scroll <= b.width + 1, 'Button clipped: ' + width);
            }
          } else assert.notEqual(data.art, 'none');
          if ([320, 412, 1440].includes(width)) await page.screenshot({ path: path.join(__dirname, `mobile-${width}-${theme}-${signedIn ? 'signed-in' : 'guest'}.png`), fullPage: true });
          checks++;
          await context.close();
        }
        const context = await browser.newContext({ viewport: { width, height: 892 }, colorScheme: theme });
        const page = await context.newPage();
        for (const route of ['/login', '/signup']) {
          await page.goto(base + route);
          const data = await page.evaluate(() => ({ art: getComputedStyle(document.querySelector('.auth-aside')).display, logo: document.querySelector('.auth-brand img').getBoundingClientRect().width, scroll: document.documentElement.scrollWidth }));
          assert.equal(data.art === 'none', width < 1024);
          assert.ok(data.logo > 0 && data.scroll <= width);
          checks++;
        }
        await context.close();
      }
    }
    console.log(JSON.stringify({ passed: checks, screenshots: __dirname }));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
