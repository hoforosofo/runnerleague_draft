import {players,eligible,teamAt} from './model.mjs';

// Provisional judgments from the supplied 2026-10-08~10 community export.
// Scores are policy weights, not measured skill, win rates, or trained parameters.
export const EVIDENCE_AS_OF='2026-10-10T05:16:00+09:00';
// Latest dated observations override older preferences; unobserved players retain user ranks.
export const POLICY_VERSION='runnerleague-community-v4';
const profiles={
 '김뿡':{value:94,flex:8,carry:9},'뱅':{value:92,flex:6,carry:9},
 '디디디용':{value:88,flex:9,carry:6},'마뫄':{value:85,flex:6,carry:6,uncertain:true},
 '큐베':{value:80,flex:5,carry:5,uncertain:true},'엘리':{value:72,flex:7,carry:4},
 '설백':{value:52,flex:4,carry:3,call:2},'뀨냥냥':{value:48,flex:3,carry:2,uncertain:true},
 '정령왕':{value:47,flex:3,carry:3,uncertain:true},'꼴랑이':{value:46,flex:2,carry:2,uncertain:true},
 '양아지':{value:122,style:'hybrid',order:4,flex:9},
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
 value+=Math.min(20,leadership*2*(orderNeed[team]||0));

 if(support.length===2)value+=pairBonus(...support);
 if(team==='울프'&&support.some(p=>p.id==='임나은'))value+=12;
 if(damage.length===2){
  // Two development-heavy damage slots remain risky even with strong supports.
  const weak=damage.filter(p=>profile(p).value<64).length;
  if(weak===2)value-=team==='울프'?18:32;
  if(damage.some(p=>p.id==='설백')&&damage.some(p=>profile(p).carry>=6))value+=3;
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
  if(!roster.length&&state.order.indexOf(team)<2)score-=8;
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
  return {player,score:(player.role==='damage'&&preferredWolfDamage.has(player.id)&&!rosterOf(picked,team).some(p=>p.role==='damage')?12:0)+Math.min(...scores)*0.65+scores.reduce((a,b)=>a+b,0)/scores.length*0.35+immediate(state,team,picked,player)*0.12};
 }).sort((a,b)=>b.score-a.score||players.indexOf(a.player)-players.indexOf(b.player));
 const player=scored[0].player,roster=rosterOf(picked,team);
 const laterOwn=turns.some((t,i)=>i>index&&t===team&&!state.picks[i]);
 let reason;
 if(legal.length===1)reason='선택 가능한 선수가 이 선수만 남았습니다.';
 else if(player.role==='coach')reason='선수 구성을 마쳐 남은 코치를 선택했습니다.';
 else if(!laterOwn)reason='남은 후보 중 현재 팀 구성을 완성할 선수로 골랐습니다.';
 else if(player.role==='support'&&wolfSupportPlan(state,team,picked))reason='딜러가 먼저 빠져 힐러 중심 구성을 골랐습니다.';
 else if(player.role==='support'&&profile(player).order>=6&&orderNeed[team]>=1)reason='팀의 오더를 보완하려고 골랐습니다.';
 else if(player.role==='support'&&team==='울프'&&player.id==='임나은')reason='울프와의 호흡을 고려해 골랐습니다.';
 else if(player.role==='support'&&roster.some(p=>p.role==='support'))reason='먼저 뽑은 힐러와의 조합을 고려했습니다.';
 else if(player.role==='damage'&&preferredWolfDamage.has(player.id))reason='딜러를 먼저 확보하려고 골랐습니다.';
 else reason='남은 후보 중 팀 조합이 더 낫다고 예상했습니다.';
 return {player,reason,policyVersion:POLICY_VERSION};
}
