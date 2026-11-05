import {test} from 'node:test';
import assert from 'node:assert/strict';
import {learningStateCounts,statusFilters} from '../public/learning-status.js';
import {createExpressionInput} from '../public/ogden/expression-input.js';
test('state filters count saved statuses independently of review deadlines',()=>{
 const records=[{status:'learned'},{status:'mastered',next_review_at:'2000-01-01'},{status:'unmastered'},{status:'review'},{status:'mastered'}];
 assert.deepEqual(learningStateCounts(records),{learned:1,mastered:2,unmastered:1,review:1});
 const html=statusFilters(records,'mastered');assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert.ok(html.includes('已掌握（2）'));assert.ok(html.includes('未掌握（1）'));assert.ok(html.includes('待复习（1）'));
});
function fixture(available=true){
 let engine;const timers=new Map();let serial=0;
 class Recognition{constructor(){engine=this;}start(){this.onstart();}stop(){this.onend();}abort(){this.aborted=true;}}
 const host={SpeechRecognition:available?Recognition:undefined,Event,setTimeout:callback=>{timers.set(++serial,callback);return serial;},clearTimeout:id=>timers.delete(id)};
 const input={value:'My draft',isConnected:true,dispatchEvent:event=>assert.equal(event.type,'input')},button={setAttribute(key,value){this[key]=value;}},output={textContent:''};
 return {controller:createExpressionInput(host),input,button,output,timers,get engine(){return engine;}};
}
test('native English transcription fills editable text and stale callbacks are ignored',()=>{
 const f=fixture();f.controller.toggle(f.input,f.button,f.output);assert.equal(f.engine.lang,'en-US');assert.match(f.output.textContent,/聆听/);
 f.engine.onresult({results:[Object.assign([{transcript:'I need some water.'}],{isFinal:true})]});assert.equal(f.input.value,'I need some water.');assert.match(f.output.textContent,/识别完成/);f.engine.onend();assert.equal(f.button['aria-pressed'],'false');assert.equal(f.timers.size,0);
 f.input.value='My edited words';f.controller.toggle(f.input,f.button,f.output);const old=f.engine;f.controller.cancel();old.onresult({results:[[{transcript:'stale'}]]});assert.equal(f.input.value,'My edited words');assert.equal(old.aborted,true);
});
test('unsupported recognition, denied permission and bounded timeout keep typing available',()=>{
 const absent=fixture(false);absent.controller.toggle(absent.input,absent.button,absent.output);assert.match(absent.output.textContent,/不支持/);assert.equal(absent.input.value,'My draft');
 const f=fixture();f.controller.toggle(f.input,f.button,f.output);f.engine.onerror({error:'not-allowed'});assert.match(f.output.textContent,/拒绝/);assert.equal(f.input.value,'My draft');assert.equal(f.timers.size,0);
 f.controller.toggle(f.input,f.button,f.output);[...f.timers.values()][0]();assert.match(f.output.textContent,/超时/);assert.equal(f.button['aria-pressed'],'false');assert.equal(f.input.value,'My draft');
});
