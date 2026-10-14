// Display-only slices: source artwork is unchanged. Exclude the old photo outline.
const layouts={
  "김뿡.png": {
    "width": 129,
    "height": 165,
    "caption": 127,
    "trim": 4
  },
  "학살.png": {
    "width": 126,
    "height": 163,
    "caption": 126,
    "trim": 4
  },
  "정령왕.png": {
    "width": 127,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "미정.png": {
    "width": 130,
    "height": 164,
    "caption": 128,
    "trim": 4
  },
  "새담.png": {
    "width": 127,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "뀨냥냥.png": {
    "width": 132,
    "height": 165,
    "caption": 127,
    "trim": 4
  },
  "남봉.png": {
    "width": 136,
    "height": 178,
    "caption": 136,
    "trim": 4
  },
  "룩삼.png": {
    "width": 128,
    "height": 168,
    "caption": 128,
    "trim": 4
  },
  "마뫄.png": {
    "width": 128,
    "height": 165,
    "caption": 127,
    "trim": 4
  },
  "눈꽃.png": {
    "width": 129,
    "height": 166,
    "caption": 127,
    "trim": 4
  },
  "디엠.png": {
    "width": 127,
    "height": 163,
    "caption": 126,
    "trim": 4
  },
  "나무늘보.png": {
    "width": 130,
    "height": 168,
    "caption": 131,
    "trim": 4
  },
  "삐부.png": {
    "width": 132,
    "height": 166,
    "caption": 127,
    "trim": 4
  },
  "양아지.png": {
    "width": 128,
    "height": 166,
    "caption": 128,
    "trim": 4
  },
  "울프.png": {
    "width": 132,
    "height": 171,
    "caption": 131,
    "trim": 4
  },
  "큐베.png": {
    "width": 128,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "짜누.png": {
    "width": 127,
    "height": 163,
    "caption": 126,
    "trim": 4
  },
  "콩콩.png": {
    "width": 127,
    "height": 168,
    "caption": 128,
    "trim": 4
  },
  "꼴랑이.png": {
    "width": 128,
    "height": 165,
    "caption": 127,
    "trim": 4
  },
  "엘리.png": {
    "width": 132,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "유니.png": {
    "width": 129,
    "height": 166,
    "caption": 128,
    "trim": 4
  },
  "둥그레.png": {
    "width": 129,
    "height": 171,
    "caption": 131,
    "trim": 4
  },
  "담유이.png": {
    "width": 128,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "임나은.png": {
    "width": 127,
    "height": 166,
    "caption": 128,
    "trim": 4
  },
  "푸린.png": {
    "width": 128,
    "height": 168,
    "caption": 128,
    "trim": 4
  },
  "인섹.png": {
    "width": 132,
    "height": 166,
    "caption": 128,
    "trim": 4
  },
  "뱅.png": {
    "width": 129,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "서넹.png": {
    "width": 128,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "설백.png": {
    "width": 128,
    "height": 167,
    "caption": 128,
    "trim": 4
  },
  "일루전.png": {
    "width": 127,
    "height": 163,
    "caption": 126,
    "trim": 4
  },
  "디디디용.png": {
    "width": 127,
    "height": 165,
    "caption": 127,
    "trim": 4
  }
};
export function portraitSlices(src,width=128,height=166){
 const name=decodeURIComponent(src.split('?')[0].split('/').pop()),m=layouts[name]||{width,height,caption:Math.round(height*.78),trim:4};
 return {photo:[m.trim,m.trim,m.width-m.trim*2,m.caption-m.trim*2],label:[2,m.caption,m.width-4,m.height-m.caption-1],width:m.width,height:m.height};
}
function sliceStyle(s,w,h){const [x,y,cw,ch]=s;return `left:${-x/cw*100}%;top:${-y/ch*100}%;width:${w/cw*100}%;height:${h/ch*100}%`}
export function portraitMarkup(p,extra='',avatar=true){
 const cls=`${avatar?'avatar ':''}portrait-frame ${extra}`;
 if(!p.image)return `<span class="${cls} photo-empty" aria-label="${p.name} 사진 없음">${p.name.slice(0,2)}</span>`;
 const s=portraitSlices(p.image),share=s.photo[3]/(s.photo[3]+s.label[3])*100;
 return `<span class="${cls}"><span class="portrait-content" style="--photo-share:${share}%"><span class="portrait-photo"><img class="portrait-image" style="${sliceStyle(s.photo,s.width,s.height)}" src="${p.image}" alt="${p.name}" draggable="false"></span><span class="portrait-label" aria-hidden="true"><img class="portrait-image" style="${sliceStyle(s.label,s.width,s.height)}" src="${p.image}" alt="" draggable="false"></span></span></span>`;
}
export function portraitElement(p){const template=document.createElement('template');template.innerHTML=portraitMarkup(p,'',false);return template.content.firstElementChild}
