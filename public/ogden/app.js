import {continueTarget,prioritizeTasks,modeLabels} from './learning.js';
import {createOgdenSpeech} from './speech.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const speech=createOgdenSpeech();let items=[],progress=[],review=[],domains=[],modeProgress=[],analytics={shared:[],practice:[],recent:[]},savePending=false;let wordQuery=new URLSearchParams(location.search).get('q')||'',wordLimit=20;let listeningLimit=20;let buildOperator=new URLSearchParams(location.search).get('operator')||'';const retryRequests=new Map();
const routes=[['','学习首页'],['words','核心词'],['operators','18操作词'],['patterns','简化句型'],['build','词语组合'],['express','我能表达什么'],['listening','听力'],['speaking','开口表达'],['review','待复习'],['progress','学习进度']];
const page=location.pathname.split('/')[2]||'';
const notify=s=>{$('#feedback').textContent=s;};
async function request(path,method='GET',body){const r=await fetch('/api'+path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){const error=new Error(data.error);error.status=r.status;throw error;}return data;}
const state=id=>progress.find(p=>p.item_id===id);
const states={learned:'已学习',mastered:'已掌握',unmastered:'未掌握',review:'待复习'};
function sound(text){return `<div class="actions"><button data-say="${esc(text)}">正常播放</button><button data-say="${esc(text)}" data-slow>慢速合成请求</button><button data-say="${esc(text)}" data-repeat>重复播放</button><button data-stop>停止</button></div>`;}
function assessment(x,mode,reviewState){
 const current=reviewState??(mode==='study'?state(x.id)?.status:modeProgress.find(p=>p.item_id===x.id&&p.mode===mode)?.status);
 return `<p class="muted">我对这条内容的自评（${modeLabels[mode]}模式，与1.0分开保存）</p><div class="actions">${Object.entries(states).map(([v,l])=>`<button data-save="${x.id}" data-status="${v}" data-mode="${mode}" ${current===v?'aria-pressed="true"':''}>${l}</button>`).join('')}</div><p class="tag" data-state="${x.id}">${current?'当前：'+states[current]:'本模式尚未记录'}</p>${mode!=='study'?`<p class="tag">词条总状态：${states[state(x.id)?.status]||'尚未记录'}；本模式的复习单独保存。</p>`:''}`;
}
function references(x){return (x.answers?x.answers.map(english=>({english})):x.examples||[{english:x.english,chinese:x.chinese}]).map(e=>`<p lang="en">${esc(e.english)}</p>${e.chinese?`<p>${esc(e.chinese)}</p>`:''}${sound(e.english)}`).join('');}
function patternPractice(x){
 const first=x.variants[0];
 return `<section class="pattern-practice" data-pattern="${x.id}"><h3>换一换，再自己说</h3><p>听例句 → 看意思 → 选择替换 → 隐藏英文 → 自己说 → 查看参考。</p><label>选择想表达的意思<select data-variant="${x.id}">${x.variants.map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</select></label><p data-variant-zh>${esc(first.chinese)}</p><p data-variant-en lang="en">${esc(first.english)}</p><div data-variant-audio>${sound(first.english)}</div><div class="actions"><button data-hide-variant aria-pressed="false">隐藏英文，自己说</button><button data-show-variant>查看参考表达</button></div><p class="muted">这些替换句已由开发者逐条自查，不会把任意新组合当作正确答案。</p></section>`;
}
function card(x,mode='study',reviewState){
 const hide=mode==='listening',express=['express','speaking'].includes(mode),text=x.examples?.[0]?.english||x.english;
 return `<article id="${x.id}" tabindex="-1" data-item="${x.id}" data-replacement="${x.kind==='expression'&&x.level===2}"><p class="tag">${x.reviewStatus==='approved'?(x.reviewMethod==='developer-self-check'?'开发者自查通过':'审核通过'):'草稿'} · ${({word:'核心词',operator:'操作词',pattern:'句型',combination:'组合',expression:'表达任务'})[x.kind]}${x.level?' · 第'+x.level+'层':''}</p>${hide?'<h2>先听后看</h2>':`<h2 ${express?'':'lang="en"'}>${esc(express?x.chinese:x.english)}</h2>`}${hide||express?sound(text):''}${!hide&&!express?`<p>${esc(x.chinese)}</p>`:''}${x.note?`<p>${esc(x.note)}</p>`:''}${x.kind==='operator'?`<p><a href="/ogden/operators/${esc(x.english)}">打开 ${esc(x.english)} 独立学习页</a> · <a href="/ogden/build?operator=${esc(x.english)}">练习这些组合</a></p>`:''}${x.kind==='word'?`<p class="muted">${x.isOgdenOriginal?'历史词表对照：学术重印与转录已核查。':'现代单列词：未冒称历史850词的独立词头。'}美式主读音由本地语音提供；真机音质待验收。</p>`:''}
 ${x.kind==='word'&&!hide?`<details><summary>读音标注与常见词形</summary><p lang="en">${esc(x.pronunciation.arpabet)}</p><p class="muted">美式CMU音素标记：1为主重读，2为次重读，0为非重读。标注来自Carnegie Mellon University词典；下面的声音由本机语音提供。<a href="/ogden/cmudict-license">词典许可</a></p><p>适用场景：${esc(x.scenarioIds.map(id=>domains.find(d=>d.id===id)?.label||id).join('、'))}</p>${x.forms?.length?`<p>常见词形：${esc(x.forms.join('、'))}（共用本词条，不另计核心词）</p>`:''}</details>${!x.pronunciation.contextPlayback?sound(x.english):'<p>这个词有多种读音，请听下面的完整例句，当前教学用法只选一个主读。</p>'}`:''}
 ${express?`<label>先自己说，也可以写下表达（仅保留在当前页面）<textarea aria-label="我的英语表达" placeholder="试着用你会的英语表达"></textarea></label><p class="muted">不录音、不上传答案、不自动判错。参考句不是唯一答案。</p>`:''}
 ${x.kind==='expression'&&x.supportWords?.length?`<p class="muted">提示词：${esc(x.supportWords.join('、'))}。这些词可能还没学过，可以先听参考表达。</p>`:''}
 ${x.kind==='pattern'&&mode==='study'?patternPractice(x):x.kind==='expression'&&x.level===2&&express?patternPractice(items.find(p=>p.id===x.variantPatternId)):''}
 ${express?`<p class="muted">${x.level===1?'先看参考模仿，再合上参考自己说。':x.level===2?'选择已经编写好的替换句，听一听，再隐藏英文自己说。':x.level===3?'先用学过的词自主表达，再对照多种参考自评。':'不必说出陌生的术语，先用简单英语解释清楚意思。'}</p>`:''}
 ${x.kind==='combination'&&mode==='build'?`<p>点选词块，排列出上面的组合；只使用这条已编写的组合。</p><div class="tokens">${[...x.tokens].reverse().map((t,i)=>`<button data-token="${esc(t)}" data-index="${i}">${esc(t)}</button>`).join('')}</div><p data-built aria-live="polite"></p><button data-reset>重新排列</button><button data-check="${esc(x.english)}">查看组合提示</button>`:''}
 <details><summary>${hide?'查看中英文与参考表达':express?'查看多种参考表达':'查看组合、例句与替换提示'}</summary>${hide?`<div class="actions"><button data-toggle-copy="en" aria-pressed="false">显示英文</button><button data-toggle-copy="zh" aria-pressed="false">显示中文</button></div><p data-listening-en lang="en" hidden>${esc(text)}</p><p data-listening-zh hidden>${esc(x.examples?.[0]?.chinese||x.chinese)}</p>`:''}${(x.combinations||[]).map(c=>`<p><span lang="en">${esc(c.english)}</span> · ${esc(c.chinese)}</p>${(c.examples||[]).map(e=>`<p lang="en">${esc(e.english)}</p><p>${esc(e.chinese)}</p>${sound(e.english)}`).join('')}`).join('')}${hide?'':express&&x.level===2?'<p>请对照上方当前选择的中文与英文自评；也允许其他正确说法。</p>':references(x)}${x.kind==='pattern'?'<p>听句子 → 看意思 → 替换词 → 合上参考 → 自己说。先使用已经写好的例句，不把随意替换视为正确教材。</p>':''}</details>
 ${assessment(x,mode,reviewState)}</article>`;
}
function list(values,mode){return values.length?`<div class="grid">${values.map(x=>card(x,mode)).join('')}</div>`:'<div class="panel">暂无内容。可以自由选择其他练习。</div>';}
function matchingWords(){const q=wordQuery.trim().toLowerCase();return items.filter(x=>x.kind==='word'&&(!q||x.english.toLowerCase().includes(q)||x.chinese.includes(q)));}
function wordResults(){const found=matchingWords();return `<p>${found.length}个核心词，当前显示${Math.min(wordLimit,found.length)}个。可自由继续学习，没有每日限额。</p>`+list(found.slice(0,wordLimit),'study');}
function render(){
 speech.stop();$('#nav').innerHTML=routes.map(([r,label])=>`<a href="/ogden${r?'/'+r:''}" ${page===r?'aria-current="page"':''}>${label}</a>`).join('');
 let html='';
 if(!page){const last=analytics.recent[0]||progress[0],next=items.find(x=>x.id===(last?.item_id))||items.find(x=>x.kind==='word');html=`<h2>今天想表达什么？</h2><div class="paths"><a href="${continueTarget(next,last?.mode)}">继续学习${next?' · '+esc(next.english):''}</a><a href="/ogden/build">词语组合 · 一个词，多种意思</a><a href="/ogden/express">我能表达什么 · 自己组织英语</a><a href="/ogden/review">待复习 · ${review.length}条</a></div><h2>四条自由学习路径</h2><ol><li><a href="/ogden/words">核心表达</a>：核心词 → 操作词 → 组合 → 句型</li><li><a href="/ogden/express">独立表达</a>：模仿 → 替换 → 自主表达 → 简单改述</li><li><a href="/ogden/express?scenario=life">生活交流</a>：日常与少量简单工作表达</li><li><a href="/ogden/listening">听说复习</a>：先听 → 跟读 → 自评 → 主动复习</li></ol><p>四条路径共用2.0条目状态；没有每日限额或强制过关。</p>`;}
 else if(page==='progress'){html=`<h2>2.0独立学习进度</h2><p>共有 ${progress.length} 条内容记录，${progress.filter(x=>x.status==='mastered'&&items.find(i=>i.id===x.item_id)?.kind==='word').length} 个核心词自评已掌握。操作词页与核心词页使用同一个词条状态。</p><div class="panel">${Object.entries(states).map(([key,label])=>`<p>${label}：${progress.filter(x=>x.status===key).length}</p>`).join('')}</div><h3>按练习模式查看</h3><div class="panel">${analytics.practice.length?analytics.practice.map(p=>`<p>${modeLabels[p.mode]}：练习${p.attempts}次，${p.practiced}条内容，未掌握${p.weak}条，待复习${p.due}条。<a href="/ogden/review?mode=${p.mode}">进入复习</a></p>`).join(''):'尚无练习记录。'}</div><p>同一核心词只计算一次掌握；听力、开口等模式独立保留练习和复习时间。统计来自活动教材的自评，不是系统能力评分。</p>`;}
 else if(page==='review'){
 const params=new URLSearchParams(location.search),selectedMode=params.get('mode')||'all',selectedKind=params.get('kind')||'all',scope=params.get('all')==='true'?'all':params.get('status')==='unmastered'?'weak':params.get('status')==='review'?'marked':'due';
 html='<h2>先复习还不会的内容</h2><p>总掌握状态共用，练习模式的薄弱项和复习时间分别保存。也可以选择全部已学内容提前复习。</p>'+
 `<div class="panel"><label>练习模式<select id="review-mode"><option value="all">全部模式</option>${Object.entries(modeLabels).map(([v,l])=>`<option value="${v}" ${selectedMode===v?'selected':''}>${l}</option>`).join('')}</select></label><label>教材类型<select id="review-kind"><option value="all">全部类型</option>${Object.entries({word:'核心词',operator:'18操作词',pattern:'句型',combination:'组合',expression:'表达任务'}).map(([v,l])=>`<option value="${v}" ${selectedKind===v?'selected':''}>${l}</option>`).join('')}</select></label><label>复习范围<select id="review-scope"><option value="due" ${scope==='due'?'selected':''}>薄弱与到期</option><option value="weak" ${scope==='weak'?'selected':''}>仅未掌握</option><option value="marked" ${scope==='marked'?'selected':''}>主动标记待复习</option><option value="all" ${scope==='all'?'selected':''}>全部已学，随时复习</option></select></label></div><p>${review.length}条内容</p>`+
 (review.length?`<div class="grid">${review.map(r=>`${r.review_modes?.length?`<p>待复习模式：${r.review_modes.map(m=>modeLabels[m]).join('、')}</p>`:''}${card(r.payload,selectedMode==='all'?'study':selectedMode,selectedMode==='all'?undefined:r.status)}`).join('')}</div>`:'<div class="panel">当前范围没有待复习内容，可以选择全部已学或自由练习。</div>');
 }
 else if(page==='express'||page==='speaking'){
 const params=new URLSearchParams(location.search),selectedDomain=params.get('domain')||'',selectedLevel=params.get('level')||'';
 let tasks=items.filter(x=>x.kind==='expression');if(params.get('scenario')==='life')tasks=tasks.filter(x=>x.scenario==='life');
 if(selectedDomain)tasks=tasks.filter(x=>x.domain===selectedDomain);if(selectedLevel)tasks=tasks.filter(x=>x.level===Number(selectedLevel));
 tasks=prioritizeTasks(tasks,progress);
 const filters=`<div class="panel"><label>表达场景<select id="task-domain"><option value="">全部场景</option>${domains.map(d=>`<option value="${d.id}" ${selectedDomain===d.id?'selected':''}>${esc(d.label)}</option>`).join('')}</select></label><label>表达层级<select id="task-level"><option value="">全部层级</option>${[1,2,3,4].map(v=>`<option value="${v}" ${selectedLevel===String(v)?'selected':''}>第${v}层</option>`).join('')}</select></label></div>`;
 html=`<h2>${page==='speaking'?'先尝试说，再看参考':'我能表达什么'}</h2><p>按本批已掌握的关联词与句型优先推荐；辅助词可能尚未学过，不保证全部用词已掌握。</p><p>第一层模仿表达 · 第二层替换表达 · 第三层自主表达 · 第四层简单英语改述。允许多种正确表达，请对照意思自评。</p>`+filters+list(tasks,page==='speaking'?'speaking':'express');
 }else if(page==='listening'){
 const params=new URLSearchParams(location.search),kind=params.get('kind')||'pattern',target=params.get('item');
 let clips=items.filter(x=>x.kind===kind);if(target)clips.sort((a,b)=>Number(b.id===target)-Number(a.id===target));
 html='<h2>听懂意思，再试着说</h2><p>中英文默认隐藏，点击查看后自评是否理解。慢速是浏览器语速请求，不保证设备执行。</p>'+`<label>听力教材<select id="listening-kind">${Object.entries({word:'核心词例句',pattern:'句型',combination:'词语组合',expression:'生活表达'}).map(([v,l])=>`<option value="${v}" ${kind===v?'selected':''}>${l}</option>`).join('')}</select></label>`+`<p>${clips.length}条，可自由继续。当前显示${Math.min(listeningLimit,clips.length)}条。</p>`+list(clips.slice(0,listeningLimit),'listening')+`<button id="listening-more" ${clips.length<=listeningLimit?'disabled':''}>继续显示更多听力内容</button>`;
 }
 else {const kind={words:'word',operators:'operator',patterns:'pattern',build:'combination'}[page];let values=items.filter(x=>x.kind===kind);if(kind==='combination'&&buildOperator)values=values.filter(x=>x.operatorWordId==='ow-'+buildOperator);if(kind==='operator'){const selected=location.pathname.split('/')[3];if(selected)values=values.filter(x=>x.english===selected);values=values.map(x=>({...x,id:x.wordId,kind:'operator'}));}html=`<h2>${routes.find(r=>r[0]===page)?.[1]||''}</h2>${kind==='operator'?'<p>18操作词的功能不同：be、do、have 可有辅助作用；may、will 是情态词。各页与对应核心词共用状态。</p>':''}`+(kind==='combination'?`<label>选择操作词组合<select id="build-operator"><option value="">全部操作词</option>${items.filter(x=>x.kind==='operator').map(op=>`<option value="${op.english}" ${buildOperator===op.english?'selected':''}>${op.english} · ${esc(op.chinese)}</option>`).join('')}</select></label>`:'')+(kind==='word'?`<label>搜索核心词<input id="word-search" type="search" value="${esc(wordQuery)}" placeholder="输入英文或中文"></label><div id="word-results">${wordResults()}</div><button id="word-more" ${matchingWords().length<=wordLimit?'disabled':''}>继续显示更多核心词</button>`:list(values,kind==='combination'?'build':'study'));}
 $('#content').innerHTML=html;bind();const anchor=document.getElementById(location.hash.slice(1));if(anchor){anchor.scrollIntoView();anchor.focus({preventScroll:true});}
}
function bind(){
 if($('#listening-more'))$('#listening-more').onclick=()=>{listeningLimit+=20;render();};
 if($('#build-operator'))$('#build-operator').onchange=e=>{buildOperator=e.target.value;speech.stop();render();};
 if($('#listening-kind'))$('#listening-kind').onchange=e=>{location.href='/ogden/listening?kind='+encodeURIComponent(e.target.value);};
 const reviewChange=()=>{location.href='/ogden/review?'+new URLSearchParams({mode:$('#review-mode').value,kind:$('#review-kind').value,all:String($('#review-scope').value==='all'),status:$('#review-scope').value==='weak'?'unmastered':$('#review-scope').value==='marked'?'review':'all'});};
 ['#review-mode','#review-kind','#review-scope'].forEach(s=>{if($(s))$(s).onchange=reviewChange;});
 const taskChange=()=>{location.href='/ogden/'+page+'?'+new URLSearchParams({domain:$('#task-domain').value,level:$('#task-level').value});};
 ['#task-domain','#task-level'].forEach(s=>{if($(s))$(s).onchange=taskChange;});

 const updateWords=()=>{speech.stop();$('#word-results').innerHTML=wordResults();$('#word-more').disabled=matchingWords().length<=wordLimit;bind();};
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
   try{await refresh();if(page==='review')render();notify('已保存2.0自评和复习时间。');}catch{notify('已保存；暂时无法刷新统计，请稍后刷新页面。');}
  }catch(e){notify('尚未确认保存，请重试（重复请求不会重复计数）：'+e.message);}
  finally{savePending=false;document.querySelectorAll('[data-save]').forEach(x=>x.disabled=false);}
 });
 document.querySelectorAll('[data-variant]').forEach(select=>select.onchange=()=>{
  speech.stop();const x=items.find(x=>x.id===select.dataset.variant),v=x.variants.find(v=>v.id===select.value),section=select.closest('[data-pattern]');
  section.querySelector('[data-variant-zh]').textContent=v.chinese;section.querySelector('[data-variant-en]').textContent=v.english;
  section.querySelectorAll('[data-say]').forEach(b=>b.dataset.say=v.english);
  const article=select.closest('article');if(article.dataset.replacement==='true'){article.querySelector('h2').textContent=v.chinese;article.querySelectorAll('[data-say]').forEach(b=>b.dataset.say=v.english);}
  // Changing the meaning keeps English hidden until the learner chooses to reveal it.
 });
 document.querySelectorAll('[data-hide-variant]').forEach(b=>b.onclick=()=>{const en=b.closest('[data-pattern]').querySelector('[data-variant-en]');en.hidden=!en.hidden;b.setAttribute('aria-pressed',String(en.hidden));b.textContent=en.hidden?'显示英文':'隐藏英文，自己说';});
 document.querySelectorAll('[data-show-variant]').forEach(b=>b.onclick=()=>{const section=b.closest('[data-pattern]');section.querySelector('[data-variant-en]').hidden=false;section.querySelector('[data-hide-variant]').setAttribute('aria-pressed','false');section.querySelector('[data-hide-variant]').textContent='隐藏英文，自己说';});
 document.querySelectorAll('[data-toggle-copy]').forEach(b=>b.onclick=()=>{const node=b.closest('article').querySelector(b.dataset.toggleCopy==='en'?'[data-listening-en]':'[data-listening-zh]');node.hidden=!node.hidden;b.setAttribute('aria-pressed',String(!node.hidden));b.textContent=(node.hidden?'显示':'隐藏')+(b.dataset.toggleCopy==='en'?'英文':'中文');});
 document.querySelectorAll('[data-token]').forEach(b=>b.onclick=()=>{b.disabled=true;const out=b.closest('article').querySelector('[data-built]');out.textContent+=(out.textContent?' ':'')+b.dataset.token;});
 document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>{const a=b.closest('article');a.querySelector('[data-built]').textContent='';a.querySelectorAll('[data-token]').forEach(t=>t.disabled=false);});
 document.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>notify(b.closest('article').querySelector('[data-built]').textContent===b.dataset.check?'与这条教材组合一致。':'这次排列与教材不同。可以重新排列或查看参考；这不是自由表达评分。'));
}
async function refresh(){[progress,review,analytics]=await Promise.all([request('/ogden/progress').then(r=>{modeProgress=r.practice||[];return r.progress;}),request('/ogden/review'+(page==='review'?location.search:'')).then(r=>r.items),request('/ogden/analytics')]);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)speech.stop();});addEventListener('pagehide',()=>speech.stop());
(async()=>{try{const catalog=await request('/ogden/catalog');items=catalog.items;domains=catalog.domains||[];await refresh();render();}catch(e){$('#content').innerHTML=e.status===401?'<div class="panel"><h2>使用现有账号登录</h2><p>2.0开发预览共用1.0账号。请先在1.0登录，然后回到这里。</p><a href="/">前往1.0登录 / 注册</a></div>':`<div class="panel"><h2>暂时无法读取2.0预览</h2><p>${esc(e.message)}</p><p>请确认已运行本地预览初始化。未安装教材时不会生成虚假内容。</p></div>`;}})();
