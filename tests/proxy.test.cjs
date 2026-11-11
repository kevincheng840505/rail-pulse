const {test}=require('node:test');
const assert=require('node:assert/strict');
async function fixture(){
 const {createProxy}=await import('../proxy/worker.mjs');let now=100000,calls=[],allow=true,fail=false;
 const entries=new Map();const cache={async match(k){const e=entries.get(k.url);return e && e.until>now ? e.response.clone():undefined},async put(k,r){entries.set(k.url,{response:r.clone(),until:now+Number(r.headers.get('cache-control').split('=')[1])*1000})}};
 const env={TDX_CLIENT_ID:'server-id',TDX_CLIENT_SECRET:'server-secret',ALLOWED_ORIGINS:'https://site.example',RATE_LIMITER:{async limit(){return {success:allow}}}};
 const proxy=createProxy({cache,now:()=>now,fetcher:async(u,opt)=>{calls.push([u,opt]);if(fail)return new Response('private upstream failure server-secret',{status:500});return Response.json(u.includes('/token')?{access_token:'server-token',expires_in:3600}:[{TrainNo:'101',DelayTime:0}])}});
 const request=(path='v2/Rail/TRA/LiveTrainDelay',init={})=>proxy.fetch(new Request('https://proxy.example/tdx/'+path,{headers:{origin:'https://site.example'},...init}),env);
 return {proxy,env,request,calls,advance(ms){now+=ms},deny(){allow=false},fail(){fail=true}};
}
test('proxy caches allowlisted data with original source time and server-only credentials',async()=>{
 const f=await fixture();let r=await f.request();assert.equal(r.status,200);assert.equal(r.headers.get('x-data-updated-at'),'100000');assert.equal(f.calls.length,2);
 assert.match(String(f.calls[0][1].body),/server-secret/);assert.equal(f.calls[1][1].headers.authorization,'Bearer server-token');
 f.advance(1000);r=await f.request();assert.equal(f.calls.length,2);assert.equal(r.headers.get('x-data-updated-at'),'100000');assert.doesNotMatch(await r.text(),/server-secret|server-token/);
 f.advance(30000);assert.equal((await f.request()).status,200);assert.equal(f.calls.length,3);
});
test('proxy rejects URL injection, unknown endpoints and all arbitrary query parameters',async()=>{
 const f=await fixture();for(const path of ['https://evil.example','v2/Rail/TRA/LiveTrainDelay?url=https://evil.example','v2/Rail/TRA/LiveTrainDelay?$top=1','v2/Rail/TRA/%4civeTrainDelay','v2/Other','../auth/token'])assert.equal((await f.request(path)).status,404,path);assert.equal(f.calls.length,0);
});
test('origin, method and managed rate limits are required even on cache hits',async()=>{
 const f=await fixture();assert.equal((await f.request(undefined,{headers:{origin:'https://evil.example'}})).status,403);assert.equal((await f.request(undefined,{method:'POST'})).status,405);
 assert.equal((await f.request()).status,200);f.deny();const r=await f.request();assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');assert.equal(f.calls.length,2);
});
test('missing configuration fails closed',async()=>{
 const f=await fixture();delete f.env.RATE_LIMITER;assert.equal((await f.request()).status,503);assert.equal(f.calls.length,0);
});
test('upstream failures expose neither secrets nor upstream response bodies',async()=>{
 const f=await fixture();f.fail();const r=await f.request();assert.equal(r.status,502);assert.equal(await r.text(),'{"error":"upstream_unavailable"}');
});
test('concurrent uncached requests share one token and one API fetch',async()=>{
 const f=await fixture();const responses=await Promise.all(Array.from({length:5},()=>f.request()));for(const r of responses)assert.equal(r.status,200);assert.equal(f.calls.length,2);
});
test('cache entries for Today never cross Taiwan calendar dates',async()=>{
 const f=await fixture();await f.request('v3/Rail/TRA/DailyTrainTimetable/Today');f.advance(864e5);await f.request('v3/Rail/TRA/DailyTrainTimetable/Today');assert.equal(f.calls.length,4);
});
