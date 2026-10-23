import React,{useMemo} from 'react';
import {Text,View} from 'react-native';
import type {Entry,Session} from '../types';
import {activityOutcomeInsights,consistencyInsights,dataCoverage,signalAssociations,windowSummary} from '../advanced';
import {Heading,Meter,Panel,colors,st} from './Shared';

function pct(n:number){return Math.round(n*100)+'%';}
function signed(n:number){return (n>0?'+':'')+n.toFixed(2);}
function title(id:string){return id.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());}

export function PatternDepth({entries}:{entries:Entry[]}){
 const week=useMemo(()=>windowSummary(entries,7),[entries]);
 const month=useMemo(()=>windowSummary(entries,30),[entries]);
 const coverage=useMemo(()=>dataCoverage(entries,30),[entries]);
 const signals=useMemo(()=>signalAssociations(entries,90),[entries]);
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
   <Text style={st.title}>Measurement coverage</Text>
   {[['Sleep',coverage.sleep],['Movement',coverage.movement],['Stress',coverage.stress],['Energy',coverage.energy],['Sleep quality',coverage.sleepQuality],['Journal note',coverage.journal],['Context tag',coverage.contexts]].map(([label,value])=>
    <View key={String(label)} style={{gap:5}}>
     <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={st.sub}>{String(label)}</Text><Text style={st.sub}>{pct(Number(value))}</Text></View>
     <Meter value={Number(value)}/>
    </View>)}
   <Text style={st.sub}>Coverage is calculated only across days you logged. Skipped optional fields remain missing, never guessed.</Text>
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
