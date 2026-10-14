import {initialOrder,players,eligible,teamAt} from '../shared/model.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,signal){const end=Date.now()+15000;while(!fn()){if(signal?.aborted)throw Error('테스트를 중지했습니다.');if(Date.now()>end)throw Error('상태 동기화 대기 시간이 초과되었습니다.');await pause(20);}}
// Dedicated disposable room only. No stored user credentials or existing rooms are used.
export async function runRoomTest({serverUrl,count=30,onProgress=()=>{},signal,request=fetch,connect=url=>new WebSocket(url)}){
 if(!Number.isInteger(count)||count<5||count>50)throw Error('테스트 인원은 5~50명입니다.');
 const peers=[];let code;
 const pageHide=()=>{for(const p of peers)globalThis.navigator?.sendBeacon?.(serverUrl+'/rooms/'+code+'/leave',JSON.stringify({token:p.token}));};
 globalThis.addEventListener?.('pagehide',pageHide);
const start=performance.now();let joinMs,draftMs;
 const post=async(path,data={})=>{const r=await request(serverUrl+path,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(data)}),v=await r.json();if(!r.ok)throw Error(v.error||'서버 요청 실패');return v;};
 async function attach(c){
  const peer={...c,room:null,pending:new Map(),ws:null};peers.push(peer);
  const ws=connect(serverUrl.replace(/^http/,'ws')+'/ws?code='+c.code);peer.ws=ws;
  ws.addEventListener('message',e=>{if(e.data==='pong')return;const m=JSON.parse(e.data);if(m.type==='state')peer.room=m.room;if(m.requestId)peer.pending.set(m.requestId,m);});
  await until(()=>ws.readyState===1,signal);ws.send(JSON.stringify({type:'auth',code:c.code,token:c.token}));await until(()=>peer.room,signal);
  peer.cmd=async(action,data={},allowDenied=false)=>{const requestId=crypto.randomUUID();ws.send(JSON.stringify({type:'command',requestId,revision:peer.room.revision,action,data}));await until(()=>peer.pending.has(requestId),signal);const m=peer.pending.get(requestId);peer.pending.delete(requestId);if(m.type!=='ack'&&!allowDenied)throw Error(m.message);return m;};
  return peer;
 }
 try{
  const c=await post('/rooms',{name:'테스트01',roomName:'동시접속 검증 전용',autoPick:false});code=c.code;await attach(c);onProgress({stage:'connecting',connected:1,count,code});
  for(let start=1;start<count;start+=5){
   if(signal?.aborted)throw Error('테스트를 중지했습니다.');
   await Promise.all(Array.from({length:Math.min(5,count-start)},async(_,j)=>{const c=await post('/rooms/'+code+'/join',{name:'테스트'+String(start+j+1).padStart(2,'0')});await attach(c);}));
   await until(()=>peers.every(p=>p.room.members.length===peers.length),signal);onProgress({stage:'connecting',connected:peers.length,count,code});
  }
  await until(()=>peers.every(p=>p.room.members.filter(m=>m.connected).length===count),signal);joinMs=performance.now()-start;
  for(let i=0;i<5;i++){await peers[i].cmd('claim',{team:initialOrder[i]});await until(()=>peers.every(p=>p.room.members.filter(m=>m.team).length===i+1),signal);}
  await peers[0].cmd('start');await until(()=>peers.every(p=>p.room.state.started),signal);
  if(count>5){const denied=await peers[5].cmd('pick',{player:'김뿡'},true);if(denied.type!=='error')throw Error('관전자의 선발 권한 검증 실패');}
  const draftStart=performance.now();
  for(let i=0;i<20;i++){
   const team=teamAt(i,initialOrder),picks=peers[0].room.state.picks.filter(Boolean),player=players.find(p=>eligible(p,team,picks,false));
   await peers[initialOrder.indexOf(team)].cmd('pick',{player:player.id});
   await until(()=>peers.every(p=>p.room.state.picks.filter(Boolean).length===i+1),signal);
   const expected=JSON.stringify(peers[0].room.state.picks);if(!peers.every(p=>JSON.stringify(p.room.state.picks)===expected))throw Error('참가자별 선발 결과 불일치');
   onProgress({stage:'draft',connected:count,count,picks:i+1,code});
  }
  await peers[0].cmd('confirm');await until(()=>peers.every(p=>p.room.state.resultsConfirmed),signal);draftMs=performance.now()-draftStart;
  const state=peers[0].room.state;
  if(new Set(state.picks.map(p=>p.player)).size!==20)throw Error('중복 선발');
  for(const team of initialOrder)for(const role of ['damage','support'])if(state.picks.filter(p=>p.team===team&&players.find(x=>x.id===p.player).role===role).length!==2)throw Error('팀 역할 정원 불일치');
  return {ok:true,count,picks:20,spectators:count-5,joinMs:Math.round(joinMs),draftMs:Math.round(draftMs),allClientsSynchronized:true,spectatorPermissionChecked:count>5};
 }finally{
  globalThis.removeEventListener?.('pagehide',pageHide);
  onProgress({stage:'cleanup',count,code});
  await Promise.allSettled(peers.slice(1).map(p=>post('/rooms/'+code+'/leave',{token:p.token})));
  if(peers[0])await post('/rooms/'+code+'/leave',{token:peers[0].token}).catch(()=>{});
  for(const p of peers)try{p.ws?.close(1000,'site-left')}catch{}
 }
}
