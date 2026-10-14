import {ONLINE_SERVER_URL} from './online-config.js?v=results-v11';
import {initialOrder,players} from '../shared/model.mjs?v=results-v11';

// 연결/권한 상태는 이 모듈에서 관리하고, 선수 화면은 app.js에 맡깁니다.
const $ = selector => document.querySelector(selector);
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const endpoint = () => localStorage.getItem('runnerleague.server-url') || ONLINE_SERVER_URL.trim();
const sessionKey = code => `runnerleague.online.${code}`;
const recoveryKey = code => `${sessionKey(code)}.${endpoint()}`;
let room = null, credentials = null, socket = null, connected = false;
let applyState = () => {}, applyPresence = () => {}, notify = () => {}, retry = null, pending = null;
let stateFingerprint = null;
let requestTimer, copyTimer, connectionTimer;
let showCode = localStorage.getItem('runnerleague.show-code') === 'true';
const mine = () => room?.members.find(member => member.id === credentials?.memberId);
const isHost = () => mine()?.id === room?.hostId;
const canClaim = team => connected && !!room && !room.members.some(member => member.team === team && member.id !== mine()?.id);

// 이전 Render 주소 설정만 정리합니다. 현재 배포 주소와 로컬 테스트 주소는 유지합니다.
const oldEndpoint = localStorage.getItem('runnerleague.server-url');
if (oldEndpoint && /\.onrender\.com\/?$/.test(oldEndpoint)) localStorage.removeItem('runnerleague.server-url');

function recover(code) {
  try { return JSON.parse(localStorage.getItem(recoveryKey(code)) || sessionStorage.getItem(sessionKey(code)) || 'null'); }
  catch { return null; }
}
function remember(value) {
  sessionStorage.setItem(sessionKey(value.code), JSON.stringify(value));
  localStorage.setItem(recoveryKey(value.code), JSON.stringify(value));
  for (const store of [sessionStorage, localStorage]) store.setItem('runnerleague.active-room', value.code);
}
function forget() {
  if (credentials) {
    sessionStorage.removeItem(sessionKey(credentials.code));
    localStorage.removeItem(recoveryKey(credentials.code));
  }
  for (const store of [sessionStorage, localStorage]) store.removeItem('runnerleague.active-room');
}
function clearPending() {
  pending = null;
  clearTimeout(requestTimer);
}
function closeConnecting() {
  clearTimeout(connectionTimer);
  $('#online-connecting')?.close();
}
function showConnecting(text) {
  let dialog = $('#online-connecting');
  if (!dialog) {
    dialog = make('dialog');
    dialog.id = 'online-connecting';
    dialog.innerHTML = '<div class="connection-progress"><span class="connection-spinner" aria-hidden="true"></span><span role="status" id="connection-stage"></span></div><p id="connection-hint"></p>';
    document.body.append(dialog);
  }
  $('#connection-stage').textContent = text;
  $('#connection-hint').textContent = '서버에 연결하고 있습니다.';
  if (!dialog.open) dialog.showModal();
  clearTimeout(connectionTimer);
  connectionTimer = setTimeout(() => { if (dialog.open) $('#connection-hint').textContent = '네트워크 연결을 확인하고 있습니다. 잠시 기다려 주세요.'; }, 8000);
}
function action(name, data = {}) {
  if (!room) return false;
  if (!connected || socket?.readyState !== WebSocket.OPEN) { notify('서버 연결을 기다려 주세요.'); return true; }
  if (pending) { notify('이전 요청을 처리 중입니다.'); return true; }
  const requestId = crypto.randomUUID();
  pending = requestId;
  socket.send(JSON.stringify({type: 'command', action: name, data, revision: room.revision, requestId}));
  requestTimer = setTimeout(() => { if (pending === requestId) { clearPending(); notify('응답을 기다리고 있습니다. 연결 상태를 확인해 주세요.'); } }, 10000);
  return true;
}

