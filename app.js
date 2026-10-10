import {online} from './online.js';
import './touch-drag.js';
import {players,roles,caps,initialOrder,teamAt,eligible} from './model.mjs';
const $=s=>document.querySelector(s),byId=id=>players.find(p=>p.id===id),displayRole=p=>p.name==='미정'?'미정':roles[p.role];
let order=[...initialOrder],picks=[],started=false,coachMode=false,filter='all',coaches={},pendingAction=null,selectedCoachTeam=null,dragCaptain=null;
let tanks=Object.fromEntries(initialOrder.map(team=>[team,team]));
const rosterRank=new Map(players.map((p,i)=>[p.id,i]));
const sortRoster=list=>[...list].sort((a,b)=>rosterRank.get(a.id)-rosterRank.get(b.id));
const colors=['#8fbbff','#c3a0ee','#e6b879','#75cfc7','#df8daa'];
const avatar=(p,extra='')=>p.image?`<img class="avatar ${extra}" src="${p.image}" alt="${p.name}" draggable="false">`:`<span class="avatar photo-empty ${extra}" aria-label="${p.name} 사진 없음">${p.name.slice(0,2)}</span>`;
let turnOwners=[],resultsConfirmed=false,completionPrompted=false,resultView='horizontal';
const total=()=>coachMode?25:20;
const chosen=()=>picks.filter(Boolean);
const nextIndex=()=>{for(let i=0;i<total();i++)if(!picks[i])return i;return -1};
const current=()=>nextIndex()<0?null:turnOwners[nextIndex()];
function schedule(){
 const capacity=total()/5,remaining=Object.fromEntries(order.map(t=>[t,capacity-chosen().filter(p=>p.team===t).length]));
 const queue=[];
 for(let round=0;queue.length<total()-chosen().length;round++){
  const row=round%2?[...order].reverse():order;
  for(const team of row)if(remaining[team]>0){queue.push(team);remaining[team]--}
 }
 turnOwners=Array.from({length:total()},(_,i)=>picks[i]?.team||queue.shift());
}
function removePlayer(id){if(online.action('remove',{player:id}))return;
 const index=picks.findIndex(p=>p?.player===id);
 if(index>=0){picks[index]=null;if(chosen().length===0){started=false;schedule()}render();toast(`${id} 선발 취소 · ${turnOwners[index]} 팀에서 다시 선택하세요.`);return}
 const team=Object.keys(coaches).find(t=>coaches[t]===id);
 if(team){delete coaches[team];render();toast(`${id} 코치 배정을 취소했습니다.`)}
}
function bindRemovals(){document.querySelectorAll('[data-remove-player]').forEach(b=>b.onclick=()=>removePlayer(b.dataset.removePlayer))}

