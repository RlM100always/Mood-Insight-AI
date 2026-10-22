import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES,recommendationPlan,review,filterJournal,weekdayInsights,contextInsights,weeklyGoalProgress} from '../src/deep.ts';
const day=(d,mood=3,context_tags='')=>({id:d,day:d,mood,sleep_hours:7,exercise_min:5,stress:3,energy:3,sleep_quality:3,context_tags,sleep_recorded:1,exercise_recorded:1,stress_recorded:1,energy_recorded:1,sleep_quality_recorded:1,note:'',created_at:0,updated_at:0});
test('activity selection respects time and focus and sorts top three',()=>{
 const p={...DEFAULT_PREFERENCES,max_minutes:7,focus:'calm'};
 const result=recommendationPlan([day('2026-10-21',2)],[ ],p);
 assert.equal(result.length,3);
 assert.equal(result[0].category,'calm');
 assert.ok(result.every(x=>x.steps.length>0 && x.reason.length>5));
});
test('negative and positive personal feedback affect ranking',()=>{
 const a=Array.from({length:6},(_,i)=>({id:String(i),activity_id:'breathing',day:'2026-10-21',created_at:i,helpful:0}));
 const b=Array.from({length:6},(_,i)=>({id:'b'+i,activity_id:'grounding',day:'2026-10-21',created_at:i,helpful:1}));
 const p={...DEFAULT_PREFERENCES,focus:'calm',max_minutes:10};
 const sorted=recommendationPlan([day('2026-10-21')],[...a,...b],p);
 assert.equal(sorted[0].id,'grounding');
 assert.equal(sorted[0].trials,6);
});
test('weekly stats distinguish missing baseline and do not create phantom gains',()=>{
 const now=new Date(2026,9,21,12);
 const one=review([day('2026-10-20',2)],[],now);
 assert.equal(one.average,2);assert.equal(one.delta,null);assert.equal(one.activities,0);
 const both=review([day('2026-10-13',4),day('2026-10-20',2)],[],now);
 assert.equal(both.delta,-2);
 assert.equal(weeklyGoalProgress([day('2026-10-20')],[],DEFAULT_PREFERENCES,now).checkins.done,1);
});
test('journal search is local, case insensitive and date scoped',()=>{
 const all=[{...day('2026-09-03'),note:'Old study note'}, {...day('2026-10-19'),note:'Work was intense'}];
 const now=new Date(2026,9,21,12);
 assert.deepEqual(filterJournal(all,'WORK','30',now).map(x=>x.day),['2026-10-19']);
 assert.equal(filterJournal(all,'study','30',now).length,0);
 assert.equal(filterJournal(all,'study','all',now).length,1);
});
test('context insight requires sample count and avoids fabricated percentages',()=>{
 const logs=[];
 for(let i=1;i<=8;i++)logs.push(day('2026-10-'+String(i).padStart(2,'0'),i<=4?2:4,i<=4?'Work':''));
 const insight=contextInsights(logs);
 assert.equal(insight[0].label,'Work');
 assert.equal(insight[0].withCount,4);
 assert.equal(weekdayInsights(logs).length,7);
});

test('default-looking but skipped measurements do not trigger personalised stress or sleep claims',()=>{
 const now=new Date(2026,9,22,12);
 const partial={...day('2026-10-22',3),sleep_recorded:0,exercise_recorded:0,stress_recorded:0,energy_recorded:0,sleep_quality_recorded:0};
 const next=suggestedNextStep([partial],[],now);
 assert.notEqual(next.situation,'stress');
 assert.notEqual(next.situation,'sleep');
 const plans=recommendationPlan([partial],[],DEFAULT_PREFERENCES,'general',true,now);
 assert.ok(!plans.some(x=>x.reason.includes('latest check-in recorded high stress')));
 assert.ok(!plans.some(x=>x.reason.includes('latest check-in recorded 7 hours of sleep')));
});
