export const modeLabels={study:'学习',build:'组合',express:'表达',listening:'听力',speaking:'开口'};
export function continueTarget(item,mode){
 if(!item)return '/ogden/words';
 const base='/ogden/',anchor='#'+encodeURIComponent(item.id);
 if(mode==='listening')return base+'listening?kind='+encodeURIComponent(item.kind)+'&item='+encodeURIComponent(item.id)+anchor;
 if(mode==='speaking'&&item.kind==='expression')return base+'speaking'+anchor;
 if(item.kind==='word')return base+'words?q='+encodeURIComponent(item.english)+anchor;
 if(item.kind==='operator')return base+'operators/'+encodeURIComponent(item.english);
 return base+({pattern:'patterns',combination:'build',expression:'express'}[item.kind]||'words')+anchor;
}
export function prioritizeTasks(tasks,progress){
 const ready=x=>taskReadiness(x,progress).ready;
 return [...tasks].sort((a,b)=>Number(ready(b))-Number(ready(a))||a.level-b.level||a.order-b.order);
}
/** Recommendations use self-reported words and an authored reference, never evaluate free speech. */
export function taskReadiness(task,progress){
 const mastered=new Set(progress.filter(p=>p.status==='mastered').map(p=>p.item_id));
 const patterns=(task.patternIds||[]).filter(id=>!mastered.has(id));
 if(!task.referenceCoverage)return {ready:(task.wordIds||[]).every(id=>mastered.has(id))&&patterns.length===0,missingWordIds:(task.wordIds||[]).filter(id=>!mastered.has(id)),missingPatternIds:patterns,needsSupplemental:false};
 const refs=[...task.referenceCoverage].sort((a,b)=>Number(b.allCore)-Number(a.allCore)||a.wordIds.filter(id=>!mastered.has(id)).length-b.wordIds.filter(id=>!mastered.has(id)).length);
 const reference=refs[0],missing=reference?.wordIds.filter(id=>!mastered.has(id))||[];
 return {ready:!!reference?.allCore&&missing.length===0&&patterns.length===0,missingWordIds:missing,missingPatternIds:patterns,needsSupplemental:!reference?.allCore};
}
