const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };

async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      // The prefix exercises relative URLs as used by GitHub Pages project sites.
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/ursa-cardapio/')) { res.writeHead(404).end(); return; }
      const relative = decodeURIComponent(url.pathname.slice('/ursa-cardapio/'.length)) || 'index.html';
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await fs.readFile(target);
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/ursa-cardapio/` };
}
module.exports = { startServer };
