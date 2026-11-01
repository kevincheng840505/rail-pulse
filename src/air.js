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
// 其他航空公司尾翼顏色
const TAIL_OLD = { CI:'#D9667E', AE:'#D9667E', BR:'#2F7D5A', B7:'#2F7D5A', JX:'#B89660', IT:'#F2B134', CX:'#1E6F6A', JL:'#C8102E', NH:'#1E3F8F', KE:'#5FA8D3', SQ:'#F1A51E', TG:'#5B2C83', VN:'#1C6E8C', MM:'#C9418F', UA:'#1D3E78' };

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
  return { pts, cum, alt, tt: tt.map(x => x + off), li: liftIdx, ti: tdIdx };
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

/* ---------- 3D 模型 ----------
   依真實機型的尺寸（公尺）：L 全長、b 翼展、D 機身直徑、fin 垂直尾翼高（機身頂以上）、sw 主翼後掠角、
   cr／ct 翼根／翼尖弦長、wx 翼根前緣離機頭的比例、de／le 發動機直徑／長度、ey 發動機在半翼展的位置、
   wl 翼尖小翼高、gear 機腹離地高、hs 水平尾翼半翼展。 */
const AC_TYPES = {
  A321: { name:'A321neo', L:44.5, b:35.8, D:3.95, fin:6.6, sw:25, cr:6.1, ct:1.6, wx:0.40, de:2.2, le:4.6, ey:0.34, wl:2.4, gear:1.6, hs:6.2 },
  B738: { name:'737-800', L:39.5, b:35.8, D:3.76, fin:7.0, sw:25, cr:5.6, ct:1.3, wx:0.38, de:2.0, le:4.2, ey:0.33, wl:2.5, gear:1.2, hs:6.5 },
  A333: { name:'A330-300', L:63.7, b:60.3, D:5.64, fin:9.4, sw:30, cr:10.6, ct:2.6, wx:0.38, de:3.0, le:6.5, ey:0.34, wl:2.7, gear:2.0, hs:9.7 },
  B77W: { name:'777-300ER', L:73.9, b:64.8, D:6.2, fin:10.6, sw:31.6, cr:13.2, ct:2.4, wx:0.40, de:3.9, le:7.6, ey:0.32, wl:0, gear:2.3, hs:10.8 },
  B789: { name:'787-9', L:62.8, b:60.1, D:5.77, fin:10.0, sw:32, cr:11.0, ct:2.0, wx:0.39, de:3.3, le:7.0, ey:0.33, wl:0, gear:2.1, hs:9.8 },
  A359: { name:'A350-900', L:66.8, b:64.75, D:5.96, fin:10.0, sw:31.9, cr:11.6, ct:2.3, wx:0.39, de:3.4, le:7.1, ey:0.33, wl:3.0, gear:2.1, hs:9.8 },
  AT76: { name:'ATR 72-600', L:27.2, b:27.05, D:2.57, fin:4.6, sw:2, cr:2.6, ct:1.4, wx:0.40, de:1.0, le:4.4, ey:0.30, wl:0, gear:0.9, hs:3.9, prop:true },
};
/* 塗裝：body 機身、belly 機腹、tail 垂直尾翼、tail2 尾翼第二色、stripe 腰線 */
const AIR_LIVERY = {
  CI: { tail:'#C9658B', tail2:'#F2E6EC', stripe:'#2E4E8F' },
  AE: { tail:'#2D5DA8', tail2:'#F0F3F6', stripe:'#2D5DA8' },
  BR: { tail:'#1F6B4F', tail2:'#E37B2A', stripe:'#1F6B4F', belly:'#2C7A5C' },
  B7: { tail:'#2D8C4E', tail2:'#E8742A', stripe:'#2D8C4E' },
  JX: { tail:'#2A2622', tail2:'#B89660', stripe:'#B89660' },
  IT: { tail:'#F29A1F', tail2:'#F7C948', stripe:'#F29A1F' },
  CX: { tail:'#0B5E57', tail2:'#F2F4F6', stripe:'#0B5E57' },
  JL: { tail:'#F2F4F6', tail2:'#C8102E' },
  NH: { tail:'#13448F', tail2:'#2B8ED6', stripe:'#13448F' },
  KE: { body:'#A9CCEB', belly:'#C9D0D6', tail:'#F2F4F6', tail2:'#1E4F9C' },
  SQ: { tail:'#1F3A70', tail2:'#F1A51E', stripe:'#1F3A70' },
  TG: { tail:'#5B2C83', tail2:'#C7A0D9', stripe:'#5B2C83' },
  VN: { tail:'#1C6E8C', tail2:'#E3B04B', stripe:'#1C6E8C' },
  MM: { tail:'#C9418F', tail2:'#F2F4F6', stripe:'#C9418F' },
  UA: { tail:'#1D3E78', tail2:'#F2F4F6', belly:'#1D3E78' },
  OZ: { tail:'#B6862C', tail2:'#E4472E', stripe:'#B6862C' },
};
const LONG_HAUL = new Set(['LAX','SFO','SEA','YVR','ONT','PHX','DFW','JFK','ORD','IAH','YYZ','HNL','ANC','LHR','CDG','AMS','FRA','MUC','VIE','PRG','MXP','FCO','IST','DXB','DOH','AUH','DEL','SYD','BNE','MEL','AKL']);
function acTypeOf(f) {
  if (f.ac) return f.ac;
  const other = f.depAp && !AIRPORTS[f.arr] ? f.arr : f.dep, dom = !!(AIRPORTS[f.dep] && AIRPORTS[f.arr]), r = hash(f.no || f.id);
  let t;
  if (dom) t = r < 0.85 ? 'AT76' : 'A321';
  else if (LONG_HAUL.has(f.arr) || LONG_HAUL.has(f.dep)) t = f.airline === 'BR' ? (r < 0.6 ? 'B77W' : 'B789') : f.airline === 'CI' ? (r < 0.5 ? 'A359' : 'B77W') : f.airline === 'JX' ? 'A359' : ['B77W','A359','B789'][Math.floor(r * 3)];
  else if (f.airline === 'IT' || f.airline === 'MM' || f.airline === 'TR' || f.airline === 'VJ' || f.airline === '7C' || f.airline === 'AK') t = r < 0.5 ? 'A321' : 'B738';
  else if (f.airline === 'BR') t = r < 0.5 ? 'A321' : r < 0.8 ? 'A333' : 'B789';
  else if (f.airline === 'CI') t = r < 0.4 ? 'A321' : r < 0.6 ? 'B738' : r < 0.8 ? 'A333' : 'A359';
  else if (f.airline === 'JX') t = r < 0.6 ? 'A321' : 'A333';
  else t = ['A321','B738','A333','B789'][Math.floor(r * 4)];
  return (f.ac = t);
}

/* 依機型與塗裝組出機身各部位：每個部位是一個四邊形往上擠出的柱體。
   座標以公尺計：fw 以機身中點為 0、往機頭為正；rt 往右為正；z 從起落架輪子（或收起時的機腹）算起 */
