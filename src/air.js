/* ===== 天上的飛機：各機場起降 =====
   有 TDX 金鑰時讀取桃園、松山、高雄、台中機場的當日航班（FIDS），依實際／預估時間起降；
   沒有金鑰時依各機場的班次密度推估。航線是推估的：起飛沿跑道爬升後轉向目的地，
   降落則從來的方向切入跑道延長線、以 3 度下滑角落地。 */

/* 台灣機場：[名稱, 跑道中心緯度, 經度, 跑道真方位（東北季風期使用的方向）, 跑道長（公里）, 平行跑道間距（公里）] */
const AIRPORTS = {
  TPE: ['桃園', 25.0770, 121.2290, 53, 3.66, 1.5],
  TSA: ['松山', 25.0694, 121.5520, 97, 2.6, 0],
  KHH: ['高雄', 22.5770, 120.3500, 89, 3.15, 0],
  RMQ: ['台中', 24.2647, 120.6206, 359, 3.65, 0],
  TNN: ['台南', 22.9504, 120.2057, 1, 3.05, 0],
  HUN: ['花蓮', 24.0231, 121.6162, 28, 2.75, 0],
  TTT: ['台東', 22.7550, 121.1017, 40, 2.4, 0],
  MZG: ['澎湖', 23.5687, 119.6282, 20, 3.0, 0],
  KNH: ['金門', 24.4279, 118.3592, 58, 3.0, 0],
  LZN: ['馬祖南竿', 26.1598, 119.9583, 30, 1.6, 0],
  CYI: ['嘉義', 23.4618, 120.3928, 0, 3.0, 0],
};
/* 國外與離島目的地，只用來決定起飛後轉向的方位 */
const FAR_AIRPORTS = {
  HKG:[22.31,113.91,'香港'], MFM:[22.15,113.59,'澳門'], NRT:[35.77,140.39,'東京成田'], HND:[35.55,139.78,'東京羽田'],
  KIX:[34.43,135.23,'大阪關西'], NGO:[34.86,136.81,'名古屋'], FUK:[33.59,130.45,'福岡'], OKA:[26.20,127.65,'沖繩'],
  CTS:[42.78,141.69,'札幌'], SDJ:[38.14,140.92,'仙台'], KMJ:[32.84,130.86,'熊本'], KOJ:[31.80,130.72,'鹿兒島'], HIJ:[34.44,132.92,'廣島'],
  OKJ:[34.76,133.86,'岡山'], TAK:[34.21,134.02,'高松'], KMQ:[36.39,136.41,'小松'], AOJ:[40.73,140.69,'青森'], ISG:[24.40,124.25,'石垣'],
  ICN:[37.46,126.44,'首爾仁川'], GMP:[37.56,126.80,'首爾金浦'], PUS:[35.18,128.94,'釜山'], CJU:[33.51,126.49,'濟州'], TAE:[35.90,128.66,'大邱'],
  PVG:[31.14,121.81,'上海浦東'], SHA:[31.20,121.34,'上海虹橋'], PEK:[40.08,116.58,'北京'], PKX:[39.51,116.41,'北京大興'],
  XMN:[24.54,118.13,'廈門'], CAN:[23.39,113.30,'廣州'], SZX:[22.64,113.81,'深圳'], HGH:[30.23,120.43,'杭州'], NKG:[31.74,118.86,'南京'],
  FOC:[25.94,119.66,'福州'], CTU:[30.58,103.95,'成都'], TFU:[30.31,104.44,'成都天府'], CKG:[29.72,106.64,'重慶'], WUH:[30.78,114.21,'武漢'],
  TSN:[39.12,117.35,'天津'], TAO:[36.36,120.09,'青島'], DLC:[38.97,121.54,'大連'], SHE:[41.64,123.48,'瀋陽'], XIY:[34.45,108.75,'西安'],
  BKK:[13.69,100.75,'曼谷'], DMK:[13.91,100.61,'曼谷廊曼'], CNX:[18.77,98.96,'清邁'], HKT:[8.11,98.32,'普吉島'],
  SIN:[1.36,103.99,'新加坡'], KUL:[2.75,101.71,'吉隆坡'], PEN:[5.30,100.28,'檳城'], BKI:[5.94,116.05,'亞庇'],
  MNL:[14.51,121.02,'馬尼拉'], CEB:[10.31,123.98,'宿霧'], CRK:[15.19,120.56,'克拉克'],
  SGN:[10.82,106.66,'胡志明市'], HAN:[21.22,105.81,'河內'], DAD:[16.04,108.20,'峴港'], CXR:[12.00,109.22,'芽莊'], PQC:[10.17,103.99,'富國島'],
  PNH:[11.55,104.84,'金邊'], RGN:[16.91,96.13,'仰光'], CGK:[-6.13,106.66,'雅加達'], DPS:[-8.75,115.17,'峇里島'], SUB:[-7.38,112.79,'泗水'],
  ROR:[7.37,134.54,'帛琉'], GUM:[13.48,144.80,'關島'], SPN:[15.12,145.73,'塞班'],
  LAX:[33.94,-118.41,'洛杉磯'], SFO:[37.62,-122.38,'舊金山'], SEA:[47.45,-122.31,'西雅圖'], YVR:[49.19,-123.18,'溫哥華'],
  ONT:[34.06,-117.60,'安大略'], PHX:[33.43,-112.01,'鳳凰城'], DFW:[32.90,-97.04,'達拉斯'], JFK:[40.64,-73.78,'紐約'], ORD:[41.98,-87.90,'芝加哥'],
  IAH:[29.98,-95.34,'休士頓'], YYZ:[43.68,-79.63,'多倫多'], HNL:[21.32,-157.92,'檀香山'], ANC:[61.17,-149.99,'安克拉治'],
  LHR:[51.47,-0.45,'倫敦'], CDG:[49.01,2.55,'巴黎'], AMS:[52.31,4.76,'阿姆斯特丹'], FRA:[50.04,8.56,'法蘭克福'], MUC:[48.35,11.79,'慕尼黑'],
  VIE:[48.11,16.57,'維也納'], PRG:[50.10,14.26,'布拉格'], MXP:[45.63,8.72,'米蘭'], FCO:[41.80,12.25,'羅馬'], IST:[41.26,28.74,'伊斯坦堡'],
  DXB:[25.25,55.36,'杜拜'], DOH:[25.27,51.61,'杜哈'], AUH:[24.43,54.65,'阿布達比'], DEL:[28.56,77.10,'德里'],
  SYD:[-33.94,151.18,'雪梨'], BNE:[-27.38,153.12,'布里斯本'], MEL:[-37.67,144.84,'墨爾本'], AKL:[-37.01,174.79,'奧克蘭'],
  MFK:[26.22,119.99,'馬祖北竿'], GNI:[22.67,121.47,'綠島'], KYD:[22.03,121.53,'蘭嶼'], CMJ:[23.22,119.42,'七美'], WOT:[23.37,119.50,'望安'],
};
const AIRLINES = { CI:'華航', BR:'長榮', JX:'星宇', AE:'華信', B7:'立榮', IT:'台灣虎航', CX:'國泰', UO:'香港快運', HX:'香港航空', NX:'澳門航空',
  JL:'日航', NH:'全日空', MM:'樂桃', GK:'捷星日本', '7G':'星悅', KE:'大韓', OZ:'韓亞', '7C':'濟州航空', TW:'德威', LJ:'真航空', ZE:'易斯達',
  CA:'國航', MU:'東航', CZ:'南航', FM:'上航', MF:'廈航', SQ:'新航', TR:'酷航', TG:'泰航', VZ:'泰越捷', FD:'泰亞航', MH:'馬航', AK:'亞航', D7:'亞航X',
  PR:'菲航', '5J':'宿霧太平洋', Z2:'菲亞航', VN:'越航', VJ:'越捷', QH:'越竹', GA:'印尼航', UA:'聯合', AA:'美航', DL:'達美', AS:'阿拉斯加', AC:'加航',
  KL:'荷航', TK:'土航', EK:'阿聯酋', QR:'卡達', EY:'阿提哈德', OS:'奧航', QF:'澳航', NZ:'紐航', FX:'聯邦快遞', '5X':'UPS', '5Y':'亞特拉斯' };
