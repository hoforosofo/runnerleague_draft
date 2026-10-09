import {players,eligible,teamAt} from './model.mjs';

// Provisional judgments from the supplied 2026-10-08~10 community export.
// Scores are policy weights, not measured skill, win rates, or trained parameters.
export const EVIDENCE_AS_OF='2026-10-10T04:58:00+09:00';
// Latest dated observations override older preferences; unobserved players retain user ranks.
export const POLICY_VERSION='runnerleague-community-v3';
const profiles={
 '김뿡':{value:94,flex:8,carry:9},'뱅':{value:92,flex:6,carry:9},
 '디디디용':{value:83,flex:9,carry:6},'마뫄':{value:80,flex:6,carry:6,uncertain:true},
 '큐베':{value:70,flex:5,carry:5,uncertain:true},'엘리':{value:68,flex:7,carry:4},
 '설백':{value:63,flex:4,carry:3,call:5},'뀨냥냥':{value:55,flex:3,carry:2,uncertain:true},
 '정령왕':{value:54,flex:3,carry:3,uncertain:true},'꼴랑이':{value:51,flex:2,carry:2,uncertain:true},
 '양아지':{value:96,style:'hybrid',order:4,flex:9},
 '남봉':{value:86,style:'attack',order:10,flex:7},
 '인섹':{value:80,style:'attack',order:9,flex:5},
 '아야츠노 유니':{value:82,style:'hybrid',order:3,flex:8},
 '눈꽃':{value:84,style:'attack',order:6,flex:6},
 '임나은':{value:78,style:'attack',order:6,flex:6},
 '삐부':{value:73,style:'base',order:3,flex:4},
 '서넹':{value:71,style:'base',order:4,flex:6},
 '담유이':{value:70,style:'base',order:2,flex:4},
 '새담':{value:67,style:'base',order:3,flex:4},
};
const orderNeed={'둥그레':1,'룩삼':1.25,'울프':0.15,'콩콩':1.2,'푸린':0.35};
const preferredWolfDamage=new Set(['김뿡','뱅','디디디용']);
const byId=new Map(players.map(p=>[p.id,p]));
const rosterOf=(picks,team)=>picks.filter(p=>p.team===team).map(p=>byId.get(p.player)).filter(Boolean);
const profile=p=>profiles[p.id]||{value:0,flex:0,order:0};

