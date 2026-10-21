import type {Entry, Session, Activity} from './types';

export type Focus = 'balance'|'calm'|'sleep'|'energy'|'connection';
export type Preferences = {
  focus: Focus;
  max_minutes: number;
  weekly_checkins: number;
  weekly_activities: number;
};
export const DEFAULT_PREFERENCES: Preferences = {
  focus:'balance', max_minutes:15, weekly_checkins:5, weekly_activities:3
};
export const CONTEXT_TAGS = ['Work','Study','Family','Relationships','Health','Finances','Rest','Social','Other'] as const;
export type Detail = Activity & {
  steps: string[];
  category: Focus;
  score: number;
  evidence: string;
  trials: number;
  helpful: number;
};
type CatalogItem = Omit<Detail,'reason'|'score'|'evidence'|'trials'|'helpful'> & {purpose:string};
const CATALOG: CatalogItem[] = [
  {id:'breathing',title:'Calming breath reset',minutes:5,difficulty:'Easy',category:'calm',
    purpose:'a short pause during stressful moments',
    steps:['Sit comfortably with both feet supported.','Inhale gently for 4 counts, then exhale gently for 6.','Repeat at a comfortable pace. Stop if uncomfortable.']},
  {id:'grounding',title:'5–4–3–2–1 grounding',minutes:6,difficulty:'Easy',category:'calm',
    purpose:'a sensory break when your thoughts feel busy',
    steps:['Notice five things you can see.','Notice four things you can physically feel.','Notice three sounds, two scents and one taste or breath.']},
  {id:'winddown',title:'Screen-free sleep routine',minutes:15,difficulty:'Easy',category:'sleep',
    purpose:'creating a calmer pre-bed routine',
    steps:['Set your phone aside and dim the lights.','Get comfortable and avoid starting a demanding task.','Choose one quiet activity such as gentle reading or stretching.']},
  {id:'sleepplan',title:'Plan tomorrow’s sleep window',minutes:7,difficulty:'Easy',category:'sleep',
    purpose:'making a consistent schedule easier to follow',
    steps:['Write down tomorrow’s wake-up time.','Choose a realistic bedtime with enough opportunity to rest.','Make one small adjustment to your evening routine.']},
  {id:'walk',title:'Short mindful walk',minutes:10,difficulty:'Easy',category:'energy',
    purpose:'adding accessible light movement',
    steps:['Choose a safe, comfortable walking route.','Walk at a pace that works for you.','Notice your surroundings, then reflect on how you feel.']},
  {id:'stretch',title:'Gentle body stretch',minutes:8,difficulty:'Easy',category:'energy',
    purpose:'taking a movement break',
    steps:['Roll your shoulders slowly.','Stretch your arms and upper back without pushing through pain.','Finish with a slow breath while seated or standing.']},
  {id:'journal',title:'Three-line reflection',minutes:10,difficulty:'Easy',category:'balance',
    purpose:'naming what matters today',
    steps:['Write one sentence about how today felt.','Write one situation that influenced your feelings.','Write one small thing you might try tomorrow.']},
  {id:'gratitude',title:'Notice three small positives',minutes:5,difficulty:'Easy',category:'balance',
    purpose:'reflecting on moments worth remembering',
    steps:['Name three ordinary moments you appreciated.','Notice which one mattered most.','Write down how you could make space for another such moment.']},
  {id:'reachout',title:'Connect with someone you trust',minutes:10,difficulty:'Moderate',category:'connection',
    purpose:'making a supportive connection',
    steps:['Think of someone safe and supportive.','Send a short message or make a call if you want.','Share something small or simply ask how they are doing.']},
  {id:'kindness',title:'One kind gesture',minutes:7,difficulty:'Easy',category:'connection',
    purpose:'doing something thoughtful without pressure',
    steps:['Think of a person you appreciate.','Choose a simple gesture: a sincere note or small helpful act.','Notice what the experience felt like for you.']},
  {id:'focusreset',title:'Clear your mind for five minutes',minutes:5,difficulty:'Easy',category:'balance',
    purpose:'making room for your next step',
    steps:['Write down what is on your mind.','Circle one manageable next action.','Give yourself permission to set aside the rest for now.']}
];

