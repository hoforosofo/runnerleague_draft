import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {players,initialOrder,eligible,teamAt} from './model.mjs';
import {chooseDraftPlayer,POLICY_VERSION} from './draft-ai.mjs';
const origin='http://127.0.0.1:8766',port=8791,base=`http://127.0.0.1:${port}`;
const dir=mkdtempSync(path.join(tmpdir(),'runnerleague-test-'));
let processServer;
async function start(){processServer=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:String(port),DATA_DIR:dir,RECONNECT_GRACE_MS:'1500',AUTO_PICK_DELAY_MS:'100'}});await new Promise((resolve,reject)=>{processServer.stdout.once('data',resolve);processServer.once('error',reject)})}
async function stop(){if(!processServer)return;const promise=new Promise(resolve=>processServer.once('exit',resolve));processServer.kill();await promise;processServer=null}
async function post(url,data){const response=await fetch(base+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});const json=await response.json();assert.ok(response.ok,JSON.stringify(json));return json}
async function client(credentials){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin});let room;await new Promise((resolve,reject)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'auth',code:credentials.code,token:credentials.token})));ws.once('error',reject);ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.type==='state'){room=msg.room;resolve()}})});return {ws,get room(){return room},async cmd(action,data={}){await new Promise(resolve=>setTimeout(resolve,10));const revision=room.revision,requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{ws.off('message',listener);reject(Error('response timeout'))},3000);function listener(raw){const msg=JSON.parse(raw);if(msg.requestId===requestId&&(msg.type==='error'||msg.type==='ack')){clearTimeout(timeout);ws.off('message',listener);resolve(msg)}}ws.on('message',listener);ws.send(JSON.stringify({type:'command',action,data,revision,requestId}))})}}}
const good=msg=>assert.equal(msg.type,'ack',JSON.stringify(msg));
const denied=msg=>assert.equal(msg.type,'error',JSON.stringify(msg));
test('Online authority, sequential claims, complete draft and server restart',async()=>{
 const clients=[];
 try{await start();const owner=await post('/rooms',{name:'방장',autoPick:false}),host=await client(owner);clients.push(host);good(await host.cmd('spectate'));const credentials=[];
 for(let i=0;i<5;i++){const c=await post(`/rooms/${owner.code}/join`,{name:'팀장'+i});credentials.push(c);clients.push(await client(c))}
 denied(await clients[2].cmd('claim',{team:initialOrder[1]}));denied(await clients[1].cmd('start'));denied(await host.cmd('start'));
 for(let i=0;i<5;i++)good(await clients[i+1].cmd('claim',{team:initialOrder[i]}));assert.equal(host.room.state.coachMode,false);assert.equal(host.room.state.turnOwners.length,20);good(await host.cmd('coachMode',{enabled:true}));good(await host.cmd('start'));denied(await host.cmd('pick',{player:'김뿡'}));denied(await clients[2].cmd('pick',{player:'김뿡'}));denied(await clients[1].cmd('order',{from:0,to:4}));
 const staleRevision=clients[1].room.revision;good(await clients[1].cmd('pick',{player:'김뿡'}));const stale=await new Promise(resolve=>{clients[1].ws.once('message',raw=>resolve(JSON.parse(raw)));clients[1].ws.send(JSON.stringify({type:'command',action:'pick',data:{player:'디디디용'},revision:staleRevision,requestId:'stale-test'}))});denied(stale);assert.equal(host.room.state.picks.filter(Boolean).length,1);
 for(let idx=1;idx<25;idx++){const r=host.room,s=r.state,team=s.turnOwners[idx],c=clients[initialOrder.indexOf(team)+1],picked=s.picks.filter(Boolean),p=players.find(p=>eligible(p,team,picked,true));good(await c.cmd('pick',{player:p.id}))}
 assert.equal(host.room.state.picks.filter(Boolean).length,25);denied(await host.cmd('swap',{from:0,to:11}));denied(await clients[1].cmd('reset'));denied(await clients[1].cmd('confirm'));good(await host.cmd('confirm'));good(await host.cmd('tankSwap',{from:initialOrder[0],to:initialOrder[4]}));const final=structuredClone(host.room.state);
 for(const c of clients)c.ws.close();await stop();await start();const restored=await client(owner);clients.push(restored);assert.deepEqual(restored.room.state,final);good(await restored.cmd('edit'));good(await restored.cmd('undo'));assert.equal(restored.room.state.picks.filter(Boolean).length,24);good(await restored.cmd('reset'));assert.equal(restored.room.state.coachMode,false);for(let i=0;i<5;i++)clients.push(await client(credentials[i]));good(await restored.cmd('start'));denied(await clients.at(-5).cmd('pick',{player:'짜누'}));for(let idx=0;idx<20;idx++){const state=restored.room.state,team=state.turnOwners[idx],p=players.find(p=>eligible(p,team,state.picks.filter(Boolean),false));good(await clients.at(-5+initialOrder.indexOf(team)).cmd('pick',{player:p.id}))}good(await restored.cmd('confirm'));assert.equal(restored.room.state.resultsConfirmed,true);
 }finally{for(const c of clients)c.ws.terminate();await stop();rmSync(dir,{recursive:true,force:true})}
});

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){const deadline=Date.now()+35000;while(!check()){if(Date.now()>deadline)throw Error('state timeout');await delay(50)}}
test('Custom order, blank name, absent teams, reconnect grace and offline pause',async()=>{
 const clients=[];try{await start();
 const invalid=await fetch(base+'/rooms',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({order:Array(5).fill(initialOrder[0])})});assert.equal(invalid.status,400);
 const order=[...initialOrder].reverse(),owner=await post('/rooms',{order}),host=await client(owner);clients.push(host);assert.equal(host.room.members[0].name,'참가자');assert.deepEqual(host.room.state.order,order);good(await host.cmd('spectate'));
 const guestToken=await post(`/rooms/${owner.code}/join`,{}),guest=await client(guestToken);clients.push(guest);good(await guest.cmd('claim',{team:order[0]}));good(await host.cmd('start'));guest.ws.close();await delay(800);assert.equal(host.room.state.picks.filter(Boolean).length,0);
 const returned=await client(guestToken);clients.push(returned);await delay(900);assert.equal(host.room.state.picks.filter(Boolean).length,0);assert.equal(returned.room.members.find(m=>m.id===guestToken.memberId).team,order[0]);good(await returned.cmd('pick',{player:'김뿡'}));returned.ws.close();
 await until(()=>host.room.state.picks.filter(Boolean).length===20);assert.equal(host.room.state.picks.filter(p=>p.automatic).length,19);for(const t of order){const roster=host.room.state.picks.filter(p=>p.team===t);assert.equal(roster.filter(p=>players.find(x=>x.id===p.player).role==='damage').length,2);assert.equal(roster.filter(p=>players.find(x=>x.id===p.player).role==='support').length,2)}good(await host.cmd('confirm'));
 const pausedToken=await post('/rooms',{}),paused=await client(pausedToken);clients.push(paused);good(await paused.cmd('spectate'));good(await paused.cmd('start'));paused.ws.close();await delay(1200);const resume=await client(pausedToken);clients.push(resume);assert.equal(resume.room.state.picks.filter(Boolean).length,0);
 }finally{for(const c of clients)c.ws.terminate();await stop();rmSync(dir,{recursive:true,force:true})}
});

