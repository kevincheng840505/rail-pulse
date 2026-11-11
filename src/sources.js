/* 資料來源與位置模型分開記錄：官方班表並不代表實際 GPS。 */
const DataSource = (() => {
  const labels = { official_timetable: '官方班表', official_delay: '官方延誤', estimated_timetable: '推估班表', simulated: '模擬' };
  const record = (type, updatedAt = Date.now(), ttl = 0, extra = {}) => ({ type, updatedAt, ttl, ...extra });
  function status(r, now, online) {
    if (!online) return 'offline';
    if (!r) return 'missing';
    if (r.error) return 'error';
    if (r.ttl && now - r.updatedAt > r.ttl) return 'stale';
    return 'valid';
  }
  function describe(t, now = Date.now(), online = typeof navigator === 'undefined' || navigator.onLine) {
    const s = t.sources || {}, timetable = s.timetable;
    const parts = [labels[timetable && timetable.type] || '來源不明'];
    if (timetable && timetable.basis === 'official_timetable') parts.push('官方班距推算，非逐班實報');
    const stateNames = {offline:'離線',missing:'缺資料',error:'服務錯誤',stale:'資料過期'};
    const state = status(timetable, now, online);
    if (state !== 'valid') parts.push(stateNames[state] + '・降級顯示');
    if (timetable && timetable.updatedAt) parts.push('更新 ' + new Date(timetable.updatedAt).toLocaleString('zh-TW', {timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}));
    if (t.sys === 'TRA') {
      const d = s.delay, ds = status(d, now, online);
      parts.push(d ? labels[d.type] : '延誤缺資料');
      if (d && ds !== 'valid') parts.push('延誤' + stateNames[ds]);
      if (d && d.type === 'official_delay') parts.push('延誤更新 ' + new Date(d.updatedAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}));
    }
    parts.push(t.aircraft ? '航跡／位置為模型推估，非實際定位' : '位置依班表推算，非 GPS');
    return {state, text:parts.join(' · '), types:[timetable && timetable.type,s.delay && s.delay.type,'simulated'].filter(Boolean)};
  }
  return {record,status,describe};
})();
