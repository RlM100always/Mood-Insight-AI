import type {Entry, MoodScore} from '../types';
import {localDay} from '../insights.ts';
type Row={x:number[];y:number;day:string};
type Status='ready'|'need-history'|'need-variation'|'needs-today-checkin'|'needs-complete-checkin'|'baseline-wins';
export type PersonalMoodReport={status:Status;message:string;pairs:number;holdout:number;modelAccuracy:number|null;baselineAccuracy:number|null;modelMae:number|null;baselineMae:number|null;predictedMood:MoodScore|null;evidence:'local-real-checkins-only'};
const FEATURE_NAMES=['previous mood','sleep hours','movement minutes','stress level','day of week'];
const MIN_PAIRS=30;
function ordinal(day:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const [y,m,d]=day.split('-').map(Number),n=Date.UTC(y,m-1,d);
 if(new Date(n).toISOString().slice(0,10)!==day)return null;
 return n/86400000;
}
function weekday(day:string):number{return new Date(day+'T00:00:00.000Z').getUTCDay();}
function hasRecordedPredictors(e:Entry):boolean{
 return e.sleep_recorded===1&&e.exercise_recorded===1&&e.stress_recorded===1&&
 Number.isFinite(e.sleep_hours)&&e.sleep_hours>=0&&e.sleep_hours<=24&&
 Number.isInteger(e.exercise_min)&&e.exercise_min>=0&&e.exercise_min<=600&&
 Number.isInteger(e.stress)&&e.stress>=1&&e.stress<=5&&Number.isInteger(e.mood)&&e.mood>=1&&e.mood<=5;
}
function vector(e:Entry):number[]{return [e.mood,e.sleep_hours,e.exercise_min,e.stress,weekday(e.day)];}
function rowsFrom(entries:Entry[]):Row[]{
 const sorted=[...entries].sort((a,b)=>a.day.localeCompare(b.day)),rows:Row[]=[];
 for(let i=0;i<sorted.length-1;i++){
  const previous=sorted[i],next=sorted[i+1],a=ordinal(previous.day),b=ordinal(next.day);
  if(a===null||b===null||b-a!==1||!hasRecordedPredictors(previous)||
    !Number.isInteger(next.mood)||next.mood<1||next.mood>5)continue;
  rows.push({x:vector(previous),y:next.mood,day:next.day});
 }
 return rows;
}
type Fitted={mean:number[];scale:number[];weights:number[][];bias:number[]};
function fit(rows:Row[]):Fitted{
 const dims=FEATURE_NAMES.length,mean=new Array(dims).fill(0),scale=new Array(dims).fill(0);
 for(const row of rows)for(let j=0;j<dims;j++)mean[j]+=row.x[j]/rows.length;
 for(const row of rows)for(let j=0;j<dims;j++)scale[j]+=(row.x[j]-mean[j])**2/rows.length;
 for(let j=0;j<dims;j++)scale[j]=Math.sqrt(scale[j])||1;
 const xs=rows.map(row=>row.x.map((v,j)=>(v-mean[j])/scale[j]));
 const weights=Array.from({length:5},()=>new Array(dims).fill(0)),bias=new Array(5).fill(0);
 const epochs=500,rate=0.12,l2=0.04;
 for(let epoch=0;epoch<epochs;epoch++){
  const gw=Array.from({length:5},()=>new Array(dims).fill(0)),gb=new Array(5).fill(0);
  for(let i=0;i<rows.length;i++){
   const logits=weights.map((w,c)=>w.reduce((sum,v,j)=>sum+v*xs[i][j],bias[c]));
   const peak=Math.max(...logits),exps=logits.map(v=>Math.exp(v-peak)),total=exps.reduce((a,b)=>a+b,0)||1;
   for(let c=0;c<5;c++){
    const error=exps[c]/total-(rows[i].y===c+1?1:0);gb[c]+=error;
    for(let j=0;j<dims;j++)gw[c][j]+=error*xs[i][j];
   }
  }
  for(let c=0;c<5;c++){
   bias[c]-=rate*gb[c]/rows.length;
   for(let j=0;j<dims;j++)weights[c][j]-=rate*(gw[c][j]/rows.length+l2*weights[c][j]);
  }
 }
 return {mean,scale,weights,bias};
}
function probabilities(model:Fitted,x:number[]):number[]{
 const normalized=x.map((v,j)=>(v-model.mean[j])/model.scale[j]);
 const logits=model.weights.map((w,c)=>w.reduce((sum,v,j)=>sum+v*normalized[j],model.bias[c]));
 const peak=Math.max(...logits),exps=logits.map(v=>Math.exp(v-peak)),total=exps.reduce((a,b)=>a+b,0)||1;
 return exps.map(v=>v/total);
}
function mode(values:number[]):number{
 const counts=new Array(6).fill(0);values.forEach(v=>counts[v]++);
 let best=1;for(let i=2;i<=5;i++)if(counts[i]>counts[best])best=i;return best;
}
function blank(status:Status,message:string,pairs=0,holdout=0):PersonalMoodReport{
 return {status,message,pairs,holdout,modelAccuracy:null,baselineAccuracy:null,modelMae:null,baselineMae:null,predictedMood:null,evidence:'local-real-checkins-only'};
}
/** Exploratory per-user model: consecutive local records only; chronological holdout; never a clinical forecast. */
export function evaluatePersonalMood(entries:Entry[],today=localDay()):PersonalMoodReport{
 const rows=rowsFrom(entries);
 if(rows.length<MIN_PAIRS)return blank('need-history','Needs at least 30 consecutive day-to-day pairs with mood, sleep, movement and stress recorded on the earlier day.',rows.length);
 if(new Set(rows.map(r=>r.y)).size<3)return blank('need-variation','Recorded next-day moods do not yet vary enough to evaluate a useful model. Keep logging naturally; never change answers to train it.',rows.length);
 const holdout=Math.max(6,Math.ceil(rows.length*0.2)),split=rows.length-holdout,train=rows.slice(0,split),test=rows.slice(split);
 if(train.length<24||new Set(train.map(r=>r.y)).size<3)return blank('need-variation','There is not enough varied history before the chronological holdout.',rows.length,test.length);
 const first=fit(train),baseline=mode(train.map(r=>r.y));
 let correct=0,baselineCorrect=0,absolute=0,baselineAbsolute=0;
 for(const row of test){
  const probs=probabilities(first,row.x);let predicted=1;
  for(let i=1;i<5;i++)if(probs[i]>probs[predicted-1])predicted=i+1;
  if(predicted===row.y)correct++;if(baseline===row.y)baselineCorrect++;
  absolute+=Math.abs(predicted-row.y);baselineAbsolute+=Math.abs(baseline-row.y);
 }
 const accuracy=correct/test.length,baselineAccuracy=baselineCorrect/test.length,mae=absolute/test.length,baselineMae=baselineAbsolute/test.length;
 const common={pairs:rows.length,holdout:test.length,modelAccuracy:accuracy,baselineAccuracy,modelMae:mae,baselineMae,predictedMood:null as MoodScore|null,evidence:'local-real-checkins-only' as const};
 if(accuracy<baselineAccuracy+0.05||mae>=baselineMae)return {...blank('baseline-wins','Chronological testing did not show a clear improvement over a simple baseline. No mood estimate is shown.',rows.length,test.length),...common};
 const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
 if(!latest||latest.day!==today)return {...blank('needs-today-checkin','The personal model passed a small historical comparison, but needs today’s check-in before showing an exploratory next-day pattern.',rows.length,test.length),...common};
 if(!hasRecordedPredictors(latest))return {...blank('needs-complete-checkin','Record sleep, movement and stress today to run this experiment. Skipped fields are never guessed.',rows.length,test.length),...common};
 const finalModel=fit(rows),scores=probabilities(finalModel,vector(latest));let predicted=1;
 for(let i=1;i<5;i++)if(scores[i]>scores[predicted-1])predicted=i+1;
 return {...common,status:'ready',message:'This estimate uses your own consecutive check-ins only. It is not a diagnosis or a basis for health decisions.',predictedMood:predicted as MoodScore};
}