function positionToast(){const box=$('.setup').getBoundingClientRect(),notice=$('#toast');notice.style.left=`${box.left}px`;const header=document.querySelector('header').getBoundingClientRect();notice.style.top=`${Math.max(8,header.top+header.height/2-16)}px`;notice.style.width=`${box.width}px`}
window.addEventListener('resize',positionToast);
let toastTimer;function toast(text){positionToast();$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function moveCaptain(from,to){if(online.action('order',{from,to}))return;if(chosen().length)return;if(to<0||to>=order.length)return;[order[from],order[to]]=[order[to],order[from]];schedule();render();}
function renderCaptains(){ $('#captains').innerHTML=order.map((id,i)=>`<div class="captain" draggable="${chosen().length===0}" data-captain="${id}"><span class="num">${i+1}</span>${avatar(byId(id))}<div><strong>${id}</strong><small>돌격 · 팀장</small></div><div class="arrows"><button aria-label="${id} 순서 앞으로" data-move="${i}" data-delta="-1" ${chosen().length>0||i===0?'disabled':''}>‹</button><button aria-label="${id} 순서 뒤로" data-move="${i}" data-delta="1" ${chosen().length>0||i===4?'disabled':''}>›</button></div></div>`).join('');
 $('#start').hidden=started;$('#edit-order').hidden=true;$('#coach-mode').disabled=chosen().length>0;$('#coach-mode').value=coachMode?'selected':'unselected';$('#order-help').hidden=false;$('#order-help').textContent=chosen().length?'순서 확정':'드래그로 위치 교환';$('#setup-hint').textContent='버튼을 누르거나 선수를 선택하면 순서가 확정됩니다';
 document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>moveCaptain(Number(b.dataset.move),Number(b.dataset.move)+Number(b.dataset.delta)));
 document.querySelectorAll('[data-captain]').forEach(el=>{el.ondragstart=e=>{if(chosen().length||!online.canOrder()){e.preventDefault();return}dragCaptain=el.dataset.captain;e.dataTransfer.setData('text/plain',dragCaptain);e.dataTransfer.effectAllowed='move';el.classList.add('dragging')};el.ondragend=()=>{dragCaptain=null;document.querySelectorAll('.captain').forEach(c=>c.classList.remove('dragging','dragover'))};el.ondragover=e=>{if(dragCaptain){e.preventDefault();el.classList.add('dragover')}};el.ondragleave=()=>el.classList.remove('dragover');el.ondrop=e=>{e.preventDefault();if(dragCaptain){moveCaptain(order.indexOf(dragCaptain),order.indexOf(el.dataset.captain));dragCaptain=null}}});
}
function renderTeams(){const active=current();$('#total-count').textContent=`${chosen().length} / ${total()}`;$('#teams').innerHTML=order.map((team,i)=>{const picked=chosen().filter(p=>p.team===team).map(p=>byId(p.player));let slots=`<div class="slot"><span class="slot-label">돌격</span>${avatar(byId(tanks[team]))}<strong>${team}</strong></div>`;for(const role of (coachMode?['damage','support','coach']:['damage','support'])){let arr=sortRoster(picked.filter(p=>p.role===role));if(role==='coach'&&!coachMode&&coaches[team])arr=[byId(coaches[team])];for(let j=0;j<(role==='coach'?1:2);j++){const p=arr[j];slots+=`<div class="slot"><span class="slot-label">${roles[role]}</span>${p?`${`<button class="selected-player" data-remove-player="${p.id}" aria-label="${p.name} 선발 취소" title="${p.name} · 클릭하여 선발 취소">${avatar(p)}</button>`}<strong>${p.name}${p.name==='미정'?'<small class="undecided">출전 미정</small>':''}</strong>${role==='coach'&&!coachMode?`<button class="remove-coach" data-remove-coach="${team}" aria-label="${team} 팀 코치 배정 취소">×</button>`:''}`:role==='coach'&&!coachMode?`<button class="assign-coach" data-assign="${team}">배정</button>`:'<span class="empty-slot">—</span>'}</div>`}}
return `<article class="team ${active===team?'active':''}"><div class="team-top"><h3>${team} 팀</h3>${active===team?'<span class="picking">선발 중</span>':''}</div><div class="slots">${slots}</div></article>`}).join('');document.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>openCoaches(b.dataset.assign));document.querySelectorAll('[data-remove-coach]').forEach(b=>b.onclick=()=>{if(online.action('removeCoach',{team:b.dataset.removeCoach}))return;delete coaches[b.dataset.removeCoach];render()});}
function renderPool(){const active=current(),available=players.filter(p=>p.role!=='tank'&&(coachMode||p.role!=='coach')&&!chosen().some(x=>x.player===p.id)&&!Object.values(coaches).includes(p.id));$('#pool-count').textContent=`남은 인원 ${available.length}명`;$('#pool-help').textContent=!started?'선수를 누르면 바로 선발됩니다.':active?`${active} 팀 차례입니다. 선수를 클릭하거나 현재 칸에 드래그하세요.`:'선발이 완료되었습니다. 팀 구성을 확인하세요.';
 $('#pool').innerHTML=(coachMode?['damage','support','coach']:['damage','support']).filter(r=>filter==='all'||filter===r).map(role=>{const people=players.filter(p=>p.role===role),remaining=available.filter(p=>p.role===role).length;return `<div class="role-heading" style="color:var(--${role})"><i class="role-icon"></i>${roles[role]}<span>${remaining} / ${people.length}명 남음</span></div><div class="player-grid">${people.map(p=>{const picked=chosen().some(x=>x.player===p.id)||Object.values(coaches).includes(p.id),allowed=active&&online.canPick(active)&&eligible(p,active,chosen(),coachMode);return `<button class="player ${picked?'picked':started&&!allowed?'unavailable':''}" data-player="${p.id}" draggable="${!!allowed}" ${!allowed&&(!picked||online.active()&&!online.host())?'disabled':''} aria-label="${p.name}, ${roles[p.role]}${picked?', 선발 완료':''}" title="${picked?'클릭하여 선발 취소':!coachMode&&p.role==='coach'?'팀 구성에서 코치를 별도 배정하세요':started&&!allowed?'현재 팀의 정원이 찼습니다':p.name}">${avatar(p)}<span class="player-name">${p.name}</span></button>`}).join('')}</div>`}).join('');document.querySelectorAll('[data-player]').forEach(b=>{b.onclick=()=>chosen().some(p=>p.player===b.dataset.player)||Object.values(coaches).includes(b.dataset.player)?removePlayer(b.dataset.player):pick(b.dataset.player);b.ondragstart=e=>{e.dataTransfer.setData('text/plain',b.dataset.player);e.dataTransfer.effectAllowed='copy'}});
 document.querySelectorAll('[data-role]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.role===filter)));
}
function renderBoard(){const active=current(),done=started&&!active;$('#undo').disabled=chosen().length===0;$('#turn-banner').innerHTML=!started?'<span class="turn-number">—</span><div><strong>드래프트 준비</strong><small>팀장 순서는 언제든 바꿀 수 있습니다.</small></div>':done?`<span class="turn-number">✓</span><div><strong>드래프트 완료</strong><small>5개 팀의 구성이 완성되었습니다.</small></div><span class="turn-badge">COMPLETE</span>`:`${avatar(byId(active))}<div><strong>${active} 팀의 선택</strong><small>${Math.floor(nextIndex()/5)+1}라운드 · 전체 ${nextIndex()+1}번째 선발</small></div><span class="turn-badge">NOW PICKING</span>`;$('#progress').style.width=`${chosen().length/total()*100}%`;
 let html=order.map((team,col)=>{let cells='';for(let round=0;round<total()/5;round++){const idx=turnOwners.map((owner,i)=>owner===team?i:-1).filter(i=>i>=0)[round],entry=picks[idx],p=entry?byId(entry.player):null,isCurrent=idx===nextIndex();cells+=`<div class="draft-cell ${p?'filled':''} ${isCurrent?'current':''}" data-pick-index="${idx}" title="${entry?.automatic?'자동 선발':''}" aria-label="${idx+1}번째, ${team} 팀${p?', '+p.name:isCurrent?', 현재 차례':''}"><span class="pick-number">${idx+1}</span>${p?`${`<button class="selected-player" data-remove-player="${p.id}" aria-label="${p.name} 선발 취소" title="${p.name} · 클릭하여 선발 취소">${avatar(p)}</button>`}<strong>${p.name}${p.name==='미정'?'<small class="undecided">출전 미정</small>':''}</strong><span class="role-mini">${displayRole(p)}${entry.automatic?' · AI':''}</span>${entry.automatic?'<span class="ai-pick-badge">AI</span>':''}`:isCurrent?'<small>선수 선택</small>':''}</div>`}return `<div class="draft-team-row ${active===team?'active':''}" style="--rounds:${total()/5}"><div class="board-captain">${avatar(byId(tanks[team]))}<strong>${team}</strong><small>${col+1}팀</small></div>${cells}</div>`}).join('');$('#board').innerHTML=html;

 document.querySelectorAll('[data-pick-index]').forEach(cell=>{
 const index=Number(cell.dataset.pickIndex);cell.draggable=!!picks[index];
 cell.ondragstart=e=>{if(!picks[index]){e.preventDefault();return}e.dataTransfer.setData('application/x-draft-pick',String(index));e.dataTransfer.effectAllowed='move'};
 cell.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-draft-pick')||index===nextIndex())e.preventDefault()};
 cell.ondrop=e=>{e.preventDefault();const source=e.dataTransfer.getData('application/x-draft-pick');if(source!==''){swapPicks(Number(source),index);return}if(index===nextIndex())pick(e.dataTransfer.getData('text/plain'))};
 });

}
function swapPicks(from,to){if(online.action('swap',{from,to}))return;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=total()||to>=total()||from===to||!picks[from])return;
 const updated=Array.from({length:total()},(_,i)=>picks[i]||null),first=updated[from],second=updated[to];
 updated[to]={player:first.player,team:turnOwners[to]};updated[from]=second?{player:second.player,team:turnOwners[from]}:null;
 for(const team of order){const roster=updated.filter(p=>p?.team===team);for(const role of ['damage','support','coach'])if(roster.filter(p=>byId(p.player).role===role).length>caps[role]){toast('팀의 포지션 정원을 초과해 교환할 수 없습니다.');return}}
 picks=updated;render();toast(`${from+1}번과 ${to+1}번 칸의 선수를 교환했습니다.`);
}
function render(){document.body.classList.toggle('no-coaches',!coachMode);if(!coachMode&&filter==='coach')filter='all';document.querySelector('[data-role=coach]').hidden=!coachMode;document.querySelector('.team-section>.section-heading>.muted').textContent=`팀별 공격 2명 · 지원 2명${coachMode?' · 코치 1명':''}`;renderCaptains();renderTeams();renderPool();renderBoard();renderResults();bindRemovals();onlinePermissions()}
function onlinePermissions(){if(!online.active())return;const host=online.host(),canOrder=online.canOrder();$('#start').hidden=started;$('#start').disabled=!host||!online.connected();$('#coach-mode').disabled=!canOrder;$('#order-help').textContent=chosen().length?'순서 확정':'방장이 순서를 설정합니다';document.querySelectorAll('[data-move]').forEach(b=>{if(!canOrder)b.disabled=true});document.querySelectorAll('[data-captain]').forEach(e=>e.draggable=canOrder);document.querySelectorAll('[data-pick-index]').forEach(e=>e.draggable=host&&e.classList.contains('filled'));document.querySelectorAll('[data-remove-player],[data-assign],[data-remove-coach],#undo,#reset,#edit-draft,#restart-draft,#confirm-team,[data-edit-tank]').forEach(b=>{if(!host)b.disabled=true;if(b.hasAttribute('data-edit-tank'))b.draggable=host});}