function planeParts(type, airline, gearDown) {
  const T = AC_TYPES[type], Lv = AIR_LIVERY[airline] || {}, out = [];
  const body = Lv.body || '#EEF1F4', belly = Lv.belly || body, tail = Lv.tail || TAIL_OLD[airline] || '#8C9AA6', tail2 = Lv.tail2 || body, stripe = Lv.stripe || null;
  const dark = '#27303A', metal = '#B7C0C8', gearC = '#3A4148';
  const detail = true;
  const z0 = gearDown ? T.gear : 0;
  const add = (c, fwc, zb, zt, col) => out.push({ c, b: z0 + zb, t: z0 + zt, col });
  const box = (f1, f2, r1, r2, zb, zt, col) => add([[f1, r1], [f2, r1], [f2, r2], [f1, r2]], 0, zb, zt, col);
  const L = T.L, D = T.D, R = D / 2, nose = L / 2, tailEnd = -L / 2;
  const layers = 12, segs = 28;
  // 機身平面與側面輪廓：機頭以橢圓收窄、下緣往上收；機尾變細並上翹
  const noseLen = D * 1.9, tailLen = L * 0.24;
  const prof = fw => {
    if (fw > nose - noseLen) { const k = (fw - (nose - noseLen)) / noseLen; const e = Math.sqrt(Math.max(0, 1 - k * k)); return { r: R * (0.12 + 0.88 * e), lo: R * (1 - e) * 0.55, hi: D - R * (1 - e) * 0.25 }; }
    if (fw < tailEnd + tailLen) { const k = 1 - (fw - tailEnd) / tailLen; return { r: R * (1 - 0.78 * k), lo: D * 0.62 * k * k, hi: D - D * 0.08 * k }; }
    return { r: R, lo: 0, hi: D };
  };
  // 切成 segs 段，每段再依圓形切面分 layers 層
  const cabinF = nose - noseLen * 0.9, cabinA = tailEnd + tailLen * 0.85;
  for (let i = 0; i < segs; i++) {
    const f1 = tailEnd + L * i / segs, f2 = tailEnd + L * (i + 1) / segs, fm = (f1 + f2) / 2, P = prof(fm);
    const h = P.hi - P.lo, rc = h / 2, zc = P.lo + rc;
    for (let k = 0; k < layers; k++) {
      const za = P.lo + h * k / layers, zb2 = P.lo + h * (k + 1) / layers, zm = (za + zb2) / 2;
      const w = P.r * Math.sqrt(Math.max(0.04, 1 - ((zm - zc) / rc) ** 2));
      box(f1, f2, -w, w, za, zb2, zm < zc - rc * 0.35 ? belly : body);
    }
    // 窗戶列與腰線：比機身稍寬一點的細長條
    if (fm < cabinF && fm > cabinA) {
      const wz = P.lo + h * 0.62, ww = P.r * Math.sqrt(1 - ((wz - zc) / rc) ** 2) + 0.03;
      box(f1, f2, -ww, ww, wz - 0.18, wz + 0.18, dark);
      if (stripe) { const sz = P.lo + h * 0.38, sw2 = P.r * Math.sqrt(1 - ((sz - zc) / rc) ** 2) + 0.03; box(f1, f2, -sw2, sw2, sz - 0.22, sz + 0.22, stripe); }
    }
  }
  // 駕駛艙擋風玻璃
  { const fc = nose - noseLen * 0.55, P = prof(fc), wz = P.lo + (P.hi - P.lo) * 0.7; box(fc - D * 0.18, fc + D * 0.18, -P.r * 0.8, P.r * 0.8, wz - 0.2, wz + 0.25, dark); }

  // 主翼：後掠、上反角，分三段往外逐漸變薄、變高
  const semi = T.b / 2, rootLE = nose - L * T.wx, tanSw = Math.tan(T.sw / DEG);
  const wingZ = T.prop ? D * 0.95 : D * 0.12, dih = T.prop ? 0.02 : 0.09;
  const le = y => rootLE - (y - R) * tanSw, ch = y => T.cr + (T.ct - T.cr) * (y - R) / (semi - R);
  const spans = detail ? [R, R + (semi - R) * 0.3, R + (semi - R) * 0.6, R + (semi - R) * 0.85, semi] : [R, R + (semi - R) * 0.5, semi];
  for (const s of [-1, 1]) {
    for (let i = 0; i < spans.length - 1; i++) {
      const y1 = spans[i], y2 = spans[i + 1], ym = (y1 + y2) / 2;
      const zt0 = wingZ + (ym - R) * dih, th = Math.max(0.18, 0.55 * (1 - (ym - R) / semi) * (D / 4));
      add([[le(y1), s * y1], [le(y2), s * y2], [le(y2) - ch(y2), s * y2], [le(y1) - ch(y1), s * y1]], le(ym) - ch(ym) / 2, zt0, zt0 + th, body);
    }
    // 機翼與機身接合處的整流罩
    if (!T.prop) box(le(R) - T.cr * 0.95, le(R) + 0.3, -R * 1.02, R * 1.02, 0, D * 0.18, belly);
    // 翼尖小翼
    if (T.wl) { const zt0 = wingZ + (semi - R) * dih; add([[le(semi) - ch(semi) * 0.05, s * semi], [le(semi) - ch(semi), s * semi], [le(semi) - ch(semi), s * (semi + 0.12)], [le(semi) - ch(semi) * 0.05, s * (semi + 0.12)]], le(semi) - ch(semi) / 2, zt0, zt0 + T.wl, tail); }
    // 發動機：翼下吊掛的圓筒（ATR 是翼上的短艙加螺旋槳）
    const ey = R + (semi - R) * T.ey, ef = le(ey) + T.le * (T.prop ? 0.25 : 0.55), ea = ef - T.le;
    const er = T.de / 2, ezc = T.prop ? wingZ + er * 0.6 : wingZ + (ey - R) * dih - er - 0.35;
    const eL = 8;
    for (let k = 0; k < eL; k++) {
      const za = ezc - er + 2 * er * k / eL, zb2 = ezc - er + 2 * er * (k + 1) / eL, w = er * Math.sqrt(Math.max(0.05, 1 - (((za + zb2) / 2 - ezc) / er) ** 2));
      box(ea, ef, s * ey - w, s * ey + w, za, zb2, T.prop ? body : metal);
    }
    if (T.prop) {
      // 螺旋槳旋轉時看起來是一片半透明的圓盤：用深色薄片表示
      box(ef + 0.05, ef + 0.18, s * ey - 1.95, s * ey + 1.95, ezc - 1.95, ezc + 1.95, '#5A6470');
    } else {
      box(ef - 0.02, ef + 0.02, s * ey - er * 0.8, s * ey + er * 0.8, ezc - er * 0.8, ezc + er * 0.8, dark); // 進氣口
      box(le(ey) - ch(ey) * 0.4, le(ey) + 0.2, s * ey - 0.25, s * ey + 0.25, ezc + er * 0.6, wingZ + (ey - R) * dih, metal); // 吊架
    }
  }
  // 水平尾翼（ATR 是 T 型尾翼，裝在垂直尾翼頂端）
  const finRoot = T.cr * 1.05, finLE = tailEnd + tailLen * 0.62, finTanSw = Math.tan((T.prop ? 30 : 40) / DEG);
  const finTop = prof(finLE - finRoot / 2).hi;
  const hsZ = T.prop ? finTop + T.fin * 0.95 : D * 0.42, hsLE = T.prop ? finLE - T.fin * finTanSw : tailEnd + tailLen * 0.42, hsC = T.cr * 0.5;
  for (const s of [-1, 1]) add([[hsLE, s * 0.3], [hsLE - T.hs * 0.55, s * T.hs], [hsLE - T.hs * 0.55 - hsC * 0.45, s * T.hs], [hsLE - hsC, s * 0.3]], hsLE - hsC / 2, hsZ, hsZ + 0.3, body);
  // 垂直尾翼：分層往後移，做出後掠；下半主色、上緣第二色
  const fl = 8;
  for (let k = 0; k < fl; k++) {
    const h1 = T.fin * k / fl, h2 = T.fin * (k + 1) / fl, hm = (h1 + h2) / 2;
    const c = finRoot * (1 - 0.62 * hm / T.fin), lead = finLE - hm * finTanSw;
    box(lead - c, lead, -0.22, 0.22, finTop - 0.3 + h1, finTop - 0.3 + h2, k === fl - 1 && tail2 !== body ? tail2 : tail);
  }
  // 起落架
  if (gearDown) {
    const g = T.gear;
    box(nose - noseLen * 1.1 - 0.3, nose - noseLen * 1.1 + 0.3, -0.25, 0.25, -g, 0.05, gearC);
    for (const s of [-1, 1]) { const y = R * (T.prop ? 0.9 : 1.15), gf = rootLE - T.cr * 0.75; box(gf - 0.7, gf + 0.7, s * y - 0.45, s * y + 0.45, -g, 0.05, gearC); }
  }
  return out;
}

