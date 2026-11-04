import {createOgdenSpeech} from './speech.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const speech=createOgdenSpeech();let items=[],progress=[],review=[],savePending=false;let wordQuery='',wordLimit=20;const retryRequests=new Map();
const routes=[['','学习首页'],['words','核心词'],['operators','18操作词'],['patterns','简化句型'],['build','词语组合'],['express','我能表达什么'],['listening','听力'],['speaking','开口表达'],['review','待复习'],['progress','学习进度']];
const page=location.pathname.split('/')[2]||'';
const notify=s=>{$('#feedback').textContent=s;};
async function request(path,method='GET',body){const r=await fetch('/api'+path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){const error=new Error(data.error);error.status=r.status;throw error;}return data;}
const state=id=>progress.find(p=>p.item_id===id);
const states={learned:'已学习',mastered:'已掌握',unmastered:'未掌握',review:'待复习'};
function sound(text){return `<div class="actions"><button data-say="${esc(text)}">正常播放</button><button data-say="${esc(text)}" data-slow>慢速合成请求</button><button data-say="${esc(text)}" data-repeat>重复播放</button><button data-stop>停止</button></div>`;}
function assessment(x,mode){return `<p class="muted">我对这条内容的自评（与1.0分开保存）</p><div class="actions">${Object.entries(states).map(([v,l])=>`<button data-save="${x.id}" data-status="${v}" data-mode="${mode}" ${state(x.id)?.status===v?'aria-pressed="true"':''}>${l}</button>`).join('')}</div><p class="tag" data-state="${x.id}">${state(x.id)?'当前：'+states[state(x.id).status]:'尚未记录'}</p>`;}
function references(x){return (x.answers||x.examples?.map(e=>e.english)||[x.english]).map(t=>`<p lang="en">${esc(t)}</p>${sound(t)}`).join('');}
function patternPractice(x){
 const first=x.variants[0];
 return `<section class="pattern-practice" data-pattern="${x.id}"><h3>换一换，再自己说</h3><p>听例句 → 看意思 → 选择替换 → 隐藏英文 → 自己说 → 查看参考。</p><label>选择想表达的意思<select data-variant="${x.id}">${x.variants.map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</select></label><p data-variant-zh>${esc(first.chinese)}</p><p data-variant-en lang="en">${esc(first.english)}</p><div data-variant-audio>${sound(first.english)}</div><div class="actions"><button data-hide-variant aria-pressed="false">隐藏英文，自己说</button><button data-show-variant>查看参考表达</button></div><p class="muted">这些替换句已由开发者逐条自查，不会把任意新组合当作正确答案。</p></section>`;
}
function card(x,mode='study'){
 const hide=mode==='listening',express=['express','speaking'].includes(mode),text=x.examples?.[0]?.english||x.english;
 return `<article data-item="${x.id}"><p class="tag">${x.reviewStatus==='approved'?(x.reviewMethod==='developer-self-check'?'开发者自查通过':'审核通过'):'草稿'} · ${esc(x.kind)}${x.level?' · 第'+x.level+'层':''}</p>${hide?'<h2>先听后看</h2>':`<h2 ${express?'':'lang="en"'}>${esc(express?x.chinese:x.english)}</h2>`}${hide?sound(text):''}${!hide&&!express?`<p>${esc(x.chinese)}</p>`:''}${x.note?`<p>${esc(x.note)}</p>`:''}${x.kind==='operator'?`<p><a href="/ogden/operators/${esc(x.english)}">打开 ${esc(x.english)} 独立学习页</a></p>`:''}${x.kind==='word'?`<p class="muted">${x.isOgdenOriginal?'历史词表对照：学术重印与转录已核查。':'现代单列词：未冒称历史850词的独立词头。'}美式主读音由本地语音提供；真机音质待验收。</p>`:''}
 ${express?`<label>先自己说，也可以写下表达（仅保留在当前页面）<textarea aria-label="我的英语表达" placeholder="试着用你会的英语表达"></textarea></label><p class="muted">不录音、不上传答案、不自动判错。参考句不是唯一答案。</p>`:''}
 ${x.kind==='expression'?`<p class="muted">练习可使用的辅助词：${esc(x.supportWords.join('、'))}。其中可能有词形变化或未收录的词；练习出现的辅助词不会自动增加核心词统计。</p>`:''}
 ${x.kind==='pattern'&&mode==='study'?patternPractice(x):''}
 ${x.kind==='combination'&&mode==='build'?`<p>点选词块，排列出上面的组合；只使用这条已编写的组合。</p><div class="tokens">${[...x.tokens].reverse().map((t,i)=>`<button data-token="${esc(t)}" data-index="${i}">${esc(t)}</button>`).join('')}</div><p data-built aria-live="polite"></p><button data-reset>重新排列</button><button data-check="${esc(x.english)}">查看组合提示</button>`:''}
 <details><summary>${hide?'查看中英文与参考表达':express?'查看多种参考表达':'查看组合、例句与替换提示'}</summary>${hide?`<div class="actions"><button data-toggle-copy="en" aria-pressed="false">显示英文</button><button data-toggle-copy="zh" aria-pressed="false">显示中文</button></div><p data-listening-en lang="en" hidden>${esc(text)}</p><p data-listening-zh hidden>${esc(x.examples?.[0]?.chinese||x.chinese)}</p>`:''}${(x.combinations||[]).map(c=>`<p><span lang="en">${esc(c.english)}</span> · ${esc(c.chinese)}</p>`).join('')}${hide?'':references(x)}${x.kind==='pattern'?'<p>听句子 → 看意思 → 替换词 → 合上参考 → 自己说。先使用已经写好的例句，不把随意替换视为正确教材。</p>':''}</details>
 ${assessment(x,mode)}</article>`;
}
function list(values,mode){return values.length?`<div class="grid">${values.map(x=>card(x,mode)).join('')}</div>`:'<div class="panel">暂无内容。可以自由选择其他练习。</div>';}
function matchingWords(){const q=wordQuery.trim().toLowerCase();return items.filter(x=>x.kind==='word'&&(!q||x.english.toLowerCase().includes(q)||x.chinese.includes(q)));}
function wordResults(){const found=matchingWords();return `<p>${found.length}个核心词，当前显示${Math.min(wordLimit,found.length)}个。可自由继续学习，没有每日限额。</p>`+list(found.slice(0,wordLimit),'study');}
function render(){
 speech.stop();$('#nav').innerHTML=routes.map(([r,label])=>`<a href="/ogden${r?'/'+r:''}" ${page===r?'aria-current="page"':''}>${label}</a>`).join('');
 let html='';
 if(!page){const last=progress[0],next=items.find(x=>x.id===last?.item_id)||items[0];html=`<h2>今天想表达什么？</h2><div class="paths"><a href="/ogden/${next?.kind==='word'?'words':'express'}">继续学习${next?' · '+esc(next.english):''}</a><a href="/ogden/build">词语组合 · 一个词，多种意思</a><a href="/ogden/express">我能表达什么 · 自己组织英语</a><a href="/ogden/review">待复习 · ${review.length}条</a></div><h2>四条自由学习路径</h2><ol><li><a href="/ogden/words">核心表达</a>：核心词 → 操作词 → 组合 → 句型</li><li><a href="/ogden/express">独立表达</a>：模仿 → 独立组合 → 简单解释</li><li><a href="/ogden/express?scenario=life">生活交流</a>：日常与少量简单工作表达</li><li><a href="/ogden/listening">听说复习</a>：先听 → 跟读 → 自评 → 主动复习</li></ol><p>四条路径共用2.0条目状态；没有每日限额或强制过关。</p>`;}
 else if(page==='progress'){html=`<h2>2.0独立学习进度</h2><p>共有 ${progress.length} 条内容记录，${progress.filter(x=>x.status==='mastered'&&items.find(i=>i.id===x.item_id)?.kind==='word').length} 个核心词自评已掌握。操作词页与核心词页使用同一个词条状态。</p><div class="panel">${Object.entries(states).map(([key,label])=>`<p>${label}：${progress.filter(x=>x.status===key).length}</p>`).join('')}</div><p>表达、听力、开口等练习留有独立事件；统计不代表经系统验证的英语能力。</p>`;}
 else if(page==='review'){html='<h2>先复习还不会的内容</h2><p>优先未掌握与待复习，再复习到期内容；可以随时主动学习。</p>'+list(review.map(r=>r.payload),'study');}
 else if(page==='express'||page==='speaking'){
 const mastered=new Set(progress.filter(p=>p.status==='mastered').map(p=>p.item_id));
 let tasks=items.filter(x=>x.kind==='expression');if(new URLSearchParams(location.search).get('scenario')==='life')tasks=tasks.filter(x=>x.scenario==='life');
 tasks.sort((a,b)=>Number(b.wordIds.every(id=>mastered.has(id))&&b.patternIds.every(id=>mastered.has(id)))-Number(a.wordIds.every(id=>mastered.has(id))&&a.patternIds.every(id=>mastered.has(id)))||a.level-b.level);
 html=`<h2>${page==='speaking'?'先尝试说，再看参考':'我能表达什么'}</h2><p>按本批已掌握的关联词与句型优先推荐；辅助词可能尚未学过，不保证全部用词已掌握。</p><p>第一层模仿表达 · 第二层独立组合 · 第三层用简单英语解释。允许多种正确表达，请对照意思自评。</p>`+list(tasks,page==='speaking'?'speaking':'express');
 }else if(page==='listening'){html='<h2>听懂意思，再试着说</h2><p>中英文默认隐藏，点击查看后自行判断是否理解。慢速是浏览器语速请求，不保证设备执行。</p>'+list(items.filter(x=>x.kind==='pattern'),'listening');}
 else {const kind={words:'word',operators:'operator',patterns:'pattern',build:'combination'}[page];let values=items.filter(x=>x.kind===kind);if(kind==='operator'){const selected=location.pathname.split('/')[3];if(selected)values=values.filter(x=>x.english===selected);values=values.map(x=>({...x,id:x.wordId,kind:'operator'}));}html=`<h2>${routes.find(r=>r[0]===page)?.[1]||''}</h2>${kind==='operator'?'<p>18操作词的功能不同：be、do、have 可有辅助作用；may、will 是情态词。各页与对应核心词共用状态。</p>':''}`+(kind==='word'?`<label>搜索核心词<input id="word-search" type="search" value="${esc(wordQuery)}" placeholder="输入英文或中文"></label><div id="word-results">${wordResults()}</div><button id="word-more" ${matchingWords().length<=wordLimit?'disabled':''}>继续显示更多核心词</button>`:list(values,kind==='combination'?'build':'study'));}
 $('#content').innerHTML=html;bind();
}
function bind(){
 const updateWords=()=>{$('#word-results').innerHTML=wordResults();$('#word-more').disabled=matchingWords().length<=wordLimit;bind();};
 if($('#word-search'))$('#word-search').oninput=e=>{wordQuery=e.target.value;wordLimit=20;updateWords();};
 if($('#word-more'))$('#word-more').onclick=()=>{wordLimit+=20;updateWords();};

 document.querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>speech.play(b.dataset.say,{slow:b.hasAttribute('data-slow'),repeat:b.hasAttribute('data-repeat'),notify}));
 document.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{speech.stop();notify('已停止播放。');});
 document.querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{
  if(savePending)return;savePending=true;document.querySelectorAll('[data-save]').forEach(x=>x.disabled=true);
  const key=b.dataset.save,pending=retryRequests.get(key);
  if(!pending||pending.mode!==b.dataset.mode||pending.status!==b.dataset.status)retryRequests.set(key,{mode:b.dataset.mode,status:b.dataset.status,requestId:crypto.randomUUID()});
  try{
   await request('/ogden/results','POST',{item_id:b.dataset.save,status:b.dataset.status,mode:b.dataset.mode,request_id:retryRequests.get(key).requestId});
   retryRequests.delete(key);
   const a=b.closest('article');a.querySelector('[data-state]').textContent='当前：'+states[b.dataset.status];a.querySelectorAll('[data-save]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
   try{await refresh();notify('已保存2.0自评和复习时间。');}catch{notify('已保存；暂时无法刷新统计，请稍后刷新页面。');}
  }catch(e){notify('尚未确认保存，请重试（重复请求不会重复计数）：'+e.message);}
  finally{savePending=false;document.querySelectorAll('[data-save]').forEach(x=>x.disabled=false);}
 });
 document.querySelectorAll('[data-variant]').forEach(select=>select.onchange=()=>{
  speech.stop();const x=items.find(x=>x.id===select.dataset.variant),v=x.variants.find(v=>v.id===select.value),section=select.closest('[data-pattern]');
  section.querySelector('[data-variant-zh]').textContent=v.chinese;section.querySelector('[data-variant-en]').textContent=v.english;
  section.querySelectorAll('[data-say]').forEach(b=>b.dataset.say=v.english);
  // Changing the meaning keeps English hidden until the learner chooses to reveal it.
 });
 document.querySelectorAll('[data-hide-variant]').forEach(b=>b.onclick=()=>{const en=b.closest('[data-pattern]').querySelector('[data-variant-en]');en.hidden=!en.hidden;b.setAttribute('aria-pressed',String(en.hidden));b.textContent=en.hidden?'显示英文':'隐藏英文，自己说';});
 document.querySelectorAll('[data-show-variant]').forEach(b=>b.onclick=()=>{const section=b.closest('[data-pattern]');section.querySelector('[data-variant-en]').hidden=false;section.querySelector('[data-hide-variant]').setAttribute('aria-pressed','false');section.querySelector('[data-hide-variant]').textContent='隐藏英文，自己说';});
 document.querySelectorAll('[data-toggle-copy]').forEach(b=>b.onclick=()=>{const node=b.closest('article').querySelector(b.dataset.toggleCopy==='en'?'[data-listening-en]':'[data-listening-zh]');node.hidden=!node.hidden;b.setAttribute('aria-pressed',String(!node.hidden));b.textContent=(node.hidden?'显示':'隐藏')+(b.dataset.toggleCopy==='en'?'英文':'中文');});
 document.querySelectorAll('[data-token]').forEach(b=>b.onclick=()=>{b.disabled=true;const out=b.closest('article').querySelector('[data-built]');out.textContent+=(out.textContent?' ':'')+b.dataset.token;});
 document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>{const a=b.closest('article');a.querySelector('[data-built]').textContent='';a.querySelectorAll('[data-token]').forEach(t=>t.disabled=false);});
 document.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>notify(b.closest('article').querySelector('[data-built]').textContent===b.dataset.check?'与这条教材组合一致。':'这次排列与教材不同。可以重新排列或查看参考；这不是自由表达评分。'));
}
async function refresh(){[progress,review]=await Promise.all([request('/ogden/progress').then(r=>r.progress),request('/ogden/review').then(r=>r.items)]);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)speech.stop();});addEventListener('pagehide',()=>speech.stop());
(async()=>{try{items=(await request('/ogden/catalog')).items;await refresh();render();}catch(e){$('#content').innerHTML=e.status===401?'<div class="panel"><h2>使用现有账号登录</h2><p>2.0开发预览共用1.0账号。请先在1.0登录，然后回到这里。</p><a href="/">前往1.0登录 / 注册</a></div>':`<div class="panel"><h2>暂时无法读取2.0预览</h2><p>${esc(e.message)}</p><p>请确认已运行本地预览初始化。未安装教材时不会生成虚假内容。</p></div>`;}})();
