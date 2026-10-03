/* Pure model operations, shared by the browser and the dependency-free tests. */
(function (root) {
  'use strict';
  const CONFIG = Object.freeze({ HOLD_MS:220, TOOLTIP_MS:350, ICON_MIN:38, ICON_MAX:54, VISITS:50, ZOOM_MIN:.5, ZOOM_MAX:2, HISTORY:60, INERTIA_MS:180, REPULSION_RADIUS:125, GROUP_RESPONSE:.25, PASTE_GLOW_MS:850 });
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
  function safeURL(value) { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !!u.hostname ? u.href : null; } catch { return null; } }
  const empty = () => ({version:1,sites:[],groups:[],settings:{zoom:1,zoomMode:'pointer',offsetX:0,offsetY:0}});
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
    return {version:1,sites,groups,settings:{zoom:clamp(typeof settings.zoom==='number'&&Number.isFinite(settings.zoom)?settings.zoom:1,.5,2),zoomMode:settings.zoomMode==='content'?'content':'pointer',offsetX:finite(settings.offsetX)?settings.offsetX:0,offsetY:finite(settings.offsetY)?settings.offsetY:0}};
  }
  class History { constructor(limit=CONFIG.HISTORY){this.limit=limit;this.past=[];this.future=[];} push(before,after){if(JSON.stringify(before)===JSON.stringify(after))return false;this.past.push(clone(before));if(this.past.length>this.limit)this.past.shift();this.future=[];return true;} undo(current){if(!this.past.length)return null;this.future.push(clone(current));return this.past.pop();} redo(current){if(!this.future.length)return null;this.past.push(clone(current));return this.future.pop();} clear(){this.past=[];this.future=[];} }
  const api={CONFIG,clamp,clone,uid,safeURL,empty,group,site,parseBulk,iconSize,validate,History};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AtlasCore=api;
})(globalThis);
