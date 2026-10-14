import {DurableObject} from 'cloudflare:workers';
import crypto from 'node:crypto';
import {initialOrder,eligible} from '../online-server/model.mjs';
import {chooseDraftPlayer} from '../online-server/draft-ai.mjs';
import {initial,selected,nextIndex,schedule,syncTurn,view,emit,commit,member,leaveRoom,command,assignRandom,token,sha,byId} from './room-core.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const codePattern=/^[A-Z0-9]{6}$/;
const nameOf=data=>String(data.name||'참가자').trim().slice(0,24)||'참가자';
async function body(request){const text=await request.text();if(text.length>4096)throw Error('요청이 너무 큽니다.');return JSON.parse(text||'{}');}
const stub=(env,code)=>env.ROOMS.getByName(code);
const internal=(path,data)=>new Request('https://internal'+path,{method:'POST',body:JSON.stringify(data)});

export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const allowed=(env.ALLOWED_ORIGINS||'https://hoforosofo.github.io').split(',').map(s=>s.trim());
  if(origin&&!allowed.includes(origin))return json({error:'허용되지 않은 사이트입니다.'},403);
  const headers={'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'};
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  let response;
  try{
   if(request.method==='OPTIONS')response=new Response(null,{status:204});
   else if(url.pathname==='/health'||url.pathname==='/')response=json({ok:true,service:'Runner League Cloudflare'});
   else if(url.pathname==='/ws'){
    const code=url.searchParams.get('code');
    if(!origin||!codePattern.test(code||'')||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'올바른 방 연결이 필요합니다.'},400);
    return stub(env,code).fetch(request);
   }else if(request.method==='POST'&&['/rooms','/matchmaking'].includes(url.pathname)){
    response=await env.LOBBY.getByName('lobby').fetch(request);
   }else if(request.method==='POST'&&/^\/rooms\/[A-Z0-9]{6}\/(join|leave)$/.test(url.pathname)){
    response=await stub(env,url.pathname.split('/')[2]).fetch(request);
   }else response=json({error:'찾을 수 없습니다.'},404);
  }catch(error){console.error(error);response=json({error:'서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'},500);}
  response=new Response(response.body,response);for(const [key,value] of Object.entries(headers))response.headers.set(key,value);return response;
 }
};

// Serializes queue admission; room gameplay runs in independent Durable Objects.
export class MatchLobby extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.waiting=null;this.rates=new Map();ctx.blockConcurrencyWhile(async()=>{this.waiting=await ctx.storage.get('waiting')||null;});}
 async fetch(request){return this.ctx.blockConcurrencyWhile(async()=>{
  try{
   const ip=request.headers.get('CF-Connecting-IP')||'local',now=Date.now();
   for(const [key,v] of this.rates)if(now-v.at>60000)this.rates.delete(key);
   const rate=this.rates.get(ip)||{at:now,count:0};this.rates.set(ip,rate);if(++rate.count>60)return json({error:'잠시 후 다시 시도하세요.'},429);
   const data=await body(request),matching=new URL(request.url).pathname==='/matchmaking';
   if(matching&&this.waiting){
    const response=await stub(this.env,this.waiting).fetch(internal('/admit',{...data,matching:true}));
    if(response.ok)return response;
    this.waiting=null;
   }
   for(let attempt=0;attempt<5;attempt++){
    const code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();
    const response=await stub(this.env,code).fetch(internal('/create',{...data,code,matching}));
    if(response.status===409)continue;
    if(response.ok&&matching){this.waiting=code;await this.ctx.storage.put('waiting',code);}
    return response;
   }
   return json({error:'방 생성에 실패했습니다. 다시 시도하세요.'},503);
  }catch(error){return json({error:error.message},400);}
 });}
}

