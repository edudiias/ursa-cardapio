'use strict';
(() => {
  const { loadMenu, element } = UrsaMenu;
  const q = document.getElementById('q');
  const chips = document.getElementById('chips');
  const items = document.getElementById('items');
  let menu;
  let current = null;

  function render() {
    const active = menu.produtos.filter(product => product.ativo);
    const categories = menu.categorias.filter(category => active.some(product => product.categoria === category));
    chips.replaceChildren();
    for (const category of [null, ...categories]) {
      const button = element('button', category === null ? 'Todos' : category);
      button.className = category === current ? 'active' : '';
      button.setAttribute('aria-pressed', String(category === current));
      button.onclick = () => { current = category; render(); };
      chips.append(button);
    }
    const term = q.value.toLocaleLowerCase('pt-BR');
    const matches = active.filter(product => (current === null || product.categoria === current) &&
      [product.nome, product.descricao, product.categoria].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    items.replaceChildren();
    for (const category of categories) {
      const products = matches.filter(product => product.categoria === category);
      if (!products.length) continue;
      const section = element('section');
      section.append(element('h2', category));
      for (const product of products) {
        const article = element('article', undefined, 'item');
        const left = element('div');
        left.append(element('div', product.nome, 'name'), element('div', product.descricao, 'desc'));
        article.append(left, element('div', product.preco || 'Consulte', 'price'));
        section.append(article);
      }
      items.append(section);
    }
    if (!matches.length) items.append(element('p', 'Nenhum produto encontrado.', 'empty'));
  }

  q.addEventListener('input', () => { if (menu) render(); });
  loadMenu().then(data => { menu = data; render(); }).catch(() => {
    items.replaceChildren(element('p', 'Não foi possível carregar o cardápio. Tente novamente ou consulte nossa equipe.', 'empty'));
    const retry = element('button', 'Tentar novamente');
    retry.onclick = () => location.reload();
    items.append(retry);
  });
})();
