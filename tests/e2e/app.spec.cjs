const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const mapRoot=path.dirname(require.resolve('maplibre-gl/package.json'));
async function fixtures(page,{offlineRail=false}={}){
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if (url.hostname==='127.0.0.1') {
   if(offlineRail&&url.pathname==='/data/rail.json')return route.abort();
   return route.continue();
  }
  if(url.hostname==='unpkg.com')return route.fulfill({path:path.join(mapRoot,'dist',path.basename(url.pathname)),contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript'});
  if(url.pathname==='/planet')return route.fulfill({json:{tilejson:'3.0.0',tiles:['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'],maxzoom:14}});
  if(url.hostname==='tiles.openfreemap.org')return route.fulfill({body:Buffer.alloc(0)});
  return route.abort();
 });
}
async function boot(page,options){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await fixtures(page,options);
 await page.clock.install({time:new Date('2026-11-11T10:00:00+08:00')});
 await page.goto('/');await expect(page.locator('#startfocus')).toBeEnabled();return errors;
}
async function board(page,sys){
 if(sys)await page.evaluate(sys=>{window.testUpdatePositions=updatePositions;updatePositions=()=>{window.testUpdatePositions();S.positions=S.positions.filter(p=>p.trip.sys===sys)};updatePositions()},sys);
 await page.locator('#startfocus').click();await page.locator('#dlist button').first().click();await expect(page.locator('#ride')).toBeVisible();
 if(sys)await page.evaluate(()=>{updatePositions=window.testUpdatePositions;delete window.testUpdatePositions});
}
for(const sys of ['TRA','THSR','TRTC'])test(`${sys}: departure countdown reload arrival and rest`,async({page},info)=>{
 const errors=await boot(page);await board(page,sys);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('rp.focus2')).ride);
 expect(before.sys).toBe(sys);await expect(page.locator('#rt')).not.toHaveText('00:00');
 await page.reload();await expect(page.locator('#ride')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rp.focus2')).ride.start)).toBe(before.start);
 await page.clock.fastForward(90*60000);await expect(page.locator('#ticket')).toBeVisible();
 await page.screenshot({path:info.outputPath('ticket.png')});
 await page.locator('#tbreak').click();await expect(page.locator('#rphase')).toHaveText('休息');
 await page.clock.fastForward(5*60000+1000);await expect(page.locator('#depart')).toBeVisible();expect(errors).toEqual([]);
});
test('no credentials: provenance visible in departures, picker and expanded caption',async({page},info)=>{
 const errors=await boot(page);await page.locator('#startfocus').click();await expect(page.locator('#dlist .source').first()).toContainText('推估班表');await expect(page.locator('#dlist .source').first()).toContainText('非 GPS');
 await expect(page.locator('#intro')).toBeHidden();await page.screenshot({path:info.outputPath('departures.png')});await page.locator('#dclose').click();await page.locator('#pickbtn').click();await expect(page.locator('#plist .source').first()).toContainText('推估班表');
 await page.locator('#plist button[data-i]').first().click();await page.evaluate(()=>{S.capOpen=true;renderCaption(true)});await expect(page.locator('#caption .source')).toContainText('非 GPS');expect(errors).toEqual([]);
});
test('offline rail data and no valid services fail safely',async({page})=>{
 const errors=await boot(page,{offlineRail:true});await page.locator('#startpick').click();await expect(page.locator('#plist button').first()).toBeVisible();
 await page.evaluate(()=>{TRIPS.length=0;NODE_TRIPS.clear();updatePositions();renderPicker()});await expect(page.locator('#plist')).toContainText('沒有行駛中的列車');
 await page.locator('#pclose').click();await page.locator('#focusgo').click();await expect(page.locator('#depart')).toBeHidden();expect(errors).toEqual([]);
});
test('background-style sleep across midnight preserves elapsed countdown',async({page})=>{
 const errors=await boot(page);await page.clock.setSystemTime(new Date('2026-11-11T23:50:00+08:00'));await page.evaluate(()=>{S.simMs=Date.now();updatePositions()});await page.locator('#startfocus').click();await page.locator('#ddur button[data-v="15"]').click();await page.locator('#dlist button').first().click();
 const start=await page.evaluate(()=>JSON.parse(localStorage.getItem('rp.focus2')).ride.start);
 await page.clock.fastForward(11*60000);await expect(page.locator('#rphase')).toHaveText('專注');await page.reload();await expect(page.locator('#ride')).toBeVisible();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rp.focus2')).ride.start)).toBe(start);expect(errors).toEqual([]);
});
test('TDX timeout is bounded; repeated timetable application does not duplicate services',async({page})=>{
 const errors=await boot(page);await page.route('https://timeout.test/**',()=>{});
 const message=await page.evaluate(async()=>{try{await tdxFetch('https://timeout.test/never',50,'測試');return ''}catch(e){return e.message}});expect(message).toContain('逾時');
 // Avoid fake-clock timeouts: the application timeout is on the installed clock.
 expect(await page.evaluate(()=>{const trips=TRIPS.filter(t=>['TRA','THSR'].includes(t.sys));TDX.applyTimetables(trips);const first=TRIPS.length;TDX.applyTimetables(trips);return first===TRIPS.length})).toBe(true);expect(errors).toEqual([]);
});
test('fourth completion offers long break and reopening a fixed board is deterministic',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('rp.focus2',JSON.stringify({round:3,day:'2026-11-11'})));
 const errors=await boot(page);await page.locator('#startfocus').click();
 const before=await page.locator('#dlist').innerText();await page.locator('#dclose').click();await page.locator('#focusgo').click();expect(await page.locator('#dlist').innerText()).toBe(before);
 await page.locator('#dlist button').first().click();await page.clock.fastForward(90*60000);await expect(page.locator('#tbreak')).toHaveText('長休息 15 分鐘');expect(errors).toEqual([]);
});
test('keyless proxy refresh uses official sources and repeated loads stay unique',async({page})=>{
 const errors=await boot(page);const requests=[];
 await page.route('https://proxy.test/tdx/**',route=>{
  requests.push(route.request());const url=route.request().url();
  const stops=[{StationName:{Zh_tw:'台北'},ArrivalTime:'10:00',DepartureTime:'10:00'},{StationName:{Zh_tw:'板橋'},ArrivalTime:'10:30',DepartureTime:'10:30'}];
  let data=[];
  if(url.includes('DailyTrainTimetable'))data={TrainTimetables:[{TrainInfo:{TrainNo:'101',TrainTypeName:{Zh_tw:'自強'}},StopTimes:stops}]};
  else if(url.includes('DailyTimetable'))data=[{DailyTrainInfo:{TrainNo:'201'},StopTimes:stops}];
  else if(url.includes('LiveTrainDelay'))data=[{TrainNo:'101',DelayTime:0}];
  return route.fulfill({json:data,headers:{'x-data-updated-at':String(Date.parse('2026-11-11T10:00:00+08:00'))}});
 });
 await page.locator('#startpick').click();await page.locator('#pclose').click();await page.locator('#setbtn').click();
 await page.locator('#tdxproxy').fill('https://proxy.test');await page.evaluate(()=>{TDX.gap=1;TDX.nextAt=0});await page.locator('#tdxproxygo').click();
 await page.waitForFunction(()=>TDX.ok&&!TDX.loading);await page.evaluate(()=>connectTDX({proxy:'https://proxy.test'},true));
 const counts=await page.evaluate(()=>({trains:TRIPS.filter(t=>t.sys==='TRA'||t.sys==='THSR').length,source:DataSource.describe(TRIPS.find(t=>t.sys==='TRA')).text,credentials:store.get('tdx',{})}));
 expect(counts.trains).toBe(2);expect(counts.source).toContain('官方班表');expect(counts.source).toContain('官方延誤');expect(counts.credentials).toEqual({});
 expect(requests.length).toBeGreaterThan(0);for(const r of requests)expect(r.headers().authorization).toBeUndefined();expect(errors).toEqual([]);
});
test('provider errors, expired data and offline mode have distinct visible labels',async({page,context})=>{
 const errors=await boot(page);await page.locator('#startpick').click();
 await page.route('https://broken.test/**',r=>r.fulfill({status:502,json:{error:'upstream_unavailable'}}));
 await page.evaluate(async()=>{TDX.gap=1;TDX.nextAt=0;await connectTDX({proxy:'https://broken.test'},true);renderPicker()});await expect(page.locator('#plist .source').first()).toContainText('服務錯誤');
 await page.evaluate(()=>{for(const t of TRIPS)t.sources.timetable={type:'official_timetable',updatedAt:Date.now()-3600000,ttl:1000};renderPicker()});await expect(page.locator('#plist .source').first()).toContainText('資料過期');
 await context.setOffline(true);await page.evaluate(()=>renderPicker());await expect(page.locator('#plist .source').first()).toContainText('離線');expect(errors).toEqual([]);
});
// This uses real Performance API/RAF and real MapLibre; remote tiles are fixed empty fixtures.
test('performance sample',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixtures(page);
 await page.addInitScript(()=>{
  const fixed=Date.parse('2026-11-11T10:00:00+08:00');Date.now=()=>fixed+performance.now();
  const observer=new MutationObserver(()=>{const b=document.querySelector('#startroam');if(b&&!b.disabled){performance.mark('test:first-interactive');observer.disconnect()}});
  observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 });
 await page.goto('/');await expect(page.locator('#startroam')).toBeEnabled();await page.locator('#startroam').click();
 const sample=await page.evaluate(()=>new Promise(resolve=>{
  let frames=0,renders=0;const start=performance.now(),render=()=>renders++;map.on('render',render);
  function next(){frames++;if(performance.now()-start<2000)return requestAnimationFrame(next);map.off('render',render);resolve({firstInteractiveMs:performance.getEntriesByName('test:first-interactive')[0]?.startTime,rafFps:frames*1000/(performance.now()-start),mapFps:renders*1000/(performance.now()-start),heapBytes:performance.memory?.usedJSHeapSize??null})}requestAnimationFrame(next);
 }));
 expect(sample.firstInteractiveMs).toBeGreaterThan(0);expect(sample.rafFps).toBeGreaterThan(0);expect(errors).toEqual([]);
 fs.writeFileSync(info.outputPath('performance.json'),JSON.stringify(sample,null,2));await info.attach('performance',{body:JSON.stringify(sample),contentType:'application/json'});console.log(info.project.name,sample);
});
