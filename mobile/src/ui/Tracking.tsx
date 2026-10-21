import React,{useMemo,useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import type {Entry,MoodScore} from '../types';
import {CONTEXT_TAGS,filterJournal} from '../deep';
import {readableDay} from '../insights';
import {Choose,Heading,Panel,st,colors} from './Shared';

export function AdditionalCheckin({energy,onEnergy,quality,onQuality,tags,onTags}:{
 energy:MoodScore;onEnergy:(x:MoodScore)=>void;quality:MoodScore;onQuality:(x:MoodScore)=>void;
 tags:string[];onTags:(x:string[])=>void
}){
 return <View style={{gap:9,marginBottom:16}}>
 <Text style={st.label}>ENERGY · {energy}/5</Text>
 <View style={st.row}>{([1,2,3,4,5] as MoodScore[]).map(x=>
 <Choose key={x} text={String(x)} selected={x===energy} onPress={()=>onEnergy(x)}/>)}</View>
 <Text style={st.label}>SLEEP QUALITY · {quality}/5</Text>
 <View style={st.row}>{([1,2,3,4,5] as MoodScore[]).map(x=>
 <Choose key={x} text={String(x)} selected={x===quality} onPress={()=>onQuality(x)}/>)}</View>
 <Text style={st.label}>TODAY'S CONTEXTS · OPTIONAL</Text>
 <View style={st.row}>{CONTEXT_TAGS.map(x=><Choose key={x} text={x}
 selected={tags.includes(x)} onPress={()=>onTags(tags.includes(x)?tags.filter(t=>t!==x):[...tags,x])}/>)}</View>
 <Text style={st.sub}>Context labels improve comparisons once there are enough recorded days.</Text>
 </View>;
}
export function JournalSearch({entries,onEdit,onDelete}:{
 entries:Entry[];onEdit:(e:Entry)=>void;onDelete:(e:Entry)=>void
}){
 const [query,setQuery]=useState('');
 const [range,setRange]=useState<'30'|'all'>('30');
 const visible=useMemo(()=>filterJournal(entries,query,range),[query,range,entries]);
 return <View style={{gap:13}}>
 <Panel>
 <Text style={st.label}>SEARCH ENCRYPTED JOURNAL</Text>
 <TextInput accessibilityLabel="Search journal" placeholder="Date, note, context…" placeholderTextColor={colors.sub}
 value={query} onChangeText={setQuery}
 style={{backgroundColor:colors.bg,borderRadius:12,padding:12,color:colors.ink,fontSize:14}}/>
 <View style={st.row}><Choose text="Last 30 days" selected={range==='30'} onPress={()=>setRange('30')}/>
 <Choose text="All history" selected={range==='all'} onPress={()=>setRange('all')}/></View>
 <Text style={st.sub}>{visible.length} matching entries · searches run only on your phone</Text>
 </Panel>
 {visible.length===0?<Panel tint={colors.warm}><Text style={st.title}>No entries match</Text>
 <Text style={st.sub}>Try a different search or choose all history.</Text></Panel>:
 visible.map(e=><Panel key={e.id}>
 <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={st.title}>{readableDay(e.day)}</Text>
 <Text style={[st.h,{color:colors.main}]}>{e.mood}/5</Text></View>
 <Text style={st.sub}>{e.sleep_hours}h sleep · {e.exercise_min}m movement · stress {e.stress}/5 · energy {e.energy??3}/5 · rest quality {e.sleep_quality??3}/5</Text>
 {e.context_tags?<Text style={st.sub}>Contexts: {e.context_tags.split(',').join(' · ')}</Text>:null}
 {e.note?<Text style={st.body}>{e.note}</Text>:null}
 <View style={[st.row,{marginTop:8}]}>
 <Pressable accessibilityRole="button" onPress={()=>onEdit(e)} style={{padding:8}}><Text style={{color:colors.main,fontWeight:'900'}}>Edit</Text></Pressable>
 <Pressable accessibilityRole="button" onPress={()=>onDelete(e)} style={{padding:8}}><Text style={{color:'#B45A54',fontWeight:'900'}}>Delete</Text></Pressable>
 </View></Panel>)}
 </View>;
}
