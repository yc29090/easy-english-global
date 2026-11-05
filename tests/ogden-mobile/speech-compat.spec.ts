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
test('voice shim: en-US is preferred over other English and the Chinese default',async({page})=>{
 await setup(page,[zh,gb,us]);expect(await size(page)).toBe(0);await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('正在正常播放');expect((await last(page)).lang).toBe('en-US');expect((await last(page)).rate).toBe(1);
});
for(const lang of ['en-GB','en-AU','en-CA','en-NZ','en','zh-CN'])test(`voice shim: reject ${lang} without default speech`,async({page})=>{
 await setup(page,[{...gb,lang}]);await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('没有可用的 en-US',{timeout:12000});expect(await size(page)).toBe(0);
});
test('voice shim: en-US without localService is eligible',async({page})=>{
 await setup(page,[{lang:'en-US',name:'Unknown source US',voiceURI:'unknown-us'}]);await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('正在正常播放');expect((await last(page)).lang).toBe('en-US');
});
test('voice shim: empty list resumes the clicked request after asynchronous voiceschanged',async({page})=>{
 await setup(page,[]);await page.locator('[data-slow]').first().click();await expect(page.locator('#feedback')).toContainText('正在加载');expect(await size(page)).toBe(0);
 await page.evaluate(voice=>(window as any).voiceFixture.load([voice]),us);await expect(page.locator('#feedback')).toContainText('正在慢速播放');expect(await size(page)).toBe(1);expect((await last(page)).rate).toBe(.55);
});
test('voice shim: no English voice fails honestly without speaking a non-English default',async({page})=>{
 await setup(page,[zh]);await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('没有可用的 en-US',{timeout:12000});expect(await size(page)).toBe(0);
});
test('voice shim: slow selection survives repeat; stop cancels late callbacks and normal resets rate',async({page})=>{
 await setup(page,[us]);await page.locator('[data-slow]').first().click();await expect(page.locator('#feedback')).toContainText('正在慢速播放');expect((await last(page)).rate).toBe(.55);
 await page.locator('[data-repeat]').first().click();await expect.poll(()=>size(page)).toBe(2);await expect(page.locator('#feedback')).toContainText('正在慢速播放');expect((await last(page)).rate).toBe(.55);
 await page.evaluate(()=>(window as any).voiceFixture.finish());await expect.poll(()=>size(page)).toBe(3);expect((await last(page)).rate).toBe(.55);
 await page.locator('[data-stop]').first().click();const stopped=await size(page);await page.waitForTimeout(2000);expect(await size(page)).toBe(stopped);await expect(page.locator('#feedback')).toContainText('已停止');
 await page.locator('[data-say]:not([data-repeat]):not([data-slow])').first().click();await expect(page.locator('#feedback')).toContainText('正在正常播放');expect((await last(page)).rate).toBe(1);
 await page.locator('[data-slow]').first().click();await page.locator('[data-stop]').first().click();const afterStop=await size(page);await page.waitForTimeout(300);expect(await size(page)).toBe(afterStop);
});
test('voice shim: playback network failure never displays a successful playing state',async({page})=>{
 await setup(page,[us],'network');await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('连接失败');await expect(page.locator('#feedback')).not.toContainText('正在正常播放');expect(await size(page)).toBe(1);
});
test('voice shim: browser online English is identified and requires no website paid TTS endpoint',async({page})=>{
 await setup(page,[zh,{...us,localService:false}]);const requests:string[]=[];page.on('request',r=>{if(r.method()!=='GET')requests.push(r.url());});
 await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('浏览器在线英语语音');await expect(page.locator('.speech-policy')).toContainText('可能将教材文字');expect((await last(page)).lang).toBe('en-US');expect(requests).toEqual([]);
});

test('voice shim: permanently empty list times out and cannot resume after late voices',async({page})=>{
 await setup(page,[]);await page.locator('[data-say]').first().click();await expect(page.locator('#feedback')).toContainText('列表仍为空',{timeout:12000});await page.evaluate(voice=>(window as any).voiceFixture.load([voice]),us);expect(await size(page)).toBe(0);
});
test('voice shim: pagehide cancels queued speech and background restoration cannot revive it',async({page})=>{
 await setup(page,[]);await page.locator('[data-say]').first().click();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.evaluate(voice=>(window as any).voiceFixture.load([voice]),us);await page.waitForTimeout(300);expect(await size(page)).toBe(0);
});

test('voice shim: visibility background and restoration do not revive pending speech',async({page})=>{
 await setup(page,[]);await page.locator('[data-say]').first().click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#feedback')).toContainText('旧播放请求已取消');
 await page.evaluate(voice=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));(window as any).voiceFixture.load([voice]);},us);await page.waitForTimeout(300);expect(await size(page)).toBe(0);
});
