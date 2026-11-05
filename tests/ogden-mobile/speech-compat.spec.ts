import {test,expect,type Page} from '@playwright/test';
import {loadOgden} from '../../src/ogden-content.ts';
const content=await loadOgden();
const us={lang:'en-US',name:'US fixture',voiceURI:'us',localService:true};
const gb={lang:'en-GB',name:'UK fixture',voiceURI:'gb',localService:true};
const zh={lang:'zh-CN',name:'Non-English fixture',voiceURI:'zh',localService:true};
/** Explicit API/voice shims: verifies Android-compatible control flow, not real device audio. */
async function setup(page:Page,voices:any[],error=''){
 await page.addInitScript(({initial,error})=>{
  let voices=initial,active:any=null,cancels=0;const calls:any[]=[],events=new EventTarget();
  const synth={speaking:false,pending:false,paused:false,getVoices:()=>voices,cancel(){cancels++;active=null;synth.speaking=false;synth.pending=false;},resume(){synth.paused=false;},
   speak(u:any){calls.push(u);active=u;synth.pending=true;setTimeout(()=>{if(active!==u)return;synth.pending=false;if(error){u.onerror?.({error});return;}synth.speaking=true;u.onstart?.();},0);},
   addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{text:string;constructor(text:string){this.text=text;}}});
  (window as any).voiceFixture={calls:()=>calls.map(u=>({text:u.text,rate:u.rate,lang:u.lang,voice:u.voice?.name})),cancels:()=>cancels,
   load:(list:any[],fire=true)=>{voices=list;if(fire)events.dispatchEvent(new Event('voiceschanged'));},
   finish:()=>{const u=active;active=null;synth.speaking=false;synth.pending=false;u?.onend?.();}};
 },{initial:voices,error});
 await page.route('**/api/ogden/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const data=path.endsWith('/catalog')?{items:content.items,domains:content.domains,coverage:{},learningPath:[]}:
   path.endsWith('/progress')?{ownerId:'00000000-0000-4000-8000-000000000012',progress:[],practice:[]}:
   path.endsWith('/review')?{items:[]}:path.endsWith('/analytics')?{shared:[],practice:[],recent:[]}:{ok:true};
  await route.fulfill({json:data});
 });
 await page.goto('/ogden/listening?kind=word&item=ow-get');await expect(page.locator('article').first()).toBeVisible();
}
const last=(page:Page)=>page.evaluate(()=>(window as any).voiceFixture.calls().at(-1));
const size=(page:Page)=>page.evaluate(()=>(window as any).voiceFixture.calls().length);
test('classic mode: online and unknown-source en-US use the same selection without local-only filtering',async({page})=>{
 await setup(page,[{...us,localService:false}]);await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('已请求正常播放');expect((await last(page)).lang).toBe('en-US');
 await page.evaluate(voice=>(window as any).voiceFixture.load([voice]),{lang:'en-US',name:'Unknown US',voiceURI:'unknown'});await page.locator('[data-say]').first().click();expect((await last(page)).voice).toBe('Unknown US');
});
test('classic mode: other English is allowed exactly as production 1.0',async({page})=>{
 await setup(page,[zh,gb]);await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('已请求正常播放');expect((await last(page)).lang).toBe('en-GB');expect((await last(page)).voice).toBe('UK fixture');
});
test('classic mode: initially empty list requests default voice immediately; loaded voice is used on next click',async({page})=>{
 await setup(page,[]);await page.locator('[data-say]').first().click();expect(await size(page)).toBe(1);expect((await last(page)).lang).toBe('en-US');expect((await last(page)).voice).toBeUndefined();
 await page.evaluate(voice=>(window as any).voiceFixture.load([voice]),us);expect(await size(page)).toBe(1);await page.locator('[data-say]').first().click();expect((await last(page)).voice).toBe('US fixture');
});
test('classic mode: slow repeat preserves .55, stop and rapid changes cancel future repeats',async({page})=>{
 await setup(page,[us]);await page.locator('[data-slow]').first().click();expect((await last(page)).rate).toBe(.55);await page.locator('[data-repeat]').first().click();expect((await last(page)).rate).toBe(.55);const before=await size(page);await page.evaluate(()=>(window as any).voiceFixture.finish());await expect.poll(()=>size(page)).toBe(before+1);expect((await last(page)).rate).toBe(.55);
 await page.locator('[data-say]:not([data-repeat]):not([data-slow])').first().click();expect((await last(page)).rate).toBe(1);await page.locator('[data-slow]').first().click();expect((await last(page)).rate).toBe(.55);await page.locator('[data-stop]').first().click();const stopped=await size(page);await page.waitForTimeout(1700);expect(await size(page)).toBe(stopped);await expect(page.locator('#feedback')).toContainText('已停止');
});
test('classic mode: network playback error reports failure without another service',async({page})=>{
 await setup(page,[us],'network');await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('暂不可用');expect(await size(page)).toBe(1);
});
test('classic mode: background restoration and pagehide do not revive canceled repetition',async({page})=>{
 await setup(page,[us]);await page.locator('[data-repeat]').first().click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const stopped=await size(page);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(1700);expect(await size(page)).toBe(stopped);
 await page.locator('[data-repeat]').first().click();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const hidden=await size(page);await page.waitForTimeout(1700);expect(await size(page)).toBe(hidden);
});


test('standalone core and operator words expose normal and slow controls through the existing player',async({page})=>{
 await setup(page,[us]);
 await page.goto('/ogden/words');await expect(page.locator('#word-results article').first()).toBeVisible();
 for(const article of await page.locator('#word-results article').all()){
  const word=await article.locator('h2').innerText();await expect(article.locator('[data-say]').filter({hasText:'正常播放'}).first()).toBeVisible();
  expect(await article.locator('[data-say]').evaluateAll((buttons,word)=>[false,true].every(slow=>buttons.some(b=>b.getAttribute('data-say')===word&&b.hasAttribute('data-slow')===slow)),word)).toBeTruthy();
 }
 const contextual=content.items.find(x=>x.kind==='word'&&x.pronunciation?.contextPlayback&&x.english.length>=4)!;expect(contextual).toBeTruthy();
 await page.goto('/ogden/words?q='+encodeURIComponent(contextual.english));const article=page.locator('article').filter({has:page.getByRole('heading',{name:contextual.english,exact:true})}).first();await expect(article).toBeVisible();
 const controls=article.locator('[data-say]').filter({hasText:'正常播放'});await controls.first().click();expect((await last(page)).text).toBe(contextual.english);expect((await last(page)).rate).toBe(1);
 await article.locator('[data-say][data-slow]').first().click();expect((await last(page)).text).toBe(contextual.english);expect((await last(page)).rate).toBe(.55);
 await page.goto('/ogden/operators/get');const operator=page.locator('article').first();await operator.locator('[data-say]').first().click();expect((await last(page)).text).toBe('get');expect((await last(page)).rate).toBe(1);await operator.locator('[data-say][data-slow]').first().click();expect((await last(page)).text).toBe('get');expect((await last(page)).rate).toBe(.55);
});
