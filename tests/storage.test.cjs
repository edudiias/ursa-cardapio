const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore, validateDraft } = require('../editor-storage.js');
const menu = require('../cardapio.json');

function fixture() {
  const values = { nome: 'Produto incompleto', categoria: 'NOVIDADES', preco: 'inválido',
    descricao: '<script>texto literal</script>', ativo: false, consulte: false };
  return { versao: 1, menu: structuredClone(menu), publishedBase: structuredClone(menu),
    exported: structuredClone(menu), form: { editingId: null, values, baseline: { ...values, nome: '', preco: '' } },
    newCategory: 'Categoria em preenchimento' };
}

function memory() {
  const entries = new Map();
  return { entries, getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}

test('rascunho preserva menu, categoria em preenchimento, preço incompleto e versões de referência', () => {
  const storage = memory();
  const store = createStore(() => storage, '/ursa-cardapio/');
  assert.equal(store.read(), null);
  const draft = fixture();
  draft.menu.produtos[0].preco = 'R$ 99,90';
  draft.menu.produtos[1].ativo = false;
  draft.menu.categorias.reverse();
  store.write(draft);
  assert.deepEqual(store.read(), draft);
  assert.equal(store.read().publishedBase.produtos[0].preco, 'R$ 18,00');
  assert.equal(store.read().exported.produtos[0].preco, 'R$ 18,00');
});

test('rascunhos de diretórios diferentes são isolados e descarte remove somente a chave do editor', () => {
  const storage = memory();
  storage.setItem('outro-aplicativo', 'preservar');
  const a = createStore(() => storage, '/ursa-cardapio/');
  const b = createStore(() => storage, '/outro-cardapio/');
  a.write(fixture());
  b.write(fixture());
  a.remove();
  assert.equal(a.read(), null);
  assert.ok(b.read());
  assert.equal(storage.getItem('outro-aplicativo'), 'preservar');
});

test('dados corrompidos ou incompatíveis são rejeitados sem apagar o armazenamento', () => {
  const storage = memory();
  const store = createStore(() => storage, '/');
  storage.setItem(store.key, '{');
  assert.throws(() => store.read());
  assert.equal(storage.getItem(store.key), '{');
  for (const mutate of [draft => draft.versao = 2, draft => draft.form.values.ativo = 'false',
    draft => draft.form.editingId = 'inexistente', draft => draft.menu.produtos[0].preco = '-1',
    draft => draft.publishedBase = {}, draft => draft.exported = {}, draft => draft.newCategory = null]) {
    const draft = fixture();
    mutate(draft);
    assert.throws(() => validateDraft(draft));
  }
});

test('falhas de leitura, quota e descarte são expostas ao editor, sem alegar sucesso', () => {
  const store = createStore(() => { throw new Error('Armazenamento bloqueado'); }, '/');
  assert.throws(() => store.read(), /bloqueado/);
  assert.throws(() => store.write(fixture()), /bloqueado/);
  assert.throws(() => store.remove(), /bloqueado/);
  const storage = memory();
  const limited = createStore(() => storage, '/');
  limited.write(fixture());
  const previous = storage.getItem(limited.key);
  storage.setItem = () => { throw new Error('Quota excedida'); };
  assert.throws(() => limited.write(fixture()), /Quota/);
  assert.equal(storage.getItem(limited.key), previous);
});

test('confirmação de publicação sobrevive sem alterar o formato de rascunhos antigos', () => {
  const draft = fixture();
  draft.publication = { sha: 'a'.repeat(40), commit: 'b'.repeat(40) };
  assert.deepEqual(validateDraft(draft).publication, draft.publication);
  draft.publication.commit = null;
  assert.equal(validateDraft(draft).publication.commit, null);
  draft.publication.sha = 'invalid';
  assert.throws(() => validateDraft(draft));
});
