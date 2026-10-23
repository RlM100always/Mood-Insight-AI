import test from 'node:test';
import assert from 'node:assert/strict';
import {activityOutcomeInsights,consistencyInsights,dataCoverage,signalAssociations,windowSummary} from '../src/advanced.ts';

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
