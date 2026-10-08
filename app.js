import {players,roles,initialOrder,teamAt,eligible} from './model.mjs';
const $=s=>document.querySelector(s),byId=id=>players.find(p=>p.id===id),displayRole=p=>p.name==='미정'?'미정':roles[p.role];
let order=[...initialOrder],picks=[],started=false,coachMode=true,filter='all',coaches={},pendingAction=null,selectedCoachTeam=null,dragCaptain=null;
let tanks=Object.fromEntries(initialOrder.map(team=>[team,team]));
const rosterRank=new Map(players.map((p,i)=>[p.id,i]));
const sortRoster=list=>[...list].sort((a,b)=>rosterRank.get(a.id)-rosterRank.get(b.id));
const colors=['#8fbbff','#c3a0ee','#e6b879','#75cfc7','#df8daa'];
const avatar=(p,extra='')=>p.image?`<img class="avatar ${extra}" src="${p.image}" alt="${p.name}" draggable="false">`:`<span class="avatar photo-empty ${extra}" aria-label="${p.name} 사진 없음">${p.name.slice(0,2)}</span>`;
let turnOwners=[],resultsConfirmed=false,completionPrompted=false;
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
function removePlayer(id){
 const index=picks.findIndex(p=>p?.player===id);
 if(index>=0){picks[index]=null;render();toast(`${id} 선발 취소 · ${turnOwners[index]} 팀에서 다시 선택하세요.`);return}
 const team=Object.keys(coaches).find(t=>coaches[t]===id);
 if(team){delete coaches[team];render();toast(`${id} 코치 배정을 취소했습니다.`)}
}
function bindRemovals(){document.querySelectorAll('[data-remove-player]').forEach(b=>b.onclick=()=>removePlayer(b.dataset.removePlayer))}

