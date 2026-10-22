import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES,recommendationPlan,filterJournal,review,suggestedNextStep} from '../src/deep.ts';
function entry(date,mood=3){
 return {id:date,day:date,mood,stress:4,energy:3,sleep_quality:3,sleep_hours:6.5,
 exercise_min:0,context_tags:'Study',note:'study journal',created_at:0,updated_at:0};
}
test('new data fields can be used in rankings and local journal search',()=>{
 const logs=[entry('2026-10-19',3),entry('2026-10-20',4)];
 assert.equal(recommendationPlan(logs,[],{...DEFAULT_PREFERENCES,focus:'sleep'})[0].category,'sleep');
 assert.equal(filterJournal(logs,'study','all').length,2);
});
test('activity minutes and helpfulness reflect actual session records',()=>{
 const sessions=[{id:'1',activity_id:'breathing',day:'2026-10-20',created_at:1,helpful:1,
 duration_seconds:180,mood_before:2,mood_after:3}];
 const now=new Date(2026,9,21,12);
 const result=review([entry('2026-10-20')],sessions,now);
 assert.equal(result.activityMinutes,3);
 assert.equal(result.rated,1);
 assert.equal(result.helpful,1);
});

test('situation-specific plans prioritise relevant short actions and allow browsing the full library',()=>{
 const logs=[entry('2026-10-21',2)];
 const prefs={...DEFAULT_PREFERENCES,max_minutes:5};
 const overthinking=recommendationPlan(logs,[],prefs,'overthinking',false,new Date(2026,9,22,12));
 assert.equal(overthinking.length,3);
 assert.ok(overthinking.some(x=>x.id==='thoughtparking'||x.id==='sensoryreset'));
 const money=recommendationPlan(logs,[],prefs,'money',false,new Date(2026,9,22,12));
 assert.ok(money.some(x=>x.id==='moneytriage'));
 const all=recommendationPlan(logs,[],prefs,'general',true,new Date(2026,9,22,12));
 assert.ok(all.length>=20);
});
test('stale check-ins never keep steering current suggestions; missed days do not demand backfilling',()=>{
 const old=entry('2026-09-01',1);
 const now=new Date(2026,9,22,12);
 const plan=recommendationPlan([old],[],DEFAULT_PREFERENCES,'general',true,now);
 assert.ok(!plan.some(x=>x.reason.includes('latest check-in recorded high stress')));
 const next=suggestedNextStep([old],[],now);
 assert.equal(next.title,'Restart without catching up');
 assert.equal(next.situation,'general');
});
test('next-step suggestions respond to recent stress, sleep and personal helpful feedback',()=>{
 const now=new Date(2026,9,22,12);
 const highStress={...entry('2026-10-22',3),stress:5,sleep_hours:8};
 assert.equal(suggestedNextStep([highStress],[],now).situation,'stress');
 const shortSleep={...entry('2026-10-22',4),stress:2,sleep_hours:5};
 assert.equal(suggestedNextStep([shortSleep],[],now).situation,'sleep');
 const helped={id:'s1',activity_id:'moneytriage',day:'2026-10-21',created_at:Date.now(),helpful:1,duration_seconds:180,mood_before:3,mood_after:4};
 assert.equal(suggestedNextStep([{...entry('2026-10-22',4),stress:2}], [helped], now).situation,'money');
});
