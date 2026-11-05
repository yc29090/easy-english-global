import {expect,type Locator,type Page} from '@playwright/test';
export const accents={learned:'rgb(37, 99, 235)',mastered:'rgb(22, 163, 74)',unmastered:'rgb(234, 88, 12)',review:'rgb(147, 51, 234)'};
export async function selected(panel:Locator,state:string){
 const button=panel.locator(`[data-learning-status="${state}"]`);await expect(button).toHaveAttribute('aria-pressed','true');await expect(panel.locator('[aria-pressed="true"]')).toHaveCount(1);await expect(button.locator('.state-check')).toBeVisible();
 await expect(button).toHaveCSS('border-top-width','3px');await expect(button).toHaveCSS('border-top-color',accents[state as keyof typeof accents]);
 for(const key of Object.keys(accents)){const b=panel.locator(`[data-learning-status="${key}"]`);await expect(b).toHaveCSS('border-top-color',accents[key as keyof typeof accents]);expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);if(key!==state){await expect(b).toHaveAttribute('aria-pressed','false');await expect(b.locator('.state-check')).toBeHidden();}}
}
export async function mobileFits(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
