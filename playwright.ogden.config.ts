import {defineConfig,devices} from '@playwright/test';
const chromiumLaunch=process.env.OGDEN_CHROMIUM_EXECUTABLE?{executablePath:process.env.OGDEN_CHROMIUM_EXECUTABLE}:{};
export default defineConfig({
 testDir:'./tests/ogden-mobile',timeout:60000,workers:1,retries:0,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3100'},
 projects:[
  {name:'android-chromium',use:{...devices['Pixel 7'],browserName:'chromium',launchOptions:chromiumLaunch}},
  {name:'iphone-viewport-chromium',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',browserName:'chromium',launchOptions:chromiumLaunch}},
  {name:'iphone-webkit',use:{...devices['iPhone 13'],browserName:'webkit'}}
 ],
 webServer:{command:'npm run ogden:preview',url:'http://127.0.0.1:3100/health',timeout:120000,reuseExistingServer:false}
});
