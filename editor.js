'use strict';
(() => {
  const { key, normalizePrice, validateMenu, loadMenu, element } = UrsaMenu;
  const $ = id => document.getElementById(id);
  const form = $('product-form');
  const store = UrsaDraft.createStore(() => window.localStorage, new URL('.', location.href).pathname);
  let menu;
  let baseline = '';
  let publishedBase = null;
  let publishedMenu = null;
  let pendingDraft = null;
  let persistenceEnabled = false;
  let storageError = false;
  let readBlocked = false;
  let persisted = false;
  let editingId = null;
  let formBaseline = '';
  let publication = null;
  const serialize = () => JSON.stringify(menu);
  const formValues = () => JSON.stringify({ nome: $('name').value, categoria: $('category').value,
    preco: $('price').value, descricao: $('description').value, ativo: $('active').checked,
    consulte: $('consult').checked });
  const formChanged = () => Boolean(menu) && formValues() !== formBaseline;
  const hasChanges = () => Boolean(menu) && (serialize() !== baseline || formChanged() || $('new-category').value !== '');
  const hasLocalWork = () => Boolean(menu) && (serialize() !== JSON.stringify(publishedBase) || formChanged() || $('new-category').value !== '');

  function persist() {
    if (!persistenceEnabled || !menu) return;
    // If a draft could not be read, never overwrite that unknown work.
    if (readBlocked) { storageError = true; persisted = false; return; }
    try {
      if (hasLocalWork() || publication) {
        store.write({ versao: 1, menu, publishedBase, exported: baseline ? JSON.parse(baseline) : null,
          form: { editingId, values: JSON.parse(formValues()), baseline: JSON.parse(formBaseline) },
          newCategory: $('new-category').value, ...(publication ? { publication } : {}) });
      } else store.remove();
      storageError = false;
      persisted = true;
    } catch {
      storageError = true;
      persisted = false;
    }
  }

  function localStatus() {
    if (!persistenceEnabled) return;
    $('local-status').textContent = storageError
      ? 'Não foi possível salvar neste dispositivo. Exporte um backup antes de atualizar ou fechar a página; as últimas alterações podem ser perdidas.'
      : hasLocalWork()
        ? 'Alterações salvas neste dispositivo — publicação pendente'
        : publication ? 'Alterações salvas neste dispositivo — commit confirmado; GitHub Pages pode estar atualizando.'
          : 'Versão publicada carregada. Nenhuma alteração local pendente.';
    $('local-status').setAttribute('role', storageError ? 'alert' : 'status');
    $('local-status').classList.toggle('pending', storageError || hasLocalWork());
  }

  function message(text, error = false) {
    $('message').textContent = text;
    $('message').setAttribute('role', error ? 'alert' : 'status');
  }

  function updateDirty() {
    const changed = hasChanges();
    $('dirty').textContent = changed
      ? 'Há alterações não exportadas. Exporte cardapio.json para ter um backup e publicar.'
      : 'Nenhuma alteração pendente de exportação.';
    $('dirty').classList.toggle('pending', changed);
    persist();
    localStatus();
  }

  function syncPrice() {
    $('price').disabled = $('consult').checked;
    $('price').required = !$('consult').checked;
    $('price').setCustomValidity('');
  }

  function categoryOptions(selected) {
    $('category').replaceChildren();
    if (!menu.categorias.length) {
      const option = element('option', 'Cadastre uma categoria primeiro');
      option.value = '';
      $('category').append(option);
    }
    for (const category of menu.categorias) {
      const option = element('option', category);
      option.value = category;
      $('category').append(option);
    }
    if (menu.categorias.includes(selected)) $('category').value = selected;
  }

  function resetForm(product) {
    editingId = product ? product.id : null;
    form.reset();
    $('form-error').textContent = '';
    $('name').value = product ? product.nome : '';
    categoryOptions(product && product.categoria);
    $('description').value = product ? product.descricao : '';
    $('price').value = product ? product.preco.replace(/^R\$\s*/, '') : '';
    $('consult').checked = Boolean(product && product.preco === '');
    $('active').checked = product ? product.ativo : true;
    syncPrice();
    $('form-title').textContent = product ? 'Editar produto' : 'Novo produto';
    formBaseline = formValues();
    updateDirty();
  }

  function discardForm() {
    return !formChanged() || window.confirm('Descartar a edição do formulário que ainda não foi salva?');
  }

  function action(text, handler, className) {
    const button = element('button', text, className);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function renderProducts() {
    const term = $('search').value.toLocaleLowerCase('pt-BR');
    const products = menu.produtos.filter(product => product.nome.toLocaleLowerCase('pt-BR').includes(term));
    $('count').textContent = `${products.length} de ${menu.produtos.length} produtos · ${menu.produtos.filter(p => p.ativo).length} ativos`;
    $('product-list').replaceChildren();
    for (const category of menu.categorias) {
      const group = products.filter(product => product.categoria === category);
      if (!group.length) continue;
      const section = element('section');
      section.append(element('h3', `${category} (${group.length})`));
      for (const product of group) {
        const article = element('article', undefined, 'product');
        const top = element('div', undefined, 'product-top');
        top.append(element('strong', product.nome), element('span', product.preco || 'Consulte'));
        article.append(top, element('p', product.descricao),
          element('span', product.ativo ? 'Ativo' : 'Pausado', product.ativo ? 'status' : 'status paused'));
        const actions = element('div', undefined, 'actions');
        actions.append(action('Editar', () => {
          if (!discardForm()) return;
          resetForm(product);
          $('name').focus();
          $('form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }), action(product.ativo ? 'Pausar' : 'Ativar', () => {
          product.ativo = !product.ativo;
          // Keep an open form in sync so saving its other fields cannot undo this toggle.
          if (editingId === product.id) {
            const previous = JSON.parse(formBaseline);
            previous.ativo = product.ativo;
            formBaseline = JSON.stringify(previous);
            $('active').checked = product.ativo;
          }
          renderProducts();
          updateDirty();
          message(product.ativo ? 'Produto ativado. Exporte para publicar.' : 'Produto pausado. Exporte para publicar.');
        }), action('Excluir', () => {
          if (!window.confirm(`Excluir “${product.nome}”? Esta ação remove o produto do rascunho local.`)) return;
          menu.produtos = menu.produtos.filter(item => item.id !== product.id);
          if (editingId === product.id) resetForm();
          renderProducts();
          renderCategories();
          updateDirty();
          message('Produto excluído do rascunho local. Exporte para publicar.');
        }, 'danger'));
        article.append(actions);
        section.append(article);
      }
      $('product-list').append(section);
    }
    if (!products.length) $('product-list').append(element('p', 'Nenhum produto encontrado.'));
  }

  function categoryName(value, current) {
    const name = value.trim();
    if (!name) throw new Error('Informe o nome da categoria.');
    if (menu.categorias.some(category => category !== current && key(category) === key(name))) {
      throw new Error('Já existe uma categoria com esse nome.');
    }
    return name;
  }

  function renderCategories() {
    $('category-list').replaceChildren();
    menu.categorias.forEach((category, index) => {
      const li = element('li');
      const count = menu.produtos.filter(product => product.categoria === category).length;
      li.append(element('span', `${category} (${count})`));
      const controls = element('div', undefined, 'actions');
      const move = offset => {
        const target = index + offset;
        [menu.categorias[index], menu.categorias[target]] = [menu.categorias[target], menu.categorias[index]];
        const selected = $('category').value;
        categoryOptions(selected);
        renderProducts();
        renderCategories();
        updateDirty();
      };
      const up = action('↑', () => move(-1));
      up.setAttribute('aria-label', `Mover ${category} para cima`);
      up.disabled = index === 0;
      const down = action('↓', () => move(1));
      down.setAttribute('aria-label', `Mover ${category} para baixo`);
      down.disabled = index === menu.categorias.length - 1;
      const rename = action('Renomear', () => {
        const value = window.prompt('Novo nome da categoria:', category);
        if (value === null) return;
        try {
          const name = categoryName(value, category);
          if (name === category) return;
          if (!discardForm()) return;
          menu.categorias[index] = name;
          for (const product of menu.produtos) if (product.categoria === category) product.categoria = name;
          resetForm();
          renderProducts();
          renderCategories();
          updateDirty();
          message('Categoria renomeada, incluindo seus produtos.');
        } catch (error) { message(error.message, true); }
      });
      const remove = action('Excluir', () => {
        if (count) { message('Mova ou exclua os produtos desta categoria antes de excluí-la.', true); return; }
        if (!window.confirm(`Excluir a categoria vazia “${category}”?`) || !discardForm()) return;
        menu.categorias.splice(index, 1);
        resetForm();
        renderCategories();
        renderProducts();
        updateDirty();
        message('Categoria excluída do rascunho local.');
      }, 'danger');
      controls.append(up, down, rename, remove);
      li.append(controls);
      $('category-list').append(li);
    });
  }

  function saveProduct(announce = true) {
    $('form-error').textContent = '';
    if (!form.reportValidity()) return false;
    try {
      if (!$('name').value.trim()) throw new Error('Informe o nome do produto.');
      const product = { id: editingId || 'produto-' + crypto.randomUUID(),
        nome: $('name').value.trim(), categoria: $('category').value,
        descricao: $('description').value, ativo: $('active').checked,
        preco: $('consult').checked ? '' : normalizePrice($('price').value) };
      const next = { ...menu, produtos: [...menu.produtos] };
      const index = next.produtos.findIndex(item => item.id === product.id);
      if (index < 0) next.produtos.push(product);
      else next.produtos[index] = product;
      menu = validateMenu(next);
      resetForm();
      renderProducts();
      renderCategories();
      if (announce) message(storageError ? 'Produto atualizado, mas o salvamento neste dispositivo falhou. Exporte um backup.' : 'Produto salvo neste dispositivo. Você pode editar outros produtos antes de exportar.');
      return true;
    } catch (error) {
      $('form-error').textContent = error.message;
      return false;
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); saveProduct(); });
  form.addEventListener('input', () => { syncPrice(); updateDirty(); });
  form.addEventListener('change', () => { syncPrice(); updateDirty(); });
  $('new-category').addEventListener('input', updateDirty);
  $('search').addEventListener('input', renderProducts);
  for (const id of ['new-product', 'cancel']) $(id).onclick = () => {
    if (!discardForm()) return;
    resetForm();
    $('name').focus();
  };

  $('category-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const name = categoryName($('new-category').value);
      const changed = formChanged();
      const selected = $('category').value;
      menu.categorias.push(name);
      categoryOptions(selected);
      if (!changed) formBaseline = formValues();
      $('new-category').value = '';
      renderCategories();
      updateDirty();
      message('Categoria cadastrada. Já pode ser usada nos produtos.');
    } catch (error) { message(error.message, true); }
  });

  $('export').onclick = () => {
    if ($('new-category').value !== '') {
      message('Adicione ou limpe a nova categoria antes de exportar.', true);
      $('new-category').focus();
      return;
    }
    if (formChanged() && !saveProduct(false)) {
      message('Corrija os campos do produto antes de exportar.', true);
      return;
    }
    try {
      const valid = validateMenu(menu);
      const blob = new Blob([JSON.stringify(valid, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = element('a');
      link.href = url;
      link.download = 'cardapio.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      baseline = serialize();
      updateDirty();
      message('Download de cardapio.json solicitado. Confira o arquivo nos Downloads. O site público só muda após a publicação no GitHub.');
    } catch (error) { message(error.message, true); }
  };

  $('import').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande. O limite é 5 MB.');
      const imported = validateMenu(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      if (!window.confirm(`Importar ${imported.produtos.length} produtos e ${imported.categorias.length} categorias? Isso substitui o rascunho local, incluindo edições ainda não exportadas.`)) return;
      menu = imported;
      persistenceEnabled = true;
      $('workspace').disabled = false;
      for (const control of $('workspace').querySelectorAll('input,button,select,textarea')) control.disabled = false;
      $('new-category').value = '';
      resetForm();
      renderProducts();
      renderCategories();
      updateDirty();
      message('Arquivo importado e validado. Revise os produtos antes de exportar e publicar.');
    } catch (error) { message('Importação cancelada: ' + error.message + ' Os dados anteriores foram mantidos.', true); }
    finally { event.target.value = ''; }
  });

  window.addEventListener('beforeunload', event => {
    // A persisted draft survives reloads. Warn only when device storage failed.
    if (hasLocalWork() && !persisted || publisher.isPublishing()) { event.preventDefault(); event.returnValue = ''; }
  });

  function activate(data, draft = null) {
    persistenceEnabled = false;
    // Keep the published snapshot immutable while editing products/categories.
    menu = validateMenu(data);
    baseline = draft ? (draft.exported ? JSON.stringify(draft.exported) : '') : serialize();
    $('recovery').hidden = true;
    $('workspace').disabled = false;
    for (const control of $('workspace').querySelectorAll('input,button,select,textarea')) control.disabled = false;
    $('new-category').value = draft ? draft.newCategory : '';
    resetForm();
    if (draft) {
      editingId = draft.form.editingId;
      const values = draft.form.values;
      $('name').value = values.nome;
      categoryOptions(values.categoria);
      $('price').value = values.preco;
      $('description').value = values.descricao;
      $('active').checked = values.ativo;
      $('consult').checked = values.consulte;
      $('form-title').textContent = editingId ? 'Editar produto' : 'Novo produto';
      formBaseline = JSON.stringify(draft.form.baseline);
      syncPrice();
    }
    renderProducts();
    renderCategories();
    persistenceEnabled = true;
    updateDirty();
  }

  function recovery(draft, text, canLoadPublished) {
    pendingDraft = draft;
    persistenceEnabled = false;
    $('workspace').disabled = true;
    $('recovery').hidden = false;
    $('recovery-message').textContent = text;
    $('recover-draft').disabled = !draft;
    $('load-published').disabled = !canLoadPublished;
    $('local-status').textContent = 'O rascunho local foi preservado. Escolha como continuar.';
    message('Escolha entre o rascunho deste dispositivo e a versão publicada.');
  }

  $('recover-draft').onclick = () => {
    if (!pendingDraft) return;
    // Acknowledge this published version so the same conflict is not asked on every reload.
    publishedBase = publication ? pendingDraft.publishedBase : publishedMenu || pendingDraft.publishedBase;
    activate(pendingDraft.menu, pendingDraft);
    pendingDraft = null;
    message('Rascunho recuperado. A versão publicada não foi alterada. Revise antes de exportar.');
  };

  function usePublished(data) {
    try { store.remove(); }
    catch { message('Não foi possível descartar o rascunho neste dispositivo. Os dados foram mantidos.', true); return; }
    publishedMenu = data;
    publishedBase = data;
    readBlocked = false;
    publication = null;
    pendingDraft = null;
    $('search').value = '';
    activate(data);
    message('Alterações locais descartadas. Versão publicada carregada.');
  }

  $('load-published').onclick = () => {
    if (publishedMenu && window.confirm('Descartar o rascunho salvo neste dispositivo e carregar a versão publicada? Esta ação não pode ser desfeita.')) {
      usePublished(publishedMenu);
    }
  };

  $('discard-local').onclick = async () => {
    if (!window.confirm('Descartar todas as alterações locais, incluindo formulários e alterações já exportadas, e carregar a versão publicada? Esta ação não pode ser desfeita.')) return;
    $('workspace').disabled = true;
    try { usePublished(await loadMenu()); }
    catch { message('Não foi possível carregar a versão publicada. O rascunho local foi mantido. Tente novamente com conexão.', true); }
    finally { $('workspace').disabled = false; }
  };

  async function initialize() {
    let draft = null;
    let readFailed = false;
    try { draft = store.read(); }
    catch (error) {
      readFailed = error.name === 'DraftFormatError';
      readBlocked = !readFailed;
    }
    try { publishedMenu = await loadMenu(); }
    catch { publishedMenu = null; }

    if (readFailed) {
      recovery(null, 'Não foi possível ler o rascunho deste dispositivo. Ele não foi sobrescrito. Você pode tentar reabrir esta página ou descartar o rascunho e carregar a versão publicada.', Boolean(publishedMenu));
      return;
    }
    if (draft) {
      publication = draft.publication || null;
      if (publication && publishedMenu && JSON.stringify(publishedMenu) === JSON.stringify(draft.publishedBase)) publication = null;
      if (publishedMenu && JSON.stringify(publishedMenu) !== JSON.stringify(draft.publishedBase)) {
        recovery(draft, publication
          ? 'Um commit já foi confirmado, mas o site ainda exibe outra versão. O GitHub Pages pode estar atualizando. Recupere seu rascunho para manter os dados do commit ou escolha carregar a versão exibida no site.'
          : 'Há uma nova versão de cardapio.json no site. Seu rascunho não foi sobrescrito. Recupere seu trabalho ou escolha carregar a versão publicada, descartando o rascunho local.', true);
        return;
      }
      publishedBase = draft.publishedBase;
      activate(draft.menu, draft);
      message(publishedMenu ? 'Rascunho recuperado automaticamente deste dispositivo.' : 'Rascunho recuperado deste dispositivo. Não foi possível verificar a versão publicada; tente novamente com conexão.');
      return;
    }
    if (publishedMenu) {
      publishedBase = publishedMenu;
      activate(publishedMenu);
      message(readBlocked
        ? 'Não foi possível ler o armazenamento deste dispositivo. Você pode editar e exportar um backup, mas o salvamento automático está indisponível.'
        : 'Cardápio carregado. As alterações são salvas neste dispositivo e não são publicadas automaticamente.', readBlocked);
      return;
    }
    $('workspace').disabled = false;
    for (const control of $('workspace').querySelectorAll('input,button,select,textarea')) control.disabled = control.id !== 'import';
    $('local-status').textContent = readBlocked ? 'Não foi possível ler o armazenamento deste dispositivo. Importe um backup para editar e exportar.' : 'Nenhum rascunho encontrado neste dispositivo.';
    message('Não foi possível carregar cardapio.json. Recarregue a página ou importe um arquivo válido. Para abrir no computador, use um servidor local conforme o README.', true);
  }
  const publisher = UrsaPublish.create({
    prepare() {
      if (!menu || $('workspace').disabled || !publishedBase) { message('Carregue ou recupere um cardápio antes de publicar.', true); return null; }
      if ($('new-category').value !== '') { message('Adicione ou limpe a nova categoria antes de publicar.', true); return null; }
      if (formChanged() && !saveProduct(false)) { message('Corrija os campos do produto antes de publicar.', true); return null; }
      return { menu: validateMenu(menu), baseMenu: validateMenu(publishedBase) };
    },
    conflict(data) {
      try {
        const latest = validateMenu(data);
        // Capture current memory too, even if localStorage is temporarily unavailable.
        const draft = { versao: 1, menu: validateMenu(menu), publishedBase, exported: baseline ? JSON.parse(baseline) : null,
          form: { editingId, values: JSON.parse(formValues()), baseline: JSON.parse(formBaseline) },
          newCategory: $('new-category').value };
        publishedMenu = latest;
        publication = null;
        recovery(draft, 'O cardápio em main mudou. Recupere seu rascunho para revisá-lo sobre a nova versão, ou carregue a versão atual do GitHub. Nada foi publicado.', true);
        $('recovery').scrollIntoView({ behavior: 'smooth' });
      } catch { message('Não foi possível abrir a versão remota. O rascunho foi mantido.', true); }
    },
    published(sent, result) {
      if (!result || !/^[a-f0-9]{40}$/.test(result.sha || '') || (!result.unchanged && !/^[a-f0-9]{40}$/.test(result.commit || ''))) {
        message('A confirmação do GitHub está incompleta. O rascunho foi mantido; verifique o histórico.', true); return;
      }
      publishedBase = validateMenu(sent);
      publishedMenu = validateMenu(sent);
      baseline = JSON.stringify(sent);
      publication = { sha: result.sha, commit: result.commit || null };
      updateDirty();
      message(result.unchanged ? 'Este cardápio já está no GitHub. O GitHub Pages pode estar atualizando.' : `Commit ${result.commit.slice(0, 7)} criado. O GitHub Pages ainda poderá estar atualizando.`);
    }
  });
  initialize();
})();
