import type {Entry, Session} from './types';

export type WindowSummary = {
  days:number; logged:number; coverage:number; averageMood:number|null; volatility:number|null;
  trendPerWeek:number|null; lowDays:number; highDays:number;
};
export type Coverage = {
  logged:number; sleep:number; movement:number; stress:number; energy:number; sleepQuality:number; journal:number; contexts:number;
};
export type SignalAssociation = {
  id:'sleep'|'movement'|'stress'|'energy'|'sleepQuality';
  label:string; samples:number; correlation:number; strength:'small'|'moderate'|'strong'; detail:string;
};
export type Consistency = {
  currentStreak:number; longestStreak:number; logged30:number; coverage30:number; activeWeeks8:number; totalWeeks8:number;
};
export type ActivityOutcome = {
  id:string; attempts:number; rated:number; helpful:number; helpfulRate:number|null;
  moodSamples:number; averageMoodShift:number|null; averageMinutes:number;
};
export type WeekComparison = {
  currentLogged:number;previousLogged:number;currentAverage:number|null;previousAverage:number|null;delta:number|null;
};
export type ContextMood = {
  label:string;samples:number;averageMood:number;differenceFromOverall:number;highShare:number;lowShare:number;
};
export type RecoveryProfile = {
  lowDays:number;nextDayPairs:number;averageNextDayChange:number|null;recoveredToThree:number;recoveryRate:number|null;
};
export type MoodCalendarDay = {
  day:string;mood:number|null;completeness:number;
};
export type DataQualityCoach = {
  label:string;coverage:number|null;message:string;
};
export type MoodDistributionItem = {
  mood:1|2|3|4|5;count:number;share:number;
};
export type WeeklySnapshot = {
  start:string;end:string;logged:number;coverage:number;averageMood:number|null;
};
export type WeekdayMood = {
  weekday:string;samples:number;averageMood:number;
};
export type InsightReadiness = {
  score:number;level:'early'|'building'|'strong';recordedDays:number;signalPairs:number;contextDays:number;message:string;
};