const mean = (xs:number[]) => xs.reduce((sum,x)=>sum+x,0)/Math.max(xs.length,1);
const isoDay = (now:Date) => now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
function daysAgo(n:number,now:Date):string {
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  d.setDate(d.getDate()-n);return isoDay(d);
}
export function filterJournal(entries:Entry[],query:string,range:'30'|'all',now=new Date()):Entry[] {
  const q=query.trim().toLowerCase();
  const floor=range==='30'?daysAgo(29,now):'0000-01-01';
  return entries.filter(e=>e.day>=floor&&
    (!q || [e.day,e.note,e.context_tags||''].some(s=>s.toLowerCase().includes(q))));
}
export function review(entries:Entry[],sessions:Session[],now=new Date()) {
  const start=daysAgo(6,now), prevStart=daysAgo(13,now), prevEnd=daysAgo(7,now);
  const week=entries.filter(e=>e.day>=start&&e.day<=isoDay(now));
  const previous=entries.filter(e=>e.day>=prevStart&&e.day<=prevEnd);
  const weekAvg=week.length?mean(week.map(e=>e.mood)):null;
  const previousAvg=previous.length?mean(previous.map(e=>e.mood)):null;
  const activities=sessions.filter(e=>e.day>=start&&e.day<=isoDay(now));
  const rated=sessions.filter(e=>e.helpful!==null);
  const helpful=rated.filter(e=>e.helpful===1);
  const samples=entries.filter(e=>e.day>=daysAgo(29,now)&&e.day<=isoDay(now));
  const distribution=[1,2,3,4,5].map(m=>samples.filter(e=>e.mood===m).length);
  const daysWithNotes=week.filter(e=>e.note.trim().length>0).length;
  return {
    entries:week.length, checkinDays:week.map(e=>e.day),
    average:weekAvg, previousAverage:previousAvg,
    delta:weekAvg!==null&&previousAvg!==null?Number((weekAvg-previousAvg).toFixed(2)):null,
    activities:activities.length, activityMinutes:activities.reduce((s,e)=>s+(e.duration_seconds||0)/60,0),
    rated:rated.length, helpful:helpful.length,
    distribution, sampleSize:samples.length, notes:daysWithNotes
  };
}
export function weekdayInsights(entries:Entry[]) {
  const groups=Array.from({length:7},()=>[] as number[]);
  for(const e of entries){
    const day=new Date(e.day+'T12:00:00');
    if(Number.isFinite(day.getTime()))groups[(day.getDay()+6)%7].push(e.mood);
  }
  return groups.map((m,i)=>({day:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],
    count:m.length,average:m.length?mean(m):null}));
}
export function contextInsights(entries:Entry[]) {
  if(entries.length<7)return [];
  const labels=CONTEXT_TAGS;
  return labels.map(label=>{
    const withTag=entries.filter(e=>(e.context_tags||'').split(',').includes(label));
    const other=entries.filter(e=>!(e.context_tags||'').split(',').includes(label));
    if(withTag.length<3||other.length<3)return null;
    const diff=mean(withTag.map(e=>e.mood))-mean(other.map(e=>e.mood));
    if(Math.abs(diff)<.25)return null;
    return {label,withCount:withTag.length,otherCount:other.length,
      withAvg:mean(withTag.map(e=>e.mood)),otherAvg:mean(other.map(e=>e.mood)),diff};
  }).filter((x):x is NonNullable<typeof x>=>x!==null)
    .sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)).slice(0,3);
}
export function recommendationPlan(entries:Entry[],sessions:Session[],prefs:Preferences):Detail[] {
  const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
  const ratings = new Map<string,{count:number;good:number}>();
  for(const s of sessions){
    if(s.helpful!==0&&s.helpful!==1)continue;
    const old=ratings.get(s.activity_id)||{count:0,good:0};
    old.count+=1;old.good+=s.helpful;ratings.set(s.activity_id,old);
  }
  return CATALOG.map(item=>{
    const r=ratings.get(item.id)||{count:0,good:0};
    let score=1;
    const reasons:string[]=[];
    if(item.category===prefs.focus){score+=3;reasons.push('Fits your selected focus: '+prefs.focus);}
    if(latest){
      if(item.category==='calm'&&latest.stress>=4){score+=4;reasons.push('Your latest stress log was '+latest.stress+'/5.');}
      if(item.category==='sleep'&&latest.sleep_hours<7){score+=4;reasons.push('You recorded '+latest.sleep_hours+' hours of sleep recently.');}
      if(item.category==='energy'&&latest.exercise_min<20){score+=2;reasons.push('You recorded '+latest.exercise_min+' minutes of movement.');}
      if(item.category==='balance'&&latest.mood<=2){score+=2;reasons.push('Your latest mood was '+latest.mood+'/5.');}
      if(item.category==='connection'&&(latest.context_tags||'').split(',').includes('Social')){score+=2;reasons.push('You noted a social context.');}
    }
    if(item.minutes>prefs.max_minutes)score-=5;
    if(r.count>0){
      // Bayes-style smoothing prevents one response from dominating selection.
      const helpfulness=(r.good+1)/(r.count+2);
      score += (helpfulness-.5)*5;
      reasons.push(r.good+' of '+r.count+' rated attempts were helpful to you.');
    }
    if(!reasons.length)reasons.push('A low-pressure option for '+item.purpose+'.');
    return {...item,reason:reasons.join(' '),evidence:r.count?'Your own activity ratings are included in this ranking.':'Based on your selected focus and recent logs; no individual benefit is guaranteed.',
      score,helpful:r.good,trials:r.count};
  }).sort((a,b)=>b.score-a.score || a.minutes-b.minutes || a.id.localeCompare(b.id)).slice(0,3);
}
export function weeklyGoalProgress(entries:Entry[],sessions:Session[],prefs:Preferences,now=new Date()) {
  const progress=review(entries,sessions,now);
  return {
    checkins:{done:progress.entries,target:prefs.weekly_checkins,ratio:Math.min(1,progress.entries/prefs.weekly_checkins)},
    activities:{done:progress.activities,target:prefs.weekly_activities,ratio:Math.min(1,progress.activities/prefs.weekly_activities)}
  };
}
