import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareSpeech,createSpeechPractice,speechTokens} from '../public/speech-practice.js';
test('speech text alignment handles punctuation, case, contractions, omissions and substitutions without scores',()=>{
 assert.deepEqual(speechTokens("I'm READY!"),['i','am','ready']);assert.ok(compareSpeech('I am ready.',"I'm ready").every(o=>o.kind==='match'));
 assert.ok(compareSpeech('I want water.','I water').some(o=>o.kind==='missing'&&o.expected==='want'));
 assert.ok(compareSpeech('I want water.','I want coffee').some(o=>o.kind==='different'&&o.expected==='water'&&o.actual==='coffee'));
 assert.ok(compareSpeech('Hello.','Hello please').some(o=>o.kind==='extra'&&o.actual==='please'));
 assert.ok(compareSpeech('Help me.','').every(o=>o.kind==='missing'));assert.equal(speechTokens('word '.repeat(1000)).length,100);
});
test('speech recognition never starts on construction and only starts after an explicit call',()=>{
 const instances=[],states=[];let network=0;
 class Recognition{constructor(){instances.push(this);}start(){this.started=true;}abort(){this.aborted=true;}}
 const practice=createSpeechPractice({SpeechRecognition:Recognition,isSecureContext:true,fetch:()=>{network++;}});
 assert.equal(instances.length,0);assert.equal(practice.supported,true);
 practice.start('I want water.',s=>states.push(s));assert.equal(instances.length,1);assert.equal(instances[0].lang,'en-US');assert.equal(instances[0].continuous,false);
 instances[0].onresult({results:[[{transcript:'I want coffee'}]]});assert.equal(states.at(-1).transcript,'I want coffee');assert.ok(states.at(-1).operations.some(o=>o.kind==='different'));
 practice.stop();assert.equal(instances[0].aborted,true);assert.equal(network,0);
});
test('speech recognition stops retries and ignores callbacks after navigation or cancellation',()=>{
 const instances=[],states=[];
 class Recognition{constructor(){instances.push(this);}start(){}abort(){this.aborted=true;}}
 const practice=createSpeechPractice({webkitSpeechRecognition:Recognition,isSecureContext:true});
 practice.start('Hello.',s=>states.push(s));const late=instances[0].onresult;practice.start('Thanks.',s=>states.push(s));assert.equal(instances[0].aborted,true);
 late({results:[[{transcript:'ignored'}]]});assert.ok(!states.some(s=>s.transcript==='ignored'));
 const current=instances[1].onresult;practice.stop();current({results:[[{transcript:'also ignored'}]]});assert.ok(!states.some(s=>s.transcript==='also ignored'));
});
test('unavailable speech and permission denial degrade safely without fabricated results',()=>{
 const states=[];let instance;
 class Recognition{constructor(){instance=this;}start(){}abort(){}}
 const unsupported=createSpeechPractice({isSecureContext:true});assert.equal(unsupported.supported,false);unsupported.start('Hello',s=>states.push(s));assert.equal(states.at(-1).status,'unsupported');
 assert.equal(createSpeechPractice({SpeechRecognition:Recognition,isSecureContext:false}).supported,false);
 const practice=createSpeechPractice({SpeechRecognition:Recognition,isSecureContext:true});practice.start('Hello',s=>states.push(s));instance.onerror({error:'not-allowed'});assert.deepEqual(states.at(-1),{status:'error',code:'not-allowed'});
 instance.onerror({error:'unknown-sensitive-message'});assert.equal(states.at(-1).code,'unavailable');assert.ok(!states.some(s=>'score' in s));
});
