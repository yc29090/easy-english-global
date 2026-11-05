import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('mobile beginner flow: independent listening/speaking/pattern results and accurate analytics',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const result=await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3000'},data:{email:'mobile-'+randomUUID()+'@example.invalid',password:'Mobile9!'+randomUUID()}});expect(result.ok()).toBeTruthy();
 await page.goto('/');await page.locator('[data-page="words"]').first().click();
 await page.locator('[data-v2-listen]').first().click();
 const exercise=page.locator('.v2-exercise');await expect(exercise).toBeVisible();await expect(exercise.locator('h2')).toHaveCount(0);await expect(exercise.locator('[lang="zh-CN"]')).toHaveCount(0);
 await page.locator('[data-v2-slow]').click();await expect(page.locator('[data-v2-slow]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-v2-reveal="en"]').click();await expect(exercise.locator('h2')).toBeVisible();
 await page.locator('[data-v2-answer="no"]').click();await expect(exercise.getByRole('status').filter({hasText:'结果已保存'})).toBeVisible();
 const ordinary=await (await page.request.get('/api/progress')).json();expect(ordinary.progress).toHaveLength(0);
 await page.locator('[data-v2-mode="expression"]').click();await expect(exercise.locator('[lang="zh-CN"]')).toBeVisible();await expect(exercise.locator('h2')).toHaveCount(0);
 await page.locator('[data-v2-answer="yes"]').click();await expect(exercise.getByRole('status').filter({hasText:'结果已保存'})).toBeVisible();
 await page.locator('[data-v2-mode="pattern"]').click();await expect(page.locator('[data-v2-pattern]').first()).toBeVisible();await expect(exercise.locator('h2')).toHaveCount(0);
 await page.locator('[data-v2-reveal="en"]').click();await expect(exercise.locator('h2')).toBeVisible();
 await page.locator('[data-v2-answer="yes"]').click();await expect(exercise.getByRole('status').filter({hasText:'结果已保存'})).toBeVisible();
 await page.locator('[data-v2-mode="analytics"]').click();await expect(page.locator('.v2-stats')).toBeVisible();await expect(page.locator('.v2-stats')).toContainText('练习次数: 1');
 const analytics=await (await page.request.get('/api/learning-v2/analytics')).json();expect(analytics.ordinary).toHaveLength(0);expect(analytics.practice).toHaveLength(3);expect(analytics.practice.find((p:any)=>p.mode==='listening').weak).toBe(1);
 await expect(page.locator('[data-v2-exercise]')).toHaveCount(1);
 await page.locator('#language').click();await expect(page.getByRole('heading',{name:'Your real learning records'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
 await page.screenshot({path:'test-results/v2-'+info.project.name+'.png',fullPage:true});await page.locator('[data-page="phrases"]').first().click();await page.locator('[data-v2-token]').first().click();await expect(page.locator('#notice')).toContainText(' · ');expect(errors).toEqual([]);
});

test('slow playback actually sends a slower rate across words, phrases, repeats and V2',async({page})=>{
 await page.addInitScript(()=>{
  const state=window as any;state.__playbackCalls=[];
  class Utterance{text:string;rate=1;lang='';voice:any;constructor(text:string){this.text=text;}}
  const english={name:'Test English',lang:'en-US',localService:true};
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{paused:false,getVoices:()=>[{name:'Chinese',lang:'zh-CN',default:true},english],addEventListener(){},cancel(){},speak:(s:any)=>state.__playbackCalls.push({text:s.text,rate:s.rate,voice:s.voice?.name,lang:s.lang})}});
 });
 const registered=await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3000'},data:{email:'slow-'+randomUUID()+'@example.invalid',password:'Slow9!'+randomUUID()}});expect(registered.ok()).toBeTruthy();
 await page.goto('/');await page.locator('[data-page="words"]').first().click();
 const rate=()=>page.evaluate(()=>(window as any).__playbackCalls.at(-1)?.rate);
 await page.locator('[data-speed="normal"]').first().click();await expect.poll(rate).toBe(1);
 await page.locator('[data-speed="slow"]').first().click();await expect.poll(rate).toBe(0.55);expect(await page.evaluate(()=>(window as any).__playbackCalls.at(-1)?.voice)).toBe('Test English');
 await page.locator('[data-repeat]').first().click();await expect.poll(rate).toBe(0.55);
 await page.locator('[data-shadow]').first().click();await expect.poll(rate).toBe(0.55);
 await page.locator('[data-speed="normal"]').first().click();await page.locator('[data-repeat]').first().click();await expect.poll(rate).toBe(1);
 await page.locator('[data-page="phrases"]').first().click();await page.locator('[data-speed="slow"]').first().click();await expect.poll(rate).toBe(0.55);
 await page.locator('[data-v2-listen]').first().click();await expect(page.locator('.v2-exercise')).toBeVisible();
 const count=await page.evaluate(()=>(window as any).__playbackCalls.length);
 await page.locator('[data-v2-slow]').click();await expect.poll(()=>page.evaluate(()=>(window as any).__playbackCalls.length)).toBe(count+1);await expect.poll(rate).toBe(0.55);
 await page.locator('[data-v2-slow]').click();await expect.poll(rate).toBe(0.55);
 await page.locator('[data-v2-repeat]').click();await expect.poll(rate).toBe(0.55);
 await page.locator('[data-v2-play]').click();await expect.poll(rate).toBe(1);await expect(page.locator('[data-v2-slow]')).toHaveAttribute('aria-pressed','false');
 await page.locator('[data-v2-reveal="en"]').click();await expect(page.locator('[data-v2-word-speak][data-word-speed="normal"]').first()).toBeVisible();await page.locator('[data-v2-word-speak][data-word-speed="normal"]').first().click();await expect.poll(rate).toBe(1);await page.locator('[data-v2-word-speak][data-word-speed="slow"]').first().click();await expect.poll(rate).toBe(0.55);

});


