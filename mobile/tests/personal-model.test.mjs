import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {evaluatePersonalMood} from '../src/ml/personal.ts';
function fixture(count=100){
 const out=[];
 for(let i=0;i<count;i++){
  const day=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
  const sleep=[5,8,7,6][i%4],exercise=[10,40,20,5][i%4],stress=[5,2,1,4][i%4];
  let mood=3;if(i>0){const p=out[i-1];mood=p.stress>=4?1:p.sleep_hours>=8?5:3;}
  out.push({id:String(i),day,mood,sleep_hours:sleep,exercise_min:exercise,stress,energy:3,sleep_quality:3,sleep_recorded:1,exercise_recorded:1,stress_recorded:1,energy_recorded:1,sleep_quality_recorded:1,note:'',context_tags:'',created_at:Date.now(),updated_at:Date.now()});
 }return out;
}
test('personal experiment uses consecutive local check-ins and chronological holdout',()=>{
 const logs=fixture(),r=evaluatePersonalMood(logs,logs.at(-1).day);
 assert.ok(r.pairs>=30);assert.ok(r.holdout>=6);assert.equal(r.evidence,'local-real-checkins-only');
 assert.ok(['ready','baseline-wins','need-variation'].includes(r.status));
 if(r.status==='ready'){assert.ok(r.predictedMood>=1&&r.predictedMood<=5);assert.ok(r.modelAccuracy>=r.baselineAccuracy+.05);assert.ok(r.modelMae<r.baselineMae);
  assert.ok(r.modelConfidence>0&&r.modelConfidence<=1);assert.equal(r.probabilityByMood.length,5);
  assert.ok(Math.abs(r.probabilityByMood.reduce((a,b)=>a+b,0)-1)<1e-6);assert.ok(r.topInputs.length>0);}
});
test('model refuses sparse, skipped, missing-day and stale check-ins',()=>{
 const logs=fixture();assert.equal(evaluatePersonalMood(logs.slice(-10),logs.at(-1).day).status,'need-history');
 const skipped=logs.map(x=>({...x}));skipped[skipped.length-1].stress_recorded=0;
 assert.equal(evaluatePersonalMood(skipped,skipped.at(-1).day).status,'needs-complete-checkin');
 const stale=evaluatePersonalMood(logs,'2099-01-01');assert.notEqual(stale.status,'ready');assert.equal(stale.predictedMood,null);
 const gap=logs.map(x=>({...x}));gap.splice(20,1);assert.ok(evaluatePersonalMood(gap,gap.at(-1).day).pairs<logs.length-1);
});
test('personal experiment never mutates local entries',()=>{
 const logs=fixture(),before=JSON.stringify(logs);evaluatePersonalMood(logs,logs.at(-1).day);assert.equal(JSON.stringify(logs),before);
});

test('personal model stays responsive on the full 365-day retention window',()=>{
 const logs=fixture(365);
 const start=performance.now();
 const report=evaluatePersonalMood(logs,logs.at(-1).day);
 const elapsed=performance.now()-start;
 assert.ok(report.pairs>=300);
 assert.ok(elapsed<2500,`365-day personal model took ${elapsed.toFixed(0)}ms (budget 2500ms)`);
});
