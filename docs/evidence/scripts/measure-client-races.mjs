// Stage 4/5. Original components, synthetic data and local virtual DOM/time only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
process.env.QUARTERMATE_MEASUREMENT_LIBRARY='1';
const {setup}=await import('./measure-client-requests.mjs');
const live=process.argv.includes('--live'),roomPollMs=live?3000:15000;
const recordBefore=process.argv.includes('--record-before'),results=[];
const hasRoom=m=>Boolean(m.w.document.querySelector('.app-shell'));
const name=m=>m.w.document.querySelector('.team-switch strong')?.textContent;
async function scenario(label,screen,options,run){
 process.stderr.write(`Running ${label}\n`);
 const m=await setup(screen,{...options,live:screen==='home'&&live});
 try{await run(m);results.push({scenario:label,passed:true});}
 catch(error){results.push({scenario:label,passed:false,error:error.message});if(!recordBefore)throw error;}
 finally{await m.close();process.stderr.write(`Finished ${label}\n`);}
}
async function teamForm(m){await m.click('설정');await m.click('팀 정보 · 기본 경기 설정');const input=m.w.document.querySelector('input[name="teamName"]');input.value='저장된 최신 팀';return input.closest('form');}
async function submit(m,form){await m.w.__measure.act(async()=>form.dispatchEvent(new m.w.Event('submit',{bubbles:true,cancelable:true})));await m.flush();}
for(const status of [200,401,403]){
 await scenario(`old-${status}-after-save`,'home',{},async m=>{
  const form=await teamForm(m);let first=true;
  m.setBehavior(({entry,data})=>entry.path==='/api/room'&&entry.method==='GET'&&first?(first=false,{delay:4500,ignoreAbort:true,status,data:status===200?data:{error:'오래된 오류'}}):entry.method==='PUT'?{delay:1000}:null);
  await m.advance(roomPollMs);await submit(m,form);await m.advance(5000);
  assert.equal(name(m),'저장된 최신 팀');
 });
}
await scenario('old-403-during-save','home',{},async m=>{
 const form=await teamForm(m);let first=true;
 m.setBehavior(({entry})=>entry.path==='/api/room'&&entry.method==='GET'&&first?(first=false,{delay:1500,ignoreAbort:true,status:403,data:{error:'오래된 접근 오류'}}):entry.method==='PUT'?{delay:5000}:null);
 await m.advance(roomPollMs);await submit(m,form);await m.advance(2000);assert.equal(hasRoom(m),true);await m.advance(4000);assert.equal(name(m),'저장된 최신 팀');
});
await scenario('same-revision-permission-and-pending-count','home',{},async m=>{
 m.setRoom({...m.room,pendingJoinCount:7});await m.advance(roomPollMs);
 assert.ok(m.w.document.querySelector('button[aria-label="팀원 초대 · 승인 대기 7건"]'));
 await m.click('설정');await m.click('팀 정보 · 기본 경기 설정');
 const {pendingJoinCount,...room}=m.room;
 m.setRoom({...room,role:'player',permissions:{canManage:false,canRecord:false,isCaptain:false}});await m.advance(roomPollMs);
 assert.equal(Boolean(m.w.document.querySelector('input[name="teamName"]')),false);
 await m.click('경기 일정');assert.ok(m.w.document.querySelector('button[aria-label="팀원 초대"]'));
 m.setRoom({...room,pendingJoinCount:0});await m.advance(roomPollMs);assert.ok(m.w.document.querySelector('button[aria-label="팀원 초대"]'));
});
await scenario('latest-access-denial-clears-room','home',{},async m=>{
 m.setBehavior(({entry})=>entry.path==='/api/room'?{status:403,data:{error:'현재 권한 회수'}}:null);await m.advance(roomPollMs);assert.equal(hasRoom(m),false);assert.ok(m.w.document.body.textContent.includes('현재 권한 회수'));
 m.reset();await m.advance(6000);assert.equal(m.requests.filter(r=>r.path==='/api/room').length,0);
});
await scenario('deleted-team-404-clears-room','home',{},async m=>{
 m.setBehavior(({entry})=>entry.path==='/api/room'?{status:404,data:{error:'삭제된 팀'}}:null);await m.advance(roomPollMs);assert.equal(hasRoom(m),false);assert.ok(m.w.document.body.textContent.includes('삭제된 팀'));
 m.reset();await m.advance(2*roomPollMs);assert.equal(m.requests.filter(r=>r.path==='/api/room').length,0);
});
await scenario('timed-out-read-retries-on-coinciding-tick','home',{},async m=>{
 let first=true;m.setBehavior(({entry})=>entry.path==='/api/room'&&entry.method==='GET'&&first?(first=false,{delay:20000}):null);
 m.reset();await m.advance(roomPollMs);await m.advance(15000);
 const rooms=m.requests.filter(r=>r.path==='/api/room');assert.equal(rooms.length,2);assert.equal(rooms[0].aborted,true);
});
await scenario('logout-stops-room-and-late-success','home',{allowNavigation:true},async m=>{
 let first=true;m.setBehavior(({entry,data})=>entry.path==='/api/room'&&first?(first=false,{delay:4500,ignoreAbort:true,data}):null);
 await m.advance(roomPollMs);await m.click('설정');await m.click('로그아웃');assert.equal(hasRoom(m),false);
 m.reset();await m.advance(6000);assert.equal(hasRoom(m),false);assert.equal(m.requests.filter(r=>r.path==='/api/room').length,0);assert.ok(m.navigation.length);
});
await scenario('failed-logout-keeps-session','home',{allowNavigation:true},async m=>{
 m.setBehavior(({entry})=>entry.path==='/api/auth/logout'?{status:500,data:{error:'합성 로그아웃 실패'}}:null);
 await m.click('설정');await m.click('로그아웃');assert.equal(hasRoom(m),true);m.reset();await m.advance(2*roomPollMs);assert.equal(m.requests.filter(r=>r.path==='/api/room').length,2);assert.equal(m.navigation.length,0);
});
await scenario('hub-logout-stops-automatic-reads','hub',{allowNavigation:true},async m=>{
 await m.click('측정 계정 · 계정');await m.click('로그아웃');m.reset();await m.advance(30000);await m.event('focus');assert.deepEqual(m.counts(),{});assert.ok(!m.w.document.body.textContent.includes('계정 식별자: measure-user'));
});
await scenario('logout-during-home-bootstrap','home',{allowNavigation:true,beforeMount:({setBehavior})=>setBehavior(({entry,data})=>entry.path==='/api/room'?{delay:4500,ignoreAbort:true,data}:null)},async m=>{
 assert.equal(hasRoom(m),false);await m.click('측정 계정 · 계정');await m.click('로그아웃');await m.advance(6000);assert.equal(hasRoom(m),false);assert.ok(!m.w.document.body.textContent.includes('계정 식별자: measure-user'));
});
await scenario('team-navigation-a-b-a-cleans-old-reads','home',{},async m=>{
 m.setBehavior(({entry})=>entry.path==='/api/room'&&entry.query.includes('MEASUREA')?{delay:6000}:null);await m.advance(roomPollMs);
 const old=m.requests.filter(r=>r.path==='/api/room').at(-1);await m.remount('/?room=MEASUREB');assert.equal(name(m),'측정 B 팀');assert.equal(old.aborted,true);
 m.setBehavior(null);m.setRoom({...m.room,state:{...m.room.state,teamName:'A의 새 상태'}});await m.remount('/?room=MEASUREA');await m.advance(6500);assert.equal(name(m),'A의 새 상태');
});
await scenario('strict-mode-bootstrap-remains-functional','home',{strict:true},async m=>{assert.equal(hasRoom(m),true);m.reset();await m.advance(2*roomPollMs);assert.equal(m.requests.filter(r=>r.path==='/api/room').length,2);});
await scenario('logout-pending-ignores-old-403','home',{allowNavigation:true},async m=>{
 let first=true;m.setBehavior(({entry})=>entry.path==='/api/room'&&first?(first=false,{delay:1000,ignoreAbort:true,status:403,data:{error:'옛 권한 오류'}}):entry.path==='/api/auth/logout'?{delay:2000}:null);
 await m.advance(roomPollMs);await m.click('설정');await m.click('로그아웃');await m.advance(1000);assert.equal(hasRoom(m),true);await m.advance(2000);assert.equal(hasRoom(m),false);
});
await scenario('team-navigation-discards-old-mutation','home',{},async m=>{
 const form=await teamForm(m);m.setBehavior(({entry})=>entry.path==='/api/room'&&entry.method==='PUT'?{delay:5000}:null);await submit(m,form);
 await m.remount('/?room=MEASUREB');await m.advance(6000);assert.equal(name(m),'측정 B 팀');
});
await scenario('bootstrap-a-b-late-session-is-discarded','home',{beforeMount:({setBehavior})=>{let first=true;setBehavior(({entry,data})=>entry.path==='/api/auth/session'&&first?(first=false,{delay:4500,ignoreAbort:true,data}):null);}},async m=>{
 await m.remount('/?room=MEASUREB');assert.equal(name(m),'측정 B 팀');await m.advance(6000);assert.equal(name(m),'측정 B 팀');
 assert.equal(m.requests.filter(r=>r.path==='/api/room'&&r.query.includes('MEASUREA')).length,0);
});
await scenario('anonymous-hub-recovers-after-login-elsewhere','hub',{},async m=>{
 m.setSignedIn(false);await m.advance(15000);assert.ok(!m.w.document.querySelector('.hub-header button'));
 m.setSignedIn(true);await m.event('focus');assert.ok([...m.w.document.querySelectorAll('.hub-header button')].some(b=>b.textContent.includes('측정 계정')));
});
const output=process.argv.find(arg=>arg.endsWith('.json'))||'work/request-races-stage4.json';fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({mode:recordBefore?'before':'after',roomPollMs,method:'React component integration; jsdom and synthetic fetch; no live account, browser navigation, server or DB.',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
