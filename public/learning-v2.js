const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Independent listening/speaking records; ordinary mastery is never auto-updated. */
export function createLearningV2({request,getUser,getCatalog,getLanguage,playback,signIn,openDialogue}){
 let listSearch='',listKind='all';
 let root,mode='hub',item=null,links=null,patterns=[],review=null,english=false,chinese=false,slow=false,saved=false,busy=false,error='',resultId=null,generation=0;
 const text=(zh,en)=>getLanguage()==='zh'?zh:en,esc=escapeHtml;
 const modes=()=>[['listening',text('先听后看','Listen first')],['expression',text('看中文说英语','Speak from Chinese')],['pattern',text('句型替换','Sentence patterns')],['review',text('关联复习','Linked review')]];
 function leave(){generation++;playback.stop();root=null;}
 function open(nextMode,id){mode=nextMode;item=id?getCatalog().materials.find(m=>m.id===id)||null:null;links=null;english=false;chinese=nextMode==='expression'||nextMode==='pattern';saved=false;error='';resultId=null;}
 const shell=body=>`<section class="v2-learning"><h1>${text('听说与联想','Listen, speak & connect')}</h1><p class="help">${text('自由选择，随时跳过。听力和表达记录分别保存，不会改变原来的掌握状态。','Choose freely and skip anytime. Listening and speaking records are independent of your learning states.')}</p><div class="v2-actions">${modes().map(([v,l])=>`<button data-v2-mode="${v}" aria-pressed="${mode===v}">${l}</button>`).join('')}</div>${error?`<p class="error" role="alert">${esc(error)}</p>`:''}${body}</section>`;
 function tokenText(){
  if(!item)return '';
  const words=links?.materials.filter(m=>m.kind==='word')||[];
  return item.english.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g).map(token=>{
   const key=token.toLowerCase().replace(/[’‘]/g,"'"),word=words.find(w=>w.forms?.includes(key));
   return word?`<button class="v2-token" data-v2-definition="${esc(word.id)}" lang="en">${esc(token)}</button>`:esc(token);
  }).join('');
 }
 function linked(){
  if(!links)return '';
  return `<section><h2>${text(item.kind==='word'?'相关短句':'重点单词',item.kind==='word'?'Related phrases':'Key words')}</h2><p class="help">${text('数量以实际教材关联为准；没有关联时也可自由学习。','Links use existing lessons. Some words have no related phrase yet.')}</p><div class="v2-actions">${links.materials.map(m=>`<button data-v2-item="${esc(m.id)}">${english?`<span lang="en">${esc(m.english)}</span>`:esc(text(m.kind==='word'?'查看单词':'查看短句',m.kind==='word'?'Open word':'Open phrase'))}${chinese?' · '+esc(m.chinese):''} · ${esc(m.status||text('未标记','Unmarked'))}</button>`).join('')||`<p>${text('暂无可用关联教材。','No accessible linked lessons yet.')}</p>`}</div>${links.dialogues.length?`<h2>${text('同场景对话','Conversations in this scene')}</h2><div class="v2-actions">${links.dialogues.map(d=>`<button data-v2-dialogue="${esc(d.id)}">${esc(getLanguage()==='zh'?d.title_zh:d.title_en)}</button>`).join('')}</div>`:''}</section>`;
 }
 function exercise(){
  if(!item)return `<p>${text('请选择一条教材。','Choose a lesson.')}</p>`;
  const isListening=mode==='listening',isPattern=mode==='pattern';
  return `<article class="panel v2-exercise"><p class="eyebrow">${text(isListening?'先听声音，再看答案':isPattern?'固定句型，自由替换':'先看中文，试着开口',isListening?'Listen before revealing':isPattern?'Practise a validated pattern':'Try speaking before revealing')}</p>${isPattern?`<p>${esc(item.template_zh)} · ${esc(item.template_en)}</p>`:''}
   ${english?`<h2 lang="en">${isPattern?esc(item.english):tokenText()}</h2>`:`<p class="hidden-copy">${text('英文已隐藏','English hidden')}</p>`}
   ${chinese?`<p lang="zh-CN">${esc(item.chinese)}</p>`:`<p class="hidden-copy">${text('中文已隐藏','Chinese hidden')}</p>`}
   <div class="v2-actions"><button data-v2-play>${text('播放英文','Play English')}</button><button data-v2-slow aria-pressed="${slow}">${text(slow?'慢速':'正常语速',slow?'Slow':'Normal speed')}</button><button data-v2-repeat>${text('重复播放','Repeat')}</button><button data-v2-stop>${text('停止','Stop')}</button></div>
   <p id="v2-playback" class="help" role="status"></p>
   <div class="v2-actions"><button data-v2-reveal="en" aria-pressed="${english}">${text(english?'隐藏英文':'显示英文',english?'Hide English':'Show English')}</button><button data-v2-reveal="zh" aria-pressed="${chinese}">${text(chinese?'隐藏中文':'显示中文',chinese?'Hide Chinese':'Show Chinese')}</button></div>
   <p id="v2-definition" class="help" role="status"></p>
   <div class="v2-actions"><button class="primary" data-v2-answer="yes" ${saved||busy?'disabled':''}>${text(isListening?'听懂了':'会说',isListening?'Understood':'I can say it')}</button><button data-v2-answer="no" ${saved||busy?'disabled':''}>${text(isListening?'没听懂':'还不会',isListening?'Not yet':'Not yet')}</button><button data-v2-next>${text('下一条 / 自由跳过','Next / skip freely')}</button></div>
   ${saved?`<p role="status">${text('结果已保存；可随时在关联复习中练习。','Saved. Practise again anytime in linked review.')}</p>`:''}
   ${mode==='linked'?`<p class="help">${text('原学习状态：','Learning state: ')}${esc(item.status||text('未标记','Unmarked'))}</p>`:''}
   </article>${!isPattern?linked():''}`;
 }
 function chooseList(){const items=getCatalog().materials.filter(m=>(listKind==='all'||m.kind===listKind)&&(m.english+' '+m.chinese).toLowerCase().includes(listSearch.toLowerCase())).slice(0,20);return `<h2>${text('选择内容','Choose content')}</h2><label>${text('搜索教材','Search lessons')}<input id="v2-search" type="search" value="${esc(listSearch)}"></label><select id="v2-kind" aria-label="${text('单词或短句','Words or phrases')}">${[['all',text('全部','All')],['word',text('单词','Words')],['phrase',text('短句','Phrases')]].map(([v,l])=>`<option value="${v}" ${listKind===v?'selected':''}>${l}</option>`).join('')}</select><p class="help">${text('每次显示最多20条，搜索可自由选择其他教材。','Showing up to 20 lessons. Search freely for others.')}</p><div class="v2-actions">${items.map(m=>`<button data-v2-start="${esc(m.id)}">${esc(m.chinese)} · ${text(m.kind==='word'?'单词':'短句',m.kind==='word'?'Word':'Phrase')}</button>`).join('')}</div>`;}
 function draw(){
  if(!root)return;
  let body='';
  if(!getUser())body=`<button class="primary" data-v2-signin>${text('登录后同步听说练习','Sign in to sync practice')}</button>`;
  else if(mode==='hub')body=chooseList();
  else if(mode==='review')body=`<h2>${text('听说复习','Listening & speaking review')}</h2><div class="v2-actions"><button data-v2-review="due">${text('到期复习','Due now')}</button><button data-v2-review="all">${text('主动复习全部','Review all anytime')}</button></div>${review?`<div class="v2-actions">${review.exercises.map(e=>`<button data-v2-exercise="${esc(e.target_id)}" data-exercise-mode="${esc(e.mode)}">${esc(e.chinese)} · ${esc(modes().find(([m])=>m===e.mode)?.[1]||e.mode)} · ${text(e.last_succeeded?'已练习':'优先练习',e.last_succeeded?'Practised':'Priority')}</button>`).join('')||`<p>${text('暂无到期记录，也可主动复习。','Nothing due. You can review early.')}</p>`}</div><h2>${text('从未掌握内容联想','Links from difficult lessons')}</h2><div class="v2-actions">${review.related.map(m=>`<button data-v2-item="${esc(m.id)}">${esc(m.chinese)} · ${text('关联练习','Linked practice')}</button>`).join('')||`<p>${text('暂无关联建议。','No related suggestions yet.')}</p>`}</div>`:''}`;
  else if(mode==='pattern')body=`<div class="v2-actions">${patterns.map(p=>`<button data-v2-pattern="${esc(p.id)}">${esc(p.template_zh)} · ${esc(p.chinese)}</button>`).join('')}</div>${exercise()}`;
  else body=item?exercise():chooseList();
  root.innerHTML=shell(body);bind();
 }
 async function loadItem(id,nextMode){
  playback.stop();const current=++generation;busy=false;saved=false;error='';resultId=null;english=nextMode==='linked';chinese=nextMode==='linked'||nextMode==='expression';mode=nextMode;
  try{const data=await request('/learning-v2/links?material_id='+encodeURIComponent(id));if(current!==generation||!root)return;links=data;item=data.source;draw();}catch(e){if(current===generation){error=e.message;item=null;draw();}}
 }
 async function loadReview(all=false){const current=++generation;try{const data=await request('/learning-v2/review?all='+all);if(current!==generation||!root)return;review=data;draw();}catch(e){if(current===generation){error=e.message;draw();}}}
 async function enter(nextMode){if(!getUser()){signIn();return;}playback.stop();mode=nextMode;english=false;chinese=nextMode==='expression'||nextMode==='pattern';saved=false;resultId=null;error='';draw();
  if(mode==='pattern'){const current=++generation;try{const data=await request('/learning-v2/patterns');if(current!==generation||!root)return;patterns=data.variants;item=patterns[0]||null;draw();}catch(e){error=e.message;draw();}}
  else if(mode==='review')await loadReview();
  else if(!item||!getCatalog().materials.some(m=>m.id===item.id))item=getCatalog().materials[0]||null;
  if(['listening','expression','linked'].includes(mode)&&item)await loadItem(item.id,mode);
 }
 function play(repeat=false){if(!item)return;playback.play(item,{slow,repeat,onPhase:phase=>{const out=root?.querySelector('#v2-playback');if(out)out.textContent=phase==='listen'?text('正在播放…','Playing…'):text('可以再听或自己说一遍。','Listen again or try saying it.');},onError:()=>{const out=root?.querySelector('#v2-playback');if(out)out.textContent=text('发音暂不可用，请重试或更换浏览器。','Audio unavailable. Retry or use another browser.');}});}
 function bind(){
  const search=root.querySelector('#v2-search');if(search)search.oninput=e=>{const pos=e.target.selectionStart;listSearch=e.target.value;draw();const next=root.querySelector('#v2-search');next.focus();next.setSelectionRange?.(pos,pos);};
  const kind=root.querySelector('#v2-kind');if(kind)kind.onchange=e=>{listKind=e.target.value;draw();};
  root.querySelector('[data-v2-signin]')?.addEventListener('click',signIn);
  root.querySelectorAll('[data-v2-mode]').forEach(el=>el.onclick=()=>enter(el.dataset.v2Mode));
  root.querySelectorAll('[data-v2-start]').forEach(el=>el.onclick=()=>loadItem(el.dataset.v2Start,mode==='hub'?'linked':mode));
  root.querySelectorAll('[data-v2-item]').forEach(el=>el.onclick=()=>loadItem(el.dataset.v2Item,'linked'));
  root.querySelectorAll('[data-v2-dialogue]').forEach(el=>el.onclick=()=>openDialogue(el.dataset.v2Dialogue));
  root.querySelectorAll('[data-v2-definition]').forEach(el=>el.onclick=()=>{const word=links.materials.find(m=>m.id===el.dataset.v2Definition);const out=root.querySelector('#v2-definition');if(word&&out)out.textContent=word.english+' · '+word.chinese;});
  root.querySelectorAll('[data-v2-reveal]').forEach(el=>el.onclick=()=>{if(el.dataset.v2Reveal==='en')english=!english;else chinese=!chinese;draw();});
  root.querySelector('[data-v2-play]')?.addEventListener('click',()=>play());root.querySelector('[data-v2-repeat]')?.addEventListener('click',()=>play(true));root.querySelector('[data-v2-stop]')?.addEventListener('click',()=>playback.stop());
  root.querySelector('[data-v2-slow]')?.addEventListener('click',()=>{playback.stop();slow=!slow;draw();});
  root.querySelectorAll('[data-v2-answer]').forEach(el=>el.onclick=async()=>{
   if(saved||busy||!item)return;busy=true;error='';resultId||=globalThis.crypto.randomUUID();const target=item,practiceMode=mode==='linked'?'expression':mode;draw();
   try{await request('/learning-v2/results','POST',{request_id:resultId,target_id:target.id,mode:practiceMode,succeeded:el.dataset.v2Answer==='yes'});if(item===target)saved=true;}catch(e){error=e.message;}finally{busy=false;draw();}
  });
  root.querySelector('[data-v2-next]')?.addEventListener('click',()=>{playback.stop();const items=mode==='pattern'?patterns:getCatalog().materials,next=items[(items.findIndex(m=>m.id===item.id)+1)%items.length];if(!next)return;if(mode==='pattern'){item=next;english=false;chinese=true;saved=false;resultId=null;draw();}else loadItem(next.id,mode);});
  root.querySelectorAll('[data-v2-pattern]').forEach(el=>el.onclick=()=>{playback.stop();item=patterns.find(p=>p.id===el.dataset.v2Pattern);english=false;chinese=true;saved=false;resultId=null;draw();});
  root.querySelectorAll('[data-v2-review]').forEach(el=>el.onclick=()=>loadReview(el.dataset.v2Review==='all'));
  root.querySelectorAll('[data-v2-exercise]').forEach(el=>el.onclick=async()=>{if(el.dataset.exerciseMode==='pattern'){await enter('pattern');const selected=patterns.find(p=>p.id===el.dataset.v2Exercise);if(selected){item=selected;english=false;chinese=true;draw();}}else await loadItem(el.dataset.v2Exercise,el.dataset.exerciseMode);});
 }
 async function mount(){root=document.querySelector('#learning-v2-root');if(!root)return;draw();if(!getUser())return;if(mode==='pattern'||mode==='review')await enter(mode);else if(item)await loadItem(item.id,mode);}
 return {mount,open,leave};
}