/* 尾翼顏色 */
const TAIL = { CI:'#D9667E', AE:'#D9667E', BR:'#2F7D5A', B7:'#2F7D5A', JX:'#B89660', IT:'#F2B134', CX:'#1E6F6A', JL:'#C8102E', NH:'#1E3F8F', KE:'#5FA8D3', SQ:'#F1A51E', TG:'#5B2C83', VN:'#1C6E8C', MM:'#C9418F', UA:'#1D3E78' };

const AIR = { gen: 0, flights: [], live: false, status: '', on: store.get('planes', true), loadAt: 0, layers: false, last: 0, seen: new Map() };

/* ---------- 平面座標（公里，北為 +y） ---------- */
const AKX = 111.32 * Math.cos(23.7 / DEG), AKY = 110.57;
const toXY = (lat, lon) => [(lon - 121) * AKX, (lat - 23.7) * AKY];
const toLL = (x, y) => [x / AKX + 121, y / AKY + 23.7];
const hdgVec = h => [Math.sin(h / DEG), Math.cos(h / DEG)];
function bearingTo(lat1, lon1, lat2, lon2) {
  const p1 = lat1 / DEG, p2 = lat2 / DEG, dl = (lon2 - lon1) / DEG;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}
/* 季風：10~4 月吹東北風，用「迎風」方向起降；5~9 月反過來 */
function runwayFor(code, salt) {
  const A = AIRPORTS[code]; if (!A) return null;
  const mon = new Date(Date.now() + 8 * 3600e3).getUTCMonth() + 1;
  const h = mon >= 5 && mon <= 9 ? (A[3] + 180) % 360 : A[3];
  const [cx, cy] = toXY(A[1], A[2]), v = hdgVec(h), n = [v[1], -v[0]];
  const off = A[5] ? (hash(salt) < 0.5 ? -0.5 : 0.5) * A[5] : 0;
  const c = [cx + n[0] * off, cy + n[1] * off];
  return { h, v, start: [c[0] - v[0] * A[4] / 2, c[1] - v[1] * A[4] / 2], len: A[4] };
}
/* 從 p（方向 h）轉向目標 tgt，每 0.6 公里最多轉 4 度，回傳沿途的點 */
function turnToward(p, h, tgt, maxKm) {
  const pts = []; let x = p[0], y = p[1], hd = h, d = 0;
  while (d < maxKm) {
    const want = (Math.atan2(tgt[0] - x, tgt[1] - y) * DEG + 360) % 360;
    let diff = ((want - hd + 540) % 360) - 180;
    if (Math.hypot(tgt[0] - x, tgt[1] - y) < 1.2) break;
    hd += Math.max(-4, Math.min(4, diff));
    const v = hdgVec(hd); x += v[0] * 0.6; y += v[1] * 0.6; d += 0.6;
    pts.push([x, y]);
    if (Math.abs(diff) < 1) { pts.push(tgt); break; }
  }
  return pts;
}
const farPoint = (rw, brg, km) => { const v = hdgVec(brg); return [rw.start[0] + v[0] * km, rw.start[1] + v[1] * km]; };

