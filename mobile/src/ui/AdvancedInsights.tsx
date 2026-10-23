import React,{useMemo} from 'react';
import {Text,View} from 'react-native';
import type {Entry,Session} from '../types';
import {
 activityOutcomeInsights,consistencyInsights,contextMoodRanking,dataCoverage,dataQualityCoach,
 insightReadiness,moodCalendar,moodDistribution,recoveryProfile,signalAssociations,
 weekComparison,weekdayMoodProfile,weeklySnapshots,windowSummary
} from '../advanced';
import {Heading,Meter,Panel,colors,st} from './Shared';

function pct(n:number){return Math.round(n*100)+'%';}
function signed(n:number){return (n>0?'+':'')+n.toFixed(2);}
function title(id:string){return id.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());}
function moodWord(mood:number){return ['','Very low','Low','Okay','Good','Very good'][mood]||String(mood);}
const moodColors=['#D97869','#E3A174','#E4C779','#80A995','#477A70'];

function StatTile({label,value,sub}:{label:string;value:string;sub:string}){
 return <View style={{width:'48%',minWidth:145,backgroundColor:'#fff',borderWidth:1,borderColor:colors.line,borderRadius:16,padding:14,gap:4}}>
  <Text style={st.label}>{label}</Text>
  <Text style={[st.h,{fontSize:24}]}>{value}</Text>
  <Text style={st.sub}>{sub}</Text>
 </View>;
}
function MetricBar({label,value,right,tint=colors.main}:{label:string;value:number;right:string;tint?:string}){
 return <View style={{gap:6}}>
  <View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}>
   <Text style={[st.body,{fontSize:13,fontWeight:'700'}]}>{label}</Text><Text style={st.sub}>{right}</Text>
  </View>
  <View style={[st.progress,{height:8}]}><View style={{height:8,borderRadius:8,backgroundColor:tint,width:(Math.max(0,Math.min(100,Math.round(value*100)))+'%') as any}}/></View>
 </View>;
}

