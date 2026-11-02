'use strict';
window.UrsaPublish = (() => {
  function create(callbacks) {
    const $ = id => document.getElementById(id);
    let origin = '';
    try {
      const configured = window.UrsaPublishConfig?.backendOrigin;
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' && parsed.origin === configured) origin = configured;
    } catch { /* Manual export remains available before account setup. */ }
    let authenticated = false;
    let pending = null;
    let publishing = false;
    function status(text) { $('publish-status').textContent = text; }
    function buttons() {
      $('github-login').disabled = !origin || publishing;
      $('github-logout').disabled = !origin || !authenticated || publishing;
      $('publish').disabled = !origin || !authenticated || publishing;
    }
    function open(intent) {
      if (!origin || publishing) return;
      let snapshot;
      if (intent === 'publish') {
        snapshot = callbacks.prepare();
        if (!snapshot) return;
      }
      const channel = crypto.randomUUID();
      const popup = window.open(origin + '/publish#channel=' + encodeURIComponent(channel), 'ursa-publicacao', 'popup,width=620,height=760');
      if (!popup) { status('A janela de publicação foi bloqueada. Permita pop-ups para este site ou use a exportação manual.'); return; }
      pending = { popup, channel, intent, snapshot, sent: false };
      status(intent === 'publish' ? 'Confira e confirme a publicação na janela segura.' : 'Verifique a autenticação na janela segura do GitHub.');
    }
    $('github-login').onclick = () => open('login');
    $('github-logout').onclick = () => open('logout');
    $('publish').onclick = () => open('publish');
    setInterval(() => {
      if (pending?.popup.closed) {
        if (publishing) status('A janela foi fechada antes da confirmação. O rascunho foi mantido. Confira o histórico do GitHub antes de tentar novamente.');
        publishing = false;
        pending = null;
        buttons();
      }
    }, 1000);
    window.addEventListener('message', event => {
      if (!pending || event.origin !== origin || event.source !== pending.popup || event.data?.channel !== pending.channel) return;
      const data = event.data;
      if (data.type === 'ursa:ready' && !pending.sent) {
        pending.sent = true;
        pending.popup.postMessage({ type: 'ursa:prepare', channel: pending.channel, intent: pending.intent, ...pending.snapshot }, origin);
      } else if (data.type === 'ursa:session') {
        authenticated = data.authenticated === true && data.login === 'edudiias';
        $('auth-status').textContent = authenticated ? 'Autenticado como edudiias.' : 'Sessão encerrada ou expirada. Entre com GitHub para publicar.';
        buttons();
      } else if (data.type === 'ursa:state') {
        publishing = data.state === 'publishing';
        status(String(data.message || ''));
        buttons();
      } else if (data.type === 'ursa:conflict' && pending.intent === 'publish') {
        publishing = false;
        callbacks.conflict(data.menu);
        buttons();
      } else if (data.type === 'ursa:published' && pending.intent === 'publish' && pending.sent) {
        publishing = false;
        if (!data.result || !/^[a-f0-9]{40}$/.test(data.result.sha || '') ||
          !data.result.unchanged && !/^[a-f0-9]{40}$/.test(data.result.commit || '')) {
          status('A confirmação está incompleta. O rascunho foi mantido; confira o histórico do GitHub.');
          buttons();
          return;
        }
        // Use the exact snapshot sent by this editor, never arbitrary returned menu data.
        callbacks.published(pending.snapshot.menu, data.result);
        status(data.result.unchanged ? 'O GitHub já contém este cardápio. Nenhum novo commit foi necessário.' :
          `Commit ${String(data.result.commit).slice(0, 7)} criado. O GitHub Pages ainda poderá estar atualizando.`);
        pending = null;
        buttons();
      }
    });
    $('auth-status').textContent = origin ? 'Autenticação ainda não verificada. Use “Entrar com GitHub”.' : 'Publicação direta ainda não configurada. A exportação manual continua disponível.';
    status(origin ? 'Somente edudiias pode publicar. O rascunho local será preservado se ocorrer uma falha.' : 'Configure o backend conforme o README para habilitar a publicação direta.');
    buttons();
    return { isPublishing: () => publishing };
  }
  return { create };
})();