/* ---------- 機場：跑道、滑行道、停機坪、航廈、塔台 ----------
   跑道位置與 AIRPORTS 相同（飛機就是沿著它起降），航廈與塔台的位置是依實際配置大略擺放。
   side：航廈在跑道的哪一側（+1 為跑道方向的右手邊，0 為兩條平行跑道中間）；
   term：航廈 [沿跑道位置（公里）, 長, 深（公尺）, 高]；tower：[沿跑道位置, 高] */
const AIRPORT_SITE = {
  TPE: { w: 60, side: 0, gap: 0, term: [[-0.55, 560, 150, 24], [0.45, 640, 160, 28]], piers: 4, tower: [-0.05, 62] },
  TSA: { w: 60, side: 1, gap: 0.62, term: [[0.15, 380, 110, 20], [-0.45, 260, 90, 18]], piers: 2, tower: [0.55, 46] },
  KHH: { w: 60, side: -1, gap: 0.6, term: [[0.1, 520, 120, 22]], piers: 3, tower: [0.75, 50] },
  RMQ: { w: 60, side: -1, gap: 0.55, term: [[0.2, 300, 100, 18]], piers: 2, tower: [-0.4, 40] },
};
const AP_COL = { rwy: '#3B4148', shoulder: '#6E747A', mark: '#F2F2EE', twy: '#4A5057', apron: '#626870', edge: '#E3C04F',
  term: '#D7DCE1', glass: '#43617A', roof: '#B9C0C7', tower: '#E4E7EA', cab: '#2C4A62', hangar: '#A7AFB6' };
let AIRPORT_FC = null;
function airportFeatures() {
  if (AIRPORT_FC) return AIRPORT_FC;
  const out = [];
  for (const code of Object.keys(AIRPORTS)) {
    const A = AIRPORTS[code], site = AIRPORT_SITE[code] || { w: 45, side: 1, gap: 0.45, term: [[0.1, 200, 70, 14]], piers: 1, tower: [0.45, 30] };
    const [cx, cy] = toXY(A[1], A[2]), v = hdgVec(A[3]), n = [v[1], -v[0]];
    const [lon0, lat0] = toLL(cx, cy);
    const mx = 1 / (111320 * Math.cos(lat0 / DEG)), my = 1 / 110570;
    // 以機場中心為原點、沿跑道 a 公尺、往右 r 公尺
    const pt = (a, r) => [lon0 + (v[0] * a + n[0] * r) * mx, lat0 + (v[1] * a + n[1] * r) * my];
    const box = (a1, a2, r1, r2, b, t, c) => out.push({ type: 'Feature', properties: { b, t, c },
      geometry: { type: 'Polygon', coordinates: [[pt(a1, r1), pt(a2, r1), pt(a2, r2), pt(a1, r2), pt(a1, r1)]] } });
    const L = A[4] * 1000, W = site.w, half = L / 2;
    const rwys = A[5] ? [-A[5] * 500, A[5] * 500] : [0];
    for (const rc of rwys) {
      box(-half - 60, half + 60, rc - W / 2 - 8, rc + W / 2 + 8, 0, 0.2, AP_COL.shoulder);
      box(-half, half, rc - W / 2, rc + W / 2, 0, 0.32, AP_COL.rwy);
      // 中心線虛線
      for (let a = -half + 120; a < half - 120; a += 60) box(a, a + 30, rc - 0.5, rc + 0.5, 0, 0.4, AP_COL.mark);
      // 兩端的斑馬線（threshold）與著陸區標線
      for (const e of [-1, 1]) {
        const a0 = e * (half - 6), a1 = e * (half - 36);
        for (let k = 0; k < 8; k++) { const r = 4 + k * 3.4; box(a0, a1, rc + r, rc + r + 1.8, 0, 0.4, AP_COL.mark); box(a0, a1, rc - r - 1.8, rc - r, 0, 0.4, AP_COL.mark); }
        for (const d of [150, 300, 450]) { const a = e * (half - d); box(a, a - e * 22, rc + 6, rc + 9, 0, 0.4, AP_COL.mark); box(a, a - e * 22, rc - 9, rc - 6, 0, 0.4, AP_COL.mark); }
        const aim = e * (half - 400); box(aim, aim - e * 50, rc + 7, rc + 14, 0, 0.4, AP_COL.mark); box(aim, aim - e * 50, rc - 14, rc - 7, 0, 0.4, AP_COL.mark);
      }
      // 跑道邊線
      box(-half, half, rc + W / 2 - 1.2, rc + W / 2, 0, 0.4, AP_COL.mark); box(-half, half, rc - W / 2, rc - W / 2 + 1.2, 0, 0.4, AP_COL.mark);
    }
    // 平行滑行道與聯絡道：在航廈那一側
    const twys = site.side === 0 ? rwys.map(rc => rc * 0.62) : [site.side * 200];
    for (const tw of twys) {
      box(-half, half, tw - 11.5, tw + 11.5, 0, 0.26, AP_COL.twy);
      box(-half, half, tw - 0.4, tw + 0.4, 0, 0.32, AP_COL.edge);
      const rc = site.side === 0 ? rwys.find(r => Math.sign(r) === Math.sign(tw)) : 0;
      for (let a = -half; a <= half + 1; a += L / 6) box(a - 12, a + 12, Math.min(rc, tw), Math.max(rc, tw), 0, 0.25, AP_COL.twy);
    }
    // 停機坪、航廈、登機廊橋
    const tSide = site.side === 0 ? 0 : site.side, base = site.side === 0 ? 0 : site.side * site.gap * 1000;
    for (const [ta, tl, td, th] of site.term) {
      const a = ta * 1000, apronR = site.side === 0 ? 0 : base - tSide * (td / 2 + 140);
      if (site.side === 0) {
        box(a - tl / 2 - 120, a + tl / 2 + 120, -td / 2 - 260, td / 2 + 260, 0, 0.24, AP_COL.apron);
      } else box(a - tl / 2 - 80, a + tl / 2 + 80, Math.min(apronR - tSide * 150, base), Math.max(apronR - tSide * 150, base), 0, 0.24, AP_COL.apron);
      const r1 = base - td / 2, r2 = base + td / 2;
      box(a - tl / 2, a + tl / 2, r1, r2, 0, th * 0.55, AP_COL.glass);
      box(a - tl / 2, a + tl / 2, r1, r2, th * 0.55, th, AP_COL.term);
      box(a - tl / 2 + 10, a + tl / 2 - 10, r1 + 10, r2 - 10, th, th + 3, AP_COL.roof);
      // 廊橋：從航廈伸向停機坪
      const dirs = site.side === 0 ? [-1, 1] : [-tSide];
      for (const d of dirs) for (let k = 0; k < site.piers * 2; k++) {
        const pa = a - tl / 2 + (k + 0.5) * tl / (site.piers * 2), from = base + d * td / 2;
        box(pa - 2.5, pa + 2.5, Math.min(from, from + d * 38), Math.max(from, from + d * 38), 4, 7.5, AP_COL.roof);
      }
    }
    // 塔台：細高的塔身加上玻璃管制室
    { const a = site.tower[0] * 1000, h = site.tower[1], r = base + (site.side === 0 ? 300 : site.side * 140);
      box(a - 5, a + 5, r - 5, r + 5, 0, h - 9, AP_COL.tower);
      box(a - 9, a + 9, r - 9, r + 9, h - 9, h - 2, AP_COL.cab);
      box(a - 10, a + 10, r - 10, r + 10, h - 2, h, AP_COL.tower);
      box(a - 0.4, a + 0.4, r - 0.4, r + 0.4, h, h + 8, AP_COL.cab); }
    // 修護棚廠
    { const a = -(site.tower[0] * 1000) - 300 * Math.sign(site.tower[0] || 1), r = base + (site.side === 0 ? -320 : site.side * 120);
      box(a - 50, a + 50, r - 40, r + 40, 0, 22, AP_COL.hangar); box(a + 60, a + 140, r - 35, r + 35, 0, 18, AP_COL.hangar); }
  }
  return (AIRPORT_FC = { type: 'FeatureCollection', features: out });
}