const DAY=86_400_000;
const mean=(xs:number[])=>xs.reduce((s,x)=>s+x,0)/Math.max(1,xs.length);
function ordinal(day:string):number|null{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const [y,m,d]=day.split('-').map(Number),n=Date.UTC(y,m-1,d);
  return new Date(n).toISOString().slice(0,10)===day?n/DAY:null;
}
function isoDay(date:Date):string{
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function floorDay(days:number,now:Date):string{
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  d.setDate(d.getDate()-(days-1));return isoDay(d);
}
function inWindow(entries:Entry[],days:number,now:Date):Entry[]{
  const floor=floorDay(days,now),today=isoDay(now);
  return entries.filter(e=>e.day>=floor&&e.day<=today).sort((a,b)=>a.day.localeCompare(b.day));
}
function sd(xs:number[]):number|null{
  if(xs.length<2)return null;
  const avg=mean(xs),variance=xs.reduce((s,x)=>s+(x-avg)**2,0)/xs.length;
  return Math.sqrt(variance);
}
function slopePerDay(entries:Entry[]):number|null{
  if(entries.length<3)return null;
  const points=entries.map(e=>({x:ordinal(e.day),y:e.mood})).filter((p):p is {x:number;y:Entry['mood']}=>p.x!==null);
  if(points.length<3)return null;
  const x0=points[0].x,xs=points.map(p=>p.x-x0),ys=points.map(p=>p.y);
  const mx=mean(xs),my=mean(ys);
  const den=xs.reduce((s,x)=>s+(x-mx)**2,0);
  if(!den)return null;
  return xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/den;
}
function pearson(xs:number[],ys:number[]):number|null{
  if(xs.length<7||xs.length!==ys.length)return null;
  const mx=mean(xs),my=mean(ys);
  let num=0,dx=0,dy=0;
  for(let i=0;i<xs.length;i++){const a=xs[i]-mx,b=ys[i]-my;num+=a*b;dx+=a*a;dy+=b*b;}
  const den=Math.sqrt(dx*dy);
  return den?Math.max(-1,Math.min(1,num/den)):null;
}
export function windowSummary(entries:Entry[],days=30,now=new Date()):WindowSummary{
  const rows=inWindow(entries,days,now),moods=rows.map(e=>e.mood),slope=slopePerDay(rows);
  return {
    days,logged:rows.length,coverage:rows.length/days,
    averageMood:rows.length?mean(moods):null,volatility:sd(moods),
    trendPerWeek:slope===null?null:slope*7,
    lowDays:rows.filter(e=>e.mood<=2).length,highDays:rows.filter(e=>e.mood>=4).length
  };
}
export function dataCoverage(entries:Entry[],days=30,now=new Date()):Coverage{
  const rows=inWindow(entries,days,now),n=Math.max(1,rows.length);
  const ratio=(key:'sleep_recorded'|'exercise_recorded'|'stress_recorded'|'energy_recorded'|'sleep_quality_recorded')=>
    rows.filter(e=>e[key]===1).length/n;
  return {
    logged:rows.length,sleep:ratio('sleep_recorded'),movement:ratio('exercise_recorded'),stress:ratio('stress_recorded'),
    energy:ratio('energy_recorded'),sleepQuality:ratio('sleep_quality_recorded'),
    journal:rows.filter(e=>e.note.trim().length>0).length/n,contexts:rows.filter(e=>e.context_tags.trim().length>0).length/n
  };
}
export function signalAssociations(entries:Entry[],days=90,now=new Date()):SignalAssociation[]{
  const rows=inWindow(entries,days,now);
  const configs=[
    {id:'sleep' as const,label:'Sleep hours',known:(e:Entry)=>e.sleep_recorded===1,value:(e:Entry)=>e.sleep_hours},
    {id:'movement' as const,label:'Movement minutes',known:(e:Entry)=>e.exercise_recorded===1,value:(e:Entry)=>e.exercise_min},
    {id:'stress' as const,label:'Stress level',known:(e:Entry)=>e.stress_recorded===1,value:(e:Entry)=>e.stress},
    {id:'energy' as const,label:'Energy level',known:(e:Entry)=>e.energy_recorded===1,value:(e:Entry)=>e.energy},
    {id:'sleepQuality' as const,label:'Sleep quality',known:(e:Entry)=>e.sleep_quality_recorded===1,value:(e:Entry)=>e.sleep_quality}
  ];
  const out:SignalAssociation[]=[];
  for(const c of configs){
    const eligible=rows.filter(c.known),xs=eligible.map(c.value),ys=eligible.map(e=>e.mood);
    if(eligible.length<7||new Set(xs).size<3)continue;
    const r=pearson(xs,ys);if(r===null||Math.abs(r)<.15)continue;
    const abs=Math.abs(r),strength:SignalAssociation['strength']=abs>=.5?'strong':abs>=.3?'moderate':'small';
    const direction=r>0?'higher '+c.label.toLowerCase()+' appeared alongside higher mood':'higher '+c.label.toLowerCase()+' appeared alongside lower mood';
    out.push({id:c.id,label:c.label,samples:eligible.length,correlation:r,strength,
      detail:direction+'. This is a descriptive correlation from your logged days, not evidence of cause.'});
  }
  return out.sort((a,b)=>Math.abs(b.correlation)-Math.abs(a.correlation));
}
export function consistencyInsights(entries:Entry[],now=new Date()):Consistency{
  const today=ordinal(isoDay(now))!;
  const days=[...new Set(entries.map(e=>ordinal(e.day)).filter((x):x is number=>x!==null&&x<=today))].sort((a,b)=>a-b);
  let longest=0,run=0,prev:number|null=null;
  for(const d of days){run=prev!==null&&d===prev+1?run+1:1;longest=Math.max(longest,run);prev=d;}
  const set=new Set(days);
  let cursor=today;if(!set.has(cursor))cursor-=1;
  let current=0;while(set.has(cursor)){current++;cursor--;}
  const logged30=days.filter(d=>d>=today-29).length;
  const weeks=new Set<number>();
  for(const d of days.filter(x=>x>=today-55)){weeks.add(Math.floor((d-(today-55))/7));}
  return {currentStreak:current,longestStreak:longest,logged30,coverage30:logged30/30,activeWeeks8:weeks.size,totalWeeks8:8};
}
export function activityOutcomeInsights(sessions:Session[]):ActivityOutcome[]{
  const groups=new Map<string,Session[]>();
  for(const s of sessions){const old=groups.get(s.activity_id)||[];old.push(s);groups.set(s.activity_id,old);}
  const out:ActivityOutcome[]=[];
  for(const [id,items] of groups){
    const rated=items.filter(s=>s.helpful===0||s.helpful===1),helpful=rated.filter(s=>s.helpful===1).length;
    const mood=items.filter(s=>{
      const before=s.mood_before,after=s.mood_after;
      return typeof before==='number'&&Number.isInteger(before)&&before>=1&&before<=5&&
        typeof after==='number'&&Number.isInteger(after)&&after>=1&&after<=5;
    });
    const seconds=items.map(s=>s.duration_seconds||0).filter(n=>n>=0);
    out.push({id,attempts:items.length,rated:rated.length,helpful,
      helpfulRate:rated.length?helpful/rated.length:null,
      moodSamples:mood.length,averageMoodShift:mood.length?mean(mood.map(s=>(s.mood_after as number)-(s.mood_before as number))):null,
      averageMinutes:seconds.length?mean(seconds)/60:0});
  }
  return out.sort((a,b)=>(b.rated+b.moodSamples)-(a.rated+a.moodSamples)||b.attempts-a.attempts||a.id.localeCompare(b.id));
}

function dayFromOrdinal(value:number):string{
  return new Date(value*DAY).toISOString().slice(0,10);
}
export function weekComparison(entries:Entry[],now=new Date()):WeekComparison{
  const today=ordinal(isoDay(now))!;
  const currentStart=dayFromOrdinal(today-6),previousStart=dayFromOrdinal(today-13),previousEnd=dayFromOrdinal(today-7);
  const current=entries.filter(e=>e.day>=currentStart&&e.day<=isoDay(now));
  const previous=entries.filter(e=>e.day>=previousStart&&e.day<=previousEnd);
  const currentAverage=current.length?mean(current.map(e=>e.mood)):null;
  const previousAverage=previous.length?mean(previous.map(e=>e.mood)):null;
  return {currentLogged:current.length,previousLogged:previous.length,currentAverage,previousAverage,
    delta:currentAverage===null||previousAverage===null?null:currentAverage-previousAverage};
}
export function contextMoodRanking(entries:Entry[],days=90,now=new Date()):ContextMood[]{
  const rows=inWindow(entries,days,now),overall=rows.length?mean(rows.map(e=>e.mood)):0;
  const groups=new Map<string,Entry[]>();
  for(const e of rows){
    for(const raw of e.context_tags.split(',')){
      const label=raw.trim();if(!label)continue;
      const group=groups.get(label)||[];group.push(e);groups.set(label,group);
    }
  }
  const out:ContextMood[]=[];
  for(const [label,items] of groups){
    if(items.length<3)continue;
    const averageMood=mean(items.map(e=>e.mood));
    out.push({label,samples:items.length,averageMood,differenceFromOverall:averageMood-overall,
      highShare:items.filter(e=>e.mood>=4).length/items.length,lowShare:items.filter(e=>e.mood<=2).length/items.length});
  }
  return out.sort((a,b)=>Math.abs(b.differenceFromOverall)-Math.abs(a.differenceFromOverall)||b.samples-a.samples||a.label.localeCompare(b.label));
}
export function recoveryProfile(entries:Entry[],days=90,now=new Date()):RecoveryProfile{
  const rows=inWindow(entries,days,now),byDay=new Map<number,Entry>();
  for(const e of rows){const d=ordinal(e.day);if(d!==null)byDay.set(d,e);}
  let lowDays=0,pairs=0,recovered=0,totalChange=0;
  for(const e of rows){
    if(e.mood>2)continue;
    lowDays++;
    const d=ordinal(e.day);if(d===null)continue;
    const next=byDay.get(d+1);if(!next)continue;
    pairs++;totalChange+=next.mood-e.mood;if(next.mood>=3)recovered++;
  }
  return {lowDays,nextDayPairs:pairs,averageNextDayChange:pairs?totalChange/pairs:null,
    recoveredToThree:recovered,recoveryRate:pairs?recovered/pairs:null};
}
export function moodCalendar(entries:Entry[],days=28,now=new Date()):MoodCalendarDay[]{
  const today=ordinal(isoDay(now))!,map=new Map(entries.map(e=>[e.day,e]));
  const out:MoodCalendarDay[]=[];
  for(let offset=days-1;offset>=0;offset--){
    const day=dayFromOrdinal(today-offset),e=map.get(day);
    const completeness=e?[e.sleep_recorded,e.exercise_recorded,e.stress_recorded,e.energy_recorded,e.sleep_quality_recorded].filter(x=>x===1).length/5:0;
    out.push({day,mood:e?.mood??null,completeness});
  }
  return out;
}
export function dataQualityCoach(entries:Entry[],now=new Date()):DataQualityCoach{
  const coverage=dataCoverage(entries,30,now);
  if(coverage.logged<3)return {label:'Keep logging naturally',coverage:null,message:'A few more check-ins will make personal patterns more useful. Optional fields can always be skipped.'};
  const fields=[
    ['sleep',coverage.sleep],['movement',coverage.movement],['stress',coverage.stress],
    ['energy',coverage.energy],['sleep quality',coverage.sleepQuality]
  ] as [string,number][];
  fields.sort((a,b)=>a[1]-b[1]);
  const [label,value]=fields[0];
  if(value>=.8)return {label:'Strong measurement coverage',coverage:value,message:'Your recent optional measurements are well covered. Keep answering naturally rather than trying to make the data look complete.'};
  return {label:'Lowest recent coverage: '+label,coverage:value,message:'If it feels easy, recording '+label+' a little more often may strengthen descriptive patterns. Skipping is always allowed and values are never guessed.'};
}


export function moodDistribution(entries:Entry[],days=30,now=new Date()):MoodDistributionItem[]{
  const rows=inWindow(entries,days,now),n=Math.max(1,rows.length);
  return ([1,2,3,4,5] as const).map(mood=>{
    const count=rows.filter(e=>e.mood===mood).length;
    return {mood,count,share:rows.length?count/n:0};
  });
}
export function weeklySnapshots(entries:Entry[],weeks=4,now=new Date()):WeeklySnapshot[]{
  const today=ordinal(isoDay(now))!,out:WeeklySnapshot[]=[];
  for(let block=weeks-1;block>=0;block--){
    const end=today-block*7,start=end-6,startDay=dayFromOrdinal(start),endDay=dayFromOrdinal(end);
    const rows=entries.filter(e=>e.day>=startDay&&e.day<=endDay);
    out.push({start:startDay,end:endDay,logged:rows.length,coverage:rows.length/7,
      averageMood:rows.length?mean(rows.map(e=>e.mood)):null});
  }
  return out;
}
export function weekdayMoodProfile(entries:Entry[],days=90,now=new Date()):WeekdayMood[]{
  const rows=inWindow(entries,days,now),groups=new Map<number,Entry[]>();
  for(const e of rows){
    const d=ordinal(e.day);if(d===null)continue;
    const weekday=new Date(d*DAY).getUTCDay(),old=groups.get(weekday)||[];old.push(e);groups.set(weekday,old);
  }
  const names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return names.map((weekday,index)=>{
    const items=groups.get(index)||[];
    return items.length>=2?{weekday,samples:items.length,averageMood:mean(items.map(e=>e.mood))}:null;
  }).filter((x):x is WeekdayMood=>x!==null);
}
export function insightReadiness(entries:Entry[],now=new Date()):InsightReadiness{
  const rows=inWindow(entries,90,now),coverage=dataCoverage(entries,30,now);
  const signalFields=['sleep_recorded','exercise_recorded','stress_recorded','energy_recorded','sleep_quality_recorded'] as const;
  const signalPairs=rows.filter(e=>signalFields.some(key=>e[key]===1)).length;
  const contextDays=rows.filter(e=>e.context_tags.trim().length>0).length;
  const recorded=Math.min(1,rows.length/30),signals=Math.min(1,signalPairs/21),contexts=Math.min(1,contextDays/12);
  const optional=(coverage.sleep+coverage.movement+coverage.stress+coverage.energy+coverage.sleepQuality)/5;
  const score=Math.round(100*(recorded*.45+signals*.25+contexts*.15+optional*.15));
  const level:InsightReadiness['level']=score>=75?'strong':score>=40?'building':'early';
  const message=level==='strong'
    ?'You have enough recent coverage for several descriptive personal views. New data can still change them.'
    :level==='building'
      ?'Your personal picture is taking shape. Repeated contexts and optional measurements can make comparisons more stable.'
      :'The app is still learning the shape of your own records. A few more naturally logged days will unlock richer comparisons.';
  return {score,level,recordedDays:rows.length,signalPairs,contextDays,message};
}
