const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const { startServer } = require('./server.cjs');
const source = require('../cardapio.json');
const clone = () => structuredClone(source);
const key = 'ursa-cardapio:rascunho:v1:/ursa-cardapio/';
const payload = data => ({ name: 'cardapio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
const ready = page => page.waitForFunction(() => !document.getElementById('workspace').disabled);
const stored = page => page.evaluate(key => localStorage.getItem(key), key);

test('persistência e recuperação do editor', { timeout: 180000 }, async t => {
  const { server, url } = await startServer();
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });

    async function open(t, options = {}) {
      const context = await browser.newContext({ acceptDownloads: true, ...options });
      t.after(() => context.close());
      const state = { context, remote: clone(), reply: true };
      const attach = async page => {
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => {
          const reply = state.reply;
          state.reply = true;
          if (reply === false) await dialog.dismiss();
          else await dialog.accept(typeof reply === 'string' ? reply : undefined);
        });
        await page.route('**/cardapio.json', route => state.remote
          ? route.fulfill({ json: state.remote }) : route.fulfill({ status: 503, body: 'Indisponível' }));
        await page.goto(url + 'editor.html');
        return page;
      };
      state.reopen = async () => { state.page = await attach(await context.newPage()); return state.page; };
      await state.reopen();
      await ready(state.page);
      return state;
    }

    async function editPrice(page, value) {
      await page.locator('.product').first().getByRole('button', { name: 'Editar', exact: true }).click();
      await page.locator('#price').fill(value);
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
    }

    await t.test('preço salvo sobrevive a atualização sem cache e reabertura sem importação', async t => {
      const state = await open(t);
      let page = state.page;
      await editPrice(page, '27,90');
      assert.match(await page.locator('#local-status').innerText(), /Alterações salvas neste dispositivo — publicação pendente/);
      assert.match(await page.locator('#dirty').innerText(), /não exportadas/);
      const session = await state.context.newCDPSession(page);
      await Promise.all([page.waitForEvent('load'), session.send('Page.reload', { ignoreCache: true })]);
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 27,90/);
      assert.equal(await page.locator('#recovery').isHidden(), true);
      await page.close();
      page = await state.reopen();
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 27,90/);
      const downloaded = page.waitForEvent('download');
      await page.locator('#export').click();
      const data = JSON.parse(await fs.readFile(await (await downloaded).path(), 'utf8'));
      assert.equal(data.produtos[0].preco, 'R$ 27,90');
      await page.reload();
      await ready(page);
      assert.match(await page.locator('#dirty').innerText(), /Nenhuma alteração/);
      assert.match(await page.locator('#local-status').innerText(), /publicação pendente/);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 27,90/);
    });

    await t.test('formulário incompleto e nova categoria ainda não cadastrada são recuperados', async t => {
      const { page } = await open(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.locator('.product').first().getByRole('button', { name: 'Editar', exact: true }).click();
      await page.locator('#name').fill('Nome ainda em edição');
      await page.locator('#price').fill('12,');
      await page.locator('#description').fill('Descrição incompleta <b>literal</b>');
      await page.locator('#category').selectOption('MATINÉ');
      await page.locator('#active').uncheck();
      await page.locator('#new-category').fill('Categoria incompleta');
      await page.reload();
      await ready(page);
      assert.equal(await page.locator('#name').inputValue(), 'Nome ainda em edição');
      assert.equal(await page.locator('#price').inputValue(), '12,');
      assert.equal(await page.locator('#description').inputValue(), 'Descrição incompleta <b>literal</b>');
      assert.equal(await page.locator('#category').inputValue(), 'MATINÉ');
      assert.equal(await page.locator('#active').isChecked(), false);
      assert.equal(await page.locator('#new-category').inputValue(), 'Categoria incompleta');
      assert.match(await page.locator('#form-title').innerText(), /Editar/);
      assert.match(await page.locator('.product').first().innerText(), /EMPANADA/);
      await page.locator('#new-category').fill('');
      await page.locator('#export').click();
      assert.match(await page.locator('#form-error').innerText(), /Preço inválido/);
      assert.equal(await page.locator('.product').count(), 54);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });

    await t.test('categorias, inclusão, pausa, ativação e exclusão persistem após recarga', async t => {
      const state = await open(t);
      const { page } = state;
      await page.locator('#new-category').fill('Extras');
      await page.locator('#category-form button').click();
      const extra = page.locator('#category-list li').filter({ hasText: 'Extras' });
      await extra.getByRole('button', { name: 'Mover Extras para cima' }).click();
      state.reply = 'Extras da casa';
      await extra.getByRole('button', { name: 'Renomear', exact: true }).click();
      await page.locator('#name').fill('Novo persistido');
      await page.locator('#category').selectOption('Extras da casa');
      await page.locator('#price').fill('8,50');
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
      await page.locator('.product').first().getByRole('button', { name: 'Pausar', exact: true }).click();
      await page.locator('.product').nth(1).getByRole('button', { name: 'Excluir', exact: true }).click();
      await page.reload();
      await ready(page);
      assert.equal(await page.locator('.product').count(), 54);
      assert.match(await page.locator('.product').first().innerText(), /Pausado/);
      assert.equal(await page.locator('.product').filter({ hasText: 'MEIA LUA' }).count(), 0);
      assert.equal(await page.locator('.product').filter({ hasText: 'Novo persistido' }).count(), 1);
      assert.match(await page.locator('#category-list li').nth(13).innerText(), /Extras da casa/);
      await page.locator('.product').first().getByRole('button', { name: 'Ativar', exact: true }).click();
      await page.locator('.product').filter({ hasText: 'Novo persistido' }).getByRole('button', { name: 'Excluir', exact: true }).click();
      await page.locator('#category-list li').filter({ hasText: 'Extras da casa' }).getByRole('button', { name: 'Excluir', exact: true }).click();
      await page.reload();
      await ready(page);
      assert.equal(await page.locator('.product').count(), 53);
      assert.match(await page.locator('.product').first().innerText(), /Ativo/);
      assert.equal(await page.locator('#category-list li').count(), 14);
    });

    await t.test('importação válida persiste; importação inválida ou cancelada não altera o rascunho', async t => {
      const state = await open(t);
      const { page } = state;
      const imported = clone();
      imported.produtos[0].preco = 'R$ 44,40';
      imported.produtos[1].ativo = false;
      imported.categorias.reverse();
      await page.locator('#import').setInputFiles(payload(imported));
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Arquivo importado'));
      const saved = await stored(page);
      assert.deepEqual(JSON.parse(saved).menu, imported);
      const invalid = clone();
      invalid.produtos[0].preco = '-1';
      await page.locator('#import').setInputFiles(payload(invalid));
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Importação cancelada'));
      assert.equal(await stored(page), saved);
      state.reply = false;
      await page.locator('#import').setInputFiles(payload(source));
      await page.waitForFunction(() => document.getElementById('import').value === '');
      assert.equal(await stored(page), saved);
      await page.reload();
      await ready(page);
      assert.match(await page.locator('.product').filter({ hasText: 'EMPANADA' }).innerText(), /R\$ 44,40/);
      assert.equal(await page.locator('#category-list li span').first().innerText(), 'SANDUÍCHES (1)');
      assert.match(await page.locator('#dirty').innerText(), /não exportadas/);
    });

    await t.test('descarte exige confirmação e carrega a versão publicada mais recente', async t => {
      const state = await open(t);
      const { page } = state;
      await editPrice(page, '33,30');
      await page.evaluate(() => localStorage.setItem('outro-aplicativo', 'preservar'));
      const saved = await stored(page);
      state.reply = false;
      await page.locator('#discard-local').click();
      assert.equal(await stored(page), saved);
      state.remote.produtos[0].preco = 'R$ 22,20';
      await page.locator('#discard-local').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Alterações locais descartadas'));
      assert.equal(await stored(page), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('outro-aplicativo')), 'preservar');
      assert.match(await page.locator('.product').first().innerText(), /R\$ 22,20/);
      assert.match(await page.locator('#local-status').innerText(), /Nenhuma alteração local/);
      await page.reload();
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 22,20/);
      assert.equal(await page.locator('#recovery').isHidden(), true);
    });

    await t.test('nova versão publicada preserva o rascunho até uma escolha explícita', async t => {
      const state = await open(t);
      const { page } = state;
      await editPrice(page, '55,50');
      const saved = await stored(page);
      state.remote.produtos[0].preco = 'R$ 66,60';
      await page.reload();
      await page.locator('#recover-draft').waitFor();
      assert.equal(await page.locator('#export').isDisabled(), true);
      assert.match(await page.locator('#recovery-message').innerText(), /nova versão/);
      assert.equal(await stored(page), saved);
      await page.locator('#recover-draft').click();
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 55,50/);
      assert.equal(JSON.parse(await stored(page)).publishedBase.produtos[0].preco, 'R$ 66,60');
      await page.reload();
      await ready(page);
      assert.equal(await page.locator('#recovery').isHidden(), true);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 55,50/);
      state.remote.produtos[0].preco = 'R$ 77,70';
      await page.reload();
      await page.locator('#load-published').waitFor();
      state.reply = false;
      await page.locator('#load-published').click();
      assert.equal(await page.locator('#export').isDisabled(), true);
      assert.equal(JSON.parse(await stored(page)).menu.produtos[0].preco, 'R$ 55,50');
      await page.locator('#load-published').click();
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 77,70/);
      assert.equal(await stored(page), null);
    });

    await t.test('rascunho é recuperado se o JSON falhar; descarte sem conexão preserva os dados', async t => {
      const state = await open(t);
      const { page } = state;
      await editPrice(page, '31,50');
      state.remote = null;
      await page.reload();
      await ready(page);
      assert.match(await page.locator('.product').first().innerText(), /R\$ 31,50/);
      assert.match(await page.locator('#message').innerText(), /Não foi possível verificar/);
      const saved = await stored(page);
      await page.locator('#discard-local').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('rascunho local foi mantido'));
      assert.equal(await stored(page), saved);
      assert.equal(await page.locator('#export').isEnabled(), true);
    });

    await t.test('falha de localStorage é visível e não impede exportar um backup', async t => {
      const { page } = await open(t);
      await editPrice(page, '23,50');
      const previous = await stored(page);
      await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota excedida', 'QuotaExceededError'); }; });
      await editPrice(page, '24,50');
      assert.match(await page.locator('#local-status').innerText(), /Não foi possível salvar/);
      assert.equal(await stored(page), previous);
      assert.equal(await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }), true);
      const downloaded = page.waitForEvent('download');
      await page.locator('#export').click();
      const data = JSON.parse(await fs.readFile(await (await downloaded).path(), 'utf8'));
      assert.equal(data.produtos[0].preco, 'R$ 24,50');
      assert.match(await page.locator('#local-status').innerText(), /Não foi possível salvar/);
      await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new Error('Bloqueado'); }; });
      await page.locator('#discard-local').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Não foi possível descartar'));
      assert.match(await page.locator('.product').first().innerText(), /R\$ 24,50/);
      assert.equal(await stored(page), previous);
    });

    await t.test('rascunho corrompido fica intacto até confirmação de descarte', async t => {
      const { page } = await open(t);
      await page.evaluate(key => localStorage.setItem(key, '{rascunho corrompido'), key);
      await page.reload();
      await page.locator('#load-published').waitFor();
      assert.equal(await page.locator('#export').isDisabled(), true);
      assert.equal(await page.locator('#recover-draft').isDisabled(), true);
      assert.equal(await stored(page), '{rascunho corrompido');
      await page.locator('#load-published').click();
      await ready(page);
      assert.equal(await stored(page), null);
      assert.equal(await page.locator('.product').count(), 54);
    });

    await t.test('leitura bloqueada permite exportar sem sobrescrever um rascunho desconhecido', async t => {
      const state = await open(t);
      const { page } = state;
      await editPrice(page, '34,50');
      const previous = await stored(page);
      await state.context.addInitScript(() => {
        const original = Storage.prototype.getItem;
        window.readDeviceItem = key => original.call(localStorage, key);
        Storage.prototype.getItem = () => { throw new DOMException('Bloqueado', 'SecurityError'); };
      });
      await page.reload();
      await ready(page);
      assert.match(await page.locator('#local-status').innerText(), /Não foi possível salvar/);
      assert.equal(await page.evaluate(key => window.readDeviceItem(key), key), previous);
      await editPrice(page, '35,50');
      assert.equal(await page.evaluate(key => window.readDeviceItem(key), key), previous);
      const downloaded = page.waitForEvent('download');
      await page.locator('#export').click();
      const data = JSON.parse(await fs.readFile(await (await downloaded).path(), 'utf8'));
      assert.equal(data.produtos[0].preco, 'R$ 35,50');
    });
    assert.deepEqual(errors, [], 'nenhuma exceção JavaScript nos fluxos de persistência');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
