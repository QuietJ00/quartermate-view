// Stage 5: real React components, synthetic fetch, virtual time. No live services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
process.env.QUARTERMATE_MEASUREMENT_LIBRARY='1';
const {setup}=await import('./measure-client-requests.mjs');
const results=[];
const reads=m=>m.requests.filter(r=>r.path==='/api/room'&&r.method==='GET');
const name=m=>m.w.document.querySelector('.team-switch strong')?.textContent;
const updated=(m,patch,teamName)=>({...m.room,revision:m.room.revision+1,state:{...m.room.state,...(teamName?{teamName}:{}),match:{...m.room.state.match,...patch}}});
async function lineup(m){const b=m.w.document.querySelector('button.timeline-match-link');assert.ok(b);await m.w.__measure.act(async()=>b.click());await m.flush();}
async function scenario(label,options,run){
 process.stderr.write(`Running ${label}\n`);
 const m=await setup('home',options);
 try{await run(m);results.push({scenario:label,passed:true,requests:m.counts(),roomReadTimes:reads(m).map(r=>r.at)});}
 finally{await m.close();}
}
await scenario('normal-screen-detects-remote-start-then-finish',{},async m=>{
 m.reset();m.setRoom(updated(m,{status:'live'},'다른 기기에서 경기 시작'));
 await m.advance(14999);assert.equal(reads(m).length,0);
 await m.advance(1);assert.equal(name(m),'다른 기기에서 경기 시작');
 await m.advance(2999);assert.equal(reads(m).length,1);
 await m.advance(1);assert.equal(reads(m).length,2);
 m.setRoom(updated(m,{status:'finished'},'다른 기기에서 경기 종료'));
 await m.advance(3000);assert.equal(name(m),'다른 기기에서 경기 종료');
 await m.advance(14999);assert.equal(reads(m).length,3);
 await m.advance(1);assert.equal(reads(m).length,4);
});
await scenario('history-detects-remote-start-within-30s',{},async m=>{
 await m.click('시즌 분석');m.reset();m.setRoom(updated(m,{status:'live'},'기록 화면에서도 시작 감지'));
 await m.advance(29999);assert.equal(reads(m).length,0);
 await m.advance(1);assert.equal(name(m),'기록 화면에서도 시작 감지');
 await m.advance(3000);assert.equal(reads(m).length,2);
 m.setRoom(updated(m,{status:'finished'}));await m.advance(3000);m.reset();
 await m.advance(29999);assert.equal(reads(m).length,0);
 await m.advance(1);assert.equal(reads(m).length,1);
});
for(const tab of ['선수단 관리','시즌 분석','설정']){
 await scenario(`live-keeps-3s-on-${tab}`,{live:true},async m=>{
  await m.click(tab);m.reset();await m.advance(9000);assert.equal(reads(m).length,3);
 });
}
await scenario('paused-live-match-keeps-3s',{live:true,beforeMount:({getRoom,setRoom})=>{
 const r=getRoom();r.state.match.clocks[1].startedAt=null;setRoom(r);
}},async m=>{m.reset();await m.advance(9000);assert.equal(reads(m).length,3);});
await scenario('local-kickoff-applies-response-and-switches-immediately',{},async m=>{
 await lineup(m);const next=updated(m,{status:'live',clocks:{1:{elapsedSeconds:0,startedAt:new Date(m.clock.now).toISOString()}}});
 m.setBehavior(({entry})=>entry.path==='/api/clock'?{data:next,serverRoom:next}:null);m.reset();
 await m.click('1쿼터 시작');assert.ok(m.w.document.querySelector('.live-badge.is-live'));assert.equal(reads(m).length,0);
 await m.advance(2999);assert.equal(reads(m).length,0);
 await m.advance(1);assert.equal(reads(m).length,1);
});
await scenario('local-final-whistle-applies-response-and-slows-down',{live:true,beforeMount:({getRoom,setRoom})=>{
 const r=getRoom();r.state.match.currentQuarter=4;r.state.match.completedQuarters=[1,2,3];r.state.match.clocks={4:r.state.match.clocks[1]};setRoom(r);
}},async m=>{
 await lineup(m);const next=updated(m,{status:'finished',completedQuarters:[1,2,3,4],clocks:{4:{elapsedSeconds:1200,startedAt:null}}});
 m.setBehavior(({entry})=>entry.path==='/api/clock'?{data:next,serverRoom:next}:null);m.reset();
 await m.click('4쿼터 종료');assert.ok(!m.w.document.querySelector('.live-badge.is-live'));assert.equal(reads(m).length,0);
 await m.advance(14999);assert.equal(reads(m).length,0);
 await m.advance(1);assert.equal(reads(m).length,1);
});
await scenario('hidden-remote-start-refreshes-on-resume-once',{},async m=>{
 await m.click('시즌 분석');m.reset();m.setVisibility('hidden');await m.event('visibilitychange',m.w.document);
 m.setRoom(updated(m,{status:'live'},'복귀 즉시 최신 경기'));await m.advance(120000);assert.deepEqual(m.counts(),{});
 m.setVisibility('visible');await m.event('visibilitychange',m.w.document);await m.event('focus');
 assert.equal(name(m),'복귀 즉시 최신 경기');assert.equal(reads(m).length,1);
 await m.advance(3000);assert.equal(reads(m).length,2);
});
await scenario('same-status-response-does-not-postpone-next-poll',{},async m=>{
 m.reset();await m.advance(1000);await m.event('focus');assert.equal(reads(m).length,1);
 await m.advance(14000);assert.equal(reads(m).length,2);
});
await scenario('tab-switches-clean-up-obsolete-timers',{},async m=>{
 for(let i=0;i<4;i++){await m.click('시즌 분석');await m.click('경기 일정');}
 m.reset();await m.advance(60000);assert.equal(reads(m).length,4);
 await m.click('시즌 분석');m.reset();await m.advance(60000);assert.equal(reads(m).length,2);
});
await scenario('normal-save-suppresses-polls-and-displays-response-immediately',{},async m=>{
 await m.click('설정');await m.click('팀 정보 · 기본 경기 설정');const input=m.w.document.querySelector('input[name="teamName"]');input.value='저장 즉시 반영';
 m.setBehavior(({entry})=>entry.method==='PUT'?{delay:17000}:null);m.reset();
 await m.w.__measure.act(async()=>input.closest('form').dispatchEvent(new m.w.Event('submit',{bubbles:true,cancelable:true})));await m.flush();
 await m.advance(16999);assert.equal(reads(m).length,0);assert.notEqual(name(m),'저장 즉시 반영');
 await m.advance(1);assert.equal(name(m),'저장 즉시 반영');assert.equal(reads(m).length,0);
 await m.advance(13000);assert.equal(reads(m).length,1);
});
await scenario('vote-refreshes-room-immediately-without-waiting-15s',{beforeMount:({getRoom,setRoom})=>{
 const r=getRoom();r.ownPlayerId='player-1';r.state.match.recruitment={token:'synthetic-vote',open:true,responses:{}};setRoom(r);
}},async m=>{
 const next=updated(m,{},'투표 직후 최신 팀');
 next.state.match.recruitment.responses['player-1']={status:'attending',availableFrom:1,availableUntil:4,updatedAt:new Date(m.clock.now).toISOString()};
 m.setBehavior(({entry})=>entry.path==='/api/recruitment'&&entry.method==='POST'?{serverRoom:next,data:{ok:true}}:null);m.reset();
 await m.click('참가');assert.equal(name(m),'투표 직후 최신 팀');assert.equal(reads(m).length,1);
 assert.ok(m.w.document.querySelector('.fixture-rsvp-choice.attending[aria-pressed="true"]'));
 await m.advance(14999);assert.equal(reads(m).length,1);await m.advance(1);assert.equal(reads(m).length,2);
});
for(const [tab,interval] of [['선수단 관리',15000],['시즌 분석',30000]]){
 await scenario(`failed-read-recovers-on-${tab}`,{},async m=>{
  await m.click(tab);m.setBehavior(({entry})=>entry.path==='/api/room'?{status:500,data:{error:'합성 일시 오류'}}:null);m.reset();
  await m.advance(interval);assert.equal(reads(m).length,1);assert.equal(reads(m)[0].status,500);assert.equal(name(m),'측정용 합성 팀');
  m.setBehavior(null);m.setRoom(updated(m,{},'오류 후 정상 회복'));await m.advance(interval);
  assert.equal(reads(m).length,2);assert.equal(reads(m)[1].status,200);assert.equal(name(m),'오류 후 정상 회복');
 });
}
await scenario('history-hung-read-times-out-and-retries',{},async m=>{
 await m.click('시즌 분석');m.setBehavior(({entry})=>entry.path==='/api/room'?{delay:45000}:null);m.reset();
 await m.advance(30000);assert.equal(reads(m).length,1);await m.advance(15000);assert.equal(reads(m)[0].aborted,true);
 m.setBehavior(null);await m.advance(15000);assert.equal(reads(m).length,2);assert.equal(reads(m)[1].status,200);
});
const output=process.argv[2]||'work/request-polling-stage5.json';fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({method:'Real React components; synthetic accounts, responses and virtual time. No network, SSR, assets, production DB, or actual multi-account browser verification.',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
