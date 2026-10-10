// Manually interpreted supplied posts. Deltas are provisional policy judgments,
// not measured ability. A post is one source; copied exports are not extra votes.
export const EVIDENCE_AS_OF='2026-10-10T11:37:00+09:00';
export function evidenceWeight(at,reliability=1,asOf=EVIDENCE_AS_OF){
 const age=(Date.parse(asOf)-Date.parse(at))/3600000;
 return Number.isFinite(age)&&age>=0?Math.max(0,Math.min(1,reliability))*2**(-age/6):0;
}
export function weightedAdjustment(signals,key,asOf=EVIDENCE_AS_OF){
 const seen=new Set();let numerator=0,denominator=1;
 for(const s of signals){
  const identity=`${s.source}:${key}`;
  if(s.key!==key||seen.has(identity))continue;
  seen.add(identity);
  const w=evidenceWeight(s.at,s.reliability,asOf);
  numerator+=s.delta*w;denominator+=w;
 }
 return Math.max(-6,Math.min(6,numerator/denominator));
}
const signal=(source,time,key,delta,reliability)=>({source,at:`2026-10-10T${time}:00+09:00`,key,delta,reliability});
export const signals=[
 signal('10430625701','05:05','인섹',4,.55),
 signal('10430961628','10:33','남봉',6,.55),
 signal('10431068939','11:12','인섹',6,.65),
 signal('10430947805','10:26','아야츠노 유니',3,.55),
 signal('10431011246','10:56','아야츠노 유니',-2,.5),
 signal('10431066145','11:12','아야츠노 유니',-2,.4),
 signal('10430998063','10:50','삐부',5,.55),
 signal('10430987170','10:45','큐베',4,.25),
 signal('10431000087','10:51','큐베',-2,.55),
 signal('10431110829','11:24','양아지+유니',8,.6),
 signal('10431130242','11:30','양아지+유니',6,.55),
 signal('10430697967','07:40','둥그레 오더 의존',-0.4,.55),
];
export const adjustment=key=>weightedAdjustment(signals,key);
