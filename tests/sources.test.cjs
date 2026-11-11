const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function engine(){
 const c=vm.createContext({console,Date,Math,performance,setTimeout,clearTimeout,AbortController,URLSearchParams,location:{search:''},navigator:{onLine:true}});
 for(const f of ['sources','data','engine'])vm.runInContext(fs.readFileSync(`src/${f}.js`,'utf8'),c);
 return c;
}
test('every estimated rail system records estimated timetable and model position',()=>{
 const c=engine();vm.runInContext('generateAll()',c);
 const rows=vm.runInContext('TRIPS.map(t=>({sys:t.sys,...DataSource.describe(t),delay:t.sources.delay && t.sources.delay.type}))',c);
 for(const sys of ['TRA','THSR','TRTC','TYMC','TMRT','KRTC'])assert.ok(rows.some(r=>r.sys===sys),sys);
 for(const r of rows){assert.ok(r.types.includes('estimated_timetable'));assert.ok(r.types.includes('simulated'));assert.match(r.text,/非 GPS/);if(r.sys==='TRA')assert.equal(r.delay,'simulated')}
});
test('official timetable is distinct from live delay and never implies GPS',()=>{
 const c=engine();const r=vm.runInContext("DataSource.describe({sys:'TRA',sources:{timetable:DataSource.record('official_timetable'),delay:DataSource.record('official_delay')}})",c);
 assert.match(r.text,/官方班表/);assert.match(r.text,/官方延誤/);assert.match(r.text,/非 GPS/);
});
test('missing, stale, offline and service error remain distinct',()=>{
 const c=engine();assert.equal(vm.runInContext('DataSource.describe({}).state',c),'missing');
 for(const [record,online,expected] of [["{type:'official_timetable',updatedAt:1,ttl:10}",true,'stale'],["{type:'official_timetable',updatedAt:999,ttl:10,error:true}",true,'error'],["{type:'official_timetable',updatedAt:999,ttl:10}",false,'offline']])assert.equal(vm.runInContext(`DataSource.describe({sources:{timetable:${record}}},1000,${online}).state`,c),expected);
});
test('metro headway inputs stay estimated; flight coordinates always disclose model',()=>{
 const c=engine();assert.match(vm.runInContext("DataSource.describe({sources:{timetable:DataSource.record('estimated_timetable',Date.now(),100,{basis:'official_timetable'})}}).text",c),/非逐班實報/);
 assert.match(vm.runInContext("DataSource.describe({aircraft:true,sources:{timetable:DataSource.record('official_timetable')}}).text",c),/非實際定位/);
});
test('missing delay records do not claim official punctuality, successful zero delay does',async()=>{
 const c=engine();vm.runInContext("generateAll();for(const t of TRIPS)if(t.sys==='TRA'){t.live=true;t.sources={timetable:DataSource.record('official_timetable')}};TDX.get=async()=>[{TrainNo:TRIPS[0].no,DelayTime:0}]",c);
 await vm.runInContext('TDX.loadDelays({})',c);
 assert.equal(vm.runInContext('TRIPS[0].sources.delay.type',c),'official_delay');
 assert.ok(vm.runInContext("TRIPS.some(t=>t.sys==='TRA'&&t.sources.delay===null)",c));
});

test('actual generated flight model is never labelled as an official timetable',()=>{
 const c=engine();c.store={get:(k,d)=>d};vm.runInContext('const DEG=180/Math.PI',c);
 vm.runInContext(fs.readFileSync('src/air.js','utf8').split('async function loadFlights()')[0],c);
 const rows=vm.runInContext('estimateFlights().map(f=>DataSource.describe(f))',c);assert.ok(rows.length>100);
 for(const r of rows){assert.ok(r.types.includes('estimated_timetable'));assert.ok(!r.types.includes('official_timetable'));assert.match(r.text,/非實際定位/)}
});
test('keyless client never requests a token or sends a bearer credential',async()=>{
 const c=engine();const requests=[];c.store={get:(k,d)=>k==='tdxProxy'?'https://proxy.example':d};
 c.fetch=async(url,opt)=>{requests.push({url,opt});return Response.json([],{headers:{'x-data-updated-at':'12345'}})};
 const cred=vm.runInContext('TDX.credentials()',c);assert.equal(cred.proxy,'https://proxy.example');c.cred=cred;
 await vm.runInContext("TDX.get('v2/Rail/TRA/LiveTrainDelay',cred)",c);
 assert.equal(requests.length,1);assert.equal(requests[0].url,'https://proxy.example/tdx/v2/Rail/TRA/LiveTrainDelay');assert.equal(requests[0].opt.headers.authorization,undefined);
 assert.equal(vm.runInContext("TDX.sourceTimes.get('v2/Rail/TRA/LiveTrainDelay')",c),12345);
});
