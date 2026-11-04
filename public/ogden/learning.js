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
 const mastered=new Set(progress.filter(p=>p.status==='mastered').map(p=>p.item_id));
 const ready=x=>(x.wordIds||[]).every(id=>mastered.has(id))&&(x.patternIds||[]).every(id=>mastered.has(id));
 return [...tasks].sort((a,b)=>Number(ready(b))-Number(ready(a))||a.level-b.level||a.order-b.order);
}