/* ---------- 3D 飛機：WebGL 自訂圖層 ----------
   每種「機型＋航空公司＋起落架」的模型只建一次放進 GPU，每格只換一個矩陣（位置、航向、仰角）。
   以前每格把幾百個多邊形用 GeoJSON 重送，要等背景執行緒切完圖磚才畫得出來，飛機和鏡頭對不上就會抖。 */
const PlaneGL = {
  draw: [], extra: [], stat: [], meshes: new Map(), gl: null, prog: null, last: null, hover: false, kickAt: 0,
  /* 飛機與客運會動，地圖要重畫才看得到。但每一格都重畫整張地圖（圖磚、建築、標籤全部）對手機很重，
     所以只在東西真的在畫面上時才重畫，而且依它在螢幕上有多大決定頻率：
     大到看得清楚才每格重畫；只有幾個像素時一秒幾次就夠，肉眼看不出差別 */
  kick(now) {
    const list = (AIR.on ? PlaneGL.draw : []).concat(PlaneGL.extra);
    if (!list.length) return;
    const z = map.getZoom(), c = map.getCanvas(), W = c.clientWidth, H = c.clientHeight;
    const mpp = 40075016.686 * Math.cos(map.getCenter().lat / DEG) / (512 * Math.pow(2, z)); // 每像素幾公尺
    let px = 0;
    for (const d of list) {
      if (d.nopick) continue; // 站牌等靜態物件不需要重畫
      const alt = d.p ? d.p.alt || 0 : 0, len = d.len || 45;
      let q; try { q = map.project(d.ll); } catch { continue; }
      const m = 40 + alt / mpp; // 高空的東西斜看時會往上偏，邊界放寬
      if (q.x < -m || q.x > W + m || q.y < -m || q.y > H + m) continue;
      px = Math.max(px, len / mpp);
    }
    if (!px) return;
    const gap = px >= 14 ? 0 : px >= 4 ? 80 : 400;
    if (now - PlaneGL.kickAt < gap) return;
    PlaneGL.kickAt = now; map.triggerRepaint();
  },
  hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; },
  // 把部位清單變成三角形：每個柱體有頂面、底面與四個側面，各自帶法向量與顏色
  build(parts) {
    const P = [], N = [], C = [];
    const tri = (a, b, c, n, col) => { for (const v of [a, b, c]) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); C.push(col[0], col[1], col[2]); } };
    for (const q of parts) {
      if (q.t - q.b < 1e-3) continue;
      const col = PlaneGL.hex(q.col), c = q.c;
      const lo = c.map(([x, y]) => [x, y, q.b]), hi = c.map(([x, y]) => [x, y, q.t]);
      tri(hi[0], hi[1], hi[2], [0, 0, 1], col); tri(hi[0], hi[2], hi[3], [0, 0, 1], col);
      tri(lo[0], lo[2], lo[1], [0, 0, -1], col); tri(lo[0], lo[3], lo[2], [0, 0, -1], col);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, dx = c[j][0] - c[i][0], dy = c[j][1] - c[i][1], l = Math.hypot(dx, dy) || 1;
        // 法向量朝外：依四邊形繞行方向決定正負
        const area = (c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]);
        const sg = area >= 0 ? 1 : -1, n = [sg * dy / l, -sg * dx / l, 0];
        tri(lo[i], lo[j], hi[j], n, col); tri(lo[i], hi[j], hi[i], n, col);
      }
    }
    return { P: new Float32Array(P), N: new Float32Array(N), C: new Float32Array(C), n: P.length / 3 };
  },
  mesh(type, airline, gear) { return PlaneGL.meshFor(type + '|' + airline + '|' + gear, () => planeParts(type, airline, gear)); },
  // 依 key 快取模型；parts() 只在第一次用到時呼叫（國道客運也用這個）
  meshFor(key, parts) {
    let m = PlaneGL.meshes.get(key);
    if (!m) {
      // parts() 可回傳部位清單，或已經算好的三角形（國道高架網格）
      const raw = parts(), d = raw && raw.P ? raw : PlaneGL.build(raw), gl = PlaneGL.gl;
      m = { n: d.n, bufs: [d.P, d.N, d.C].map(arr => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; }) };
      PlaneGL.meshes.set(key, m);
    }
    return m;
  },
  // 模型矩陣：本地 x 往機頭、y 往右、z 往上（公尺），換到 Web 墨卡托座標
  model(p, ll) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(ll, p.alt), s = mc.meterInMercatorCoordinateUnits();
    const h = p.h / DEG, pt = p.pitch / DEG;
    const fw = [Math.sin(h), -Math.cos(h), 0], rt = [Math.cos(h), Math.sin(h), 0], up = [0, 0, 1];
    const cp = Math.cos(pt), sp = Math.sin(pt);
    const F = [fw[0] * cp, fw[1] * cp, sp], U = [-fw[0] * sp, -fw[1] * sp, cp];
    return [F[0] * s, F[1] * s, F[2] * s, 0, rt[0] * s, rt[1] * s, 0, 0, U[0] * s, U[1] * s, U[2] * s, 0, mc.x, mc.y, mc.z, 1];
  },
  mul(a, b) { const o = new Float64Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = v; } return o; },
  // 點選：用上一格的投影矩陣把每架飛機的中心投到螢幕上
  pick(pt) {
    const M = PlaneGL.last; if (!M) return null;
    const cv = map.getCanvas(), w = cv.clientWidth, h = cv.clientHeight;
    let best = null, bd = 1e9;
    for (const d of PlaneGL.draw.concat(PlaneGL.extra)) {
      if (d.nopick) continue;
      const m = PlaneGL.model(d.p, d.ll), PM = PlaneGL.mul(M, m), L = d.len || AC_TYPES[acTypeOf(d.f)].L;
      const proj = (x) => { const cx = PM[0] * x + PM[12], cy = PM[1] * x + PM[13], cw = PM[3] * x + PM[15]; return cw > 0 ? [(cx / cw + 1) / 2 * w, (1 - cy / cw) / 2 * h] : null; };
      const c = proj(0), nose = proj(L / 2); if (!c || !nose) continue;
      const r = Math.max(14, Math.hypot(nose[0] - c[0], nose[1] - c[1])), dd = Math.hypot(pt.x - c[0], pt.y - c[1]);
      if (dd < r && dd < bd) { bd = dd; best = d; }
    }
    return best;
  },
  layer: {
    id: 'planes3d', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      PlaneGL.gl = gl; PlaneGL.meshes.clear();
      const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
        uniform mat4 u_pm; uniform mat4 u_m; uniform vec3 u_light; uniform vec3 u_lc; uniform float u_li;
        attribute vec3 a_pos; attribute vec3 a_n; attribute vec3 a_c; varying vec3 v_c;
        void main() {
          vec3 n = normalize(mat3(u_m) * a_n);
          float d = max(dot(n, u_light), 0.0);
          float k = (0.72 + 0.3 * d) * clamp(0.3 + u_li * 2.3, 0.45, 1.05);
          v_c = a_c * mix(vec3(1.0), u_lc, 0.35) * k;
          gl_Position = u_pm * vec4(a_pos, 1.0);
        }`));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; varying vec3 v_c; void main() { gl_FragColor = vec4(v_c, 1.0); }`));
      gl.linkProgram(prog);
      PlaneGL.prog = prog;
      PlaneGL.loc = { pm: gl.getUniformLocation(prog, 'u_pm'), m: gl.getUniformLocation(prog, 'u_m'), light: gl.getUniformLocation(prog, 'u_light'), lc: gl.getUniformLocation(prog, 'u_lc'), li: gl.getUniformLocation(prog, 'u_li'),
        attrs: ['a_pos', 'a_n', 'a_c'].map(a => gl.getAttribLocation(prog, a)) };
    },
    onRemove() { PlaneGL.gl = null; PlaneGL.meshes.clear(); },
    render(gl, matrix) {
      PlaneGL.last = matrix;
      // 飛機（關掉時不畫）加上國道高架（靜態）與其他交通工具（國道客運）
      const list = (AIR.on ? PlaneGL.draw : []).concat(PlaneGL.stat, PlaneGL.extra);
      if (!list.length || !PlaneGL.prog) return;
      const L = PlaneGL.loc;
      gl.useProgram(PlaneGL.prog);
      // 光線跟著地圖的日夜設定
      let lc = [1, 1, 1], li = 0.3, dir = [0.4, -0.3, 0.86];
      try {
        const lt = map.getLight() || {};
        if (typeof lt.color === 'string' && lt.color[0] === '#') lc = PlaneGL.hex(lt.color);
        if (typeof lt.intensity === 'number') li = lt.intensity;
        if (Array.isArray(lt.position)) { const a = lt.position[1] / DEG, pl = lt.position[2] / DEG; dir = [Math.sin(pl) * Math.sin(a), -Math.sin(pl) * Math.cos(a), Math.cos(pl)]; }
      } catch {}
      gl.uniform3fv(L.light, dir); gl.uniform3fv(L.lc, lc); gl.uniform1f(L.li, li);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      for (const d of list) {
        const mesh = d.mesh ? d.mesh() : PlaneGL.mesh(acTypeOf(d.f), d.f.airline || '', d.p.alt < 450);
        const m = PlaneGL.model(d.p, d.ll), PM = PlaneGL.mul(matrix, m);
        // 只保留旋轉（去掉縮放）給法向量用
        const s = Math.hypot(m[0], m[1], m[2]) || 1;
        gl.uniformMatrix4fv(L.pm, false, new Float32Array(PM));
        gl.uniformMatrix4fv(L.m, false, new Float32Array([m[0] / s, m[1] / s, m[2] / s, 0, m[4] / s, m[5] / s, m[6] / s, 0, m[8] / s, m[9] / s, m[10] / s, 0, 0, 0, 0, 1]));
        mesh.bufs.forEach((b, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(L.attrs[i]); gl.vertexAttribPointer(L.attrs[i], 3, gl.FLOAT, false, 0, 0); });
        gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
      }
    },
  },
};

