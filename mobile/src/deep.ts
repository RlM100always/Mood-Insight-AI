import type {Entry, Session, Activity} from './types';

export type Focus = 'balance'|'calm'|'sleep'|'energy'|'connection';
export type Situation = 'general'|'overthinking'|'overwhelmed'|'low_motivation'|'lonely'|'sleep'|'stress'|'conflict'|'money';
export const SITUATIONS: {id:Situation;label:string;description:string}[] = [
 {id:'general',label:'Just exploring',description:'A small reset without a specific problem'},
 {id:'overthinking',label:'Overthinking',description:'Thoughts keep looping'},
 {id:'overwhelmed',label:'Too much to do',description:'Work, study or daily tasks feel heavy'},
 {id:'low_motivation',label:'Low motivation',description:'Starting feels difficult'},
 {id:'lonely',label:'Feeling alone',description:'You could use a safe connection'},
 {id:'sleep',label:'Sleep & wind-down',description:'Switching off feels hard'},
 {id:'stress',label:'Stress / tension',description:'You need a short reset'},
 {id:'conflict',label:'After a conflict',description:'You need space before your next step'},
 {id:'money',label:'Money worries',description:'Turn a worry into one practical next step'}
];
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
  moodSamples: number;
  averageMoodShift: number | null;
  situations: Situation[];
};
type CatalogItem = Omit<Detail,'reason'|'score'|'evidence'|'trials'|'helpful'|'moodSamples'|'averageMoodShift'|'situations'> & {purpose:string; situations?:Situation[]};
const CATALOG: CatalogItem[] = [
  {id:'breathing',title:'Calming breath reset',minutes:5,difficulty:'Easy',category:'calm',
    situations:['stress','overthinking','general'],
    purpose:'a short pause during stressful moments',
    steps:['Sit comfortably with both feet supported.','Inhale gently for 4 counts, then exhale gently for 6.','Repeat at a comfortable pace. Stop if uncomfortable.']},
  {id:'grounding',title:'5–4–3–2–1 grounding',minutes:6,difficulty:'Easy',category:'calm',
    situations:['stress','overthinking','overwhelmed','general'],
    purpose:'a sensory break when your thoughts feel busy',
    steps:['Notice five things you can see.','Notice four things you can physically feel.','Notice three sounds, two scents and one taste or breath.']},
  {id:'winddown',title:'Screen-free sleep routine',minutes:15,difficulty:'Easy',category:'sleep',
    situations:['sleep'],
    purpose:'creating a calmer pre-bed routine',
    steps:['Set your phone aside and dim the lights.','Get comfortable and avoid starting a demanding task.','Choose one quiet activity such as gentle reading or stretching.']},
  {id:'sleepplan',title:'Plan tomorrow’s sleep window',minutes:7,difficulty:'Easy',category:'sleep',
    situations:['sleep','overwhelmed'],
    purpose:'making a consistent schedule easier to follow',
    steps:['Write down tomorrow’s wake-up time.','Choose a realistic bedtime with enough opportunity to rest.','Make one small adjustment to your evening routine.']},
  {id:'walk',title:'Short mindful walk',minutes:10,difficulty:'Easy',category:'energy',
    situations:['low_motivation','stress','general'],
    purpose:'adding accessible light movement',
    steps:['Choose a safe, comfortable walking route.','Walk at a pace that works for you.','Notice your surroundings, then reflect on how you feel.']},
  {id:'stretch',title:'Gentle body stretch',minutes:8,difficulty:'Easy',category:'energy',
    situations:['low_motivation','overwhelmed','general'],
    purpose:'taking a movement break',
    steps:['Roll your shoulders slowly.','Stretch your arms and upper back without pushing through pain.','Finish with a slow breath while seated or standing.']},
  {id:'journal',title:'Three-line reflection',minutes:10,difficulty:'Easy',category:'balance',
    situations:['overthinking','conflict','general'],
    purpose:'naming what matters today',
    steps:['Write one sentence about how today felt.','Write one situation that influenced your feelings.','Write one small thing you might try tomorrow.']},
  {id:'gratitude',title:'Notice three small positives',minutes:5,difficulty:'Easy',category:'balance',
    situations:['low_motivation','general'],
    purpose:'reflecting on moments worth remembering',
    steps:['Name three ordinary moments you appreciated.','Notice which one mattered most.','Write down how you could make space for another such moment.']},
  {id:'reachout',title:'Connect with someone you trust',minutes:10,difficulty:'Moderate',category:'connection',
    situations:['lonely','conflict','general'],
    purpose:'making a supportive connection',
    steps:['Think of someone safe and supportive.','Send a short message or make a call if you want.','Share something small or simply ask how they are doing.']},
  {id:'kindness',title:'One kind gesture',minutes:7,difficulty:'Easy',category:'connection',
    situations:['lonely','low_motivation'],
    purpose:'doing something thoughtful without pressure',
    steps:['Think of a person you appreciate.','Choose a simple gesture: a sincere note or small helpful act.','Notice what the experience felt like for you.']},
  {id:'focusreset',title:'Clear your mind for five minutes',minutes:5,difficulty:'Easy',category:'balance',
    situations:['overwhelmed','overthinking','general'],
    purpose:'making room for your next step',
    steps:['Write down what is on your mind.','Circle one manageable next action.','Give yourself permission to set aside the rest for now.']}
,
  {id:'taskreset',title:'Unclutter the next 10 minutes',minutes:5,difficulty:'Easy',category:'balance',
    situations:['overwhelmed','low_motivation'],purpose:'turning a crowded to-do list into one manageable action',
    steps:['Write down everything competing for your attention.','Circle just one item that genuinely needs attention today.','Choose the smallest first action and do only that for two minutes. You can stop there.']},
  {id:'thoughtparking',title:'Park a looping thought',minutes:5,difficulty:'Easy',category:'calm',
    situations:['overthinking','stress'],purpose:'separating a worry from the next action you can take',
    steps:['Write the thought in one plain sentence.','Separate what you know from what you are predicting.','If an action is possible, write one small next step. If not, choose when to revisit it and return to the present.']},
  {id:'moneytriage',title:'Make a money-worry action list',minutes:7,difficulty:'Easy',category:'balance',
    situations:['money','overwhelmed'],purpose:'making a stressful money task more concrete without judging yourself',
    steps:['Name the specific bill, deadline or question worrying you. Never write account numbers, passwords or card details here.','Write only the known amount, due date and what information is still missing.','Choose one safe next step: check an official statement, contact the provider about options, or ask a trusted qualified adviser. Do not make a rushed financial decision.']},
  {id:'conflictreset',title:'Pause after a difficult conversation',minutes:4,difficulty:'Easy',category:'calm',
    situations:['conflict','stress'],purpose:'creating space before responding while emotions are high',
    steps:['Take a short pause somewhere you feel safe; you do not need to resolve this immediately.','Write what was actually said separately from what you fear it meant.','Choose what you need next: time, clarification, a boundary or support. Respond only when it feels safe and useful.']},
  {id:'connectionmessage',title:'Send a low-pressure check-in',minutes:3,difficulty:'Easy',category:'connection',
    situations:['lonely'],purpose:'making a small connection without needing a big conversation',
    steps:['Think of one person who usually feels safe and respectful.','Send a simple message such as “Hey, I’ve had a long day. Are you free to chat sometime?”','You do not have to explain everything or receive an immediate reply. Consider another safe contact if this person is unavailable.']},
  {id:'microstart',title:'Start with two minutes',minutes:2,difficulty:'Easy',category:'energy',
    situations:['low_motivation','overwhelmed'],purpose:'reducing the effort needed to begin a task',
    steps:['Choose one task, not the whole project.','Make the first action tiny: open the document, put one item away or write one sentence.','Try it for two minutes. You can continue, take a break or stop without calling it a failure.']},
  {id:'worryparking',title:'Set worries aside for bedtime',minutes:7,difficulty:'Easy',category:'sleep',
    situations:['sleep','overthinking'],purpose:'giving tomorrow’s worries a place to wait',
    steps:['Write down the thoughts you keep returning to.','Mark each one as “action tomorrow”, “ask someone” or “not in my control tonight”.','Choose one realistic time to revisit the actionable items. Return to a quiet wind-down activity; this does not need to solve every worry.']},
  {id:'sensoryreset',title:'Ground yourself where you are',minutes:2,difficulty:'Easy',category:'calm',
    situations:['stress','overthinking','overwhelmed'],purpose:'shifting attention to the immediate surroundings',
    steps:['If comfortable, feel both feet supported by the floor or notice the chair supporting you.','Name three things you can see and two sounds you can hear.','Let your next exhale be unforced and comfortable. Stop if focusing on breathing makes you feel worse; simply notice the room instead.']},
  {id:'selfkindness',title:'A kinder reset after a hard day',minutes:3,difficulty:'Easy',category:'balance',
    situations:['low_motivation','conflict','general'],purpose:'reducing self-criticism enough to choose the next helpful step',
    steps:['Name the feeling without judging it: “I feel disappointed / tired / hurt.”','Ask what you would say to a friend in the same situation.','Choose one small supportive action for yourself, such as rest, food, asking for help or postponing a non-urgent task.']},
  {id:'workreset',title:'Reset between work or study blocks',minutes:5,difficulty:'Easy',category:'energy',
    situations:['overwhelmed','low_motivation'],purpose:'creating a small transition between demanding tasks',
    steps:['Pause the current task and relax your shoulders, seated or standing.','If practical, drink some water or look away from the screen for a moment.','Write the very next task in one sentence, then decide whether to start now or take a short break.']},
  {id:'tomorrowplan',title:'Make tomorrow morning easier',minutes:5,difficulty:'Easy',category:'sleep',
    situations:['sleep','overwhelmed'],purpose:'reducing one avoidable decision for tomorrow',
    steps:['Choose a realistic wake-up time based on your responsibilities and rest needs.','Prepare one small thing for the morning, such as clothes, a bag or a short task list.','Keep the plan flexible; if sleep has been persistently difficult, consider talking with a qualified health professional.']} 
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
function ageInDays(day:string,now:Date):number {
  const recorded=new Date(day+'T12:00:00');
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  if(!Number.isFinite(recorded.getTime()))return Number.POSITIVE_INFINITY;
  return Math.floor((today.getTime()-recorded.getTime())/86400000);
}
const SITUATION_NAMES:Record<Situation,string> = {
  general:'your day',overthinking:'looping thoughts',overwhelmed:'feeling overloaded',
  low_motivation:'getting started',lonely:'feeling disconnected',sleep:'wind-down and rest',
  stress:'stress',conflict:'a difficult conversation',money:'money worries'
};
export function recommendationPlan(
  entries:Entry[],sessions:Session[],prefs:Preferences,
  situation:Situation='general',showAll=false,now=new Date()
):Detail[] {
  const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
  const recent=!!latest&&ageInDays(latest.day,now)>=0&&ageInDays(latest.day,now)<=7;
  const ratings=new Map<string,{count:number;good:number;moodCount:number;moodShift:number}>();
  for(const session of sessions){
    const old=ratings.get(session.activity_id)||{count:0,good:0,moodCount:0,moodShift:0};
    if(session.helpful===0||session.helpful===1){old.count+=1;old.good+=session.helpful;}
    if(session.mood_before!==null&&session.mood_after!==null){
      old.moodCount+=1;old.moodShift+=session.mood_after-session.mood_before;
    }
    ratings.set(session.activity_id,old);
  }
  const ranked=CATALOG.map(item=>{
    const r=ratings.get(item.id)||{count:0,good:0,moodCount:0,moodShift:0};
    const situations=item.situations||['general'];
    let score=1;
    const reasons:string[]=[];
    if(situation!=='general'&&situations.includes(situation)){
      score+=7;reasons.push('Chosen for '+SITUATION_NAMES[situation]+'.');
    }else if(situation!=='general'){
      score-=3;
    }else if(situations.includes('general')){
      score+=1;
    }
    if(item.category===prefs.focus){score+=3;reasons.push('Fits your selected focus: '+prefs.focus+'.');}
    if(recent&&latest){
      if(item.category==='calm'&&latest.stress_recorded===1&&latest.stress>=4){score+=4;reasons.push('Your latest check-in recorded high stress ('+latest.stress+'/5).');}
      if(item.category==='sleep'&&latest.sleep_recorded===1&&latest.sleep_hours<7){score+=3;reasons.push('Your latest check-in recorded '+latest.sleep_hours+' hours of sleep.');}
      if(item.category==='energy'&&latest.exercise_recorded===1&&latest.exercise_min<20){score+=1;reasons.push('A short movement or transition break may fit your recent routine.');}
      if(item.category==='balance'&&latest.mood<=2){score+=2;reasons.push('A low-pressure option after a difficult-feeling day.');}
      if(item.category==='connection'&&latest.context_tags.split(',').includes('Social')){score+=1;reasons.push('Offers a small connection step.');}
    }
    if(item.minutes>prefs.max_minutes){score-=5;reasons.push('Longer than your selected '+prefs.max_minutes+' minute window.');}
    if(r.count>0){
      const helpfulness=(r.good+1)/(r.count+2);
      score+=(helpfulness-.5)*5;
      reasons.push(r.good+' of '+r.count+' rated attempts were helpful to you.');
      if(r.count>=2&&r.good/r.count<.25)score-=3;
      if(r.count>=2&&r.good/r.count>=.75)score+=1;
    }
    const avgShift=r.moodCount?r.moodShift/r.moodCount:null;
    if(avgShift!==null&&r.moodCount>=2){
      score+=Math.max(-1.5,Math.min(1.5,avgShift))*1.25;
      reasons.push('Across '+r.moodCount+' before/after mood pairs, the average recorded change was '+(avgShift>0?'+':'')+avgShift.toFixed(1)+' points.');
    }
    if(!reasons.length)reasons.push('A low-pressure option for '+item.purpose+'.');
    const personalEvidence=(r.count||r.moodCount)?'Your own activity ratings and recorded before/after mood pairs can influence this ranking.':'No personal feedback history for this activity yet.';
    return {...item,situations,reason:reasons.join(' '),
      evidence:personalEvidence+' Before/after changes are descriptive and do not prove the activity caused a mood change. Suggestions are options, not guaranteed treatment.',
      score,helpful:r.good,trials:r.count,moodSamples:r.moodCount,averageMoodShift:avgShift};
  }).sort((a,b)=>b.score-a.score||a.minutes-b.minutes||a.id.localeCompare(b.id));
  return showAll?ranked:ranked.slice(0,3);
}

export type NextStep = {title:string;body:string;situation:Situation;buttonLabel:string};
export function suggestedNextStep(entries:Entry[],sessions:Session[],now=new Date()):NextStep {
  const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
  if(!latest)return {
    title:'Start with one small step',
    body:'You do not need a check-in to begin. Choose a short guided action now, then record how you feel whenever you are ready.',
    situation:'general',buttonLabel:'Explore small actions'
  };
  const age=ageInDays(latest.day,now);
  if(age>7||age<0)return {
    title:'Restart without catching up',
    body:'It has been a while since your last check-in. You do not need to fill in missed days or keep a streak. Start from how you feel now.',
    situation:'general',buttonLabel:'Choose a fresh start'
  };
  if(latest.stress_recorded===1&&latest.stress>=4)return {
    title:'Make the next few minutes easier',
    body:'Your latest check-in recorded high stress. You could try a short grounding reset, park one looping thought or contact someone you trust. Pick what feels comfortable; you can stop at any time.',
    situation:'stress',buttonLabel:'Find a stress reset'
  };
  if(latest.sleep_recorded===1&&latest.sleep_hours<6.5)return {
    title:'Protect one small part of your rest',
    body:'Your latest check-in recorded a short night of sleep. Rather than trying to fix everything, prepare one small thing for tomorrow or choose a gentle wind-down.',
    situation:'sleep',buttonLabel:'Build a wind-down'
  };
  if(latest.mood<=2)return {
    title:'Choose a gentle next step',
    body:'Your latest check-in recorded a low mood. You do not have to force positivity. A tiny task, kind reset or safe connection may be a place to start.',
    situation:'low_motivation',buttonLabel:'Find a gentle action'
  };
  const tags=latest.context_tags.split(',');
  if(latest.mood<=3&&(tags.includes('Work')||tags.includes('Study')))return {
    title:'Make the workload smaller',
    body:'You tagged work or study in your latest check-in. Try turning the next task into one action that takes two minutes, instead of tackling everything at once.',
    situation:'overwhelmed',buttonLabel:'Break down one task'
  };
  const helpful=sessions.filter(s=>s.helpful===1&&ageInDays(s.day,now)>=0&&ageInDays(s.day,now)<=30)
    .sort((a,b)=>b.created_at-a.created_at)[0];
  if(helpful){
    const mapped:Record<string,Situation>={breathing:'stress',grounding:'overthinking',winddown:'sleep',
      sleepplan:'sleep',walk:'low_motivation',stretch:'low_motivation',journal:'overthinking',
      gratitude:'low_motivation',reachout:'lonely',kindness:'lonely',focusreset:'overwhelmed',
      taskreset:'overwhelmed',thoughtparking:'overthinking',moneytriage:'money',conflictreset:'conflict',
      connectionmessage:'lonely',microstart:'low_motivation',worryparking:'sleep',sensoryreset:'stress',
      selfkindness:'low_motivation',workreset:'overwhelmed',tomorrowplan:'sleep'};
    return {
      title:'Repeat a strategy you chose as helpful',
      body:'You marked a previous activity as helpful. If it still feels right today, you can repeat it or choose something different.',
      situation:mapped[helpful.activity_id]||'general',buttonLabel:'Return to a helpful option'
    };
  }
  return {
    title:'Choose one small action, not a perfect day',
    body:'Your check-in does not need to lead to a big change. Pick a short action that suits your time and energy, then decide for yourself whether it helped.',
    situation:'general',buttonLabel:'Explore small actions'
  };
}
export function weeklyGoalProgress(entries:Entry[],sessions:Session[],prefs:Preferences,now=new Date()) {
  const progress=review(entries,sessions,now);
  return {
    checkins:{done:progress.entries,target:prefs.weekly_checkins,ratio:Math.min(1,progress.entries/prefs.weekly_checkins)},
    activities:{done:progress.activities,target:prefs.weekly_activities,ratio:Math.min(1,progress.activities/prefs.weekly_activities)}
  };
}