/* 建立一個航班的路徑：pts（公里座標）、cum（距離）、alt（公尺）、tt（相對分鐘） */
function buildFlight(f) {
  const dep = f.depAp && runwayFor(f.depAp, f.id), arr = f.arrAp && runwayFor(f.arrAp, f.id + 'a');
  let pts = [], liftIdx = -1, tdIdx = -1;
  let depPart = null, arrPart = null;
  const mid = dep && arr ? [(dep.start[0] + arr.start[0]) / 2, (dep.start[1] + arr.start[1]) / 2] : null;
  if (dep) {
    const s = dep.start, lift = [s[0] + dep.v[0] * 2, s[1] + dep.v[1] * 2], climb = [s[0] + dep.v[0] * 10, s[1] + dep.v[1] * 10];
    const tgt = mid || farPoint(dep, f.brg, 160);
    depPart = [s, lift, climb, ...turnToward(climb, dep.h, tgt, 260)];
    if (!mid) depPart.push(tgt);
  }
  if (arr) {
    // 從跑道頭往回推：進場航線先在跑道延長線上 16 公里，再轉向來的方向
    const back = (arr.h + 180) % 360, bv = hdgVec(back), t = arr.start;
    const fin = [t[0] + bv[0] * 16, t[1] + bv[1] * 16];
    const src = mid || farPoint(arr, f.brg, 160);
    const rev = [fin, ...turnToward(fin, back, src, 260)];
    if (!mid) rev.push(src);
    const roll = [t[0] + arr.v[0] * Math.min(2, arr.len * 0.7), t[1] + arr.v[1] * Math.min(2, arr.len * 0.7)];
    arrPart = [...rev.reverse(), t, roll];
  }
  if (depPart && arrPart) { pts = depPart.concat(arrPart.slice(1)); }
  else pts = depPart || arrPart;
  if (!pts || pts.length < 3) return null;
  if (depPart) liftIdx = 1;
  if (arrPart) tdIdx = pts.length - 2;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const sLift = liftIdx >= 0 ? cum[liftIdx] : -1e9, sTd = tdIdx >= 0 ? cum[tdIdx] : 1e9;
  const cruise = mid ? 4000 : 9500; // 國內線約 4 公里高，要飛越中央山脈
  const alt = cum.map(s => {
    if (s <= sLift || s >= sTd) return 0;
    return Math.max(0, Math.min(cruise, (s - sLift) * 95, (sTd - s) * 52));
  });
  // 速度（公尺/秒）：跑道上加減速，空中依高度
  const spd = (s, a) => {
    if (s < sLift) return 15 + 70 * Math.sqrt(Math.max(0, s) / Math.max(0.1, sLift));
    if (s > sTd) return Math.max(12, 70 - 58 * (s - sTd) / Math.max(0.1, total - sTd));
    return 75 + a / 9500 * 155;
  };
  const tt = [0];
  for (let i = 1; i < pts.length; i++) {
    const ds = (cum[i] - cum[i - 1]) * 1000, v = (spd(cum[i - 1], alt[i - 1]) + spd(cum[i], alt[i])) / 2;
    tt.push(tt[i - 1] + ds / v / 60);
  }
  // 時間錨點：有起飛就以起飛時間（離地）為準，否則以落地時間為準
  const off = (f.anchor === 'td' ? tdIdx < 0 : liftIdx >= 0) ? f.t - tt[liftIdx] : f.t - tt[tdIdx];
  return { pts, cum, alt, tt: tt.map(x => x + off) };
}
function flightPos(f, m) {
  const P = f.path; if (!P) return null;
  const tt = P.tt, n = tt.length;
  for (const mm of [m, m + 1440, m - 1440]) {
    if (mm < tt[0] || mm > tt[n - 1]) continue;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (tt[md] <= mm) lo = md; else hi = md; }
    const k = (mm - tt[lo]) / Math.max(1e-6, tt[hi] - tt[lo]);
    const a = P.pts[lo], b = P.pts[hi];
    const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
    const alt = P.alt[lo] + (P.alt[hi] - P.alt[lo]) * k;
    const h = (Math.atan2(b[0] - a[0], b[1] - a[1]) * DEG + 360) % 360;
    // 爬升／下降時機身仰角
    const pitch = Math.atan2(P.alt[hi] - P.alt[lo], Math.max(1, (P.cum[hi] - P.cum[lo]) * 1000)) * DEG;
    // 進出畫面：最外圍 15 公里淡入淡出（只處理沒有另一端機場的國際線）
    const fade = Math.min(1, (P.cum[lo] + (P.cum[hi] - P.cum[lo]) * k) / 15, (P.cum[n - 1] - (P.cum[lo] + (P.cum[hi] - P.cum[lo]) * k)) / 15);
    return { x, y, alt, h, pitch, fade: Math.max(0, fade) };
  }
  return null;
}