/* ---------- 圖層 ---------- */
function ensureLayers() {
  if (AIR.layers || !map || !S.mapReady) return;
  map.addSource('airports', { type: 'geojson', data: airportFeatures() });
  map.addLayer({ id: 'airports', type: 'fill-extrusion', source: 'airports', minzoom: 10.5,
    paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-vertical-gradient': false,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0, 11.5, 1] } }, 'light-glow');
  map.addSource('plane-pts', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'plane-shadow', type: 'circle', source: 'plane-pts', minzoom: 12, filter: ['<', ['get', 'alt'], 900],
    paint: { 'circle-color': '#000', 'circle-blur': 1, 'circle-pitch-alignment': 'map',
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12, 3, 16, 40, 19, 300],
      'circle-opacity': ['*', 0.28, ['-', 1, ['/', ['get', 'alt'], 900]]] } }, 'light-glow');
  map.addLayer(PlaneGL.layer);
  map.on('click', e => { const d = PlaneGL.pick(e.point); if (!d) return; if (d.onPick) d.onPick(); else watchFlight(d.f); });
  map.on('mousemove', e => { if (map.getZoom() < 11) return; const hit = !!PlaneGL.pick(e.point); if (hit !== PlaneGL.hover) { PlaneGL.hover = hit; map.getCanvas().style.cursor = hit ? 'pointer' : ''; } });
  map.addLayer({ id: 'plane-dot', type: 'circle', source: 'plane-pts', maxzoom: 11.5,
    paint: { 'circle-color': '#F4F7FA', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.6, 11, 3.2], 'circle-opacity': ['*', 0.9, ['get', 'fade']],
      'circle-stroke-color': 'rgba(244,247,250,0.25)', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 11, 5], 'circle-stroke-opacity': ['get', 'fade'] } });
  AIR.layers = true;
  setPlaneVis();
}
function setPlaneVis() {
  if (!AIR.layers) return;
  // planes3d 也畫國道客運，所以一直開著；飛機開關由圖層的 render 依 AIR.on 決定
  for (const l of ['plane-dot', 'plane-shadow']) try { map.setLayoutProperty(l, 'visibility', AIR.on ? 'visible' : 'none'); } catch {}
}

