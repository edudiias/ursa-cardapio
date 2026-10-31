const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validateMenu, normalizePrice } = require('../menu-data.js');
const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../cardapio.json'), 'utf8'));
const copy = () => structuredClone(original);

test('migração preserva os 54 produtos, os quatro campos originais e sua ordem', () => {
  const data = validateMenu(original);
  assert.equal(data.produtos.length, 54);
  assert.equal(data.categorias.length, 14);
  const legacy = data.produtos.map(({ categoria, nome, descricao, preco }) => ({ categoria, nome, descricao, preco }));
  // SHA-256 do array original de index.html no commit 4f7adab, usando JSON.stringify.
  const digest = createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  assert.equal(digest, '29065c2afbcd137e196af8855adf3bdb41a8e315f78750e2d35e46aebf6e0fc7');
  assert.deepEqual(data.categorias, [...new Set(legacy.map(product => product.categoria))]);
  assert.ok(data.produtos.every(product => product.ativo));
  assert.equal(data.produtos.filter(product => product.preco === '').length, 1);
});

test('preços aceitam formatos explícitos e rejeitam entradas ambíguas ou inválidas', () => {
  for (const [input, expected] of [['28', 'R$ 28,00'], ['28,5', 'R$ 28,50'], ['28.50', 'R$ 28,50'],
    ['R$ 28,00', 'R$ 28,00'], ['1.234,56', 'R$ 1234,56'], ['0', 'R$ 0,00'], ['999999,99', 'R$ 999999,99']]) {
    assert.equal(normalizePrice(input), expected);
  }
  for (const input of ['', ' ', '-1', 'abc', '1e3', 'Infinity', 'NaN', '28,999', '1,234.56', '1000000', '1.234']) {
    assert.throws(() => normalizePrice(input));
  }
});

test('importação rejeita estrutura inválida, ids duplicados, campos e categorias ausentes', () => {
  for (const mutate of [data => data.versao = 2, data => data.categorias.push(' novidades '),
    data => data.categorias.push('novidades'), data => data.produtos[0].nome = ' ',
    data => data.produtos[0].preco = '-20', data => data.produtos[0].preco = 20,
    data => data.produtos[0].ativo = 'false', data => data.produtos[0].descricao = null,
    data => data.produtos[0].categoria = 'Ausente', data => data.produtos[0].id = data.produtos[1].id]) {
    const data = copy();
    mutate(data);
    assert.throws(() => validateMenu(data));
  }
  for (const data of [null, {}, [], { versao: 1, categorias: [], produtos: [null] }]) {
    assert.throws(() => validateMenu(data));
  }
});

test('exportação/importação preserva status, textos literais, categorias vazias e cardápio vazio', () => {
  const data = copy();
  data.produtos[0].ativo = false;
  data.produtos[0].nome = '<img src=x onerror=alert(1)>';
  data.produtos[0].descricao = '<script>alert(1)</script> & café';
  data.categorias.push('Categoria vazia');
  assert.deepEqual(validateMenu(JSON.parse(JSON.stringify(data))), data);
  assert.deepEqual(validateMenu({ versao: 1, categorias: [], produtos: [] }), { versao: 1, categorias: [], produtos: [] });
});

test('preços importados válidos são formatados para exibição em reais', () => {
  const data = copy();
  data.produtos[0].preco = '19.5';
  assert.equal(validateMenu(data).produtos[0].preco, 'R$ 19,50');
});