export class DraftRoom extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);this.room=null;
  ctx.blockConcurrencyWhile(async()=>{
   this.room=await ctx.storage.get('room')||null;
   if(this.room){this.room.sockets=new Map();this.room.deferEmit=true;
    for(const ws of ctx.getWebSockets()){const a=ws.deserializeAttachment();if(a?.memberId&&this.room.members.some(m=>m.id===a.memberId))this.room.sockets.set(a.memberId,ws);}
   }
  });
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 async save(){
  const r=this.room;if(!r)return;
  if(r.deleted){await this.ctx.storage.deleteAll();this.room=null;return;}
  syncTurn(r);const {sockets,deferEmit,...saved}=r;
  await this.ctx.storage.put('room',saved);
  r.deferEmit=false;emit(r);r.deferEmit=true;
  await this.arm();
 }
 async arm(){
  const r=this.room;if(!r)return;
  const now=Date.now(),dates=[r.updatedAt+7*86400000];
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(!a?.memberId)dates.push((a?.createdAt||now)+10000);}
  if(r.state.matchmaking&&!r.state.started)for(const m of r.members)if(!r.sockets.has(m.id))dates.push((m.disconnectedAt||m.joinedAt)+30000);
  if(r.state.started&&!r.state.resultsConfirmed&&r.sockets.size){
   const index=nextIndex(r),owner=r.members.find(m=>m.team===r.state.turnOwners[index]);
   if(index>=0){
    const deadline=r.state.turnTimer?.deadline;if(typeof deadline==='number')dates.push(deadline);
    if(r.state.autoPick&&(!owner||!r.sockets.has(owner.id)))dates.push(owner?(owner.disconnectedAt||now)+30000:now+1);
   }
  }
  await this.ctx.storage.setAlarm(Math.max(now+1,Math.min(...dates)));
 }
 async fetch(request){return this.ctx.blockConcurrencyWhile(async()=>{
  try{
   const path=new URL(request.url).pathname;
   if(path==='/ws'){
    if(!this.room)return json({error:'방을 찾을 수 없습니다.'},404);
    if(this.ctx.getWebSockets().length>=40)return json({error:'연결 수가 너무 많습니다.'},429);
    const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);server.serializeAttachment({createdAt:Date.now()});await this.arm();return new Response(null,{status:101,webSocket:client});
   }
   const data=await body(request);
   if(path==='/create'){
    if(this.room)return json({error:'이미 존재하는 방입니다.'},409);
    const secret=token(),id=crypto.randomUUID(),s=initial();s.autoPick=data.autoPick!==false;
    if(data.matching){s.matchmaking=true;s.matchPhase='waiting';s.turnLimitMs=30000;}
    this.room={code:data.code,name:data.matching?'랜덤매칭':String(data.roomName||'러너리그 드래프트').slice(0,50),hostId:id,revision:0,updatedAt:Date.now(),members:[{id,name:nameOf(data),team:null,spectator:false,joinedAt:Date.now(),tokenHash:sha(secret)}],state:s,sockets:new Map(),deferEmit:true};
    await this.save();return json({code:data.code,token:secret,memberId:id},201);
   }
   const r=this.room;if(!r)return json({error:'방을 찾을 수 없습니다.'},404);
   if(path.endsWith('/leave')){const m=member(r,data.token);if(m){leaveRoom(r,m);await this.save();}return json({ok:true});}
   const old=member(r,data.token);if(old)return json({code:r.code,token:data.token,memberId:old.id});
   if(path==='/admit'){
    // Expire queue reservations even when an old alarm has not fired yet.
    if(r.state.matchmaking&&!r.state.started)for(const m of [...r.members])if(!r.sockets.has(m.id)&&Date.now()-(m.disconnectedAt||m.joinedAt)>=30000)leaveRoom(r,m);
    if(r.deleted){await this.save();return json({error:'대기 방이 종료되었습니다.'},409);}
    if(!r.state.matchmaking||r.state.started||r.members.length>=5)return json({error:'대기열이 가득 찼습니다.'},409);
   }else if(!/^\/rooms\/[A-Z0-9]{6}\/join$/.test(path))return json({error:'찾을 수 없습니다.'},404);
   else if(r.state.matchmaking)throw Error('랜덤매칭 버튼으로 참가하세요.');
   if(r.state.started)throw Error('이미 시작한 방입니다. 기존 참가자는 재접속할 수 있습니다.');
   if(r.members.length>=20)throw Error('참가 인원이 가득 찼습니다.');
   const secret=token(),id=crypto.randomUUID();r.members.push({id,name:nameOf(data),team:null,spectator:!r.state.matchmaking&&initialOrder.every(t=>r.members.some(m=>m.team===t)),joinedAt:Date.now(),tokenHash:sha(secret)});commit(r);await this.save();return json({code:r.code,token:secret,memberId:id},201);
  }catch(error){return json({error:error.message},400);}
 });}
 async webSocketMessage(ws,raw){return this.ctx.blockConcurrencyWhile(async()=>{
  let requestId=null;
  try{
   if(typeof raw!=='string'||raw.length>8192)throw Error('요청이 너무 큽니다.');
   const a=ws.deserializeAttachment()||{},now=Date.now();if(now-(a.windowAt||0)>1000){a.windowAt=now;a.messages=0;}a.messages=(a.messages||0)+1;ws.serializeAttachment(a);if(a.messages>30)throw Error('요청이 너무 빠릅니다.');
   const msg=JSON.parse(raw);requestId=msg.requestId;const r=this.room;if(!r)throw Error('방을 찾을 수 없습니다.');
   if(!a.memberId){
    const m=msg.type==='auth'&&msg.code===r.code&&member(r,msg.token);if(!m){ws.send(JSON.stringify({type:'error',message:'재접속 정보가 유효하지 않습니다.'}));ws.close(1008,'invalid auth');return;}
    const previous=r.sockets.get(m.id);a.memberId=m.id;ws.serializeAttachment(a);r.sockets.set(m.id,ws);delete m.disconnectedAt;
    if(previous&&previous!==ws)previous.close(4001,'다른 탭에서 접속했습니다.');
    if(r.state.matchmaking&&!r.state.started&&r.members.length===5&&r.members.every(m=>r.sockets.has(m.id))){for(const m of r.members)assignRandom(r,m);r.state.order=[...initialOrder];schedule(r);r.state.matchPhase='draft';r.state.started=true;}
    commit(r);await this.save();return;
   }
   const m=r.members.find(m=>m.id===a.memberId);if(!m||r.sockets.get(m.id)!==ws)throw Error('재접속 정보가 유효하지 않습니다.');
   if(msg.type!=='command')return;
   if(msg.revision!==r.revision){ws.send(JSON.stringify({type:'error',requestId,message:'화면이 갱신되었습니다. 다시 시도해 주세요.'}));r.deferEmit=false;emit(r);r.deferEmit=true;return;}
   command(r,m,msg.action,msg.data);await this.save();ws.send(JSON.stringify({type:'ack',requestId}));
  }catch(error){ws.send(JSON.stringify({type:'error',requestId,message:error.message}));}
 });}
 async webSocketClose(ws,code,reason){return this.ctx.blockConcurrencyWhile(async()=>{
  const r=this.room,id=ws.deserializeAttachment()?.memberId;if(!r)return;
  const m=r.members.find(m=>m.id===id);if(m&&r.sockets.get(id)===ws){
   if(code===1001||code===1000&&reason==='site-left'||r.state.matchmaking&&!r.state.started)leaveRoom(r,m);
   else {r.sockets.delete(id);m.disconnectedAt=Date.now();commit(r);}
  }
  try{ws.close(code===1006?1000:code,reason);}catch{}await this.save();
 });}
 async webSocketError(ws){return this.webSocketClose(ws,1006,'connection error');}
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
  const r=this.room;if(!r)return;const now=Date.now();
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(!a?.memberId&&now-(a?.createdAt||0)>=10000)ws.close(1008,'인증 시간 초과');}
  if(r.state.matchmaking&&!r.state.started)for(const m of [...r.members])if(!r.sockets.has(m.id)&&now-(m.disconnectedAt||m.joinedAt)>=30000)leaveRoom(r,m);
  if(r.deleted||!r.sockets.size&&now-r.updatedAt>=7*86400000){r.deleted=true;await this.save();return;}
  syncTurn(r);const i=nextIndex(r),team=r.state.turnOwners[i],owner=r.members.find(m=>m.team===team),deadline=r.state.turnTimer?.deadline;
  const expired=typeof deadline==='number'&&now>=deadline;
  const vacant=r.state.autoPick&&(!owner||!r.sockets.has(owner.id)&&now-(owner.disconnectedAt||now)>=30000);
  if(r.state.started&&!r.state.resultsConfirmed&&r.sockets.size&&i>=0&&(expired||vacant)){
   const decision=chooseDraftPlayer(r.state,team),p=decision?.player;
   if(p&&eligible(p,team,selected(r),false)){r.state.picks[i]={player:p.id,team,automatic:true,autoPolicy:decision.policyVersion};commit(r);}
  }
  await this.save();
 });}
}
