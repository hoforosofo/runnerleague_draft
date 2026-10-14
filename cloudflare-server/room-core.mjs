import crypto from 'node:crypto';
import {players,initialOrder,caps,eligible} from '../shared/model.mjs';
const byId=id=>players.find(p=>p.id===id);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
function initial(){return {turnLimitMs:0,order:[...initialOrder],picks:[],turnOwners:Array.from({length:20},(_,i)=>initialOrder[Math.floor(i/5)%2?4-i%5:i%5]),coachMode:false,autoPick:true,coaches:{},tanks:Object.fromEntries(initialOrder.map(t=>[t,t])),started:false,resultsConfirmed:false}}
const selected=r=>r.state.picks.filter(Boolean);
function count(){return 20}
function nextIndex(r){for(let i=0;i<count(r);i++)if(!r.state.picks[i])return i;return -1}
function schedule(r){const s=r.state,remaining=Object.fromEntries(s.order.map(t=>[t,count(r)/5-selected(r).filter(p=>p.team===t).length]));const queue=[];for(let round=0;queue.length<count(r)-selected(r).length;round++)for(const t of round%2?[...s.order].reverse():s.order)if(remaining[t]>0){queue.push(t);remaining[t]--}s.turnOwners=Array.from({length:count(r)},(_,i)=>s.picks[i]?.team||queue.shift())}
// 모든 방의 시간 제한을 제거하고, 구버전 저장 데이터의 타이머도 정리합니다.
function syncTurn(r){r.state.turnLimitMs=0;r.state.turnTimer=null;}
// 기존 방의 토큰과 선발 내역을 보존하면서 폐기한 설정만 정리합니다.
function normalizeRoom(room){
 for(const key of ['matchmaking','randomMatching','matchPhase','ballots','positions','choiceOrder','matchScores'])delete room.state[key];
 syncTurn(room);
 for(const member of room.members)member.spectator=!member.team;
}
// 접속 중인 사람은 기다립니다. 빈 자리만 AI가 처리하고, 일시 단절은 복귀 유예를 줍니다.
function automaticTurn(room,now=Date.now(),grace=30000){
 if(!room.state.started||room.state.resultsConfirmed||!room.state.autoPick||!room.sockets.size)return null;
 const index=nextIndex(room),team=room.state.turnOwners[index];
 if(index<0)return null;
 const owner=room.members.find(member=>member.team===team);
 if(owner&&(room.sockets.has(owner.id)||now-(owner.disconnectedAt||now)<grace))return null;
 return {index,team};
}
function view(r){const state={...r.state};return {code:r.code,name:r.name,revision:r.revision,hostId:r.hostId,members:r.members.map(({tokenHash,...m})=>({...m,connected:r.sockets.has(m.id)})),state,updatedAt:r.updatedAt,serverTime:Date.now()}}
function emit(r){if(r.deferEmit)return;const data=JSON.stringify({type:'state',room:view(r)});for(const socket of r.sockets.values())if(socket.readyState===1){try{socket.send(data)}catch{}}}
function commit(r){syncTurn(r);r.revision++;r.updatedAt=Date.now();emit(r)}
function member(r,value){return r.members.find(m=>m.tokenHash===sha(String(value||'')))}
function requireHost(r,m){if(m.id!==r.hostId)throw Error('방장만 실행할 수 있습니다.')}
function leaveRoom(r,m){
 if(!r.members.some(p=>p.id===m.id))return;
 const ws=r.sockets.get(m.id);r.sockets.delete(m.id);r.members=r.members.filter(p=>p.id!==m.id);
 if(r.hostId===m.id)r.hostId=(r.members.find(p=>r.sockets.has(p.id))||r.members[0])?.id||null;
 if(!r.members.length)r.deleted=true;
 commit(r);ws?.close(1000,'left');
}
// 참가자 권한과 포지션 정원을 서버에서 검증합니다.
function command(r,m,action,data={}){
 const s=r.state;
 if(action==='claim'){
  if(!initialOrder.includes(data.team))throw Error('팀을 선택하세요.');
  if(r.members.some(p=>p.id!==m.id&&p.team===data.team))throw Error('이미 선택된 팀입니다.');m.team=data.team;m.spectator=false;if(initialOrder.every(t=>r.members.some(p=>p.team===t)))for(const p of r.members)if(!p.team)p.spectator=true;
 }else if(action==='spectate'){
  m.team=null;m.spectator=true;
 }else if(action==='start'){
  requireHost(r,m);if(s.started)throw Error('이미 시작했습니다.');if(!s.autoPick&&initialOrder.some(t=>!r.members.some(p=>p.team===t)))throw Error('5개 팀의 팀장이 모두 선택되어야 합니다.');
  if(!s.autoPick&&r.members.some(p=>p.team&&!r.sockets.has(p.id)))throw Error('팀장이 모두 접속한 뒤 시작하세요.');s.started=true;
 }else if(action==='order'){
  throw Error('드래프트 순서는 고정되어 있습니다.');
 }else if(action==='coachMode'){
  throw Error('코치 선발은 사용하지 않습니다.');
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
  throw Error('코치 선발은 사용하지 않습니다.');
 }else if(action==='removeCoach'){
  requireHost(r,m);if(s.resultsConfirmed)throw Error('먼저 수정하기를 누르세요.');delete s.coaches[data.team];
 }else if(action==='confirm'){
  requireHost(r,m);if(selected(r).length!==count(r))throw Error('모든 선발을 마쳐야 합니다.');s.resultsConfirmed=true;
 }else if(action==='edit'){
  requireHost(r,m);s.resultsConfirmed=false;
 }else if(action==='tankSwap'){
  requireHost(r,m);if(!s.resultsConfirmed||!s.order.includes(data.from)||!s.order.includes(data.to))throw Error('최종 화면에서만 교환할 수 있습니다.');[s.tanks[data.from],s.tanks[data.to]]=[s.tanks[data.to],s.tanks[data.from]];
 }else if(action==='reset'){
  requireHost(r,m);const autoPick=s.autoPick;r.state=initial();r.state.autoPick=autoPick;
 }else if(action==='release'){
  requireHost(r,m);if(s.started)throw Error('시작 후 팀장을 변경할 수 없습니다.');const target=r.members.find(p=>p.id===data.memberId);if(target){target.team=null;target.spectator=true}
 }else throw Error('지원하지 않는 요청입니다.');
 commit(r);
}

export {normalizeRoom,automaticTurn,initial,selected,nextIndex,schedule,syncTurn,view,emit,commit,member,leaveRoom,command,token,sha,byId};
