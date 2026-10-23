import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_TEXT_BYTES=64*1024*1024;
const isText=name=>/\.txt$/i.test(name)&&!name.split('/').some(part=>part.startsWith('.')||part==='__MACOSX')&&!/(?:^|\/)(?:readme|license|copying)(?:[._-].*)?\.txt$/i.test(name);

export function decodeAozora(bytes){
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch {return new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}
}
export function aozoraInline(text){
  const token=/※［＃([^］\n]+)］|(?:｜([^｜《》\n]+)|([\p{Script=Han}々〆ヵヶ]+))《([^》\n]+)》|［＃([^］\n]+)］/gu;
  let html='',offset=0;
  for(const match of text.matchAll(token)){
    html+=escape(text.slice(offset,match.index));
    if(match[1]){
      const unicode=match[1].match(/U\+([0-9a-f]{4,6})/i);const code=unicode?parseInt(unicode[1],16):-1;
      html+=code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?escape(String.fromCodePoint(code)):`<span class="aozora-note">${escape(match[0])}</span>`;
    }else if(match[4])html+=`<ruby>${escape(match[2]||match[3])}<rp>（</rp><rt>${escape(match[4])}</rt><rp>）</rp></ruby>`;
    else html+=`<span class="aozora-note">${escape(match[0])}</span>`;
    offset=match.index+match[0].length;
  }
  return html+escape(text.slice(offset));
}
export function parseAozora(source,fallbackTitle='本文'){
  const text=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if(!text)throw new Error('本文が空です');
  const boundary=text.indexOf('\n\n');
  const header=boundary<0?[]:text.slice(0,boundary).split('\n').map(s=>s.trim()).filter(Boolean);
  const hasHeader=header.length>=2&&header.length<=8;
  const title=hasHeader?header[0]:fallbackTitle;
  const authorIndex=hasHeader?(header.at(-1).endsWith('訳')&&header.length>=3?header.length-2:header.length-1):-1;
  const author=hasHeader?header[authorIndex]:'';
  const subtitle=hasHeader?header.slice(1,authorIndex).join('　'):'';
  let body=hasHeader?text.slice(boundary+2):text;
  // The initial block describes notation, not the story. Keep it in the source notes.
  let notation='';
  const guide=body.match(/^\s*-{5,}\n[\s\S]*?\n-{5,}[^\S\n]*(?:\n|$)/);
  if(guide&&/テキスト中に現れる記号/.test(guide[0])){notation=guide[0].trim();body=body.slice(guide[0].length);}
  const end=body.search(/^(?:底本|入力|校正|青空文庫作成ファイル)[：:]/m);
  const colophon=end>=0?body.slice(end).trim():'';
  if(end>=0)body=body.slice(0,end);
  if(!body.trim())throw new Error('本文が空です');
  const blocks=[];
  for(const line of body.trim().split('\n')){
    if(!line.trim()){blocks.push('<div class="aozora-gap" aria-hidden="true"></div>');continue;}
    if(/^［＃(?:改ページ|改丁)］$/.test(line)){blocks.push('<hr>');continue;}
    const heading=line.match(/^(.*?)［＃「([^」]+)」は(大|中|小)見出し］$/);
    if(heading&&(!heading[1]||heading[1].trim()===heading[2])){
      const tag=heading[3]==='大'?'h2':heading[3]==='中'?'h3':'h4';
      if(!heading[1]&&blocks.at(-1)===`<p>${aozoraInline(heading[2])}</p>`)blocks.pop();
      blocks.push(`<${tag}>${aozoraInline(heading[2])}</${tag}>`);continue;
    }
    blocks.push(`<p>${aozoraInline(line)}</p>`);
  }
  const notes=[hasHeader?header.join('\n'):'',notation,colophon].filter(Boolean).join('\n\n');
  const html=blocks.join('\n')+(notes?`\n<details class="aozora-source"><summary>作品情報・底本・入力者など</summary><pre>${escape(notes)}</pre></details>`:'');
  return {title,subtitle,author,html};
}
export async function readAozoraZip(file){
  try{
    const buffer=await readFile(file);let total=0;
    const entries=unzipSync(buffer,{filter(entry){if(!isText(entry.name))return false;total+=entry.originalSize;if(total>MAX_TEXT_BYTES)throw new Error('ZIP内のテキスト合計が64MiBを超えています');return true;}});
    const names=Object.keys(entries).sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
    if(!names.length)throw new Error('ZIP内に作品の .txt ファイルがありません。「テキストファイル（ルビあり）」のZIPを使用してください');
    return names.map(name=>({entry:name,...parseAozora(decodeAozora(entries[name]),path.basename(name).replace(/\.txt$/i,''))}));
  }catch(error){throw new Error(`${file}: ${error.message}`);}
}
