(function (root) {
  'use strict';
  const { validateMenu } = typeof module !== 'undefined' && module.exports
    ? require('./menu-data.js') : root.UrsaMenu;

  class DraftFormatError extends Error {
    constructor() { super('O rascunho salvo é inválido ou incompatível.'); this.name = 'DraftFormatError'; }
  }

  function validateForm(values) {
    if (!values || ['nome', 'categoria', 'preco', 'descricao'].some(field => typeof values[field] !== 'string') ||
      typeof values.ativo !== 'boolean' || typeof values.consulte !== 'boolean') {
      throw new Error('O formulário do rascunho é inválido.');
    }
    // Partial/invalid inputs must survive a reload too; product validation happens on save/export.
    return { nome: values.nome, categoria: values.categoria, preco: values.preco,
      descricao: values.descricao, ativo: values.ativo, consulte: values.consulte };
  }

  function validateDraft(draft) {
    if (!draft || draft.versao !== 1 || !draft.form || typeof draft.newCategory !== 'string') {
      throw new Error('O rascunho salvo tem um formato inválido ou incompatível.');
    }
    const menu = validateMenu(draft.menu);
    const id = draft.form.editingId;
    if (id !== null && (typeof id !== 'string' || !menu.produtos.some(product => product.id === id))) {
      throw new Error('O produto em edição no rascunho não foi encontrado.');
    }
    let publication = null;
    if (draft.publication !== undefined && draft.publication !== null) {
      if (!/^[a-f0-9]{40}$/.test(draft.publication.sha || '') ||
        draft.publication.commit !== null && !/^[a-f0-9]{40}$/.test(draft.publication.commit || '')) throw new Error('Confirmação de publicação inválida.');
      publication = { sha: draft.publication.sha, commit: draft.publication.commit };
    }
    return { versao: 1, menu,
      publishedBase: draft.publishedBase === null ? null : validateMenu(draft.publishedBase),
      exported: draft.exported === null ? null : validateMenu(draft.exported),
      form: { editingId: id, values: validateForm(draft.form.values), baseline: validateForm(draft.form.baseline) },
      newCategory: draft.newCategory, ...(publication ? { publication } : {}) };
  }

  function createStore(getStorage, path) {
    // GitHub Pages projects share an origin, so isolate this editor by its directory.
    const key = 'ursa-cardapio:rascunho:v1:' + path;
    return {
      key,
      read() {
        const raw = getStorage().getItem(key);
        if (raw === null) return null;
        try { return validateDraft(JSON.parse(raw)); }
        catch { throw new DraftFormatError(); }
      },
      write(draft) { getStorage().setItem(key, JSON.stringify(validateDraft(draft))); },
      remove() { getStorage().removeItem(key); }
    };
  }

  const api = { validateDraft, createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UrsaDraft = api;
})(globalThis);
