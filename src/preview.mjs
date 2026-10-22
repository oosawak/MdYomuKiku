import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'docs');
await build(path.join(root,'novels'),output,{gitDates:true});
const types={'.html':'text/html; charset=utf-8','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const requested=decodeURIComponent(url.pathname);
    const relative=requested==='/'?'index.html':requested.replace(/^\/+/, '');
    const target=path.resolve(output,relative);
    if(!target.startsWith(output+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    const content=await readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(content);
  }catch(e){res.writeHead(e.code==='ENOENT'||e.code==='EISDIR'?404:400);res.end('Not found');}
});
const port=Number(process.env.PORT||5173);
server.on('error',error=>{console.error(`プレビュー起動失敗: ${error.message}`);process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>console.log(`Preview: http://localhost:${port}/ (docs/)`));