function pick(id){if(online.action('pick',{player:id}))return;const p=byId(id),team=current(),index=nextIndex();if(!p||!team||!eligible(p,team,chosen(),coachMode)){toast('현재 팀이 선택할 수 없는 참가자입니다.');return;}started=true;picks[index]={player:id,team};render();toast(`${team} 팀 · ${id} 선발`)}
function renderResults(){
 let screen=$('#results');
 if(!screen){screen=document.createElement('section');screen.id='results';screen.setAttribute('aria-label','최종 팀 구성');document.body.append(screen)}
 const complete=chosen().length===total();
 if(!complete){resultsConfirmed=false;completionPrompted=false}
 if(complete&&!resultsConfirmed){
  const button=document.createElement('button');button.id='confirm-team';button.className='primary';button.textContent='팀 구성 확정';button.onclick=()=>{if(online.action('confirm'))return;resultsConfirmed=true;render()};
  $('#turn-banner').append(button);
 }
 screen.hidden=!(complete&&resultsConfirmed);document.body.classList.toggle('show-results',complete&&resultsConfirmed);
 if(!complete||!resultsConfirmed)return;
 screen.classList.toggle('vertical-view',resultView==='vertical');
 screen.innerHTML=`<div class="results-header"><div><small>RUNNER LEAGUE / DRAFT COMPLETE</small><h1>최종 팀 구성</h1><p>선발이 완료되었습니다. 돌격 카드를 드래그하거나 클릭해 다른 팀의 탱커와 교환할 수 있습니다.</p></div><div class="results-actions"><button class="secondary" id="save-result-draft">임시저장</button><button class="secondary" id="load-result-draft">불러오기</button><div class="view-switch" aria-label="팀 구성 보기"><button class="secondary" data-view="horizontal" aria-pressed="${resultView==='horizontal'}">가로 보기</button><button class="secondary" data-view="vertical" aria-pressed="${resultView==='vertical'}">세로 보기</button></div><button class="primary" id="save-results">결과 이미지 저장</button><button class="secondary" id="save-snake-results">드래프트 순서 이미지 저장</button><button class="secondary" id="edit-draft">수정하기</button><button class="primary" id="restart-draft">드래프트 다시하기</button></div></div><div class="results-grid">${order.map((team,i)=>{
 const roster=chosen().filter(p=>p.team===team).map(p=>byId(p.player));

 return `<article class="result-team" style="--team-color:${colors[i]}" aria-label="${tanks[team]} 팀"><div class="result-team-title"><small>TEAM ${String(i+1).padStart(2,'0')}</small><h2>${tanks[team]} 팀</h2></div><div class="result-roster">${(coachMode?['tank','damage','support','coach']:['tank','damage','support']).map(role=>{const list=role==='tank'?[byId(tanks[team])]:sortRoster(roster.filter(p=>p.role===role));return `<div class="result-role"><span>${roles[role]}</span><div>${list.map(p=>role==='tank'?`<div class="result-member"><button class="result-portrait result-tank" draggable="true" data-edit-tank="${team}" aria-label="${p.name} 탱커 교체" title="탱커 교체">${avatar(p)}</button><span class="result-member-meta"><strong>${p.name}</strong><small>${roles[p.role]}</small></span></div>`:`<div class="result-member"><div class="result-portrait">${avatar(p)}</div><span class="result-member-meta"><strong>${p.name}</strong><small>${roles[p.role]}</small></span></div>`).join('')}</div></div>`}).join('')}</div></article>`
 }).join('')}</div>`;
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{resultView=b.dataset.view;renderResults();bindRemovals();onlinePermissions()});
 document.querySelectorAll('[data-edit-tank]').forEach(b=>{
 b.onclick=()=>openTankPicker(b.dataset.editTank);
 b.ondragstart=e=>{e.dataTransfer.setData('application/x-result-tank',b.dataset.editTank);e.dataTransfer.effectAllowed='move'};
 b.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-result-tank'))e.preventDefault()};
 b.ondrop=e=>{e.preventDefault();const source=e.dataTransfer.getData('application/x-result-tank'),target=b.dataset.editTank;if(source===target||!order.includes(source))return;if(online.action('tankSwap',{from:source,to:target}))return;[tanks[source],tanks[target]]=[tanks[target],tanks[source]];render()};
 });
 $('#save-result-draft').onclick=saveDraft;$('#load-result-draft').onclick=openSavedDrafts;
 $('#save-results').onclick=downloadResultsImage;$('#save-snake-results').onclick=downloadSnakeImage;
 $('#edit-draft').onclick=()=>{if(online.action('edit'))return;resultsConfirmed=false;completionPrompted=true;render();window.scrollTo(0,0)};
 $('#restart-draft').onclick=()=>{reset(true);window.scrollTo(0,0)};
}
async function downloadSnakeImage(){
 const button=$('#save-snake-results');if(button.disabled)return;button.disabled=true;button.textContent='저장 중…';
 try{
  await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=960;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f3f6fb';ctx.fillRect(0,0,1600,960);
  const text=(value,x,y,size=18,color='#17243b')=>{ctx.font=`650 ${size}px League, sans-serif`;ctx.fillStyle=color;ctx.fillText(value,x,y)};
  const portrait=async(p,x,y,w,h)=>{if(!p)return;const img=new Image();img.src=p.image;await img.decode();const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight);ctx.drawImage(img,x+(w-img.naturalWidth*scale)/2,y+(h-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale)};
  text('RUNNER LEAGUE / SNAKE DRAFT',32,36,16,'#2463eb');text('스네이크 드래프트 · 선발 순서',32,82,32);
  const rounds=total()/5,cellWidth=1308/rounds;
  for(let round=0;round<rounds;round++)text(`${round+1}라운드`,230+round*cellWidth,122,17,'#7b889d');
  for(const [i,team] of order.entries()){
   const y=145+i*155;ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(32,y,1536,144,12);ctx.fill();
   text(`${i+1} · ${team} 팀`,48,y+23,17);await portrait(byId(team),62,y+33,110,102);
   const indices=turnOwners.map((owner,index)=>owner===team?index:-1).filter(index=>index>=0);
   for(const [round,index] of indices.entries()){
    const x=218+round*cellWidth,entry=picks[index];
    ctx.strokeStyle='#dce5f2';ctx.strokeRect(x,y+8,cellWidth-14,128);
    text(`${String(index+1).padStart(2,'0')}번`,x+10,y+29,17,'#2463eb');
    if(entry)await portrait(byId(entry.player),x+8,y+35,cellWidth-30,95);else text('미선발',x+30,y+85,16,'#7b889d');
   }
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG 생성 실패');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='runnerleague_snake_draft.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(error){toast('드래프트 순서 이미지 저장에 실패했습니다.');console.error(error)}finally{button.disabled=false;button.textContent='드래프트 순서 이미지 저장'}
}
async function downloadResultsImage(){
 const button=$('#save-results');if(!resultsConfirmed||button.disabled)return;button.disabled=true;button.textContent='저장 중…';
 try{
  await document.fonts.ready;
  const vertical=resultView==='vertical',canvas=document.createElement('canvas');canvas.width=vertical?1600:1600;canvas.height=vertical?1060:900;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f3f6fb';ctx.fillRect(0,0,canvas.width,canvas.height);
  const text=(value,x,y,size,color='#17243b',weight=650)=>{ctx.font=`${weight} ${size}px League, sans-serif`;ctx.fillStyle=color;ctx.textAlign='left';ctx.fillText(value,x,y)};
  const box=(x,y,w,h,color,r=14)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill()};
  text('RUNNER LEAGUE / DRAFT COMPLETE',32,34,14,'#2463eb',750);text('최종 팀 구성',32,76,32,'#17243b',800);
  const loadImage=async p=>{if(!p.image)return null;const img=new Image();img.src=p.image;await img.decode();return img};
  const images=new Map(await Promise.all(players.map(async p=>[p.id,await loadImage(p)])));
  const portrait=(p,x,y,w,h)=>{const img=images.get(p.id);if(!img){text(p.name,x,y+h/2,14);return}const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight),iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih)};
  for(const [i,team] of order.entries()){
   const roster=chosen().filter(p=>p.team===team).map(p=>byId(p.player));
   const members=[byId(tanks[team]),...sortRoster(roster.filter(p=>p.role==='damage')),...sortRoster(roster.filter(p=>p.role==='support')),...roster.filter(p=>p.role==='coach')];
   if(vertical){
    const x=32+i*310,y=110,w=296,h=918;box(x,y,w,h,'#fff');box(x,y,w,4,colors[i],2);text(`TEAM ${String(i+1).padStart(2,'0')}`,x+18,y+32,12,'#2463eb',750);text(`${tanks[team]} 팀`,x+18,y+62,22,'#17243b',750);
    members.forEach((p,j)=>{const ry=y+86+j*(798/members.length);portrait(p,x+18,ry+8,82,106);text(p.name,x+114,ry+51,16);text(roles[p.role],x+114,ry+75,12,'#7b889d',500);ctx.fillStyle='#e3eaf4';ctx.fillRect(x+18,ry+129,w-36,1)});
   }else{
    const x=32,y=110+i*151,w=1536,h=139;box(x,y,w,h,'#fff');box(x,y,4,h,colors[i],2);text(`TEAM ${String(i+1).padStart(2,'0')}`,x+18,y+48,12,'#2463eb',750);text(`${tanks[team]} 팀`,x+18,y+78,21,'#17243b',750);
    members.forEach((p,j)=>{const px=x+180+j*(1308/members.length);ctx.font='600 11px League, sans-serif';ctx.fillStyle='#7b889d';ctx.textAlign='center';ctx.fillText(roles[p.role],px+88,y+17);ctx.textAlign='left';portrait(p,px,y+24,176,106)});
   }
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG 생성 실패');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`runnerleague_results_${resultView}.png`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(error){toast('이미지 저장에 실패했습니다. 다시 시도해 주세요.');console.error(error)}finally{button.disabled=false;button.textContent='결과 이미지 저장'}
}
function openTankPicker(team){
 if(!resultsConfirmed)return;
 let dialog=$('#tank-dialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='tank-dialog';dialog.setAttribute('aria-labelledby','tank-title');document.body.append(dialog)}
 dialog.innerHTML=`<h2 id="tank-title">${team} 팀 탱커 교체</h2><p>다른 팀의 탱커를 선택하면 두 팀의 탱커가 서로 교환됩니다.</p><div class="tank-options">${players.filter(p=>p.role==='tank').map(p=>`<button class="tank-option" data-tank="${p.id}" ${tanks[team]===p.id?'disabled':''}>${avatar(p)}<strong>${p.name}</strong></button>`).join('')}</div><button class="secondary" id="close-tank">닫기</button>`;
 dialog.querySelectorAll('[data-tank]').forEach(b=>b.onclick=()=>{const other=order.find(t=>tanks[t]===b.dataset.tank);if(!other||other===team)return;if(online.action('tankSwap',{from:team,to:other})){$('#tank-dialog').close();return}[tanks[team],tanks[other]]=[tanks[other],tanks[team]];dialog.close();render()});
 $('#close-tank').onclick=()=>dialog.close();dialog.showModal();
}
const SAVE_KEY='runnerleague.saved-drafts.v1';
function readSavedDrafts(){const raw=localStorage.getItem(SAVE_KEY);if(!raw)return [];const data=JSON.parse(raw);if(!Array.isArray(data))throw Error('저장 목록 오류');return data}
function snapshotDraft(){return {version:1,order:[...order],picks:picks.map(p=>p?{...p}:null),turnOwners:[...turnOwners],coachMode,coaches:{...coaches},tanks:{...tanks},filter,started,resultsConfirmed,resultView}}
function validSnapshot(s){
 if(!s||s.version!==1||typeof s.coachMode!=='boolean'||!Array.isArray(s.order)||s.order.length!==5||new Set(s.order).size!==5||!s.order.every(t=>initialOrder.includes(t)))return false;
 const count=s.coachMode?25:20;
 if(!Array.isArray(s.picks)||s.picks.length>count||!Array.isArray(s.turnOwners)||s.turnOwners.length!==count||!s.turnOwners.every(t=>s.order.includes(t)))return false;
 if(!s.tanks||!s.coaches||!s.order.every(t=>byId(s.tanks[t])?.role==='tank')||new Set(Object.values(s.tanks)).size!==5)return false;
 const selected=s.picks.filter(Boolean),coachIds=Object.values(s.coaches);
 if(!selected.every((p)=>byId(p.player)&&byId(p.player).role!=='tank'&&s.order.includes(p.team))||!s.picks.every((p,i)=>!p||p.team===s.turnOwners[i]))return false;
 if(!Object.entries(s.coaches).every(([t,id])=>s.order.includes(t)&&byId(id)?.role==='coach')||s.coachMode&&coachIds.length)return false;
 const ids=[...selected.map(p=>p.player),...coachIds];if(new Set(ids).size!==ids.length)return false;
 return s.order.every(t=>['damage','support','coach'].every(role=>selected.filter(p=>p.team===t&&byId(p.player).role===role).length<=(role==='coach'&&!s.coachMode?0:caps[role])));
}
let saveNoticeTimer;
function showSaveNotice(){let notice=$('#save-notice');if(!notice){notice=document.createElement('div');notice.id='save-notice';notice.setAttribute('role','status');document.body.append(notice)}notice.textContent='저장되었습니다. 불러오기 버튼을 통해서 불러올 수 있습니다.';notice.classList.add('show');clearTimeout(saveNoticeTimer);saveNoticeTimer=setTimeout(()=>notice.classList.remove('show'),4500)}
function saveDraft(){
 let dialog=$('#save-name-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='save-name-dialog';dialog.setAttribute('aria-labelledby','save-name-title');dialog.innerHTML='<form id="save-name-form"><h2 id="save-name-title">임시저장</h2><label for="draft-save-name">저장 이름</label><input id="draft-save-name" type="text" maxlength="80" autocomplete="off"><p>이름을 입력하지 않으면 기본 이름으로 저장됩니다.</p><div class="dialog-actions"><button type="button" class="secondary" id="cancel-save-name">취소</button><button type="submit" class="primary" id="accept-save-name">저장</button></div></form>';document.body.append(dialog);$('#cancel-save-name').onclick=()=>dialog.close();$('#save-name-form').onsubmit=e=>{e.preventDefault();try{const saves=readSavedDrafts(),now=new Date(),name=$('#draft-save-name').value.trim()||`임시저장 ${now.toLocaleString('ko-KR')}`,entry={id:crypto.randomUUID(),name,savedAt:now.toISOString(),state:snapshotDraft()};saves.unshift(entry);localStorage.setItem(SAVE_KEY,JSON.stringify(saves));dialog.close();showSaveNotice()}catch(error){toast('임시저장에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.');console.error(error)}}}
 const input=$('#draft-save-name');input.value='';input.placeholder=`임시저장 ${new Date().toLocaleString('ko-KR')}`;dialog.showModal();input.focus();
}
function loadDraft(id){if(online.active()){toast('온라인 방에서는 로컬 저장을 불러올 수 없습니다. 혼자 하기에서 불러오세요.');return}
 try{const saved=readSavedDrafts().find(entry=>entry.id===id);if(!saved||!validSnapshot(saved.state))throw Error('유효하지 않은 저장');const state=saved.state;
 order=[...state.order];picks=state.picks.map(p=>p?{...p}:null);turnOwners=[...state.turnOwners];coachMode=state.coachMode;coaches={};tanks={...state.tanks};filter=['all','damage','support','coach'].includes(state.filter)?state.filter:'all';started=chosen().length>0||!!state.started;resultsConfirmed=!!state.resultsConfirmed;resultView=state.resultView==='vertical'?'vertical':'horizontal';completionPrompted=false;$('#saved-drafts').close();render();toast('임시저장한 드래프트를 불러왔습니다.');
 }catch(error){toast('저장 내용을 불러올 수 없습니다.');console.error(error)}
}
function openSavedDrafts(){
 let dialog=$('#saved-drafts');if(!dialog){dialog=document.createElement('dialog');dialog.id='saved-drafts';dialog.setAttribute('aria-labelledby','saved-title');document.body.append(dialog)}
 dialog.replaceChildren();const heading=document.createElement('h2');heading.id='saved-title';heading.textContent='임시저장 목록';dialog.append(heading);const hint=document.createElement('p');hint.textContent='같은 브라우저에서 저장한 순서와 선발 내역을 불러올 수 있습니다.';dialog.append(hint);
 try{const saves=readSavedDrafts();if(!saves.length){const empty=document.createElement('p');empty.textContent='저장된 드래프트가 없습니다.';dialog.append(empty)}
 const list=document.createElement('div');list.className='saved-list';for(const entry of saves){const row=document.createElement('article');row.className='saved-row';const info=document.createElement('div');const name=document.createElement('strong');name.textContent=entry.name;const detail=document.createElement('small');detail.textContent=`${entry.state?.picks?.filter(Boolean).length||0}명 선발 · ${entry.state?.coachMode?'코치 포함':'코치 미선택'}`;info.append(name,detail);const actions=document.createElement('div');actions.className='saved-actions';const load=document.createElement('button');load.className='primary';load.textContent='불러오기';load.dataset.loadDraft=entry.id;load.onclick=()=>loadDraft(entry.id);const remove=document.createElement('button');remove.className='secondary';remove.textContent='삭제';remove.onclick=()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(readSavedDrafts().filter(s=>s.id!==entry.id)));openSavedDrafts()}catch{toast('삭제하지 못했습니다.')}};const preview=document.createElement('button');preview.className='secondary';preview.textContent='드래프트 현황 확인';preview.dataset.previewDraft=entry.id;preview.onclick=()=>openDraftPreview(entry.id);actions.append(preview,load,remove);row.append(info,actions);list.append(row)}dialog.append(list)
 }catch{const error=document.createElement('p');error.textContent='저장 목록을 읽을 수 없습니다.';dialog.append(error)}
 const close=document.createElement('button');close.className='secondary';close.textContent='닫기';close.onclick=()=>dialog.close();dialog.append(close);if(!dialog.open)dialog.showModal();
}
function openDraftPreview(id){
 let saved;try{saved=readSavedDrafts().find(entry=>entry.id===id);if(!saved||!validSnapshot(saved.state))throw Error('저장 내용 오류')}catch{toast('저장 내용을 확인할 수 없습니다.');return}
 const state=saved.state,selected=state.picks.filter(Boolean),limit=state.coachMode?25:20;let index=-1;for(let i=0;i<limit;i++)if(!state.picks[i]){index=i;break}
 const nextTeam=index<0?null:state.turnOwners[index],assigned=state.coachMode?0:Object.keys(state.coaches).length;
 let dialog=$('#draft-preview');if(!dialog){dialog=document.createElement('dialog');dialog.id='draft-preview';dialog.setAttribute('aria-labelledby','draft-preview-title');document.body.append(dialog)}
 dialog.innerHTML='<div class="preview-head"><div><small>임시저장 / 드래프트 현황</small><h2 id="draft-preview-title"></h2><p id="draft-preview-summary"></p></div><button class="preview-close" aria-label="현황 닫기">×</button></div><div class="preview-progress"><div></div></div><div class="preview-teams"></div><div class="preview-foot"><span>저장된 현황을 확인하는 화면입니다.</span><div><button class="secondary" id="close-draft-preview">닫기</button><button class="primary" id="load-preview-draft">이 상태 불러오기</button></div></div>';
 $('#draft-preview-title').textContent=saved.name;
 const nextText=nextTeam?`다음 차례: ${state.tanks[nextTeam]} 팀`:'선발 완료';
 $('#draft-preview-summary').textContent=`${selected.length} / ${limit}명 선발 · ${nextText} · ${state.coachMode?'코치 포함':'코치 미선택'}`;
 dialog.querySelector('.preview-progress>div').style.width=`${selected.length/limit*100}%`;
 dialog.querySelector('.preview-teams').innerHTML=state.order.map((team,i)=>{
 const roster=[byId(state.tanks[team])];for(const role of (state.coachMode?['damage','support','coach']:['damage','support'])){let group=sortRoster(selected.filter(p=>p.team===team&&byId(p.player).role===role).map(p=>byId(p.player)));if(role==='coach'&&!state.coachMode&&state.coaches[team])group=[byId(state.coaches[team])];for(let j=0;j<(role==='coach'?1:2);j++)roster.push(group[j]||{role})}
 return `<article class="preview-team ${nextTeam===team?'preview-next':''}"><small>TEAM ${i+1}${nextTeam===team?'<b>다음 차례</b>':''}</small><h3>${state.tanks[team]} 팀</h3>${roster.map(p=>`<div class="preview-member">${p.id?avatar(p):'<div class="preview-empty">—</div>'}<div><strong>${p.name||'미선발'}</strong><span>${roles[p.role]}</span></div></div>`).join('')}</article>`
 }).join('');
 dialog.querySelector('.preview-close').onclick=()=>dialog.close();$('#close-draft-preview').onclick=()=>dialog.close();$('#load-preview-draft').onclick=()=>{dialog.close();loadDraft(id)};
 dialog.showModal();
}
function initDraftStorage(){const controls=document.createElement('div');controls.className='draft-save-tools';const save=document.createElement('button');save.className='secondary';save.id='save-draft';save.textContent='임시저장';save.onclick=saveDraft;const load=document.createElement('button');load.className='secondary';load.id='load-drafts';load.textContent='불러오기';load.onclick=openSavedDrafts;controls.append(save,load);document.querySelector('.header-right').prepend(controls)}
function confirmReset(edit){if(!picks.length&&!Object.keys(coaches).length){reset(edit);return;}pendingAction=()=>reset(edit);$('#confirm-title').textContent=edit?'순서를 다시 설정할까요?':'드래프트를 초기화할까요?';$('#accept-confirm').textContent=edit?'다시 설정':'초기화';$('#confirm').showModal()}
function reset(edit){if(online.action('reset'))return;tanks=Object.fromEntries(initialOrder.map(team=>[team,team]));picks=[];coaches={};coachMode=false;started=false;filter='all';schedule();render();toast(edit?'팀장 순서를 다시 정할 수 있습니다.':'선발 내역을 초기화했습니다.')}
function openCoaches(team){selectedCoachTeam=team;$('#coach-description').textContent=`${team} 팀의 코치를 선택하세요.`;$('#coach-options').innerHTML=players.filter(p=>p.role==='coach').map(p=>{const assigned=Object.entries(coaches).find(([,id])=>id===p.id);return `<button class="secondary" data-coach="${p.id}" ${assigned?'disabled':''}>${avatar(p)}<span>${p.name}${assigned?` · ${assigned[0]} 팀`:''}</span></button>`}).join('');document.querySelectorAll('[data-coach]').forEach(b=>b.onclick=()=>{if(online.action('coach',{team:selectedCoachTeam,player:b.dataset.coach})){$('#coach-dialog').close();return}coaches[selectedCoachTeam]=b.dataset.coach;$('#coach-dialog').close();render()});$('#coach-dialog').showModal()}
$('#start').onclick=()=>{if(online.action('start'))return;if(started)return;started=true;schedule();render()};$('#coach-mode').onchange=e=>{const enabled=e.target.value==='selected';if(online.action('coachMode',{enabled}))return;coachMode=enabled;coaches={};schedule();render()};$('#undo').onclick=()=>{if(online.action('undo'))return;const last=chosen().at(-1);if(last)removePlayer(last.player)};$('#reset').onclick=()=>confirmReset(false);$('#edit-order').onclick=()=>confirmReset(true);$('#cancel-confirm').onclick=()=>$('#confirm').close();$('#accept-confirm').onclick=()=>{pendingAction?.();$('#confirm').close();pendingAction=null};$('#close-coach').onclick=()=>$('#coach-dialog').close();document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{filter=b.dataset.role;renderPool()});document.querySelectorAll('dialog').forEach(d=>d.onclick=e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}});schedule();render();
initDraftStorage();

online.init(state=>{order=[...state.order];picks=state.picks.map(p=>p?{...p}:null);turnOwners=[...state.turnOwners];coachMode=state.coachMode;coaches={};tanks={...state.tanks};started=state.started;resultsConfirmed=state.resultsConfirmed;render()},toast,()=>[...order]);
