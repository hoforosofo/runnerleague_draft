import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {players,initialOrder,caps,eligible} from './model.mjs';
import {chooseDraftPlayer} from './draft-ai.mjs';
const byId=id=>players.find(p=>p.id===id);
const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'https://hoforosofo.github.io,http://127.0.0.1:8766,http://localhost:8766').split(',').map(v=>v.trim()));
const storage=process.env.DATA_DIR?path.join(process.env.DATA_DIR,'rooms.json'):null;
const rooms=new Map();
const botWaits=new Map();
const reconnectGrace=Number(process.env.RECONNECT_GRACE_MS)||30000;
const vacantDelay=0; // AI-only teams pick without an artificial delay.
const turnLimit=Math.max(100,Number(process.env.TURN_LIMIT_MS)||30000);
if(storage){fs.mkdirSync(path.dirname(storage),{recursive:true});if(fs.existsSync(storage)){for(const r of JSON.parse(fs.readFileSync(storage,'utf8'))){r.sockets=new Map();rooms.set(r.code,r)}}}
function persist(){if(!storage)return;const data=[...rooms.values()].map(({sockets,...r})=>r);fs.writeFileSync(storage+'.tmp',JSON.stringify(data));fs.renameSync(storage+'.tmp',storage)}
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
function assignRandom(r,m){const vacant=r.state.order.filter(t=>!r.members.some(p=>p.team===t));m.team=vacant.length?vacant[crypto.randomInt(vacant.length)]:null;m.spectator=!m.team;}
function initial(){return {order:[...initialOrder],picks:[],turnOwners:Array.from({length:20},(_,i)=>initialOrder[Math.floor(i/5)%2?4-i%5:i%5]),coachMode:false,autoPick:true,coaches:{},tanks:Object.fromEntries(initialOrder.map(t=>[t,t])),started:false,resultsConfirmed:false}}
const selected=r=>r.state.picks.filter(Boolean);
const count=r=>r.state.coachMode?25:20;
function nextIndex(r){for(let i=0;i<count(r);i++)if(!r.state.picks[i])return i;return -1}
function schedule(r){const s=r.state,remaining=Object.fromEntries(s.order.map(t=>[t,count(r)/5-selected(r).filter(p=>p.team===t).length]));const queue=[];for(let round=0;queue.length<count(r)-selected(r).length;round++)for(const t of round%2?[...s.order].reverse():s.order)if(remaining[t]>0){queue.push(t);remaining[t]--}s.turnOwners=Array.from({length:count(r)},(_,i)=>s.picks[i]?.team||queue.shift())}
function syncTurn(r){const s=r.state,index=nextIndex(r),team=s.turnOwners[index];if(!s.started||s.resultsConfirmed||index<0){s.turnTimer=null;return}if(!s.turnTimer||s.turnTimer.index!==index||s.turnTimer.team!==team)s.turnTimer={index,team,deadline:Date.now()+turnLimit}}
function view(r){return {code:r.code,name:r.name,revision:r.revision,hostId:r.hostId,members:r.members.map(({tokenHash,...m})=>({...m,connected:r.sockets.has(m.id)})),state:r.state,updatedAt:r.updatedAt,serverTime:Date.now()}}
function emit(r){const data=JSON.stringify({type:'state',room:view(r)});for(const socket of r.sockets.values())if(socket.readyState===WebSocket.OPEN)socket.send(data)}
function commit(r){botWaits.delete(r.code);syncTurn(r);r.revision++;r.updatedAt=Date.now();persist();emit(r)}
function member(r,value){return r.members.find(m=>m.tokenHash===sha(String(value||'')))}
function requireHost(r,m){if(m.id!==r.hostId)throw Error('방장만 실행할 수 있습니다.')}
function command(r,m,action,data={}){
 const s=r.state;
 if(s.matchmaking&&!s.started)throw Error('5명의 참가자가 접속하면 자동으로 시작합니다.');
 if(action==='claim'){
  if(!initialOrder.includes(data.team))throw Error('팀을 선택하세요.');
  const waiting=r.members.find(p=>!p.team&&!p.spectator);
  if(r.members.some(p=>p.id!==m.id&&p.team===data.team))throw Error('이미 선택된 팀입니다.');m.team=data.team;m.spectator=false;botWaits.delete(r.code);if(initialOrder.every(t=>r.members.some(p=>p.team===t)))for(const p of r.members)if(!p.team)p.spectator=true;
 }else if(action==='spectate'){
  m.team=null;m.spectator=true;botWaits.delete(r.code);
 }else if(action==='start'){
  requireHost(r,m);if(s.started)throw Error('이미 시작했습니다.');if(!s.autoPick&&initialOrder.some(t=>!r.members.some(p=>p.team===t)))throw Error('5개 팀의 팀장이 모두 선택되어야 합니다.');
  if(!s.autoPick&&r.members.some(p=>p.team&&!r.sockets.has(p.id)))throw Error('팀장이 모두 접속한 뒤 시작하세요.');s.started=true;
 }else if(action==='order'){
  requireHost(r,m);if(selected(r).length)throw Error('선발 후 순서를 변경할 수 없습니다.');const {from,to}=data;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>4||to>4)throw Error('잘못된 순서');[s.order[from],s.order[to]]=[s.order[to],s.order[from]];schedule(r);
 }else if(action==='coachMode'){
  requireHost(r,m);if(selected(r).length)throw Error('선발 후 변경할 수 없습니다.');s.coachMode=!!data.enabled;s.coaches={};schedule(r);
 }else if(action==='pick'){
  if(!s.started||s.resultsConfirmed)throw Error('방장이 드래프트를 시작해야 합니다.');const idx=nextIndex(r),team=s.turnOwners[idx],p=byId(data.player);
  if(idx<0||m.team!==team)throw Error('자기 팀 차례에만 선택할 수 있습니다.');if(!p||!eligible(p,team,selected(r),s.coachMode))throw Error('선택할 수 없는 선수입니다.');s.picks[idx]={player:p.id,team};
 }else if(action==='remove'||action==='undo'){
  requireHost(r,m);if(s.resultsConfirmed)throw Error('먼저 수정하기를 누르세요.');const idx=action==='undo'?s.picks.findLastIndex(Boolean):s.picks.findIndex(p=>p?.player===data.player);if(idx>=0)s.picks[idx]=null;else if(action==='remove'){for(const t of s.order)if(s.coaches[t]===data.player)delete s.coaches[t]}
  if(!selected(r).length){s.started=false;schedule(r)}
 }else if(action==='swap'){
  requireHost(r,m);if(s.resultsConfirmed)throw Error('먼저 수정하기를 누르세요.');const {from,to}=data;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=count(r)||to>=count(r)||!s.picks[from])throw Error('교환할 칸이 없습니다.');const copy=Array.from({length:count(r)},(_,i)=>s.picks[i]||null),a=copy[from],b=copy[to];copy[to]={player:a.player,team:s.turnOwners[to]};copy[from]=b?{player:b.player,team:s.turnOwners[from]}:null;
  for(const t of s.order)for(const role of Object.keys(caps))if(copy.filter(p=>p?.team===t&&byId(p.player).role===role).length>caps[role])throw Error('포지션 정원을 초과합니다.');s.picks=copy;
 }else if(action==='coach'){
  throw Error('코치 선택 모드에서 드래프트로 선발하세요.');
 }else if(action==='removeCoach'){
  requireHost(r,m);if(s.resultsConfirmed)throw Error('먼저 수정하기를 누르세요.');delete s.coaches[data.team];
 }else if(action==='confirm'){
  requireHost(r,m);if(selected(r).length!==count(r))throw Error('모든 선발을 마쳐야 합니다.');s.resultsConfirmed=true;
 }else if(action==='edit'){
  requireHost(r,m);s.resultsConfirmed=false;
 }else if(action==='tankSwap'){
  requireHost(r,m);if(!s.resultsConfirmed||!s.order.includes(data.from)||!s.order.includes(data.to))throw Error('최종 화면에서만 교환할 수 있습니다.');[s.tanks[data.from],s.tanks[data.to]]=[s.tanks[data.to],s.tanks[data.from]];
 }else if(action==='reset'){
  requireHost(r,m);const randomMatching=s.randomMatching===true;r.state=initial();r.state.randomMatching=randomMatching;
 }else if(action==='release'){
  requireHost(r,m);if(s.started)throw Error('시작 후 팀장을 변경할 수 없습니다.');const target=r.members.find(p=>p.id===data.memberId);if(target){target.team=null;target.spectator=true}
 }else throw Error('지원하지 않는 요청입니다.');
 commit(r);
}
const sendJSON=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const rates=new Map();function rate(ip){const now=Date.now(),x=rates.get(ip)||{at:now,n:0};if(now-x.at>60000){x.at=now;x.n=0}x.n++;rates.set(ip,x);return x.n<=60}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;if(origin&&!allowedOrigins.has(origin))return sendJSON(res,403,{error:'허용되지 않은 사이트입니다.'});
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 if(req.url==='/health'){return sendJSON(res,200,{ok:true})}
 if(req.method!=='POST')return sendJSON(res,404,{error:'찾을 수 없습니다.'});if(!rate(req.socket.remoteAddress))return sendJSON(res,429,{error:'잠시 후 다시 시도하세요.'});
 try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('요청이 너무 큽니다.')}const data=JSON.parse(raw||'{}'),name=String(data.name||'참가자').trim().slice(0,24)||'참가자';
 if(req.url==='/matchmaking'){
  for(const r of rooms.values())if(r.state.matchmaking&&!r.state.started){r.members=r.members.filter(m=>r.sockets.has(m.id)||Date.now()-(m.joinedAt||0)<30000);if(r.members.length)r.hostId=r.members[0].id;else rooms.delete(r.code);}
  let r=[...rooms.values()].find(r=>r.state.matchmaking&&!r.state.started&&r.members.length<5);
  if(!r){if(rooms.size>=1000)throw Error('현재 매칭 대기열이 가득 찼습니다.');let code;do{code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(code));r={code,name:'랜덤매칭',hostId:null,revision:0,updatedAt:Date.now(),members:[],state:{...initial(),matchmaking:true},sockets:new Map()};rooms.set(code,r);}
  const secret=token(),id=crypto.randomUUID();r.members.push({id,name,team:null,spectator:false,joinedAt:Date.now(),tokenHash:sha(secret)});r.hostId||=id;commit(r);return sendJSON(res,201,{code:r.code,token:secret,memberId:id});
 }
 if(req.url==='/rooms'){
  if(rooms.size>=1000)throw Error('현재 방이 너무 많습니다.');let code;do{code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(code));const secret=token(),id=crypto.randomUUID(),r={code,name:String(data.roomName||'러너리그 드래프트').slice(0,50),hostId:id,revision:0,updatedAt:Date.now(),members:[{id,name,team:null,spectator:false,tokenHash:sha(secret)}],state:initial(),sockets:new Map()};if(data.order!==undefined){if(!Array.isArray(data.order)||data.order.length!==5||new Set(data.order).size!==5||!data.order.every(t=>initialOrder.includes(t)))throw Error('드래프트 순서를 확인하세요.');r.state.order=[...data.order];schedule(r)}r.state.autoPick=data.autoPick!==false;r.state.randomMatching=data.randomMatching===true;if(r.state.randomMatching)assignRandom(r,r.members[0]);rooms.set(code,r);persist();return sendJSON(res,201,{code,token:secret,memberId:id});
 }
 const match=req.url.match(/^\/rooms\/([A-Z0-9]{6})\/join$/);if(!match)return sendJSON(res,404,{error:'찾을 수 없습니다.'});const r=rooms.get(match[1]);if(!r)throw Error('방을 찾을 수 없습니다.');
 const old=member(r,data.token);if(old)return sendJSON(res,200,{code:r.code,token:data.token,memberId:old.id});if(r.state.matchmaking)throw Error('랜덤매칭 버튼으로 참가하세요.');if(r.state.started)throw Error('이미 시작한 방입니다. 기존 참가자는 재접속할 수 있습니다.');if(r.members.length>=20)throw Error('참가 인원이 가득 찼습니다.');const secret=token(),id=crypto.randomUUID();r.members.push({id,name,team:null,spectator:initialOrder.every(t=>r.members.some(m=>m.team===t)),tokenHash:sha(secret)});if(r.state.randomMatching)assignRandom(r,r.members.at(-1));commit(r);return sendJSON(res,201,{code:r.code,token:secret,memberId:id});
 }catch(e){sendJSON(res,400,{error:e.message})}
});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,socket,head)=>{if(req.url!=='/ws'||!allowedOrigins.has(req.headers.origin)){socket.destroy();return}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws))});
wss.on('connection',ws=>{let room=null,me=null;const timer=setTimeout(()=>ws.close(1008,'인증 시간 초과'),10000);let windowAt=Date.now(),messages=0;ws.on('message',raw=>{let requestId=null;try{if(Date.now()-windowAt>1000){windowAt=Date.now();messages=0}if(++messages>30)throw Error('요청이 너무 빠릅니다.');const msg=JSON.parse(String(raw));requestId=msg.requestId;if(!room){if(msg.type!=='auth')throw Error('인증이 필요합니다.');room=rooms.get(msg.code);me=room&&member(room,msg.token);if(!me){room=null;throw Error('재접속 정보가 유효하지 않습니다.')}clearTimeout(timer);const previous=room.sockets.get(me.id);room.sockets.set(me.id,ws);if(room.state.turnOwners[nextIndex(room)]===me.team)botWaits.delete(room.code);if(previous&&previous!==ws)previous.close(4001,'다른 탭에서 접속했습니다.');if(room.state.matchmaking&&!room.state.started&&room.members.length===5&&room.members.every(m=>room.sockets.has(m.id))){for(const m of room.members)assignRandom(room,m);room.state.started=true;commit(room);}else emit(room);return}
 if(msg.type!=='command')return;if(msg.revision!==room.revision){ws.send(JSON.stringify({type:'error',requestId,message:'화면이 갱신되었습니다. 다시 시도해 주세요.'}));emit(room);return}command(room,me,msg.action,msg.data);ws.send(JSON.stringify({type:'ack',requestId}));
 }catch(e){ws.send(JSON.stringify({type:'error',requestId,message:e.message}));}});ws.on('close',()=>{clearTimeout(timer);if(room&&room.sockets.get(me.id)===ws){room.sockets.delete(me.id);if(room.state.matchmaking&&!room.state.started){room.members=room.members.filter(m=>m.id!==me.id);room.hostId=room.members[0]?.id||null;if(!room.members.length)rooms.delete(room.code);commit(room)}else emit(room)}});ws.on('pong',()=>{ws.isAlive=true});ws.isAlive=true});

