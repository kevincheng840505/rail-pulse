const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness({sys = 'TRA', no = '101', live = false, saved, minute = 600, now = Date.UTC(2026, 10, 11, 2)} = {}) {
  const elements = new Map(), intervals = new Set();
  function $(key) {
    if (!elements.has(key)) elements.set(key, {hidden:true, children:[], style:{setProperty(){}}, classList:{contains(){return false},toggle(){}}, textContent:'', innerHTML:'', addEventListener(k,fn){this[k]=fn}, setAttribute(){}, focus(){}});
    return elements.get(key);
  }
  const t = {sys,no,live,origin:'A',dest:'C',line:{id:'red'},type:'區間',color:'#abc',idx:0,delay:0,cum:[0,10,20],nodes:[{name:'A'},{name:'B'},{name:'C'}],times:[{dep:590,arr:590,stop:true},{dep:610,arr:610,stop:true},{dep:625,arr:625,stop:true}]};
  let stored = saved || null;
  class Clock extends Date { static now(){return now} }
  const ctx = vm.createContext({console,Date:Clock,Math,Number,String,JSON,Set,Map,$,store:{get(k,d){return k==='focus2' && stored ? structuredClone(stored):d},set(k,v){stored=structuredClone(v)}}, S:{positions:[{trip:t,pos:{seg:0}}],simMs:now,started:true,follow:null},TRIPS:[t], document:{title:'Rail',body:{classList:{contains(){return false},toggle(){}}},addEventListener(){}},window:{addEventListener(){}},settings:$('#settings'),sky:$('#sky'),musicPanel:$('#music'),picker:$('#picker'),Music:{playing:true},setInterval(fn){intervals.add(fn);return fn},clearInterval(fn){intervals.delete(fn)},setTimeout(){},curMin:()=>minute,tripMinute:()=>minute,tripPos:()=>({seg:0,km:1}),effTime:(t,i,k)=>t.times[i][k]+t.delay,trainTitle:t=>t.sys+t.no,esc:String,closePicker(){},closeIntro(fn){fn()},follow(t){ctx.S.follow=t},setRoam(on){ctx.S.roam=on},setMusic(){},minOfDay:()=>minute,toggleClean(){}});
  vm.runInContext(fs.readFileSync('src/focus.js','utf8'),ctx);
  return {ctx,t,$, get saved(){return stored},advance(ms){now+=ms;ctx.S.simMs=now},tick(){for(const fn of [...intervals])fn()},board(){ $('#focusgo').click(); $('#dlist').click({target:{closest:()=>({dataset:{k:'0'}})}}) },mode(){return vm.runInContext('Focus.mode',ctx)}};
}
for (const [sys,no] of [['TRA','101'],['THSR','201'],['TRTC','']]) test(`${sys} reload preserves service and countdown`,()=>{
 const h=harness({sys,no});h.board();h.advance(60000);h.tick();const before=h.$('#rt').textContent;
 const r=harness({sys,no,saved:h.saved,now:Date.UTC(2026,10,11,2,1)});r.tick();assert.equal(r.mode(),'ride');assert.equal(r.$('#rt').textContent,before);assert.equal(r.ctx.S.follow,r.t);
});
test('arrival includes elapsed delay; fourth ticket starts a long break',()=>{
 const h=harness();h.board();const saved=h.saved;saved.round=3;
 const r=harness({saved});r.t.delay=5;r.advance(30*60000);r.tick();assert.equal(r.mode(),'ticket');assert.equal(r.saved.log[0].mins,30);assert.equal(r.saved.breakLen,15);
 r.$('#ticket').click({target:{closest:()=>({id:'tbreak'})}});assert.equal(r.mode(),'break');r.advance(15*60000);r.tick();assert.equal(r.mode(),'idle');assert.equal(r.$('#depart').hidden,false);
});
test('official service cannot restore onto an estimated service with the same number',()=>{
 const h=harness({live:true});h.board();const r=harness({saved:h.saved,live:false});r.tick();assert.equal(r.mode(),'idle');assert.equal(r.saved.done,0);
});
test('timetable replacement resolves the destination by station rather than old index',()=>{
 const h=harness();h.board();const replacement=structuredClone(h.t);replacement.nodes.splice(1,0,{name:'X'});replacement.times.splice(1,0,{arr:605,dep:605,stop:true});replacement.cum=[0,5,10,20];
 h.ctx.TRIPS.splice(0,1,replacement);h.ctx.S.follow=replacement;h.tick();assert.equal(h.$('#rdest').textContent,'C');
});
test('removed destination safely ends a ride without issuing a ticket',()=>{
 const h=harness();h.board();const replacement=structuredClone(h.t);replacement.nodes.pop();replacement.times.pop();replacement.cum.pop();replacement.dest='B';h.ctx.TRIPS.splice(0,1,replacement);h.ctx.S.follow=replacement;h.tick();assert.equal(h.mode(),'idle');assert.equal(h.saved.done,0);
});
test('midnight and background elapsed time keep a ride running',()=>{
 const h=harness({minute:1430,now:Date.UTC(2026,10,11,15,50)});h.t.times=[{arr:1420,dep:1420,stop:true},{arr:1440,dep:1440,stop:true},{arr:1455,dep:1455,stop:true}];h.board();h.advance(15*60000);h.tick();assert.equal(h.mode(),'ride');assert.equal(h.$('#rt').textContent,'10:00');
});
test('candidate ties use a stable service identity even when input order changes',()=>{
 const h=harness({sys:'TRTC',no:''});const other=structuredClone(h.t);other.line.id='blue';other.times[0].dep=589;other.idx=1;h.ctx.S.positions.push({trip:other,pos:{seg:0}});
 h.$('#focusgo').click();const first=h.$('#dlist').innerHTML;h.ctx.S.positions.reverse();h.$('#focusgo').click();assert.equal(h.$('#dlist').innerHTML,first);
 // Both anonymous services have the same title, so compare the selected object too.
 h.$('#dlist').click({target:{closest:()=>({dataset:{k:'0'}})}});assert.equal(h.ctx.S.follow,other);
});

test('official reload waits for in-flight timetable loading, then restores',()=>{
 const h=harness({live:true});h.board();const r=harness({saved:h.saved,live:false});r.ctx.TDX={loading:true};r.tick();assert.equal(r.mode(),'ride');
 r.t.live=true;r.ctx.TDX.loading=false;r.tick();assert.equal(r.ctx.S.follow,r.t);assert.equal(r.mode(),'ride');
});
