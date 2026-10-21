import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Pressable,Text,View} from 'react-native';
import type {Entry,MoodScore,Session} from '../types';
import type {Detail,Focus,Preferences} from '../deep';
import {recommendationPlan} from '../deep';
import {localDay,readableDay} from '../insights';
import {logSession,rateSession} from '../data/vault';
import {Panel,Heading,Choose,Action,colors,st} from './Shared';

export function ActivityExplorer({entries,sessions,preferences,onPreferences,refresh}:{
 entries:Entry[];sessions:Session[];preferences:Preferences;
 onPreferences:(p:Preferences)=>Promise<void>;refresh:()=>Promise<void>
}){
 const [active,setActive]=useState<Detail|null>(null);
 const [remaining,setRemaining]=useState(0);
 const [running,setRunning]=useState(false);
 const [busy,setBusy]=useState(false);
 const [moodAfter,setMoodAfter]=useState<Record<string,MoodScore>>({});
 const items=useMemo(()=>recommendationPlan(entries,sessions,preferences),[entries,sessions,preferences]);
 const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
 useEffect(()=>{
  if(!running||!active)return;
  const t=setInterval(()=>setRemaining(n=>{
   if(n<=1){setRunning(false);return 0;}return n-1;
  }),1000);
  return ()=>clearInterval(t);
 },[running,active]);
 const patchPref=(p:Preferences)=>void onPreferences(p).catch(e=>Alert.alert('Could not save plan',String(e)));
 const select=(item:Detail)=>{setActive(item);setRemaining(item.minutes*60);setRunning(false);};
 const finish=async()=>{
  if(!active||busy)return;
  setRunning(false);
  setBusy(true);
  try{
   const elapsed=active.minutes*60-remaining;
   await logSession(active.id,localDay(),elapsed,latest?.mood??null);
   await refresh();
   setActive(null);setRunning(false);
   Alert.alert('Saved locally','Activity recorded. Share feedback below when you are ready.');
  }catch(e){Alert.alert('Could not log activity',String(e));}
  finally{setBusy(false);}
 };
 const feedback=async(s:Session,helpful:boolean)=>{
  try{await rateSession(s.id,helpful,moodAfter[s.id]||null);await refresh();}
  catch(e){Alert.alert('Could not save feedback',String(e));}
 };
 if(active)return <View style={{gap:13}}>
  <Pressable onPress={()=>{setRunning(false);setActive(null);}} accessibilityRole="button">
   <Text style={{fontSize:14,color:colors.main,fontWeight:'900'}}>← Back to activities</Text>
  </Pressable>
  <Panel tint={colors.soft}><Text style={st.label}>YOUR GUIDED SESSION</Text>
   <Text style={[st.h,{fontSize:26}]}>{active.title}</Text>
   <Text style={st.sub}>{active.minutes} minutes · {active.difficulty}</Text>
   <Text style={{fontSize:54,color:colors.main,fontWeight:'900',textAlign:'center',marginVertical:18,fontVariant:['tabular-nums']}}>
    {String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}
   </Text>
   <Text style={st.sub}>Pause or leave whenever you need. The on-screen timer is not a background tracking service.</Text>
   <View style={st.row}>
    <Choose text={running?'Pause':'Start / resume'} selected={running} onPress={()=>setRunning(!running)}/>
    <Choose text="Restart" selected={false} onPress={()=>{setRunning(false);setRemaining(active.minutes*60);}}/>
   </View>
  </Panel>
  <Panel><Heading>A simple step-by-step guide</Heading>
   {active.steps.map((step,i)=><View key={i} style={{flexDirection:'row',gap:12,alignItems:'flex-start'}}>
    <Text style={{color:colors.main,fontWeight:'900',fontSize:19}}>{i+1}.</Text>
    <Text style={[st.body,{flex:1}]}>{step}</Text></View>)}
  </Panel>
  <Panel tint={colors.warm}><Text style={st.title}>Why this plan?</Text>
   <Text style={st.body}>{active.reason}</Text>
   <Text style={st.sub}>{active.evidence}</Text></Panel>
  <Action text={busy?'Saving…':'I completed or tried this'} onPress={()=>void finish()}/>
 </View>;
 return <View style={{gap:13}}>
  <Panel tint={colors.soft}><Text style={st.label}>A PLAN BASED ON YOU</Text>
   <Text style={st.title}>Choose a focus</Text>
   <View style={st.row}>{(['balance','calm','sleep','energy','connection'] as Focus[]).map(f=>
    <Choose key={f} text={f[0].toUpperCase()+f.slice(1)} selected={f===preferences.focus}
       onPress={()=>patchPref({...preferences,focus:f})}/>)}</View>
   <Text style={st.label}>TIME AVAILABLE</Text>
   <View style={st.row}>{[5,10,15,20,30].map(t=>
    <Choose key={t} text={t+' min'} selected={t===preferences.max_minutes}
      onPress={()=>patchPref({...preferences,max_minutes:t})}/>)}</View>
   <Text style={st.sub}>Your latest logs, focus and previous feedback influence suggestions. Longer activities rank lower when you have less time.</Text>
  </Panel>
  <Heading>Your three recommended activities</Heading>
  {items.map((item,i)=><Panel key={item.id}>
   <View style={{flexDirection:'row',gap:13,alignItems:'flex-start'}}>
    <Text style={{fontWeight:'900',fontSize:27,color:colors.main}}>{String(i+1).padStart(2,'0')}</Text>
    <View style={{flex:1,gap:6}}><Text style={st.title}>{item.title}</Text>
     <Text style={st.sub}>{item.minutes} min · {item.difficulty} · {item.category}</Text></View>
   </View>
   <Text style={st.body}>{item.reason}</Text>
   <Text style={st.sub}>{item.evidence}</Text>
   <Action text="See guided steps →" onPress={()=>select(item)}/>
  </Panel>)}
  <Heading>Feedback that improves your plan</Heading>
  {sessions.length===0?<Panel><Text style={st.body}>Try an activity and record how helpful it felt. Your responses can change future rankings.</Text></Panel>:
   sessions.slice(0,12).map(item=><Panel key={item.id}>
   <Text style={st.title}>{item.activity_id.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}</Text>
   <Text style={st.sub}>{readableDay(item.day)} · {Math.round((item.duration_seconds||0)/60)} minutes timed</Text>
   {item.helpful===null?<View style={{gap:9}}>
     <Text style={st.label}>MOOD AFTER ACTIVITY (OPTIONAL)</Text>
     <View style={st.row}>{([1,2,3,4,5] as MoodScore[]).map(v=>
      <Choose key={v} text={String(v)} selected={moodAfter[item.id]===v}
       onPress={()=>setMoodAfter(old=>({...old,[item.id]:v}))}/>)}</View>
     <View style={st.row}>
      <Choose text="👍 Helpful" selected={false} onPress={()=>void feedback(item,true)}/>
      <Choose text="👎 Not helpful" selected={false} onPress={()=>void feedback(item,false)}/>
     </View>
   </View>:<Text style={st.body}>{item.helpful===1?'Marked helpful':'Marked not helpful'}{item.mood_after?' · Mood afterward '+item.mood_after+'/5':''}</Text>}
  </Panel>)}
  <Text style={st.sub}>This is a wellbeing self-reflection tool, not medical advice. Personal helpfulness ratings are not proof of clinical effectiveness.</Text>
 </View>;
}
