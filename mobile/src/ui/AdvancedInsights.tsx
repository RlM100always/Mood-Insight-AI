import React,{useMemo} from 'react';
import {Text,View} from 'react-native';
import type {Entry,Session} from '../types';
import {activityOutcomeInsights,consistencyInsights,contextMoodRanking,dataCoverage,dataQualityCoach,moodCalendar,recoveryProfile,signalAssociations,weekComparison,windowSummary} from '../advanced';
import {Heading,Meter,Panel,colors,st} from './Shared';

function pct(n:number){return Math.round(n*100)+'%';}
function signed(n:number){return (n>0?'+':'')+n.toFixed(2);}
function title(id:string){return id.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());}

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
 const stability=month.volatility===null?'Not enough data':month.volatility<.65?'fairly steady':month.volatility<1.05?'variable':'highly variable';
 return <View style={{gap:13}}>
  <Heading>Deeper 30-day picture</Heading>
  <Panel tint={colors.soft}>
   <Text style={st.label}>RECENCY + COVERAGE</Text>
   <Text style={st.h}>{month.logged} of 30 days logged · {pct(month.coverage)} coverage</Text>
   <Meter value={month.coverage}/>
   <Text style={st.body}>30-day average {month.averageMood===null?'—':month.averageMood.toFixed(1)+'/5'} · {month.lowDays} low-mood days · {month.highDays} higher-mood days.</Text>
   <Text style={st.sub}>Mood variability is {stability}{month.volatility===null?'':(' (SD '+month.volatility.toFixed(2)+')')}. Missing days are not filled in.</Text>
  </Panel>
  <Panel>
   <Text style={st.title}>Short-term direction</Text>
   <Text style={st.body}>Last 7 days: {week.averageMood===null?'not enough data':week.averageMood.toFixed(1)+'/5'} across {week.logged} logged days.</Text>
   <Text style={st.body}>30-day trend: {month.trendPerWeek===null?'not enough evenly dated data':signed(month.trendPerWeek)+' mood points per week'}.</Text>
   <Text style={st.sub}>Trend is a simple line through your recorded days. It describes direction; it does not predict what happens next.</Text>
  </Panel>
  <Panel>
   <Text style={st.title}>Week vs previous week</Text>
   <Text style={st.body}>This week: {comparison.currentAverage===null?'—':comparison.currentAverage.toFixed(1)+'/5'} across {comparison.currentLogged} days · previous week: {comparison.previousAverage===null?'—':comparison.previousAverage.toFixed(1)+'/5'} across {comparison.previousLogged} days.</Text>
   <Text style={st.sub}>{comparison.delta===null?'Log in both seven-day windows to compare them.':'Difference '+signed(comparison.delta)+' points. This is descriptive only and missing days are not filled.'}</Text>
  </Panel>
  <Panel>
   <Text style={st.title}>28-day mood calendar</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
    {calendar.map(x=><View key={x.day} accessibilityLabel={x.day+(x.mood?' mood '+x.mood:' no check-in')} style={{width:'12%',minWidth:36,paddingVertical:8,borderRadius:9,alignItems:'center',backgroundColor:x.mood?colors.soft:colors.bg,borderWidth:1,borderColor:colors.line}}>
      <Text style={{fontSize:10,color:colors.sub}}>{x.day.slice(8)}</Text><Text style={{fontWeight:'900',color:colors.ink}}>{x.mood??'·'}</Text>
    </View>)}
   </View>
   <Text style={st.sub}>Each cell is a calendar day; a dot means no check-in. No interpolation.</Text>
  </Panel>
  <Panel tint={colors.warm}>
   <Text style={st.title}>{coach.label}</Text>
   {coach.coverage!==null?<Meter value={coach.coverage}/>:null}
   <Text style={st.sub}>{coach.message}</Text>
  </Panel>
  <Panel>
   <Text style={st.title}>Measurement coverage</Text>
   {[['Sleep',coverage.sleep],['Movement',coverage.movement],['Stress',coverage.stress],['Energy',coverage.energy],['Sleep quality',coverage.sleepQuality],['Journal note',coverage.journal],['Context tag',coverage.contexts]].map(([label,value])=>
    <View key={String(label)} style={{gap:5}}>
     <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={st.sub}>{String(label)}</Text><Text style={st.sub}>{pct(Number(value))}</Text></View>
     <Meter value={Number(value)}/>
    </View>)}
   <Text style={st.sub}>Coverage is calculated only across days you logged. Skipped optional fields remain missing, never guessed.</Text>
  </Panel>
  <Heading>Context snapshots</Heading>
  {contexts.length?contexts.slice(0,5).map(x=><Panel key={x.label}>
   <Text style={st.title}>{x.label}</Text>
   <Text style={st.body}>Average mood {x.averageMood.toFixed(1)}/5 across {x.samples} tagged days · {Math.round(x.highShare*100)}% higher-mood days · {Math.round(x.lowShare*100)}% low-mood days.</Text>
   <Text style={st.sub}>Difference from your overall 90-day logged average: {signed(x.differenceFromOverall)}. Tags can overlap, so this is not a causal comparison.</Text>
  </Panel>):<Panel><Text style={st.body}>Add the same context tag on at least three logged days to build a context snapshot.</Text></Panel>}
  <Heading>Low-mood recovery pattern</Heading>
  <Panel>
   <Text style={st.body}>{recovery.lowDays} low-mood days in the recent window · {recovery.nextDayPairs} had a check-in on the very next calendar day.</Text>
   <Text style={st.body}>{recovery.nextDayPairs?('Average next-day change '+signed(recovery.averageNextDayChange||0)+' · '+Math.round((recovery.recoveryRate||0)*100)+'% reached mood 3 or above.'):'More consecutive-day data is needed before a recovery pattern can be described.'}</Text>
   <Text style={st.sub}>This describes recorded day-to-day changes only. It is not a prediction of recovery or a clinical measure.</Text>
  </Panel>
  <Heading>Signals worth noticing</Heading>
  {signals.length?signals.slice(0,5).map(x=><Panel key={x.id} tint={Math.abs(x.correlation)>=.5?colors.warm:undefined}>
   <Text style={st.label}>{x.samples} RECORDED PAIRS · {x.strength.toUpperCase()} ASSOCIATION</Text>
   <Text style={st.title}>{x.label}</Text>
   <Text style={st.body}>{x.detail}</Text>
   <Text style={st.sub}>Correlation r={x.correlation.toFixed(2)}. Small samples can change quickly as you log more days.</Text>
  </Panel>):<Panel><Text style={st.body}>No signal has enough varied data yet. Seven recorded pairs and natural variation are required before a correlation appears.</Text></Panel>}
 </View>;
}

