/* ===== 營運快訊跑馬燈與沿線景點字幕 ===== */

/* ---------- 沿線景點 ----------
   [名稱, 緯度, 經度, 觸發半徑（公里）, 一句話]
   跟拍中的列車進入半徑內時，畫面上方淡入一行字幕。 */
const SPOTS = [
  // 北部
  ['基隆港', 25.1330, 121.7420, 1.2, '港邊的貨櫃起重機與客輪，北台灣的海上門戶'],
  ['猴硐貓村', 25.0870, 121.8270, 0.8, '昔日的煤礦小鎮，如今是貓咪的家'],
  ['十分老街', 25.0410, 121.7760, 0.7, '列車從老街店家門前慢慢穿過，天燈從這裡升起'],
  ['九份山城', 25.1090, 121.8440, 4, '東北方的山頭上，九份的燈火依山而建'],
  ['福隆海水浴場', 25.0200, 121.9440, 1.2, '雙溪出海口的金色沙灘'],
  ['龜山島', 24.8430, 121.9500, 14, '窗外海上那座像烏龜的小島，是宜蘭人的回家地標'],
  ['礁溪溫泉', 24.8270, 121.7740, 1, '平地就湧出的溫泉，冬天最適合來泡湯'],
  ['淡水河口', 25.1650, 121.4450, 1.2, '淡水的夕陽，河口的船影'],
  ['關渡大橋', 25.1170, 121.4610, 1.2, '紅色拱橋橫跨淡水河，對岸是觀音山'],
  ['北投溫泉', 25.1365, 121.5070, 1, '硫磺味的山谷，百年的溫泉鄉'],
  ['美麗華摩天輪', 25.0835, 121.5575, 0.8, '大直夜空裡緩緩轉動的摩天輪'],
  ['松山機場', 25.0697, 121.5525, 1.2, '飛機在城市裡起降，跑道就在捷運旁'],
  ['台北 101', 25.0340, 121.5645, 2.5, '信義區的天際線，台北最高的竹節'],
  ['象山', 25.0270, 121.5760, 0.9, '登上象山步道，可以俯瞰整個信義區'],
  ['中正紀念堂', 25.0350, 121.5210, 0.6, '藍白色的八角屋頂與自由廣場'],
  ['西門町', 25.0420, 121.5070, 0.5, '電影院、街頭表演與老戲院，台北的青春'],
  ['大安森林公園', 25.0300, 121.5355, 0.5, '城市中央的一大片綠地'],
  ['台北市立動物園', 24.9980, 121.5810, 0.8, '文湖線的終點，旁邊就是貓空纜車'],
  ['碧潭', 24.9560, 121.5370, 0.8, '碧潭吊橋與天鵝船，新店溪的一抹綠'],
  ['鶯歌老街', 24.9530, 121.3520, 0.8, '陶瓷的故鄉，窯燒的煙囪曾經遍布整座小鎮'],
  ['桃園國際機場', 25.0780, 121.2330, 2.5, '台灣的國門，每天上千班飛機起降'],
  // 中部
  ['香山濕地', 24.7800, 120.9140, 2, '退潮時一望無際的泥灘，招潮蟹與水鳥的家'],
  ['白沙屯', 24.5650, 120.7065, 1, '海線上的小站，媽祖徒步進香的起點'],
  ['三義木雕', 24.4180, 120.7700, 1.5, '山城裡的木雕之鄉'],
  ['高美濕地', 24.3120, 120.5490, 6, '西邊海岸的風車與夕陽'],
  ['追分', 24.1205, 120.5704, 0.6, '「追分 — 成功」，最受歡迎的祝福車票'],
  ['台中驛', 24.1375, 120.6860, 0.5, '紅磚與白色飾帶的百年站房'],
  ['國家歌劇院', 24.1630, 120.6400, 1.1, '曲牆洞窟般的劇場，就在綠線旁'],
  ['彰化扇形車庫', 24.0880, 120.5410, 0.8, '台灣僅存的扇形車庫，蒸汽機車還住在這裡'],
  ['八卦山大佛', 24.0790, 120.5490, 2, '東邊山上的大佛，守望彰化市'],
  ['濁水溪', 23.8000, 120.6170, 2, '台灣最長的河，分隔雲林與彰化'],
  ['濁水溪', 23.8300, 120.5240, 2, '台灣最長的河，分隔雲林與彰化'],
  // 南部
  ['檜意森活村', 23.4870, 120.4530, 1.4, '阿里山林業的日式木造宿舍群'],
  ['故宮南院', 23.4730, 120.2930, 4, '朴子溪畔的故宮南部院區'],
  ['赤崁樓', 22.9975, 120.2025, 1.2, '府城最古老的樓閣之一'],
  ['永保安康', 22.9330, 120.2320, 0.6, '保安車站，「永康 — 保安」的祝福車票從這裡出發'],
  ['奇美博物館', 22.9350, 120.2260, 1.2, '白色歐式建築與大片草地'],
  ['蓮池潭', 22.6810, 120.2940, 1.5, '龍虎塔倒映在潭面上'],
  ['高屏溪舊鐵橋', 22.6470, 120.4300, 1.5, '百年的鋼梁鐵橋，如今靜靜躺在新橋旁'],
  ['光之穹頂', 22.6316, 120.3020, 0.4, '美麗島站地下的彩色玻璃穹頂'],
  ['愛河', 22.6220, 120.2880, 0.7, '夜晚倒映著燈光的高雄之河'],
  ['駁二藝術特區', 22.6200, 120.2820, 0.6, '港邊倉庫改成的藝術聚落'],
  ['高雄 85 大樓', 22.6116, 120.3000, 1.5, '港都天際線上那座「高」字形大樓'],
  ['衛武營', 22.6240, 120.3410, 0.9, '像大榕樹一樣的藝術文化中心'],
  // 南迴與東部
  ['台灣海峽', 22.3670, 120.5930, 1.5, '枋寮之後，鐵道沿著海岸往南'],
  ['多良車站', 22.5080, 120.9590, 2.5, '「最美的車站」，月台就在太平洋上方'],
  ['太麻里', 22.6150, 121.0000, 1.5, '台灣本島最早看見新世紀曙光的地方'],
  ['知本溫泉', 22.7000, 121.0600, 2, '知本溪谷的溫泉鄉'],
  ['鹿野高台', 22.9170, 121.1360, 2, '熱氣球從高台上冉冉升起'],
  ['伯朗大道', 23.1100, 121.2200, 2, '池上一望無際的稻田，沒有一根電線桿'],
  ['花東縱谷', 23.3000, 121.3000, 3.5, '中央山脈與海岸山脈之間，筆直的谷地'],
  ['七星潭', 24.0300, 121.6290, 3, '花蓮東邊的月牙灣，鵝卵石海岸'],
  ['太魯閣', 24.1580, 121.6210, 4, '立霧溪切出的大理石峽谷就在山的那一邊'],
  ['清水斷崖', 24.2160, 121.6870, 4.5, '中央山脈直落太平洋的海崖'],
];
const TROPIC_LAT = 23.4365;

