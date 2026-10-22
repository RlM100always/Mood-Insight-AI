import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEntryInput} from '../src/checkin.ts';

const base={day:'2026-10-22',mood:4,sleep:'',exercise:'',stress:null,energy:null,sleepQuality:null,note:'',tags:[]};
test('mood-only check-in is quick and optional measurements are explicitly unknown',()=>{
 const value=buildEntryInput(base);
 assert.equal(value.mood,4);
 assert.equal(value.sleep_recorded,0);
 assert.equal(value.exercise_recorded,0);
 assert.equal(value.stress_recorded,0);
 assert.equal(value.energy_recorded,0);
 assert.equal(value.sleep_quality_recorded,0);
 assert.equal(value.sleep_hours,7);
 assert.equal(value.exercise_min,0);
});
test('provided measurements are recorded and validated',()=>{
 const value=buildEntryInput({...base,sleep:'6.5',exercise:'20',stress:4,energy:2,sleepQuality:3});
 assert.equal(value.sleep_recorded,1);
 assert.equal(value.exercise_recorded,1);
 assert.equal(value.stress_recorded,1);
 assert.equal(value.sleep_hours,6.5);
 assert.equal(value.exercise_min,20);
 assert.throws(()=>buildEntryInput({...base,sleep:'25'}),/Sleep hours/);
 assert.throws(()=>buildEntryInput({...base,exercise:'3.5'}),/whole number/);
 assert.throws(()=>buildEntryInput({...base,mood:null}),/Choose your mood/);
});
