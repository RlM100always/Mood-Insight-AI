import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {predictNextMood,canPredict} from '../src/ml/linear.ts';
const model=JSON.parse(readFileSync(new URL('../src/ml/demo-model.json',import.meta.url),'utf8'));
const e={id:'1',day:'2026-10-19',mood:3,sleep_hours:7.5,exercise_min:25,stress:2,energy:3,sleep_quality:3,sleep_recorded:1,exercise_recorded:1,stress_recorded:1,energy_recorded:1,sleep_quality_recorded:1,note:'',created_at:1,updated_at:1};
test('trained synthetic demo model produces finite probabilities with sum 1',()=>{
 const r=predictNextMood(model,e);
 assert.ok(r.predictedMood>=1&&r.predictedMood<=5);
 assert.ok(r.probabilities.every(p=>Number.isFinite(p.probability)&&p.probability>=0&&p.probability<=1));
 assert.ok(Math.abs(r.probabilities.reduce((s,p)=>s+p.probability,0)-1)<1e-10);
 assert.equal(r.modelStatus,'not_tested_on_real_participants');
});
test('model does not show outputs until enough local history',()=>{
 assert.equal(canPredict([e]),false);
 assert.equal(canPredict(Array.from({length:7},()=>e)),true);
 assert.equal(canPredict(Array.from({length:7},()=>({...e,sleep_recorded:0}))),false);
});
test('model rejects invalid schema or non-finite input',()=>{
 assert.throws(()=>predictNextMood({...model,features:['wrong']},e));
 assert.throws(()=>predictNextMood(model,{...e,sleep_hours:Infinity}));
});
test('model scores react to input changes',()=>{
 const lo=predictNextMood(model,{...e,sleep_hours:4,stress:5,exercise_min:0});
 const hi=predictNextMood(model,{...e,sleep_hours:9,stress:1,exercise_min:75});
 assert.notDeepEqual(lo.probabilities,hi.probabilities);
});
