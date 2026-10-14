import {players,eligible,teamAt} from '../../shared/model.mjs';
import {WOLF_PROFILES,adjustment} from './draft-evidence.mjs';
export {EVIDENCE_AS_OF} from './draft-evidence.mjs';
export const POLICY_VERSION='runnerleague-community-v8';
const byId=new Map(players.map(p=>[p.id,p]));
const profiles=Object.fromEntries(Object.entries(WOLF_PROFILES).map(([id,p])=>[id,Object.freeze({...p,value:p.value*.85+p.prior*.15+adjustment(id)})]));
const tankNeeds={
 '둥그레':{order:1.2,heal:8},'룩삼':{order:1.3,heal:7},
 '콩콩':{order:1.25,heal:7},'푸린':{order:.55,heal:5},'울프':{order:.15,heal:6}
};
export function draftProfile(id){return profiles[id]||null}
const profile=p=>profiles[p.id];
const rosterOf=(picks,team)=>picks.filter(p=>p.team===team).map(p=>byId.get(p.player)).filter(p=>p&&profiles[p.id]);
const mainFit=p=>profile(p).style==='main'?1:profile(p).style==='flex'?.9:.5;
const subFit=p=>profile(p).style==='sub'?1:profile(p).style==='flex'?.9:.55;
const preference=(team,id)=>{
 const recent=adjustment(team+'+'+id);
 if(team==='둥그레'&&['큐베','아야츠노 유니'].includes(id))return recent*3;
 if(team==='푸린'&&id==='디디디용')return recent*3;
 if(team==='푸린'&&['마뫄','양아지'].includes(id))return recent;
 if(team==='룩삼'&&id==='임나은')return recent;
 if(team==='울프'&&id==='마뫄')return recent;
 if(team==='룩삼'&&id==='뱅')return 7;
 if(team==='콩콩'&&id==='김뿡')return 4;
 if(team==='푸린'&&id==='눈꽃')return adjustment('푸린+눈꽃');
 if(team==='콩콩'&&id==='눈꽃')return adjustment('콩콩+눈꽃');
 if(team==='콩콩'&&id==='서넹')return adjustment('콩콩+서넹');
 if(team==='울프'&&id==='디디디용')return adjustment('울프+디디디용');
 if(team==='울프'&&id==='인섹')return 5;
 return 0;
};
export function evaluateDraftTeam(picks,team){
 const roster=rosterOf(picks,team),d=roster.filter(p=>p.role==='damage'),h=roster.filter(p=>p.role==='support'),need=tankNeeds[team]||{order:1,heal:6};
 let score=roster.reduce((sum,p)=>sum+profile(p).value+preference(team,p.id)+profile(p).flex*.4+profile(p).stability*.35,0);
 const leader=Math.max(0,...roster.map(p=>profile(p).order));
 score+=Math.min(18,leader*need.order*1.6);
 if(d.length===2){
  score+=Math.max(mainFit(d[0])+subFit(d[1]),mainFit(d[1])+subFit(d[0]))*6;
  if(d.every(p=>profile(p).value<76))score-=54;
  const heroUnion=new Set(d.flatMap(p=>profile(p).heroes));
  if(heroUnion.size<3)score-=7; // One shared comfort pick is vulnerable to bans.
 }
 if(h.length===2){
  const [a,b]=h.map(profile);
  score+=a.style==='hybrid'||b.style==='hybrid'?9:a.style!==b.style?11:-5;
  score+=Math.min(10,Math.max(a.care,b.care));
  // Both aggressive healers can work, but must account for the care they provide.
  const supply=a.care+b.care, demand=need.heal+d.reduce((sum,p)=>sum+profile(p).resource,0);
  score-=Math.max(0,demand-supply)*2;
  const mercy=h.find(p=>p.id==='삐부'||p.id==='담유이');
  if(mercy&&d.some(p=>mainFit(p)>=.9&&profile(p).carry>=8))score+=adjustment(mercy.id+'+멘딜')+4;
  if(h.some(p=>p.id==='남봉')&&d.some(p=>p.id==='큐베'))score+=adjustment('큐베+남봉');
  if(h.some(p=>p.id==='아야츠노 유니')&&h.some(p=>p.id==='삐부'))score+=adjustment('유니+삐부');
 }
 // A clearer caller is particularly useful to a mechanically strong tank.
 if(team==='둥그레'&&h.some(p=>p.id==='남봉'))score+=9;
 if(team==='푸린'&&h.some(p=>p.id==='남봉')&&d.some(p=>p.id==='큐베'))score+=6;
 if(team==='울프'&&d.some(p=>p.id==='큐베'))score+=adjustment('울프+큐베');
 return score;
}
function candidates(state,team,picks){return players.filter(p=>profiles[p.id]&&eligible(p,team,picks,false))}
function marginal(state,team,picks,p,scenario=0){
 const roster=rosterOf(picks,team),d=roster.filter(p=>p.role==='damage'),h=roster.filter(p=>p.role==='support');
 let score=evaluateDraftTeam([...picks,{player:p.id,team}],team)-evaluateDraftTeam(picks,team);
 if(p.role==='damage'){
  if(!d.length)score+=12;
  if(scenario===1)score+=10;
  if(d.length&&mainFit(d[0])<.8&&mainFit(p)>=.9)score+=6;
 }else{
  if(!h.length)score+=5;
  if(scenario===2)score+=profile(p).order*(tankNeeds[team]?.order||0);
 }
 return score;
}
function greedy(state,team,picks,scenario){
 return candidates(state,team,picks).map(p=>({p,score:marginal(state,team,picks,p,scenario)}))
 .sort((a,b)=>b.score-a.score||players.indexOf(a.p)-players.indexOf(b.p))[0]?.p;
}
function owners(state){
 return Array.isArray(state.turnOwners)&&state.turnOwners.length===20?state.turnOwners:
 Array.from({length:20},(_,i)=>teamAt(i,state.order));
}
function projection(state,team,index,player,scenario){
 const slots=Array.from({length:20},(_,i)=>state.picks[i]||null),turns=owners(state);
 slots[index]={player:player.id,team};
 for(let i=index+1;i<20;i++){
  if(slots[i])continue;
  const picks=slots.filter(Boolean),t=turns[i],p=greedy(state,t,picks,scenario);
  if(p)slots[i]={player:p.id,team:t};
 }
 const picks=slots.filter(Boolean),own=evaluateDraftTeam(picks,team),rivals=state.order.filter(t=>t!==team).map(t=>evaluateDraftTeam(picks,t));
 return own-Math.max(...rivals)*.22;
}
function openingScore(state,team,picks,p){
 const q=profile(p),need=tankNeeds[team]||{order:1};
 let score=q.value+preference(team,p.id);
 if(p.role==='damage')score+=20;
 else score+=q.order*need.order*1.1;
 if(team==='둥그레'&&p.id==='남봉')score+=7;
 if(team==='푸린'&&p.role==='damage'&&!['김뿡','뱅','큐베'].includes(p.id))score-=adjustment('푸린 상위딜');
 return score;
}
export function rankDraftCandidates(state,team){
 if(!state.order?.includes(team)||!Array.isArray(state.picks))return [];
 const picks=state.picks.filter(Boolean),legal=candidates(state,team,picks),turns=owners(state);
 if(!legal.length)return [];
 const firstEmpty=turns.findIndex((_,i)=>!state.picks[i]);
 let index=firstEmpty;
 if(turns[index]!==team)index=turns.findIndex((t,i)=>i>=Math.max(0,firstEmpty)&&t===team&&!state.picks[i]);
 if(index<0)return [];
 const own=rosterOf(picks,team),opening=index<4&&!own.length;
 // Fresh first-pick observations are soft preferences, never a fixed global order.
 // The last captain evaluates the entire pair instead of copying this shortcut.
 if(opening){
  return legal.map(player=>({player,score:openingScore(state,team,picks,player)}))
   .sort((a,b)=>b.score-a.score||players.indexOf(a.player)-players.indexOf(b.player));
 }
 const firstFour=state.picks.slice(0,4).filter(Boolean);
 const topPair=firstFour.length===4&&firstFour.filter(p=>['양아지','남봉'].includes(p.player)).length===2;
 function scoreChoice(player,working=state,at=index,selected=picks){
  const topHealer=candidates(working,team,selected).some(p=>['양아지','남봉','아야츠노 유니','인섹','눈꽃'].includes(p.id));
  const forecasts=[0,1,2].map(s=>projection(working,team,at,player,s)),mean=forecasts.reduce((a,b)=>a+b,0)/3;
  let score=Math.min(...forecasts)*.6+mean*.4+marginal(working,team,selected,player)*.1;
  if(player.role==='damage'&&profile(player).value<76&&topHealer)score-=14;
  // Latest Wolf statement is conditional on losing both elite supports.
  // Reward a strong complementary damage pair only when it is still possible.
  if(team==='울프'&&at<=5&&topPair&&player.role==='damage'&&profile(player).value>=76){
   const other=legal.filter(p=>p.role==='damage'&&p.id!==player.id&&profile(p).value>=76);
   const roster=rosterOf(selected,team);
   if((roster.length===0&&other.length)||roster.some(p=>p.role==='damage'&&profile(p).value>=76))score+=adjustment('울프 더블딜')*2;
  }
  return score;
 }
 return legal.map(player=>{
  let score=scoreChoice(player);
  if(turns[index+1]===team&&!state.picks[index+1]){
   const slots=[...state.picks];slots[index]={player:player.id,team};
   const working={...state,picks:slots},selected=slots.filter(Boolean);
   const second=candidates(working,team,selected);
   if(second.length)score=Math.max(...second.map(p=>
    scoreChoice(p,working,index+1,selected)-marginal(working,team,selected,p)*.1+
    marginal(working,team,selected,p)*.08+marginal(state,team,picks,player)*.12));
  }
  return {player,score};
 }).sort((a,b)=>b.score-a.score||players.indexOf(a.player)-players.indexOf(b.player));
}
export function chooseDraftPlayer(state,team){
 const choice=rankDraftCandidates(state,team)[0];
 return choice?{player:choice.player,policyVersion:POLICY_VERSION}:null;
}