// 팀장을 선택하지 않으면 관전입니다. 선택한 카드를 다시 누르면 자리만 비웁니다.
function selectTeam(team) {
  if (!connected) return notify('서버 연결을 기다려 주세요.');
  if (mine()?.team === team) return action('spectate');
  if (!canClaim(team)) return notify('다른 참가자가 선택한 팀입니다.');
  action('claim', {team});
}
function startAvailability() {
  if (!connected) return '서버에 연결 중입니다.';
  if (!room.state.autoPick && initialOrder.some(team => !room.members.some(member => member.team === team && member.connected))) return '자동 선발을 끈 방은 팀장 5명이 모두 접속해야 합니다.';
  return '';
}
function startDraft() {
  const reason = startAvailability();
  if (reason) return notify(reason);
  action('start');
}
async function copyInvite(button) {
  const url = new URL(location.href);
  url.searchParams.set('room', room.code);
  const label = button.querySelector('.button-label') || button;
  const currentCode = room.code;
  try {
    await navigator.clipboard.writeText(url.href);
    label.textContent = '복사되었습니다';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { if (room?.code === currentCode) label.textContent = '초대 링크 복사하기'; }, 1600);
  } catch { notify('링크를 복사하지 못했습니다. 브라우저의 복사 권한을 확인해 주세요.'); }
}
function labeledButton(id, text, className, onclick) {
  const button = make('button', undefined, className);
  button.id = id;
  button.append(make('span', text, 'button-label'));
  button.onclick = onclick;
  return button;
}
function toggleCode() {
  showCode = !showCode;
  localStorage.setItem('runnerleague.show-code', String(showCode));
  refreshChrome();
}

