import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/ogden-mobile',timeout:60000,workers:1,retries:0,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3100',launchOptions:process.env.OGDEN_CHROMIUM_EXECUTABLE?{executablePath:process.env.OGDEN_CHROMIUM_EXECUTABLE}:{}},
 projects:[{name:'android-chromium',use:{...devices['Pixel 7'],browserName:'chromium'}},{name:'iphone-viewport-chromium',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',browserName:'chromium'}}],
 webServer:{command:'npm run ogden:preview',url:'http://127.0.0.1:3100/health',timeout:120000,reuseExistingServer:false}
});
