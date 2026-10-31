import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewSchedule} from '../src/review.ts';
import {dialogues} from '../src/dialogues.ts';
test('review intervals prioritize difficulty and retain exact next dates',()=>{
 const now=Date.parse('2026-01-01T00:00:00Z');
 assert.equal(reviewSchedule('unmastered',4,now).nextReviewAt,'2026-01-01T00:10:00.000Z');
 assert.equal(reviewSchedule('unmastered',4,now).masteryStreak,0);
 assert.equal(reviewSchedule('review',0,now).nextReviewAt,'2026-01-01T01:00:00.000Z');
 assert.equal(reviewSchedule('learned',0,now).nextReviewAt,'2026-01-02T00:00:00.000Z');
 assert.equal(reviewSchedule('mastered',0,now).nextReviewAt,'2026-01-04T00:00:00.000Z');
 assert.equal(reviewSchedule('mastered',1,now).nextReviewAt,'2026-01-07T00:00:00.000Z');
 assert.equal(reviewSchedule('mastered',5,now).nextReviewAt,'2026-01-31T00:00:00.000Z');
});
test('preset practice is bilingual, uses both roles and contains life and business',()=>{
 assert.equal(new Set(dialogues.map(d=>d.id)).size,dialogues.length);
 assert.ok(dialogues.some(d=>d.category==='life'));assert.ok(dialogues.some(d=>d.category==='business'));
 for(const d of dialogues){assert.ok(d.title_en&&d.title_zh);assert.ok(d.turns.some(t=>t.role==='a'));assert.ok(d.turns.some(t=>t.role==='b'));for(const turn of d.turns)assert.ok(turn.english&&turn.chinese);}
});
