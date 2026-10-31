import {requireValue} from './security.ts';
export type Scene={id:string;title_en:string;title_zh:string;category:'life'|'travel'|'business';difficulty:number};
export type Material={id:string;kind:'word'|'phrase';english:string;chinese:string;scene_id:string;is_free:boolean;difficulty:number;sort_order:number;audio_normal?:string|null;audio_slow?:string|null};
export type CurriculumDialogue={id:string;scene_id:string;title_en:string;title_zh:string;category:Scene['category'];difficulty:number;is_free:boolean;roles:{a:{zh:string;en:string};b:{zh:string;en:string}};turns:{role:'a'|'b';english:string;chinese:string}[]};
export type Curriculum={version:string;source:string;license:string;scenes:Scene[];materials:Material[];dialogues:CurriculumDialogue[]};
export const normalizeEnglish=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9\s']/g,' ').replace(/\s+/g,' ').trim();
const text=(v:unknown):v is string=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=2000;
const chinese=(v:unknown)=>text(v)&&/[\u3400-\u9fff]/.test(v);
const english=(v:unknown)=>text(v)&&/[a-z]/i.test(v)&&!/[\u3400-\u9fff]/.test(v);
const level=(v:unknown)=>Number.isInteger(v)&&Number(v)>=1&&Number(v)<=3;
export function validateContent(input:unknown):Curriculum{
 const data=input as Curriculum;
 requireValue(data&&Array.isArray(data.scenes)&&Array.isArray(data.materials)&&Array.isArray(data.dialogues),'Expected scenes, materials and dialogues arrays');
 requireValue(text(data.version)&&text(data.source)&&text(data.license),'Curriculum provenance is required');
 requireValue(data.scenes.length===20,'Curriculum must contain exactly 20 scenes');
 requireValue(data.materials.filter(m=>m.kind==='word').length===500,'Expected 500 words');
 requireValue(data.materials.filter(m=>m.kind==='phrase').length===200,'Expected 200 phrases');
 const ids=new Set<string>(),texts=new Set<string>(),sceneIds=new Set<string>(),dialogueIds=new Set<string>(),scripts=new Set<string>();
 for(const s of data.scenes){requireValue(s&&text(s.id)&&english(s.title_en)&&chinese(s.title_zh)&&['life','travel','business'].includes(s.category)&&level(s.difficulty),'Invalid scene');requireValue(!sceneIds.has(s.id),'Duplicate scene');sceneIds.add(s.id);}
 for(const category of ['life','travel','business'])requireValue(data.scenes.some(s=>s.category===category),'Life, travel and business scenes required');
 for(const m of data.materials){
  requireValue(m&&text(m.id)&&english(m.english)&&chinese(m.chinese)&&['word','phrase'].includes(m.kind)&&sceneIds.has(m.scene_id)&&typeof m.is_free==='boolean'&&level(m.difficulty)&&Number.isInteger(m.sort_order)&&m.sort_order>=0,'Invalid material or translation');
  if(m.kind==='word')requireValue(/^[a-z]+(?:-[a-z]+)*$/i.test(m.english),'Word entries must be individual headwords');
  const key=normalizeEnglish(m.english);requireValue(!ids.has(m.id)&&!texts.has(key),'Duplicate material');ids.add(m.id);texts.add(key);
  for(const a of [m.audio_normal,m.audio_slow])requireValue(a==null||(typeof a==='string'&&/^https:\/\//.test(a)),'Audio must use HTTPS');
 }
 for(const d of data.dialogues){
  requireValue(d&&text(d.id)&&sceneIds.has(d.scene_id)&&english(d.title_en)&&chinese(d.title_zh)&&level(d.difficulty)&&typeof d.is_free==='boolean','Invalid dialogue');
  const parent=data.scenes.find(s=>s.id===d.scene_id)!;
  requireValue(d.category===parent.category&&d.difficulty===parent.difficulty,'Dialogue classification does not match scene');
  requireValue(!dialogueIds.has(d.id),'Duplicate dialogue id');dialogueIds.add(d.id);
  for(const role of ['a','b'] as const)requireValue(d.roles?.[role]&&english(d.roles[role].en)&&chinese(d.roles[role].zh),'Missing bilingual role');
  requireValue(Array.isArray(d.turns)&&d.turns.length>=4&&d.turns.length<=30,'Dialogue needs at least two complete exchanges');
  for(let i=0;i<d.turns.length;i++){const turn=d.turns[i];requireValue(turn&&['a','b'].includes(turn.role)&&english(turn.english)&&chinese(turn.chinese),'Incomplete dialogue translation');if(i)requireValue(turn.role!==d.turns[i-1].role,'Both roles must take turns');}
  requireValue(d.turns.length%2===0,'Dialogue must end with a response');
  const fingerprint=d.turns.map(t=>normalizeEnglish(t.english)).join('|');requireValue(!scripts.has(fingerprint),'Duplicate dialogue script');scripts.add(fingerprint);
 }
 for(const id of sceneIds){
  for(const kind of ['word','phrase'])requireValue(data.materials.some(m=>m.scene_id===id&&m.kind===kind),'Scene needs words and phrases');
  requireValue(data.dialogues.filter(d=>d.scene_id===id).length>=5,'Every scene needs at least 5 dialogues');
 }
 for(const m of data.materials){const s=data.scenes.find(s=>s.id===m.scene_id)!;requireValue(m.difficulty===s.difficulty,'Material difficulty does not match scene');}
 requireValue(data.materials.some(m=>m.is_free)&&data.materials.some(m=>!m.is_free),'Free and member material required');
 return data;
}
