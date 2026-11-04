import type {OgdenContent,OgdenItem} from './ogden-content.ts';
/** Exact words and explicitly reviewed forms only. No suffix guessing or semantic grading. */
const contractions:Record<string,string>={"i'm":'i am',"you're":'you are',"we're":'we are',"they're":'they are',"it's":'it is',"that's":'that is',"there's":'there is',"don't":'do not',"doesn't":'does not',"can't":'can not',"cannot":'can not',"won't":'will not',"isn't":'is not',"aren't":'are not',"let's":'let us'};
export function englishTokens(text:string){return (text.toLowerCase().replaceAll('’',"'").match(/[a-z]+(?:'[a-z]+)?/g)||[]).flatMap(w=>(contractions[w]||w).split(' '));}
export function analyzeReference(text:string,words:OgdenItem[],forms:Record<string,string>){
 const byName=new Map(words.map(w=>[w.english.toLowerCase(),w.id]));
 const ids=new Set<string>(),supplemental=new Set<string>();
 for(const token of englishTokens(text)){const id=byName.get(token)||byName.get(forms[token]);if(id)ids.add(id);else supplemental.add(token);}
 return {english:text,wordIds:[...ids].sort(),supplementalTokens:[...supplemental].sort(),allCore:supplemental.size===0};
}
export const OGDEN_PATH=[
 {stage:1,label:'基础人物与事物',href:'/ogden/words?stage=1'},
 {stage:2,label:'18操作词',href:'/ogden/operators'},
 {stage:3,label:'简单需求',href:'/ogden/words?stage=3'},
 {stage:4,label:'基础问答',href:'/ogden/patterns'},
 {stage:5,label:'词语组合',href:'/ogden/build'},
 {stage:6,label:'日常生活',href:'/ogden/express?scenario=life'},
 {stage:7,label:'独立表达',href:'/ogden/express?level=3'},
 {stage:8,label:'换一种说法',href:'/ogden/express?level=4'}
];
export function annotateTeaching(content:OgdenContent){
 const words=content.items.filter(x=>x.kind==='word');
 const basics=new Set('i you we he she it they me my your our their his her a the this that name person water food home room bag phone'.split(' '));
 const operators=new Set(content.items.filter(x=>x.kind==='operator').map(x=>x.english));
 const needs=new Set('need want can please yes no help time good bad not some any'.split(' '));
 const questions=new Set('who whose which what where when why how here there'.split(' '));
 for(const w of words){w.teachingStage=basics.has(w.english.toLowerCase())?1:operators.has(w.english)?2:needs.has(w.english)?3:questions.has(w.english)?4:w.order<=101?5:6;w.teachingOrder=w.teachingStage*10000+w.order;}
 const byId=new Map(words.map(w=>[w.id,w]));
 for(const w of words){
  const analysis=analyzeReference([...w.examples,...w.combinations].map(e=>e.english).join(' '),words,content.wordForms);
  const others=analysis.wordIds.filter(id=>id!==w.id);
  w.dependencies={prerequisiteWordIds:others.filter(id=>byId.get(id)!.teachingOrder<w.teachingOrder),previewWordIds:others.filter(id=>byId.get(id)!.teachingOrder>=w.teachingOrder),supplementalTokens:analysis.supplementalTokens};
 }
 for(const t of content.items.filter(x=>x.kind==='expression')){
  t.referenceCoverage=t.answers.map((s:string)=>analyzeReference(s,words,content.wordForms));
  t.wordIds=[...new Set<string>(t.referenceCoverage.flatMap((r:any)=>r.wordIds))].sort();
  t.supportWords=[...new Set<string>(t.referenceCoverage.flatMap((r:any)=>r.supplementalTokens))].sort();
 }
 return content;
}
/** Textbook capacity is not a learner score. Same intent counts once across levels and scenes. */
export function expressionCoverage(items:OgdenItem[]){
 const tasks=items.filter(x=>x.kind==='expression'&&x.reviewStatus==='approved');
 const activeWords=new Set(items.filter(x=>x.kind==='word'&&x.reviewStatus==='approved').map(x=>x.id));
 const supported=(r:any)=>r.allCore&&r.wordIds.every((id:string)=>activeWords.has(id));
 const fullyCovered=tasks.filter(x=>x.referenceCoverage?.some(supported));
 const unique=(xs:OgdenItem[])=>new Set(xs.map(x=>x.intentId)).size;
 return {coreWords:activeWords.size,taskItems:tasks.length,uniqueIntents:unique(tasks),coreSupportedIntents:unique(fullyCovered),independentIntents:unique(tasks.filter(x=>x.level>=3)),coreSupportedIndependentIntents:unique(fullyCovered.filter(x=>x.level>=3)),paraphraseItems:tasks.filter(x=>x.level===4).length,coreSupportedParaphraseIntents:unique(fullyCovered.filter(x=>x.level===4)),authoredReferences:new Set(tasks.flatMap(x=>x.answers.map((s:string)=>englishTokens(s).join(' ')))).size,coreSupportedReferences:new Set(fullyCovered.flatMap(x=>x.referenceCoverage.filter(supported).map((r:any)=>englishTokens(r.english).join(' ')))).size,method:'exact-core-and-reviewed-forms-at-least-one-reference-per-intent',isLearnerMastery:false};
}
export function validateTeaching(content:OgdenContent){
 const expected=annotateTeaching(structuredClone(content));
 const byId=new Map(content.items.map(x=>[x.id,x]));
 const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 for(const x of expected.items){const actual=byId.get(x.id)!;
  if(x.kind==='word'&&!equal([...Object.entries(content.wordForms).filter(([,base])=>base===x.english.toLowerCase()).map(([form])=>form)].sort(),[...(actual.forms||[])].sort()))throw Error('Ogden content: stale displayed forms '+x.id);
  if(x.kind==='word'&&(!equal(x.dependencies,actual.dependencies)||x.teachingOrder!==actual.teachingOrder||x.teachingStage!==actual.teachingStage))throw Error('Ogden content: stale word dependencies '+x.id);
  if(x.kind==='expression'){
   if(!/^[a-z0-9-]+$/.test(x.intentId)||typeof x.answerComparison!=='string'||!/[\u3400-\u9fff]/.test(x.answerComparison))throw Error('Ogden content: missing expression intent/comparison '+x.id);
   if(!equal(x.referenceCoverage,actual.referenceCoverage)||!equal(x.wordIds,actual.wordIds)||!equal(x.supportWords,actual.supportWords))throw Error('Ogden content: stale expression coverage '+x.id);
  }
 }
}