const Extras = {
  spots: store.get('spots', true), alerts: store.get('alerts', true),
  spotSeen: new Map(), prevLat: null, prevTrip: null, spotTimer: 0, spotQueue: [],
  alertList: [], alertIdx: 0, alertTimer: 0, alertLoad: 0,
};

const spotEl = document.createElement('div');
spotEl.id = 'spotcap'; spotEl.hidden = true; spotEl.setAttribute('aria-live', 'polite');
const noticeEl = document.createElement('div');
noticeEl.id = 'notice'; noticeEl.className = 'glass'; noticeEl.hidden = true; noticeEl.setAttribute('role', 'status');
document.body.append(spotEl, noticeEl);

function kmBetween(lat1, lon1, lat2, lon2) {
  const kx = 111.32 * Math.cos((lat1 + lat2) / 2 / DEG), ky = 110.57;
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * ky);
}

function showSpot(name, line, kicker = '沿途') {
  spotEl.innerHTML = `<div class="k">${esc(kicker)}</div><b>${esc(name)}</b><span>${esc(line)}</span>`;
  spotEl.hidden = false; spotEl.classList.remove('on');
  requestAnimationFrame(() => requestAnimationFrame(() => spotEl.classList.add('on')));
  clearTimeout(Extras.spotTimer);
  Extras.spotTimer = setTimeout(() => {
    spotEl.classList.remove('on');
    Extras.spotTimer = setTimeout(() => { spotEl.hidden = true; Extras.spotTimer = 0; }, 1600);
  }, 9000);
}
function hideSpot() { clearTimeout(Extras.spotTimer); Extras.spotTimer = 0; spotEl.classList.remove('on'); spotEl.hidden = true; }