export function PatternDepth({entries}:{entries:Entry[]}){
 const week=useMemo(()=>windowSummary(entries,7),[entries]);
 const month=useMemo(()=>windowSummary(entries,30),[entries]);
 const coverage=useMemo(()=>dataCoverage(entries,30),[entries]);
 const signals=useMemo(()=>signalAssociations(entries,90),[entries]);
 const comparison=useMemo(()=>weekComparison(entries),[entries]);
 const contexts=useMemo(()=>contextMoodRanking(entries,90),[entries]);
 const recovery=useMemo(()=>recoveryProfile(entries,90),[entries]);
 const calendar=useMemo(()=>moodCalendar(entries,28),[entries]);
 const coach=useMemo(()=>dataQualityCoach(entries),[entries]);
 const distribution=useMemo(()=>moodDistribution(entries,30),[entries]);
 const weeks=useMemo(()=>weeklySnapshots(entries,4),[entries]);
 const weekdays=useMemo(()=>weekdayMoodProfile(entries,90),[entries]);
 const readiness=useMemo(()=>insightReadiness(entries),[entries]);
 const stability=month.volatility===null?'Not enough data':month.volatility<.65?'Steady':month.volatility<1.05?'Variable':'Highly variable';
 const highShare=month.logged?month.highDays/month.logged:0;
 const maxWeekMood=Math.max(1,...weeks.map(x=>x.averageMood||0));
 return <View style={{gap:14}}>
  <Heading>Your personal dashboard</Heading>
  <Panel tint={colors.soft}>
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
    <View style={{flex:1}}>
     <Text style={st.label}>INSIGHT READINESS · {readiness.level.toUpperCase()}</Text>
     <Text style={[st.h,{fontSize:26}]}>{readiness.score}%</Text>
     <Text style={st.body}>{readiness.message}</Text>
    </View>
    <View style={{width:62,height:62,borderRadius:31,borderWidth:7,borderColor:readiness.score>=75?colors.main:'#8FAFA8',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'}}>
     <Text style={[st.title,{fontSize:16}]}>{readiness.score}</Text>
    </View>
   </View>
   <View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>
    <Text style={st.sub}>{readiness.recordedDays} recorded days / 90d</Text>
    <Text style={st.sub}>· {readiness.signalPairs} measurement days</Text>
    <Text style={st.sub}>· {readiness.contextDays} context-tag days</Text>
   </View>
  </Panel>

  <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   <StatTile label="30-DAY AVERAGE" value={month.averageMood===null?'—':month.averageMood.toFixed(1)+'/5'} sub={month.logged+' logged days'}/>
   <StatTile label="7-DAY AVERAGE" value={week.averageMood===null?'—':week.averageMood.toFixed(1)+'/5'} sub={week.logged+' of 7 days logged'}/>
   <StatTile label="HIGHER-MOOD DAYS" value={month.logged?pct(highShare):'—'} sub={month.highDays+' days at 4–5 / 5'}/>
   <StatTile label="VARIABILITY" value={stability} sub={month.volatility===null?'Need 2+ records':'SD '+month.volatility.toFixed(2)}/>
  </View>

  <Panel>
   <Text style={st.title}>Mood distribution · last 30 days</Text>
   <Text style={st.sub}>This shows the shape of your recorded days instead of reducing everything to one average.</Text>
   {distribution.slice().reverse().map((x,i)=><MetricBar key={x.mood} label={x.mood+'/5 · '+moodWord(x.mood)} value={x.share} right={x.count+' days · '+pct(x.share)} tint={moodColors[4-i]}/>)}
  </Panel>

  <Panel>
   <View style={{flexDirection:'row',justifyContent:'space-between',gap:10,alignItems:'flex-start'}}>
    <View style={{flex:1}}><Text style={st.title}>Rolling four-week view</Text><Text style={st.sub}>Real calendar weeks ending today; gaps remain gaps.</Text></View>
    <Text style={st.label}>4 WEEKS</Text>
   </View>
   <View style={{flexDirection:'row',gap:9,alignItems:'flex-end',height:152,paddingTop:10}}>
    {weeks.map((x,index)=>{
     const height=x.averageMood===null?8:Math.max(18,Math.round((x.averageMood/maxWeekMood)*105));
     return <View key={x.start} style={{flex:1,alignItems:'center',gap:6}}>
      <Text style={[st.sub,{fontWeight:'800'}]}>{x.averageMood===null?'—':x.averageMood.toFixed(1)}</Text>
      <View style={{height:110,width:'100%',justifyContent:'flex-end',alignItems:'center',backgroundColor:'#F2F5F3',borderRadius:12,paddingHorizontal:5,paddingBottom:5}}>
       <View style={{height,width:'100%',borderRadius:9,backgroundColor:index===weeks.length-1?colors.main:'#91B6AE'}}/>
      </View>
      <Text style={[st.sub,{fontSize:10}]}>{x.logged}/7 days</Text>
     </View>;
    })}
   </View>
  </Panel>

  <Panel>
   <Text style={st.title}>Week vs previous week</Text>
   <View style={{flexDirection:'row',gap:10}}>
    <View style={{flex:1,backgroundColor:'#F5F8F7',padding:12,borderRadius:14}}>
     <Text style={st.label}>CURRENT 7 DAYS</Text><Text style={[st.h,{fontSize:25}]}>{comparison.currentAverage===null?'—':comparison.currentAverage.toFixed(1)}</Text><Text style={st.sub}>{comparison.currentLogged} logged days</Text>
    </View>
    <View style={{flex:1,backgroundColor:'#F5F8F7',padding:12,borderRadius:14}}>
     <Text style={st.label}>PREVIOUS 7 DAYS</Text><Text style={[st.h,{fontSize:25}]}>{comparison.previousAverage===null?'—':comparison.previousAverage.toFixed(1)}</Text><Text style={st.sub}>{comparison.previousLogged} logged days</Text>
    </View>
   </View>
   <Text style={st.body}>{comparison.delta===null?'Log in both seven-day windows to compare them.':'Recorded-average difference: '+signed(comparison.delta)+' points.'}</Text>
   <Text style={st.sub}>A short-term difference can reflect many things; it is not a prediction or diagnosis.</Text>
  </Panel>

  <Panel>
   <Text style={st.title}>28-day mood calendar</Text>
   <Text style={st.sub}>A compact view of continuity, gaps and recorded mood without interpolation.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
    {calendar.map(x=><View key={x.day} accessibilityLabel={x.day+(x.mood?' mood '+x.mood:' no check-in')} style={{width:'12%',minWidth:36,paddingVertical:8,borderRadius:10,alignItems:'center',backgroundColor:x.mood?moodColors[x.mood-1]+'22':colors.bg,borderWidth:1,borderColor:x.mood?moodColors[x.mood-1]:colors.line}}>
      <Text style={{fontSize:10,color:colors.sub}}>{x.day.slice(8)}</Text><Text style={{fontSize:16,fontWeight:'900',color:x.mood?moodColors[x.mood-1]:colors.sub}}>{x.mood??'·'}</Text>
    </View>)}
   </View>
  </Panel>

  <Heading>Timing patterns</Heading>
  <Panel>
   <Text style={st.title}>Mood by weekday · up to 90 days</Text>
   {weekdays.length?weekdays.map(x=><MetricBar key={x.weekday} label={x.weekday} value={x.averageMood/5} right={x.averageMood.toFixed(1)+'/5 · '+x.samples+' days'} tint="#6D8FBE"/>):<Text style={st.body}>Weekday patterns appear after the same weekday has at least two recorded examples.</Text>}
   <Text style={st.sub}>Weekday averages are descriptive. Work schedules, holidays and missing days can change the pattern.</Text>
  </Panel>

  <Heading>Context snapshots</Heading>
  {contexts.length?<Panel>
   {contexts.slice(0,6).map(x=><View key={x.label} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.line,gap:5}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><Text style={st.title}>{x.label}</Text><Text style={st.label}>{x.samples} DAYS</Text></View>
    <Text style={st.body}>Average {x.averageMood.toFixed(1)}/5 · {Math.round(x.highShare*100)}% higher-mood · {Math.round(x.lowShare*100)}% low-mood.</Text>
    <Text style={st.sub}>Difference from your overall 90-day recorded average: {signed(x.differenceFromOverall)}.</Text>
   </View>)}
   <Text style={st.sub}>Context tags can overlap, so differences are associations rather than causes.</Text>
  </Panel>:<Panel><Text style={st.body}>Add the same context tag on at least three logged days to build a context snapshot.</Text></Panel>}

  <Heading>Signals worth noticing</Heading>
  {signals.length?<Panel>
   {signals.slice(0,5).map(x=><View key={x.id} style={{gap:6,paddingVertical:9,borderBottomWidth:1,borderBottomColor:colors.line}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><Text style={st.title}>{x.label}</Text><Text style={st.label}>{x.strength.toUpperCase()}</Text></View>
    <MetricBar label={'Association strength |r|'} value={Math.abs(x.correlation)} right={'r='+x.correlation.toFixed(2)+' · '+x.samples+' pairs'} tint={x.correlation>=0?'#5C8E82':'#C47B70'}/>
    <Text style={st.sub}>{x.detail}</Text>
   </View>)}
   <Text style={st.sub}>Only associations with at least seven real recorded pairs, variation, and |r| ≥ 0.15 are shown.</Text>
  </Panel>:<Panel><Text style={st.body}>No signal has enough varied data yet. Seven recorded pairs and natural variation are required before a correlation appears.</Text></Panel>}

  <Heading>Recovery & data quality</Heading>
  <Panel tint={colors.warm}>
   <Text style={st.title}>After a low-mood recorded day</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
    <StatTile label="LOW DAYS" value={String(recovery.lowDays)} sub="recent 90-day window"/>
    <StatTile label="NEXT-DAY PAIRS" value={String(recovery.nextDayPairs)} sub="consecutive logged days"/>
    <StatTile label="AVG NEXT-DAY CHANGE" value={recovery.averageNextDayChange===null?'—':signed(recovery.averageNextDayChange)} sub="recorded mood points"/>
    <StatTile label="REACHED 3+" value={recovery.recoveryRate===null?'—':pct(recovery.recoveryRate)} sub="of next-day pairs"/>
   </View>
   <Text style={st.sub}>This describes recorded day-to-day changes only. It does not predict recovery and is not a clinical measure.</Text>
  </Panel>

  <Panel>
   <Text style={st.title}>Measurement coverage</Text>
   {[['Sleep',coverage.sleep],['Movement',coverage.movement],['Stress',coverage.stress],['Energy',coverage.energy],['Sleep quality',coverage.sleepQuality],['Journal note',coverage.journal],['Context tag',coverage.contexts]].map(([label,value])=>
    <MetricBar key={String(label)} label={String(label)} value={Number(value)} right={pct(Number(value))}/>)}
   <Text style={st.sub}>Coverage is calculated only across logged days. Skipped optional fields remain missing, never guessed.</Text>
  </Panel>

  <Panel tint={colors.soft}>
   <Text style={st.label}>DATA QUALITY COACH</Text>
   <Text style={st.title}>{coach.label}</Text>
   {coach.coverage!==null?<Meter value={coach.coverage}/>:null}
   <Text style={st.body}>{coach.message}</Text>
  </Panel>
 </View>;
}

export function ProgressDepth({entries,sessions}:{entries:Entry[];sessions:Session[]}){
 const consistency=useMemo(()=>consistencyInsights(entries),[entries]);
 const outcomes=useMemo(()=>activityOutcomeInsights(sessions),[sessions]);
 const ranked=outcomes.slice(0,6);
 return <View style={{gap:14}}>
  <Heading>Consistency, without pressure</Heading>
  <Panel>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
    <StatTile label="RECENT COVERAGE" value={consistency.logged30+'/30'} sub={pct(consistency.coverage30)+' of recent days'}/>
    <StatTile label="CURRENT STREAK" value={consistency.currentStreak+' days'} sub="descriptive, not a grade"/>
    <StatTile label="LONGEST STREAK" value={consistency.longestStreak+' days'} sub="from your stored history"/>
    <StatTile label="ACTIVE WEEKS" value={consistency.activeWeeks8+'/'+consistency.totalWeeks8} sub="last eight weeks"/>
   </View>
   <Meter value={consistency.coverage30}/>
   <Text style={st.sub}>A missed day is not a setback and the app never fills gaps or rewards compulsive logging.</Text>
  </Panel>

  <Heading>Activity learning dashboard</Heading>
  {ranked.length?<Panel>
   {ranked.map(x=><View key={x.id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.line,gap:7}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}>
     <Text style={st.title}>{title(x.id)}</Text><Text style={st.label}>{x.attempts} ATTEMPTS</Text>
    </View>
    <MetricBar label="Marked helpful" value={x.helpfulRate||0} right={x.rated?pct(x.helpfulRate||0)+' · '+x.rated+' ratings':'No ratings'}/>
    <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
     <Text style={st.sub}>Avg timed duration {x.averageMinutes.toFixed(1)} min</Text>
     <Text style={st.sub}>· Mood pairs {x.moodSamples}</Text>
     {x.averageMoodShift!==null?<Text style={st.sub}>· Avg before→after {signed(x.averageMoodShift)}</Text>:null}
    </View>
   </View>)}
   <Text style={st.sub}>Your feedback can influence local ranking. Before/after changes are descriptive and do not prove treatment effectiveness.</Text>
  </Panel>:<Panel><Text style={st.body}>Complete activities and rate them to build a personal outcome history.</Text></Panel>}
 </View>;
}