/* ---------- 航班來源 ---------- */
const nameOf = c => (AIRPORTS[c] && AIRPORTS[c][0]) || (FAR_AIRPORTS[c] && FAR_AIRPORTS[c][2]) || c;
function coordOf(c) { const A = AIRPORTS[c]; if (A) return [A[1], A[2]]; const F = FAR_AIRPORTS[c]; return F ? [F[0], F[1]] : null; }
function makeFlight(o) {
  // o: { no, airline, dep, arr, t, kind }
  const home = o.kind === 'dep' ? o.dep : o.arr, other = o.kind === 'dep' ? o.arr : o.dep;
  const hc = coordOf(home), oc = coordOf(other);
  const f = { id: o.kind + o.no + home + Math.round(o.t), no: o.no, airline: o.airline, dep: o.dep, arr: o.arr, t: o.t,
    depAp: null, arrAp: null, brg: oc && hc ? bearingTo(hc[0], hc[1], oc[0], oc[1]) : 330 + hash(o.no) * 60 };
  // 國內線兩端都在台灣：畫完整航程；時間錨點仍是這一端（起飛或落地）
  if (o.kind === 'dep') { f.depAp = home; if (o.both) f.arrAp = other; f.anchor = 'lift'; }
  else { f.arrAp = home; if (o.both) f.depAp = other; f.anchor = 'td'; }
  f.path = buildFlight(f);
  return f.path ? f : null;
}
/* 沒有金鑰時：依各機場的班次密度推估 */
function estimateFlights() {
  const out = [];
  const plan = [
    ['TPE', 'dep', '06:30', '23:40', 5, ['NRT','HND','KIX','ICN','HKG','PVG','BKK','SIN','MNL','SGN','LAX','SFO','OKA','FUK','CTS','KUL','CGK','HAN','DAD','AMS','LHR','YVR','SEA']],
    ['TPE', 'arr', '05:30', '23:50', 5, ['NRT','HND','KIX','ICN','HKG','PVG','BKK','SIN','MNL','SGN','LAX','SFO','OKA','FUK','CTS','KUL','CGK','HAN','DAD','AMS','LHR','YVR','SEA']],
    ['TSA', 'dep', '07:00', '21:30', 12, ['HND','GMP','SHA','KNH','MZG','HUN','TTT','LZN']],
    ['TSA', 'arr', '07:30', '22:00', 12, ['HND','GMP','SHA','KNH','MZG','HUN','TTT','LZN']],
    ['KHH', 'dep', '06:40', '22:30', 14, ['HKG','NRT','KIX','ICN','BKK','MNL','SGN','MZG','KNH','OKA','MFM']],
    ['KHH', 'arr', '07:20', '23:30', 14, ['HKG','NRT','KIX','ICN','BKK','MNL','SGN','MZG','KNH','OKA','MFM']],
    ['RMQ', 'dep', '07:10', '21:00', 35, ['MZG','KNH','HKG','MFM','ICN','NRT']],
    ['RMQ', 'arr', '07:50', '21:40', 35, ['MZG','KNH','HKG','MFM','ICN','NRT']],
  ];
  const lines = ['CI','BR','JX','IT','CX','JL','NH','KE','SQ','TG','VN','MM'], dom = ['AE','B7','UNI'];
  for (const [ap, kind, a, b, hw, dests] of plan) {
    let j = 0;
    for (let t = hm(a) + hash(ap + kind) * hw; t <= hm(b); t += hw * (0.6 + hash(ap + kind + j) * 0.8), j++) {
      const other = dests[Math.floor(hash(ap + kind + 'd' + j) * dests.length)];
      const isDom = !!AIRPORTS[other];
      const al = isDom ? (hash(ap + j) < 0.5 ? 'AE' : 'B7') : lines[Math.floor(hash(ap + kind + 'a' + j) * lines.length)];
      const no = al + (100 + Math.floor(hash(ap + kind + 'n' + j) * 800));
      const f = makeFlight({ no, airline: al === 'UNI' ? 'B7' : al, dep: kind === 'dep' ? ap : other, arr: kind === 'arr' ? ap : other, t, kind, both: isDom });
      if (f) out.push(f);
    }
  }
  return out;
}
async function loadFlights() {
  const cred = store.get('tdx', {});
  if (!cred.id || !cred.secret) { AIR.flights = estimateFlights(); AIR.live = false; AIR.status = '班表推估'; return; }
  AIR.loadAt = Date.now();
  const gen = ++AIR.gen;
  const d0 = dayStart(Date.now());
  const toMin = s => { const t = Date.parse(String(s).length <= 16 ? s + ':00+08:00' : s); return isNaN(t) ? null : (t - d0) / 60000; };
  const res = [];
  for (const ap of ['TPE', 'TSA', 'KHH', 'RMQ']) for (const kind of ['Departure', 'Arrival']) {
    try { const j = await TDX.get(`v2/Air/FIDS/Airport/${kind}/${ap}`, cred); if (Array.isArray(j)) res.push([ap, kind, j]); } catch (e) { /* 單一機場失敗就略過 */ }
  }
  if (gen !== AIR.gen) return; // 讀取途中金鑰被清除或又重新讀取
  if (!res.length) { AIR.flights = estimateFlights(); AIR.live = false; AIR.status = 'TDX 航班讀取失敗，改用推估'; return; }
  const out = [], seen = new Set();
  for (const [ap, kind, list] of res) for (const r of list) {
    const isDep = kind === 'Departure';
    const remark = String((isDep ? r.DepartureRemark : r.ArrivalRemark) || '');
    if (/取消|CANCEL/i.test(remark)) continue;
    const time = isDep ? (r.ActualDepartureTime || r.EstimatedDepartureTime || r.ScheduleDepartureTime) : (r.ActualArrivalTime || r.EstimatedArrivalTime || r.ScheduleArrivalTime);
    let t = time && toMin(time); if (t == null) continue;
    // 表定時間是推出／到達登機門，起飛約晚 10 分鐘、落地約早 5 分鐘
    t += isDep ? 10 : -5;
    const dep = r.DepartureAirportID, arr = r.ArrivalAirportID;
    // 共掛班號：同一時間、同一航線只畫一架
    const key = dep + arr + Math.round(t / 2);
    if (seen.has(key)) continue; seen.add(key);
    const both = !!(AIRPORTS[dep] && AIRPORTS[arr]);
    // 國內線在兩端的機場都會出現：用出發端那筆畫完整航程
    if (!isDep && both && ['TPE','TSA','KHH','RMQ'].includes(dep)) continue;
    const al = String(r.AirlineID || ''), fn = String(r.FlightNumber || '').trim();
    const no = al + (fn.startsWith(al) ? fn.slice(al.length) : fn).trim().replace(/^0+(?=\d)/, '');
    const f = makeFlight({ no, airline: r.AirlineID, dep, arr, t, kind: isDep ? 'dep' : 'arr', both });
    if (f) out.push(f);
  }
  AIR.flights = out; AIR.live = true; AIR.status = `已載入 ${out.length} 班航班`;
}

