(function (root) {
  'use strict';
  const key = value => value.trim().toLocaleLowerCase('pt-BR');

  function normalizePrice(value) {
    const text = String(value).trim().replace(/^R\$\s*/, '');
    // Accept Brazilian grouped prices or an ungrouped decimal with comma/period.
    if (!/^(?:\d{1,6}(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+,\d{2})$/.test(text)) {
      throw new Error('Preço inválido. Use, por exemplo, 28,00.');
    }
    const decimal = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
    const cents = Math.round(Number(decimal) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > 99999999) {
      throw new Error('O preço deve estar entre 0,00 e 999.999,99.');
    }
    return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
  }

  function validateMenu(data) {
    if (!data || data.versao !== 1 || !Array.isArray(data.categorias) || !Array.isArray(data.produtos)) {
      throw new Error('Formato inválido: esperado cardápio com versao 1, categorias e produtos.');
    }
    const categories = new Set();
    for (const category of data.categorias) {
      if (typeof category !== 'string' || !category.trim() || category !== category.trim()) {
        throw new Error('Cada categoria deve ter um nome sem espaços nas extremidades.');
      }
      if (categories.has(key(category))) throw new Error('Há categorias com nomes repetidos.');
      categories.add(key(category));
    }
    const ids = new Set();
    const produtos = data.produtos.map((product, index) => {
      const prefix = `Produto ${index + 1}: `;
      if (!product || typeof product.id !== 'string' || !product.id.trim() || ids.has(product.id)) {
        throw new Error(prefix + 'identificador ausente ou repetido.');
      }
      ids.add(product.id);
      if (typeof product.nome !== 'string' || !product.nome.trim()) throw new Error(prefix + 'nome obrigatório.');
      if (!data.categorias.includes(product.categoria)) throw new Error(prefix + 'categoria não cadastrada.');
      if (typeof product.descricao !== 'string') throw new Error(prefix + 'descrição deve ser texto.');
      if (typeof product.ativo !== 'boolean') throw new Error(prefix + 'ativo deve ser true ou false.');
      if (typeof product.preco !== 'string') throw new Error(prefix + 'preço deve ser texto.');
      let price = '';
      if (product.preco !== '') {
        try { price = normalizePrice(product.preco); } catch (error) { throw new Error(prefix + error.message); }
      }
      return { id: product.id, categoria: product.categoria, nome: product.nome,
        descricao: product.descricao, preco: price, ativo: product.ativo };
    });
    // Return only the documented data fields; never retain imported object prototypes.
    return { versao: 1, categorias: [...data.categorias], produtos };
  }

  async function loadMenu() {
    const response = await fetch('./cardapio.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar cardapio.json.');
    return validateMenu(await response.json());
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  const api = { key, normalizePrice, validateMenu, loadMenu, element };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UrsaMenu = api;
})(globalThis);
