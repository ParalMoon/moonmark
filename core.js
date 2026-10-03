/* Pure model operations, shared by the browser and the dependency-free tests. */
(function (root) {
  'use strict';
  const CONFIG = Object.freeze({ HOLD_MS:220, TOOLTIP_MS:350, ICON_MIN:38, ICON_MAX:54, VISITS:50, ZOOM_MIN:.25, ZOOM_MAX:3, HISTORY:60, INERTIA_MS:180, REPULSION_RADIUS:125, GROUP_RESPONSE:.25, PASTE_GLOW_MS:850 });
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
  function safeURL(value) { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !!u.hostname ? u.href : null; } catch { return null; } }
  const empty = () => ({version:1,sites:[],groups:[],settings:{zoom:1,zoomMode:'pointer',offsetX:0,offsetY:0,background:defaultBackground()}});
  const group = (name,x,y) => ({id:uid('group'),name:name.trim(),x,y,collapsed:false,createdAt:Date.now()});
  function site(url,x,y,groupId=null) { url=safeURL(url); if(!url) throw new Error('올바른 http/https URL을 입력하세요.'); const hostname=new URL(url).hostname; return {id:uid('site'),url,name:hostname.replace(/^www\./,''),favicon:`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`,customLogo:null,groupId,x,y,recentVisits:[],lastVisited:null,createdAt:Date.now()}; }
  function parseBulk(text) { let current=null; const rows=[]; for(const line of text.split(/\r?\n/)){const s=line.trim();if(!s)continue; if(/^https?:\/\//i.test(s)){const url=safeURL(s);if(!url)throw new Error(`URL을 확인하세요: ${s}`);rows.push({url,group:current});}else{if(/^[a-z][\w+.-]*:\/\//i.test(s))throw new Error('http 또는 https 주소만 사용할 수 있어요.');current=s;}} return rows; }
  function iconSize(s,now=Date.now()) { const score=s.recentVisits.reduce((sum,t)=>sum+Math.exp(-Math.max(0,now-t)/(14*86400000)),0);return clamp(CONFIG.ICON_MIN+16*Math.sqrt(Math.min(1,score/50)),38,54); }
  function validate(raw) {
    if(!raw || raw.version!==1 || !Array.isArray(raw.sites)||!Array.isArray(raw.groups))throw new Error('지원하는 v1 북마크 백업이 아닙니다.');
    if(raw.sites.length>10000||raw.groups.length>2000)throw new Error('가져올 수 있는 데이터 크기를 초과했어요.');
    const ids=new Set();const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e7;
    const str=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max;
    const unique=id=>{if(!str(id,200)||ids.has(id))throw new Error('중복되거나 올바르지 않은 ID가 있어요.');ids.add(id);};
    const groups=raw.groups.map(g=>{if(!g||!str(g.name,500)||!finite(g.x)||!finite(g.y))throw new Error('그룹 데이터가 올바르지 않아요.');unique(g.id);return {id:g.id,name:g.name,x:g.x,y:g.y,collapsed:!!g.collapsed,createdAt:typeof g.createdAt==='number'&&Number.isFinite(g.createdAt)?g.createdAt:Date.now()};});
    const groupIds=new Set(groups.map(g=>g.id));
    const sites=raw.sites.map(s=>{if(!s||!safeURL(s.url)||!str(s.name,1000)||!finite(s.x)||!finite(s.y))throw new Error('사이트 데이터가 올바르지 않아요.');unique(s.id);let customLogo=null;
      if(s.customLogo!=null){if(typeof s.customLogo==='string'){customLogo=/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s.customLogo)?{type:'image',value:s.customLogo}:{type:'text',value:s.customLogo};}else customLogo=s.customLogo;
        if(!customLogo||!['text','image'].includes(customLogo.type)||!str(customLogo.value,500000)||(customLogo.type==='image'&&!/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(customLogo.value)))throw new Error('로고 데이터가 올바르지 않아요.');
        customLogo={type:customLogo.type,value:customLogo.value};}
      return {id:s.id,url:safeURL(s.url),name:s.name,favicon:safeURL(s.favicon)||site(s.url,0,0).favicon,customLogo,groupId:groupIds.has(s.groupId)?s.groupId:null,x:s.x,y:s.y,recentVisits:Array.isArray(s.recentVisits)?s.recentVisits.filter(t=>typeof t==='number'&&Number.isFinite(t)&&t>=0).slice(-50):[],lastVisited:typeof s.lastVisited==='number'&&Number.isFinite(s.lastVisited)?s.lastVisited:null,createdAt:typeof s.createdAt==='number'&&Number.isFinite(s.createdAt)?s.createdAt:Date.now()};});
    const settings=raw.settings||{};
    return {version:1,sites,groups,settings:{zoom:clamp(typeof settings.zoom==='number'&&Number.isFinite(settings.zoom)?settings.zoom:1,CONFIG.ZOOM_MIN,CONFIG.ZOOM_MAX),zoomMode:settings.zoomMode==='content'?'content':'pointer',offsetX:finite(settings.offsetX)?settings.offsetX:0,offsetY:finite(settings.offsetY)?settings.offsetY:0,background:validateBackground(settings.background)}};
  }
  // Backgrounds are structured data, never arbitrary imported CSS.
  const PATTERNS = ['blob','linear','radial','spotlight','aurora','mesh-like','conic'];
  function defaultBackground() {
    return {pattern:'blob',colors:[{h:95,s:35,l:70},{h:43,s:40,l:72},{h:175,s:35,l:70}],positions:[{x:13,y:18},{x:86,y:24},{x:73,y:90}],angle:135,baseColor:{h:50,s:20,l:93},intensity:.48};
  }
  function validateBackground(raw) {
    const fallback=defaultBackground();
    const number=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
    const color=c=>c&&number(c.h,0,360)&&number(c.s,0,100)&&number(c.l,0,100);
    if(!raw||!PATTERNS.includes(raw.pattern)||!Array.isArray(raw.colors)||raw.colors.length<3||raw.colors.length>4||!raw.colors.every(color)||!color(raw.baseColor)||!Array.isArray(raw.positions)||raw.positions.length!==raw.colors.length||!raw.positions.every(p=>p&&number(p.x,0,100)&&number(p.y,0,100))||!number(raw.angle,0,360)||!number(raw.intensity,0,1))return fallback;
    return clone({pattern:raw.pattern,colors:raw.colors,positions:raw.positions,angle:raw.angle,baseColor:raw.baseColor,intensity:raw.intensity});
  }
  function generateBackgrounds() {
    const patterns=Array.from({length:12},(_,i)=>PATTERNS[i%PATTERNS.length]);
    for(let i=patterns.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[patterns[i],patterns[j]]=[patterns[j],patterns[i]];}
    return patterns.map(pattern=>{const h=Math.random()*360,offsets=[0,30+Math.random()*50,120+Math.random()*100,300+Math.random()*35];const colors=offsets.slice(0,Math.random()>.5?4:3).map(offset=>({h:(h+offset)%360,s:35+Math.random()*40,l:35+Math.random()*40}));return {pattern,colors,positions:colors.map(()=>({x:8+Math.random()*84,y:8+Math.random()*84})),angle:Math.random()*360,baseColor:{h,s:15,l:94},intensity:.48};});
  }
  function backgroundCSS(raw) {
    const b=validateBackground(raw),strength=b.intensity;
    const color=(c,alpha=1)=>`hsla(${c.h}, ${c.s*(.35+.65*strength)}%, ${c.l}%, ${alpha})`;
    const shades=b.colors.map(c=>color(c,.12+.7*strength)),base=color(b.baseColor);
    const spots=(size,shape='ellipse')=>shades.map((c,i)=>`radial-gradient(${shape} ${size} at ${b.positions[i].x}% ${b.positions[i].y}%, ${c}, transparent 76%)`);
    let layers;
    switch(b.pattern){
      case 'linear':layers=[`linear-gradient(${b.angle}deg, ${shades.join(', ')})`];break;
      case 'radial':layers=[`radial-gradient(ellipse at ${b.positions[0].x}% ${b.positions[0].y}%, ${shades.join(', ')}, transparent)`];break;
      case 'spotlight':layers=spots('70% 105%');break;
      case 'aurora':layers=[...shades.map((c,i)=>`linear-gradient(${(b.angle+i*37)%360}deg, transparent ${i*8}%, ${c} ${30+i*12}%, transparent ${65+i*8}%)`)];break;
      case 'mesh-like':layers=spots('65% 80%');break;
      case 'conic':layers=[`conic-gradient(from ${b.angle}deg at ${b.positions[0].x}% ${b.positions[0].y}%, ${[...shades,shades[0]].join(', ')})`];break;
      default:layers=spots('85% 85%');
    }
    return [...layers,base].join(', ');
  }
  function clusterRadius(g,sites) {
    const members=sites.filter(s=>s.groupId===g.id);
    return Math.max(100,76+Math.sqrt(members.length)*26,...members.map(s=>Math.hypot(s.x-g.x,s.y-g.y)+32));
  }
  // Called only at creation time. Existing groups and their children never move.
  function placeNewGroups(groups,sites,newIds) {
    const fresh=new Set(newIds),occupied=groups.filter(g=>!fresh.has(g.id)).map(g=>({x:g.x,y:g.y,r:clusterRadius(g,sites)}));
    for(const g of groups.filter(g=>fresh.has(g.id))){const r=clusterRadius(g,sites),origin={x:g.x,y:g.y};let pos=origin;
      const clear=p=>occupied.every(o=>Math.hypot(p.x-o.x,p.y-o.y)>=r+o.r+36);
      if(!clear(pos)){let found=false;for(let ring=1;!found&&ring<1000;ring++){const count=Math.max(12,Math.ceil(ring*5));for(let i=0;i<count;i++){const a=i/count*Math.PI*2,p={x:origin.x+Math.cos(a)*ring*64,y:origin.y+Math.sin(a)*ring*64};if(clear(p)){pos=p;found=true;break;}}}}
      const dx=pos.x-g.x,dy=pos.y-g.y;g.x=pos.x;g.y=pos.y;sites.filter(s=>s.groupId===g.id).forEach(s=>{s.x+=dx;s.y+=dy;});occupied.push({...pos,r});
    }
  }
  function panOffsets(nodes,zoom,width,height,x,y) {
    const xs=nodes.map(n=>n.x*zoom),ys=nodes.map(n=>n.y*zoom);
    const minX=xs.length?Math.min(...xs):0,maxX=xs.length?Math.max(...xs):width;
    const minY=ys.length?Math.min(...ys):0,maxY=ys.length?Math.max(...ys):height;
    return {x:clamp(x,-maxX-2*width,width-minX+2*width),y:clamp(y,-maxY-2*height,height-minY+2*height)};
  }

  class History { constructor(limit=CONFIG.HISTORY){this.limit=limit;this.past=[];this.future=[];} push(before,after){if(JSON.stringify(before)===JSON.stringify(after))return false;this.past.push(clone(before));if(this.past.length>this.limit)this.past.shift();this.future=[];return true;} undo(current){if(!this.past.length)return null;this.future.push(clone(current));return this.past.pop();} redo(current){if(!this.future.length)return null;this.past.push(clone(current));return this.future.pop();} clear(){this.past=[];this.future=[];} }
  const api={CONFIG,clamp,clone,uid,safeURL,empty,group,site,parseBulk,iconSize,validate,History,defaultBackground,validateBackground,generateBackgrounds,backgroundCSS,clusterRadius,placeNewGroups,panOffsets};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AtlasCore=api;
})(globalThis);