/* ---------- 3D 模型 ---------- */
const PLANE_SCALE = 1.4;
function planeFeatures(f, p, out) {
  const [lon0, lat0] = toLL(p.x, p.y);
  const mx = 1 / (111320 * Math.cos(lat0 / DEG)), my = 1 / 110570;
  const v = hdgVec(p.h), n = [v[1], -v[0]]; // n：右手邊
  const pt = (fw, rt) => [lon0 + (v[0] * fw + n[0] * rt) * PLANE_SCALE * mx, lat0 + (v[1] * fw + n[1] * rt) * PLANE_SCALE * my];
  const poly = c => [c.map(([a, b]) => pt(a, b)).concat([pt(c[0][0], c[0][1])])];
  const K = PLANE_SCALE, base = p.alt, lift = Math.tan(p.pitch / DEG); // 機頭抬起：前段略高
  const body = '#E9EDF0', tail = TAIL[f.airline] || '#8C9AA6';
  const add = (c, b, t, col) => out.push({ type: 'Feature', properties: { b: Math.max(0, b), t: Math.max(0, t), c: col }, geometry: { type: 'Polygon', coordinates: poly(c) } });
  // 機身分三段，順著仰角抬高
  for (const [a, b] of [[-30, -12], [-12, 10], [10, 30]]) {
    const z = base + (a + b) / 2 * lift * K;
    const w = b === 30 ? 2.4 : 3;
    add(a === 10 ? [[a, -w], [b - 4, -w * 0.7], [b, 0], [b - 4, w * 0.7], [a, w]] : [[a, -3], [b, -3], [b, 3], [a, 3]], z, z + 6 * K, body);
  }
  // 主翼與水平尾翼
  const zw = base + 1.2 * K;
  add([[4, -3], [-8, -30], [-13, -30], [-6, -3], [-6, 3], [-13, 30], [-8, 30], [4, 3]], zw, zw + 0.9 * K, body);
  const zt = base - 26 * lift * K + 3 * K;
  add([[-23, -1], [-29, -10], [-32, -10], [-30, -1], [-30, 1], [-32, 10], [-29, 10], [-23, 1]], zt, zt + 0.7 * K, body);
  // 垂直尾翼（航空公司顏色）
  add([[-21, -0.5], [-31, -0.5], [-31, 0.5], [-21, 0.5]], zt, zt + 10 * K, tail);
  // 發動機
  for (const s of [-1, 1]) add([[2, s * 9], [-4, s * 9], [-4, s * 12], [2, s * 12]], zw - 2.4 * K, zw, '#B9C2C9');
}

