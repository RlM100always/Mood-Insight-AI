import test from 'node:test';
import assert from 'node:assert/strict';
import {averageMood,currentStreak,detectPatterns,recommend,localDay} from '../src/insights.ts';

function entry(day,mood,sleep,exercise,stress) {
  return {id:day,day,mood,sleep_hours:sleep,exercise_min:exercise,stress,energy:3,sleep_quality:3,
    sleep_recorded:1,exercise_recorded:1,stress_recorded:1,energy_recorded:1,sleep_quality_recorded:1,note:'',
    created_at:Date.now(),updated_at:Date.now()};
}
test('no invented statistics with too little history',()=>{
  const logs=[entry('2026-10-19',2,5,0,5),entry('2026-10-20',3,7,10,3)];
  assert.deepEqual(detectPatterns(logs),[]);
  assert.equal(recommend(logs).length,3);
  assert.equal(averageMood(logs),'2.5');
});
test('detects only supported group comparisons with counts',()=>{
  const logs=[
    entry('2026-10-01',2,5,0,5),entry('2026-10-02',2,5,0,5),
    entry('2026-10-03',2,6,0,5),entry('2026-10-04',4,8,25,2),
    entry('2026-10-05',4,8,25,2),entry('2026-10-06',5,8,25,2),
    entry('2026-10-07',4,8,25,2)
  ];
  const results=detectPatterns(logs);
  assert.ok(results.some(p=>p.id==='sleep' && p.count===7 && p.detail.includes('3 logged days')));
  assert.ok(results.every(p=>p.detail.includes('association, not a cause')));
  assert.equal(recommend(logs).length,3);
});
test('calendar streak respects missing days and local calendar',()=>{
  const now=new Date(2026,9,21,12,0,0);
  const logs=[entry('2026-10-20',3,7,0,3),entry('2026-10-19',3,7,0,3)];
  assert.equal(currentStreak(logs,now),2);
  assert.equal(localDay(now),'2026-10-21');
});
