import React,{useMemo,useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import type {Entry,MoodScore} from '../types';
import {CONTEXT_TAGS,filterJournal} from '../deep';
import {MAX_CONTEXT_TAGS,normalizeContextTag,isValidContextTag} from '../context';
import {readableDay} from '../insights';
import {Choose,Heading,Panel,st,colors} from './Shared';

export function AdditionalCheckin({energy,onEnergy,quality,onQuality,tags,onTags}:{
 energy:MoodScore|null;onEnergy:(x:MoodScore|null)=>void;quality:MoodScore|null;onQuality:(x:MoodScore|null)=>void;
 tags:string[];onTags:(x:string[])=>void
}){
 const [custom,setCustom]=useState('');
 const addCustom=()=>{
  const value=normalizeContextTag(custom);
  if(!isValidContextTag(value)||tags.length>=MAX_CONTEXT_TAGS)return;
  if(!tags.some(x=>x.toLocaleLowerCase()===value.toLocaleLowerCase()))onTags([...tags,value]);
  setCustom('');
 };
 const customTags=tags.filter(x=>!CONTEXT_TAGS.some(p=>p===x));
 return <View style={{gap:9,marginBottom:16}}>
 <Text style={st.label}>ENERGY · OPTIONAL{energy===null?' · NOT LOGGED':' · '+energy+'/5'}</Text>
 <View style={st.row}><Choose text="Skip" selected={energy===null} onPress={()=>onEnergy(null)}/>
 {([1,2,3,4,5] as MoodScore[]).map(x=>
 <Choose key={x} text={String(x)} selected={x===energy} onPress={()=>onEnergy(x)}/>)}</View>
 <Text style={st.label}>SLEEP QUALITY · OPTIONAL{quality===null?' · NOT LOGGED':' · '+quality+'/5'}</Text>
 <View style={st.row}><Choose text="Skip" selected={quality===null} onPress={()=>onQuality(null)}/>
 {([1,2,3,4,5] as MoodScore[]).map(x=>
 <Choose key={x} text={String(x)} selected={x===quality} onPress={()=>onQuality(x)}/>)}</View>
 <Text style={st.label}>CONTEXTS THAT FIT TODAY · OPTIONAL</Text>
 <View style={st.row}>{CONTEXT_TAGS.map(x=><Choose key={x} text={x}
 selected={tags.includes(x)} onPress={()=>onTags(tags.includes(x)?tags.filter(t=>t!==x):(tags.length<MAX_CONTEXT_TAGS?[...tags,x]:tags))}/>)}</View>
 {customTags.length?<View style={{gap:7}}>
  <Text style={st.sub}>Your custom contexts</Text>
  <View style={st.row}>{customTags.map(x=><Choose key={x} text={'× '+x} selected={true} onPress={()=>onTags(tags.filter(t=>t!==x))}/>)}</View>
 </View>:null}
 <View style={{flexDirection:'row',gap:8,alignItems:'center'}}>
  <TextInput accessibilityLabel="Custom context label" value={custom} onChangeText={setCustom}
   onSubmitEditing={addCustom} returnKeyType="done" maxLength={24} placeholder="Add your own context"
   placeholderTextColor={colors.sub} style={{flex:1,minHeight:48,backgroundColor:colors.bg,borderWidth:1,borderColor:colors.line,borderRadius:12,paddingHorizontal:12,color:colors.ink}}/>
  <Pressable accessibilityRole="button" accessibilityLabel="Add custom context" disabled={!isValidContextTag(custom)||tags.length>=MAX_CONTEXT_TAGS}
   onPress={addCustom} style={{minHeight:48,minWidth:54,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:isValidContextTag(custom)&&tags.length<MAX_CONTEXT_TAGS?colors.main:colors.line}}>
   <Text style={{fontWeight:'900',color:colors.white}}>Add</Text>
  </Pressable>
 </View>
 <Text style={st.sub}>{tags.length}/{MAX_CONTEXT_TAGS} selected. Context labels stay on-device and improve comparisons once there are enough recorded days.</Text>
 </View>;
}
export function JournalSearch({entries,onEdit,onDelete}:{
 entries:Entry[];onEdit:(e:Entry)=>void;onDelete:(e:Entry)=>void
}){
 const [query,setQuery]=useState('');
 const [range,setRange]=useState<'30'|'all'>('30');
 const [moodFilter,setMoodFilter]=useState<'all'|'low'|'mid'|'high'>('all');
 const [tagFilter,setTagFilter]=useState('all');
 const [notesOnly,setNotesOnly]=useState(false);
 const [sort,setSort]=useState<'newest'|'oldest'|'moodHigh'|'moodLow'>('newest');
 const availableTags=useMemo(()=>[...new Set([...CONTEXT_TAGS,...entries.flatMap(e=>(e.context_tags||'').split(',').filter(Boolean))])].sort((a,b)=>a.localeCompare(b)),[entries]);
 const visible=useMemo(()=>{
   const rows=filterJournal(entries,query,range).filter(e=>{
    const moodOk=moodFilter==='all'||(moodFilter==='low'&&e.mood<=2)||(moodFilter==='mid'&&e.mood===3)||(moodFilter==='high'&&e.mood>=4);
    const tagOk=tagFilter==='all'||(e.context_tags||'').split(',').includes(tagFilter);
    return moodOk&&tagOk&&(!notesOnly||e.note.trim().length>0);
   });
   return [...rows].sort((a,b)=>sort==='oldest'?a.day.localeCompare(b.day):sort==='moodHigh'?b.mood-a.mood||b.day.localeCompare(a.day):sort==='moodLow'?a.mood-b.mood||b.day.localeCompare(a.day):b.day.localeCompare(a.day));
  },[query,range,moodFilter,tagFilter,notesOnly,sort,entries]);
 const average=visible.length?visible.reduce((sum,e)=>sum+e.mood,0)/visible.length:null;
 const activeFilters=(query?1:0)+(range==='30'?0:1)+(moodFilter==='all'?0:1)+(tagFilter==='all'?0:1)+(notesOnly?1:0)+(sort==='newest'?0:1);
 const clear=()=>{setQuery('');setRange('30');setMoodFilter('all');setTagFilter('all');setNotesOnly(false);setSort('newest');};
 return <View style={{gap:13}}>
 <Panel>
 <Text style={st.label}>SEARCH ENCRYPTED JOURNAL</Text>
 <TextInput accessibilityLabel="Search journal" placeholder="Date, note, context…" placeholderTextColor={colors.sub}
 value={query} onChangeText={setQuery}
 style={{backgroundColor:colors.bg,borderRadius:12,padding:12,color:colors.ink,fontSize:14}}/>
 <View style={st.row}><Choose text="Last 30 days" selected={range==='30'} onPress={()=>setRange('30')}/>
 <Choose text="All history" selected={range==='all'} onPress={()=>setRange('all')}/></View>
 <Text style={st.label}>MOOD FILTER</Text>
 <View style={st.row}>
  <Choose text="All moods" selected={moodFilter==='all'} onPress={()=>setMoodFilter('all')}/>
  <Choose text="Low · 1–2" selected={moodFilter==='low'} onPress={()=>setMoodFilter('low')}/>
  <Choose text="Okay · 3" selected={moodFilter==='mid'} onPress={()=>setMoodFilter('mid')}/>
  <Choose text="Good · 4–5" selected={moodFilter==='high'} onPress={()=>setMoodFilter('high')}/>
 </View>
 <Text style={st.label}>CONTEXT FILTER</Text>
 <View style={st.row}><Choose text="All contexts" selected={tagFilter==='all'} onPress={()=>setTagFilter('all')}/>
  {availableTags.map(x=><Choose key={x} text={x} selected={tagFilter===x} onPress={()=>setTagFilter(x)}/>)}
 </View>
 <Text style={st.label}>SORT RESULTS</Text>
 <View style={st.row}>
  <Choose text="Newest" selected={sort==='newest'} onPress={()=>setSort('newest')}/>
  <Choose text="Oldest" selected={sort==='oldest'} onPress={()=>setSort('oldest')}/>
  <Choose text="Mood high → low" selected={sort==='moodHigh'} onPress={()=>setSort('moodHigh')}/>
  <Choose text="Mood low → high" selected={sort==='moodLow'} onPress={()=>setSort('moodLow')}/>
 </View>
 <View style={[st.row,{alignItems:'center'}]}><Choose text="Notes only" selected={notesOnly} onPress={()=>setNotesOnly(v=>!v)}/>
  {activeFilters?<Pressable accessibilityRole="button" onPress={clear} style={{minHeight:44,paddingHorizontal:12,justifyContent:'center'}}><Text style={{color:colors.main,fontWeight:'900'}}>Clear filters ({activeFilters})</Text></Pressable>:null}
 </View>
 <Text style={st.sub}>All filters, sorting and search run only on your phone.</Text>
 </Panel>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
  <View style={{flex:1,minWidth:100,backgroundColor:colors.soft,borderRadius:15,padding:13}}><Text style={st.label}>MATCHES</Text><Text style={st.h}>{visible.length}</Text></View>
  <View style={{flex:1,minWidth:100,backgroundColor:colors.soft,borderRadius:15,padding:13}}><Text style={st.label}>AVG MOOD</Text><Text style={st.h}>{average===null?'—':average.toFixed(1)+'/5'}</Text></View>
  <View style={{flex:1,minWidth:100,backgroundColor:colors.soft,borderRadius:15,padding:13}}><Text style={st.label}>WITH NOTES</Text><Text style={st.h}>{visible.filter(e=>e.note.trim()).length}</Text></View>
 </View>
 {visible.length===0?<Panel tint={colors.warm}><Text style={st.title}>No entries match</Text>
 <Text style={st.sub}>Try a different search or choose all history.</Text></Panel>:
 visible.map(e=><Panel key={e.id}>
 <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={st.title}>{readableDay(e.day)}</Text>
 <Text style={[st.h,{color:colors.main}]}>{e.mood}/5</Text></View>
 <Text style={st.sub}>{e.sleep_recorded===1?e.sleep_hours+'h sleep':'sleep not logged'} · {e.exercise_recorded===1?e.exercise_min+'m movement':'movement not logged'} · {e.stress_recorded===1?'stress '+e.stress+'/5':'stress not logged'} · {e.energy_recorded===1?'energy '+e.energy+'/5':'energy not logged'} · {e.sleep_quality_recorded===1?'sleep quality '+e.sleep_quality+'/5':'sleep quality not logged'}</Text>
 {e.context_tags?<Text style={st.sub}>Contexts: {e.context_tags.split(',').join(' · ')}</Text>:null}
 {e.note?<Text style={st.body}>{e.note}</Text>:null}
 <View style={[st.row,{marginTop:8}]}>
 <Pressable accessibilityRole="button" accessibilityLabel={'Edit journal entry '+e.day} onPress={()=>onEdit(e)} style={{minHeight:44,paddingHorizontal:10,justifyContent:'center'}}><Text style={{color:colors.main,fontWeight:'900'}}>Edit</Text></Pressable>
 <Pressable accessibilityRole="button" accessibilityLabel={'Delete journal entry '+e.day} onPress={()=>onDelete(e)} style={{minHeight:44,paddingHorizontal:10,justifyContent:'center'}}><Text style={{color:'#B45A54',fontWeight:'900'}}>Delete</Text></Pressable>
 </View></Panel>)}
 </View>;
}