/* ---------- 圖層 ---------- */
function ensureLayers() {
  if (AIR.layers || !map || !S.mapReady) return;
  map.addSource('planes', { type: 'geojson', data: EMPTY });
  map.addSource('plane-pts', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'plane-shadow', type: 'circle', source: 'plane-pts', minzoom: 12, filter: ['<', ['get', 'alt'], 900],
    paint: { 'circle-color': '#000', 'circle-blur': 1, 'circle-pitch-alignment': 'map',
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12, 3, 16, 40, 19, 300],
      'circle-opacity': ['*', 0.28, ['-', 1, ['/', ['get', 'alt'], 900]]] } }, 'light-glow');
  map.addLayer({ id: 'planes', type: 'fill-extrusion', source: 'planes', minzoom: 11,
    paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false } });
  map.addLayer({ id: 'plane-dot', type: 'circle', source: 'plane-pts', maxzoom: 11.5,
    paint: { 'circle-color': '#F4F7FA', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.6, 11, 3.2], 'circle-opacity': ['*', 0.9, ['get', 'fade']],
      'circle-stroke-color': 'rgba(244,247,250,0.25)', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 11, 5], 'circle-stroke-opacity': ['get', 'fade'] } });
  AIR.layers = true;
  setPlaneVis();
}
function setPlaneVis() {
  if (!AIR.layers) return;
  for (const l of ['planes', 'plane-dot', 'plane-shadow']) try { map.setLayoutProperty(l, 'visibility', AIR.on ? 'visible' : 'none'); } catch {}
}

