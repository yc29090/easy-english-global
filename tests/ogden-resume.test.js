import {test} from 'node:test';import assert from 'node:assert/strict';
import {continueTarget,prioritizeTasks} from '../public/ogden/learning.js';
test('resume preserves the actual material type and selected practice mode',()=>{
 assert.equal(continueTarget({id:'pt-need',kind:'pattern'}),'/ogden/patterns#pt-need');
 assert.equal(continueTarget({id:'cb-help',kind:'combination'}),'/ogden/build#cb-help');
 assert.equal(continueTarget({id:'ow-phone',kind:'word',english:'phone'}),'/ogden/words?q=phone#ow-phone');
 assert.equal(continueTarget({id:'ow-phone',kind:'word'},'listening'),'/ogden/listening?kind=word&item=ow-phone#ow-phone');
 assert.equal(continueTarget({id:'ex-help',kind:'expression'},'speaking'),'/ogden/speaking#ex-help');
});
test('recommend known-word and known-pattern tasks first without locking other tasks or changing input',()=>{
 const tasks=[{id:'new',wordIds:['w2'],patternIds:['p'],level:1,order:1},{id:'ready',wordIds:['w1'],patternIds:['p'],level:3,order:2}],copy=JSON.stringify(tasks);
 const result=prioritizeTasks(tasks,[{item_id:'w1',status:'mastered'},{item_id:'p',status:'mastered'}]);assert.deepEqual(result.map(x=>x.id),['ready','new']);assert.equal(JSON.stringify(tasks),copy);
 assert.equal(prioritizeTasks(tasks,[]).length,2);
});
test('recommendation requires one wholly core reference and its patterns; alternatives do not all need to be mastered',async()=>{
 const {taskReadiness}=await import('../public/ogden/learning.js');
 const task={patternIds:['p'],referenceCoverage:[{wordIds:['known','unknown'],allCore:true},{wordIds:['known'],allCore:true}]};
 assert.equal(taskReadiness(task,[{item_id:'known',status:'mastered'},{item_id:'p',status:'mastered'}]).ready,true);
 assert.equal(taskReadiness(task,[{item_id:'known',status:'mastered'}]).ready,false);
 assert.equal(taskReadiness({...task,referenceCoverage:[{wordIds:['known'],allCore:false}]},[{item_id:'known',status:'mastered'},{item_id:'p',status:'mastered'}]).ready,false);
});