export function ProgressDepth({entries,sessions}:{entries:Entry[];sessions:Session[]}){
 const consistency=useMemo(()=>consistencyInsights(entries),[entries]);
 const outcomes=useMemo(()=>activityOutcomeInsights(sessions),[sessions]);
 return <View style={{gap:13}}>
  <Heading>Consistency, without pressure</Heading>
  <Panel>
   <Text style={st.h}>{consistency.logged30} / 30 recent days</Text>
   <Meter value={consistency.coverage30}/>
   <Text style={st.body}>Current streak: {consistency.currentStreak} days · Longest streak: {consistency.longestStreak} days · Active in {consistency.activeWeeks8} of the last {consistency.totalWeeks8} weeks.</Text>
   <Text style={st.sub}>Streaks are descriptive only. A missed day is not a setback and the app never fills gaps.</Text>
  </Panel>
  <Heading>What your activity feedback shows</Heading>
  {outcomes.length?outcomes.slice(0,5).map(x=><Panel key={x.id} tint={colors.warm}>
   <Text style={st.title}>{title(x.id)}</Text>
   <Text style={st.body}>{x.attempts} attempts · {x.rated?Math.round((x.helpfulRate||0)*100)+'% marked helpful across '+x.rated+' ratings':'no helpfulness ratings yet'}.</Text>
   <Text style={st.body}>{x.moodSamples?('Average before→after mood shift '+signed(x.averageMoodShift||0)+' across '+x.moodSamples+' rated mood pairs.'):'No before-and-after mood pairs yet.'}</Text>
   <Text style={st.sub}>Average timed duration {x.averageMinutes.toFixed(1)} minutes. Your own ratings guide ranking; they do not prove treatment effectiveness.</Text>
  </Panel>):<Panel><Text style={st.body}>Complete activities and rate them to build a personal outcome history.</Text></Panel>}
 </View>;
}
