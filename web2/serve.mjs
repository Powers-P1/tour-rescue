import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const deploy=process.argv.includes('--deploy');
const base=fileURLToPath(deploy?new URL('../web/dist/',import.meta.url):new URL('./dist/',import.meta.url));
const root=resolve(base);
const port=Number(process.env.PORT ?? (deploy?4173:4174));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
 '.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const headers=await readFile(resolve(root,'_headers'),'utf8').catch(()=> '');
const csp=headers.match(/^  Content-Security-Policy:\s*(.+)$/m)?.[1];
const fileFor=path=>path==='/'?'/index.html':
 path==='/app'||path==='/app/'?'/app/index.html':
 path==='/judges'||path==='/judges/'?'/judges/index.html':path;
http.createServer(async (req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let pathname;
  try{pathname=new URL(req.url??'/', 'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}
  const file=resolve(root,'.'+fileFor(pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  try{
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      ...(csp?{'Content-Security-Policy':csp}:{})});
    res.end(req.method==='HEAD'?undefined:content);
  }catch{
    const content=await readFile(resolve(root,'404.html')).catch(()=>Buffer.from('404 Not found'));
    res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:content);
  }
}).listen(port,'0.0.0.0',()=>console.log('Tour Rescue v2 preview: http://localhost:'+port));
