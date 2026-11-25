'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const editorOrigin = window.UrsaPublisherConfig.editorOrigin;
  const opener = window.opener;
  let channel = new URLSearchParams(location.hash.slice(1)).get('channel');
  try {
    if (channel) sessionStorage.setItem('ursa-publish-channel', channel);
    else channel = sessionStorage.getItem('ursa-publish-channel');
  } catch { /* Reopening from the editor also reconnects without this convenience. */ }
  let session = null;
  let incoming = null;
  let remote = null;
  let busy = false;
  let received = false;
  let committed = false;
  function send(type, data = {}) {
    if (opener && channel) opener.postMessage({ type, channel, ...data }, editorOrigin);
  }
  function status(text) { $('status').textContent = text; }
  function authExpired() {
    session = null;
    $('identity').textContent = 'Sessão encerrada ou expirada.';
    $('login').hidden = false;
    $('confirm').hidden = true;
    $('logout').hidden = true;
    send('ursa:session', { authenticated: false });
  }
  async function api(path, body) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(20000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || data.error === 'unauthorized_user') authExpired();
      throw Object.assign(new Error(data.message || 'Falha no serviço de publicação.'), { code: data.error });
    }
    return data;
  }
  async function prepare() {
    if (!session || !incoming || busy || committed) return;
    if (incoming.intent === 'logout') { await logout(); return; }
    if (incoming.intent !== 'publish') { status('Autenticação confirmada. Volte ao editor para publicar.'); return; }
    busy = true;
    try {
      status('Consultando a versão atual no GitHub…');
      remote = await api('/api/menu');
      if (JSON.stringify(remote.menu) !== JSON.stringify(incoming.baseMenu) && JSON.stringify(remote.menu) !== JSON.stringify(incoming.menu)) {
        status('Conflito: o arquivo no GitHub mudou desde a versão usada no editor. Revise as diferenças antes de publicar. Nenhuma alteração foi enviada.');
        $('review').hidden = false;
        send('ursa:state', { state: 'conflict', message: 'O cardápio mudou no GitHub. Use a janela de publicação para revisar a versão remota. Seu rascunho foi preservado.' });
        return;
      }
      $('preview').textContent = `${incoming.menu.produtos.length} produtos em ${incoming.menu.categorias.length} categorias. Confirme para criar um commit e atualizar o cardápio dos clientes.`;
      $('confirm').hidden = false;
      status('Pronto para publicar. Confira o cardápio no editor antes de confirmar.');
      send('ursa:state', { state: 'confirming', message: 'Aguardando sua confirmação na janela de publicação.' });
    } catch (error) { status(error.message); send('ursa:state', { state: 'error', message: error.message }); }
    finally { busy = false; }
  }
  async function logout() {
    if (!session || busy) return;
    busy = true;
    try { await api('/api/logout', {}); authExpired(); status('Sessão encerrada. O rascunho local não foi apagado.'); }
    catch (error) { status(error.message); }
    finally { busy = false; }
  }
  $('logout').onclick = logout;
  $('review').onclick = () => {
    if (!remote) return;
    send('ursa:conflict', { menu: remote.menu });
    status('Volte ao editor para escolher entre recuperar seu rascunho e carregar a versão do GitHub.');
  };
  $('confirm').onclick = async () => {
    if (!session || !incoming || !remote || busy || committed) return;
    busy = true;
    $('confirm').disabled = true;
    $('logout').disabled = true;
    status('Publicando no GitHub…');
    send('ursa:state', { state: 'publishing', message: 'Publicando no GitHub. Aguarde a confirmação do commit.' });
    try {
      const result = await api('/api/publish', { menu: incoming.menu, sha: remote.sha });
      committed = true;
      $('confirm').hidden = true;
      const text = result.unchanged ? 'O GitHub já contém este cardápio. Nenhum novo commit foi necessário.'
        : `Commit ${result.commit.slice(0, 7)} criado. O GitHub Pages ainda poderá estar atualizando.`;
      status(text);
      if (result.commitUrl) {
        const link = document.createElement('a');
        link.href = result.commitUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Ver commit no GitHub';
        $('result').replaceChildren(link);
      }
      send('ursa:published', { result, menu: incoming.menu });
    } catch (error) {
      status(error.message + ' Seu rascunho continua salvo no editor.');
      send('ursa:state', { state: error.code === 'conflict' ? 'conflict' : 'error', message: error.message });
      if (error.code === 'conflict') {
        try { remote = await api('/api/menu'); $('review').hidden = false; } catch { /* Keep original error visible. */ }
        $('confirm').hidden = true;
      }
    } finally { busy = false; $('confirm').disabled = false; $('logout').disabled = false; }
  };
  window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('message', event => {
    if (event.origin !== editorOrigin || event.source !== opener || received || !channel || event.data?.channel !== channel || event.data?.type !== 'ursa:prepare') return;
    const data = event.data;
    if (!['login', 'publish', 'logout'].includes(data.intent)) return;
    if (data.intent === 'publish' && (!data.menu || !data.baseMenu)) return;
    received = true;
    incoming = data;
    prepare();
  });
  async function initialize() {
    try {
      session = await api('/api/session');
      $('identity').textContent = 'Autenticado como ' + session.login;
      $('logout').hidden = false;
      send('ursa:session', { authenticated: true, login: session.login });
      if (!opener || !channel) status('Autenticação concluída. Volte ao editor e clique novamente em “Entrar com GitHub” para conectar esta janela.');
      else { status('Autenticado. Aguardando o editor…'); send('ursa:ready'); await prepare(); }
    } catch (error) {
      authExpired();
      status('Entre com GitHub nesta janela. Depois da autorização, volte ao editor e clique novamente em “Entrar com GitHub”. Nenhum rascunho será perdido.');
      if (error.code !== 'session_expired') status(error.message + ' Use a exportação manual se necessário.');
    }
  }
  initialize();
})();
