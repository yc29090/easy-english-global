import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('mobile isolated preview: existing login, shared operator state, combination, self-assessment and listening fallback',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const registered=await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3100'},data:{email:'ogden-'+randomUUID()+'@example.invalid',password:'Mobile9!Example'}});expect(registered.ok()).toBeTruthy();
 await page.goto('/ogden');await expect(page.getByRole('heading',{name:'今天想表达什么？'})).toBeVisible();
 for(const route of ['words','operators','operators/get','patterns','build','express','listening','speaking','review','progress']){
  await page.goto('/ogden/'+route);await expect(page.locator('#content')).not.toContainText('正在加载');await expect(page.locator('#nav a')).toHaveCount(10);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
 await page.goto('/ogden/operators');const get=page.locator('article[data-item="ow-get"]');await get.getByRole('button',{name:'已掌握',exact:true}).click();await expect(page.locator('#feedback')).toContainText('已保存');
 await page.goto('/ogden/words');await expect(page.locator('article[data-item="ow-get"] [data-state]')).toContainText('已掌握');
 await page.goto('/ogden/patterns');const pattern=page.locator('article[data-item="pt-need"]');
 await pattern.locator('[data-hide-variant]').click();await expect(pattern.locator('[data-variant-en]')).toBeHidden();
 await pattern.locator('select').selectOption('pt-need-help');await expect(pattern.locator('[data-variant-zh]')).toHaveText('我需要帮助。');await expect(pattern.locator('[data-variant-en]')).toBeHidden();
 await pattern.locator('[data-show-variant]').click();await expect(pattern.locator('[data-variant-en]')).toHaveText('I need help.');
 expect(await pattern.locator('[data-variant-audio] [data-say]').first().getAttribute('data-say')).toBe('I need help.');
 const retryIds:string[]=[];let loseReply=true;
 await page.route('**/api/ogden/results',async route=>{retryIds.push(route.request().postDataJSON().request_id);if(loseReply){loseReply=false;const response=await route.fetch();expect(response.ok()).toBeTruthy();await route.abort('failed');}else await route.continue();});
 await pattern.getByRole('button',{name:'已学习',exact:true}).click();await expect(page.locator('#feedback')).toContainText('尚未确认保存');
 await pattern.getByRole('button',{name:'已学习',exact:true}).click();await expect(page.locator('#feedback')).toContainText('已保存');expect(retryIds).toHaveLength(2);expect(retryIds[0]).toBe(retryIds[1]);
 loseReply=true;await pattern.getByRole('button',{name:'未掌握',exact:true}).click();await expect(page.locator('#feedback')).toContainText('尚未确认保存');
 await pattern.getByRole('button',{name:'已掌握',exact:true}).click();await expect(page.locator('#feedback')).toContainText('已保存');
 await pattern.getByRole('button',{name:'未掌握',exact:true}).click();await expect(page.locator('#feedback')).toContainText('已保存');expect(retryIds).toHaveLength(5);expect(retryIds[2]).not.toBe(retryIds[4]);
 const latest=await page.request.get('/api/ogden/progress');expect((await latest.json()).progress.find((p:any)=>p.item_id==='pt-need').status).toBe('unmastered');await page.unroute('**/api/ogden/results');
 await page.goto('/ogden/build');const combo=page.locator('article').first();for(const token of ['get','some','water'])await combo.locator('[data-token="'+token+'"]').click();await combo.getByRole('button',{name:'查看组合提示'}).click();await expect(page.locator('#feedback')).toContainText('一致');
 await page.goto('/ogden/express');const arrival=page.locator('article[data-item="ex-arrival"]');await arrival.locator('textarea').fill('When does the car come?');await arrival.locator('summary').click();await expect(arrival).toContainText('When will the car arrive?');await arrival.getByRole('button',{name:'已学习',exact:true}).click();await expect(page.locator('#feedback')).toContainText('已保存');
 await page.goto('/ogden/listening');const listening=page.locator('article').first();await expect(listening.locator('details')).not.toHaveAttribute('open');await listening.getByRole('button',{name:'慢速合成请求'}).first().click();await expect(page.locator('#feedback')).toContainText(/本地美式|低速合成请求/);await listening.locator('summary').click();await expect(listening.locator('details')).toHaveAttribute('open','');await expect(listening.locator('[data-listening-en]')).toBeHidden();await expect(listening.locator('[data-listening-zh]')).toBeHidden();await listening.locator('[data-toggle-copy="en"]').click();await expect(listening.locator('[data-listening-en]')).toBeVisible();await expect(listening.locator('[data-listening-zh]')).toBeHidden();await listening.locator('[data-toggle-copy="zh"]').click();await expect(listening.locator('[data-listening-zh]')).toBeVisible();
 await page.screenshot({path:'/tmp/ogden-'+info.project.name+'.png',fullPage:true});expect(errors).toEqual([]);
 const legacy=await page.request.get('/api/progress');expect((await legacy.json()).progress).toHaveLength(0);
});
