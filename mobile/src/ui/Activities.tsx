import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Pressable,Text,View} from 'react-native';
import type {Entry,MoodScore,Session} from '../types';
import type {Detail,Focus,Preferences,Situation} from '../deep';
import {recommendationPlan,SITUATIONS} from '../deep';
import {activityOutcomeInsights} from '../advanced';
import {localDay,readableDay} from '../insights';
import {logSession,rateSession} from '../data/vault';
import {Panel,Heading,Choose,Action,colors,st} from './Shared';

export function ActivityExplorer({entries,sessions,preferences,situation,onSituationChange,onPreferences,refresh}:{
 entries:Entry[];sessions:Session[];preferences:Preferences;situation:Situation;onSituationChange:(x:Situation)=>void;
 onPreferences:(p:Preferences)=>Promise<void>;refresh:()=>Promise<void>
}){
 const [active,setActive]=useState<Detail|null>(null);
 const [remaining,setRemaining]=useState(0);
 const [running,setRunning]=useState(false);
 const [busy,setBusy]=useState(false);
 const [moodAfter,setMoodAfter]=useState<Record<string,MoodScore>>({});
 const [showAll,setShowAll]=useState(false);
 const [showFavorites,setShowFavorites]=useState(false);
 const favorites=useMemo(()=>new Set((preferences.favorite_activity_ids||'').split(',').filter(Boolean)),[preferences.favorite_activity_ids]);
 const ranked=useMemo(()=>recommendationPlan(entries,sessions,preferences,situation,showAll),[entries,sessions,preferences,situation,showAll]);
 const items=useMemo(()=>showFavorites?ranked.filter(x=>favorites.has(x.id)):ranked,[ranked,showFavorites,favorites]);
 const outcomes=useMemo(()=>activityOutcomeInsights(sessions),[sessions]);
 const pendingFeedback=useMemo(()=>sessions.find(item=>item.helpful===null)??null,[sessions]);
 const today=localDay();
 const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
 const todayEntry=entries.find(e=>e.day===today);
 useEffect(()=>{
  if(!running||!active)return;
  const t=setInterval(()=>setRemaining(n=>{
   if(n<=1){setRunning(false);return 0;}return n-1;
  }),1000);
  return ()=>clearInterval(t);
 },[running,active]);
 const patchPref=(p:Preferences)=>void onPreferences(p).catch(e=>Alert.alert('Could not save plan',String(e)));
 const toggleFavorite=(id:string)=>{
  const next=new Set(favorites);
  if(next.has(id))next.delete(id);else next.add(id);
  patchPref({...preferences,favorite_activity_ids:[...next].sort().join(',')});
 };
 const select=(item:Detail)=>{setActive(item);setRemaining(item.minutes*60);setRunning(false);};
 const finish=async()=>{
  if(!active||busy)return;
  setRunning(false);
  setBusy(true);
  try{
   const elapsed=active.minutes*60-remaining;
   await logSession(active.id,today,elapsed,todayEntry?.mood??null);
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
  {pendingFeedback?<Panel tint={colors.warm}>
   <Text style={st.label}>QUICK REFLECTION</Text>
   <Text style={st.title}>How did your recent activity feel?</Text>
   <Text style={st.sub}>{pendingFeedback.activity_id.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())} · {readableDay(pendingFeedback.day)}</Text>
   <Text style={st.label}>MOOD AFTER ACTIVITY · OPTIONAL</Text>
   <View style={st.row}>{([1,2,3,4,5] as MoodScore[]).map(v=>
    <Choose key={v} text={String(v)} selected={moodAfter[pendingFeedback.id]===v}
      onPress={()=>setMoodAfter(old=>({...old,[pendingFeedback.id]:v}))}/>)}</View>
   <View style={st.row}>
    <Choose text="👍 Helpful" selected={false} onPress={()=>void feedback(pendingFeedback,true)}/>
    <Choose text="👎 Not helpful" selected={false} onPress={()=>void feedback(pendingFeedback,false)}/>
   </View>
   <Text style={st.sub}>Your private rating gently adjusts future local ranking. It is not a clinical effectiveness score.</Text>
  </Panel>:null}
  <Panel tint={colors.soft}><Text style={st.label}>A PLAN BASED ON YOU</Text>
   <Text style={st.title}>Choose a focus</Text>
   <View style={st.row}>{(['balance','calm','sleep','energy','connection'] as Focus[]).map(f=>
    <Choose key={f} text={f[0].toUpperCase()+f.slice(1)} selected={f===preferences.focus}
       onPress={()=>patchPref({...preferences,focus:f})}/>)}</View>
   <Text style={st.label}>TIME AVAILABLE</Text>
   <View style={st.row}>{[5,10,15,20,30].map(t=>
    <Choose key={t} text={t+' min'} selected={t===preferences.max_minutes}
      onPress={()=>patchPref({...preferences,max_minutes:t})}/>)}</View>
   <Text style={st.sub}>Your latest check-in is used only for seven days. Older entries will not keep driving today's suggestions. Your activity feedback also influences ranking.</Text>
  </Panel>
  <Panel>
   <Text style={st.title}>What feels hardest right now?</Text>
   <Text style={st.sub}>Choose a situation if you want more relevant suggestions. This selection stays in the app and is not a diagnosis.</Text>
   <View style={st.row}>{SITUATIONS.map(option=>
    <Choose key={option.id} text={option.label} selected={situation===option.id}
      onPress={()=>onSituationChange(option.id)}/>)}</View>
   <Text style={st.sub}>{SITUATIONS.find(option=>option.id===situation)?.description}</Text>
  </Panel>
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
   <Heading>{showFavorites?'Saved favourites':showAll?'Activity library':'Three suggestions for right now'}</Heading>
   <View style={st.row}>
    <Choose text={'★ Favourites '+favorites.size} selected={showFavorites} onPress={()=>setShowFavorites(v=>!v)}/>
    <Choose text={showAll?'Top 3':'All activities'} selected={showAll} onPress={()=>setShowAll(v=>!v)}/>
   </View>
  </View>
  {items.length?items.map((item,i)=><Panel key={item.id}>
   <View style={{flexDirection:'row',gap:13,alignItems:'flex-start'}}>
    <Text style={{fontWeight:'900',fontSize:27,color:colors.main}}>{String(i+1).padStart(2,'0')}</Text>
    <View style={{flex:1,gap:6}}><Text style={st.title}>{item.title}</Text>
     <Text style={st.sub}>{item.minutes} min · {item.difficulty} · {item.category}</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{selected:favorites.has(item.id)}} accessibilityLabel={(favorites.has(item.id)?'Remove ':'Save ')+item.title+' favourite'}
      onPress={()=>toggleFavorite(item.id)} style={{minWidth:48,minHeight:48,borderRadius:14,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center',backgroundColor:favorites.has(item.id)?colors.warm:colors.white}}>
      <Text style={{fontSize:22,color:favorites.has(item.id)?'#9A692E':colors.sub}}>{favorites.has(item.id)?'★':'☆'}</Text>
    </Pressable>
   </View>
   <Text style={st.body}>{item.reason}</Text>
   <Text style={st.sub}>{item.evidence}</Text>
   <Action text="See guided steps →" onPress={()=>select(item)}/>
  </Panel>):<Panel tint={colors.warm}><Text style={st.title}>No favourites yet</Text><Text style={st.body}>Save activities with the star button. Favourites are encrypted with your preferences and can gently influence future local ranking.</Text></Panel>}
  <Heading>What your feedback is teaching the app</Heading>
  {outcomes.length?outcomes.slice(0,3).map(x=><Panel key={'outcome-'+x.id} tint={colors.soft}>
   <Text style={st.title}>{x.id.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}</Text>
   <Text style={st.body}>{x.attempts} attempts · {x.rated?Math.round((x.helpfulRate||0)*100)+'% marked helpful across '+x.rated+' ratings':'not rated yet'}.</Text>
   <Text style={st.sub}>{x.moodSamples?'Average recorded mood shift '+((x.averageMoodShift||0)>0?'+':'')+(x.averageMoodShift||0).toFixed(2)+' across '+x.moodSamples+' before/after pairs.':'Add an optional mood-after score to build a before/after history.'}</Text>
  </Panel>):<Panel><Text style={st.body}>Try an activity, then rate it. Your own feedback changes future rankings.</Text></Panel>}
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
