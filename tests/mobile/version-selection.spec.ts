import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('version cards, browser navigation and classic cloud progress work on mobile',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const registered=await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3000'},data:{email:'versions-'+randomUUID()+'@example.invalid',password:'Version9!'+randomUUID()}});expect(registered.ok()).toBeTruthy();
 await page.goto('/');await expect(page.locator('.version-card')).toHaveCount(2);await expect(page.locator('[data-version="modern"]')).toHaveAttribute('href','/ogden');
 await expect(page.getByRole('heading',{name:'选择你的英语学习版本'})).toBeVisible();
 await page.screenshot({path:'ui-previews/version-selector-'+info.project.name+'.png',fullPage:true});
 await page.setViewportSize({width:320,height:640});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
 for(const card of await page.locator('.version-card').all()){const box=await card.boundingBox();expect(box?.width).toBeGreaterThan(200);expect(box?.height).toBeGreaterThan(44);}
 await page.locator('[data-version="classic"]').click();await expect(page).toHaveURL(/\?version=classic$/);await expect(page.locator('[data-continue]')).toBeVisible();
 await page.locator('[data-page="words"]').first().click();const saved=page.locator('[data-status="learned"]').first(),id=await saved.getAttribute('data-material');await saved.click();await expect(page.locator('[data-status="learned"][data-material="'+id+'"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('.topactions [data-page="home"]').click();await expect(page.locator('.version-picker')).toBeVisible();await page.locator('[data-version="classic"]').click();await page.locator('[data-page="words"]').first().click();
 await expect(page.locator('[data-status="learned"][data-material="'+id+'"]')).toHaveAttribute('aria-pressed','true');
 const progress=(await (await page.request.get('/api/progress')).json()).progress;expect(progress.some((p:any)=>p.material_id===id&&p.status==='learned')).toBeTruthy();
 await page.goBack();await expect(page.locator('[data-continue]')).toBeVisible();await page.goBack();await expect(page.locator('.version-picker')).toBeVisible();
 expect((await page.request.get('/api/admin/users')).status()).toBe(403);expect(errors).toEqual([]);
});
test('modern deep links keep their URL and existing login returns to version selection',async({page})=>{
 const email='version-login-'+randomUUID()+'@example.invalid',password='Version9!'+randomUUID();
 expect((await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3000'},data:{email,password}})).ok()).toBeTruthy();
 await page.request.post('/api/auth/logout',{headers:{Origin:'http://127.0.0.1:3000'},data:{}});
 await page.goto('/ogden/words?q=water#word-water');await expect(page).toHaveURL(/\/ogden\/words\?q=water#word-water$/);await expect(page.locator('#content a[href="/?login=1"]')).toBeVisible();
 await page.locator('#content a[href="/?login=1"]').click();await expect(page.locator('#auth-form')).toBeVisible();
 await page.locator('#auth-form [name=email]').fill(email);await page.locator('#auth-form [name=password]').fill(password);await page.locator('#auth-form button').click();
 await expect(page).toHaveURL('http://127.0.0.1:3000/');await expect(page.locator('.version-picker')).toBeVisible();await expect(page.locator('#modal')).not.toBeVisible();
 await page.goto('/?version=classic&page=admin');await expect(page.locator('#trial-form')).toHaveCount(0);expect((await page.request.get('/api/admin/users')).status()).toBe(403);
});
