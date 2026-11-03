import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/mobile',timeout:60000,workers:1,retries:0,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:3000',trace:'off',screenshot:'only-on-failure'},
 projects:[{name:'android-chromium',use:{...devices['Pixel 7'],browserName:'chromium'}},{name:'iphone-webkit',use:{...devices['iPhone 13'],browserName:'webkit'}}],
 webServer:{command:'npm run start:render',url:'http://127.0.0.1:3000/health',timeout:120000,reuseExistingServer:false}
});
