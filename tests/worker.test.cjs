const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, backend, editor } = require('./worker-fixture.cjs');

test('OAuth usa state descartável, PKCE S256 e cookie seguro; token nunca vai ao cliente', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  assert.equal(auth.start.status, 302);
  assert.equal(auth.authorization.origin, 'https://github.com');
  assert.equal(auth.authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.authorization.searchParams.has('scope'), false);
  assert.equal(auth.authorization.searchParams.get('redirect_uri'), backend + '/auth/callback');
  const exchange = f.state.calls.find(call => call.url.endsWith('/access_token'));
  const params = new URLSearchParams(exchange.body);
  assert.equal(params.get('client_secret'), 'test-secret');
  assert.equal(params.get('code_verifier').length, 43);
  assert.equal(auth.callback.status, 302);
  assert.equal(auth.callback.headers.get('Location'), backend + '/publish');
  const cookie = auth.callback.headers.getSetCookie().find(cookie => cookie.startsWith('__Host-ursa_session='));
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=3600']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes('Domain='));
  assert.equal(auth.session.authenticated, true);
  assert.equal(auth.session.login, 'edudiias');
  assert.ok(!JSON.stringify(auth.session).includes('test-user-token'));
  assert.ok(!JSON.stringify([...f.state.entries.values()]).includes('test-user-token'), 'token deve estar criptografado no backend');
  const replay = await f.request('/auth/callback?code=test-code&state=' + auth.stateValue, { headers: { Cookie: '__Host-ursa_oauth=' + auth.stateValue } });
  assert.equal(replay.status, 400);
});

test('OAuth rejeita state ausente, cookie trocado, expiração, autorização negada e outro usuário', async () => {
  for (const scenario of ['missing', 'mismatch', 'expired', 'denied', 'other-user']) {
    const f = await fixture();
    const start = await f.request('/auth/login');
    const state = new URL(start.headers.get('Location')).searchParams.get('state');
    if (scenario === 'expired') f.state.now += 601000;
    if (scenario === 'other-user') f.state.identity = { login: 'intruso', id: 1 };
    const result = await f.request('/auth/callback?code=test-code' + (scenario === 'missing' ? '' : '&state=' + state) + (scenario === 'denied' ? '&error=access_denied' : ''), {
      headers: { Cookie: '__Host-ursa_oauth=' + (scenario === 'mismatch' ? 'x'.repeat(43) : state) }
    });
    assert.equal(result.status, scenario === 'other-user' ? 403 : 400);
    assert.equal([...f.state.entries.keys()].filter(key => key.startsWith('session:')).length, 0);
  }
});

test('sessão ausente/expirada e revogação de token impedem publicar', async () => {
  const f = await fixture();
  assert.equal((await f.request('/api/session')).status, 401);
  const auth = await f.authenticate();
  f.state.now += 3600001;
  assert.equal((await f.publish(auth, { menu: f.state.menu, sha: f.state.fileSha })).status, 401);
  f.state.now -= 3600001;
  f.state.tokenValid = false;
  assert.equal((await f.publish(auth, { menu: f.state.menu, sha: f.state.fileSha })).status, 401);
  assert.equal(f.state.writes, 0);
});

test('cada publicação revalida login e ID no servidor, mesmo com sessão previamente autorizada', async () => {
  for (const user of [{ login: 'edudiias', id: 999 }, { login: 'outro', id: 175474516 }]) {
    const f = await fixture();
    const auth = await f.authenticate();
    f.state.identity = user;
    const result = await f.publish(auth, { menu: f.state.menu, sha: f.state.fileSha });
    assert.equal(result.status, 403);
    assert.equal(f.state.writes, 0);
  }
});

test('CSRF e origem estrita protegem publicação e logout; CORS nunca usa wildcard', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  for (const headers of [{ Origin: 'https://evil.test' }, { Origin: 'null' }, { Origin: '' }, { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'wrong' }]) {
    assert.equal((await f.publish(auth, { menu: f.state.menu, sha: f.state.fileSha }, headers)).status, 403);
  }
  const cors = await f.request('/api/session', { headers: { Origin: editor, Cookie: auth.cookie } });
  assert.equal(cors.headers.get('Access-Control-Allow-Origin'), editor);
  assert.equal(cors.headers.get('Access-Control-Allow-Credentials'), 'true');
  const denied = await f.request('/api/session', { headers: { Origin: 'https://evil.test', Cookie: auth.cookie } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  const logout = await f.request('/api/logout', { method: 'POST', headers: { Origin: backend, Cookie: auth.cookie } });
  assert.equal(logout.status, 403);
  assert.equal(f.state.writes, 0);
});

test('publicação valida JSON e limita exclusivamente repo, arquivo e main; commit contém SHA atual', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  const menu = structuredClone(f.state.menu);
  menu.produtos[0].preco = 'R$ 39,90';
  const response = await f.publish(auth, { menu, sha: f.state.fileSha });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.commit, 'c'.repeat(40));
  assert.equal(result.pagesUpdating, true);
  const write = f.state.calls.find(call => call.method === 'PUT');
  assert.equal(write.url, 'https://api.github.com/repos/edudiias/ursa-cardapio/contents/cardapio.json');
  const sent = JSON.parse(write.body);
  assert.deepEqual(Object.keys(sent).sort(), ['branch', 'content', 'message', 'sha']);
  assert.equal(sent.branch, 'main');
  assert.equal(sent.sha, 'a'.repeat(40));
  assert.match(sent.message, /Atualiza cardápio do Ursa Bar pelo editor/);
  assert.deepEqual(JSON.parse(Buffer.from(sent.content, 'base64').toString('utf8')), menu);
  assert.equal(f.state.writes, 1);
});

