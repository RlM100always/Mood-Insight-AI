import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES,recommendationPlan,filterJournal,review} from '../src/deep.ts';
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
