import test from 'node:test';
import assert from 'node:assert/strict';
import {activityOutcomeInsights,consistencyInsights,contextMoodRanking,dataCoverage,dataQualityCoach,insightReadiness,moodCalendar,moodDistribution,recoveryProfile,signalAssociations,weekComparison,weekdayMoodProfile,weeklySnapshots,windowSummary} from '../src/advanced.ts';

const entry=(day,mood=3,over={})=>({id:day,day,mood,sleep_hours:7,exercise_min:20,stress:3,energy:3,sleep_quality:3,
 sleep_recorded:1,exercise_recorded:1,stress_recorded:1,energy_recorded:1,sleep_quality_recorded:1,
 note:'',context_tags:'',created_at:0,updated_at:0,...over});

test('window summary excludes future days and never fills gaps',()=>{
 const now=new Date(2026,9,23,12);
 const r=windowSummary([entry('2026-10-21',2),entry('2026-10-23',4),entry('2026-10-24',1)],7,now);
 assert.equal(r.logged,2);assert.equal(r.averageMood,3);assert.equal(r.coverage,2/7);assert.equal(r.lowDays,1);assert.equal(r.highDays,1);
});
test('coverage respects optional recorded flags',()=>{
 const now=new Date(2026,9,23,12);
 const r=dataCoverage([entry('2026-10-22',3,{sleep_recorded:0,note:'x'}),entry('2026-10-23',4,{context_tags:'Work'})],30,now);
 assert.equal(r.sleep,.5);assert.equal(r.stress,1);assert.equal(r.journal,.5);assert.equal(r.contexts,.5);
});
test('signal associations require real variation and can surface stress direction',()=>{
 const rows=[];
 for(let i=1;i<=12;i++){
  const stress=i%5+1;
  rows.push(entry('2026-10-'+String(i).padStart(2,'0'),6-stress,{stress}));
 }
 const signals=signalAssociations(rows,90,new Date(2026,9,23,12));
 const stress=signals.find(x=>x.id==='stress');
 assert.ok(stress);assert.ok(stress.correlation<-.5);assert.ok(stress.samples>=7);
});
test('consistency reports current and longest streaks without inventing missing days',()=>{
 const rows=[entry('2026-10-18'),entry('2026-10-19'),entry('2026-10-21'),entry('2026-10-22'),entry('2026-10-23')];
 const r=consistencyInsights(rows,new Date(2026,9,23,12));
 assert.equal(r.currentStreak,3);assert.equal(r.longestStreak,3);assert.equal(r.logged30,5);
});
test('activity outcomes combine helpfulness and before-after mood samples',()=>{
 const sessions=[
  {id:'1',activity_id:'walk',day:'2026-10-20',created_at:1,helpful:1,duration_seconds:600,mood_before:2,mood_after:4},
  {id:'2',activity_id:'walk',day:'2026-10-21',created_at:2,helpful:0,duration_seconds:300,mood_before:3,mood_after:3},
  {id:'3',activity_id:'journal',day:'2026-10-21',created_at:3,helpful:null,duration_seconds:240,mood_before:null,mood_after:null}
 ];
 const r=activityOutcomeInsights(sessions);
 const walk=r.find(x=>x.id==='walk');
 assert.equal(walk.rated,2);assert.equal(walk.helpfulRate,.5);assert.equal(walk.moodSamples,2);assert.equal(walk.averageMoodShift,1);
});