test('SHA antigo e corrida no PUT retornam conflito sem tentar forçar atualização', async () => {
  for (const duringPut of [false, true]) {
    const f = await fixture();
    const auth = await f.authenticate();
    const menu = structuredClone(f.state.menu);
    menu.produtos[0].preco = 'R$ 19,50';
    if (duringPut) f.state.writeStatus = 409;
    else f.state.fileSha = 'd'.repeat(40);
    const result = await f.publish(auth, { menu, sha: 'a'.repeat(40) });
    assert.equal(result.status, 409);
    assert.equal((await result.json()).error, 'conflict');
    assert.equal(f.state.writes, duringPut ? 1 : 0);
    assert.equal(f.state.menu.produtos[0].preco, 'R$ 18,00');
  }
});

test('JSON inválido, parâmetros de outros arquivos, Content-Type errado e excesso de tamanho são rejeitados', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  const bad = structuredClone(f.state.menu);
  bad.produtos[0].preco = '-2';
  for (const body of [{ menu: bad, sha: f.state.fileSha }, { menu: f.state.menu, sha: f.state.fileSha, path: 'index.html' },
    { menu: f.state.menu, sha: f.state.fileSha, branch: 'outra' }, { menu: f.state.menu, sha: 'wrong' }]) {
    assert.equal((await f.publish(auth, body)).status, 400);
  }
  assert.equal((await f.publish(auth, {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.publish(auth, { menu: 'x'.repeat(513 * 1024), sha: f.state.fileSha })).status, 413);
  assert.equal(f.state.writes, 0);
});

test('falhas, permissões recusadas e chave de publicação desabilitada não produzem sucesso', async () => {
  for (const scenario of ['network', 'permission', 'disabled']) {
    const f = await fixture();
    const auth = await f.authenticate();
    const menu = structuredClone(f.state.menu);
    menu.produtos[0].preco = 'R$ 29,50';
    if (scenario === 'network') f.state.networkFail = true;
    if (scenario === 'permission') f.state.writeStatus = 403;
    if (scenario === 'disabled') f.env.PUBLISH_ENABLED = 'false';
    const result = await f.publish(auth, { menu, sha: f.state.fileSha });
    assert.equal(result.status, scenario === 'disabled' ? 503 : 502);
    assert.ok(!(await result.text()).includes('test-user-token'));
    assert.equal(f.state.menu.produtos[0].preco, 'R$ 18,00');
  }
});

test('logout invalida a sessão imediatamente e alarmes removem estados expirados', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  const result = await f.request('/api/logout', { method: 'POST', headers: { Cookie: auth.cookie, Origin: backend, 'X-CSRF-Token': auth.session.csrf, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await f.request('/api/session', { headers: { Cookie: auth.cookie } })).status, 401);
  await f.state.storage.put('oauth:' + 'x'.repeat(43), { expires: Date.now() - 1 });
  await f.state.authStore.alarm();
  assert.equal(f.state.entries.size, 0);
});

test('conteúdo idêntico não cria commit duplicado e rotas arbitrárias não expõem assets', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  const response = await f.publish(auth, { menu: f.state.menu, sha: f.state.fileSha });
  assert.equal((await response.json()).unchanged, true);
  assert.equal(f.state.writes, 0);
  for (const path of ['/worker.mjs', '/.dev.vars', '/publisher.html', '/api/files/index.html']) assert.equal((await f.request(path, { headers: { Cookie: auth.cookie } })).status, 404);
  const html = await f.request('/publish');
  assert.match(html.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(html.headers.get('Cache-Control'), 'no-store');
});

test('state OAuth é consumido apenas uma vez mesmo em callbacks concorrentes', async () => {
  const f = await fixture();
  const start = await f.request('/auth/login');
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const responses = await Promise.all([1, 2].map(() => f.request('/auth/callback?code=test-code&state=' + state, {
    headers: { Cookie: '__Host-ursa_oauth=' + state }
  })));
  assert.deepEqual(responses.map(response => response.status).sort(), [302, 400]);
  assert.equal(f.state.calls.filter(call => call.url.endsWith('/access_token')).length, 1);
});

test('rotação da chave invalida sessões antigas sem expor dados de criptografia', async () => {
  const f = await fixture();
  const auth = await f.authenticate();
  f.env.SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  const result = await f.request('/api/session', { headers: { Cookie: auth.cookie } });
  assert.equal(result.status, 401);
  assert.equal((await result.json()).error, 'session_expired');
});
