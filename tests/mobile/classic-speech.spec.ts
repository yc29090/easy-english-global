import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('production classic mode unchanged: default request, online US, slow repeat and stop',async({page})=>{
 await page.addInitScript(()=>{
  let voices:any[]=[],current:any=null;const calls:any[]=[],events=new EventTarget();
  const synth={speaking:false,pending:false,paused:false,getVoices:()=>voices,cancel(){current=null;synth.speaking=false;},speak(u:any){current=u;calls.push({lang:u.lang,rate:u.rate,voice:u.voice?.name});synth.speaking=true;u.onstart?.();},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(public text:string){}}});
  (window as any).classicVoice={calls,load(){voices=[{lang:'en-US',name:'Online US fixture',localService:false}];events.dispatchEvent(new Event('voiceschanged'));},finish(){const u=current;current=null;synth.speaking=false;u?.onend?.();}};
 });
 const registered=await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3000'},data:{email:'classic-speech-'+randomUUID()+'@example.invalid',password:'Classic9!'+randomUUID()}});expect(registered.ok()).toBeTruthy();
 await page.goto('/?version=classic&page=words');const card=page.locator('.material').first(),status=card.locator('.playback-phase');await card.locator('[data-speed="normal"]').click();await expect.poll(()=>page.evaluate(()=>(window as any).classicVoice.calls.length)).toBe(1);
 await page.evaluate(()=>(window as any).classicVoice.load());await card.locator('[data-speed="normal"]').click();await expect(status).toContainText('正在正常播放');
 await card.locator('[data-speed="slow"]').click();await expect(status).toContainText('正在慢速播放');await card.locator('[data-repeat]').click();await expect(status).toContainText('正在慢速播放');
 const count=await page.evaluate(()=>(window as any).classicVoice.calls.length);await page.evaluate(()=>(window as any).classicVoice.finish());await expect.poll(()=>page.evaluate(()=>(window as any).classicVoice.calls.length)).toBe(count+1);
 expect(await page.evaluate(()=>(window as any).classicVoice.calls.at(-1))).toEqual({lang:'en-US',rate:.55,voice:'Online US fixture'});await card.locator('[data-stop]').click();await expect(status).toContainText('已停止');const stopped=await page.evaluate(()=>(window as any).classicVoice.calls.length);await page.waitForTimeout(1700);expect(await page.evaluate(()=>(window as any).classicVoice.calls.length)).toBe(stopped);
});
