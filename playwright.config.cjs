const {defineConfig,devices}=require('@playwright/test');
const fs=require('node:fs');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
module.exports=defineConfig({testDir:'tests',testMatch:'*.spec.cjs',timeout:90000,workers:1,reporter:'list',use:{baseURL:process.env.TEST_URL||'http://127.0.0.1:4174/DojoFlow/',viewport:{width:390,height:844},isMobile:true,hasTouch:true,},projects:[{name:'chromium',use:{browserName:'chromium',launchOptions:fs.existsSync(chrome)?{executablePath:chrome}:{}}},{name:'webkit',use:{browserName:'webkit'}}],webServer:process.env.TEST_URL?undefined:{command:'PORT=4174 npm run dev',url:'http://127.0.0.1:4174/DojoFlow/',reuseExistingServer:true}});
