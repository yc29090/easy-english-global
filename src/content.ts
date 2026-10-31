import {requireValue} from './security.ts';
export function validateContent(data:any){
 requireValue(data&&Array.isArray(data.scenes)&&Array.isArray(data.materials),'Expected scenes and materials arrays');
 requireValue(data.scenes.length===20,'Original curriculum must contain exactly 20 scenes');
 requireValue(data.materials.filter((m:any)=>m.kind==='word').length===500,'Expected 500 original words');
 requireValue(data.materials.filter((m:any)=>m.kind==='phrase').length===200,'Expected 200 original phrases');
 const ids=new Set<string>(),texts=new Set<string>(),sceneIds=new Set<string>();
 const text=(v:any)=>typeof v==='string'&&v.trim().length>0&&v.length<=2000;
 for(const s of data.scenes){requireValue(text(s.id)&&text(s.title_en)&&text(s.title_zh)&&['life','business'].includes(s.category),'Invalid scene');requireValue(!sceneIds.has(s.id),'Duplicate scene');sceneIds.add(s.id);}
 requireValue(data.scenes.some((s:any)=>s.category==='life')&&data.scenes.some((s:any)=>s.category==='business'),'Life and business scenes required');
 for(const m of data.materials){requireValue(text(m.id)&&text(m.english)&&text(m.chinese)&&['word','phrase'].includes(m.kind)&&sceneIds.has(m.scene_id)&&typeof m.is_free==='boolean','Invalid material');const key=m.english.trim().toLowerCase().replace(/\s+/g,' ');requireValue(!ids.has(m.id)&&!texts.has(key),'Duplicate material');ids.add(m.id);texts.add(key);for(const a of [m.audio_normal,m.audio_slow])requireValue(a==null||(typeof a==='string'&&/^https:\/\//.test(a)),'Audio must use HTTPS');}
 for(const id of sceneIds)requireValue(data.materials.some((m:any)=>m.scene_id===id),'Empty scene');
 return data;
}
