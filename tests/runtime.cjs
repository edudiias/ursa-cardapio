const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const fromWrangler = createRequire(realpathSync(require.resolve('wrangler/package.json')));
const { Miniflare, convertV4MiniflareOptions } = fromWrangler('miniflare');

test('Worker compilado executa no workerd com Durable Object SQLite real, sem rede GitHub', { timeout: 60000 }, async () => {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: path.resolve(__dirname, '../test-results/worker-build/worker.js'),
    compatibilityDate: '2026-10-30',
    durableObjects: { AUTH_STORE: { className: 'AuthStore', useSQLite: true } },
    bindings: { BACKEND_ORIGIN: 'https://publish.example.test', EDITOR_ORIGIN: 'https://edudiias.github.io',
      GITHUB_CLIENT_ID: 'runtime-test', GITHUB_CLIENT_SECRET: 'runtime-test-secret',
      SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'), PUBLISH_ENABLED: 'false' },
    outboundService: () => { throw new Error('Rede externa proibida neste teste'); }
  }));
  try {
    const login = await runtime.dispatchFetch('https://publish.example.test/auth/login', { redirect: 'manual' });
    assert.equal(login.status, 302);
    const authorization = new URL(login.headers.get('Location'));
    const state = authorization.searchParams.get('state');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    const callback = 'https://publish.example.test/auth/callback?state=' + state + '&error=access_denied';
    const headers = { Cookie: '__Host-ursa_oauth=' + state };
    const denied = await runtime.dispatchFetch(callback, { headers });
    assert.equal(denied.status, 400);
    assert.match(await denied.text(), /não foi concluída/);
    const replay = await runtime.dispatchFetch(callback, { headers });
    assert.equal(replay.status, 400);
    assert.match(await replay.text(), /já utilizada ou expirada/);
    const session = await runtime.dispatchFetch('https://publish.example.test/api/session');
    assert.equal(session.status, 401);
  } finally { await runtime.dispose(); }
});
