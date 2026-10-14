import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseDraftPlayer,draftProfile,evaluateDraftTeam,rankDraftCandidates,POLICY_VERSION} from '../cloudflare-server/ai/draft-ai.mjs';
import {evidenceWeight,weightedAdjustment,signals,WOLF_PROFILES} from '../cloudflare-server/ai/draft-evidence.mjs';
import {players,initialOrder,eligible,teamAt} from '../shared/model.mjs';

test('Latest captain context changes the draft without treating preferences as skill ranks',()=>{
 assert.equal(POLICY_VERSION,'runnerleague-community-v13');
 const s={order:initialOrder,picks:[{player:'뱅',team:'룩삼'},{player:'김뿡',team:'콩콩'}]};
 assert.equal(chooseDraftPlayer(s,'둥그레').player.id,'큐베');
 s.picks.push({player:'큐베',team:'둥그레'});
 assert.equal(chooseDraftPlayer(s,'푸린').player.id,'디디디용');
 s.picks.push({player:'디디디용',team:'푸린'});
 const first=chooseDraftPlayer(s,'울프').player;
 s.picks.push({player:first.id,team:'울프'});
 const second=chooseDraftPlayer(s,'울프').player;
 assert.deepEqual(new Set([first.id,second.id]),new Set(['양아지','마뫄']));
 const legal=rankDraftCandidates(s,'울프');
 assert.ok(legal.some(x=>x.player.id==='남봉'),'Double support remains a considered option, not a prohibited role');
 assert.ok(draftProfile('아야츠노 유니').order<draftProfile('남봉').order,'Preference must not fabricate stronger IGL skill');
});

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
 assert.deepEqual(new Set(pair(['양아지','남봉','아야츠노 유니','인섹']).map(p=>p.id)),new Set(['뱅','김뿡']));
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

// Exercise the complete opening: testing only a hand-built first two picks hid the regression.
test('Full automatic opening keeps top pair, Cuve, DDD and a plausible Wolf pair',()=>{
 const s={order:initialOrder,picks:[]};
 for(let i=0;i<6;i++){
  const team=teamAt(i,s.order),choice=chooseDraftPlayer(s,team);
  s.picks.push({player:choice.player.id,team});
 }
 assert.deepEqual(new Set(s.picks.slice(0,2).map(p=>p.player)),new Set(['김뿡','뱅']));
 assert.equal(s.picks[2].player,'큐베');assert.equal(s.picks[3].player,'디디디용');
 assert.equal(s.picks[4].player,'양아지');
 assert.ok(['남봉','마뫄'].includes(s.picks[5].player));
 const swapped={order:initialOrder,picks:[{player:'김뿡',team:'룩삼'}]};
 assert.equal(chooseDraftPlayer(swapped,'콩콩').player.id,'뱅');
 swapped.picks.push({player:'뱅',team:'콩콩'});
 assert.equal(chooseDraftPlayer(swapped,'둥그레').player.id,'큐베');
});

test('Mercy synergy does not pull Bibu ahead of upper healers in the normal opening',()=>{
 const s={order:initialOrder,picks:[]};
 for(let i=0;i<20;i++){const team=teamAt(i,s.order);s.picks.push({player:chooseDraftPlayer(s,team).player.id,team})}
 const index=id=>s.picks.findIndex(p=>p.player===id);
 for(const healer of ['양아지','남봉','눈꽃','아야츠노 유니','인섹','임나은'])assert.ok(index('삐부')>index(healer),healer);
 assert.deepEqual(players.filter(p=>p.role==='damage').map(p=>p.id),['김뿡','뱅','디디디용','큐베','마뫄','엘리','설백','정령왕','뀨냥냥','꼴랑이']);
});


test('Both supplied Wolf branches follow later team preferences and survive a stolen target',()=>{
 const examples={
  hh:['뱅','김뿡','큐베','디디디용','양아지','남봉'],
  dh:['김뿡','뱅','큐베','디디디용','양아지','마뫄']
 };
 for(const [branch,opening] of Object.entries(examples)){
  const s={order:initialOrder,picks:opening.map((player,i)=>({player,team:teamAt(i,initialOrder)}))};
  const expected=branch==='hh'?['눈꽃','아야츠노 유니','마뫄','인섹','임나은','삐부']:['남봉','아야츠노 유니','눈꽃','인섹','임나은','엘리'];
  for(const id of expected){const team=teamAt(s.picks.length,s.order),choice=chooseDraftPlayer(s,team);assert.equal(choice.player.id,id,branch);s.picks.push({player:choice.player.id,team});}
  // A human can take a forecast target. Recommendations must remain eligible and complete.
  const team=teamAt(s.picks.length,s.order),alternative=players.find(p=>p.id!=='설백'&&eligible(p,team,s.picks,false));s.picks.push({player:alternative.id,team});
  while(s.picks.length<20){const team=teamAt(s.picks.length,s.order),choice=chooseDraftPlayer(s,team);assert.ok(eligible(choice.player,team,s.picks,false));s.picks.push({player:choice.player.id,team});}
  assert.equal(new Set(s.picks.map(p=>p.player)).size,20);
 }
});
