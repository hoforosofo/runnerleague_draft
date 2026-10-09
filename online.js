import {ONLINE_SERVER_URL} from './online-config.js';
import {initialOrder,players} from './model.mjs';
const $=s=>document.querySelector(s);
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node};
let room=null,credentials=null,socket=null,connected=false,apply=()=>{},notify=()=>{},pending=false,retry=null;
const endpoint=()=>localStorage.getItem('runnerleague.server-url')||ONLINE_SERVER_URL.trim()||'';
const sessionKey=code=>`runnerleague.online.${code}`;
const recoveryKey=code=>`${sessionKey(code)}.${endpoint()}`;
const recover=code=>JSON.parse(sessionStorage.getItem(sessionKey(code))||localStorage.getItem(recoveryKey(code))||'null');
const mine=()=>room?.members.find(m=>m.id===credentials?.memberId);
const isHost=()=>mine()?.id===room?.hostId;
function refreshChrome(){
 $('#online-room-bar')?.remove();if(!room)return;
 const bar=el('div',undefined,'online-room-bar');bar.id='online-room-bar';
 const stateText=!connected?'연결 중…':!room.state.started?'팀장 선택 대기':room.state.resultsConfirmed?'팀 구성 확정':'드래프트 진행 중';
 bar.append(el('strong',`방 ${room.code} · ${stateText}`),el('span',`${mine()?.name||''} · ${mine()?.team||'관전'}${isHost()?' · 방장':''}`));
 const lobby=el('button','참가자 / 초대','secondary');lobby.onclick=openLobby;bar.append(lobby);document.querySelector('header').append(bar);
 if(!room.state.started&&(!mine()?.team&&!mine()?.spectator))openLobby();
}
function action(name,data={}){
 if(!room)return false;
 if(!connected||socket?.readyState!==WebSocket.OPEN){notify('서버 연결을 기다려 주세요.');return true}
 if(pending){notify('이전 요청을 처리 중입니다.');return true}pending=true;socket.send(JSON.stringify({type:'command',action:name,data,revision:room.revision}));return true;
}
function connect(){
 clearTimeout(retry);connected=false;const url=new URL(endpoint());url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';socket=new WebSocket(url);
 socket.onopen=()=>socket.send(JSON.stringify({type:'auth',code:credentials.code,token:credentials.token}));
 socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.type==='state'){room=msg.room;connected=true;pending=false;apply(room.state);refreshChrome();if($('#online-lobby')?.open)openLobby()}else if(msg.type==='error'){pending=false;if(msg.message==='재접속 정보가 유효하지 않습니다.'){localStorage.removeItem(recoveryKey(credentials.code));sessionStorage.removeItem(sessionKey(credentials.code));localStorage.removeItem('runnerleague.active-room');sessionStorage.removeItem('runnerleague.active-room');credentials=null;socket.close();room=null;menu()}notify(msg.message);const info=$('#online-status');if(info)info.textContent=msg.message}};
 socket.onclose=e=>{connected=false;pending=false;refreshChrome();if(e.code===4001){notify('다른 탭에서 같은 참가자로 접속했습니다.');return}if(credentials)retry=setTimeout(connect,1500)};
}
async function enter(create,name,code){
 const base=endpoint().replace(/\/$/,'');if(!base)throw Error('먼저 온라인 서버 주소를 설정하세요.');
 const saved=code?recover(code):null;
 const response=await fetch(base+(create?'/rooms':`/rooms/${code}/join`),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name||(create?'방장':'참가자'),token:saved?.token,...(create?{order:[...creationOrder],autoPick:$('#create-auto-pick').checked}:{})})});const data=await response.json();if(!response.ok)throw Error(data.error||'방에 접속하지 못했습니다.');credentials=data;sessionStorage.setItem(sessionKey(data.code),JSON.stringify(data));sessionStorage.setItem('runnerleague.active-room',data.code);localStorage.setItem(recoveryKey(data.code),JSON.stringify(data));localStorage.setItem('runnerleague.active-room',data.code);
 const link=new URL(location.href);link.searchParams.set('room',data.code);history.replaceState(null,'',link);$('#online-menu').close();connect();
}
let creationOrder=[...initialOrder];
function renderCreationOrder(){
 const box=$('#create-order');box.replaceChildren();
 const swap=(from,to)=>{if(from===to||from<0||from>=creationOrder.length)return;[creationOrder[from],creationOrder[to]]=[creationOrder[to],creationOrder[from]];renderCreationOrder()};
 creationOrder.forEach((team,index)=>{
  const card=el('div',undefined,'create-order-card');card.draggable=true;card.dataset.createCard=index;
  const label=el('label',`${index+1}번`),img=el('img'),select=el('select');
  img.src=players.find(p=>p.id===team).image;img.alt=team;img.draggable=false;select.dataset.createOrder=index;
  for(const id of initialOrder){const option=el('option',id);option.value=id;select.append(option)}
  select.value=team;select.onchange=()=>swap(index,creationOrder.indexOf(select.value));
  card.ondragstart=e=>{e.dataTransfer.setData('application/x-create-order',String(index));e.dataTransfer.effectAllowed='move';card.classList.add('dragging')};
  card.ondragend=()=>card.classList.remove('dragging');
  card.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-create-order')){e.preventDefault();e.dataTransfer.dropEffect='move'}};
  card.ondrop=e=>{e.preventDefault();const source=e.dataTransfer.getData('application/x-create-order');if(source!=='')swap(Number(source),index)};
  label.append(img,select);card.append(label);box.append(card);
 });
}
function menu(){
 let dialog=$('#online-menu');if(!dialog){dialog=el('dialog');dialog.id='online-menu';dialog.innerHTML='<h2>러너리그 드래프트</h2><p>혼자 진행하거나 팀장들과 온라인으로 선발하세요.</p><label>참가자 이름 (선택)<input id="online-name" maxlength="24" placeholder="생략하면 방장 / 참가자로 표시"></label><label>방 코드<input id="online-code" maxlength="6" placeholder="초대받은 6자리 코드"></label><details id="online-server-settings"><summary>온라인 서버 설정</summary><label>서버 주소<input id="online-server-url" type="url" placeholder="https://서버주소.onrender.com"></label><p>GitHub Pages 주소가 아닌 별도 온라인 서버 주소입니다.</p></details><details id="create-settings" open><summary>방 생성 설정 · 드래프트 순서</summary><p>카드를 드래그하면 두 팀의 순서가 서로 바뀝니다.</p><div id="create-order"></div><label class="auto-pick-label"><input id="create-auto-pick" type="checkbox" checked> 빈 팀 · 연결 끊긴 팀 자동 선발</label><p>빈 팀은 자동 진행합니다. 연결 끊김은 30초 동안 재접속을 기다립니다. 모두 나가면 자동 선발도 멈춥니다.</p></details><p id="online-status" role="status"></p><div class="online-menu-actions"><button id="mode-solo" class="secondary">혼자 하기</button><button id="mode-create" class="primary">온라인 방 만들기</button><button id="mode-join" class="secondary">방 참가하기</button></div>';document.body.append(dialog);
 $('#mode-solo').onclick=()=>{localStorage.setItem('runnerleague.mode','solo');dialog.close()};
 for(const [id,create] of [['#mode-create',true],['#mode-join',false]])$(id).onclick=async()=>{const code=$('#online-code').value.trim().toUpperCase(),name=$('#online-name').value.trim();try{if(!create&&!/^[A-Z0-9]{6}$/.test(code))throw Error('6자리 방 코드를 입력하세요.');const address=$('#online-server-url').value.trim();if(address){const url=new URL(address);if(!['https:','http:'].includes(url.protocol))throw Error('올바른 서버 주소를 입력하세요.');if(location.protocol==='https:'&&url.protocol!=='https:')throw Error('HTTPS 서버 주소를 입력하세요.');localStorage.setItem('runnerleague.server-url',url.origin)}$('#online-status').textContent='접속 중…';$('#mode-create').disabled=$('#mode-join').disabled=true;await enter(create,name,code)}catch(e){$('#online-status').textContent=e.message}finally{$('#mode-create').disabled=$('#mode-join').disabled=false}};
 }
 renderCreationOrder();$('#online-server-url').value=endpoint();$('#online-code').value=new URL(location.href).searchParams.get('room')||'';$('#online-status').textContent=endpoint()?'':'온라인 기능은 별도 서버 배포 후 사용할 수 있습니다.';$('#online-server-settings').open=!endpoint();dialog.showModal();
}
function openLobby(){
 if(!room)return;let dialog=$('#online-lobby');if(!dialog){dialog=el('dialog');dialog.id='online-lobby';document.body.append(dialog)}dialog.replaceChildren();dialog.append(el('h2',`온라인 방 · ${room.code}`));
 const copy=el('button','초대 링크 복사','secondary');copy.onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(url.href);copy.textContent='복사되었습니다'}catch{notify(url.href)}};dialog.append(copy);
 const waiting=room.members.find(m=>!m.team&&!m.spectator),me=mine();dialog.append(el('p',room.state.started?'드래프트가 시작되었습니다.':waiting?`${waiting.name}님이 팀장 캐릭터를 선택할 차례입니다.`:'팀 선택이 완료되었습니다. 방장이 시작할 수 있습니다.'));
 const members=el('div',undefined,'online-members');for(const m of room.members){const row=el('div',undefined,'online-member');row.append(el('strong',`${m.name}${m.id===room.hostId?' · 방장':''}`),el('span',`${m.team||'미선택'} · ${m.connected?'접속 중':room.state.autoPick?'연결 끊김 · 자동 선발 대기':'연결 끊김'}`));if(isHost()&&!room.state.started&&m.id!==me.id){const release=el('button','자리 비우기','text-btn');release.onclick=()=>action('release',{memberId:m.id});row.append(release)}members.append(row)}if(room.state.autoPick)for(const team of room.state.order)if(!room.members.some(m=>m.team===team)){const row=el('div',undefined,'online-member');row.append(el('strong',`${team} 팀`),el('span','팀장 없음 · 자동 선발'));members.append(row)}dialog.append(members);
 const teams=el('div',undefined,'online-team-options');for(const [index,team] of room.state.order.entries()){const button=el('button',undefined,'secondary');const img=el('img');img.src=players.find(p=>p.id===team).image;img.alt=team;button.append(el('small',`${index+1}번`),img,el('strong',team));button.disabled=room.state.started||waiting?.id!==me?.id||room.members.some(m=>m.team===team);button.dataset.onlineTeam=team;button.onclick=()=>action('claim',{team});teams.append(button)}dialog.append(teams);
 if(isHost()&&!me?.team&&!me?.spectator&&!room.state.started){const spectator=el('button','방장은 관전으로 진행','secondary');spectator.onclick=()=>action('spectate');dialog.append(spectator)}
 const help=el('p','입장 순서대로 팀장을 선택합니다. 재접속하면 기존 팀으로 복귀합니다. 자동 선발은 초반 딜러·지원 확보와 지원 조합을 고려합니다. 울프 5번도 남은 공격수와 최종 조합에 따라 선발합니다. 내전 분석을 실시간으로 수행하지 않습니다.');dialog.append(help);const actions=el('div',undefined,'dialog-actions');const leave=el('button','방 나가기','secondary');leave.onclick=()=>{if(!confirm('방에서 나갈까요? 기존 방은 방 코드로 다시 접속할 수 있습니다.'))return;const previous=credentials;credentials=null;clearTimeout(retry);socket?.close();sessionStorage.removeItem('runnerleague.active-room');localStorage.removeItem('runnerleague.active-room');localStorage.setItem('runnerleague.mode','solo');const url=new URL(location.href);url.searchParams.delete('room');location.replace(url.href)};actions.append(leave);const close=el('button','화면 보기','secondary');close.onclick=()=>dialog.close();actions.append(close);if(isHost()&&!room.state.started){const start=el('button','드래프트 시작','primary');start.id='online-start';start.disabled=!room.state.autoPick&&initialOrder.some(t=>!room.members.some(m=>m.team===t&&m.connected));start.onclick=()=>{dialog.close();action('start')};actions.append(start)}dialog.append(actions);if(!dialog.open)dialog.showModal();
}
export const online={active:()=>!!room,host:isHost,connected:()=>connected,me:mine,action,canPick:team=>!room||connected&&room.state.started&&!room.state.resultsConfirmed&&mine()?.team===team,
 canOrder:()=>!room||isHost()&&!room.state.picks.some(Boolean),openLobby,
 init(onState,onNotice){apply=onState;notify=onNotice;const button=el('button','온라인','secondary');button.id='open-online';button.onclick=()=>room?openLobby():menu();document.querySelector('.header-right').prepend(button);
 const code=new URL(location.href).searchParams.get('room')||sessionStorage.getItem('runnerleague.active-room')||localStorage.getItem('runnerleague.active-room');const saved=code&&recover(code);if(saved&&endpoint()){credentials=saved;connect()}else if(code||localStorage.getItem('runnerleague.mode')!=='solo')menu();}
};
