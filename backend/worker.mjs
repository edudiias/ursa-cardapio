import menuData from '../menu-data.js';

const { validateMenu } = menuData;
const REPO = 'edudiias/ursa-cardapio';
const FILE = 'cardapio.json';
const BRANCH = 'main';
const LOGIN = 'edudiias';
const USER_ID = 175474516;
const SESSION = '__Host-ursa_session';
const OAUTH = '__Host-ursa_oauth';
const CONTENTS = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
const MAX_BODY = 512 * 1024;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const fail = (status, code, text) => { throw new HttpError(status, code, text); };
const json = (body, status = 200) => Response.json(body, { status });
const random = () => b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function b64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
const unb64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
const hash = async text => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = encoder.encode(a), y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function cookie(req, name) {
  const values = (req.headers.get('Cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
const setCookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function config(env) {
  const backend = new URL(env.BACKEND_ORIGIN);
  const editor = new URL(env.EDITOR_ORIGIN);
  if (backend.protocol !== 'https:' || editor.protocol !== 'https:' || backend.origin !== env.BACKEND_ORIGIN ||
    editor.origin !== env.EDITOR_ORIGIN || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_ENCRYPTION_KEY || !env.AUTH_STORE) {
    fail(503, 'configuration', 'O serviço de publicação ainda não foi configurado. Use a exportação manual.');
  }
  return { backend: backend.origin, editor: editor.origin };
}
async function cryptKey(env) {
  const bytes = unb64(env.SESSION_ENCRYPTION_KEY);
  if (bytes.length !== 32) throw new Error('Invalid encryption key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(token, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('ursa-session-v1') }, await cryptKey(env), encoder.encode(token));
  return { iv: b64(iv), data: b64(new Uint8Array(encrypted)) };
}
async function unseal(value, env) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(value.iv), additionalData: encoder.encode('ursa-session-v1') },
    await cryptKey(env), unb64(value.data)));
}
async function store(env, op, key, value) {
  const stub = env.AUTH_STORE.get(env.AUTH_STORE.idFromName('ursa-auth-v1'));
  const response = await stub.fetch('https://auth.internal/', { method: 'POST', body: JSON.stringify({ op, key, value }) });
  if (!response.ok) throw new Error('Session storage unavailable');
  return response.json();
}
async function requestJson(req) {
  if (req.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'content_type', 'Envie JSON.');
  const reader = req.body?.getReader();
  if (!reader) fail(400, 'invalid_json', 'Corpo JSON obrigatório.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); fail(413, 'too_large', 'O limite de publicação é 512 KB. Exporte para revisar o arquivo.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(400, 'invalid_json', 'O JSON é inválido.'); }
}
function publicationMenu(data) {
  let menu;
  try { menu = validateMenu(data); }
  catch { fail(400, 'invalid_menu', 'Cardápio inválido. Confira categorias, nomes, preços e status.'); }
  if (menu.categorias.length > 100 || menu.produtos.length > 2000 || menu.categorias.some(c => c.length > 100) ||
    menu.produtos.some(p => p.id.length > 128 || p.nome.length > 200 || p.descricao.length > 5000)) {
    fail(400, 'invalid_menu', 'O cardápio excede os limites de categorias, produtos ou tamanho dos campos.');
  }
  return menu;
}

