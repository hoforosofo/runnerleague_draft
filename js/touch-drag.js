// Reuse the existing drop handlers and online permissions for touch exchanges.
let gesture=null,suppressUntil=0;
const targetAt=(x,y)=>document.elementFromPoint(x,y)?.closest('[data-captain],[data-create-card],[data-pick-index],[data-edit-tank]');
function send(node,type,data){return node.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data}));}
function markTarget(x,y){
 gesture.target?.classList.remove('touch-drop-target');
 const target=targetAt(x,y);gesture.target=target;
 if(target&&!send(target,'dragover',gesture.data))target.classList.add('touch-drop-target');
}
function scrollEdge(){
 if(!gesture?.active)return;
 const scroller=gesture.source.closest('dialog,#results'),bounds=scroller?.getBoundingClientRect();
 const top=bounds?.top||0,bottom=bounds?.bottom||innerHeight;
 const speed=gesture.y<top+56?-8:gesture.y>bottom-56?8:0;
 if(speed){if(scroller)scroller.scrollTop+=speed;else window.scrollBy(0,speed);markTarget(gesture.x,gesture.y);}
 gesture.frame=requestAnimationFrame(scrollEdge);
}
function finish(){
 if(!gesture)return;
 clearTimeout(gesture.timer);
 cancelAnimationFrame(gesture.frame);
 if(gesture.active){send(gesture.source,'dragend',gesture.data);suppressUntil=Date.now()+500;}
 gesture.source.classList.remove('touch-drag-source');gesture.target?.classList.remove('touch-drop-target');gesture.ghost?.remove();gesture=null;
}
document.addEventListener('touchstart',e=>{
 if(e.touches.length!==1){finish();return;}
 if(e.target.closest('select,input,textarea,.arrows,.ai-pick-badge'))return;
 const source=e.target.closest('[draggable="true"]');
 if(!source||source.disabled)return;
 const t=e.touches[0];gesture={source,x:t.clientX,y:t.clientY,active:false};
 gesture.timer=setTimeout(()=>{
  if(!gesture||!source.isConnected)return finish();
  const data=new DataTransfer();
  if(!send(source,'dragstart',data))return finish();
  gesture.active=true;gesture.data=data;source.classList.add('touch-drag-source');
  const ghost=source.cloneNode(true),rect=source.getBoundingClientRect();
  ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');ghost.classList.add('touch-drag-ghost');
  Object.assign(ghost.style,{width:`${rect.width}px`,height:`${rect.height}px`,left:`${gesture.x}px`,top:`${gesture.y}px`});
  document.body.append(ghost);gesture.ghost=ghost;gesture.frame=requestAnimationFrame(scrollEdge);
 },350);
},{passive:true});
document.addEventListener('touchmove',e=>{
 if(!gesture)return;
 if(e.touches.length!==1)return finish();
 const t=e.touches[0];
 if(!gesture.active){if(Math.hypot(t.clientX-gesture.x,t.clientY-gesture.y)>10)finish();return;}
 e.preventDefault();
 gesture.x=t.clientX;gesture.y=t.clientY;
 gesture.ghost.style.left=`${t.clientX}px`;gesture.ghost.style.top=`${t.clientY}px`;
 markTarget(t.clientX,t.clientY);
},{passive:false});
document.addEventListener('touchend',e=>{
 if(gesture?.active){
  e.preventDefault();const t=e.changedTouches[0],target=targetAt(t.clientX,t.clientY);
  if(target&&!send(target,'dragover',gesture.data))send(target,'drop',gesture.data);
 }
 finish();
},{passive:false});
document.addEventListener('touchcancel',finish,{passive:true});
document.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
