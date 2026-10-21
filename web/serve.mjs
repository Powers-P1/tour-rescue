import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT ?? 4173);
const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/app.css', ['app.css', 'text/css; charset=utf-8']]]);
createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  const file = files.get(path);
  if (!file || request.method !== 'GET') { response.writeHead(404); response.end('Not found'); return; }
  try {
    const data = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(data);
  } catch { response.writeHead(503); response.end('Run npm run web:build first.'); }
}).listen(port, '0.0.0.0', () => console.log(`Tour Rescue preview: http://localhost:${port}`));
