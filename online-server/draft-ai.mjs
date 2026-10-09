import {players,eligible,teamAt} from './model.mjs';

// Provisional judgments from the supplied 2026-10-08~10 community export.
// Scores are policy weights, not measured skill, win rates, or trained parameters.
export const POLICY_VERSION='runnerleague-community-v2';
const profiles={
 '김뿡':{value:94,flex:8,carry:9},'뱅':{value:94,flex:6,carry:9},
 '디디디용':{value:83,flex:9,carry:6},'마뫄':{value:80,flex:6,carry:6,uncertain:true},
 '큐베':{value:70,flex:5,carry:5},'엘리':{value:68,flex:7,carry:4},
 '설백':{value:63,flex:4,carry:3,call:5},'뀨냥냥':{value:54,flex:3,carry:2},
 '정령왕':{value:54,flex:3,carry:3,uncertain:true},'꼴랑이':{value:51,flex:2,carry:2},
 '양아지':{value:96,style:'hybrid',order:4,flex:9},
 '남봉':{value:86,style:'attack',order:10,flex:7},
 '인섹':{value:82,style:'attack',order:9,flex:5},
 '아야츠노 유니':{value:81,style:'hybrid',order:3,flex:8},
 '눈꽃':{value:80,style:'attack',order:6,flex:6},
 '임나은':{value:80,style:'attack',order:6,flex:6},
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
 value+=leadership*12*(orderNeed[team]||0);
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
  return {player,score:Math.min(...scores)*0.65+scores.reduce((a,b)=>a+b,0)/scores.length*0.35+immediate(state,team,picked,player)*0.04};
 }).sort((a,b)=>b.score-a.score||players.indexOf(a.player)-players.indexOf(b.player));
 const player=scored[0].player,roster=rosterOf(picked,team),reasons=[];
 if(player.role==='coach')reasons.push('선수 구성을 마친 뒤 남은 코치 선발');
 else{
  reasons.push('스네이크 다음 차례와 최종 팀 조합을 예상해 선발');
  if(player.role==='damage'){
   if(preferredWolfDamage.has(player.id))reasons.push('초반 공격수 확보 가치 고려');
   if(player.id==='설백')reasons.push('메이 활용과 전투 콜 보완');
   if(roster.some(p=>p.role==='damage'))reasons.push('공격 역할과 영웅폭의 보완 관계 고려');
  }else{
   if(profile(player).order>=6&&orderNeed[team]>=1)reasons.push('팀장에게 필요한 오더·브리핑 보완');
   if(team==='울프'&&player.id==='임나은')reasons.push('빠른 템포와 울프의 호흡 고려');
   if(wolfSupportPlan(state,team,picked))reasons.push('선호 공격수 소진 후 지원 중심 전략 검토');
   if(roster.some(p=>p.role==='support'))reasons.push('공격 기여와 본대 치유 역할 분담');
  }
  if(profile(player).uncertain)reasons.push('관측이 부족한 선수는 잠정 평가 적용');
 }
 return {player,reason:reasons.join(' · '),policyVersion:POLICY_VERSION};
}
