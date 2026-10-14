import {DurableObject} from 'cloudflare:workers';
import crypto from 'node:crypto';
import {eligible} from '../shared/model.mjs';
import {chooseDraftPlayer,POLICY_VERSION,EVIDENCE_AS_OF} from './ai/draft-ai.mjs';
import {normalizeRoom,automaticTurn,initial,selected,nextIndex,syncTurn,emit,commit,member,leaveRoom,command,token,sha,byId} from './room-core.mjs';

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
   else if(url.pathname==='/health'||url.pathname==='/')response=json({ok:true,service:'Runner League Cloudflare',aiPolicy:POLICY_VERSION,evidenceAsOf:EVIDENCE_AS_OF});
   else if(url.pathname==='/ws'){
    const code=url.searchParams.get('code');
    if(!origin||!codePattern.test(code||'')||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'올바른 방 연결이 필요합니다.'},400);
    return stub(env,code).fetch(request);
   }else if(request.method==='POST'&&url.pathname==='/rooms'){
    response=await env.LOBBY.getByName('lobby').fetch(request);
   }else if(request.method==='POST'&&/^\/rooms\/[A-Z0-9]{6}\/(join|leave)$/.test(url.pathname)){
    response=await stub(env,url.pathname.split('/')[2]).fetch(request);
   }else response=json({error:'찾을 수 없습니다.'},404);
  }catch(error){console.error(error);response=json({error:'서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'},500);}
  response=new Response(response.body,response);for(const [key,value] of Object.entries(headers))response.headers.set(key,value);return response;
 }
};

// 기존 Cloudflare 바인딩 이름은 유지하지만 방 생성만 처리합니다.
// 랜덤매칭 대기열과 자동 매칭은 제거했습니다.
export class MatchLobby extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.rates=new Map();}
 async fetch(request){
  try{
   const ip=request.headers.get('CF-Connecting-IP')||'local',now=Date.now();
   for(const [key,v] of this.rates)if(now-v.at>60000)this.rates.delete(key);
   const rate=this.rates.get(ip)||{at:now,count:0};this.rates.set(ip,rate);
   if(++rate.count>60)return json({error:'잠시 후 다시 시도하세요.'},429);
   const data=await body(request);
   for(let attempt=0;attempt<5;attempt++){
    const code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();
    const response=await stub(this.env,code).fetch(internal('/create',{...data,code}));
    if(response.status!==409)return response;
   }
   return json({error:'방 생성에 실패했습니다. 다시 시도하세요.'},503);
  }catch(error){return json({error:error.message},400);}
 }
}

export class DraftRoom extends DurableObject {
 // 휴면 후에도 저장한 방 상태와 WebSocket 참가자 정보를 복구합니다.
 constructor(ctx,env){
  super(ctx,env);this.room=null;
  ctx.blockConcurrencyWhile(async()=>{
   this.room=await ctx.storage.get('room')||null;
   if(this.room){this.room.sockets=new Map();this.room.deferEmit=true;
    normalizeRoom(this.room);
    for(const ws of ctx.getWebSockets()){const a=ws.deserializeAttachment();if(a?.memberId&&this.room.members.some(m=>m.id===a.memberId))this.room.sockets.set(a.memberId,ws);}
   }
  });
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 // 저장을 완료한 상태만 참가자에게 전송합니다.
 async save(){
  const r=this.room;if(!r)return;
  if(r.deleted){await this.ctx.storage.deleteAll();this.room=null;return;}
  syncTurn(r);const {sockets,deferEmit,...saved}=r;
  await this.ctx.storage.put('room',saved);
  r.deferEmit=false;emit(r);r.deferEmit=true;
  await this.arm();
 }
 // 인증 만료·재접속 유예·방 정리에 필요한 가장 가까운 시각만 예약합니다.
 async arm(){
  const r=this.room;if(!r)return;
  const now=Date.now(),dates=[r.updatedAt+7*86400000];
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(!a?.memberId)dates.push((a?.createdAt||now)+10000);}
  if(r.state.started&&!r.state.resultsConfirmed&&r.sockets.size){
   const index=nextIndex(r),owner=r.members.find(m=>m.team===r.state.turnOwners[index]);
   if(index>=0){
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
    this.room={code:data.code,name:String(data.roomName||'러너리그 드래프트').slice(0,50),hostId:id,revision:0,updatedAt:Date.now(),members:[{id,name:nameOf(data),team:null,spectator:true,joinedAt:Date.now(),tokenHash:sha(secret)}],state:s,sockets:new Map(),deferEmit:true};
    await this.save();return json({code:data.code,token:secret,memberId:id},201);
   }
   const r=this.room;if(!r)return json({error:'방을 찾을 수 없습니다.'},404);
   if(path.endsWith('/leave')){const m=member(r,data.token);if(m){leaveRoom(r,m);await this.save();}return json({ok:true});}
   const old=member(r,data.token);if(old)return json({code:r.code,token:data.token,memberId:old.id});
   if(!/^\/rooms\/[A-Z0-9]{6}\/join$/.test(path))return json({error:'찾을 수 없습니다.'},404);
   if(r.members.length>=20)throw Error('참가 인원이 가득 찼습니다.');
   const secret=token(),id=crypto.randomUUID();r.members.push({id,name:nameOf(data),team:null,spectator:true,joinedAt:Date.now(),tokenHash:sha(secret)});commit(r);await this.save();return json({code:r.code,token:secret,memberId:id},201);
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
   if(code===1001||code===1000&&reason==='site-left')leaveRoom(r,m);
   else {r.sockets.delete(id);m.disconnectedAt=Date.now();commit(r);}
  }
  try{ws.close(code===1006?1000:code,reason);}catch{}await this.save();
 });}
 async webSocketError(ws){return this.webSocketClose(ws,1006,'connection error');}
 // 빈 팀의 AI 선발만 실행합니다. 사람이 접속한 팀은 시간 제한 없이 기다립니다.
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
  const r=this.room;if(!r)return;const now=Date.now();
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(!a?.memberId&&now-(a?.createdAt||0)>=10000)ws.close(1008,'인증 시간 초과');}
  if(r.deleted||!r.sockets.size&&now-r.updatedAt>=7*86400000){r.deleted=true;await this.save();return;}
  const turn=automaticTurn(r,now);
  if(turn){
   const decision=chooseDraftPlayer(r.state,turn.team),p=decision?.player;
   if(p&&eligible(p,turn.team,selected(r),false)){r.state.picks[turn.index]={player:p.id,team:turn.team,automatic:true,autoPolicy:decision.policyVersion};commit(r);}
  }
  await this.save();
 });}
}
