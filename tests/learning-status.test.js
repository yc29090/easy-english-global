import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LEARNING_STATES,statusLabel,statusPanel,statusBadge,isReviewDue} from '../public/learning-status.js';
const css=await readFile(new URL('../public/learning-status.css',import.meta.url),'utf8');
const luminance=hex=>{const values=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('specified shared accents and deep text meet AA contrast in normal and selected states',()=>{
 const accents={learned:'#2563EB',mastered:'#16A34A',unmastered:'#EA580C',review:'#9333EA'};
 for(const state of LEARNING_STATES){assert.ok(css.includes(`--state-${state}:${accents[state]}`));const rule=css.split(`[data-learning-state="${state}"]{`)[1].split('}')[0],values=Object.fromEntries([...rule.matchAll(/--state-(\w+):(#[a-f0-9]+)/gi)].map(m=>[m[1],m[2]]));
  for(const bg of [values.soft,values.selected]){assert.ok(contrast(values.ink,bg)>=4.5,`${state} text AA`);assert.ok(contrast(accents[state],bg)>=3,`${state} border 3:1`);assert.ok(contrast('#0F172A',bg)>=3,`${state} focus`);}
 }
});
test('due badge is independent of saved mastery and never changes review dates or state',()=>{
 const record=Object.freeze({status:'mastered',next_review_at:'2026-01-01T00:00:00Z'}),now=Date.parse('2026-02-01T00:00:00Z');assert.equal(isReviewDue(record,now),true);assert.equal(record.status,'mastered');assert.equal(record.next_review_at,'2026-01-01T00:00:00Z');assert.equal(isReviewDue({status:'review',next_review_at:'2026-03-01T00:00:00Z'},now),false);assert.equal(isReviewDue({status:'unmastered'},now),false);assert.equal(isReviewDue({},now),false);
});
test('panels expose four explicit pressed states, group name, hidden check icons and live pending feedback',()=>{
 const html=statusPanel({status:'mastered'});assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert.equal((html.match(/aria-pressed="false"/g)||[]).length,3);assert.equal((html.match(/aria-hidden="true">✓/g)||[]).length,4);assert.ok(html.includes('role="group"'));assert.ok(html.includes('role="status"'));assert.ok(html.includes('待掌握'));assert.equal(statusLabel('unmastered','en'),'Not mastered');assert.ok(statusBadge('review','zh','<script>').includes('&lt;script&gt;'));
});