test('Community policy: conditional Wolf strategy, deterministic legal complete drafts',()=>{
 const state=(picks=[],order=initialOrder,coachMode=false)=>({picks,order,coachMode});
 const wolfOrder=['둥그레','룩삼','콩콩','푸린','울프'];
 const prefix=ids=>ids.map((player,i)=>({player,team:wolfOrder[i]}));
 const available=state(prefix(['양아지','남봉','인섹','눈꽃']),wolfOrder);
 const before=JSON.stringify(available),first=chooseDraftPlayer(available,'울프');
 assert.equal(first.player.role,'damage');
 assert.ok(['김뿡','뱅','디디디용'].includes(first.player.id));
 assert.equal(JSON.stringify(available),before);
 assert.deepEqual(chooseDraftPlayer(available,'울프'),first);
 available.picks.push({player:first.player.id,team:'울프'});
 assert.ok(eligible(chooseDraftPlayer(available,'울프').player,'울프',available.picks,false));
 const depleted=state(prefix(['김뿡','뱅','디디디용','마뫄']),wolfOrder);
 const a=chooseDraftPlayer(depleted,'울프');assert.ok(['큐베','양아지'].includes(a.player.id));
 depleted.picks.push({player:a.player.id,team:'울프'});
 const b=chooseDraftPlayer(depleted,'울프');assert.deepEqual(new Set([a.player.id,b.player.id]),new Set(['큐베','양아지']));
 // A remaining base healer must remain legal alongside Nam-bong.
 const pairing=state([{player:'남봉',team:'둥그레'},{player:'김뿡',team:'둥그레'},{player:'뱅',team:'둥그레'},...players.filter(p=>p.role==='support'&&!['남봉','담유이'].includes(p.id)).map(p=>({player:p.id,team:'룩삼'}))]);
 assert.equal(chooseDraftPlayer(pairing,'둥그레').player.id,'담유이');
 for(const coachMode of [false,true])for(const order of [initialOrder,wolfOrder,[...initialOrder].reverse()]){
  const s=state([],order,coachMode),count=coachMode?25:20;
  for(let i=0;i<count;i++){
   const t=teamAt(i,order),choice=chooseDraftPlayer(s,t);assert.ok(choice);
   assert.ok(eligible(choice.player,t,s.picks,coachMode));assert.ok(choice.reason);assert.equal(choice.policyVersion,POLICY_VERSION);
   if(choice.player.role==='coach')assert.equal(s.picks.filter(p=>p.team===t).length,4);
   s.picks.push({player:choice.player.id,team:t});
  }
  assert.equal(new Set(s.picks.map(p=>p.player)).size,count);
  for(const t of order){const roster=s.picks.filter(p=>p.team===t).map(p=>players.find(x=>x.id===p.player));assert.equal(roster.filter(p=>p.role==='damage').length,2);assert.equal(roster.filter(p=>p.role==='support').length,2);assert.equal(roster.filter(p=>p.role==='coach').length,coachMode?1:0)}
  const removed=s.picks.pop();const finalChoice=chooseDraftPlayer(s,removed.team);assert.equal(finalChoice.player.id,removed.player);assert.match(finalChoice.reason,/이 선수만|팀 구성을 완성/);assert.doesNotMatch(finalChoice.reason,/남은 스네이크|다음 차례/);
 }
 const custom=state();custom.turnOwners=Array.from({length:20},(_,i)=>teamAt(i,initialOrder));
 [custom.turnOwners[0],custom.turnOwners[1]]=[custom.turnOwners[1],custom.turnOwners[0]];
 assert.ok(chooseDraftPlayer(custom,custom.turnOwners[0]));
 assert.equal(chooseDraftPlayer(state(),'없는 팀'),null);
});

