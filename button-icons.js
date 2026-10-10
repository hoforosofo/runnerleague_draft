const paths={
 match:'M3 7h3c5 0 7 10 12 10h3M17 13l4 4-4 4M3 17h3c2 0 3-2 4-4M14 9c1-1 2-2 4-2h3M17 3l4 4-4 4',
 room:'M3 10l9-7 9 7v11H3V10zM9 21v-8h6v8',
 join:'M14 3h7v18h-7M3 12h12M10 7l5 5-5 5',
 save:'M5 3h12l4 4v14H3V3h2zM7 3v6h10V3M7 21v-8h10v8',
 load:'M3 7h7l2 3h9l-3 11H3V7zM3 7V3h7l2 3h7v4',
 play:'M7 3l14 9-14 9V3z',undo:'M9 4L3 10l6 6M3 10h10a7 7 0 0 1 7 7',
 reset:'M3 9a9 9 0 1 1 0 7M3 3v6h6',edit:'M3 21l4-1L21 6l-3-3L4 17l-1 4z',
 image:'M3 3h18v18H3V3zM3 16l5-5 5 6 3-3 5 6M15 7h1',
 check:'M4 12l5 5L20 6',close:'M5 5l14 14M19 5L5 19',
 users:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M1 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M18 15a5 5 0 0 1 5 5',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
 copy:'M8 8h13v13H8V8zM16 8V3H3v13h5',
};
const ids={'open-random-match':'match','mode-match':'match','open-create-room':'room','mode-create':'room','open-online':'join','mode-join':'join','save-results':'image','save-snake-results':'image','confirm-team':'check','submit-match-vote':'check','start':'play','online-start':'play','undo':'undo','reset':'reset','edit-draft':'edit','restart-draft':'reset','cancel-match':'close'};
const labels={'임시저장':'save','저장':'save','불러오기':'load','드래프트 현황 확인':'eye','닫기':'close','취소':'close','초대 링크 복사':'copy','관전으로 전환':'eye','화면 보기':'eye','방 나가기':'join'};
function decorate(){for(const b of document.querySelectorAll('button')){const key=ids[b.id]||labels[b.textContent.trim()];if(!key||b.querySelector('.button-icon'))continue;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('button-icon');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[key]);svg.append(p);b.prepend(svg);b.classList.add('has-icon')}}
decorate();new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});
