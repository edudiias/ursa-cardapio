const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixture, backend, editor } = require('./worker-fixture.cjs');
const source = require('../cardapio.json');
const site = editor + '/ursa-cardapio/';
const draftKey = 'ursa-cardapio:rascunho:v1:/ursa-cardapio/';
const ready = page => page.waitForFunction(() => !document.getElementById('workspace').disabled);
const saved = page => page.evaluate(key => localStorage.getItem(key), draftKey);

test('publicação integrada entre editor, janela segura e Worker (GitHub simulado)', { timeout: 180000 }, async t => {
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    async function open(t) {
      const f = await fixture();
      const context = await browser.newContext();
      context.setDefaultTimeout(10000);
      t.after(() => context.close());
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      await context.route('**/*', route => route.abort());
      await context.route(site + '**', async route => {
        const filename = path.basename(new URL(route.request().url()).pathname) || 'index.html';
        if (filename === 'editor-config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.UrsaPublishConfig = {backendOrigin: '${backend}'};` });
        if (filename === 'cardapio.json') return route.fulfill({ json: source });
        if (!['editor.html', 'editor.css', 'editor.js', 'menu-data.js', 'editor-storage.js', 'editor-publish.js'].includes(filename)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html',
          body: await fs.readFile(path.join(__dirname, '..', filename)) });
      });
      await context.route(backend + '/**', async route => {
        const input = route.request();
        const response = await f.handler(new Request(input.url(), { method: input.method(), headers: await input.allHeaders(),
          ...(['GET', 'HEAD'].includes(input.method()) ? {} : { body: input.postData() }) }), f.env);
        const headers = Object.fromEntries(response.headers);
        // Translate HTTP cookies into the simulated HTTPS host's real browser cookie jar.
        for (const value of response.headers.getSetCookie()) {
          const [pair] = value.split(';');
          const split = pair.indexOf('=');
          const age = Number(/Max-Age=(\d+)/.exec(value)?.[1] || 0);
          await context.addCookies([{ name: pair.slice(0, split), value: pair.slice(split + 1), domain: new URL(backend).hostname,
            path: '/', secure: true, httpOnly: true, sameSite: 'Lax', expires: Date.now() / 1000 + (age || -1) }]);
        }
        delete headers['set-cookie'];
        // Playwright does not re-route every hop of an HTTP redirect chain.
        // Model navigations as new browser requests so no test reaches the real provider.
        if (response.status === 302) {
          const target = headers.location.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
          delete headers.location;
          headers['content-type'] = 'text/html';
          return route.fulfill({ status: 200, headers, body: `<meta http-equiv="refresh" content="0;url=${target}">` });
        }
        await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
      });
      await context.route(/^https:\/\/github\.com\/login\/oauth\/authorize\?/, route => {
        const state = new URL(route.request().url()).searchParams.get('state');
        return route.fulfill({ contentType: 'text/html', body: `<meta http-equiv="refresh" content="0;url=${backend}/auth/callback?code=test-code&amp;state=${state}">` });
      });
      const page = await context.newPage();
      await page.goto(site + 'editor.html');
      await ready(page);
      const popup = async button => {
        const opened = page.waitForEvent('popup');
        await page.locator(button).click();
        const window = await opened;
        await window.waitForLoadState();
        return window;
      };
      const login = async () => {
        const window = await popup('#github-login');
        await window.locator('#login').waitFor();
        await window.locator('#login').click();
        try { await page.waitForFunction(() => document.getElementById('auth-status').textContent.includes('Autenticado como edudiias')); }
        catch (error) {
          t.diagnostic(JSON.stringify({ popupUrl: window.url(), popupText: await window.locator('body').innerText(), opener: await window.evaluate(() => Boolean(opener)), errors }));
          throw error;
        }
        return window;
      };
      return { f, page, context, popup, login };
    }
    async function edit(page, price) {
      await page.locator('.product').first().getByRole('button', { name: 'Editar', exact: true }).click();
      await page.locator('#price').fill(price);
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
    }

    await t.test('OAuth, confirmação, commit e logout; cookies HttpOnly e rascunho enquanto Pages atualiza', async t => {
      const { f, page, context, popup, login } = await open(t);
      assert.equal(await page.locator('#publish').isDisabled(), true);
      await edit(page, '41,90');
      const authWindow = await login();
      assert.equal(await authWindow.evaluate(() => document.cookie), '');
      const cookies = await context.cookies(backend);
      const session = cookies.find(cookie => cookie.name === '__Host-ursa_session');
      assert.equal(session.httpOnly, true);
      assert.equal(session.secure, true);
      await authWindow.close();
      const window = await popup('#publish');
      await window.locator('#confirm').waitFor();
      assert.equal(f.state.writes, 0, 'abrir a janela nunca publica sem confirmação');
      await window.locator('#confirm').click();
      await page.waitForFunction(() => document.getElementById('publish-status').textContent.includes('Commit ccccccc criado'));
      assert.equal(f.state.writes, 1);
      assert.equal(f.state.menu.produtos[0].preco, 'R$ 41,90');
      assert.match(await page.locator('#local-status').innerText(), /commit confirmado/);
      const draft = JSON.parse(await saved(page));
      assert.equal(draft.publication.commit, 'c'.repeat(40));
      assert.ok(!JSON.stringify(draft).includes('test-user-token'));
      await window.close();
      await page.reload();
      await page.locator('#recover-draft').waitFor();
      assert.match(await page.locator('#recovery-message').innerText(), /Pages pode estar atualizando/);
      await page.locator('#recover-draft').click();
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 41,90/);
      const logoutWindow = await popup('#github-login');
      await page.waitForFunction(() => document.getElementById('auth-status').textContent.includes('Autenticado'));
      await logoutWindow.close();
      const logout = await popup('#github-logout');
      await page.waitForFunction(() => document.getElementById('auth-status').textContent.includes('Sessão encerrada'));
      assert.equal(await page.locator('#publish').isDisabled(), true);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 41,90/);
      await logout.close();
    });

    await t.test('falha de publicação preserva exatamente o rascunho e oferece exportação', async t => {
      const { f, page, popup, login } = await open(t);
      await (await login()).close();
      await edit(page, '45,50');
      const original = await saved(page);
      f.state.writeStatus = 403;
      const window = await popup('#publish');
      await window.locator('#confirm').waitFor();
      await window.locator('#confirm').click();
      await page.waitForFunction(() => document.getElementById('publish-status').textContent.includes('recusou a publicação'));
      assert.equal(await saved(page), original);
      assert.equal(f.state.menu.produtos[0].preco, 'R$ 18,00');
      const downloaded = page.waitForEvent('download');
      await page.locator('#export').click();
      assert.equal((await downloaded).suggestedFilename(), 'cardapio.json');
      await window.close();
    });

    await t.test('conflito remoto não publica e permite revisar mantendo o rascunho', async t => {
      const { f, page, popup, login } = await open(t);
      await (await login()).close();
      await edit(page, '48,50');
      const original = await saved(page);
      f.state.menu.produtos[0].preco = 'R$ 49,50';
      f.state.fileSha = 'd'.repeat(40);
      const window = await popup('#publish');
      await window.locator('#review').waitFor();
      assert.equal(f.state.writes, 0);
      assert.equal(await saved(page), original);
      await window.locator('#review').click();
      await page.locator('#recover-draft').waitFor();
      assert.match(await page.locator('#recovery-message').innerText(), /main mudou/);
      await page.locator('#recover-draft').click();
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 48,50/);
      assert.equal(JSON.parse(await saved(page)).publishedBase.produtos[0].preco, 'R$ 49,50');
      await window.close();
    });

    await t.test('sessão expirada durante confirmação impede publicar e mantém trabalho local', async t => {
      const { f, page, popup, login } = await open(t);
      await (await login()).close();
      await edit(page, '51,50');
      const original = await saved(page);
      const window = await popup('#publish');
      await window.locator('#confirm').waitFor();
      f.state.now += 3600001;
      await window.locator('#confirm').click();
      await page.waitForFunction(() => document.getElementById('auth-status').textContent.includes('Sessão encerrada'));
      assert.equal(f.state.writes, 0);
      assert.equal(await saved(page), original);
      await window.close();
    });

    await t.test('edições feitas durante o envio continuam pendentes após confirmar o snapshot anterior', async t => {
      const { f, page, popup, login } = await open(t);
      await (await login()).close();
      await edit(page, '54,50');
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      f.state.beforeWrite = () => gate;
      const window = await popup('#publish');
      await window.locator('#confirm').waitFor();
      await window.locator('#confirm').click();
      await page.waitForFunction(() => document.getElementById('publish-status').textContent.includes('Publicando no GitHub'));
      await edit(page, '55,50');
      release();
      await page.waitForFunction(() => document.getElementById('publish-status').textContent.includes('Commit ccccccc criado'));
      assert.equal(f.state.menu.produtos[0].preco, 'R$ 54,50');
      assert.match(await page.locator('.product').first().innerText(), /R\$ 55,50/);
      const draft = JSON.parse(await saved(page));
      assert.equal(draft.menu.produtos[0].preco, 'R$ 55,50');
      assert.equal(draft.publishedBase.produtos[0].preco, 'R$ 54,50');
      assert.match(await page.locator('#local-status').innerText(), /publicação pendente/);
      await window.close();
    });
    await t.test('origem, janela e identificador impedem mensagens forjadas de autenticação', async t => {
      const { page, popup } = await open(t);
      const window = await popup('#github-login');
      await window.locator('#login').waitFor();
      const channel = new URLSearchParams(new URL(window.url()).hash.slice(1)).get('channel');
      await page.evaluate(({ channel, origin }) => window.postMessage({ type: 'ursa:session', channel, authenticated: true, login: 'edudiias' }, origin), { channel, origin: editor });
      await window.evaluate(origin => opener.postMessage({ type: 'ursa:session', channel: 'wrong', authenticated: true, login: 'edudiias' }, origin), editor);
      assert.equal(await page.locator('#publish').isDisabled(), true);
      assert.doesNotMatch(await page.locator('#auth-status').innerText(), /Autenticado como/);
      await window.close();
    });

    await t.test('conta diferente é recusada no OAuth e não habilita publicação', async t => {
      const { f, page, popup } = await open(t);
      f.state.identity = { login: 'outro', id: 99 };
      const window = await popup('#github-login');
      await window.locator('#login').waitFor();
      await window.locator('#login').click();
      await window.getByRole('heading', { name: 'Autenticação não concluída' }).waitFor();
      assert.match(await window.locator('body').innerText(), /Somente edudiias/);
      assert.equal(await page.locator('#publish').isDisabled(), true);
      assert.equal(f.state.writes, 0);
      await window.close();
    });
    assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); }
});
