import { readFile, readdir, mkdir, writeFile, stat, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Marked } from 'marked';

const execFileAsync=promisify(execFile);
async function modifiedTime(file, gitDates) {
  if(gitDates) {
    const {stdout}=await execFileAsync('git',['log','-1','--format=%cI','--',file],{cwd:path.dirname(file)});
    const date=Date.parse(stdout.trim());
    if(Number.isFinite(date)) return date;
  }
  return (await stat(file)).mtimeMs;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64 = s => Buffer.from(s).toString('base64');
const mime = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif'};
async function imageData(file, root) {
  const resolved = await realpath(file);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`画像が作品フォルダー外です: ${file}`);
  const type = mime[path.extname(resolved).toLowerCase()];
  if (!type) throw new Error(`未対応の画像形式: ${file} (PNG/JPEG/GIF/WebP/AVIF)`);
  return `data:${type};base64,${(await readFile(resolved)).toString('base64')}`;
}
async function files(dir, recursive = true) {
  const result = [];
  for (const e of await readdir(dir, {withFileTypes:true})) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir,e.name);
    if (recursive && e.isDirectory()) result.push(...await files(full));
    else if (e.isFile() && /\.md$/i.test(e.name)) result.push(full);
  }
  return result.sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
}
async function render(md, file, root) {
  const parser = new Marked({
    async:true,
    renderer: { html({text}) {return escape(text);} },
    async walkTokens(token) {
      if (token.type === 'image') {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(token.href)) throw new Error(`画像はローカルファイルを指定してください: ${file}`);
        token.href = await imageData(path.resolve(path.dirname(file),decodeURIComponent(token.href)),root);
      }
      if (token.type === 'link' && !/^(?:https?:|mailto:|#)/i.test(token.href)) token.href = '#';
    }
  });
  return parser.parse(md);
}
export async function build(input, output, options = {}) {
  const fontMode=options.font || 'system';
  const catalogMode=options.catalog || 'external';
  if (!['embed','external'].includes(catalogMode)) throw new Error('--catalog は embed / external から指定してください');
  if (!['system','embed','external'].includes(fontMode)) throw new Error('--font は system / embed / external から指定してください');
  const root = await realpath(input);
  const out = path.resolve(output);
  await mkdir(out,{recursive:true});
  const actualOut=await realpath(out);
  if (actualOut===root || actualOut.startsWith(root+path.sep)) throw new Error('出力先は入力フォルダーの外を指定してください');
  if (out === root || out.startsWith(root+path.sep)) throw new Error('出力先は入力フォルダーの外を指定してください');
  const dirs = (await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
  if ((await readdir(root)).some(n=>/\.md$/i.test(n))) dirs.unshift({name:'.'});
  const novels=[];
  for (const dir of dirs) {
    const folder = await realpath(path.join(root,dir.name));
    const chapters = await files(folder, dir.name !== '.');
    if (!chapters.length) continue;
    let meta = {};
    try { meta=JSON.parse(await readFile(path.join(folder,'novel.json'),'utf8')); }
    catch(e) { if (e.code!=='ENOENT') throw new Error(`${folder}/novel.json: ${e.message}`); }
    if (meta===null || typeof meta!=='object' || Array.isArray(meta)) throw new Error(`${folder}/novel.json はオブジェクトを指定してください`);
    if (meta.draft === true) continue;
    for (const key of ['title','author','genre','description','status','updated','cover']) if (meta[key] !== undefined && typeof meta[key] !== 'string') throw new Error(`${folder}: ${key} は文字列で指定してください`);
    if (meta.tags !== undefined && (!Array.isArray(meta.tags) || meta.tags.some(t=>typeof t!=='string'))) throw new Error(`${folder}: tags は文字列の配列で指定してください`);
    if (meta.priority !== undefined && !Number.isFinite(meta.priority)) throw new Error(`${folder}: priority は数値で指定してください`);
    const novel={id:dir.name==='.'?'@root:'+path.basename(root):dir.name,title:meta.title||path.basename(folder),author:meta.author||'作者未設定',genre:meta.genre||'その他',description:meta.description||'',status:meta.status||'連載中',tags:meta.tags||[],priority:meta.priority||0,chapters:[]};
    let updated=0;
    for (const file of chapters) {
      // Root-level work does not include sibling work directories.
      if (dir.name==='.' && path.dirname(file)!==root) continue;
      const source=await readFile(file,'utf8');
      const match=source.match(/^#\s+(.+)\r?$/m);
      novel.chapters.push({title:match?.[1]||path.basename(file,'.md'),html:await render(source,file,folder)});
      if(!meta.updated) updated=Math.max(updated,await modifiedTime(file,options.gitDates));
    }
    novel.updated=meta.updated||new Date(updated).toISOString().slice(0,10);
    if (Number.isNaN(Date.parse(novel.updated))) throw new Error(`${folder}: updated が不正です`);
    let cover=meta.cover;
    if (!cover) {try {await stat(path.join(folder,'cover.png'));cover='cover.png';}catch(e){if(e.code!=='ENOENT')throw e;}}
    novel.cover=cover?await imageData(path.resolve(folder,cover),folder):'';
    novel.file=`work-${dir.name==='.'?'root-':''}${Buffer.from(novel.id).toString('base64url')}.html`;
    novels.push(novel);
  }
  const [baseCss,js]=await Promise.all(['style.css','reader.js'].map(f=>readFile(path.join(here,f),'utf8')));
  let css=baseCss, notices='';
  if (fontMode!=='system') {
    const [font,ofl,dict]=await Promise.all([
      readFile(path.join(here,'../assets/fonts/FurifontSans-Regular.woff2')),
      readFile(path.join(here,'../assets/fonts/OFL.txt'),'utf8'),
      readFile(path.join(here,'../assets/fonts/DATA-LICENSE.md'),'utf8')]);
    const fontUrl=fontMode==='embed'?`data:font/woff2;base64,${font.toString('base64')}`:'assets/FurifontSans-Regular.woff2';
    css=`@font-face{font-family:'Furifont';src:url(${fontUrl}) format('woff2');font-weight:400;font-display:swap}\n${baseCss}`;
    notices=`<details class="licenses"><summary>フォント・ライセンス</summary><p>Furifont Sans Regular v0.6.2 — Anthony Fu / Source Han Sans JP — Adobe<br>https://github.com/antfu/furifont</p><pre>${escape(ofl+'\n\n'+dict)}</pre></details>`;
    if(fontMode==='external') {await mkdir(path.join(out,'assets'),{recursive:true});await writeFile(path.join(out,'assets/FurifontSans-Regular.woff2'),font);}
  }
  const page=(title,data)=>`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${css}</style><body><noscript>閲覧にはJavaScriptを有効にしてください。</noscript><div id="app"></div>${notices}<script id="book-data" type="application/octet-stream">${b64(JSON.stringify({...data,fontMode}))}</script><script src="data:text/javascript;base64,${b64(js)}"></script></body></html>`;
  await mkdir(out,{recursive:true});
  for (const n of novels) await writeFile(path.join(out,n.file),page(n.title,{type:'novel',novel:n}));
  const catalog={type:'library',novels:novels.map(({chapters,...n})=>({...n,count:chapters.length}))};
  await writeFile(path.join(out,'index.html'),page('小説の本棚',catalogMode==='external'?{type:'library',catalogUrl:'catalog.json'}:catalog));
  if(catalogMode==='external') await writeFile(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  else await unlink(path.join(out,'catalog.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await writeFile(path.join(out,'.nojekyll'),'');
  const manifest=path.join(out,'.mdyomukiku-generated.json');
  let previous=[];
  try {previous=JSON.parse(await readFile(manifest,'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
  const current=novels.map(n=>n.file);
  if (!Array.isArray(previous)) throw new Error('生成ファイル一覧が不正です');
  for(const file of previous) if(typeof file==='string' && /^work-[A-Za-z0-9_-]+\.html$/.test(file) && !current.includes(file)) await unlink(path.join(out,file)).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await writeFile(manifest,JSON.stringify(current));
  return {count:novels.length,output:out};
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if (args.includes('--help') || !args.length) console.log('使い方: npm run build -- <小説フォルダー> [出力先=docs] [--font system|embed|external] [--catalog external|embed] [--git-dates]\n各作品フォルダーに novel.json と *.md を配置してください。フォントの初期値はsystem、一覧データはexternalです。');
  else try {
    const positional=[];let font='system',catalog='external',gitDates=false;
    for(let i=0;i<args.length;i++) {if(args[i]==='--font') font=args[++i]||'invalid';else if(args[i]==='--catalog')catalog=args[++i]||'invalid';else if(args[i]==='--git-dates')gitDates=true;else if(args[i].startsWith('--')) throw new Error(`不明なオプション: ${args[i]}`);else positional.push(args[i]);}
    if(!positional.length || positional.length>2) throw new Error('入力フォルダーと任意の出力先を指定してください');
    const result=await build(positional[0],positional[1]||'docs',{font,catalog,gitDates});console.log(`${result.count}作品を生成しました: ${result.output} (font: ${font})`);
  } catch(e) {console.error(`生成失敗: ${e.message}`);process.exitCode=1;}
}