let airRaf = 0;
function stepPlanes(now) {
  airRaf = requestAnimationFrame(stepPlanes);
  if (!AIR.layers) { ensureLayers(); return; }
  if (!AIR.on) { PlaneGL.draw = []; return; }
  const z = map.getZoom(), near = z >= 11, m = curMin();
  // 3D 飛機每格都算位置，交給 WebGL 圖層直接畫：不經過 GeoJSON，鏡頭和飛機用同一個時間點，不會抖
  const draw = [], b = map.getBounds();
  let cam = null;
  if (AIR.watch) cam = stepWatch(now, m, draw);
  if (near) for (const f of AIR.flights) {
    if (AIR.watch && f === AIR.watch.f) continue;
    const p = flightPos(f, m); if (!p) continue;
    const [lon, lat] = toLL(p.x, p.y);
    // 地圖範圍是地面上的範圍；高空的飛機斜看時會偏離它在地面的位置，所以飛得越高留越大的邊
    const pad = 0.05 + Math.min(1, p.alt / 9500) * 0.3;
    if (lon > b.getWest() - pad && lon < b.getEast() + pad && lat > b.getSouth() - pad && lat < b.getNorth() + pad) draw.push({ f, p, ll: [lon, lat] });
  }
  PlaneGL.draw = draw;
  if (cam) { try { map.jumpTo(cam); } catch {} }
  else PlaneGL.kick(now);
  // 遠景圓點與地面陰影：近看時每格更新，其他時候一秒一次
  // 地面陰影只在 zoom 12 以上、低空（900 公尺以下）的飛機才畫；其他時候圓點一秒更新一次就好
  const shadow = z >= 12 && draw.some(d => d.p.alt < 900);
  if (now - AIR.last < (shadow ? 33 : 1000)) return;
  AIR.last = now;
  const pts = [];
  for (const f of AIR.flights) {
    const p = flightPos(f, m); if (!p) continue;
    const [lon, lat] = toLL(p.x, p.y);
    pts.push({ type: 'Feature', properties: { alt: p.alt, fade: p.fade }, geometry: { type: 'Point', coordinates: [lon, lat] } });
    f._pos = p; f._ll = [lon, lat];
  }
  if (!near || shadow || AIR.ptsAt === undefined || now - AIR.ptsAt > 5000) { map.getSource('plane-pts').setData({ type: 'FeatureCollection', features: pts }); AIR.ptsAt = now; }
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


/* ---------- 觀察起降：鏡頭跟著一架飛機，只在機場附近 ---------- */
const WATCH_APS = ['TPE', 'TSA', 'KHH', 'RMQ'];
const AIR_VIEWS = [{ id: 'auto', name: '自動' }, { id: 'chase', name: '追機' }, { id: 'side', name: '側拍' }, { id: 'front', name: '迎面' }, { id: 'wing', name: '翼尖' },
  { id: 'top', name: '俯瞰' }, { id: 'orbit', name: '環繞' }, { id: 'tower', name: '塔台' }];
// 自動運鏡：每隔一段時間換一個視角
const AUTO_VIEWS = ['chase', 'side', 'wing', 'front', 'orbit', 'top', 'tower'], AUTO_SEC = 12;
function curAirView() {
  if (AIR.view !== 'auto') return AIR.view;
  const W = AIR.watch, now = performance.now();
  if (!W.auto || now - W.auto.t0 > AUTO_SEC * 1000) {
    const i = W.auto ? (AUTO_VIEWS.indexOf(W.auto.v) + 1) % AUTO_VIEWS.length : 0;
    W.auto = { v: AUTO_VIEWS[i], t0: now };
    if (W.f) W.blend = { t0: now, from: { c: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } };
    renderAirCap(true);
  }
  return W.auto.v;
}
AIR.view = store.get('airView', 'chase');
/* 這架飛機在機場 ap 附近的「可觀察」區段：起飛從滑行到 2500 公尺或離場 25 公里，降落從 30 公里外到滑行結束 */
function watchPhase(f, ap, m) {
  const P = f.path, p = flightPos(f, m); if (!p) return null;
  const A = AIRPORTS[ap], [ax, ay] = toXY(A[1], A[2]), d = Math.hypot(p.x - ax, p.y - ay);
  if (f.depAp === ap && P.li >= 0) {
    const sLift = P.cum[P.li];
    // 沿路徑算目前走了多遠
    const s = pathS(f, m);
    if (s != null && s < sLift + 40 && p.alt < 2500 && d < 25) return { kind: 'dep', p, d, s, ground: s < sLift };
  }
  if (f.arrAp === ap && P.ti >= 0 && d < 30) {
    const s = pathS(f, m);
    if (s != null && s > P.cum[P.ti] - 40) return { kind: 'arr', p, d, s, ground: s >= P.cum[P.ti] };
  }
  return null;
}
function pathS(f, m) {
  const P = f.path, tt = P.tt, n = tt.length;
  for (const mm of [m, m + 1440, m - 1440]) {
    if (mm < tt[0] || mm > tt[n - 1]) continue;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (tt[md] <= mm) lo = md; else hi = md; }
    return P.cum[lo] + (P.cum[hi] - P.cum[lo]) * (mm - tt[lo]) / Math.max(1e-6, tt[hi] - tt[lo]);
  }
  return null;
}
/* 機場的事件時間（起飛離地或落地） */
function eventTime(f, ap) {
  const P = f.path;
  if (f.depAp === ap && P.li >= 0) return { t: P.tt[P.li], kind: 'dep' };
  if (f.arrAp === ap && P.ti >= 0) return { t: P.tt[P.ti], kind: 'arr' };
  return null;
}
function pickWatchFlight(ap, m, not, skip) {
  let best = null, bd = Infinity;
  for (const f of AIR.flights) {
    // 航班清單會定時重新載入（物件會換新），所以用航班 id 比對
    if ((not && f.id === not.id) || (skip && skip.has(f.id))) continue;
    const ph = watchPhase(f, ap, m); if (!ph) continue;
    const ev = eventTime(f, ap), dt = Math.abs(ev.t - m);
    if (dt < bd) { bd = dt; best = f; }
  }
  return best;
}
function upcoming(ap, m, n = 3) {
  const list = [];
  for (const f of AIR.flights) {
    const ev = eventTime(f, ap); if (!ev) continue;
    let dt = ev.t - m; if (dt < -720) dt += 1440; if (dt > 720) dt -= 1440;
    if (dt > -1 && dt < 180) list.push({ f, dt, kind: ev.kind });
  }
  return list.sort((a, b) => a.dt - b.dt).slice(0, n);
}
function airTitle(f) { return `${AIRLINES[f.airline] || f.airline || ''} ${f.no}`.trim(); }

function watchAirport(ap) {
  if (typeof setRoam === 'function') setRoam(false);
  if (S.follow) unfollow();
  AIR.watch = { ap, f: null, sticky: false, cam: null, t0: performance.now() };
  AIR.paused = false;
  if (!AIR.on) { AIR.on = true; store.set('planes', true); const b = $('#planebtn'); if (b) b.setAttribute('aria-pressed', 'true'); setPlaneVis(); }
  renderAirCap(true);
}
function watchFlight(f) {
  const m = curMin();
  const ap = WATCH_APS.find(a => watchPhase(f, a, m)) || f.depAp || f.arrAp;
  watchAirport(ap);
  if (watchPhase(f, ap, m)) { AIR.watch.f = f; AIR.watch.sticky = true; }
  renderAirCap(true);
}
function exitWatch() {
  if (!AIR.watch) return;
  AIR.watch = null;
  renderAirCap(true);
}
// 選列車、漫遊或回到全台時離開觀察起降
$('#overview').addEventListener('click', () => exitWatch(), { capture: true });
const _follow = follow;
follow = function () { exitWatch(); return _follow.apply(this, arguments); };