// 이 영역은 재생성하지 않고 값만 갱신해 포커스와 복사 완료 표시를 유지합니다.
function refreshChrome() {
  const navigation = $('.connection-tools');
  if (!navigation) return;
  const onlineMode = !!room;
  if (navigation.dataset.mode !== String(onlineMode)) {
    navigation.replaceChildren();
    navigation.dataset.mode = String(onlineMode);
    if (!onlineMode) {
      navigation.append(labeledButton('open-create-room', '방 만들기', 'primary', () => menu('create')),
        labeledButton('open-online', '방 참가', 'secondary', () => menu('join')));
    } else {
      const open = labeledButton('open-online', '온라인 방', 'secondary', openLobby);
      const role = make('span', '', 'online-role-status'); role.id = 'online-role-status'; role.setAttribute('role', 'status');
      const start = labeledButton('online-start', '드래프트 시작', 'primary', startDraft);
      navigation.append(open, role, start);
    }
  }
  $('#online-turn-timer')?.remove(); // 구버전의 시간 표시가 남아 있어도 정리합니다.
  if (!room) { $('#online-room-toolbar')?.remove(); return; }
  $('#online-role-status').textContent = mine()?.team ? `${mine().team} 팀장` : '관전중입니다.';
  const start = $('#online-start');
  start.hidden = !isHost() || room.state.started;
  start.disabled = !!startAvailability();
  start.title = startAvailability();
  let toolbar = $('#online-room-toolbar');
  if (!toolbar) {
    toolbar = make('div', undefined, 'online-room-toolbar'); toolbar.id = 'online-room-toolbar';
    const status = make('span', '', 'room-status'); status.id = 'online-room-status'; status.setAttribute('role', 'status');
    const code = make('strong', '', 'online-room-code'); code.id = 'online-room-code';
    const toggle = labeledButton('online-code-toggle', '방코드 표시하기', 'secondary', toggleCode);
    toggle.setAttribute('aria-controls', 'online-room-code');
    const copy = labeledButton('online-copy-invite', '초대 링크 복사하기', 'secondary', () => copyInvite(copy));
    toolbar.append(status, code, toggle, copy);
    $('.board-panel > .section-heading')?.append(toolbar);
  }
  $('#online-room-status').textContent = !connected ? '재연결 중' : room.state.resultsConfirmed ? '팀 구성 확정' : room.state.started ? '드래프트 진행 중' : '방 접속 중';
  $('#online-room-status').classList.toggle('reconnecting', !connected);
  $('#online-room-code').hidden = !showCode;
  $('#online-room-code').textContent = room.code;
  $('#online-code-toggle .button-label').textContent = showCode ? '방코드 숨기기' : '방코드 표시하기';
  $('#online-code-toggle').setAttribute('aria-expanded', String(showCode));
}
function receiveState(nextRoom) {
  const wasStarted = !!room?.state.started;
  room = nextRoom;
  connected = true;
  closeConnecting();
  const fingerprint = JSON.stringify(room.state);
  // 참가자 접속 변화만 있으면 선수·결과 화면 전체를 다시 만들지 않습니다.
  if (fingerprint !== stateFingerprint) { stateFingerprint = fingerprint; applyState(room.state); }
  else applyPresence();
  refreshChrome();
  if (room.state.started && !wasStarted) $('#online-lobby')?.close();
  else if ($('#online-lobby')?.open) renderLobby();
}
function connect() {
  clearTimeout(retry);
  connected = false;
  const url = new URL(endpoint());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws'; url.search = ''; url.searchParams.set('code', credentials.code);
  const peer = new WebSocket(url); socket = peer;
  peer.onopen = () => { if (socket === peer && credentials) peer.send(JSON.stringify({type: 'auth', code: credentials.code, token: credentials.token})); };
  peer.onmessage = event => {
    if (socket !== peer || event.data === 'pong') return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'state') receiveState(message.room);
    else if (message.type === 'ack' && message.requestId === pending) clearPending();
    else if (message.type === 'error') {
      if (!message.requestId || message.requestId === pending) clearPending();
      if (message.message === '재접속 정보가 유효하지 않습니다.' || message.message === '방을 찾을 수 없습니다.') {
        forget(); credentials = null; room = null; peer.close(); closeConnecting(); refreshChrome(); menu('join');
      }
      notify(message.message);
    }
  };
  peer.onclose = event => {
    if (socket !== peer) return;
    connected = false; clearPending(); refreshChrome(); applyPresence();
    if (event.code === 4001) return notify('다른 탭에서 같은 참가자로 접속했습니다.');
    if (credentials) retry = setTimeout(connect, 1500);
  };
}
async function enter(create, name, code) {
  const base = endpoint().replace(/\/$/, '');
  if (!base) throw Error('온라인 서버 주소를 확인하세요.');
  showConnecting(create ? '온라인 방을 만들고 있습니다…' : '온라인 방에 접속 중…');
  try {
    const saved = code ? recover(code) : null;
    const response = await fetch(base + (create ? '/rooms' : `/rooms/${code}/join`), {
      method: 'POST', headers: {'Content-Type': 'text/plain;charset=UTF-8'}, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({name: name || (create ? '방장' : '참가자'), token: saved?.token,
        ...(create ? {autoPick: $('#create-auto-pick').checked} : {})})
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '방에 접속하지 못했습니다.');
    credentials = data; remember(data);
    const link = new URL(location.href); link.searchParams.set('room', data.code); history.replaceState(null, '', link);
    $('#online-menu')?.close(); connect();
  } catch (error) { closeConnecting(); throw error; }
}
function menu(mode = 'join') {
  let dialog = $('#online-menu');
  if (!dialog) {
    dialog = make('dialog'); dialog.id = 'online-menu';
    dialog.innerHTML = '<h2></h2><p class="dialog-description"></p><label>참가자 이름 (선택)<input id="online-name" maxlength="24" placeholder="생략하면 방장 / 참가자"></label><label id="online-code-label">방 코드<input id="online-code" maxlength="6" placeholder="초대받은 6자리 코드"></label><section id="create-settings"><h3>드래프트 순서</h3><div id="create-order"></div><label class="auto-pick-label"><input id="create-auto-pick" type="checkbox" checked> 빈 팀 · 연결 끊긴 팀 자동 선발</label><p>팀장 없는 팀은 AI가 선발합니다. 연결이 끊긴 팀장은 30초 동안 재접속을 기다립니다.</p></section><p id="online-status" role="status"></p><div class="online-menu-actions"><button id="mode-solo" class="secondary">닫기</button><button id="mode-create" class="primary">방 만들기</button><button id="mode-join" class="primary">방 참가하기</button></div>';
    document.body.append(dialog);
    $('#mode-solo').onclick = () => dialog.close();
    for (const [id, create] of [['#mode-create', true], ['#mode-join', false]]) {
      $(id).onclick = async () => {
        const code = $('#online-code').value.trim().toUpperCase();
        try {
          if (!create && !/^[A-Z0-9]{6}$/.test(code)) throw Error('6자리 방 코드를 입력하세요.');
          $('#mode-create').disabled = $('#mode-join').disabled = true;
          $('#online-status').textContent = '접속 중…';
          await enter(create, $('#online-name').value.trim(), code);
        } catch (error) { $('#online-status').textContent = error.message; }
        finally { $('#mode-create').disabled = $('#mode-join').disabled = false; }
      };
    }
    const box = $('#create-order');
    initialOrder.forEach((team, index) => {
      const card = make('div', undefined, 'create-order-card');
      const image = make('img'); image.src = players.find(player => player.id === team).image; image.alt = team;
      card.append(make('small', `${index + 1}번`), image); box.append(card);
    });
  }
  const create = mode === 'create';
  dialog.querySelector('h2').textContent = create ? '온라인 방 만들기' : '온라인 방 참가';
  dialog.querySelector('.dialog-description').textContent = create ? '방을 만들고 팀장들과 함께 선발하세요.' : '방 코드를 입력해 접속하세요.';
  $('#online-code-label').hidden = create; $('#create-settings').hidden = !create;
  $('#mode-create').hidden = !create; $('#mode-join').hidden = create;
  $('#online-code').value = new URL(location.href).searchParams.get('room') || '';
  $('#online-status').textContent = '';
  if (!dialog.open) dialog.showModal();
}
function renderLobby() {
  const dialog = $('#online-lobby');
  if (!dialog || !room) return;
  dialog.replaceChildren();
  const title = make('div', undefined, 'online-lobby-title');
  title.append(make('h2', '온라인 방'), make('span', mine()?.team ? `${mine().team} 팀장` : '관전중입니다.', 'online-role-status'));
  dialog.append(title, make('p', '팀장을 선택하거나 메인 화면의 팀장 카드를 누르세요. 선택한 카드를 다시 누르면 자리가 비워집니다.'));
  const teams = make('div', undefined, 'online-team-options');
  room.state.order.forEach((team, index) => {
    const button = make('button', undefined, 'secondary');
    const image = make('img'); image.src = players.find(player => player.id === team).image; image.alt = team;
    const owner = room.members.find(member => member.team === team);
    button.append(make('small', `${index + 1}번`), image, make('strong', team), make('small', owner ? owner.name : '선택 가능'));
    button.disabled = !canClaim(team); button.dataset.onlineTeam = team;
    button.setAttribute('aria-pressed', String(mine()?.team === team));
    button.onclick = () => selectTeam(team); teams.append(button);
  });
  dialog.append(teams);
  const members = make('div', undefined, 'online-members');
  for (const member of room.members) {
    const row = make('div', undefined, 'online-member');
    row.append(make('strong', `${member.name}${member.id === room.hostId ? ' · 방장' : ''}`),
      make('span', [member.team ? `${member.team} 팀장` : '', member.connected ? '접속 중' : '연결 끊김'].filter(Boolean).join(' · ')));
    if (isHost() && !room.state.started && member.team && member.id !== mine()?.id) {
      const release = make('button', '자리 비우기', 'text-btn'); release.onclick = () => action('release', {memberId: member.id}); row.append(release);
    }
    members.append(row);
  }
  dialog.append(members);
  const actions = make('div', undefined, 'dialog-actions');
  const leave = make('button', '방 나가기', 'secondary'); leave.onclick = () => leaveRoom();
  const close = make('button', '닫기', 'primary'); close.onclick = () => dialog.close();
  actions.append(leave, close); dialog.append(actions);
}
function openLobby() {
  if (!room) return;
  let dialog = $('#online-lobby');
  if (!dialog) { dialog = make('dialog'); dialog.id = 'online-lobby'; document.body.append(dialog); }
  renderLobby(); if (!dialog.open) dialog.showModal();
}
function leaveRoom(silent = false) {
  if (credentials) {
    navigator.sendBeacon(endpoint().replace(/\/$/, '') + `/rooms/${credentials.code}/leave`, JSON.stringify({token: credentials.token}));
    forget();
  }
  credentials = null; clearTimeout(retry); clearPending();
  socket?.close(1000, 'site-left'); socket = null; room = null; connected = false;
  if (!silent) {
    const url = new URL(location.href); url.searchParams.delete('room'); location.replace(url.href);
  }
}
window.addEventListener('pagehide', () => leaveRoom(true));
// ping/pong 자동 응답은 휴면 중인 방을 깨우지 않습니다.
setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send('ping'); }, 20000);

export const online = {
  active: () => !!room, host: isHost, connected: () => connected, me: mine, action, canClaim, selectTeam, openLobby,
  canOrder: () => false,
  canPick: team => !room || connected && room.state.started && !room.state.resultsConfirmed && mine()?.team === team,
  init(onState, onNotice, onPresence) {
    applyState = onState; notify = onNotice; applyPresence = onPresence || (() => {});
    const navigation = make('div', undefined, 'connection-tools'); $('.header-right').prepend(navigation); refreshChrome();
    const code = new URL(location.href).searchParams.get('room') || sessionStorage.getItem('runnerleague.active-room') || localStorage.getItem('runnerleague.active-room');
    const saved = code && recover(code);
    if (saved && endpoint()) { credentials = saved; showConnecting('온라인 방에 다시 접속 중…'); connect(); }
    else if (code) enter(false, '', code).catch(error => { notify(error.message); menu('join'); $('#online-status').textContent = error.message; });
  }
};
