export const roles={tank:'돌격',damage:'공격',support:'지원',coach:'코치'};
export const caps={damage:2,support:2,coach:1};
const groups={tank:['둥그레','룩삼','울프','콩콩','푸린'],damage:['김뿡','뱅','디디디용','마뫄','큐베','엘리','설백','뀨냥냥','정령왕','꼴랑이'],support:['양아지','남봉','눈꽃','아야츠노 유니','인섹','임나은','삐부','서넹','담유이','새담'],coach:['짜누','일루전','학살','디엠','나무늘보']};
const missing=[];
export const players=Object.entries(groups).flatMap(([role,names])=>names.map(name=>({id:name,name,role,image:missing.includes(name)?null:`assets/${name==='아야츠노 유니'?'유니':name==='소풍왔니'?'소풍':name}.png`})));
export const initialOrder=['푸린','콩콩','룩삼','둥그레','울프'];
export function teamAt(index,order){const round=Math.floor(index/order.length);return order[round%2?order.length-1-index%order.length:index%order.length];}
export function eligible(player,team,picks,coachMode){return player.role!=='tank'&&(coachMode||player.role!=='coach')&&!picks.some(p=>p.player===player.id)&&picks.filter(p=>p.team===team&&players.find(x=>x.id===p.player)?.role===player.role).length<caps[player.role];}