/* 鏡頭位置：在飛機（或跑道）旁邊、略高於飛機，視線穿過飛機落到地面，飛機就在畫面正中央 */
function airCamera(f, p, ap) {
  const v = hdgVec(p.h), n = [v[1], -v[0]], T = AC_TYPES[acTypeOf(f)];
  const view = curAirView();
  let cx, cy, ang = Math.min(55, 12 + p.alt / 80), minUp = 35;
  // 以飛機為準的相機位置：back 往機尾方向、right 往右手邊（公尺）
  const at = (back, right) => { cx = p.x - (v[0] * back - n[0] * right) / 1000; cy = p.y - (v[1] * back - n[1] * right) / 1000; };
  const dh = Math.max(130, T.L * 3);
  if (view === 'tower') {
    // 塔台：跑道中段旁 900 公尺
    const rw = runwayFor(ap, 'tower'), mid = [rw.start[0] + rw.v[0] * rw.len / 2, rw.start[1] + rw.v[1] * rw.len / 2];
    const side = [rw.v[1], -rw.v[0]];
    cx = mid[0] - side[0] * 0.9; cy = mid[1] - side[1] * 0.9;
  } else if (view === 'side') at(-50, -Math.max(150, T.L * 3.4));
  else if (view === 'front') { at(-dh * 0.95, dh * 0.32); ang = Math.min(40, 10 + p.alt / 100); }
  else if (view === 'wing') { at(T.L * 0.5, T.b / 2 + 22); ang = 14; minUp = 10; }
  else if (view === 'top') { at(dh * 0.55, dh * 0.2); ang = 60; }
  else if (view === 'orbit') { const th = performance.now() / 1000 * 0.12; at(Math.cos(th) * dh * 1.1, Math.sin(th) * dh * 1.1); }
  else at(dh * 0.92, dh * 0.38);
  // 往下看的角度隨高度加大，避免視線太平、地面落點跑到很遠
  const hd = Math.hypot(p.x - cx, p.y - cy) * 1000;
  // MapLibre 的近裁切面約是鏡頭到地面中心距離的 1/75；飛得越高，視線就要越陡，近拍的飛機才不會被切掉
  ang = Math.max(ang, Math.atan(2.4 * p.alt / (75 * Math.max(1, hd))) * DEG);
  const ca = p.alt + Math.max(minUp, hd * Math.tan(ang / DEG));
  const k = ca / Math.max(1, ca - p.alt);
  const gx = cx + (p.x - cx) * k, gy = cy + (p.y - cy) * k;
  return camFromTo(toLL(cx, cy), ca, toLL(gx, gy), 0, COARSE ? 76 : 80);
}
function idleCamera(ap) {
  // 沒有飛機時：從跑道一側斜看整條跑道
  const rw = runwayFor(ap, 'tower'), mid = [rw.start[0] + rw.v[0] * rw.len / 2, rw.start[1] + rw.v[1] * rw.len / 2];
  const side = [rw.v[1], -rw.v[0]];
  const c = [mid[0] - side[0] * 1.6 - rw.v[0] * 0.6, mid[1] - side[1] * 1.6 - rw.v[1] * 0.6];
  return camFromTo(toLL(c[0], c[1]), 420, toLL(mid[0], mid[1]), 0, 72);
}
function stepWatch(now, m, draw) {
  const W = AIR.watch; if (!W || !S.mapReady) return null;
  // 換下一架：目前這架離開機場範圍，或還沒有對象
  if (!W.f || !watchPhase(W.f, W.ap, m)) {
    let nf = pickWatchFlight(W.ap, m, W.f, W.skip);
    if (!nf && W.skip && W.skip.size) { W.skip.clear(); nf = pickWatchFlight(W.ap, m, W.f); }
    if (nf !== W.f) { W.f = nf; W.sticky = false; W.blend = { t0: now, from: { c: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } }; renderAirCap(true); }
  }
  let cam;
  if (W.f) {
    const p = flightPos(W.f, m); if (!p) return null;
    draw.push({ f: W.f, p, ll: toLL(p.x, p.y) });
    if (AIR.paused) return null;
    cam = airCamera(W.f, p, W.ap);
  } else {
    if (AIR.paused) return null;
    cam = idleCamera(W.ap);
  }
  if (W.blend) {
    const T = W.blend, k = ease(Math.min(1, (now - T.t0) / 1800));
    cam.center = [T.from.c.lng + (cam.center.lng - T.from.c.lng) * k, T.from.c.lat + (cam.center.lat - T.from.c.lat) * k];
    cam.zoom = T.from.zoom + (cam.zoom - T.from.zoom) * k;
    cam.pitch = T.from.pitch + (cam.pitch - T.from.pitch) * k;
    cam.bearing = T.from.bearing + angDiff(T.from.bearing, cam.bearing) * k;
    if (k >= 1) W.blend = null;
  }
  return cam;
}
// 使用者拖動地圖：暫停鏡頭，按「回到飛機」再接上
(function () {
  const box = $('#map');
  const pause = () => { if (AIR.watch && !AIR.paused) { AIR.paused = true; renderAirCap(true); } };
  box.addEventListener('pointerdown', e => { if (e.button > 0 && e.pointerType === 'mouse') return; pause(); }, { capture: true });
  box.addEventListener('wheel', pause, { capture: true, passive: true });
})();

/* ---------- 介面：「選一列車」裡的「飛機」分頁、字卡 ---------- */
const airTab = document.createElement('button');
airTab.dataset.g = 'air'; airTab.setAttribute('aria-pressed', 'false'); airTab.textContent = '飛機・機場';
$('#ptabs').appendChild(airTab);
const airCap = document.createElement('section');
airCap.id = 'aircap'; airCap.className = 'glass'; airCap.hidden = true; airCap.setAttribute('aria-live', 'polite');
document.body.appendChild(airCap);

const pickIsAir = () => S.pickGroup === 'air' && !$('#picker').hidden;
let airPickHtml = '';
function renderAirPick(force) {
  const m = curMin(), q = $('#pq').value.trim().toUpperCase();
  const evt = u => `${u.dt < 1 ? '現在' : Math.round(u.dt) + ' 分後'}${u.kind === 'dep' ? '起飛' : '降落'} ${esc(airTitle(u.f))}`;
  const match = f => !q || (f.no || '').toUpperCase().includes(q) || (f.airline || '').toUpperCase() === q || airTitle(f).toUpperCase().includes(q) || nameOf(f.dep).includes(q) || nameOf(f.arr).includes(q);
  let html = '<i data-airlist hidden></i>';
  // 機場：到跑道旁等，鏡頭自動接下一架起降的飛機
  for (const ap of WATCH_APS) {
    const nm = AIRPORTS[ap][0];
    if (q && !nm.includes(q) && !ap.includes(q)) continue;
    const up = upcoming(ap, m, 2);
    html += `<button class="apk" data-ap="${ap}"><span class="c" style="background:#9FB4C8"></span><span class="n">${esc(nm)}機場</span><span class="d">${up.length ? up.map(evt).join('・') : '接下來沒有班機'}</span><span class="s">看起降</span></button>`;
  }
  // 正在機場附近起降的飛機：點了直接跟拍
  const now = [];
  for (const f of AIR.flights) {
    if (!match(f)) continue;
    const ap = WATCH_APS.find(a => watchPhase(f, a, m));
    if (ap) now.push({ f, ap, ph: watchPhase(f, ap, m) });
  }
  now.sort((x, y) => x.ap.localeCompare(y.ap) || (x.f.no || '').localeCompare(y.f.no || ''));
  html += now.slice(0, 80).map(({ f, ap, ph }) => `<button data-fid="${esc(f.id)}"><span class="c" style="background:${(AIR_LIVERY[f.airline] || {}).tail || TAIL_OLD[f.airline] || '#8C9AA6'}"></span><span class="n">${esc(airTitle(f))}</span><span class="d">${esc(nameOf(f.dep))} → ${esc(nameOf(f.arr))}・${esc(AC_TYPES[acTypeOf(f)].name)}</span><span class="s">${esc(AIRPORTS[ap][0])}${ph.kind === 'dep' ? '起飛' : '降落'}</span></button>`).join('');
  if (!now.length) html += `<div class="empty">${q ? '沒有符合的起降班機' : '此刻沒有飛機在機場附近起降，可以先到機場等下一架'}</div>`;
  html += `<div class="empty">${AIR.live ? 'TDX 當日航班' : '班次為推估'}；鏡頭只在機場附近跟拍，飛遠了就換下一架。也可以直接點地圖上的飛機。</div>`;
  // 內容沒變就不重畫，免得按下去的那一下點不到
  if (!force && html === airPickHtml && $('#plist').querySelector('[data-airlist]')) return;
  airPickHtml = html;
  $('#plist').innerHTML = html;
}
$('#plist').addEventListener('click', e => {
  const b = e.target.closest('button[data-ap], button[data-fid]'); if (!b) return;
  if (b.dataset.ap) watchAirport(b.dataset.ap);
  else { const f = AIR.flights.find(x => x.id === b.dataset.fid); if (f) watchFlight(f); }
  if (typeof closePicker === 'function') closePicker();
});
$('#pq').addEventListener('keydown', e => { if (e.key === 'Enter' && pickIsAir()) { const b = $('#plist').querySelector('button[data-fid], button[data-ap]'); if (b) b.click(); } });

