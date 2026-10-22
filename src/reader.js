(async () => {
'use strict';
let data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(document.querySelector('#book-data').textContent.trim()),c=>c.charCodeAt(0))));
const app=document.querySelector('#app');
if(data.catalogUrl) {
  app.innerHTML='<p class="empty" role="status">作品一覧を読み込んでいます…</p>';
  try {
    const response=await fetch(new URL(data.catalogUrl,location.href),{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog=await response.json();
    if(catalog.type!=='library'||!Array.isArray(catalog.novels)) throw new Error('一覧データの形式が不正です');
    data={...catalog,fontMode:data.fontMode};
  } catch(error) {
    app.innerHTML='<main class="library"><h1>作品一覧を読み込めませんでした</h1><p>プレビューは <code>npm run dev</code> で起動し、HTTPのURLから開いてください。公開先では index.html と catalog.json を同じフォルダーに配置してください。</p><p>HTMLを直接開く場合は <code>--catalog embed</code> で再生成できます。</p><button id="reload">再読み込み</button></main>';
    document.querySelector('#reload').onclick=()=>location.reload();
    console.error('作品一覧の読み込み失敗:',error);
    return;
  }
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const volatile=new Map();
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??volatile.get(key)??fallback;}catch{return volatile.get(key)??fallback;}};
let storageFailed=false;
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{volatile.set(key,value);storageFailed=true;const note=document.querySelector('#storage-note');if(note)note.textContent='このブラウザーでは保存できません。設定や読書記録はページを閉じると失われます。';}};
let profiles=read('mdyomu:profiles',[{id:'default',name:'ゲスト'}]);
if(!Array.isArray(profiles)||!profiles.length)profiles=[{id:'default',name:'ゲスト'}];
let active=read('mdyomu:active','default');
if(!profiles.some(p=>p.id===active))active=profiles[0].id;
const stateKey=()=>`mdyomu:user:${active}`;
const user=()=>{const u=read(stateKey(),{});return {settings:u.settings||{},books:u.books||{}};};
const settings=()=>user().settings;
const book=id=>user().books[id]||{};
function changeSettings(patch){const u=user();Object.assign(u.settings,patch);save(stateKey(),u);}
function changeBook(id,patch){const u=user();u.books[id]={...u.books[id],...patch};save(stateKey(),u);}
const supported='speechSynthesis' in window;
let rendered=false;
let voices=[],stopPlayback=()=>{},voiceRefresh=()=>{},currentUtterance;
const chapterKey=c=>c.id||c.title;
const readIds=n=>Array.isArray(book(n.id).read)?book(n.id).read:[];
const chapterIds=n=>n.chapterIds||n.chapters?.map(chapterKey)||[];
const readCount=n=>chapterIds(n).filter(id=>readIds(n).includes(id)).length;
const readLabel=n=>readCount(n)===0?'未読':readCount(n)===(n.count||n.chapters.length)?'既読':'読書中';
const speechPrefs=id=>({...{voiceURI:'',rate:1},...settings().speech,...(id?book(id).speech:{})});
const cover=n=>n.cover?`<img class="cover" src="${esc(n.cover)}" alt="${esc(n.title)}の表紙">`:`<div class="cover generated"><span>物 語</span><b>${esc(n.title)}</b><small>${esc(n.author)}</small></div>`;
function fillVoices(select,value){
  const options=voices.filter(v=>v.lang.startsWith('ja'));const list=options.length?options:voices;
  select.innerHTML='<option value="">端末の標準</option>'+list.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  if(value&&!list.some(v=>v.voiceURI===value)){const option=document.createElement('option');option.value=value;option.textContent='保存した音声（準備中・この端末で未搭載）';select.append(option);}
  select.value=value||'';
}
function utterance(text,prefs){const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=prefs.rate;u.voice=voices.find(v=>v.voiceURI===prefs.voiceURI)||null;currentUtterance=u;return u;}
function renderApp(){
  const useHash=!rendered;rendered=true;
  stopPlayback();
  let theme=settings().theme||'paper';document.documentElement.dataset.theme=theme;
  app.innerHTML=`<header><a class="brand" href="index.html"><span class="brand-icon">物語</span> よむ、きく。<small>物語のある場所</small></a><div class="header-actions"><button id="about-open" aria-haspopup="dialog" aria-controls="about-dialog">このサイトについて</button><button id="settings-open">設定</button><button id="theme" class="quiet" aria-label="配色を切り替え">配色：${theme==='night'?'夜':'紙'}</button></div></header>`;
  document.querySelector('#theme').onclick=e=>{theme=theme==='night'?'paper':'night';document.documentElement.dataset.theme=theme;changeSettings({theme});e.target.textContent=`配色：${theme==='night'?'夜':'紙'}`;};
  app.insertAdjacentHTML('beforeend',`<dialog id="settings-dialog" aria-labelledby="settings-title"><div class="dialog-heading"><h2 id="settings-title">ユーザーと音声の設定</h2><button id="settings-close" aria-label="設定を閉じる">閉じる</button></div><p>既読・お気に入り・音声設定は、選択中のユーザーごとにこのブラウザーへ保存します。ログインや端末間の同期はありません。</p><p id="storage-note" role="status">${storageFailed?'このブラウザーでは設定や読書記録を保存できません。':''}</p><label class="profile-select">このブラウザー内のユーザー <select id="profile" aria-label="ユーザーを切り替え">${profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><form id="profile-form"><label>新しいユーザー名 <input id="profile-name" maxlength="40" required placeholder="例：自分用"></label><button type="submit">追加して切り替え</button></form><h3>基本の読み上げ音声</h3><p>作品別の指定がないときに使います。声は端末・ブラウザーによって異なります。</p><div class="settings-controls"><label>声 <select id="default-voice"></select></label><label>速度 <select id="default-rate">${rateOptions()}</select></label></div><label class="sample-label">試聴する文章 <textarea id="sample-text" maxlength="400">こんにちは。今日も、あなたのペースで物語を楽しみましょう。</textarea></label><div class="sample-actions"><button id="sample-play">▶ この設定で試聴</button><button id="sample-stop">■ 停止</button></div><p id="sample-status" role="status"></p></dialog>`);
  app.insertAdjacentHTML('beforeend',`<dialog id="about-dialog" aria-labelledby="about-title"><div class="dialog-heading"><h2 id="about-title">このサイトについて</h2><button id="about-close" type="button" aria-label="このサイトについてを閉じる">閉じる</button></div><p>「物語 よむ、きく。」は、作品を読んだり、音声で聴いたりできる小説サイトです。</p><h3>原稿から公開ページができるまで</h3><ol class="publish-flow"><li><strong>Markdownで原稿を書く</strong><p>VS Codeなどで <code>novels/作品名/</code> に各話の <code>.md</code> を保存します。作品名・紹介文・ジャンルは <code>novel.json</code>、表紙は <code>cover.png</code> に用意します。</p></li><li><strong>GitHubへcommit・pushする</strong><p>原稿や画像の変更をGitにcommitし、GitHubの <code>main</code> ブランチへpushします。パソコンで保存しただけでは、公開サイトは更新されません。</p></li><li><strong>GitHub Actionsが公開ファイルを作る</strong><p>pushをきっかけにテストと生成処理が動き、<code>docs/</code> に作品ごとのHTMLと、作品一覧の <code>catalog.json</code>、共通の閲覧機能・デザインをまとめた <code>assets/</code> を生成します。変更がある生成物は自動でcommitされます。</p></li><li><strong>GitHub Pagesで公開される</strong><p>生成したファイルが公開先へ配信され、一覧・本文・表紙が更新されます。GitHubのActions画面で <code>build</code> と <code>deploy</code> の成功を確認し、公開ページを再読み込みしてください。</p></li></ol><p>初回は管理者がGitHub Actionsの書き込み権限と、Pagesの公開元「GitHub Actions」を設定します。設定済みなら、以後は原稿・表紙のcommitとpushで公開できます。</p><h3>物語を探す・読み進める</h3><p>作品名・作者名・キーワードで検索し、ジャンルで絞り込めます。作品ページでは目次から各話へ移動できます。既読は各話のボタンで切り替え、お気に入りの作品は一覧で絞り込めます。</p><h3>読書記録はこのブラウザーに保存</h3><p>既読・お気に入り・最後に開いた話・音声設定は、このブラウザーに保存します。会員登録は不要です。別の端末には同期されず、ブラウザーのデータを消すと記録も消えます。同じ端末で記録を分けたいときは「設定」からユーザーを追加・切り替えできます。</p><h3>音声で聴く</h3><p>端末の読み上げ機能を使っています。「設定」で基本の声と速度を選び、短い文章で試聴できます。作品ごとに変えた声や速度も保存されます。使える声や通信の必要性は端末・ブラウザーによって異なります。</p><h3>ふりがな・文字・配色</h3><p>本文のふりがな、文字サイズ、昼夜の配色を切り替えられます。ふりがなは専用フォントによる自動表示のため、固有名詞や文脈によって読みが誤る場合があります。</p></dialog>`);
  const aboutDialog=document.querySelector('#about-dialog');
  document.querySelector('#about-open').onclick=()=>{if(aboutDialog.showModal)aboutDialog.showModal();else aboutDialog.setAttribute('open','');};
  document.querySelector('#about-close').onclick=()=>{if(aboutDialog.close)aboutDialog.close();else aboutDialog.removeAttribute('open');};
  document.querySelector('#profile').value=active;
  document.querySelector('#profile').onchange=e=>{active=e.target.value;save('mdyomu:active',active);renderApp();};
  const dialog=document.querySelector('#settings-dialog');
  document.querySelector('#settings-open').onclick=()=>{if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');};
  document.querySelector('#settings-close').onclick=()=>{stopPlayback();if(dialog.close)dialog.close();else dialog.removeAttribute('open');};
  dialog.addEventListener('cancel',()=>stopPlayback());
  document.querySelector('#profile-form').onsubmit=e=>{e.preventDefault();const name=document.querySelector('#profile-name').value.trim();if(!name)return;const id=globalThis.crypto?.randomUUID?.()||`user-${Date.now()}-${Math.random().toString(36).slice(2)}`;profiles.push({id,name});save('mdyomu:profiles',profiles);active=id;save('mdyomu:active',active);renderApp();};
  const defaultVoice=document.querySelector('#default-voice'),defaultRate=document.querySelector('#default-rate');
  defaultRate.value=String(speechPrefs().rate);
  function changeDefaults(){stopPlayback();changeSettings({speech:{voiceURI:defaultVoice.value,rate:Number(defaultRate.value)}});voiceRefresh();}
  defaultVoice.onchange=changeDefaults;defaultRate.onchange=changeDefaults;
  stopPlayback=()=>{if(supported)speechSynthesis.cancel();currentUtterance=null;};
  document.querySelector('#sample-play').onclick=()=>{stopPlayback();const text=document.querySelector('#sample-text').value.trim();if(!text)return;const u=utterance(text,speechPrefs());const status=document.querySelector('#sample-status');status.textContent='試聴中…';u.onend=()=>{if(currentUtterance===u){status.textContent='試聴が終わりました。';currentUtterance=null;}};u.onerror=e=>{if(currentUtterance!==u)return;status.textContent=e.error==='canceled'||e.error==='interrupted'?'停止しました。':`試聴できませんでした (${e.error})。`;};speechSynthesis.speak(u);};
  document.querySelector('#sample-stop').onclick=()=>{stopPlayback();document.querySelector('#sample-status').textContent='停止しました。';};
  if(!supported){for(const id of ['default-voice','default-rate','sample-play','sample-stop'])document.getElementById(id).disabled=true;document.querySelector('#sample-status').textContent='このブラウザーは読み上げに対応していません。';}
  let refreshToolbar=()=>{};
  voiceRefresh=()=>{fillVoices(defaultVoice,speechPrefs().voiceURI);refreshToolbar();};
  if(data.type==='library'){
    app.insertAdjacentHTML('beforeend',`<main class="library"><section class="intro"><span class="eyebrow">YOUR NEXT STORY</span><h1>まだ知らない世界へ、<br>ページをめくろう。</h1><p>読む時間も、耳で楽しむ時間も。<br>あなたの毎日に、ひとつの物語を。</p><span class="book-count">${data.novels.length} 作品を公開中</span></section><section class="shelf"><div class="section-title"><h2>物語を探す</h2><label class="search">⌕ <input id="search" type="search" placeholder="作品名・作者・キーワードで検索" aria-label="作品を検索"></label></div><div class="filters"><div id="genres" role="group" aria-label="ジャンル"></div><select id="sort" aria-label="並べ替え"><option value="priority">おすすめ順</option><option value="updated">更新が新しい順</option><option value="title">作品名順</option></select></div><div class="personal-filters"><label><input type="checkbox" id="favorites-only"> お気に入りのみ</label><label>読書状態 <select id="read-filter"><option value="all">すべて</option><option value="unread">未読</option><option value="reading">読書中</option><option value="read">既読</option></select></label></div><p id="result" role="status"></p><div id="books" class="books"></div></section></main><footer>よむ、きく。 / 本棚から、あたらしい物語へ。</footer>`);
    let genre='すべて';const genres=['すべて',...new Set(data.novels.map(n=>n.genre))];
    function paintGenres(){document.querySelector('#genres').innerHTML=genres.map(g=>`<button class="chip ${g===genre?'selected':''}" aria-pressed="${g===genre}">${esc(g)}</button>`).join('');document.querySelectorAll('#genres button').forEach((b,i)=>b.onclick=()=>{genre=genres[i];paintGenres();paint();});}
    function paint(){
      const query=document.querySelector('#search').value.trim().toLocaleLowerCase(),mode=document.querySelector('#sort').value,filter=document.querySelector('#read-filter').value;
      const list=data.novels.filter(n=>{const count=readCount(n);return(genre==='すべて'||n.genre===genre)&&[n.title,n.author,n.description,...n.tags].join(' ').toLocaleLowerCase().includes(query)&&(!document.querySelector('#favorites-only').checked||book(n.id).favorite)&&(filter==='all'||filter==='unread'&&count===0||filter==='reading'&&count>0&&count<n.count||filter==='read'&&count===n.count);});
      list.sort((a,b)=>mode==='updated'?Date.parse(b.updated)-Date.parse(a.updated):mode==='title'?a.title.localeCompare(b.title,'ja'):b.priority-a.priority||Date.parse(b.updated)-Date.parse(a.updated));
      document.querySelector('#result').textContent=`${list.length} 作品`;
      document.querySelector('#books').innerHTML=list.length?list.map(n=>`<div class="book"><a class="book-main" href="${esc(n.file)}">${cover(n)}<div class="book-info"><span class="category">${esc(n.genre)}</span>${n.priority>0?'<span class="pick">おすすめ</span>':''}<h3>${esc(n.title)}</h3><p class="author">${esc(n.author)}</p><p class="synopsis">${esc(n.description)}</p><div class="tags">${n.tags.map(t=>`<span>#${esc(t)}</span>`).join('')}</div><p class="meta">${esc(n.status)} · 全${n.count}話 · ${esc(n.updated)} 更新</p><span class="read-status">${readLabel(n)} ${readCount(n)}/${n.count}話</span></div></a><button class="favorite" data-book="${esc(n.id)}" aria-label="${esc(n.title)}のお気に入り" aria-pressed="${!!book(n.id).favorite}">${book(n.id).favorite?'★ お気に入り':'☆ お気に入り'}</button></div>`).join(''):'<p class="empty">条件に合う作品はありません。</p>';
      document.querySelectorAll('.favorite').forEach(b=>b.onclick=()=>{changeBook(b.dataset.book,{favorite:!book(b.dataset.book).favorite});paint();});
    }
    document.querySelector('#search').oninput=paint;for(const id of ['sort','favorites-only','read-filter'])document.getElementById(id).onchange=paint;
    paintGenres();paint();voiceRefresh();return;
  }
  const n=data.novel;
  // Migrate the former single-user chapter position only into the default profile.
  if(active==='default'&&book(n.id).chapter===undefined){const old=read(`reading:${n.id}`,null);if(Number.isInteger(old?.chapter))changeBook(n.id,{chapter:old.chapter});}
  let index=0,size=settings().fontSize||18,speechId=0,speaking=false,paused=false;
  app.insertAdjacentHTML('beforeend',`<main class="novel"><section class="novel-hero">${cover(n)}<div><span class="category">${esc(n.genre)} / ${esc(n.status)}</span><h1>${esc(n.title)}</h1><p class="author">${esc(n.author)}</p><p class="description">${esc(n.description)}</p><div class="tags">${n.tags.map(t=>`<span>#${esc(t)}</span>`).join('')}</div><div class="novel-actions"><button class="primary" id="start">はじめから読む →</button><button id="resume">続きから読む</button><button id="favorite" aria-pressed="false"></button><button id="mark-all-read">全話を既読にする</button><button id="mark-all-unread">全話を未読に戻す</button></div><p class="meta">全${n.chapters.length}話 · ${esc(n.updated)} 更新</p><p id="read-summary" class="read-status"></p></div></section><div class="reading-layout"><aside><h2>目次 <small>CONTENTS</small></h2><nav id="toc"></nav></aside><section class="reading"><div class="toolbar"><label>文字 <select id="size"><option value="16">小</option><option value="18">標準</option><option value="21">大</option><option value="24">特大</option></select></label><label>ふりがな <select id="furigana"><option value="on">あり</option><option value="off">なし</option></select></label><button id="listen">▶ 聴く</button><button id="stop">■ 停止</button><label>速度 <select id="rate">${rateOptions()}</select></label><label>声 <select id="voice" aria-label="読み上げの声"></select></label><button id="reset-speech">基本の音声に戻す</button></div><p class="speech-note" id="furigana-status" role="status"></p><p class="speech-note" id="speech-status" role="status">${supported?'音声の種類・オフラインでの利用可否は端末に依存します。':'このブラウザーは読み上げに対応していません。'}</p><div class="chapter-heading"><span id="chapter-number"></span><h2 id="chapter-title"></h2><button id="toggle-read"></button></div><article id="body"></article><div class="chapter-nav"><button id="prev">← 前の話</button><button id="next">次の話 →</button></div></section></div></main><footer>よむ、きく。 / <a href="index.html">作品一覧へ</a></footer>`);
  const body=document.querySelector('#body'),status=document.querySelector('#speech-status');
  function stop(){speechId++;if(supported)speechSynthesis.cancel();speaking=false;paused=false;currentUtterance=null;document.querySelector('#listen').textContent='▶ 聴く';body.querySelectorAll('.speaking').forEach(p=>p.classList.remove('speaking'));}
  stopPlayback=stop;
  function paintProgress(){
    const ids=readIds(n);document.querySelector('#toc').innerHTML=n.chapters.map((c,i)=>`<button ${i===index?'aria-current="page"':''}><small>${String(i+1).padStart(2,'0')}</small>${esc(c.title)}<span class="toc-status">${ids.includes(chapterKey(c))?'既読':'未読'}</span></button>`).join('');
    document.querySelectorAll('#toc button').forEach((b,i)=>b.onclick=()=>show(i,true));
    const seen=ids.includes(chapterKey(n.chapters[index]));const toggle=document.querySelector('#toggle-read');toggle.textContent=seen?'✓ 既読 · 未読に戻す':'未読 · 既読にする';toggle.setAttribute('aria-pressed',String(seen));
    document.querySelector('#read-summary').textContent=`${readLabel(n)} · ${readCount(n)}/${n.chapters.length}話 既読`;
    const favorite=document.querySelector('#favorite');favorite.textContent=book(n.id).favorite?'★ お気に入り':'☆ お気に入り';favorite.setAttribute('aria-pressed',String(!!book(n.id).favorite));
  }
  function show(i,scroll=false){
    stop();if(!Number.isInteger(i))i=0;index=Math.max(0,Math.min(n.chapters.length-1,i));body.innerHTML=n.chapters[index].html;
    const first=body.querySelector('h1');if(first&&first.textContent===n.chapters[index].title)first.remove();
    document.querySelector('#chapter-number').textContent=`EPISODE ${String(index+1).padStart(2,'0')} / ${n.chapters.length}`;document.querySelector('#chapter-title').textContent=n.chapters[index].title;
    document.querySelector('#prev').disabled=index===0;document.querySelector('#next').disabled=index===n.chapters.length-1;
    history.replaceState(null,'',`#chapter-${index+1}`);changeBook(n.id,{chapter:index,chapterId:chapterKey(n.chapters[index])});paintProgress();if(scroll)document.querySelector('.reading').scrollIntoView({behavior:'smooth'});
  }
  function resumeIndex(){const saved=book(n.id);const match=n.chapters.findIndex(c=>chapterKey(c)===saved.chapterId);return match>=0?match:saved.chapter||0;}
  const hash=useHash?location.hash.match(/^#chapter-(\d+)$/):null;show(hash?Number(hash[1])-1:resumeIndex());
  document.querySelector('#start').onclick=()=>show(0,true);document.querySelector('#resume').onclick=()=>show(resumeIndex(),true);
  document.querySelector('#prev').onclick=()=>show(index-1,true);document.querySelector('#next').onclick=()=>show(index+1,true);
  document.querySelector('#favorite').onclick=()=>{changeBook(n.id,{favorite:!book(n.id).favorite});paintProgress();};
  document.querySelector('#toggle-read').onclick=()=>{const ids=new Set(readIds(n)),id=chapterKey(n.chapters[index]);if(ids.has(id))ids.delete(id);else ids.add(id);changeBook(n.id,{read:[...ids]});paintProgress();};
  document.querySelector('#mark-all-read').onclick=()=>{changeBook(n.id,{read:n.chapters.map(chapterKey)});paintProgress();};
  document.querySelector('#mark-all-unread').onclick=()=>{changeBook(n.id,{read:[]});paintProgress();};
  const furigana=document.querySelector('#furigana');furigana.value=settings().furigana||'off';let fontRequest=0;
  async function setFurigana(){
    const request=++fontRequest;changeSettings({furigana:furigana.value});const on=furigana.value==='on';body.classList.toggle('no-furigana',!on);body.style.fontFamily=on&&data.fontMode==='system'?"'FurifontOptional', serif":'';
    const note=document.querySelector('#furigana-status');note.textContent='';
    if(on&&data.fontMode==='system'){
      if(!data.furiganaFontUrl){body.classList.add('no-furigana');body.style.fontFamily='';note.textContent='ふりがな用フォントがありません。サイトを再生成してください。';return;}
      if(!document.querySelector('#optional-furigana-font')){const style=document.createElement('style');style.id='optional-furigana-font';style.textContent=`@font-face{font-family:'FurifontOptional';src:url('${data.furiganaFontUrl}') format('woff2');font-display:swap}`;document.head.append(style);}
      note.textContent='ふりがな用フォントを読み込んでいます…';
      try{if(document.fonts)await document.fonts.load('18px FurifontOptional');if(request===fontRequest)note.textContent='ふりがなは自動表示のため、固有名詞や文脈で読みが誤ることがあります。';}
      catch{if(request===fontRequest){body.classList.add('no-furigana');body.style.fontFamily='';note.textContent='フォントを読み込めませんでした。HTMLと同じ公開先に assets/ を配置してください。';}}
    }else if(on)note.textContent='ふりがなは自動表示のため、固有名詞や文脈で読みが誤ることがあります。';
  }
  if(data.fontMode==='system'&&data.furiganaFontUrl)document.querySelector('#furigana-status').insertAdjacentHTML('afterend','<p class="speech-note"><a href="assets/font-license.txt">Furifontのライセンス・出典</a></p>');
  furigana.onchange=setFurigana;setFurigana();
  body.style.fontSize=`${size}px`;document.querySelector('#size').value=String(size);document.querySelector('#size').onchange=e=>{size=Number(e.target.value);body.style.fontSize=`${size}px`;changeSettings({fontSize:size});};
  refreshToolbar=()=>{const prefs=speechPrefs(n.id);fillVoices(document.querySelector('#voice'),prefs.voiceURI);document.querySelector('#rate').value=String(prefs.rate);};
  function changeSpeech(){stop();changeBook(n.id,{speech:{voiceURI:document.querySelector('#voice').value,rate:Number(document.querySelector('#rate').value)}});}
  document.querySelector('#voice').onchange=changeSpeech;document.querySelector('#rate').onchange=changeSpeech;document.querySelector('#reset-speech').onclick=()=>{stop();changeBook(n.id,{speech:null});refreshToolbar();};
  // null means inherit the user's basic voice rather than override it.
  function speak(){
    if(!supported)return;if(speaking){if(paused){speechSynthesis.resume();paused=false;}else{speechSynthesis.pause();paused=true;}document.querySelector('#listen').textContent=paused?'▶ 再開':'Ⅱ 一時停止';return;}
    stop();speaking=true;const current=++speechId;
    const blocks=[...body.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,pre')].filter(el=>!el.querySelector('p,li,blockquote,pre'));
    const queue=blocks.flatMap(el=>(el.textContent.match(/[^。！？\n]{1,100}[。！？\n]?/gu)||[]).map(text=>({text,el})));let pos=0;
    function next(){if(current!==speechId)return;body.querySelectorAll('.speaking').forEach(p=>p.classList.remove('speaking'));if(pos>=queue.length){stop();status.textContent='この話の読み上げが終わりました。';return;}const part=queue[pos++];part.el.classList.add('speaking');const u=utterance(part.text,speechPrefs(n.id));u.onend=next;u.onerror=e=>{if(current===speechId&&e.error!=='canceled'&&e.error!=='interrupted'){stop();status.textContent=`読み上げできませんでした (${e.error})。端末の音声設定をご確認ください。`;}};speechSynthesis.speak(u);}
    status.textContent='読み上げ中：本文の段落を順番に読みます。';document.querySelector('#listen').textContent='Ⅱ 一時停止';next();
  }
  document.querySelector('#listen').onclick=speak;document.querySelector('#stop').onclick=()=>{stop();status.textContent='読み上げを停止しました。';};
  if(!supported)for(const id of ['listen','stop','voice','rate','reset-speech'])document.getElementById(id).disabled=true;
  voiceRefresh();
}
function rateOptions(){return [0.8,1,1.2,1.5,2].map(r=>`<option value="${r}">${r.toFixed(1)}×</option>`).join('');}
if(supported){voices=speechSynthesis.getVoices();speechSynthesis.addEventListener('voiceschanged',()=>{voices=speechSynthesis.getVoices();voiceRefresh();});}
window.addEventListener('pagehide',()=>stopPlayback());
renderApp();
})();
