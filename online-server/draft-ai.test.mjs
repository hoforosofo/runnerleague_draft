import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseDraftPlayer,draftProfile,evaluateDraftTeam} from './draft-ai.mjs';
import {evidenceWeight,weightedAdjustment,signals,WOLF_PROFILES} from './draft-evidence.mjs';
import {players,initialOrder,eligible,teamAt} from './model.mjs';

test('Newest evidence dominates; copied reports of one event count once',()=>{
 const now='2026-10-13T21:00:00+09:00';
 assert.equal(evidenceWeight('2026-10-13T09:00:00+09:00',1,now),.5);
 assert.equal(evidenceWeight('2026-10-12T21:00:00+09:00',1,now),.25);
 const a={source:'a',event:'same-match',key:'큐베',at:now,reliability:1,delta:6};
 const b={...a,source:'b'};
 assert.equal(weightedAdjustment([a,b],'큐베',now),weightedAdjustment([a],'큐베',now));
 assert.equal(Object.keys(WOLF_PROFILES).length,20);
 assert.ok(signals.every(s=>Number.isFinite(Date.parse(s.at))&&s.source.startsWith('https://www.fmkorea.com/')));
});

test('Observed changes preserve upper-player gaps without inventing universal lower ranks',()=>{
 assert.ok(draftProfile('큐베').value>draftProfile('엘리').value+20);
 assert.ok(draftProfile('정령왕').value>draftProfile('꼴랑이').value+12);
 assert.ok(draftProfile('설백').value>draftProfile('뀨냥냥').value+12);
 for(const id of ['양아지','남봉','인섹','눈꽃','아야츠노 유니'])
  assert.ok(draftProfile(id).value>draftProfile('엘리').value);
 assert.equal(draftProfile('없는 선수'),null);
 assert.equal(draftProfile('인섹').order,5); // A good call is not automatically IGL.
});

test('Damage partner role and Mercy care affect complete team value',()=>{
 const value=ids=>evaluateDraftTeam(ids.map(player=>({player,team:'울프'})),'울프');
 assert.ok(value(['큐베','설백','양아지','서넹'])>value(['큐베','엘리','양아지','서넹']));
 const strong=value(['뱅','마뫄','양아지','삐부'])-value(['뱅','마뫄','양아지','서넹']);
 const sub=value(['큐베','정령왕','양아지','삐부'])-value(['큐베','정령왕','양아지','서넹']);
 assert.ok(strong>sub,'Mercy synergy should depend on the damage players');
});

test('Wolf fifth pair is conditional: double damage and damage/support both exist',()=>{
 const order=['룩삼','콩콩','둥그레','푸린','울프'];
 const pair=ids=>{
  const s={order,picks:ids.map((player,i)=>({player,team:order[i]}))};
  const a=chooseDraftPlayer(s,'울프').player;s.picks.push({player:a.id,team:'울프'});
  const b=chooseDraftPlayer(s,'울프').player;
  return [a,b];
 };
 assert.deepEqual(new Set(pair(['김뿡','뱅','남봉','양아지']).map(p=>p.id)),new Set(['큐베','디디디용']));
 assert.deepEqual(new Set(pair(['김뿡','뱅','디디디용','마뫄']).map(p=>p.role)),new Set(['damage','support']));
});

function permutations(a){return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]]}
test('All 120 captain orders finish 20 unique legal picks with correct quotas',()=>{
 for(const order of permutations(initialOrder)){
  const s={order,picks:[],coachMode:false};
  for(let i=0;i<20;i++){
   const team=teamAt(i,order),before=JSON.stringify(s),choice=chooseDraftPlayer(s,team);
   assert.equal(JSON.stringify(s),before,'Decision must not mutate the room');
   assert.ok(choice&&eligible(choice.player,team,s.picks,false));
   assert.equal(choice.reason,undefined);
   s.picks.push({player:choice.player.id,team});
  }
  assert.equal(new Set(s.picks.map(p=>p.player)).size,20);
  for(const team of order)for(const role of ['damage','support'])
   assert.equal(s.picks.filter(p=>p.team===team&&players.find(x=>x.id===p.player).role===role).length,2);
  assert.equal(chooseDraftPlayer(s,order[0]),null);
 }
});

test('Undo holes and swapped turn owners remain legal and preserve existing picks',()=>{
 const s={order:initialOrder,picks:[],turnOwners:Array.from({length:20},(_,i)=>teamAt(i,initialOrder))};
 [s.turnOwners[0],s.turnOwners[1]]=[s.turnOwners[1],s.turnOwners[0]];
 for(let i=0;i<12;i++){const team=s.turnOwners[i],c=chooseDraftPlayer(s,team);s.picks.push({player:c.player.id,team})}
 s.picks[2]=null;
 const before=JSON.stringify(s),c=chooseDraftPlayer(s,s.turnOwners[2]);
 assert.ok(eligible(c.player,s.turnOwners[2],s.picks.filter(Boolean),false));
 assert.equal(JSON.stringify(s),before);
});