setInterval(()=>{for(const r of rooms.values())for(let step=0;step<25;step++){
 if(!r.state.started||r.state.resultsConfirmed||!r.sockets.size){botWaits.delete(r.code);break}
 syncTurn(r);
 const index=nextIndex(r),team=r.state.turnOwners[index],owner=r.members.find(m=>m.team===team);
 if(index<0){botWaits.delete(r.code);break}
 const expired=Date.now()>=r.state.turnTimer.deadline;
 if(!expired&&(owner&&r.sockets.has(owner.id)||!r.state.autoPick)){botWaits.delete(r.code);break}
 let wait=botWaits.get(r.code);if(!wait||wait.index!==index){wait={index,until:Date.now()+(owner?reconnectGrace:vacantDelay)};botWaits.set(r.code,wait)}
 if(!expired&&Date.now()<wait.until)break;const decision=chooseDraftPlayer(r.state,team);if(decision){r.state.picks[index]={player:decision.player.id,team,automatic:true,autoPolicy:decision.policyVersion};commit(r)}else break;
}},50).unref();

const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;ws.ping()}},30000);heartbeat.unref();
setInterval(()=>{const cutoff=Date.now()-7*86400000;for(const [code,r] of rooms)if(!r.sockets.size&&r.updatedAt<cutoff)rooms.delete(code);for(const [ip,v] of rates)if(Date.now()-v.at>60000)rates.delete(ip);persist()},3600000).unref();
server.listen(Number(process.env.PORT||8787),'0.0.0.0',()=>console.log('Runner League server ready'));
