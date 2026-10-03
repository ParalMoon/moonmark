/* Visual Bookmark Atlas — no framework, server or build step. */
(() => {
'use strict';
const C=AtlasCore, K=C.CONFIG, $=id=>document.getElementById(id);
const atlas=$('atlas'),world=$('world'),menu=$('context-menu'),dialog=$('dialog');
const KEY='visualBookmarkAtlas',history=new C.History(),selected=new Set(),views=new Map();
let state=C.empty(),storageBlocked=false;
try { const raw=localStorage.getItem(KEY);if(raw)state=C.validate(JSON.parse(raw)); } catch { storageBlocked=true; }
let pointer=null,release=null,frame=0,lastFrame=0,tooltipTimer=0,toastTimer=0,logoId=null,query='',lastPoint={x:innerWidth/2,y:innerHeight/2},dialogAction=null,dropId=null;
const logoMeasure=document.createElement('canvas').getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const all=()=>[...state.groups,...state.sites];
const find=id=>state.sites.find(n=>n.id===id)||state.groups.find(n=>n.id===id);
const isSite=n=>'url' in n;
const groupOf=s=>state.groups.find(g=>g.id===s.groupId);
const visible=s=>!groupOf(s)?.collapsed;
const logical=(x,y)=>({x:(x-state.settings.offsetX)/state.settings.zoom,y:(y-state.settings.offsetY)/state.settings.zoom});
const screen=(x,y)=>({x:x*state.settings.zoom+state.settings.offsetX,y:y*state.settings.zoom+state.settings.offsetY});
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function save(){if(storageBlocked)return;try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('저장 공간이 부족하거나 저장이 차단됐어요. 데이터를 내보내 백업하세요.');}}
function commit(before){history.push(before,state);save();sync();}
function mutate(fn){finishMotion();const before=C.clone(state);fn();commit(before);}
function hideTooltip(){clearTimeout(tooltipTimer);$('tooltip').hidden=true;}
function closeMenu(){menu.hidden=true;menu.replaceChildren();}
function transformWorld(){const s=state.settings;world.style.transform=`translate(${s.offsetX}px,${s.offsetY}px) scale(${s.zoom})`;}
function setLogo(v,s){
  const signature=JSON.stringify([s.customLogo,s.favicon,s.name,s.url]);if(v.signature===signature)return;v.signature=signature;v.el.replaceChildren();
  const letter=()=>{const span=document.createElement('span');span.className='letter';const text=s.customLogo?.type==='text'?s.customLogo.value:s.name[0]||new URL(s.url).hostname[0];span.textContent=text.slice(0,8);logoMeasure.font=`600 22px ${getComputedStyle(v.el).fontFamily}`;const width=logoMeasure.measureText(span.textContent).width;span.style.fontSize=`${Math.min(22,22*28/Math.max(1,width))}px`;v.el.replaceChildren(span);};
  if(s.customLogo?.type==='text'){letter();return;}
  const sources=[s.customLogo?.type==='image'?s.customLogo.value:null,s.favicon,`${new URL(s.url).origin}/favicon.ico`].filter(Boolean);let index=0;
  const img=document.createElement('img');img.alt='';img.draggable=false;img.referrerPolicy='no-referrer';img.onerror=()=>{if(v.signature!==signature)return;if(++index<sources.length)img.src=sources[index];else letter();};if(sources.length){img.src=sources[0];v.el.append(img);}else letter();
}
function sync(){
  const ids=new Set(all().map(n=>n.id));for(const [id,v] of views){if(!ids.has(id)){v.el.remove();views.delete(id);selected.delete(id);}}
  for(const n of all()){
    let v=views.get(n.id);if(!v){const el=document.createElement('button');el.type='button';el.dataset.id=n.id;el.className=`node ${isSite(n)?'site-node':'group-node'}`;world.append(el);v={el,dx:0,dy:0,vx:0,vy:0,fold:isSite(n)&&groupOf(n)?.collapsed?1:0,signature:null};views.set(n.id,v);}
    v.el.setAttribute('aria-label',isSite(n)?`${n.name} — ${new URL(n.url).hostname}`:`${n.name} 그룹, ${n.collapsed?'접힘':'펼침'}`);
    if(isSite(n)){setLogo(v,n);const size=C.iconSize(n);v.el.style.width=`${size}px`;v.el.style.height=`${size}px`;v.el.setAttribute('aria-pressed',String(selected.has(n.id)));}
    else{let label=v.el.firstElementChild;if(!label){label=document.createElement('span');label.className='group-name';v.el.append(label);}label.textContent=n.name;v.el.classList.toggle('collapsed',n.collapsed);v.el.setAttribute('aria-expanded',String(!n.collapsed));}
  }
  $('welcome').hidden=!!(state.sites.length||state.groups.length);transformWorld();updateEmphasis();wake();
}
function updateEmphasis(){
  const q=query.trim().toLocaleLowerCase();let matches=0;
  for(const n of all()){
    const v=views.get(n.id),g=isSite(n)?groupOf(n):n;if(!v)continue;
    const match=!q||[n.name,isSite(n)?new URL(n.url).hostname:'',g?.name||''].some(t=>t.toLocaleLowerCase().includes(q))||(!isSite(n)&&state.sites.some(s=>s.groupId===n.id&&[s.name,new URL(s.url).hostname].some(t=>t.toLocaleLowerCase().includes(q))));
    if(q&&match)matches++;
    v.el.classList.toggle('selected',selected.has(n.id));v.el.classList.toggle('logo-target',n.id===logoId);v.el.classList.toggle('dim',logoId?n.id!==logoId:!match);v.el.classList.toggle('search-match',!!q&&match);if(isSite(n))v.el.setAttribute('aria-pressed',String(selected.has(n.id)));
  }
  $('search-status').textContent=q?`${matches}개 노드 일치 · 접힌 그룹은 클릭해서 펼칠 수 있어요`:'';
}
function draw(n,v){
  let x=n.x+v.dx,y=n.y+v.dy,scale=1,opacity=1;
  if(isSite(n)) {const g=groupOf(n);if(g&&v.fold>0){x+=(g.x-n.x)*v.fold;y+=(g.y-n.y)*v.fold;scale=1-.85*v.fold;opacity=1-v.fold;}
    const hidden=!!g?.collapsed;v.el.style.pointerEvents=hidden?'none':'';v.el.tabIndex=hidden?-1:0;v.el.setAttribute('aria-hidden',String(hidden));v.el.style.visibility=v.fold>.995?'hidden':'visible';}
  v.el.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) scale(${scale})`;
  v.el.style.opacity=String(opacity);
}
function wake(){if(!frame)frame=requestAnimationFrame(tick);}
function tick(now){
  frame=0;const dt=Math.min(2,Math.max(.3,(now-lastFrame)/16.667||1));lastFrame=now;let active=false;
  if(release){const r=release,t=C.clamp((now-r.start)/K.INERTIA_MS,0,1),ease=1-Math.pow(1-t,3);for(const start of r.items){const n=find(start.id);if(n){n.x=start.x+r.vx*ease;n.y=start.y+r.vy*ease;}}if(t===1){release=null;commit(r.before);}else active=true;}
  const dragging=pointer?.dragging?pointer.ids:release?.items.map(n=>n.id)||[];
  const movers=dragging.map(find).filter(Boolean).filter(n=>!isSite(n)||visible(n));
  for(const n of all()){
    const v=views.get(n.id);if(!v)continue;let tx=0,ty=0;
    if(!reduced.matches&&!dragging.includes(n.id)&&(!isSite(n)||visible(n))){for(const m of movers){let dx=n.x-m.x,dy=n.y-m.y,d=Math.hypot(dx,dy);if(d<K.REPULSION_RADIUS){if(d<1){dx=1;dy=.5;d=1.12;}const force=24*Math.pow(1-d/K.REPULSION_RADIUS,2)*(isSite(n)?1:K.GROUP_RESPONSE);tx+=dx/d*force;ty+=dy/d*force;}}}
    if(reduced.matches){v.dx=v.dy=v.vx=v.vy=0;}else {v.vx=(v.vx+(tx-v.dx)*.16*dt)*Math.pow(.64,dt);v.vy=(v.vy+(ty-v.dy)*.16*dt)*Math.pow(.64,dt);v.dx+=v.vx*dt;v.dy+=v.vy*dt;if(Math.abs(v.dx-tx)+Math.abs(v.dy-ty)+Math.abs(v.vx)+Math.abs(v.vy)<.04){v.dx=tx;v.dy=ty;v.vx=v.vy=0;}else active=true;}
    const target=isSite(n)&&groupOf(n)?.collapsed?1:0;if(reduced.matches)v.fold=target;else if(Math.abs(target-v.fold)>.002){v.fold+=(target-v.fold)*Math.min(1,.24*dt);active=true;}else v.fold=target;
    draw(n,v);
  }
  if(active)wake();
}
function finishMotion(){if(release){const r=release;release=null;for(const start of r.items){const n=find(start.id);if(n){n.x=start.x+r.vx;n.y=start.y+r.vy;}}commit(r.before);}}
function boundedDelta(items,dx,dy){
  const margin=16,lo=logical(margin,margin),hi=logical(innerWidth-margin,innerHeight-margin);
  const minX=Math.min(...items.map(n=>n.x)),maxX=Math.max(...items.map(n=>n.x)),minY=Math.min(...items.map(n=>n.y)),maxY=Math.max(...items.map(n=>n.y));
  return {x:maxX-minX<=hi.x-lo.x?C.clamp(dx,lo.x-minX,hi.x-maxX):C.clamp(dx,lo.x-items[0].x,hi.x-items[0].x),y:maxY-minY<=hi.y-lo.y?C.clamp(dy,lo.y-minY,hi.y-maxY):C.clamp(dy,lo.y-items[0].y,hi.y-items[0].y)};
}
function openSite(s){window.open(s.url,'_blank','noopener,noreferrer');s.recentVisits.push(Date.now());s.recentVisits=s.recentVisits.slice(-K.VISITS);s.lastVisited=Date.now();save();sync();}
function toggleGroup(g){mutate(()=>{g.collapsed=!g.collapsed;if(g.collapsed)state.sites.filter(s=>s.groupId===g.id).forEach(s=>selected.delete(s.id));});}
function startDrag(){if(!pointer||!pointer.node)return;const p=pointer,n=find(p.node);if(!n)return;p.dragging=true;p.before=C.clone(state);p.ids=isSite(n)?(selected.has(n.id)?[...selected].filter(id=>find(id)&&visible(find(id))):[n.id]):[n.id,...state.sites.filter(s=>s.groupId===n.id).map(s=>s.id)];p.items=p.ids.map(id=>{const a=find(id);return{id,x:a.x,y:a.y};});p.ids.forEach(id=>views.get(id)?.el.classList.add('dragging'));hideTooltip();updateDrag(p.x,p.y);}
function updateDrag(x,y){const p=pointer;if(!p?.dragging)return;const a=logical(x,y),b=logical(p.startX,p.startY),dx=a.x-b.x,dy=a.y-b.y;for(const start of p.items){const n=find(start.id);n.x=start.x+dx;n.y=start.y+dy;}dropId=null;if(isSite(find(p.node))){for(const g of state.groups){const v=views.get(g.id),width=Math.max(60,v.el.offsetWidth/2+14);if(Math.abs(a.x-g.x)<width&&Math.abs(a.y-g.y)<34){dropId=g.id;break;}}}for(const g of state.groups)views.get(g.id).el.classList.toggle('drop-target',g.id===dropId);wake();}
function settleIntoGroup(ids,g){
  const moving=ids.map(find).filter(isSite),existing=state.sites.filter(s=>s.groupId===g.id&&!ids.includes(s.id));
  moving.forEach((s,i)=>{s.groupId=g.id;const angle=i*2.399963+Math.random()*.3,r=35+Math.sqrt(i+1)*18;s.x=g.x+Math.cos(angle)*r;s.y=g.y+Math.sin(angle)*r;});
  for(let step=0;step<70;step++){for(const s of moving){let fx=(g.x-s.x)*.006,fy=(g.y-s.y)*.006;for(const other of [...moving,...existing]){if(s===other)continue;let dx=s.x-other.x,dy=s.y-other.y,d=Math.hypot(dx,dy)||.01;if(d<64){fx+=dx/d*(64-d)*.24;fy+=dy/d*(64-d)*.24;}}let dx=s.x-g.x,dy=s.y-g.y,d=Math.hypot(dx,dy)||1;if(d<76){fx+=dx/d*(76-d)*.3;fy+=dy/d*(76-d)*.3;}s.x+=fx;s.y+=fy;}}
  moving.forEach(s=>{const v=views.get(s.id);if(v&&!reduced.matches){v.dx=(g.x-s.x)*.65;v.dy=(g.y-s.y)*.65;v.vx=v.vy=0;}});
}
function endPointer(cancel=false){
  if(!pointer)return;const p=pointer;clearTimeout(p.timer);pointer=null;$('selection-box').hidden=true;
  if(atlas.hasPointerCapture?.(p.pointerId))atlas.releasePointerCapture(p.pointerId);
  if(p.dragging){p.ids.forEach(id=>views.get(id)?.el.classList.remove('dragging'));for(const g of state.groups)views.get(g.id)?.el.classList.remove('drop-target');
    if(cancel){state=p.before;sync();return;}
    if(dropId){settleIntoGroup(p.ids,state.groups.find(g=>g.id===dropId));dropId=null;commit(p.before);return;}
    const nodes=p.ids.map(find),fix=boundedDelta(nodes,0,0);nodes.forEach(n=>{n.x+=fix.x;n.y+=fix.y;});
    const speed=performance.now()-p.lastTime>90?{x:0,y:0}:{x:p.vx||0,y:p.vy||0};const inertia=reduced.matches?{x:0,y:0}:boundedDelta(nodes,C.clamp(speed.x*30,-18,18),C.clamp(speed.y*30,-18,18));
    if(Math.hypot(inertia.x,inertia.y)>.2){release={before:p.before,items:nodes.map(n=>({id:n.id,x:n.x,y:n.y})),vx:inertia.x,vy:inertia.y,start:performance.now()};wake();}else commit(p.before);
  }else if(!cancel&&!p.box){if(p.node){const n=find(p.node);if(!n)return;if(isSite(n)){if(p.multi){selected.has(n.id)?selected.delete(n.id):selected.add(n.id);updateEmphasis();}else openSite(n);}else toggleGroup(n);}else{selected.clear();updateEmphasis();}}
}
atlas.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('#welcome')||pointer)return;finishMotion();closeMenu();if(logoId)return;hideTooltip();
  const node=e.target.closest('.node')?.dataset.id;pointer={pointerId:e.pointerId,node,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,lastTime:performance.now(),multi:e.ctrlKey||e.metaKey,base:new Set((e.ctrlKey||e.metaKey)?selected:[]),dragging:false,box:false};
  atlas.setPointerCapture(e.pointerId);if(node)pointer.timer=setTimeout(startDrag,K.HOLD_MS);e.preventDefault();
});
atlas.addEventListener('pointermove',e=>{
  lastPoint={x:e.clientX,y:e.clientY};const p=pointer;if(!p||p.pointerId!==e.pointerId)return;const now=performance.now(),dt=Math.max(1,now-p.lastTime);p.vx=(e.clientX-p.x)/dt/state.settings.zoom;p.vy=(e.clientY-p.y)/dt/state.settings.zoom;p.lastTime=now;p.x=e.clientX;p.y=e.clientY;
  if(p.dragging)updateDrag(e.clientX,e.clientY);else if(!p.node&&Math.hypot(p.x-p.startX,p.y-p.startY)>5){p.box=true;const x=Math.min(p.startX,p.x),y=Math.min(p.startY,p.y),w=Math.abs(p.x-p.startX),h=Math.abs(p.y-p.startY);const b=$('selection-box');b.hidden=false;Object.assign(b.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});selected.clear();p.base.forEach(id=>selected.add(id));for(const s of state.sites){if(!visible(s))continue;const at=screen(s.x,s.y);if(at.x>=x&&at.x<=x+w&&at.y>=y&&at.y<=y+h)selected.add(s.id);}updateEmphasis();}
});
atlas.addEventListener('pointerup',e=>{if(pointer?.pointerId===e.pointerId)endPointer();});
atlas.addEventListener('pointercancel',()=>endPointer(true));
atlas.addEventListener('lostpointercapture',()=>{if(pointer)endPointer(true);});
window.addEventListener('blur',()=>{endPointer(true);hideTooltip();});
world.addEventListener('pointerover',e=>{if(pointer||logoId)return;const el=e.target.closest('.site-node');if(!el)return;hideTooltip();tooltipTimer=setTimeout(()=>{const s=find(el.dataset.id);if(!s)return;const box=el.getBoundingClientRect(),tip=$('tooltip');tip.textContent=s.name;tip.hidden=false;tip.style.left=`${C.clamp(box.left+box.width/2-tip.offsetWidth/2,8,innerWidth-tip.offsetWidth-8)}px`;tip.style.top=`${Math.max(8,box.top-tip.offsetHeight-12)}px`;},K.TOOLTIP_MS);});
world.addEventListener('pointerout',hideTooltip);
world.addEventListener('click',e=>{if(e.detail!==0)return;const n=find(e.target.closest('.node')?.dataset.id);if(n)isSite(n)?openSite(n):toggleGroup(n);});
function closeDialog(){dialog.close();atlas.focus();}
function openDialog(title,description,build,action,submit='적용'){
  closeMenu();hideTooltip();if(dialog.open)closeDialog();$('dialog-title').textContent=title;$('dialog-description').textContent=description;$('dialog-body').replaceChildren();build?.($('dialog-body'));$('dialog-submit').textContent=submit;dialogAction=action;dialog.showModal();requestAnimationFrame(()=>{if(dialog.open)($('dialog-body').querySelector('input,textarea,select')||$('dialog-submit')).focus();});
}
function field(body,type,value,label){const id='dialog-value';const l=document.createElement('label');l.htmlFor=id;l.textContent=label;const input=document.createElement(type);input.id=id;input.value=value;input.setAttribute('aria-label',label);body.append(l,input);return input;}
function rename(n){openDialog(isSite(n)?'사이트 이름 변경':'그룹명 변경','이름을 바꿔도 지도 위의 위치는 그대로 유지됩니다.',body=>{const input=field(body,'input',n.name,'이름');input.required=true;input.maxLength=isSite(n)?1000:500;},()=>{const name=$('dialog-value').value.trim();if(!name)return false;mutate(()=>n.name=name);});}
function addGroup(at){openDialog('새로운 그룹','비슷한 관심사를 한자리에 모아보세요.',body=>{const input=field(body,'input','','그룹 이름');input.placeholder='예: 읽고 생각하기';input.required=true;input.maxLength=500;},()=>{const name=$('dialog-value').value.trim();if(!name)return false;mutate(()=>state.groups.push(C.group(name,at.x,at.y)));},'그룹 만들기');}
function addBulk(at){
  openDialog('새로운 곳을 놓아보세요','주소를 한 줄에 하나씩 붙여넣으세요.\n주소 위에 그룹 이름을 적으면 함께 묶어드립니다.',body=>{const input=field(body,'textarea','','그룹 이름과 웹 주소');input.placeholder='읽고 생각하기\nhttps://www.quantamagazine.org/\nhttps://aeon.co/\n\n만들기\nhttps://github.com/';input.required=true;},()=>{
    let rows;try{rows=C.parseBulk($('dialog-value').value);}catch(e){toast(e.message);return false;}if(!rows.length){toast('http:// 또는 https:// 주소를 하나 이상 입력하세요.');return false;}if(rows.length>2000){toast('한 번에 2,000개 이하로 추가해주세요.');return false;}
    mutate(()=>{const groups=new Map();let free=0;
      for(const row of rows){let g=null;if(row.group){if(!groups.has(row.group)){const i=groups.size;const pos=logical(C.clamp(screen(at.x,at.y).x+(i%3)*240,70,innerWidth-70),C.clamp(screen(at.x,at.y).y+Math.floor(i/3)*220,70,innerHeight-70));g=state.groups.find(g=>g.name===row.group)||C.group(row.group,pos.x,pos.y);if(!state.groups.includes(g))state.groups.push(g);groups.set(row.group,{g,ids:[]});}g=groups.get(row.group).g;}
        const s=C.site(row.url,at.x+(free%6)*65,at.y+Math.floor(free/6)*65,g?.id||null);state.sites.push(s);if(g)groups.get(row.group).ids.push(s.id);else{const fix=boundedDelta([s],0,0);s.x+=fix.x;s.y+=fix.y;free++;}}
      for(const {g,ids} of groups.values())settleIntoGroup(ids,g);
    });toast(`${rows.length}개의 새로운 곳을 지도에 놓았어요.`);
  },'지도에 추가');
}
function deleteSites(ids){mutate(()=>{state.sites=state.sites.filter(s=>!ids.includes(s.id));ids.forEach(id=>selected.delete(id));});toast('삭제했어요. ⌘/Ctrl + Z로 되돌릴 수 있어요.');}
function deleteGroup(g,withSites){const action=()=>mutate(()=>{state.groups=state.groups.filter(n=>n.id!==g.id);if(withSites)state.sites=state.sites.filter(s=>s.groupId!==g.id);else state.sites.filter(s=>s.groupId===g.id).forEach(s=>s.groupId=null);});
  if(withSites&&g.collapsed&&state.sites.some(s=>s.groupId===g.id)){openDialog('접힌 그룹을 삭제할까요?',`“${g.name}” 그룹 안의 ${state.sites.filter(s=>s.groupId===g.id).length}개 사이트도 함께 삭제됩니다. Undo로 되돌릴 수 있어요.`,null,action,'함께 삭제');}else action();
}
function moveGroup(s){openDialog('그룹 이동','사이트는 하나의 그룹에만 소속됩니다.',body=>{const select=field(body,'select','','대상 그룹');for(const g of [{id:'',name:'그룹 없음'},...state.groups]){const o=document.createElement('option');o.value=g.id;o.textContent=g.name;select.append(o);}select.value=s.groupId||'';},()=>mutate(()=>{const id=$('dialog-value').value;if(id)settleIntoGroup([s.id],state.groups.find(g=>g.id===id));else s.groupId=null;}));}
function editLogo(s){logoId=s.id;closeSearch();$('helper').textContent='이미지, 로고 파일 또는 텍스트를 ⌘/Ctrl + V로 붙여넣으세요. Esc로 취소';$('helper').hidden=false;updateEmphasis();atlas.focus();}
function cancelLogo(){logoId=null;$('helper').hidden=true;updateEmphasis();}
function exportData(){finishMotion();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='visual-bookmarks-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('현재 지도를 JSON 백업으로 내보냈어요.');}
function zoomOptions(){openDialog('확대 기준점','Ctrl/⌘ + 마우스 휠로 0.5×부터 2×까지 확대할 수 있어요.',body=>{const select=field(body,'select','','확대 기준');for(const [value,text] of [['pointer','마우스 포인터'],['content','전체 노드의 중심']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}select.value=state.settings.zoomMode;},()=>{state.settings.zoomMode=$('dialog-value').value;save();});}
function openSearch(){closeMenu();cancelLogo();$('search-panel').hidden=false;$('search-input').focus();}
function closeSearch(){$('search-panel').hidden=true;$('search-input').value='';query='';updateEmphasis();}
function help(){openDialog('지도를 사용하는 작은 방법','평소에는 고요하게. 손을 대면 부드럽게 반응합니다.',body=>{const grid=document.createElement('div');grid.className='help-grid';for(const [key,text] of [['짧게 클릭','사이트 열기 · 그룹 접기'],['220ms 누른 뒤 이동','사이트 · 그룹 드래그'],['Ctrl/⌘ + 클릭','사이트 다중 선택'],['빈 공간 드래그','박스로 사이트 선택'],['Delete / Backspace','선택한 사이트 삭제'],['Ctrl/⌘ + Z','되돌리기'],['Ctrl/⌘ + Shift + Z','다시 실행'],['Ctrl/⌘ + V','URL 빠른 추가'],['Ctrl/⌘ + 휠','확대 · 축소'],['N · G · /','사이트 추가 · 그룹 추가 · 검색'],['Shift + F10','현재 노드의 우클릭 메뉴'],['Esc · ?','취소 · 도움말']]){const d=document.createElement('div'),k=document.createElement('kbd');k.textContent=key;d.append(k,document.createTextNode(text));grid.append(d);}body.append(grid);},()=>{},'확인');}
function showMenu(x,y,n){
  endPointer(true);finishMotion();closeMenu();hideTooltip();const label=document.createElement('div');label.className='menu-label';label.textContent=n?(isSite(n)?'BOOKMARK':'GROUP'):'YOUR PERSONAL ATLAS';menu.append(label);
  const add=(text,action,shortcut='',danger=false)=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.classList.toggle('danger',danger);const name=document.createElement('span');name.textContent=text;const hint=document.createElement('span');hint.className='shortcut';hint.textContent=shortcut;button.append(name,hint);button.onclick=()=>{closeMenu();action();};menu.append(button);};const line=()=>menu.append(document.createElement('hr'));
  if(n&&isSite(n)){add('사이트 열기',()=>openSite(n),'↗');line();add('이름 변경',()=>rename(n));add('그룹 이동',()=>moveGroup(n));add('로고 변경',()=>editLogo(n));add('자동 로고로 되돌리기',()=>mutate(()=>n.customLogo=null));line();add('사이트 삭제',()=>deleteSites([n.id]),'',true);}
  else if(n){add('그룹명 변경',()=>rename(n));add(n.collapsed?'그룹 펼치기':'그룹 접기',()=>toggleGroup(n));line();add('그룹만 삭제',()=>deleteGroup(n,false),'',true);add('그룹과 사이트 모두 삭제',()=>deleteGroup(n,true),'',true);}
  else {const at=logical(x,y);add('사이트 추가',()=>addBulk(at),'N');add('그룹 추가',()=>addGroup(at),'G');line();add('검색',openSearch,'/');add('Zoom 기준점 설정',zoomOptions,`${state.settings.zoom.toFixed(1)}×`);add('화면 배율 초기화',()=>{state.settings.zoom=1;state.settings.offsetX=state.settings.offsetY=0;save();transformWorld();},'1×');line();add('데이터 내보내기',exportData,'↓');add('데이터 가져오기',()=>$('import-file').click(),'↑');line();add('사용 방법',help,'?');}
  menu.hidden=false;menu.style.left=`${C.clamp(x,8,innerWidth-menu.offsetWidth-8)}px`;menu.style.top=`${C.clamp(y,8,innerHeight-menu.offsetHeight-8)}px`;menu.querySelector('button')?.focus();
}
atlas.addEventListener('contextmenu',e=>{e.preventDefault();showMenu(e.clientX,e.clientY,find(e.target.closest('.node')?.dataset.id));});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))closeMenu();});
menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}});
$('dialog-form').addEventListener('submit',e=>{e.preventDefault();if(dialogAction?.()!==false)closeDialog();});
$('dialog-close').onclick=$('dialog-cancel').onclick=()=>closeDialog();
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
$('search-input').addEventListener('input',e=>{query=e.target.value;updateEmphasis();});$('close-search').onclick=()=>{closeSearch();atlas.focus();};
$('start').onclick=()=>addBulk(logical(innerWidth/2,innerHeight/2));
$('demo').onclick=()=>{
  mutate(()=>{const specs=[{name:'읽고 생각하기',x:.27,y:.34,sites:[['https://www.quantamagazine.org/','Quanta Magazine','Q'],['https://aeon.co/','Aeon','æ'],['https://plato.stanford.edu/','Stanford Encyclopedia of Philosophy','Φ'],['https://www.theguardian.com/','The Guardian','G']]},{name:'만들고 실험하기',x:.71,y:.40,sites:[['https://github.com/','GitHub','⌘'],['https://developer.mozilla.org/','MDN Web Docs','mdn'],['https://codepen.io/','CodePen','◇']]},{name:'세상 둘러보기',x:.45,y:.73,sites:[['https://earthobservatory.nasa.gov/','NASA Earth Observatory','NASA'],['https://www.are.na/','Are.na','✳'],['https://en.wikipedia.org/','Wikipedia','W']]}];
    for(const spec of specs){const at=logical(innerWidth*spec.x,innerHeight*spec.y),g=C.group(spec.name,at.x,at.y);state.groups.push(g);spec.sites.forEach(([url,name,logo],i)=>{const angle=-Math.PI*.88+i*1.4,s=C.site(url,g.x+Math.cos(angle)*100,g.y+Math.sin(angle)*85,g.id);s.name=name;s.customLogo={type:'text',value:logo};state.sites.push(s);});}});toast('짧게 클릭하면 열기, 길게 누르면 이동. 우클릭으로 편집하세요.');
};
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>8*1024*1024){toast('8MB 이하의 JSON 백업을 선택해주세요.');return;}
  let data;try{data=C.validate(JSON.parse(await file.text()));}catch(error){toast(`가져오기 실패: ${error.message}`);return;}
  openDialog('이 지도로 바꿀까요?',`현재 데이터를 사이트 ${data.sites.length}개, 그룹 ${data.groups.length}개의 백업으로 덮어씁니다.\n현재 지도는 먼저 내보내세요. 가져오면 Undo 기록이 초기화됩니다.`,body=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='현재 지도 내보내기';b.onclick=exportData;body.append(b);},()=>{finishMotion();try{localStorage.setItem(KEY,JSON.stringify(data));}catch{toast('저장 공간이 부족하거나 저장이 차단되어 가져오지 못했어요.');return false;}state=data;storageBlocked=false;history.clear();selected.clear();cancelLogo();closeSearch();sync();toast('백업 지도를 가져왔어요.');},'가져오기');
});
function inputFocused(){const el=document.activeElement;return el?.matches('input,textarea,select')||el?.isContentEditable;}
function quickAdd(url){const z=state.settings.zoom;let at=logical(innerWidth-68,innerHeight-68);for(let i=0;i<100;i++){if(!state.sites.some(s=>visible(s)&&Math.hypot(s.x-at.x,s.y-at.y)<52/z))break;at=logical(innerWidth-68-(i%Math.max(1,Math.floor((innerWidth-100)/60)))*60,innerHeight-68-Math.floor(i/Math.max(1,Math.floor((innerWidth-100)/60)))*60);}const fix=boundedDelta([at],0,0);at.x+=fix.x;at.y+=fix.y;let s;mutate(()=>{s=C.site(url,at.x,at.y);state.sites.push(s);});const el=views.get(s.id)?.el;el?.classList.add('pulse');setTimeout(()=>el?.classList.remove('pulse'),K.PASTE_GLOW_MS);}
async function imageLogo(file){
  if(file.size>20*1024*1024)throw new Error('20MB 이하의 이미지를 사용해주세요.');
  const url=URL.createObjectURL(file);try {const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),scale=Math.min(128/img.width,128/img.height);ctx.drawImage(img,(128-img.width*scale)/2,(128-img.height*scale)/2,img.width*scale,img.height*scale);return {type:'image',value:canvas.toDataURL('image/webp',.85)};}finally{URL.revokeObjectURL(url);}
}
document.addEventListener('paste',async e=>{
  if(inputFocused()||dialog.open)return;const data=e.clipboardData;if(!data)return;
  if(logoId){e.preventDefault();const id=logoId,file=[...data.items].find(i=>i.kind==='file'&&i.type.startsWith('image/'))?.getAsFile()||[...data.files].find(f=>f.type.startsWith('image/'));const text=data.getData('text/plain').trim();
    try{const logo=file?await imageLogo(file):text?{type:'text',value:text.slice(0,1000)}:null;if(id!==logoId)return;if(!logo){toast('이미지 또는 텍스트를 붙여넣으세요.');return;}const s=find(id);if(!s)return;mutate(()=>s.customLogo=logo);cancelLogo();toast('로고를 바꿨어요.');}catch{toast('이미지를 읽을 수 없어요. PNG, JPG, WebP를 사용해주세요.');}return;}
  const url=C.safeURL(data.getData('text/plain').trim());if(url){e.preventDefault();quickAdd(url);}
});
atlas.addEventListener('wheel',e=>{
  if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();if(pointer)return;finishMotion();hideTooltip();const s=state.settings,old=s.zoom,next=C.clamp(old*Math.exp(-e.deltaY*.003),K.ZOOM_MIN,K.ZOOM_MAX);let at={x:e.clientX,y:e.clientY};
  const nodes=all();if(s.zoomMode==='content'&&nodes.length){at=screen(nodes.reduce((a,n)=>a+n.x,0)/nodes.length,nodes.reduce((a,n)=>a+n.y,0)/nodes.length);}
  s.offsetX=at.x-(at.x-s.offsetX)*next/old;s.offsetY=at.y-(at.y-s.offsetY)*next/old;s.zoom=next;transformWorld();save();
},{passive:false});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){endPointer(true);selected.clear();closeMenu();if(dialog.open)closeDialog();cancelLogo();closeSearch();hideTooltip();updateEmphasis();return;}
  if(inputFocused()||dialog.open)return;
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();closeMenu();hideTooltip();endPointer(true);finishMotion();const next=e.shiftKey?history.redo(state):history.undo(state);if(next){state=next;selected.clear();cancelLogo();save();sync();toast(e.shiftKey?'다시 실행했어요.':'되돌렸어요.');}else toast(e.shiftKey?'다시 실행할 작업이 없어요.':'되돌릴 작업이 없어요.');return;}
  if((e.key==='Delete'||e.key==='Backspace')&&selected.size){e.preventDefault();deleteSites([...selected]);return;}
  if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const n=find(document.activeElement?.dataset.id),at=n?screen(n.x,n.y):lastPoint;showMenu(at.x,at.y,n);return;}
  if(mod||e.altKey||logoId||!menu.hidden)return;
  if(e.key==='/'){e.preventDefault();openSearch();}else if(e.key.toLowerCase()==='n'){e.preventDefault();addBulk(logical(lastPoint.x,lastPoint.y));}else if(e.key.toLowerCase()==='g'){e.preventDefault();addGroup(logical(lastPoint.x,lastPoint.y));}else if(e.key==='?')help();
});
window.addEventListener('resize',()=>{closeMenu();hideTooltip();});
window.addEventListener('pagehide',()=>{endPointer(true);finishMotion();save();});
window.addEventListener('storage',e=>{if(e.key===KEY)toast('다른 탭에서 지도가 변경됐어요. 필요하면 백업한 뒤 새로고침하세요.');});
reduced.addEventListener('change',wake);
sync();
if(storageBlocked)toast('기존 데이터를 읽지 못했어요. 원본 보호를 위해 자동 저장을 멈췄습니다. 백업 JSON을 가져와 복구하세요.');
})();
