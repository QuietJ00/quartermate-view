// Stage 2–5 comparison: original React components, synthetic fetch, virtual DOM/time.
// No server, live credentials, Cloudflare API, or application-source edits.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(root,'package.json'));
const {build}=require('esbuild');
const runtime=process.env.QUARTERMATE_MEASUREMENT_RUNTIME;
if(!runtime)throw new Error('Set QUARTERMATE_MEASUREMENT_RUNTIME to an isolated directory with jsdom and @sinonjs/fake-timers installed.');
const runtimeRequire=createRequire(path.join(path.resolve(runtime),'package.json'));
const {JSDOM,VirtualConsole}=runtimeRequire('jsdom');
const FakeTimers=runtimeRequire('@sinonjs/fake-timers');
const baseline=process.env.QUARTERMATE_MEASUREMENT_EXPECTATION==='baseline';
const adaptive=!baseline&&process.env.QUARTERMATE_MEASUREMENT_EXPECTATION!=='stage3';
const bundle=await build({absWorkingDir:root,stdin:{contents:`
 import React,{act,StrictMode} from 'react';
 import {createRoot} from 'react-dom/client';
 import Home from './app/page';
 import {TeamHub} from './components/team-hub';
 import {TournamentHub,TournamentPage} from './components/tournament-ui';
 import {MotionSystem} from './components/motion-system';
 import {createDemoState} from './lib/football';
 import {DEFAULT_TOURNAMENT_RULES} from './lib/tournament/types';
 let root;
 window.__measure={act,createDemoState,DEFAULT_TOURNAMENT_RULES,
 async mount(name,strict=false){root=createRoot(document.getElementById('root'));const C={home:Home,hub:TeamHub,tournamentHub:TournamentHub,tournament:TournamentPage}[name];const content=<MotionSystem><C id="measure-cup"/></MotionSystem>;await act(async()=>root.render(strict?<StrictMode>{content}</StrictMode>:content));},
 async unmount(){await act(async()=>root.unmount());}};
 `,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},loader:{'.css':'empty'},logLevel:'silent'});

