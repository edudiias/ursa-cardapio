const fs = require('node:fs/promises');
const path = require('node:path');
const source = require('../cardapio.json');
const backend = 'https://publish.example.test';
const editor = 'https://edudiias.github.io';
const contents = 'https://api.github.com/repos/edudiias/ursa-cardapio/contents/cardapio.json';

async function fixture() {
  const { createHandler, AuthStore } = await import('../backend/worker.mjs');
  const entries = new Map();
  let alarm = null;
  let queue = Promise.resolve();
  const storage = {
    get: async key => entries.get(key), put: async (key, value) => entries.set(key, structuredClone(value)),
    delete: async key => entries.delete(key), list: async () => new Map(entries),
    getAlarm: async () => alarm, setAlarm: async value => { alarm = value; },
    transaction(callback) {
      const result = queue.then(() => callback(storage));
      queue = result.catch(() => {});
      return result;
    }
  };
  const authStore = new AuthStore({ storage });
  const state = { entries, authStore, storage, calls: [], now: Date.now(), identity: { login: 'edudiias', id: 175474516 },
    tokenValid: true, fileSha: 'a'.repeat(40), menu: structuredClone(source), writeStatus: 200, writes: 0 };
  const env = { BACKEND_ORIGIN: backend, EDITOR_ORIGIN: editor, GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret',
    SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), PUBLISH_ENABLED: 'true',
    AUTH_STORE: { idFromName: name => name, get: () => ({ fetch: (url, options) => authStore.fetch(new Request(url, options)) }) },
    ASSETS: { async fetch(req) {
      const file = path.basename(new URL(req.url).pathname);
      const content = await fs.readFile(path.join(__dirname, '../backend/public', file));
      return new Response(content, { headers: { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' } });
    } }
  };
  const transport = async (url, options) => {
    state.calls.push({ url, ...options });
    if (state.networkFail) throw new Error('Test network unavailable');
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'test-user-token', token_type: 'bearer', expires_in: 28800 });
    if (url === 'https://api.github.com/user') return state.tokenValid ? Response.json(state.identity) : Response.json({}, { status: 401 });
    if (url === contents + '?ref=main') return Response.json({ type: 'file', path: 'cardapio.json', sha: state.fileSha,
      encoding: 'base64', content: Buffer.from(JSON.stringify(state.menu)).toString('base64') });
    if (url === contents && options.method === 'PUT') {
      if (state.beforeWrite) await state.beforeWrite();
      state.writes++;
      if (state.writeStatus !== 200) return Response.json({}, { status: state.writeStatus });
      const body = JSON.parse(options.body);
      if (body.sha !== state.fileSha) return Response.json({}, { status: 409 });
      state.menu = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      state.fileSha = 'b'.repeat(40);
      return Response.json({ content: { sha: state.fileSha }, commit: { sha: 'c'.repeat(40) } });
    }
    throw new Error('Unexpected external request in test: ' + url);
  };
  const handler = createHandler(transport, () => state.now);
  const request = (pathname, options = {}) => handler(new Request(backend + pathname, options), env);
  async function authenticate() {
    const start = await request('/auth/login');
    const authorization = new URL(start.headers.get('Location'));
    const stateValue = authorization.searchParams.get('state');
    const callback = await request('/auth/callback?code=test-code&state=' + stateValue, { headers: { Cookie: '__Host-ursa_oauth=' + stateValue } });
    const sessionCookie = callback.headers.getSetCookie().find(cookie => cookie.startsWith('__Host-ursa_session='))?.split(';')[0];
    const session = sessionCookie ? await request('/api/session', { headers: { Cookie: sessionCookie, Origin: backend } }) : null;
    return { start, authorization, stateValue, callback, cookie: sessionCookie, session: session ? await session.json() : null };
  }
  const publish = (auth, body, headers = {}) => request('/api/publish', { method: 'POST', headers: { Cookie: auth.cookie,
    Origin: backend, 'X-CSRF-Token': auth.session.csrf, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { env, state, request, handler, authenticate, publish, backend, editor };
}
module.exports = { fixture, backend, editor };
