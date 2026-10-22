(() => {
'use strict';
const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(document.querySelector('#book-data').textContent.trim()),c=>c.charCodeAt(0))));
const app=document.querySelector('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let theme=read('theme','paper');document.documentElement.dataset.theme=theme;
const header=`<header><a class="brand" href="index.html"><span class="brand-icon">文</span> よむ、きく。<small>物語のある場所</small></a><button id="theme" class="quiet" aria-label="配色を切り替え">配色：${theme==='night'?'夜':'紙'}</button></header>`;
app.innerHTML=header;
document.querySelector('#theme').onclick=e=>{theme=theme==='night'?'paper':'night';document.documentElement.dataset.theme=theme;save('theme',theme);e.target.textContent=`配色：${theme==='night'?'夜':'紙'}`;};
const cover=n=>n.cover?`<img class="cover" src="${esc(n.cover)}" alt="${esc(n.title)}の表紙">`:`<div class="cover generated"><span>物 語</span><b>${esc(n.title)}</b><small>${esc(n.author)}</small></div>`;
if(data.type==='library') {
  app.insertAdjacentHTML('beforeend',`<main class="library"><section class="intro"><span class="eyebrow">YOUR NEXT STORY</span><h1>まだ知らない世界へ、<br>ページをめくろう。</h1><p>読む時間も、耳で楽しむ時間も。<br>あなたの毎日に、ひとつの物語を。</p><span class="book-count">${data.novels.length} 作品を公開中</span></section><section class="shelf"><div class="section-title"><h2>物語を探す</h2><label class="search">⌕ <input id="search" type="search" placeholder="作品名・作者・キーワードで検索" aria-label="作品を検索"></label></div><div class="filters"><div id="genres" role="group" aria-label="ジャンル"></div><select id="sort" aria-label="並べ替え"><option value="priority">おすすめ順</option><option value="updated">更新が新しい順</option><option value="title">作品名順</option></select></div><p id="result" role="status"></p><div id="books" class="books"></div></section></main><footer>よむ、きく。 / 本棚から、あたらしい物語へ。</footer>`);
  let genre='すべて';
  const genres=['すべて',...new Set(data.novels.map(n=>n.genre))];
  const paintGenres=()=>{document.querySelector('#genres').innerHTML=genres.map(g=>`<button class="chip ${g===genre?'selected':''}" aria-pressed="${g===genre}">${esc(g)}</button>`).join('');document.querySelectorAll('#genres button').forEach((b,i)=>b.onclick=()=>{genre=genres[i];paintGenres();paint();});};
  function paint() {
    const query=document.querySelector('#search').value.trim().toLocaleLowerCase();
    const mode=document.querySelector('#sort').value;
    const list=data.novels.filter(n=>(genre==='すべて'||n.genre===genre)&&[n.title,n.author,n.description,...n.tags].join(' ').toLocaleLowerCase().includes(query));
    list.sort((a,b)=>mode==='updated'?Date.parse(b.updated)-Date.parse(a.updated):mode==='title'?a.title.localeCompare(b.title,'ja'):b.priority-a.priority||Date.parse(b.updated)-Date.parse(a.updated));
    document.querySelector('#result').textContent=`${list.length} 作品`;
    document.querySelector('#books').innerHTML=list.length?list.map(n=>`<a class="book" href="${esc(n.file)}">${cover(n)}<div class="book-info"><span class="category">${esc(n.genre)}</span>${n.priority>0?'<span class="pick">おすすめ</span>':''}<h3>${esc(n.title)}</h3><p class="author">${esc(n.author)}</p><p class="synopsis">${esc(n.description)}</p><div class="tags">${n.tags.map(t=>`<span>#${esc(t)}</span>`).join('')}</div><p class="meta">${esc(n.status)} · 全${n.count}話 · ${esc(n.updated)} 更新</p></div><span class="arrow">→</span></a>`).join(''):'<p class="empty">条件に合う作品はありません。</p>';
  }
  document.querySelector('#search').oninput=paint;document.querySelector('#sort').onchange=paint;paintGenres();paint();return;
}
const n=data.novel;
const key=`reading:${n.id}`;
let index=0, size=read('fontSize',18), speechId=0, speaking=false, paused=false;
const supported='speechSynthesis' in window;
app.insertAdjacentHTML('beforeend',`<main class="novel"><section class="novel-hero">${cover(n)}<div><span class="category">${esc(n.genre)} / ${esc(n.status)}</span><h1>${esc(n.title)}</h1><p class="author">${esc(n.author)}</p><p class="description">${esc(n.description)}</p><div class="tags">${n.tags.map(t=>`<span>#${esc(t)}</span>`).join('')}</div><button class="primary" id="start">はじめから読む →</button> <button id="resume">続きから読む</button><p class="meta">全${n.chapters.length}話 · ${esc(n.updated)} 更新</p></div></section><div class="reading-layout"><aside><h2>目次 <small>CONTENTS</small></h2><nav id="toc"></nav></aside><section class="reading"><div class="toolbar"><label>文字 <select id="size"><option value="16">小</option><option value="18">標準</option><option value="21">大</option><option value="24">特大</option></select></label><label>ふりがな <select id="furigana"><option value="on">あり</option><option value="off">なし</option></select></label><button id="listen">▶ 聴く</button><button id="stop">■ 停止</button><label>速度 <select id="rate"><option value="0.8">0.8×</option><option value="1" selected>1.0×</option><option value="1.2">1.2×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select></label><label>声 <select id="voice" aria-label="読み上げの声"></select></label></div><p class="speech-note" id="speech-status" role="status">${supported?'音声の種類・オフラインでの利用可否は端末に依存します。':'このブラウザーは読み上げに対応していません。'}</p><div class="chapter-heading"><span id="chapter-number"></span><h2 id="chapter-title"></h2></div><article id="body"></article><div class="chapter-nav"><button id="prev">← 前の話</button><button id="next">次の話 →</button></div></section></div></main><footer>よむ、きく。 / <a href="index.html">作品一覧へ</a></footer>`);
const body=document.querySelector('#body');
const status=document.querySelector('#speech-status');
function stop(){speechId++;if(supported)speechSynthesis.cancel();speaking=false;paused=false;document.querySelector('#listen').textContent='▶ 聴く';body.querySelectorAll('.speaking').forEach(p=>p.classList.remove('speaking'));}
function show(i,scroll=false){
  stop();if(!Number.isInteger(i))i=0;index=Math.max(0,Math.min(n.chapters.length-1,i));
  body.innerHTML=n.chapters[index].html;
  const first=body.querySelector('h1');if(first&&first.textContent===n.chapters[index].title)first.remove();
  document.querySelector('#chapter-number').textContent=`EPISODE ${String(index+1).padStart(2,'0')} / ${n.chapters.length}`;
  document.querySelector('#chapter-title').textContent=n.chapters[index].title;
  document.querySelector('#toc').innerHTML=n.chapters.map((c,i)=>`<button ${i===index?'aria-current="page"':''}><small>${String(i+1).padStart(2,'0')}</small>${esc(c.title)}</button>`).join('');
  document.querySelectorAll('#toc button').forEach((b,i)=>b.onclick=()=>show(i,true));
  document.querySelector('#prev').disabled=index===0;document.querySelector('#next').disabled=index===n.chapters.length-1;
  history.replaceState(null,'',`#chapter-${index+1}`);save(key,{chapter:index});
  if(scroll)document.querySelector('.reading').scrollIntoView({behavior:'smooth'});
}
const stored=read(key,{chapter:0});
const hash=location.hash.match(/^#chapter-(\d+)$/);
show(hash?Number(hash[1])-1:(Number.isInteger(stored.chapter)?stored.chapter:0));
document.querySelector('#start').onclick=()=>show(0,true);
document.querySelector('#resume').onclick=()=>show(read(key,stored).chapter??0,true);

document.querySelector('#prev').onclick=()=>show(index-1,true);document.querySelector('#next').onclick=()=>show(index+1,true);
const furigana=document.querySelector('#furigana');
furigana.value=data.fontMode==='system'?'off':read('furigana','on');
if(data.fontMode==='system'){furigana.disabled=true;furigana.title='Furifontを使用するには --font embed または external で生成してください';}
const setFurigana=()=>{body.classList.toggle('no-furigana',furigana.value==='off');save('furigana',furigana.value);};
furigana.onchange=setFurigana;setFurigana();
const setSize=()=>{body.style.fontSize=`${size}px`;document.querySelector('#size').value=size;};setSize();
document.querySelector('#size').onchange=e=>{size=Number(e.target.value);setSize();save('fontSize',size);};
let voices=[];
function loadVoices(){if(!supported)return;voices=speechSynthesis.getVoices();const ja=voices.filter(v=>v.lang.startsWith('ja'));const options=ja.length?ja:voices;document.querySelector('#voice').innerHTML='<option value="">端末の標準</option>'+options.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('');}
if(supported){loadVoices();speechSynthesis.addEventListener('voiceschanged',loadVoices);}else{for(const id of ['listen','stop','rate','voice'])document.getElementById(id).disabled=true;}
function speak(){
  if(!supported)return;
  if(speaking){if(paused){speechSynthesis.resume();paused=false;}else{speechSynthesis.pause();paused=true;}document.querySelector('#listen').textContent=paused?'▶ 再開':'Ⅱ 一時停止';return;}
  stop();speaking=true;const current=++speechId;
  // Short utterances avoid the long-text limits of browser speech engines.
  const blocks=[...body.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,pre')].filter(el=>!el.querySelector('p,li,blockquote,pre'));
  const queue=blocks.flatMap(el=>(el.textContent.match(/[^。！？\n]{1,100}[。！？\n]?/gu)||[]).map(text=>({text,el})));
  let pos=0;
  function next(){
    if(current!==speechId)return;
    body.querySelectorAll('.speaking').forEach(p=>p.classList.remove('speaking'));
    if(pos>=queue.length){stop();status.textContent='この話の読み上げが終わりました。';return;}
    const part=queue[pos++];part.el.classList.add('speaking');
    const utterance=new SpeechSynthesisUtterance(part.text);utterance.lang='ja-JP';utterance.rate=Number(document.querySelector('#rate').value);utterance.voice=voices.find(v=>v.voiceURI===document.querySelector('#voice').value)||null;
    utterance.onend=next;utterance.onerror=e=>{if(current===speechId&&e.error!=='canceled'&&e.error!=='interrupted'){stop();status.textContent=`読み上げを開始できませんでした (${e.error})。端末の音声設定をご確認ください。`;}};
    speechSynthesis.speak(utterance);
  }
  status.textContent='読み上げ中：本文の段落を順番に読みます。';document.querySelector('#listen').textContent='Ⅱ 一時停止';next();
}
document.querySelector('#listen').onclick=speak;document.querySelector('#stop').onclick=()=>{stop();status.textContent='読み上げを停止しました。';};window.addEventListener('pagehide',stop);
})();
