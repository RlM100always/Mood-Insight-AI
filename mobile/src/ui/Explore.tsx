import React from 'react';
import {AustralianEvidence} from './AustralianEvidence';
import {Alert,Text,View} from 'react-native';
import type {Entry,Session} from '../types';
import type {Preferences} from '../deep';
import {review,weeklyGoalProgress} from '../deep';
import {localDay} from '../insights';
import {Panel,Heading,Choose,Meter,st,colors} from './Shared';
import {PatternDepth,ProgressDepth} from './AdvancedInsights';

export function InsightExplorer({entries,sessions}: {entries:Entry[];sessions:Session[]}) {
 return <View style={{gap:14}}>
  <PatternDepth entries={entries}/>
  <Heading>Research context, kept separate</Heading>
  <Panel tint={colors.warm}>
   <Text style={st.title}>Population evidence is not your personal prediction</Text>
   <Text style={st.body}>Australian population statistics below are presented as research context only. They are not used as labels for your personal next-day model and do not change your local recommendation ranking.</Text>
  </Panel>
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
 <ProgressDepth entries={entries} sessions={sessions}/>
 <Panel><Text style={st.title}>More of your progress</Text>
  <Text style={st.body}>{sessions.length} lifetime activities · {Math.round(data.activityMinutes)} timed minutes this week · {data.notes} days with journal notes this week.</Text>
  <Text style={st.sub}>Your reflections remain encrypted locally. No shared leaderboard.</Text>
 </Panel>
 </View>;
}
