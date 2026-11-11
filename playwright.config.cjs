const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests/e2e', timeout:45000, workers:1, fullyParallel:false,
 use:{baseURL:process.env.RAIL_TEST_URL || 'http://127.0.0.1:8000',headless:true,timezoneId:'Asia/Taipei',
 launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']},trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1280,height:800}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
 webServer:process.env.RAIL_TEST_URL ? undefined:{command:'python3 -m http.server 8000 --bind 127.0.0.1',url:'http://127.0.0.1:8000',reuseExistingServer:!process.env.CI},
});
