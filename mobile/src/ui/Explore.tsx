import React from 'react';
import {AustralianEvidence} from './AustralianEvidence';
import {Alert,Text,View} from 'react-native';
import type {Entry,Session} from '../types';
import type {Preferences} from '../deep';
import {contextInsights,review,weekdayInsights,weeklyGoalProgress} from '../deep';
import {localDay} from '../insights';
import {Panel,Heading,Choose,Meter,st,colors} from './Shared';
import {PatternDepth,ProgressDepth} from './AdvancedInsights';

export function InsightExplorer({entries,sessions}: {entries:Entry[];sessions:Session[]}) {
 const data=review(entries,sessions);
 const days=weekdayInsights(entries);
 const contexts=contextInsights(entries);
 const peak=Math.max(1,...data.distribution);
 return <View style={{gap:13}}>
 <Heading>More ways to understand your mood</Heading>
 <Panel tint={colors.soft}>
  <Text style={st.label}>LAST 7 DAYS · VERIFIED HISTORY ONLY</Text>
  <Text style={st.h}>Average: {data.average===null?'Not yet available':data.average.toFixed(1)+'/5'}</Text>
  <Text style={st.body}>Difference from previous week: {data.delta===null?'Not enough data':(data.delta>0?'+':'')+data.delta.toFixed(1)+' points'}</Text>
  <Text style={st.sub}>Your logged days only. A difference does not prove the reason your mood changed.</Text>
 </Panel>
 <PatternDepth entries={entries}/>
 <Panel><Text style={st.title}>30-day mood distribution</Text>
  {data.sampleSize===0?<Text style={st.sub}>No entries yet.</Text>:
  data.distribution.map((n,i)=><View key={i} style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <Text style={[st.sub,{width:27}]}>{i+1}/5</Text>
   <View style={{flex:1,height:12,backgroundColor:colors.soft,borderRadius:20,overflow:'hidden'}}>
    <View style={{width:(100*n/peak+'%') as any,height:12,backgroundColor:colors.main,borderRadius:20}}/>
   </View><Text style={[st.sub,{width:43,textAlign:'right'}]}>{n} days</Text></View>)}
  <Text style={st.sub}>{data.sampleSize} recorded days out of the last 30. Unlogged days are not treated as low mood.</Text>
 </Panel>
 <Panel><Text style={st.title}>Day-of-week averages</Text>
 <View style={{flexDirection:'row',justifyContent:'space-around',gap:4}}>
 {days.map(d=><View key={d.day} style={{flex:1,alignItems:'center',gap:5}}>
  <Text style={st.sub}>{d.day}</Text>
  <View style={{height:80,width:20,justifyContent:'flex-end',backgroundColor:colors.soft,borderRadius:7,overflow:'hidden'}}>
   <View style={{height:((d.average||0)/5*100+'%') as any,backgroundColor:colors.main,width:'100%'}}/></View>
  <Text style={[st.sub,{fontWeight:'800'}]}>{d.average===null?'—':d.average.toFixed(1)}</Text>
  <Text style={[st.sub,{fontSize:9}]}>{d.count} logs</Text></View>)}</View>
 </Panel>
 <Heading>Contexts and emotions</Heading>
 {contexts.length?contexts.map(x=><Panel key={x.label} tint={colors.warm}>
  <Text style={st.title}>{x.label}</Text>
  <Text style={st.body}>Mood averaged {x.withAvg.toFixed(1)}/5 on {x.withCount} tagged days versus {x.otherAvg.toFixed(1)}/5 on {x.otherCount} other days.</Text>
  <Text style={st.sub}>Observed difference {(x.diff>0?'+':'')+x.diff.toFixed(1)} points. An association, not a cause.</Text>
 </Panel>):<Panel><Text style={st.body}>At least three tagged days and three comparison days are needed before a context pattern appears. Keep logging naturally.</Text></Panel>}
 <Heading>Australian research evidence</Heading>
 <AustralianEvidence/>
 </View>;
}
export function ProgressExplorer({entries,sessions,preferences,onPreferences}:{
 entries:Entry[];sessions:Session[];preferences:Preferences;onPreferences:(x:Preferences)=>Promise<void>
}){
 const data=review(entries,sessions);
 const goals=weeklyGoalProgress(entries,sessions,preferences);
 const now=new Date();
 const week=Array.from({length:7},(_,i)=>{
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6+i);
  return {day:localDay(d),name:d.toLocaleDateString(undefined,{weekday:'short'})};
 });
 const update=(value:Preferences)=>void onPreferences(value).catch(e=>Alert.alert('Could not save goal',String(e)));
 return <View style={{gap:13}}>
 <Panel tint={colors.soft}><Text style={st.label}>YOUR WEEK · YOUR OWN PACE</Text>
  <Text style={[st.h,{fontSize:25}]}>Small steps matter.</Text>
  <Text style={st.body}>Choose achievable weekly targets. Missing a day is normal, and this app does not grade your wellbeing.</Text></Panel>
 <Panel><Text style={st.title}>Weekly mood check-ins</Text>
  <Text style={st.h}>{goals.checkins.done} / {goals.checkins.target}</Text>
  <Meter value={goals.checkins.ratio}/>
  <View style={{flexDirection:'row',justifyContent:'space-between',marginTop:7}}>
  {week.map(d=><View key={d.day} style={{alignItems:'center',gap:5}}>
   <Text style={[st.sub,{fontSize:10}]}>{d.name}</Text>
   <Text style={{fontSize:17,color:data.checkinDays.includes(d.day)?colors.main:colors.sub}}>{data.checkinDays.includes(d.day)?'●':'○'}</Text>
  </View>)}</View>
  <Text style={st.label}>YOUR WEEKLY CHECK-IN TARGET</Text>
  <View style={st.row}>{[3,4,5,6,7].map(n=><Choose key={n} text={n+' days'} selected={preferences.weekly_checkins===n}
     onPress={()=>update({...preferences,weekly_checkins:n})}/>)}</View>
 </Panel>
 <Panel><Text style={st.title}>Weekly activity goal</Text>
  <Text style={st.h}>{goals.activities.done} / {goals.activities.target}</Text>
  <Meter value={goals.activities.ratio}/>
  <Text style={st.label}>YOUR WEEKLY ACTIVITY TARGET</Text>
  <View style={st.row}>{[2,3,4,5,7].map(n=><Choose key={n} text={n+' times'} selected={preferences.weekly_activities===n}
    onPress={()=>update({...preferences,weekly_activities:n})}/>)}</View>
 </Panel>
 <Panel tint={colors.warm}><Text style={st.title}>Activity feedback</Text>
  <Text style={[st.h,{fontSize:26}]}>{data.rated?Math.round(100*data.helpful/data.rated)+'%':'—'}</Text>
  <Text style={st.body}>{data.rated?data.helpful+' of '+data.rated+' rated activities felt helpful to you.':'After trying an activity, rate it as helpful or not helpful to begin your personal feedback history.'}</Text>
  <Text style={st.sub}>Personal reflection only; it is not evidence of clinical treatment effectiveness.</Text>
 </Panel>
 <ProgressDepth entries={entries} sessions={sessions}/>
 <Panel><Text style={st.title}>More of your progress</Text>
  <Text style={st.body}>{sessions.length} lifetime activities · {Math.round(data.activityMinutes)} timed minutes this week · {data.notes} days with journal notes this week.</Text>
  <Text style={st.sub}>Your reflections remain encrypted locally. No shared leaderboard.</Text>
 </Panel>
 </View>;
}