test('week comparison uses two real seven-day windows',()=>{
 const now=new Date(2026,9,23,12);
 const rows=[entry('2026-10-10',1),entry('2026-10-16',2),entry('2026-10-17',3),entry('2026-10-20',4),entry('2026-10-23',4)];
 const r=weekComparison(rows,now);
 assert.equal(r.currentLogged,3);assert.equal(r.previousLogged,2);
 assert.equal(r.currentAverage,11/3);assert.equal(r.previousAverage,1.5);assert.ok(r.delta>2.1);
});
test('context ranking needs repeated tags and reports descriptive differences',()=>{
 const rows=[
  entry('2026-10-18',2,{context_tags:'Work'}),entry('2026-10-19',2,{context_tags:'Work,Study'}),
  entry('2026-10-20',3,{context_tags:'Work'}),entry('2026-10-21',5,{context_tags:'Rest'}),
  entry('2026-10-22',5,{context_tags:'Rest'}),entry('2026-10-23',4,{context_tags:'Rest'})
 ];
 const r=contextMoodRanking(rows,90,new Date(2026,9,23,12));
 assert.equal(r.length,2);assert.equal(r[0].samples,3);assert.ok(r.some(x=>x.label==='Work'&&x.averageMood<3));
});
test('recovery profile only uses next calendar day pairs',()=>{
 const rows=[entry('2026-10-18',2),entry('2026-10-19',4),entry('2026-10-21',1),entry('2026-10-23',5)];
 const r=recoveryProfile(rows,90,new Date(2026,9,23,12));
 assert.equal(r.lowDays,2);assert.equal(r.nextDayPairs,1);assert.equal(r.averageNextDayChange,2);assert.equal(r.recoveryRate,1);
});
test('mood calendar preserves missing days and data completeness',()=>{
 const r=moodCalendar([entry('2026-10-23',4,{sleep_recorded:0})],3,new Date(2026,9,23,12));
 assert.equal(r.length,3);assert.equal(r[0].mood,null);assert.equal(r[2].mood,4);assert.equal(r[2].completeness,.8);
});
test('data quality coach never asks to fabricate missing values',()=>{
 const rows=[entry('2026-10-21',3,{sleep_recorded:0}),entry('2026-10-22',3,{sleep_recorded:0}),entry('2026-10-23',3,{sleep_recorded:0})];
 const r=dataQualityCoach(rows,new Date(2026,9,23,12));
 assert.match(r.label,/sleep/);assert.match(r.message,/Skipping is always allowed/);
});


test('mood distribution preserves all five categories and real shares',()=>{
 const rows=[entry('2026-10-20',1),entry('2026-10-21',3),entry('2026-10-22',3),entry('2026-10-23',5)];
 const r=moodDistribution(rows,30,new Date(2026,9,23,12));
 assert.deepEqual(r.map(x=>x.count),[1,0,2,0,1]);
 assert.equal(r.find(x=>x.mood===3).share,.5);
 assert.equal(r.reduce((s,x)=>s+x.share,0),1);
});
test('weekly snapshots keep four real seven-day buckets with gaps',()=>{
 const rows=[entry('2026-10-03',2),entry('2026-10-10',3),entry('2026-10-17',4),entry('2026-10-23',5)];
 const r=weeklySnapshots(rows,4,new Date(2026,9,23,12));
 assert.equal(r.length,4);
 assert.equal(r[3].end,'2026-10-23');
 assert.equal(r[3].logged,1);
 assert.equal(r[3].averageMood,5);
 assert.equal(r[3].coverage,1/7);
});
test('weekday profile requires at least two real examples per weekday',()=>{
 const rows=[
  entry('2026-10-05',2),entry('2026-10-12',4),
  entry('2026-10-06',5)
 ];
 const r=weekdayMoodProfile(rows,90,new Date(2026,9,23,12));
 assert.equal(r.length,1);
 assert.equal(r[0].weekday,'Mon');
 assert.equal(r[0].averageMood,3);
 assert.equal(r[0].samples,2);
});
test('insight readiness grows with real coverage but never invents records',()=>{
 const early=insightReadiness([entry('2026-10-23',3,{sleep_recorded:0,exercise_recorded:0,stress_recorded:0,energy_recorded:0,sleep_quality_recorded:0})],new Date(2026,9,23,12));
 const rows=[];
 for(let i=0;i<30;i++){
  const d=new Date(2026,9,23-i,12);
  const day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  rows.push(entry(day,(i%5)+1,{context_tags:i<15?'Work':'Rest'}));
 }
 const strong=insightReadiness(rows,new Date(2026,9,23,12));
 assert.equal(early.recordedDays,1);
 assert.ok(strong.score>early.score);
 assert.equal(strong.recordedDays,30);
 assert.equal(strong.level,'strong');
});
