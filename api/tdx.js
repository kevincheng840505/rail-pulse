/* TDX 代理（Vercel Serverless Function）
   網站是公開的靜態頁面，金鑰不能放在前端。這支函式在伺服器上用環境變數裡的
   TDX_CLIENT_ID / TDX_CLIENT_SECRET 換 token，替所有訪客向 TDX 讀資料，
   並讓 Vercel 的 CDN 依資料種類快取一段時間：同一份資料不論多少人在看，
   TDX 每段時間只會被讀一次，不會超過金鑰的頻率限制。

   用法：GET /api/tdx?path=v2/Rail/TRA/LiveTrainDelay
   只允許網站用得到的幾個固定路徑（不接受查詢參數），別人拿去當通用代理也讀不到其他東西，
   也不能靠改參數繞過快取、耗盡金鑰的額度。 */

const OPS = '(TRTC|TYMC|TMRT|KRTC|KLRT)';
const ALLOW = [
  // [完整路徑（不接受查詢參數，避免有人換參數繞過快取、耗盡額度）, CDN 快取秒數]
  [/^v2\/Rail\/TRA\/LiveTrainDelay$/, 50],
  [/^v3\/Rail\/TRA\/DailyTrainTimetable\/Today$/, 1800],
  [/^v2\/Rail\/THSR\/DailyTimetable\/Today$/, 1800],
  [/^v3\/Rail\/TRA\/Alert$/, 300], [/^v2\/Rail\/THSR\/AlertInfo$/, 300],
  [new RegExp('^v2/Rail/Metro/Alert/' + OPS + '$'), 300],
  [new RegExp('^v2/Rail/Metro/(S2STravelTime|Frequency|FirstLastTimetable)/' + OPS + '$'), 86400],
  [/^v2\/Air\/FIDS\/Airport\/(Departure|Arrival)\/(TPE|TSA|KHH|RMQ)$/, 240],
];
const ORIGINS = (process.env.ALLOW_ORIGINS || 'https://kevincheng840505.github.io').split(',').map(s => s.trim()).filter(Boolean);

let token = null, exp = 0, authing = null;
async function getToken() {
  if (token && Date.now() < exp) return token;
  if (authing) return authing;
  authing = (async () => {
    const r = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.TDX_CLIENT_ID || '', client_secret: process.env.TDX_CLIENT_SECRET || '' }),
    });
    if (!r.ok) throw Object.assign(new Error('auth ' + r.status), { status: 502 });
    const j = await r.json();
    token = j.access_token; exp = Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000;
    return token;
  })().finally(() => { authing = null; });
  return authing;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const okOrigin = ORIGINS.includes('*') || ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (okOrigin && origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const path = String((req.query && req.query.path) || '').replace(/^\/+/, '');
  const rule = ALLOW.find(([re]) => re.test(path));
  if (!rule) { res.status(400).json({ error: 'path not allowed' }); return; }
  if (!process.env.TDX_CLIENT_ID || !process.env.TDX_CLIENT_SECRET) { res.status(503).json({ error: 'TDX key not configured' }); return; }

  try {
    let tries = 0, r;
    while (true) {
      const tk = await getToken();
      r = await fetch('https://tdx.transportdata.tw/api/basic/' + path + '?$format=JSON', { headers: { authorization: 'Bearer ' + tk, 'accept-encoding': 'gzip' } });
      if (r.status === 401 && tries < 1) { token = null; tries++; continue; }
      if (r.status === 429 && tries < 3) { tries++; await new Promise(ok => setTimeout(ok, 600 * tries)); continue; }
      break;
    }
    const body = await r.text();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (r.ok) res.setHeader('Cache-Control', `public, max-age=${Math.min(rule[1], 60)}, s-maxage=${rule[1]}, stale-while-revalidate=${rule[1] * 2}`);
    else { res.setHeader('Cache-Control', 'no-store'); if (r.headers.get('retry-after')) res.setHeader('Retry-After', r.headers.get('retry-after')); }
    res.status(r.status).send(body);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(e.status || 502).json({ error: String(e.message || e) });
  }
};