function checkSpots() {
  const t = S.follow;
  if (!Extras.spots || !t || S.flying) { if (!t) { Extras.prevTrip = null; Extras.prevLat = null; } return; }
  const pos = tripPos(t, curMin()); if (!pos) return;
  const [lon, lat] = unproj(pos.x, pos.y), now = Date.now();
  if (t !== Extras.prevTrip) { Extras.prevTrip = t; Extras.prevLat = lat; Extras.spotQueue = []; }
  // 跨越北回歸線
  if (Extras.prevLat != null && (Extras.prevLat - TROPIC_LAT) * (lat - TROPIC_LAT) < 0) {
    Extras.spotQueue.unshift(['北回歸線', '北緯 23.5 度，列車正從' + (lat > TROPIC_LAT ? '熱帶進入亞熱帶' : '亞熱帶進入熱帶')]);
  }
  Extras.prevLat = lat;
  let best = null, bestD = Infinity;
  for (let i = 0; i < SPOTS.length; i++) {
    const s = SPOTS[i], seen = Extras.spotSeen.get(i);
    if (seen && now - seen < 30 * 60e3) continue;
    const d = kmBetween(lat, lon, s[1], s[2]);
    if (d < s[3] && d < bestD) { best = i; bestD = d; }
  }
  if (best != null) {
    Extras.spotSeen.set(best, now);
    // 同名的另一處（例如高鐵與台鐵各自跨越濁水溪）也一起記為看過
    SPOTS.forEach((s, i) => { if (s[0] === SPOTS[best][0]) Extras.spotSeen.set(i, now); });
    Extras.spotQueue.push([SPOTS[best][0], SPOTS[best][4]]);
  }
  if (!Extras.spotTimer && Extras.spotQueue.length) { const [n, l] = Extras.spotQueue.shift(); showSpot(n, l); }
}