// The injectable transport is used only by isolated tests; production always uses fetch.
export function createHandler(transport = fetch, now = () => Date.now()) {
  async function github(url, token, options = {}) {
    let response;
    try {
      response = await transport(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
        Accept: 'application/vnd.github+json', 'User-Agent': 'Ursa-Cardapio-Publisher/1.1',
        'X-GitHub-Api-Version': '2026-03-10', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers
      } });
    } catch { fail(502, 'github_unavailable', 'Não foi possível confirmar a resposta do GitHub. O rascunho foi mantido. Verifique o histórico antes de tentar novamente.'); }
    return response;
  }
  async function identity(token) {
    const response = await github('https://api.github.com/user', token);
    if (response.status === 401) fail(401, 'session_expired', 'A sessão expirou ou foi revogada. Entre novamente com GitHub.');
    if (!response.ok) fail(502, 'github_unavailable', 'Não foi possível verificar sua identidade no GitHub.');
    const user = await response.json();
    if (user.login !== LOGIN || user.id !== USER_ID) fail(403, 'unauthorized_user', 'Somente edudiias pode publicar este cardápio.');
    return user;
  }
  async function session(req, env) {
    const id = cookie(req, SESSION);
    if (!/^[\w-]{43}$/.test(id)) fail(401, 'session_expired', 'Entre com GitHub para publicar.');
    const key = 'session:' + await hash(id);
    const saved = await store(env, 'get', key);
    if (!saved || saved.expires <= now() || saved.login !== LOGIN || saved.userId !== USER_ID) {
      fail(401, 'session_expired', 'A sessão expirou. Entre novamente com GitHub.');
    }
    let token;
    try { token = await unseal(saved.token, env); }
    catch { fail(401, 'session_expired', 'A sessão não é mais válida. Entre novamente com GitHub.'); }
    return { ...saved, key, token };
  }
  async function remote(token) {
    const response = await github(CONTENTS + '?ref=main', token);
    if (response.status === 401) fail(401, 'session_expired', 'Sua autorização expirou. Entre novamente com GitHub.');
    if (!response.ok) fail(502, 'github_read', 'Não foi possível ler cardapio.json em main. Confira a instalação da GitHub App e se o arquivo já existe.');
    const file = await response.json();
    if (file.type !== 'file' || file.path !== FILE || file.encoding !== 'base64' || !/^[a-f0-9]{40}$/.test(file.sha)) {
      fail(502, 'github_read', 'O GitHub não retornou o arquivo de cardápio esperado.');
    }
    let data;
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unb64(file.content.replace(/\s/g, '')))); }
    catch { fail(409, 'remote_invalid', 'O cardápio remoto está inválido. Corrija-o no GitHub antes de publicar.'); }
    return { sha: file.sha, menu: publicationMenu(data) };
  }
  async function handle(req, env, cfg) {
    const url = new URL(req.url);
    if (url.origin !== cfg.backend) fail(403, 'origin', 'Origem do backend inválida.');
    const origin = req.headers.get('Origin');
    if (origin && origin !== cfg.editor && origin !== cfg.backend) fail(403, 'origin', 'Origem não autorizada.');
    if (req.method === 'OPTIONS') {
      if (origin !== cfg.editor || req.headers.get('Access-Control-Request-Method') !== 'POST' && req.headers.get('Access-Control-Request-Method') !== 'GET') fail(403, 'cors', 'Origem ou método não autorizado.');
      const requested = (req.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (requested.some(header => !['content-type', 'x-csrf-token'].includes(header))) fail(403, 'cors', 'Cabeçalhos não autorizados.');
      return new Response(null, { status: 204 });
    }
    if (req.method === 'GET' && ['/publish', '/publisher.js', '/publisher.css'].includes(url.pathname)) {
      const path = url.pathname === '/publish' ? '/publisher.html' : url.pathname;
      return env.ASSETS.fetch(new Request(cfg.backend + path));
    }
    if (req.method === 'GET' && url.pathname === '/publisher-config.js') {
      return new Response('window.UrsaPublisherConfig = ' + JSON.stringify({ editorOrigin: cfg.editor }) + ';', { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
    }
    if (req.method === 'GET' && url.pathname === '/auth/login') {
      const state = random(), verifier = random();
      await store(env, 'put', 'oauth:' + await hash(state), { verifier, expires: now() + 600000 });
      const target = new URL('https://github.com/login/oauth/authorize');
      for (const [key, value] of Object.entries({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: cfg.backend + '/auth/callback',
        state, code_challenge: await hash(verifier), code_challenge_method: 'S256' })) target.searchParams.set(key, value);
      // GitHub App OAuth uses the app's repository permissions; no broad repo scope.
      return new Response(null, { status: 302, headers: { Location: target.href, 'Set-Cookie': setCookie(OAUTH, state, 600) } });
    }
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      const state = url.searchParams.get('state');
      if (!/^[\w-]{43}$/.test(state || '') || !equal(state, cookie(req, OAUTH))) fail(400, 'oauth_state', 'Autenticação inválida ou expirada. Inicie novamente.');
      const saved = await store(env, 'take', 'oauth:' + await hash(state));
      if (!saved || saved.expires <= now()) fail(400, 'oauth_state', 'Autenticação já utilizada ou expirada.');
      const code = url.searchParams.get('code');
      if (url.searchParams.has('error') || !code || code.length > 512) fail(400, 'oauth_denied', 'A autorização do GitHub não foi concluída. Volte ao editor e entre novamente.');
      const response = await github('https://github.com/login/oauth/access_token', null, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code,
          redirect_uri: cfg.backend + '/auth/callback', code_verifier: saved.verifier }).toString() });
      if (!response.ok) fail(502, 'oauth_exchange', 'Não foi possível concluir a autenticação com GitHub.');
      const token = await response.json();
      if (typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer') fail(400, 'oauth_exchange', 'O GitHub não concedeu a autorização.');
      const user = await identity(token.access_token);
      const id = random();
      const lifetime = Math.min(3600, Number(token.expires_in) || 3600);
      if (lifetime < 60) fail(401, 'session_expired', 'A autorização expirou. Entre novamente.');
      await store(env, 'put', 'session:' + await hash(id), { login: user.login, userId: user.id,
        token: await seal(token.access_token, env), csrf: random(), expires: now() + lifetime * 1000 });
      const old = cookie(req, SESSION);
      if (/^[\w-]{43}$/.test(old)) await store(env, 'delete', 'session:' + await hash(old));
      const headers = new Headers({ Location: cfg.backend + '/publish' });
      headers.append('Set-Cookie', setCookie(SESSION, id, lifetime));
      headers.append('Set-Cookie', setCookie(OAUTH, '', 0));
      return new Response(null, { status: 302, headers });
    }
    if (url.pathname.startsWith('/api/')) {
      const saved = await session(req, env);
      if (req.method === 'POST') {
        if (origin !== cfg.backend && origin !== cfg.editor) fail(403, 'csrf', 'Origem obrigatória.');
        if (!equal(req.headers.get('X-CSRF-Token'), saved.csrf)) fail(403, 'csrf', 'Confirmação de segurança inválida. Reabra a janela de publicação.');
      }
      if (req.method === 'GET' && url.pathname === '/api/session') return json({ authenticated: true, login: saved.login, csrf: saved.csrf });
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        await store(env, 'delete', saved.key);
        return new Response(JSON.stringify({ authenticated: false }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookie(SESSION, '', 0) } });
      }
      if (req.method === 'GET' && url.pathname === '/api/menu') { await identity(saved.token); return json(await remote(saved.token)); }
      if (req.method === 'POST' && url.pathname === '/api/publish') {
        if (env.PUBLISH_ENABLED !== 'true') fail(503, 'publishing_disabled', 'A publicação ainda não foi habilitada pelo responsável. Use a exportação manual.');
        const body = await requestJson(req);
        if (!body || Object.keys(body).sort().join(',') !== 'menu,sha' || !/^[a-f0-9]{40}$/.test(body.sha || '')) {
          fail(400, 'invalid_request', 'Informe somente o cardápio e o SHA revisado.');
        }
        const menu = publicationMenu(body.menu);
        await identity(saved.token); // Recheck GitHub identity on EVERY publication.
        const current = await remote(saved.token);
        if (current.sha !== body.sha) fail(409, 'conflict', 'O cardápio mudou no GitHub. Revise a versão atual antes de publicar. Seu rascunho foi preservado.');
        if (JSON.stringify(menu) === JSON.stringify(current.menu)) return json({ unchanged: true, sha: current.sha });
        const response = await github(CONTENTS, saved.token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          branch: BRANCH, sha: current.sha, content: b64(encoder.encode(JSON.stringify(menu, null, 2) + '\n')),
          message: `Atualiza cardápio do Ursa Bar pelo editor — ${new Date(now()).toISOString()}`
        }) });
        if (response.status === 409) fail(409, 'conflict', 'Outra alteração chegou ao GitHub durante a publicação. Seu rascunho foi preservado.');
        if (response.status === 401) fail(401, 'session_expired', 'A sessão expirou. Entre novamente.');
        if (!response.ok) fail(502, 'github_write', 'O GitHub recusou a publicação. Confira as permissões e as regras de main. Seu rascunho foi preservado.');
        const result = await response.json();
        if (!/^[a-f0-9]{40}$/.test(result.commit?.sha || '') || !/^[a-f0-9]{40}$/.test(result.content?.sha || '')) {
          fail(502, 'github_uncertain', 'O GitHub respondeu sem confirmação completa. Verifique o histórico antes de tentar novamente.');
        }
        return json({ commit: result.commit.sha, sha: result.content.sha,
          commitUrl: `https://github.com/${REPO}/commit/${result.commit.sha}`, pagesUpdating: true });
      }
    }
    fail(404, 'not_found', 'Página não encontrada.');
  }
  return async (req, env) => {
    let cfg, response;
    try { cfg = config(env); response = await handle(req, env, cfg); }
    catch (error) {
      const text = error instanceof HttpError ? error.message : 'Serviço indisponível. Seu rascunho permanece no editor; use a exportação manual.';
      if (new URL(req.url).pathname.startsWith('/auth/')) {
        const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
        response = new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ursa · Autenticação</title><link rel="stylesheet" href="/publisher.css"><main><h1>Autenticação não concluída</h1><p>${escaped}</p><a href="/publish">Voltar à janela de publicação</a></main></html>`, { status: error.status || 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      } else response = json({ error: error.code || 'service_unavailable', message: text }, error.status || 503);
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      Vary: 'Origin' })) headers.set(key, value);
    // Keep the normal opener relationship with GitHub Pages. Origin/source/channel
    // checks protect postMessage; COOP isolation here would sever that relationship.
    if (cfg && req.headers.get('Origin') === cfg.editor) {
      headers.set('Access-Control-Allow-Origin', cfg.editor);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET, POST');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
    }
    if (new URL(req.url).pathname === '/auth/callback' && response.status >= 400) headers.append('Set-Cookie', setCookie(OAUTH, '', 0));
    return new Response(response.body, { status: response.status, headers });
  };
}

// Only this Worker can reach the binding. Single-use OAuth state and logout are strongly consistent.
export class AuthStore {
  constructor(ctx) { this.storage = ctx.storage; }
  async fetch(req) {
    const { op, key, value } = await req.json();
    if (!/^(oauth|session):[\w-]{43}$/.test(key || '')) return json(null, 400);
    if (op === 'put') {
      await this.storage.put(key, value);
      const alarm = await this.storage.getAlarm();
      if (!alarm || value.expires < alarm) await this.storage.setAlarm(value.expires);
      return json(true);
    }
    if (op === 'delete') { await this.storage.delete(key); return json(true); }
    if (op === 'take') return json(await this.storage.transaction(async tx => {
      const saved = await tx.get(key);
      await tx.delete(key);
      return saved || null;
    }));
    if (op === 'get') return json(await this.storage.get(key) || null);
    return json(null, 400);
  }
  async alarm() {
    const entries = await this.storage.list();
    let next = Infinity;
    for (const [key, value] of entries) {
      if (value.expires <= Date.now()) await this.storage.delete(key);
      else next = Math.min(next, value.expires);
    }
    if (Number.isFinite(next)) await this.storage.setAlarm(next);
  }
}

export default { fetch: createHandler() };
