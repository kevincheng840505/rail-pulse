// All upstream targets are fixed here. Never accept a caller-supplied URL or query.
const ROOT = 'https://tdx.transportdata.tw/';
const routes = new Map([
  ['v3/Rail/TRA/DailyTrainTimetable/Today',300], ['v2/Rail/THSR/DailyTimetable/Today',300],
  ['v2/Rail/TRA/LiveTrainDelay',30], ['v3/Rail/TRA/Alert',60], ['v2/Rail/THSR/AlertInfo',60],
]);
for (const op of ['TRTC','TYMC','TMRT','KRTC','KLRT']) for (const kind of ['S2STravelTime','Frequency','FirstLastTimetable','Alert']) routes.set(`v2/Rail/Metro/${kind}/${op}`,kind==='Alert'?60:86400);
for (const ap of ['TPE','TSA','KHH','RMQ']) for (const kind of ['Departure','Arrival']) routes.set(`v2/Air/FIDS/Airport/${kind}/${ap}`,60);

export function createProxy({fetcher = fetch, cache = globalThis.caches && caches.default, now = Date.now} = {}) {
  let token = '', expires = 0, authing;
  const inflight = new Map();
  const requestJSON = async (url, init) => {
    const response = await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('upstream');
    // Bound streamed data before parsing; credentials or raw upstream errors never go back to clients.
    const reader = response.body.getReader(); let length = 0; const chunks = [];
    for (;;) { const {value,done} = await reader.read(); if (done) break; length += value.byteLength; if (length>16*1024*1024) {await reader.cancel();throw new Error('size')} chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0;for (const c of chunks){bytes.set(c,offset);offset+=c.length}
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const auth = async env => {
    if (token && now()<expires) return token;
    if (!authing) authing = (async()=>{
      const j = await requestJSON(ROOT+'auth/realms/TDXConnect/protocol/openid-connect/token', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.TDX_CLIENT_ID,client_secret:env.TDX_CLIENT_SECRET})});
      if (!j.access_token || !(j.expires_in>60)) throw new Error('auth');
      token=j.access_token;expires=now()+(j.expires_in-60)*1000;return token;
    })().finally(()=>{authing=null});
    return authing;
  };
  return {async fetch(request,env) {
    const origin = request.headers.get('origin');
    const origins = (env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
    const cors = origins.includes(origin) ? {'access-control-allow-origin':origin,'vary':'Origin','access-control-expose-headers':'X-Data-Updated-At, Retry-After'} : {};
    const respond = (status,error,extra={})=>Response.json({error},{status,headers:{...cors,'cache-control':'no-store',...extra}});
    if (!origin || !origins.includes(origin)) return respond(403,'origin_not_allowed');
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'Content-Type','access-control-max-age':'3600'}});
    if (request.method!=='GET') return respond(405,'method_not_allowed',{'allow':'GET, OPTIONS'});
    const url = new URL(request.url), path=url.pathname.slice('/tdx/'.length);
    if (!url.pathname.startsWith('/tdx/') || !routes.has(path) || url.search || url.username || url.password) return respond(404,'route_not_allowed');
    if (!env.TDX_CLIENT_ID || !env.TDX_CLIENT_SECRET || !env.RATE_LIMITER || !cache) return respond(503,'proxy_not_configured');
    // Managed edge rate limiter is mandatory; no per-isolate in-memory security fallback.
    try {const limit=await env.RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'});if(!limit.success)return respond(429,'rate_limited',{'retry-after':'60'})} catch {return respond(503,'rate_limiter_unavailable')}
    const day = new Date(now()+8*3600e3).toISOString().slice(0,10);
    const key = new Request(`https://rail-pulse-cache.invalid/${day}/${path}`);
    try {
      let response = await cache.match(key);
      if (!response) {
        if (!inflight.has(key.url)) inflight.set(key.url,(async()=>{
          const tk=await auth(env);
          const j=await requestJSON(ROOT+'api/basic/'+path+'?$format=JSON',{headers:{authorization:'Bearer '+tk}});
          if (!j || typeof j!=='object') throw new Error('data');
          const result=Response.json(j,{headers:{'cache-control':'public, max-age='+routes.get(path),'x-data-updated-at':String(now())}});
          await cache.put(key,result.clone());return result;
        })().finally(()=>inflight.delete(key.url)));
        response=(await inflight.get(key.url)).clone();
      }
      const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);
      // Browser always revalidates through edge limiter/cache; do not hide source freshness in a browser cache.
      headers.set('cache-control','no-store');
      return new Response(response.body,{status:response.status,headers});
    } catch {token='';expires=0;return respond(502,'upstream_unavailable')}
  }};
}
export default createProxy();