function pairBonus(a,b){
 const x=profile(a),y=profile(b);
 let score=x.style==='hybrid'||y.style==='hybrid'?12:
  x.style!==y.style?14:x.style==='attack'?-8:-6;
 // Nam-bong can lead an aggressive plan while a partner sustains the main group.
 if((a.id==='남봉'&&y.style==='base')||(b.id==='남봉'&&x.style==='base'))score+=12;
 return score;
}
function teamValue(picks,team){
 const roster=rosterOf(picks,team),damage=roster.filter(p=>p.role==='damage'),support=roster.filter(p=>p.role==='support');
 let value=roster.reduce((sum,p)=>sum+profile(p).value,0);
 value+=damage.reduce((sum,p)=>sum+profile(p).flex*0.6+(profile(p).call||0),0);
 value+=support.reduce((sum,p)=>sum+profile(p).flex*0.5,0);
 const leadership=Math.max(0,...support.map(p=>profile(p).order||0));
 value+=leadership*6*(orderNeed[team]||0);
 // Latest observations: CuVee's positioning is contested; avoid compounding tank instability.
 if(['룩삼','콩콩'].includes(team)&&damage.some(p=>p.id==='큐베'))value-=5;
 if(support.length===2)value+=pairBonus(...support);
 if(team==='울프'&&support.some(p=>p.id==='임나은'))value+=12;
 if(damage.length===2){
  // Two development-heavy damage slots remain risky even with strong supports.
  const weak=damage.filter(p=>profile(p).value<64).length;
  if(weak===2)value-=team==='울프'?18:32;
  if(damage.some(p=>p.id==='설백')&&damage.some(p=>profile(p).carry>=6))value+=8;
  const strongest=Math.max(...damage.map(p=>profile(p).carry));
  value+=strongest*1.5;
 }
 return value;
}
function candidates(state,team,picks){
 const legal=players.filter(p=>eligible(p,team,picks,state.coachMode));
 const playerSlots=legal.filter(p=>p.role!=='coach');
 return playerSlots.length?playerSlots:legal;
}
function wolfSupportPlan(state,team,picks){
 const roster=rosterOf(picks,team);
 return team==='울프'&&state.order.indexOf(team)===4&&
  !roster.some(p=>p.role==='damage')&&roster.filter(p=>p.role==='support').length<2&&
  !players.some(p=>preferredWolfDamage.has(p.id)&&eligible(p,team,picks,state.coachMode))&&
  !players.some(p=>p.id==='마뫄'&&eligible(p,team,picks,state.coachMode));
}
function immediate(state,team,picks,p,scenario=0){
 const roster=rosterOf(picks,team),damage=roster.filter(p=>p.role==='damage').length,support=roster.filter(p=>p.role==='support').length;
 let score=teamValue([...picks,{player:p.id,team}],team)-teamValue(picks,team);
 if(p.role==='damage'){
  if(!damage)score+=16;
  if(scenario===1)score+=18; // Other captains may prioritize scarce damage players.
  if(!roster.length&&state.order.indexOf(team)<2)score+=10;
 }else if(p.role==='support'){
  if(!support)score+=8;
  // Latest 04:18~04:35 discussions: early support-first can lose the damage pool.
  if(!roster.length&&state.order.indexOf(team)<2)score-=28;
  if(scenario===2)score+=(profile(p).order||0)*(orderNeed[team]||0)*2;
  if(wolfSupportPlan(state,team,picks))score+=48;
 }
 return score;
}
function greedy(state,team,picks,scenario){
 return candidates(state,team,picks).map(p=>({p,score:immediate(state,team,picks,p,scenario)}))
  .sort((a,b)=>b.score-a.score||players.indexOf(a.p)-players.indexOf(b.p))[0]?.p;
}
function owners(state){
 const count=state.coachMode?25:20;
 return Array.isArray(state.turnOwners)&&state.turnOwners.length===count?
  state.turnOwners:Array.from({length:count},(_,i)=>teamAt(i,state.order));
}
function project(state,team,currentIndex,choice,scenario){
 const slots=[...state.picks];slots[currentIndex]={player:choice.id,team};
 const turns=owners(state);
 for(let i=currentIndex+1;i<turns.length;i++){
  if(slots[i])continue;
  const t=turns[i],p=greedy(state,t,slots.filter(Boolean),scenario);
  if(p)slots[i]={player:p.id,team:t};
 }
 const picks=slots.filter(Boolean),own=teamValue(picks,team);
 const rival=state.order.filter(t=>t!==team).map(t=>teamValue(picks,t));
 // Compare the resulting team with the strongest rival, not only isolated value.
 return {score:own-Math.max(...rival)*0.3,picks};
}
export function chooseDraftPlayer(state,team){
 if(!state.order.includes(team))return null;
 const picked=state.picks.filter(Boolean),legal=candidates(state,team,picked);
 if(!legal.length)return null;
 const turns=owners(state);
 const firstEmpty=turns.findIndex((_,i)=>!state.picks[i]);
 // The server normally supplies the current owner. Support direct policy probes too.
 let index=firstEmpty;
 if(turns[index]!==team)index=turns.findIndex((t,i)=>i>=Math.max(0,firstEmpty)&&t===team&&!state.picks[i]);
 if(index<0)return null;
 const scored=legal.map(player=>{
  const forecasts=[0,1,2].map(scenario=>project(state,team,index,player,scenario));
  const scores=forecasts.map(f=>f.score);
  return {player,score:(player.role==='damage'&&preferredWolfDamage.has(player.id)&&!rosterOf(picked,team).some(p=>p.role==='damage')?(state.order.indexOf(team)<2&&rosterOf(picked,team).length===0?42:12):0)+Math.min(...scores)*0.65+scores.reduce((a,b)=>a+b,0)/scores.length*0.35+immediate(state,team,picked,player)*0.12};
 }).sort((a,b)=>b.score-a.score||players.indexOf(a.player)-players.indexOf(b.player));
 const player=scored[0].player,roster=rosterOf(picked,team),reasons=[];
 const laterOwn=turns.some((t,i)=>i>index&&t===team&&!state.picks[i]);
 const laterAny=turns.some((_,i)=>i>index&&!state.picks[i]);
 if(legal.length===1){
  reasons.push(`남은 미선발 후보 중 ${team} 팀의 역할 정원에 맞는 선수는 ${player.name} 한 명뿐`);
 }else if(player.role==='coach'){
  reasons.push('선수 네 명 선발 완료 · 코치 간 실력 비교 근거가 없어 남은 명단 순서로 선택');
 }else{
  if(!laterAny)reasons.push('전체 마지막 픽 · 현재 남은 후보와 역할 정원으로 결정');
  else if(!laterOwn)reasons.push('이 팀의 마지막 픽 · 남은 후보로 현재 팀 구성 완성');
  else reasons.push('남은 스네이크 차례를 3가지 선발 경향으로 예상해 최종 팀 평가 비교');
  const rank=players.filter(p=>p.role===player.role).findIndex(p=>p.id===player.id)+1;
  reasons.push(`사용자 지정 ${player.role==='damage'?'공격':'지원'} 기본 순위 ${rank}위`);
  if(player.role==='damage'){
   if(preferredWolfDamage.has(player.id))reasons.push('상위 공격수 소진 위험 고려');
   if(player.id==='큐베'&&['룩삼','콩콩'].includes(team))reasons.push('최근 포지션 불안 의견을 반영해 조합 평가 감점');
   if(player.id==='설백')reasons.push('메이·전투 콜 보완에 잠정 가점');
   const partner=roster.find(p=>p.role==='damage');
   if(partner)reasons.push(`${partner.name} / 공격 역할·영웅폭 보완 평가`);
  }else{
   if(profile(player).order>=6&&orderNeed[team]>=1)reasons.push('팀장 오더·브리핑 보완 가점');
   if(team==='울프'&&player.id==='임나은')reasons.push('울프와 빠른 템포 호흡에 잠정 가점');
   if(wolfSupportPlan(state,team,picked))reasons.push('상위 공격수 소진 후 지원 중심 전략 비교');
   const partner=roster.find(p=>p.role==='support');
   if(partner)reasons.push(`${partner.name} / 지원 조합 평가 (${profile(partner).style==='base'?'본대 치유':profile(partner).style==='attack'?'공격 기여':'혼합 역할'} + ${profile(player).style==='base'?'본대 치유':profile(player).style==='attack'?'공격 기여':'혼합 역할'})`);
  }
 }
 if(profile(player).uncertain)reasons.push('최근 관측이 적거나 평가가 엇갈림 · 기본 순위를 유지한 잠정 평가');
 return {player,reason:reasons.join(' · '),policyVersion:POLICY_VERSION};
}
