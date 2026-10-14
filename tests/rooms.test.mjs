import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from '../cloudflare-server/node_modules/miniflare/dist/src/index.js';
import {build} from '../cloudflare-server/node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initialOrder,players,eligible} from '../shared/model.mjs';
import {initial,command,normalizeRoom} from '../cloudflare-server/room-core.mjs';
const bundle=await build({entryPoints:[new URL('../cloudflare-server/worker.mjs',import.meta.url).pathname],bundle:true,format:'esm',platform:'neutral',external:['cloudflare:workers','node:*'],write:false});
const origin='https://hoforosofo.github.io';
const options={name:'runnerleague-test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],durableObjects:{ROOMS:{className:'DraftRoom',useSQLite:true},LOBBY:{className:'MatchLobby',useSQLite:true}},bindings:{ALLOWED_ORIGINS:origin}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(check())return;await pause(20);}throw Error('Timed out waiting for state');}
async function post(mf,url,data={},expected=201){const response=await mf.dispatchFetch('http://localhost'+url,{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(data)});const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;}
async function client(mf,c){
 const response=await mf.dispatchFetch(`http://localhost/ws?code=${c.code}`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(response.status,101);
 const ws=response.webSocket;ws.accept();let room;const replies=new Map(),errors=[];
 ws.addEventListener('message',event=>{if(event.data==='pong'){replies.set('pong',true);return;}const msg=JSON.parse(event.data);if(msg.type==='state')room=msg.room;if(msg.requestId)replies.set(msg.requestId,msg);if(msg.type==='error')errors.push(msg.message);});
 ws.send(JSON.stringify({type:'auth',code:c.code,token:c.token}));await until(()=>room||errors.length);assert.ok(room,errors.join());
 return {ws,c,get room(){return room;},async cmd(action,data={},revision){const id=crypto.randomUUID();ws.send(JSON.stringify({type:'command',requestId:id,revision:revision??room.revision,action,data}));await until(()=>replies.has(id));return replies.get(id);},async pong(){ws.send('ping');await until(()=>replies.has('pong'));},errors};
}
const good=m=>assert.equal(m.type,'ack',JSON.stringify(m));
const denied=m=>assert.equal(m.type,'error',JSON.stringify(m));
async function manualRoom(mf){const host=await post(mf,'/rooms',{autoPick:false,turnLimitSeconds:1}),clients=[await client(mf,host)];for(let i=1;i<5;i++)clients.push(await client(mf,await post(mf,`/rooms/${host.code}/join`)));for(let i=0;i<5;i++){await pause(30);good(await clients[i].cmd('claim',{team:initialOrder[i]}));}await pause(30);return clients;}

test('Legacy time settings never impose a turn deadline',()=>{
 const state=initial();state.started=true;state.turnTimer={index:0,team:'룩삼',deadline:Date.now()-1};
 const m={id:'captain',team:'룩삼'},r={state,members:[m],sockets:new Map(),deferEmit:true,revision:0};
 command(r,m,'pick',{player:'김뿡'});assert.equal(state.picks[0].player,'김뿡');assert.equal(state.turnTimer,null);
});

test('Routes validate origin, method, token and body; response is CORS-enabled',async()=>{
 const mf=new Miniflare(options);try{
  let response=await mf.dispatchFetch('http://localhost/health',{headers:{Origin:origin}});assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  response=await mf.dispatchFetch('http://localhost/rooms',{method:'POST',headers:{Origin:'https://bad.example'},body:'{}'});assert.equal(response.status,403);
  response=await mf.dispatchFetch('http://localhost/rooms',{method:'OPTIONS',headers:{Origin:origin}});assert.equal(response.status,204);
  response=await mf.dispatchFetch('http://localhost/rooms',{method:'POST',headers:{Origin:origin},body:'not json'});assert.equal(response.status,400);
  response=await mf.dispatchFetch('http://localhost/admit',{method:'POST',body:'{}'});assert.equal(response.status,404);
  const c=await post(mf,'/rooms');const peer=await client(mf,c);assert.equal(peer.room.members[0].name,'참가자');assert.ok(!('tokenHash' in peer.room.members[0]));
  await peer.pong();await post(mf,`/rooms/${c.code}/leave`,{token:'wrong'},200);assert.equal(peer.room.members.length,1);
  await post(mf,`/rooms/${c.code}/leave`,{token:c.token},200);await post(mf,`/rooms/${c.code}/join`,{},404);
 }finally{await mf.dispose();}
});

test('Ordinary rooms remain unlimited, fixed-order, editable and fully legal',async()=>{
 const mf=new Miniflare(options);try{
  const clients=await manualRoom(mf),host=clients[0];
  denied(await clients[1].cmd('start'));denied(await host.cmd('order',{order:[...initialOrder].reverse()}));denied(await host.cmd('turnLimit',{seconds:1}));
  good(await host.cmd('start'));assert.equal(host.room.state.turnTimer,null);assert.equal(host.room.state.turnLimitMs,0);
  await pause(1100);assert.equal(host.room.state.picks.filter(Boolean).length,0);
  denied(await host.cmd('pick',{player:'김뿡'},-1));good(await host.cmd('pick',{player:'김뿡'}));denied(await host.cmd('pick',{player:'뱅'}));
  for(let i=1;i<20;i++){
   const room=host.room,team=room.state.turnOwners[i],peer=clients[initialOrder.indexOf(team)],p=players.find(p=>eligible(p,team,room.state.picks.filter(Boolean),false));
   await pause(25);good(await peer.cmd('pick',{player:p.id}));await until(()=>host.room.state.picks.filter(Boolean).length===i+1);
  }
  assert.equal(new Set(host.room.state.picks.map(p=>p.player)).size,20);assert.equal(host.room.state.turnTimer,null);
  good(await host.cmd('confirm'));assert.equal(host.room.state.resultsConfirmed,true);denied(await host.cmd('undo'));good(await host.cmd('tankSwap',{from:'룩삼',to:'울프'}));
  good(await host.cmd('edit'));good(await host.cmd('undo'));assert.equal(host.room.state.resultsConfirmed,false);assert.equal(host.room.state.turnTimer,null);
  good(await host.cmd('reset'));assert.equal(host.room.state.turnLimitMs,0);assert.equal(host.room.state.autoPick,false);assert.deepEqual(host.room.state.order,initialOrder);
  await pause(30);good(await host.cmd('spectate'));good(await host.cmd('claim',{team:'룩삼'}));
 }finally{await mf.dispose();}
});

test('Random matching endpoint is gone; joining defaults to watching and never auto-starts',async()=>{
 const mf=new Miniflare(options);try{
  await post(mf,'/matchmaking',{},404);
  const c=await post(mf,'/rooms'),host=await client(mf,c);
  assert.equal(host.room.members[0].spectator,true);assert.equal(host.room.members[0].team,null);
  const guests=await Promise.all(Array.from({length:5},()=>post(mf,`/rooms/${c.code}/join`)));
  const peers=[];for(const g of guests)peers.push(await client(mf,g));
  await until(()=>host.room.members.length===6);
  assert.ok(host.room.members.every(m=>m.spectator&&!m.team));assert.equal(host.room.state.started,false);assert.equal(host.room.state.turnTimer,null);
  good(await peers[0].cmd('claim',{team:'룩삼'}));await until(()=>host.room.members.some(m=>m.team==='룩삼'));
  good(await host.cmd('start'));assert.equal(host.room.state.started,true);
  const later=await post(mf,`/rooms/${c.code}/join`),watcher=await client(mf,later);
  assert.equal(watcher.room.members.find(m=>m.id===later.memberId).spectator,true);
  denied(await watcher.cmd('pick',{player:'김뿡'}));
 }finally{await mf.dispose();}
});

test('Vacant AI picks finish without an intentional delay and preserve quotas',async()=>{
 const mf=new Miniflare(options);try{
  const c=await post(mf,'/rooms'),peer=await client(mf,c);good(await peer.cmd('spectate'));const start=Date.now();good(await peer.cmd('start'));await until(()=>peer.room.state.picks.filter(Boolean).length===20,10000);
  assert.ok(Date.now()-start<10000);const picks=peer.room.state.picks;assert.equal(new Set(picks.map(p=>p.player)).size,20);
  for(const team of initialOrder)for(const role of ['damage','support'])assert.equal(picks.filter(p=>p.team===team&&players.find(x=>x.id===p.player).role===role).length,2);
  assert.ok(picks.every(p=>p.automatic&&!p.reason));
 }finally{await mf.dispose();}
});

test('Hibernation restores socket attachments, revision and state without disconnecting players',async()=>{
 const mf=new Miniflare(options);try{
  const c=await post(mf,'/rooms',{autoPick:false}),peer=await client(mf,c);good(await peer.cmd('claim',{team:'룩삼'}));const revision=peer.room.revision;
  await mf.unsafeEvictDurableObject('runnerleague-test','DraftRoom',{name:c.code,webSockets:'hibernate'});
  await peer.pong();good(await peer.cmd('spectate'));assert.equal(peer.room.revision,revision+1);assert.equal(peer.room.members[0].team,null);assert.equal(peer.room.members[0].connected,true);
  good(await peer.cmd('claim',{team:'울프'}));
 }finally{await mf.dispose();}
});

test('Stored rooms survive runtime restart; token reconnect restores the selected captain',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'rl-cloudflare-'));let mf=new Miniflare({...options,durableObjectsPersist:dir});
 try{
  const c=await post(mf,'/rooms',{autoPick:false}),peer=await client(mf,c);good(await peer.cmd('claim',{team:'콩콩'}));peer.ws.close(4000,'reconnect test');await pause(100);
  await mf.dispose();mf=new Miniflare({...options,durableObjectsPersist:dir});await post(mf,`/rooms/${c.code}/join`,{token:c.token},200);const reconnected=await client(mf,c);
  assert.equal(reconnected.room.members.find(m=>m.id===c.memberId).team,'콩콩');assert.equal(reconnected.room.state.turnLimitMs,0);
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true});}
});


test('Legacy queue settings are removed while selected captain and picks remain',()=>{
 const room={state:{...initial(),matchmaking:true,matchPhase:'waiting',turnLimitMs:30000,turnTimer:{deadline:123},picks:[{player:'김뿡',team:'룩삼'}]},members:[{team:'룩삼',spectator:false},{team:null,spectator:false}]};
 normalizeRoom(room);assert.equal(room.state.matchmaking,undefined);assert.equal(room.state.turnTimer,null);assert.equal(room.members[1].spectator,true);assert.equal(room.members[0].team,'룩삼');assert.equal(room.state.picks[0].player,'김뿡');
});