test('User ranking is shared and last team pick never claims a future turn',()=>{
 assert.deepEqual(players.filter(p=>p.role==='damage').map(p=>p.id),['김뿡','뱅','디디디용','마뫄','큐베','엘리','설백','뀨냥냥','정령왕','꼴랑이']);
 assert.deepEqual(players.filter(p=>p.role==='support').map(p=>p.id),['양아지','남봉','눈꽃','아야츠노 유니','인섹','임나은','삐부','서넹','담유이','새담']);
 const s={order:initialOrder,picks:[],coachMode:false};
 for(let i=0;i<20;i++){const team=teamAt(i,s.order),c=chooseDraftPlayer(s,team);if(i>=15)assert.doesNotMatch(c.reason,/남은 스네이크|다음 차례/);s.picks.push({player:c.player.id,team})}
});

test('Reasons are one short sentence without rank labels',()=>{
 const s={order:initialOrder,picks:[],coachMode:false};
 for(let i=0;i<20;i++){const team=teamAt(i,s.order),c=chooseDraftPlayer(s,team);assert.ok(c.reason.length<65);assert.doesNotMatch(c.reason,/순위|[0-9]+위|사용자 지정| · /);s.picks.push({player:c.player.id,team})}
});

test('Tier gaps survive composition bonuses across captain orders',()=>{
 const baseline=['둥그레','룩삼','울프','콩콩','푸린'];
 for(let shift=0;shift<5;shift++){
  const order=[...baseline.slice(shift),...baseline.slice(0,shift)],s={order,picks:[],coachMode:false};
  for(let i=0;i<20;i++){const team=teamAt(i,order),c=chooseDraftPlayer(s,team);s.picks.push({player:c.player.id,team})}
  const at=id=>s.picks.findIndex(p=>p.player===id);
  assert.ok(at('큐베')<at('엘리'),JSON.stringify(s.picks));
  for(const id of ['설백','뀨냥냥','정령왕','꼴랑이'])assert.ok(at('엘리')<at(id));
  assert.ok(at('양아지')<6,'Standout support should be secured by first turn-around in these scenarios');
 }
});