let airRaf = 0;
function stepPlanes(now) {
  airRaf = requestAnimationFrame(stepPlanes);
  if (!AIR.layers) { ensureLayers(); return; }
  if (!AIR.on) return;
  const z = map.getZoom();
  // 只有畫面裡真的有飛機時才每格更新；其他時候一秒一次。
  // GeoJSON 每次 setData 都要重新切圖磚、整張地圖重畫，空的資料一秒送三十次就足以讓手機一直卡頓
  const near = z >= 11;
  if (now - AIR.last < (near && AIR.inView ? 33 : 1000)) return;
  AIR.last = now;
  const m = curMin(), pts = [], polys = [];
  const b = map.getBounds(), pad = near ? 0.05 : 0.3;
  for (const f of AIR.flights) {
    const p = flightPos(f, m); if (!p) continue;
    const [lon, lat] = toLL(p.x, p.y);
    pts.push({ type: 'Feature', properties: { alt: p.alt, fade: p.fade }, geometry: { type: 'Point', coordinates: [lon, lat] } });
    if (near && lon > b.getWest() - pad && lon < b.getEast() + pad && lat > b.getSouth() - pad && lat < b.getNorth() + pad) planeFeatures(f, p, polys);
    f._pos = p; f._ll = [lon, lat];
  }
  AIR.inView = polys.length > 0;
  // 遠景的飛機圓點只在拉遠時看得到；拉近又沒有飛機在畫面裡時就不用一直送
  if (!near || AIR.inView || AIR.ptsAt === undefined || now - AIR.ptsAt > 5000) { map.getSource('plane-pts').setData({ type: 'FeatureCollection', features: pts }); AIR.ptsAt = now; }
  if (polys.length || AIR.hadPolys) map.getSource('planes').setData({ type: 'FeatureCollection', features: polys });
  AIR.hadPolys = polys.length > 0;
}
requestAnimationFrame(stepPlanes);

