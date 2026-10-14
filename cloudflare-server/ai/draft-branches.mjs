// User-supplied approximate drafts (Oct 15), not a forced script or skill ranking.
// Bang/Kimbbung opening taste is deliberately independent of these later branches.
export const BRANCH_SOURCES={doubleSupport:'image(20261014-180714).png',mixed:'image(20261014-180819).png'};
export const BRANCH_PICKS={
 doubleSupport:['김뿡','뱅','큐베','디디디용','양아지','남봉','눈꽃','아야츠노 유니','마뫄','인섹','임나은','삐부','설백','엘리','정령왕','뀨냥냥','서넹','담유이','새담','꼴랑이'],
 mixed:['김뿡','뱅','큐베','디디디용','양아지','마뫄','남봉','아야츠노 유니','눈꽃','인섹','임나은','엘리','설백','정령왕','삐부','뀨냥냥','서넹','담유이','새담','꼴랑이']
};
import {initialOrder,teamAt,eligible,players} from '../../shared/model.mjs';
export function branchPreference(state,team,picks,player){
 if(state.order?.some((t,i)=>t!==initialOrder[i]))return 0;
 if(state.turnOwners?.some((t,i)=>t!==teamAt(i,initialOrder)))return 0;
 const opening=state.picks.slice(0,4);
 if(opening.length!==4||!opening.every(Boolean)||!['김뿡','뱅'].every(id=>opening.slice(0,2).some(p=>p.player===id))||opening[2].player!=='큐베'||opening[3].player!=='디디디용')return 0;
 const wolf=picks.filter(p=>p.team==='울프').map(p=>p.player);
 if(team==='울프'&&!wolf.includes(player.id))wolf.push(player.id);
 const branch=wolf.includes('양아지')&&wolf.includes('남봉')?'doubleSupport':wolf.includes('양아지')&&wolf.includes('마뫄')?'mixed':null;
 if(!branch)return 0;
 const targets=BRANCH_PICKS[branch].filter((_,i)=>teamAt(i,initialOrder)===team),position=picks.filter(p=>p.team===team).length,target=targets[position];
 if(player.id===target)return 40;
 // A stolen preferred player does not stall the draft or bypass role quotas.
 const preferred=players.find(p=>p.id===target);
 if(preferred&&eligible(preferred,team,picks,false))return 0;
 return targets.slice(position+1).includes(player.id)?6:0;
}
