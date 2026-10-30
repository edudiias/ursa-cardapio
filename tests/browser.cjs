const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { startServer } = require('./server.cjs');
const source = require('../cardapio.json');
const clone = () => structuredClone(source);
const payload = data => ({ name: 'cardapio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
const outputDir = path.join(__dirname, '../test-results');

test('editor e cardápio em navegador real', { timeout: 180000 }, async t => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    await fs.mkdir(outputDir, { recursive: true });
    const errors = [];
    const context = await browser.newContext({ acceptDownloads: true });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));

    await t.test('carregamento preserva visual, dados, busca e caminho do GitHub Pages', async () => {
      const page = await context.newPage();
      await page.goto(url);
      await page.locator('.item').last().waitFor();
      assert.equal(await page.locator('.item').count(), 54);
      assert.equal(await page.locator('#chips button').count(), 15);
      const publicImage = await page.screenshot({ fullPage: true, path: path.join(outputDir, 'cardapio-desktop.png') });
      const legacy = execFileSync('git', ['show', '4f7adab:index.html'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
      await page.route('**/legacy.html', route => route.fulfill({ contentType: 'text/html', body: legacy }));
      await page.goto(url + 'legacy.html');
      await page.locator('.item').last().waitFor();
      const legacyImage = await page.screenshot({ fullPage: true });
      assert.deepEqual(publicImage, legacyImage, 'o visual deve ser idêntico ao cardápio original');
      await page.goto(url);
      await page.locator('.item').last().waitFor();
      await page.locator('#q').fill('Tigresa');
      assert.equal(await page.locator('.item').count(), 1);
      await page.locator('#q').fill('inexistente');
      assert.match(await page.locator('#items').innerText(), /Nenhum produto/);
      await page.close();
    });

    await t.test('edição, criação, pausa, ativação, exclusão e download acumulado', async () => {
      const page = await context.newPage();
      let reply = true;
      const dialogs = [];
      page.on('dialog', async dialog => {
        dialogs.push({ type: dialog.type(), message: dialog.message() });
        if (reply === false) await dialog.dismiss();
        else await dialog.accept(typeof reply === 'string' ? reply : undefined);
        reply = true;
      });
      await page.goto(url + 'editor.html');
      await page.waitForFunction(() => !document.getElementById('workspace').disabled);
      assert.equal(await page.locator('.product').count(), 54);
      assert.match(await page.locator('aside').innerText(), /sem autenticação/);
      await page.locator('#search').fill('EMPANADA');
      assert.equal(await page.locator('.product').count(), 1);
      await page.locator('.product').getByRole('button', { name: 'Editar', exact: true }).click();
      await page.locator('#name').fill('Empanada editada');
      await page.locator('#price').fill('-1');
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
      assert.match(await page.locator('#form-error').innerText(), /Preço inválido/);
      await page.locator('#price').fill('19,50');
      await page.locator('#description').fill('Descrição editada & <b>texto literal</b>');
      await page.locator('#category').selectOption('MATINÉ');
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
      assert.match(await page.locator('#dirty').innerText(), /não exportadas/);
      assert.match(await page.locator('.product').innerText(), /R\$ 19,50/);
      assert.equal(await page.locator('.product b').count(), 0);

      await page.locator('#search').fill('');
      await page.locator('#name').fill('Teste novo');
      await page.locator('#price').fill('12.75');
      // Navigation away from a changed form must ask before discarding it.
      reply = false;
      await page.locator('#new-product').click();
      assert.equal(await page.locator('#name').inputValue(), 'Teste novo');
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
      assert.equal(await page.locator('.product').count(), 55);
      const created = page.locator('.product').filter({ hasText: 'Teste novo' });
      await created.getByRole('button', { name: 'Pausar', exact: true }).click();
      assert.match(await created.innerText(), /Pausado/);
      await created.getByRole('button', { name: 'Ativar', exact: true }).click();
      assert.match(await created.innerText(), /Ativo/);
      reply = false;
      await created.getByRole('button', { name: 'Excluir', exact: true }).click();
      assert.equal(await page.locator('.product').count(), 55);
      await created.getByRole('button', { name: 'Excluir', exact: true }).click();
      assert.equal(await page.locator('.product').count(), 54);

      // Required fields and explicit no-price option.
      await page.locator('#name').fill(' ');
      await page.locator('#consult').check();
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
      assert.match(await page.locator('#form-error').innerText(), /nome/);
      await page.locator('#name').fill('Produto consulte');
      await page.locator('#active').uncheck();
      const downloadPromise = page.waitForEvent('download');
      // Export also saves a valid pending product form.
      await page.locator('#export').click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'cardapio.json');
      const downloaded = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert.equal(downloaded.produtos.length, 55);
      const edited = downloaded.produtos.find(product => product.id === 'produto-001');
      assert.equal(edited.nome, 'Empanada editada');
      assert.equal(edited.categoria, 'MATINÉ');
      assert.equal(edited.preco, 'R$ 19,50');
      const consulted = downloaded.produtos.find(product => product.nome === 'Produto consulte');
      assert.equal(consulted.preco, '');
      assert.equal(consulted.ativo, false);
      assert.match(await page.locator('#dirty').innerText(), /Nenhuma alteração/);

      await page.locator('#new-category').fill('ESPECIAIS');
      await page.locator('#category-form button').click();
      assert.equal(await page.locator('#category-list li').count(), 15);
      await page.locator('#new-category').fill(' especiais ');
      await page.locator('#category-form button').click();
      assert.match(await page.locator('#message').innerText(), /Já existe/);
      await page.locator('#new-category').fill('');
      const special = page.locator('#category-list li').filter({ hasText: 'ESPECIAIS' });
      await special.getByRole('button', { name: 'Mover ESPECIAIS para cima' }).click();
      assert.match(await page.locator('#category-list li').nth(13).innerText(), /ESPECIAIS/);
      await special.getByRole('button', { name: 'Excluir', exact: true }).click();
      assert.equal(await page.locator('#category-list li').count(), 14);
      const first = page.locator('#category-list li').first();
      await first.getByRole('button', { name: 'Excluir', exact: true }).click();
      assert.match(await page.locator('#message').innerText(), /Mova ou exclua/);
      reply = 'NOVIDADES DA CASA';
      await first.getByRole('button', { name: 'Renomear', exact: true }).click();
      assert.match(await page.locator('#product-list h3').first().innerText(), /NOVIDADES DA CASA/);

      await page.locator('#import').setInputFiles(payload(downloaded));
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Arquivo importado'));
      assert.equal(await page.locator('.product').count(), 55);
      assert.match(await page.locator('#category-list li').first().innerText(), /NOVIDADES \(/);
      reply = false;
      await page.locator('#import').setInputFiles(payload(source));
      await page.waitForFunction(() => document.getElementById('import').value === '');
      assert.equal(await page.locator('.product').count(), 55);
      const invalid = clone();
      invalid.produtos[0].preco = 'ruim';
      await page.locator('#import').setInputFiles(payload(invalid));
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Importação cancelada'));
      assert.equal(await page.locator('.product').count(), 55);
      await page.locator('#import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Os dados anteriores foram mantidos'));
      assert.equal(await page.locator('.product').count(), 55);
      assert.ok(dialogs.some(dialog => /Excluir/.test(dialog.message)));
      assert.ok(dialogs.some(dialog => /Descartar/.test(dialog.message)));
      assert.match(await page.locator('#dirty').innerText(), /Nenhuma alteração/);
      await page.locator('#name').fill('Edição ainda não salva');
      const protectedNavigation = await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
      assert.equal(protectedNavigation, true);
      await page.screenshot({ fullPage: true, path: path.join(outputDir, 'editor-desktop.png') });
      await page.close();
    });

    await t.test('público só mostra ativos, segue ordem e trata dados como texto', async () => {
      const data = clone();
      data.produtos[0].ativo = false;
      data.produtos[1].nome = '<img src=x onerror="window.injected=true">';
      data.produtos[1].descricao = '<script>window.injected=true</script>';
      data.categorias.reverse();
      const page = await context.newPage();
      await page.route('**/cardapio.json', route => route.fulfill({ json: data }));
      await page.goto(url);
      await page.locator('.item').last().waitFor();
      assert.equal(await page.locator('.item').count(), 53);
      assert.equal(await page.locator('h2').first().innerText(), data.categorias[0]);
      assert.equal(await page.locator('.name').filter({ hasText: 'EMPANADA' }).count(), 0);
      assert.equal(await page.locator('#items img, #items script').count(), 0);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      await page.locator('#q').fill('<img');
      assert.equal(await page.locator('.item').count(), 1);
      await page.close();
    });

    await t.test('falhas de carregamento são visíveis e editor recupera por importação', async () => {
      const page = await context.newPage();
      page.on('dialog', dialog => dialog.accept());
      await page.route('**/cardapio.json', route => route.fulfill({ status: 404, body: 'Não encontrado' }));
      await page.goto(url);
      await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
      assert.match(await page.locator('#items').innerText(), /Não foi possível/);
      await page.goto(url + 'editor.html');
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('Não foi possível'));
      assert.equal(await page.locator('#export').isDisabled(), true);
      assert.equal(await page.locator('#import').isEnabled(), true);
      await page.locator('#import').setInputFiles(payload(source));
      await page.locator('.product').last().waitFor();
      assert.equal(await page.locator('.product').count(), 54);
      assert.equal(await page.locator('#export').isEnabled(), true);
      await page.close();
    });

    await t.test('celular: sem rolagem horizontal, formulário e exportação funcionam', async () => {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
      const page = await mobile.newPage();
      await page.goto(url);
      await page.locator('.item').last().waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ fullPage: true, path: path.join(outputDir, 'cardapio-mobile.png') });
      await page.goto(url + 'editor.html');
      await page.waitForFunction(() => !document.getElementById('workspace').disabled);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#name').fill('Produto no celular');
      await page.locator('#price').fill('5,50');
      await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
      assert.equal(await page.locator('.product').count(), 55);
      const downloaded = page.waitForEvent('download');
      await page.locator('#export').click();
      assert.equal((await downloaded).suggestedFilename(), 'cardapio.json');
      await page.screenshot({ fullPage: true, path: path.join(outputDir, 'editor-mobile.png') });
      await mobile.close();
    });
    assert.deepEqual(errors, [], 'não deve haver exceções JavaScript');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