// 字卡只建一次，之後只換文字：每秒重建會讓按下去的那一下點不到
function renderAirCap(force) {
  const W = AIR.watch;
  document.body.classList.toggle('airwatch', !!W);
  if (!W) { airCap.hidden = true; if (typeof renderViewBtn === 'function') renderViewBtn(); return; }
  const m = curMin(), f = W.f;
  let kicker = `觀察起降 · ${AIRPORTS[W.ap][0]}機場`, title, route = '', status = '';
  if (f) {
    const ph = watchPhase(f, W.ap, m), p = ph && ph.p;
    title = airTitle(f);
    route = `${nameOf(f.dep)} → ${nameOf(f.arr)} · ${AC_TYPES[acTypeOf(f)].name}`;
    if (ph) {
      if (ph.kind === 'dep') status = ph.ground ? (pathS(f, m) < 0.05 ? '對正跑道' : '起飛滾行') : `爬升中 · ${Math.round(p.alt)} m`;
      else status = ph.ground ? '已落地，減速滑行' : `進場中 · ${(f.path.cum[f.path.ti] - ph.s).toFixed(1)} km · ${Math.round(p.alt)} m`;
    }
  } else {
    const up = upcoming(W.ap, m, 1)[0];
    title = '等待下一架';
    status = up ? `${Math.max(0, Math.round(up.dt))} 分後${up.kind === 'dep' ? '起飛' : '降落'} · ${airTitle(up.f)}` : '今天沒有更多班機';
  }
  if (W.note && performance.now() < W.note.until) status = W.note.text;
  if (!airCap.querySelector('#airnext')) {
    airCap.setAttribute('role', 'button'); airCap.tabIndex = 0;
    airCap.innerHTML = `<div class="strip"><span class="dot"></span><b class="nm"></b><span class="nx"></span><button class="x" id="airexit2" aria-label="離開"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="kicker"><span class="dot"></span><span class="kt"></span></div><h2></h2><div class="route"></div><div class="st"></div>
      <div class="caprow"><button class="pillbtn small" id="airnext">換一架</button><button class="pillbtn small" id="airexit">離開</button></div>`;
  }
  airCap.hidden = false;
  // 和列車字卡共用展開／收合的設定
  airCap.classList.toggle('mini', !S.capOpen);
  airCap.setAttribute('aria-expanded', String(!!S.capOpen)); airCap.setAttribute('aria-label', '飛機資訊，按下可' + (S.capOpen ? '收起' : '展開'));
  const set = (sel, t) => { const el = airCap.querySelector(sel); if (el.textContent !== t) el.textContent = t; };
  set('.kt', kicker); set('h2', title); set('.route', route); set('.st', status);
  set('.strip .nm', title); set('.strip .nx', status.replace(/^進場中 · /, '').replace(/^爬升中 · /, '↑ '));
  airCap.querySelector('.route').hidden = !route;
  renderAirViewBtn();
}
// 視角按鈕：和列車共用底部的「視角」按鈕，觀察起降時換成飛機的視角
function airViewName() {
  const v = AIR_VIEWS.find(v => v.id === AIR.view) || AIR_VIEWS[0];
  return v.id === 'auto' && AIR.watch && AIR.watch.auto ? '自動（' + AIR_VIEWS.find(x => x.id === AIR.watch.auto.v).name + '）' : v.name;
}
function renderAirViewBtn() {
  const b = $('#viewbtn'); if (!b || !AIR.watch) return;
  b.disabled = false;
  b.textContent = AIR.paused ? '◉ 回到' + (AIR.watch.f ? '飛機' : '跑道') : '視角・' + airViewName();
}
if (typeof renderViewBtn === 'function') {
  const _rvb = renderViewBtn;
  renderViewBtn = function () { if (AIR.watch) return renderAirViewBtn(); return _rvb.apply(this, arguments); };
}
function cycleAirView() {
  if (AIR.paused) { AIR.paused = false; airBlend(); renderAirCap(true); return; } // 自由視角時先回到原視角
  const i = AIR_VIEWS.findIndex(v => v.id === AIR.view);
  setAirView(AIR_VIEWS[(i + 1) % AIR_VIEWS.length].id);
}
$('#viewbtn').addEventListener('click', e => { if (!AIR.watch) return; e.stopImmediatePropagation(); cycleAirView(); }, { capture: true });
function airBlend() { if (AIR.watch) AIR.watch.blend = { t0: performance.now(), from: { c: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } }; }
function setAirView(id) {
  AIR.view = id; store.set('airView', id); AIR.paused = false;
  if (AIR.watch) AIR.watch.auto = null;
  airBlend(); renderAirCap(true);
}
function nextAirPlane() {
  const W = AIR.watch; if (!W) return;
  const m = curMin();
  // 記住看過的，連按會依序輪過每一架；輪完一圈再從頭
  W.skip = W.skip || new Set();
  if (W.f) W.skip.add(W.f.id);
  let nf = pickWatchFlight(W.ap, m, W.f, W.skip);
  if (!nf && W.skip.size) { W.skip.clear(); nf = pickWatchFlight(W.ap, m, W.f); }
  if (nf) { W.f = nf; W.sticky = true; AIR.paused = false; airBlend(); }
  else W.note = { text: '目前機場附近只有這一架，換不了', until: performance.now() + 2500 };
  renderAirCap(true);
}
// 字卡點一下展開、再點一下收起；裡面的按鈕各做各的事
airCap.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && (b.id === 'airexit' || b.id === 'airexit2')) return exitWatch();
  if (b && b.id === 'airnext') return nextAirPlane();
  S.capOpen = !S.capOpen; store.set('capOpen', S.capOpen); renderAirCap(true);
});
airCap.addEventListener('keydown', e => {
  if (e.target !== airCap || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault(); e.stopPropagation();
  S.capOpen = !S.capOpen; store.set('capOpen', S.capOpen); renderAirCap(true);
});
setInterval(() => { if (AIR.watch) renderAirCap(); if (pickIsAir()) renderAirPick(); }, 1000);
document.addEventListener('keydown', e => {
  if (!AIR.watch || e.target.matches('input, textarea')) return;
  if (e.key === 'Escape') { exitWatch(); e.stopImmediatePropagation(); }
  else if (e.key === 'v' || e.key === 'V') { cycleAirView(); e.stopImmediatePropagation(); }
}, true);

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