const results=[];
export async function setup(screen,{live=false,strict=false,allowNavigation=false,beforeMount}={}){
 const errors=[],navigation=[],vc=new VirtualConsole();
 vc.on('jsdomError',e=>{if(allowNavigation&&/Not implemented: navigation/.test(e.message))navigation.push(e.message);else errors.push(e.message);});vc.on('error',(...args)=>errors.push(args.map(String).join(' ')));
 const dom=new JSDOM('<div id="root"></div>',{url:`http://127.0.0.1/${screen==='home'?'?room=MEASUREA':screen==='tournament'?'tournaments/measure-cup':'teams'}`,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;w.IS_REACT_ACT_ENVIRONMENT=true;w.process={env:{}};
 w.MessageChannel=class{constructor(){const port={onmessage:null};this.port1=port;this.port2={postMessage:()=>setImmediate(()=>port.onmessage?.())};}};
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:true,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 let visibility='visible';Object.defineProperty(w.document,'visibilityState',{get:()=>visibility});
 const clock=FakeTimers.withGlobal(w).install({now:Date.UTC(2026,9,21,12),toFake:['Date','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','performance']});
 const requests=[];let active=0,maxActive=0,behavior=null,signedIn=true;
 w.eval(bundle.outputFiles[0].text);
 const state=w.__measure.createDemoState();state.teamName='측정용 합성 팀';
 if(live){state.match.status='live';state.match.currentQuarter=1;state.match.clocks={1:{elapsedSeconds:0,startedAt:new Date(clock.now).toISOString()}};}
 let room={code:'MEASUREA',revision:1,state,role:'leader',permissions:{canManage:true,canRecord:true,isCaptain:true},pendingJoinCount:0};
 let account={id:'measure-user',nickname:'측정 계정',needsConsent:false,policyVersion:'2026-10-21'};
 const t={id:'measure-cup',name:'측정용 합성 대회',primaryColor:'#225d50',description:'',organizer:'QA',status:'active',format:'knockout',startDate:'2026-10-21',endDate:'2026-10-22',maxTeams:8,teams:[],matches:[],groups:[],rules:w.__measure.DEFAULT_TOURNAMENT_RULES,audit:[],notices:[],requests:[],admins:[],invitations:[]};
 const clone=x=>JSON.parse(JSON.stringify(x));
 w.fetch=async(input,options={})=>{
  const url=new URL(String(input),w.location.href),method=options.method||'GET';
  const entry={at:clock.now,method,path:url.pathname,query:url.search,activeAtStart:++active};requests.push(entry);maxActive=Math.max(maxActive,active);
  let status=200,data;
  if(url.pathname==='/api/auth/session')data={user:signedIn?{userId:'measure-user',displayName:'측정 계정',provider:'kakao'}:null,kakaoConfigured:false};
  else if(url.pathname==='/api/auth/config')data={configured:false,signupOpen:false};
  else if(url.pathname==='/api/account'){if(method==='PATCH')account={...account,...JSON.parse(options.body)};data=clone(account);}
  else if(url.pathname==='/api/workspace')data={teams:[{code:'MEASUREA',name:state.teamName,description:'',players:state.players.length,role:'owner'}],nextCursor:null};
  else if(url.pathname==='/api/recruitment')data={players:[],counts:{attending:0,absent:0,maybe:0,unvoted:0}};
  else if(url.pathname==='/api/room'){
   if(method==='PUT'){const body=JSON.parse(options.body);room={...room,state:body.state,revision:room.revision+1};}
   data=url.searchParams.get('code')==='MEASUREB'?{...clone(room),code:'MEASUREB',state:{...clone(room.state),teamName:'측정 B 팀'}}:clone(room);
  }else if(url.pathname==='/api/tournaments')data=url.searchParams.has('id')?{tournament:clone(t),revision:1,serverNow:clock.now,permissions:{userId:'measure-user',manage:['settings','teams','schedule','operate'],memberTeams:[],representativeTeams:[],scorerMatchIds:[],ownPlayers:{}},teams:[],publicOnly:false}:url.searchParams.has('room')?{matches:[]}:{tournaments:[]};
  else if(url.pathname==='/api/clock')data=clone(room);
  else if(url.pathname==='/api/telemetry')data={ok:true};
  else if(url.pathname==='/api/auth/logout')data={ok:true};
  else {active--;errors.push(`Unexpected local fixture request ${method} ${url.pathname}`);throw new Error(errors.at(-1));}
  if(!signedIn&&['/api/room','/api/account','/api/workspace'].includes(url.pathname)){status=401;data={error:'합성 비로그인'};}
  const custom=behavior?.({entry,data:clone(data)});
  if(custom?.serverRoom)room=clone(custom.serverRoom);
  if(custom?.delay)await new Promise((resolve,reject)=>{
   const signal=custom.ignoreAbort?undefined:options.signal;
   const aborted=()=>{w.clearTimeout(timer);entry.aborted=true;entry.finishedAt=clock.now;active--;reject(signal.reason);};
   const timer=w.setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve();},custom.delay);
   if(signal?.aborted)aborted();else signal?.addEventListener('abort',aborted,{once:true});
  });
  if(custom?.status)status=custom.status;
  if(custom?.data)data=custom.data;
  if(url.pathname==='/api/auth/logout'&&status===200)signedIn=false;
  entry.finishedAt=clock.now;entry.status=status;active--;
  return {ok:status>=200&&status<300,status,json:async()=>clone(data)};
 };
 async function flush(){await w.__measure.act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});}
 async function advance(ms){await w.__measure.act(async()=>{await clock.tickAsync(ms);});await flush();}
 async function event(type,target=w){await w.__measure.act(async()=>target.dispatchEvent(new w.Event(type)));await flush();}
 async function click(text){const b=[...w.document.querySelectorAll('button')].find(x=>x.textContent.trim()===text||x.getAttribute('aria-label')===text);assert.ok(b,`Button missing: ${text}`);await w.__measure.act(async()=>b.click());await flush();}
 beforeMount?.({setBehavior:f=>behavior=f,setRoom:value=>room=clone(value),getRoom:()=>clone(room)});
 await w.__measure.mount(screen,strict);await flush();
 assert.equal(errors.length,0,errors.join('\n'));
 function counts(){return Object.fromEntries([...new Set(requests.map(r=>`${r.method} ${r.path}`))].sort().map(k=>[k,requests.filter(r=>`${r.method} ${r.path}`===k).length]));}
 return {w,clock,requests,errors,navigation,flush,advance,event,click,counts,setVisibility:v=>visibility=v,setBehavior:f=>behavior=f,setRoom:value=>room=clone(value),setSignedIn:value=>signedIn=value,async remount(url){await w.__measure.unmount();dom.reconfigure({url:new URL(url,w.location.origin).href});await w.__measure.mount(screen,strict);await flush();},reset(){requests.length=0;maxActive=active;},get maxActive(){return maxActive;},get room(){return room;},async close(){await w.__measure.unmount();clock.uninstall();dom.window.close();assert.equal(errors.length,0,errors.join('\n'));}};
}
if(process.env.QUARTERMATE_MEASUREMENT_LIBRARY!=='1'){
for(const [screen,opts]of [['hub',{}],['home',{}],['home',{view:'선수단 관리'}],['home',{view:'시즌 분석'}],['home',{live:true}],['home',{live:true,lineup:true}],['tournament',{}],['tournamentHub',{}]]){
 const m=await setup(screen,opts);
 if(opts.view)await m.click(opts.view);
 if(opts.lineup){const button=m.w.document.querySelector('button.timeline-match-link');assert.ok(button);await m.w.__measure.act(async()=>button.click());await m.flush();}
 const initial=m.counts();m.reset();await m.advance(60_000);const steady=m.counts();
 m.reset();m.setVisibility('hidden');await m.event('visibilitychange',m.w.document);await m.advance(60_000);const hidden=m.counts();
 m.reset();m.setVisibility('visible');await m.event('visibilitychange',m.w.document);await m.event('focus');const resume=m.counts();
 const expected=screen==='hub'?{'GET /api/account':4,'GET /api/workspace':4}:screen==='tournament'?{'GET /api/tournaments':12}:screen==='tournamentHub'?{}:{'GET /api/room':adaptive&&!opts.live?(opts.view==='시즌 분석'?2:4):20,...(!opts.lineup&&opts.view!=='선수단 관리'?{'GET /api/tournaments':4}:{})};
 assert.deepEqual(steady,expected);assert.deepEqual(hidden,{});
 assert.deepEqual(resume,screen==='hub'?{'GET /api/account':baseline?2:1,'GET /api/workspace':baseline?2:1}:screen==='home'?{'GET /api/room':baseline?2:1}:{});
 results.push({scenario:`${screen}${opts.live?'-live':''}${opts.lineup?'-lineup':''}${opts.view?'-'+opts.view:''}`,initial,steady60Seconds:steady,hidden60Seconds:hidden,resumeVisibilityAndFocus:resume});await m.close();
}
{
 const m=await setup('home',{live:true});m.setBehavior(({entry})=>entry.path==='/api/room'?{delay:4500}:null);m.reset();await m.advance(10_000);
 const rooms=m.requests.filter(r=>r.path==='/api/room');
 if(baseline)assert.ok(rooms.some((r,i)=>i&&r.at<rooms[i-1].finishedAt),'Expected overlapping baseline polls');
 else{assert.equal(rooms.length,2);assert.equal(m.maxActive,1);}
 results.push({scenario:'home-slow-4500ms',roomRequests:rooms.length,maxConcurrentRequests:m.maxActive,timeline:rooms});await m.advance(5000);await m.close();
}
{
 const m=await setup('home',{live:true});m.setBehavior(({entry})=>entry.path==='/api/room'?{status:500,data:{error:'synthetic error'}}:null);m.reset();await m.advance(15_000);
 assert.equal(m.requests.filter(r=>r.path==='/api/room').length,5);
 results.push({scenario:'home-errors-15s',counts:m.counts(),roomRequestOffsets:m.requests.filter(r=>r.path==='/api/room').map(r=>r.at-m.requests[0].at)});await m.close();
}
{
 const m=await setup('home',{live:true});await m.click('설정');await m.click('팀 정보 · 기본 경기 설정');
 const input=m.w.document.querySelector('input[name="teamName"]');assert.ok(input);input.value='저장 후 합성 팀';const form=input.closest('form');
 // Request a same-revision snapshot before saving. The fixture snapshots at dispatch.
 m.setBehavior(({entry,data})=>entry.path==='/api/room'&&entry.method==='GET'?{delay:4500,data}:entry.method==='PUT'?{delay:1000}:null);
 m.reset();await m.advance(3000);
 await m.w.__measure.act(async()=>form.dispatchEvent(new m.w.Event('submit',{bubbles:true,cancelable:true})));await m.flush();
 await m.advance(5000);
 assert.equal(m.room.revision,2);assert.equal(m.w.document.querySelector('.team-switch strong').textContent,'저장 후 합성 팀');
 results.push({scenario:'home-get-before-save',timeline:m.requests.filter(r=>r.path==='/api/room'),serverRevision:m.room.revision,savedNameStillDisplayed:true,saveModalClosed:!m.w.document.querySelector('input[name="teamName"]')});await m.close();
}
{
 const m=await setup('home',{live:true});await m.click('설정');await m.click('팀 정보 · 기본 경기 설정');
 const form=m.w.document.querySelector('input[name="teamName"]').closest('form');
 m.setBehavior(({entry})=>entry.method==='PUT'?{delay:7000}:null);m.reset();
 await m.w.__measure.act(async()=>form.dispatchEvent(new m.w.Event('submit',{bubbles:true,cancelable:true})));await m.flush();await m.advance(6000);
 assert.equal(m.requests.filter(r=>r.path==='/api/room'&&r.method==='GET').length,0);
 results.push({scenario:'home-save-in-flight-6s',counts:m.counts(),pollSuppressionPreserved:true});await m.advance(2000);await m.close();
}
for(const screen of ['home','hub']){
 const m=await setup(screen,{live:screen==='home'});m.reset();await m.advance(screen==='home'?3000:15000);await m.event('visibilitychange',m.w.document);await m.event('focus');
 const expected=screen==='home'?{'GET /api/room':baseline?3:1}:{'GET /api/account':baseline?3:1,'GET /api/workspace':baseline?3:1};
 assert.deepEqual(m.counts(),expected);results.push({scenario:`${screen}-timer-and-resume-same-time`,counts:m.counts()});await m.close();
}
if(!baseline){
 const m=await setup('hub');await m.advance(500);m.setBehavior(({entry})=>['/api/account','/api/workspace'].includes(entry.path)?{delay:20000}:null);m.reset();
 await m.event('focus');await m.advance(30000);
 // Each 15 s tick that meets an expiring hung read retries instead of joining it (stage 6).
 assert.equal(m.maxActive,2);assert.deepEqual(m.counts(),{'GET /api/account':3,'GET /api/workspace':3});
 results.push({scenario:'hub-slow-20s',counts:m.counts(),maxConcurrentRequests:m.maxActive});await m.close();
}
if(!baseline){
 const m=await setup('home',{live:true});await m.click('설정');await m.click('팀 정보 · 기본 경기 설정');
 let gets=0;
 m.setBehavior(({entry,data})=>{
  if(entry.path!=='/api/room')return null;
  if(entry.method==='GET')return {delay:++gets===1?4500:100,data};
  if(entry.method==='PUT')return {status:409,data:{error:'합성 충돌'},serverRoom:{...m.room,revision:3,state:{...m.room.state,teamName:'다른 기기의 최신 팀'}}};
 });
 m.reset();await m.advance(3000);const form=m.w.document.querySelector('input[name="teamName"]').closest('form');
 await m.w.__measure.act(async()=>form.dispatchEvent(new m.w.Event('submit',{bubbles:true,cancelable:true})));await m.flush();await m.advance(5000);
 const reads=m.requests.filter(r=>r.path==='/api/room'&&r.method==='GET');
 assert.equal(gets,3);assert.equal(reads[0].at,reads[1].at);assert.equal(reads[0].aborted,true);
 assert.equal(m.w.document.querySelector('.team-switch strong').textContent,'다른 기기의 최신 팀');
 results.push({scenario:'home-forced-conflict-refresh',timeline:m.requests.filter(r=>r.path==='/api/room'),newSnapshotPreserved:true});await m.close();
}
if(!baseline){
 const m=await setup('hub');await m.advance(500);
 m.setBehavior(({entry})=>entry.path==='/api/account'&&entry.method==='GET'?{delay:4500}:entry.path==='/api/account'&&entry.method==='PATCH'?{delay:1000}:null);m.reset();
 await m.event('focus');const input=m.w.document.querySelector('input[name="nickname"]');input.value='새로운 합성 닉네임';
 await m.w.__measure.act(async()=>input.closest('form').dispatchEvent(new m.w.Event('submit',{bubbles:true,cancelable:true})));await m.flush();await m.advance(5000);
 assert.ok([...m.w.document.querySelectorAll('.hub-header button')].some(b=>b.textContent.includes('새로운 합성 닉네임')));
 results.push({scenario:'hub-mutation-invalidates-old-account',counts:m.counts(),newNicknamePreserved:true});await m.close();
}
if(!baseline){
 const m=await setup('home',{live:true});m.setBehavior(({entry})=>entry.path==='/api/room'?{delay:45000}:null);m.reset();await m.advance(35000);
 const reads=m.requests.filter(r=>r.path==='/api/room');assert.equal(reads.length,3);assert.equal(reads[0].aborted,true);assert.equal(reads[1].aborted,true);
 const maxConcurrentRoomRequests=Math.max(...reads.map(r=>reads.filter(other=>other.at<=r.at&&(other.finishedAt??Infinity)>r.at).length));assert.equal(maxConcurrentRoomRequests,1);
 results.push({scenario:'home-timeout-retries',roomRequests:reads.length,maxConcurrentRoomRequests,retryAfterTimeout:true});await m.close();
}
if(!baseline){
 const m=await setup('hub');await m.advance(500);m.setBehavior(({entry})=>entry.path==='/api/account'?{status:500,data:{error:'합성 오류'}}:entry.path==='/api/workspace'?{delay:45000}:null);m.reset();await m.event('focus');await m.advance(16000);
 const workspaces=m.requests.filter(r=>r.path==='/api/workspace');assert.equal(workspaces.length,2);assert.ok(workspaces.every(r=>r.aborted));
 results.push({scenario:'hub-partial-failure-cleans-up',counts:m.counts(),unfinishedWorkspaceReadsAborted:true});await m.close();
}
if(!baseline){
 const m=await setup('home',{live:true});let calls=0;m.setBehavior(({entry})=>entry.path==='/api/room'&&++calls===1?{delay:45000}:null);m.reset();await m.advance(22000);
 const reads=m.requests.filter(r=>r.path==='/api/room');assert.equal(reads[0].aborted,true);assert.ok(reads.some(r=>r.status===200));assert.ok(!m.w.document.body.textContent.includes('서버 응답이 지연되고 있습니다.'));
 results.push({scenario:'home-success-after-timeout',roomRequests:reads.length,normalResponsesResume:true,timeoutMessageCleared:true});await m.close();
}
const output=process.argv[2]||path.join(root,'work/request-measurement-results.json');fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({expectation:baseline?'baseline':adaptive?'stage5':'stage3',method:'Original components mounted in React without StrictMode; jsdom; fake browser time; synthetic fetch only. Excludes network, SSR, assets, DB and layout.',versions:{node:process.version,react:require('react/package.json').version,esbuild:require('esbuild/package.json').version,jsdom:runtimeRequire('jsdom/package.json').version,fakeTimers:runtimeRequire('@sinonjs/fake-timers/package.json').version},results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
}