/* 跟拍的列車附近有低空飛機飛過時，打上一行字幕 */
function planeSpot() {
  if (!AIR.on || !S.follow || typeof showSpot !== 'function' || !Extras.spots || Extras.spotTimer) return;
  const pos = tripPos(S.follow, curMin()); if (!pos) return;
  const [lon, lat] = unproj(pos.x, pos.y), now = Date.now();
  for (const f of AIR.flights) {
    const p = f._pos; if (!p || p.alt > 1500 || p.alt < 30) continue;
    if (AIR.seen.has(f.id)) continue;
    const d = kmBetween(lat, lon, f._ll[1], f._ll[0]);
    if (d > 2.5) continue;
    AIR.seen.set(f.id, now);
    const al = AIRLINES[f.airline] || f.airline || '';
    const way = f.depAp && !f.arrAp ? `剛從${nameOf(f.dep)}起飛，往${nameOf(f.arr)}` : f.arrAp && !f.depAp ? `從${nameOf(f.dep)}飛來，準備降落${nameOf(f.arr)}` : `${nameOf(f.dep)} → ${nameOf(f.arr)}`;
    showSpot(`${al} ${f.no}`.trim(), way, '頭頂飛過');
    return;
  }
}
setInterval(planeSpot, 1000);

/* ---------- 開關與排程 ---------- */
(function () {
  const b = $('#planebtn'); if (!b) return;
  b.setAttribute('aria-pressed', String(AIR.on));
  b.addEventListener('click', () => { AIR.on = !AIR.on; store.set('planes', AIR.on); b.setAttribute('aria-pressed', String(AIR.on)); setPlaneVis(); });
})();
function reloadFlights() { loadFlights().catch(e => { console.warn(e); AIR.flights = estimateFlights(); }); }
AIR.flights = estimateFlights();
setTimeout(reloadFlights, 5000);
// 航班時間會隨延誤更新：有金鑰時每 10 分鐘重新讀一次
setInterval(() => { if (Date.now() - AIR.loadAt > 10 * 60e3 && store.get('tdx', {}).id) reloadFlights(); }, 60e3);
$('#tdxgo').addEventListener('click', () => setTimeout(reloadFlights, 2500));
$('#tdxclear').addEventListener('click', () => { AIR.gen++; AIR.flights = estimateFlights(); AIR.live = false; });
