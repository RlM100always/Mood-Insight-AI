import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {predictTreeDemo} from '../src/ml/trees.ts';
const model=JSON.parse(readFileSync(new URL('../src/ml/trees-demo.json',import.meta.url),'utf8'));
const entry={id:'sample',day:'2026-10-19',mood:3,stress:2,sleep_hours:8,
  exercise_min:30,energy:3,sleep_quality:3,note:'',context_tags:'',created_at:1,updated_at:1};
for(const kind of ['forest','tree']){
 test(kind+' is a trained offline synthetic demo with bounded probabilities',()=>{
  const result=predictTreeDemo(model,entry,kind);
  assert.ok(result.predictedMood>=1&&result.predictedMood<=5);
  assert.ok(Math.abs(result.probabilities.reduce((sum,p)=>sum+p.probability,0)-1)<1e-10);
  assert.equal(result.modelStatus,'not_tested_on_real_participants');
  assert.ok(result.probabilities.every(p=>p.probability>=0&&p.probability<=1));
 });
}
test('both tree models produce different results for different data',()=>{
  const low={...entry,mood:1,sleep_hours:4,stress:5,exercise_min:0};
  const high={...entry,mood:5,sleep_hours:9,stress:1,exercise_min:60};
  for(const kind of ['forest','tree']){
    const a=predictTreeDemo(model,low,kind);
    const b=predictTreeDemo(model,high,kind);
    assert.notDeepEqual(a.probabilities,b.probabilities);
  }
});
test('model validation refuses incorrect schema and malicious tree cycles',()=>{
  assert.throws(()=>predictTreeDemo({...model,schema:'unknown'},entry,'tree'));
  assert.throws(()=>predictTreeDemo({...model,decision_tree:[[0,7,0,0,[0,0,0,0,1]]]},entry,'tree'));
});