/* ---------- 營運快訊（需要 TDX 金鑰） ---------- */
const ALERT_SOURCES = [
  ['台鐵', 'v3/Rail/TRA/Alert'],
  ['高鐵', 'v2/Rail/THSR/AlertInfo'],
  ['北捷', 'v2/Rail/Metro/Alert/TRTC'],
  ['機捷', 'v2/Rail/Metro/Alert/TYMC'],
  ['中捷', 'v2/Rail/Metro/Alert/TMRT'],
  ['高捷', 'v2/Rail/Metro/Alert/KRTC'],
  ['輕軌', 'v2/Rail/Metro/Alert/KLRT'],
];
const ALERT_BAD = /延誤|誤點|停駛|中斷|異常|暫停|暫停營運|影響|延遲|事故|颱風|地震|豪雨|落石|停止|改點|單線|班距|疏運|故障|停電|封閉|取消|延長|調整/;
const txt = v => typeof v === 'string' ? v : v && typeof v === 'object' ? (v.Zh_tw || v.zh_tw || '') : '';
function parseAlerts(label, j) {
  const list = Array.isArray(j) ? j : (j && (j.Alerts || j.AlertInfos || j.Data)) || [];
  const out = [], now = Date.now();
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const exp = Date.parse(a.EndTime || a.ExpireTime || '');
    if (exp && exp < now) continue;
    const start = Date.parse(a.StartTime || a.EffectiveTime || '');
    if (start && start > now + 6 * 3600e3) continue;
    const title = txt(a.Title).trim(), desc = txt(a.Description).replace(/\s+/g, ' ').trim();
    const all = title + ' ' + desc;
    if (!title && !desc) continue;
    // 「全線正常營運」這類狀態列不算快訊
    if (/正常/.test(all) && !ALERT_BAD.test(all)) continue;
    let text = title && desc && !desc.startsWith(title) ? title + '：' + desc : (desc || title);
    if (text.length > 140) text = text.slice(0, 138) + '…';
    out.push({ label, text });
  }
  return out;
}
async function loadAlerts() {
  if (!Extras.alerts || Extras.demo) return;
  const cred = store.get('tdx', {});
  if (!cred.id || !cred.secret) { setAlerts([]); return; }
  if (Extras.alertBusy) return; Extras.alertBusy = true; // 開頁和按下連線都會觸發，不要重複排
  Extras.alertLoad = Date.now();
  const res = await Promise.allSettled(ALERT_SOURCES.map(([label, path]) => TDX.get(path, cred, 0).then(j => parseAlerts(label, j)))).finally(() => { Extras.alertBusy = false; });
  const seen = new Set(), list = [];
  for (const r of res) if (r.status === 'fulfilled') for (const a of r.value) {
    const k = a.label + a.text; if (seen.has(k)) continue; seen.add(k); list.push(a);
  }
  setAlerts(list);
}
function setAlerts(list) {
  const same = list.length === Extras.alertList.length && list.every((a, i) => a.text === Extras.alertList[i].text);
  if (same) return;
  Extras.alertList = list; Extras.alertIdx = 0;
  clearTimeout(Extras.alertTimer);
  if (!list.length || !Extras.alerts) { noticeEl.classList.remove('on'); setTimeout(() => { if (!Extras.alertList.length) noticeEl.hidden = true; }, 800); return; }
  nextAlert();
}
function nextAlert() {
  const list = Extras.alertList; if (!list.length) return;
  const a = list[Extras.alertIdx % list.length]; Extras.alertIdx++;
  noticeEl.hidden = false;
  noticeEl.innerHTML = `<span class="tag">${esc(a.label)}</span><span class="win"><span class="txt">${esc(a.text)}</span></span>${list.length > 1 ? `<span class="n">${(Extras.alertIdx - 1) % list.length + 1}/${list.length}</span>` : ''}`;
  requestAnimationFrame(() => {
    noticeEl.classList.add('on');
    const win = noticeEl.querySelector('.win'), t = noticeEl.querySelector('.txt');
    const over = t.scrollWidth - win.clientWidth;
    let hold = 9000;
    if (over > 4) {
      // 文字太長就慢慢往左捲，捲完停一下再換下一則
      const dur = Math.max(4, over / 40);
      t.style.transition = 'none'; t.style.transform = 'translateX(0)';
      setTimeout(() => { t.style.transition = `transform ${dur}s linear`; t.style.transform = `translateX(${-over}px)`; }, 2000);
      hold = 2000 + dur * 1000 + 3000;
    }
    clearTimeout(Extras.alertTimer);
    if (list.length > 1 || over > 4) Extras.alertTimer = setTimeout(() => {
      noticeEl.classList.remove('on');
      Extras.alertTimer = setTimeout(nextAlert, 700);
    }, hold);
  });
}

/* ---------- 設定開關與排程 ---------- */
function extrasToggle(id, key, apply) {
  const b = $(id); if (!b) return;
  b.setAttribute('aria-pressed', String(Extras[key]));
  b.addEventListener('click', () => { Extras[key] = !Extras[key]; store.set(key, Extras[key]); b.setAttribute('aria-pressed', String(Extras[key])); apply(Extras[key]); });
}
extrasToggle('#spotbtn', 'spots', on => { if (!on) { hideSpot(); Extras.spotQueue = []; } });
extrasToggle('#alertbtn', 'alerts', on => {
  if (on) { Extras.alertList = []; loadAlerts().catch(() => {}); }
  else { clearTimeout(Extras.alertTimer); noticeEl.classList.remove('on'); noticeEl.hidden = true; Extras.alertList = []; }
});
$('#tdxgo').addEventListener('click', () => setTimeout(() => loadAlerts().catch(() => {}), 1500));
$('#tdxclear').addEventListener('click', () => setAlerts([]));

setInterval(checkSpots, 1000);
// 分頁在背景時不讀；回到前景後 30 秒內補讀
setInterval(() => { if (!document.hidden && Date.now() - Extras.alertLoad > 5 * 60e3) loadAlerts().catch(() => {}); }, 30e3);
setTimeout(() => loadAlerts().catch(() => {}), 2000);

// 網址加上 ?alertdemo 可以預覽跑馬燈的樣子
if (/[?&]alertdemo\b/.test(location.search)) {
  Extras.demo = true;
  setTimeout(() => setAlerts([
    { label: '台鐵', text: '颱風影響：花東線今日 18 時後部分列車停駛，請旅客留意最新公告並提早改搭其他班次或辦理退票。' },
    { label: '北捷', text: '板南線因設備檢修，班距暫時調整為 6 分鐘。' },
  ]), 1500);
}
