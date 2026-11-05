import {test,expect,type Page,type Route} from '@playwright/test';
import {loadOgden} from '../../src/ogden-content.ts';
import {expressionCoverage,OGDEN_PATH} from '../../src/ogden-coverage.ts';
const content=await loadOgden();
/** Mock API responses isolate layout/network rendering. These tests make no authentication claim. */
async function fixtureApi(page:Page,intercept?:(route:Route,path:string)=>Promise<boolean>){
 await page.route('**/api/ogden/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(await intercept?.(route,path))return;
  const value=path.endsWith('/catalog')?{items:content.items,domains:content.domains,coverage:expressionCoverage(content.items),learningPath:OGDEN_PATH}:
   path.endsWith('/progress')?{ownerId:'00000000-0000-4000-8000-000000000006',progress:[],practice:[]}:
   path.endsWith('/review')?{items:[]}:path.endsWith('/analytics')?{shared:[],practice:[],recent:[]}:{ok:true};
  await route.fulfill({json:value});
 });
}

test('mocked API: 320px large text, landscape and a reduced keyboard viewport retain readable controls without overflow',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixtureApi(page);
 await page.setViewportSize({width:320,height:568});
 for(const path of ['','words?q=phone','operators/get','patterns#pt-need','express?task=ex-arrival','listening?kind=word&item=ow-get','review','progress']){
  await page.goto('/ogden/'+path);await expect(page.locator('#nav a')).toHaveCount(10);
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path).toBeTruthy();
  expect(await page.locator('button').evaluateAll(elements=>elements.every(e=>e.getBoundingClientRect().height>=44)),path).toBeTruthy();
 }
 await page.goto('/ogden/express?task=ex-arrival');const answer=page.locator('textarea');await answer.fill('My draft stays on this page.');await answer.focus();
 await page.setViewportSize({width:320,height:300});await expect(answer).toHaveValue('My draft stays on this page.');
 await page.setViewportSize({width:568,height:320});await expect(answer).toHaveValue('My draft stays on this page.');
 const reveal=page.locator('article summary');await reveal.click();await expect(page.locator('.reference-comparison')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();expect(errors).toEqual([]);
});

test('mocked API: malformed gateway and failed save recover without fake success, uploaded draft or non-English voice fallback',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let badCatalog=true,badSave=true;const saves:any[]=[];
 await page.addInitScript(()=>{
  (window as any).nonEnglishSpeakCalls=0;
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'zh-CN',localService:false,name:'Non-English fixture'}],cancel(){},addEventListener(){},removeEventListener(){},speak(){(window as any).nonEnglishSpeakCalls++;}}});
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(public text:string){}}});
 });
 await fixtureApi(page,async(route,path)=>{
  if(path.endsWith('/catalog')&&badCatalog){badCatalog=false;await route.fulfill({status:502,contentType:'text/html',body:'<html>Gateway fixture</html>'});return true;}
  if(path.endsWith('/results')){saves.push(route.request().postDataJSON());if(badSave){badSave=false;await route.abort('failed');}else await route.fulfill({json:{ok:true}});return true;}return false;
 });
 await page.goto('/ogden/express?task=ex-arrival');await expect(page.getByRole('heading',{name:'暂时无法读取2.0教材'})).toBeVisible();await page.getByRole('button',{name:'重新加载'}).click();
 await expect(page.locator('article')).toHaveCount(1);await page.locator('textarea').fill('Private mobile draft: never upload this.');
 await page.getByRole('button',{name:'正常播放',exact:true}).first().click();await expect(page.locator('#feedback')).toContainText('没有可用的 en-US 美式英语语音',{timeout:12000});expect(await page.evaluate(()=>(window as any).nonEnglishSpeakCalls)).toBe(0);
 const save=page.getByRole('button',{name:'已学习',exact:true});await save.click();await expect(page.locator('#feedback')).toContainText('尚未确认保存');await expect(save).toBeEnabled();await expect(page.locator('textarea')).toHaveValue('Private mobile draft: never upload this.');
 await save.click();await expect(page.locator('#feedback')).toContainText('已保存2.0');expect(saves).toHaveLength(2);expect(saves[0]).toEqual(saves[1]);expect(JSON.stringify(saves)).not.toContain('Private mobile draft');expect(errors).toEqual([]);
});