let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function moveCaptain(from,to){if(started)return;if(to<0||to>=order.length)return;const [id]=order.splice(from,1);order.splice(to,0,id);schedule();render();}
function renderCaptains(){ $('#captains').innerHTML=order.map((id,i)=>`<div class="captain" draggable="${!started}" data-captain="${id}"><span class="num">${i+1}</span>${avatar(byId(id))}<div><strong>${id}</strong><small>돌격 · 팀장</small></div><div class="arrows"><button aria-label="${id} 순서 앞으로" data-move="${i}" data-delta="-1" ${started||i===0?'disabled':''}>‹</button><button aria-label="${id} 순서 뒤로" data-move="${i}" data-delta="1" ${started||i===4?'disabled':''}>›</button></div></div>`).join('');
 $('#start').hidden=started;$('#edit-order').hidden=true;$('#coach-mode').disabled=started;$('#coach-mode').checked=coachMode;$('#order-help').hidden=false;$('#order-help').textContent=started?'순서 확정':'드래그로 순서 변경';$('#setup-hint').textContent='순서를 정한 후 드래프트를 시작하세요';
 document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>moveCaptain(Number(b.dataset.move),Number(b.dataset.move)+Number(b.dataset.delta)));
 document.querySelectorAll('[data-captain]').forEach(el=>{el.ondragstart=e=>{if(started){e.preventDefault();return}dragCaptain=el.dataset.captain;e.dataTransfer.setData('text/plain',dragCaptain);e.dataTransfer.effectAllowed='move';el.classList.add('dragging')};el.ondragend=()=>{dragCaptain=null;document.querySelectorAll('.captain').forEach(c=>c.classList.remove('dragging','dragover'))};el.ondragover=e=>{if(dragCaptain){e.preventDefault();el.classList.add('dragover')}};el.ondragleave=()=>el.classList.remove('dragover');el.ondrop=e=>{e.preventDefault();if(dragCaptain){moveCaptain(order.indexOf(dragCaptain),order.indexOf(el.dataset.captain));dragCaptain=null}}});
}
function renderTeams(){const active=current();$('#total-count').textContent=`${chosen().length+(!coachMode?Object.keys(coaches).length:0)} / 25`;$('#teams').innerHTML=order.map((team,i)=>{const picked=chosen().filter(p=>p.team===team).map(p=>byId(p.player));let slots=`<div class="slot"><span class="slot-label">돌격</span>${avatar(byId(team))}<strong>${team}</strong></div>`;for(const role of ['damage','support','coach']){let arr=sortRoster(picked.filter(p=>p.role===role));if(role==='coach'&&!coachMode&&coaches[team])arr=[byId(coaches[team])];for(let j=0;j<(role==='coach'?1:2);j++){const p=arr[j];slots+=`<div class="slot"><span class="slot-label">${roles[role]}</span>${p?`${`<button class="selected-player" data-remove-player="${p.id}" aria-label="${p.name} 선발 취소" title="${p.name} · 클릭하여 선발 취소">${avatar(p)}</button>`}<strong>${p.name}${p.name==='미정'?'<small class="undecided">출전 미정</small>':''}</strong>${role==='coach'&&!coachMode?`<button class="remove-coach" data-remove-coach="${team}" aria-label="${team} 팀 코치 배정 취소">×</button>`:''}`:role==='coach'&&!coachMode?`<button class="assign-coach" data-assign="${team}">배정</button>`:'<span class="empty-slot">—</span>'}</div>`}}
return `<article class="team ${active===team?'active':''}"><div class="team-top"><h3>${team} 팀</h3>${active===team?'<span class="picking">선발 중</span>':''}</div><div class="slots">${slots}</div></article>`}).join('');document.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>openCoaches(b.dataset.assign));document.querySelectorAll('[data-remove-coach]').forEach(b=>b.onclick=()=>{delete coaches[b.dataset.removeCoach];render()});}
function renderPool(){const active=current(),available=players.filter(p=>p.role!=='tank'&&!chosen().some(x=>x.player===p.id)&&!Object.values(coaches).includes(p.id));$('#pool-count').textContent=`남은 인원 ${available.length}명`;$('#pool-help').textContent=!started?'선수를 누르면 바로 선발됩니다.':active?`${active} 팀 차례입니다. 선수를 클릭하거나 현재 칸에 드래그하세요.`:'선발이 완료되었습니다. 팀 구성을 확인하세요.';
 $('#pool').innerHTML=['damage','support','coach'].filter(r=>filter==='all'||filter===r).map(role=>{const people=players.filter(p=>p.role===role),remaining=available.filter(p=>p.role===role).length;return `<div class="role-heading" style="color:var(--${role})"><i class="role-icon"></i>${roles[role]}<span>${remaining} / ${people.length}명 남음</span></div><div class="player-grid">${people.map(p=>{const picked=chosen().some(x=>x.player===p.id)||Object.values(coaches).includes(p.id),allowed=started&&active&&eligible(p,active,chosen(),coachMode);return `<button class="player ${picked?'picked':started&&!allowed?'unavailable':''}" data-player="${p.id}" draggable="${!!allowed}" ${!allowed&&!picked?'disabled':''} aria-label="${p.name}, ${roles[p.role]}${picked?', 선발 완료':''}" title="${picked?'클릭하여 선발 취소':!coachMode&&p.role==='coach'?'팀 구성에서 코치를 별도 배정하세요':started&&!allowed?'현재 팀의 정원이 찼습니다':p.name}">${avatar(p)}<span class="player-name">${p.name}</span></button>`}).join('')}</div>`}).join('');document.querySelectorAll('[data-player]').forEach(b=>{b.onclick=()=>chosen().some(p=>p.player===b.dataset.player)||Object.values(coaches).includes(b.dataset.player)?removePlayer(b.dataset.player):pick(b.dataset.player);b.ondragstart=e=>{e.dataTransfer.setData('text/plain',b.dataset.player);e.dataTransfer.effectAllowed='copy'}});
 document.querySelectorAll('[data-role]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.role===filter)));
}
function renderBoard(){const active=current(),done=started&&!active;$('#undo').disabled=chosen().length===0;$('#turn-banner').innerHTML=!started?'<span class="turn-number">—</span><div><strong>드래프트 준비</strong><small>팀장 순서는 언제든 바꿀 수 있습니다.</small></div>':done?`<span class="turn-number">✓</span><div><strong>드래프트 완료</strong><small>${!coachMode&&Object.keys(coaches).length<5?'팀 구성에서 남은 코치를 배정하세요.':'5개 팀의 구성이 완성되었습니다.'}</small></div><span class="turn-badge">COMPLETE</span>`:`${avatar(byId(active))}<div><strong>${active} 팀의 선택</strong><small>${Math.floor(nextIndex()/5)+1}라운드 · 전체 ${nextIndex()+1}번째 선발</small></div><span class="turn-badge">NOW PICKING</span>`;$('#progress').style.width=`${chosen().length/total()*100}%`;
 let html=order.map((team,col)=>{let cells='';for(let round=0;round<total()/5;round++){const idx=turnOwners.map((owner,i)=>owner===team?i:-1).filter(i=>i>=0)[round],entry=picks[idx],p=entry?byId(entry.player):null,isCurrent=idx===nextIndex();cells+=`<div class="draft-cell ${p?'filled':''} ${isCurrent?'current':''}" data-pick-index="${idx}" aria-label="${idx+1}번째, ${team} 팀${p?', '+p.name:isCurrent?', 현재 차례':''}"><span class="pick-number">${idx+1}</span>${p?`${`<button class="selected-player" data-remove-player="${p.id}" aria-label="${p.name} 선발 취소" title="${p.name} · 클릭하여 선발 취소">${avatar(p)}</button>`}<strong>${p.name}${p.name==='미정'?'<small class="undecided">출전 미정</small>':''}</strong><span class="role-mini">${displayRole(p)}</span>`:isCurrent?'<small>선수 선택</small>':''}</div>`}return `<div class="draft-team-row ${active===team?'active':''}" style="--rounds:${total()/5}"><div class="board-captain">${avatar(byId(team))}<strong>${team}</strong><small>${col+1}팀</small></div>${cells}</div>`}).join('');$('#board').innerHTML=html;
 document.querySelectorAll('[data-pick-index]').forEach(cell=>{cell.ondragover=e=>{if(Number(cell.dataset.pickIndex)===nextIndex())e.preventDefault()};cell.ondrop=e=>{e.preventDefault();if(Number(cell.dataset.pickIndex)!==nextIndex())return;pick(e.dataTransfer.getData('text/plain'))}});
}
function render(){renderCaptains();renderTeams();renderPool();renderBoard();renderResults();bindRemovals()}
function pick(id){if(!started)return;const p=byId(id),team=current(),index=nextIndex();if(!p||!team||!eligible(p,team,chosen(),coachMode)){toast('현재 팀이 선택할 수 없는 참가자입니다.');return;}started=true;picks[index]={player:id,team};render();toast(`${team} 팀 · ${id} 선발`)}
function renderResults(){
 let screen=$('#results');
 if(!screen){screen=document.createElement('section');screen.id='results';screen.setAttribute('aria-label','최종 팀 구성');document.body.append(screen)}
 const complete=chosen().length===total()&&(coachMode||Object.keys(coaches).length===5);
 if(!complete){resultsConfirmed=false;completionPrompted=false}
 let confirmation=$('#finish-confirm');
 if(!confirmation){
  confirmation=document.createElement('dialog');confirmation.id='finish-confirm';
  confirmation.setAttribute('aria-labelledby','finish-title');
  confirmation.innerHTML='<h2 id="finish-title">최종 팀 구성을 확정하시겠습니까?</h2><p>확정하면 전체 팀 구성 화면으로 이동합니다.</p><div class="dialog-actions"><button class="secondary" id="finish-edit">계속 수정</button><button class="primary" id="finish-accept">확정</button></div>';
  document.body.append(confirmation);
  $('#finish-edit').onclick=()=>confirmation.close();
  $('#finish-accept').onclick=()=>{resultsConfirmed=true;confirmation.close();render()};
 }
 if(!complete&&confirmation.open)confirmation.close();
 if(complete&&!resultsConfirmed){
  const button=document.createElement('button');button.className='primary';button.textContent='팀 구성 확정';button.onclick=()=>confirmation.showModal();
  $('#turn-banner').append(button);
  if(!completionPrompted){completionPrompted=true;confirmation.showModal()}
 }
 screen.hidden=!(complete&&resultsConfirmed);document.body.classList.toggle('show-results',complete&&resultsConfirmed);
 if(!complete||!resultsConfirmed)return;
 screen.innerHTML=`<div class="results-header"><div><small>RUNNER LEAGUE / DRAFT COMPLETE</small><h1>최종 팀 구성</h1><p>선발이 완료되었습니다. 돌격 카드를 눌러 탱커를 교체할 수 있습니다. 다른 팀의 탱커를 선택하면 서로 교환됩니다.</p></div><button class="primary" id="restart-draft">드래프트 다시하기</button></div><div class="results-grid">${order.map((team,i)=>{
 const roster=chosen().filter(p=>p.team===team).map(p=>byId(p.player));
 if(!coachMode&&coaches[team])roster.push(byId(coaches[team]));
 return `<article class="result-team" style="--team-color:${colors[i]}" aria-label="${tanks[team]} 팀"><div class="result-team-title"><small>TEAM ${String(i+1).padStart(2,'0')}</small><h2>${tanks[team]} 팀</h2></div><div class="result-roster">${['tank','damage','support','coach'].map(role=>{const list=role==='tank'?[byId(tanks[team])]:sortRoster(roster.filter(p=>p.role===role));return `<div class="result-role"><span>${roles[role]}</span><div>${list.map(p=>role==='tank'?`<div class="result-member"><button class="result-portrait result-tank" data-edit-tank="${team}" aria-label="${p.name} 탱커 교체" title="탱커 교체">${avatar(p)}</button></div>`:`<div class="result-member"><div class="result-portrait">${avatar(p)}</div></div>`).join('')}</div></div>`}).join('')}</div></article>`
 }).join('')}</div>`;
 document.querySelectorAll('[data-edit-tank]').forEach(b=>b.onclick=()=>openTankPicker(b.dataset.editTank));
 $('#restart-draft').onclick=()=>{reset(true);window.scrollTo(0,0)};
}
function openTankPicker(team){
 if(!resultsConfirmed)return;
 let dialog=$('#tank-dialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='tank-dialog';dialog.setAttribute('aria-labelledby','tank-title');document.body.append(dialog)}
 dialog.innerHTML=`<h2 id="tank-title">${team} 팀 탱커 교체</h2><p>다른 팀의 탱커를 선택하면 두 팀의 탱커가 서로 교환됩니다.</p><div class="tank-options">${players.filter(p=>p.role==='tank').map(p=>`<button class="tank-option" data-tank="${p.id}" ${tanks[team]===p.id?'disabled':''}>${avatar(p)}<strong>${p.name}</strong></button>`).join('')}</div><button class="secondary" id="close-tank">닫기</button>`;
 dialog.querySelectorAll('[data-tank]').forEach(b=>b.onclick=()=>{const other=order.find(t=>tanks[t]===b.dataset.tank);if(!other||other===team)return;[tanks[team],tanks[other]]=[tanks[other],tanks[team]];dialog.close();render()});
 $('#close-tank').onclick=()=>dialog.close();dialog.showModal();
}
function confirmReset(edit){if(!picks.length&&!Object.keys(coaches).length){reset(edit);return;}pendingAction=()=>reset(edit);$('#confirm-title').textContent=edit?'순서를 다시 설정할까요?':'드래프트를 초기화할까요?';$('#accept-confirm').textContent=edit?'다시 설정':'초기화';$('#confirm').showModal()}
function reset(edit){tanks=Object.fromEntries(initialOrder.map(team=>[team,team]));picks=[];coaches={};started=false;filter='all';schedule();render();toast(edit?'팀장 순서를 다시 정할 수 있습니다.':'선발 내역을 초기화했습니다.')}
function openCoaches(team){selectedCoachTeam=team;$('#coach-description').textContent=`${team} 팀의 코치를 선택하세요.`;$('#coach-options').innerHTML=players.filter(p=>p.role==='coach').map(p=>{const assigned=Object.entries(coaches).find(([,id])=>id===p.id);return `<button class="secondary" data-coach="${p.id}" ${assigned?'disabled':''}>${avatar(p)}<span>${p.name}${assigned?` · ${assigned[0]} 팀`:''}</span></button>`}).join('');document.querySelectorAll('[data-coach]').forEach(b=>b.onclick=()=>{coaches[selectedCoachTeam]=b.dataset.coach;$('#coach-dialog').close();render()});$('#coach-dialog').showModal()}
$('#start').onclick=()=>{if(started)return;started=true;schedule();render()};$('#coach-mode').onchange=e=>{coachMode=e.target.checked;coaches={};schedule();render()};$('#undo').onclick=()=>{const last=chosen().at(-1);if(last)removePlayer(last.player)};$('#reset').onclick=()=>confirmReset(false);$('#edit-order').onclick=()=>confirmReset(true);$('#cancel-confirm').onclick=()=>$('#confirm').close();$('#accept-confirm').onclick=()=>{pendingAction?.();$('#confirm').close();pendingAction=null};$('#close-coach').onclick=()=>$('#coach-dialog').close();document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{filter=b.dataset.role;renderPool()});document.querySelectorAll('dialog').forEach(d=>d.onclick=e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}});schedule();render();
