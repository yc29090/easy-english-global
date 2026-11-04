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
 await page.goto('/ogden/build');const combo=page.locator('article').first();for(const token of ['get','some','water'])await combo.locator('[data-token="'+token+'"]').click();await combo.getByRole('button',{name:'查看组合提示'}).click();await expect(page.locator('#feedback')).toContainText('一致');
 await page.goto('/ogden/express');const arrival=page.locator('article[data-item="ex-arrival"]');await arrival.locator('textarea').fill('When does the car come?');await arrival.locator('summary').click();await expect(arrival).toContainText('When will the car arrive?');await arrival.getByRole('button',{name:'已学习',exact:true}).click();await expect(page.locator('#feedback')).toContainText('已保存');
 await page.goto('/ogden/listening');const listening=page.locator('article').first();await expect(listening.locator('details')).not.toHaveAttribute('open');await listening.getByRole('button',{name:'慢速合成请求'}).first().click();await expect(page.locator('#feedback')).toContainText(/本地美式|低速合成请求/);await listening.locator('summary').click();await expect(listening.locator('details')).toHaveAttribute('open','');
 await page.screenshot({path:'/tmp/ogden-'+info.project.name+'.png',fullPage:true});expect(errors).toEqual([]);
 const legacy=await page.request.get('/api/progress');expect((await legacy.json()).progress).toHaveLength(0);
});
