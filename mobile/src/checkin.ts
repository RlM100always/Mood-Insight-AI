import type {EntryInput, MoodScore} from './types';
import {normalizeContextTags} from './context';

export type CheckinDraft = {
  day:string;
  mood:MoodScore|null;
  sleep:string;
  exercise:string;
  stress:MoodScore|null;
  energy:MoodScore|null;
  sleepQuality:MoodScore|null;
  note:string;
  tags:string[];
};
type RecordedNumber = {value:number;recorded:0|1};
function optionalNumber(raw:string,label:string,min:number,max:number,defaultValue:number,integer=false):RecordedNumber {
  if(raw.trim()==='')return {value:defaultValue,recorded:0};
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))
    throw new Error(label+' must be '+(integer?'a whole number between ':'between ')+min+' and '+max+', or left blank.');
  return {value,recorded:1};
}
function optionalScore(value:MoodScore|null):{value:MoodScore;recorded:0|1} {
  return value===null?{value:3,recorded:0}:{value,recorded:1};
}
export function buildEntryInput(draft:CheckinDraft):EntryInput {
  if(draft.mood===null)throw new Error('Choose your mood before saving. All other measurements are optional.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.day)||!Number.isFinite(new Date(draft.day+'T12:00:00').getTime()))
    throw new Error('Enter a valid date in YYYY-MM-DD format.');
  if(draft.note.length>2000)throw new Error('Journal notes must be 2,000 characters or fewer.');
  const sleep=optionalNumber(draft.sleep,'Sleep hours',0,24,7);
  const exercise=optionalNumber(draft.exercise,'Movement minutes',0,600,0,true);
  const stress=optionalScore(draft.stress);
  const energy=optionalScore(draft.energy);
  const quality=optionalScore(draft.sleepQuality);
  const tags=normalizeContextTags(draft.tags);
  return {
    day:draft.day,mood:draft.mood,sleep_hours:sleep.value,exercise_min:exercise.value,
    stress:stress.value,energy:energy.value,sleep_quality:quality.value,
    context_tags:tags.join(','),note:draft.note.trim(),
    sleep_recorded:sleep.recorded,exercise_recorded:exercise.recorded,
    stress_recorded:stress.recorded,energy_recorded:energy.recorded,
    sleep_quality_recorded:quality.recorded
  };
}
