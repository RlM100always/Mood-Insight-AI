import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar as NativeStatusBar,
  StyleSheet, Text, TextInput, View
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import type {Activity, Entry, MoodScore, Session} from './src/types';
import {
  hasConsent, acceptConsent, openVault, listEntries, saveEntry, removeEntry,
  listSessions, logSession, rateSession, eraseEverything
} from './src/data/vault';
import {averageMood, currentStreak, detectPatterns, localDay, readableDay, recommend} from './src/insights';

const C = {
  ink: '#19263A', muted: '#637183', bg: '#F6F7F4', white: '#FFFFFF',
  primary: '#325C57', teal: '#D8EDE5', peach: '#FBE6DA',
  lilac: '#EAE3F8', line: '#E6EAE8', grey: '#F0F3F2', red: '#AA4B45'
};
type Tab = 'Today' | 'Patterns' | 'Activities' | 'Journal' | 'Privacy';
const NAV: {label: Tab; icon: string}[] = [
  {label: 'Today',icon: '◉'}, {label: 'Patterns',icon: '▥'},
  {label: 'Activities',icon: '✦'}, {label: 'Journal',icon: '▤'},
  {label: 'Privacy',icon: '♧'}
];
const MOODS: {mood: MoodScore; emoji: string; label: string}[] = [
  {mood: 1,emoji: '😞',label:'Very low'}, {mood: 2,emoji:'😕',label:'Low'},
  {mood:3,emoji:'😐',label:'Okay'}, {mood:4,emoji:'🙂',label:'Good'},
  {mood:5,emoji:'😄',label:'Great'}
];
function Label({children}: {children: React.ReactNode}) {
  return <Text style={s.label}>{children}</Text>;
}
function Pill({children}: {children: React.ReactNode}) {
  return <View style={s.pill}><Text style={s.pillText}>{children}</Text></View>;
}
function Card({children, tint, style}: {children: React.ReactNode; tint?: string; style?: object}) {
  return <View style={[s.card,tint ? {backgroundColor:tint} : null,style]}>{children}</View>;
}
function Primary({label, action, disabled}: {label: string; action: () => void; disabled?: boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={action}
    style={[s.primary,disabled && {opacity:.55}]}>
    <Text style={s.primaryText}>{label}</Text>
  </Pressable>;
}
function Heading({kicker,title,description}: {kicker:string;title:string;description?:string}) {
  return <View style={s.heading}><Text style={s.kicker}>{kicker.toUpperCase()}</Text>
    <Text style={s.h1}>{title}</Text>
    {description ? <Text style={s.subheading}>{description}</Text> : null}
  </View>;
}
function Field({label,value,onChangeText,keyboardType='default',multiline=false,maxLength}:{
  label:string;value:string;onChangeText:(text:string)=>void;
  keyboardType?:'numeric'|'default';multiline?:boolean;maxLength?:number;
}) {
  return <View style={s.field}><Label>{label}</Label>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
      keyboardType={keyboardType} multiline={multiline} maxLength={maxLength}
      placeholderTextColor="#9AA5AB" style={[s.input,multiline && s.multiline]}
      autoCorrect={multiline} />
  </View>;
}

export default function App() {
  const [ready,setReady] = useState(false);
  const [consented,setConsented] = useState(false);
  const [error,setError] = useState('');
  const [tab,setTab] = useState<Tab>('Today');
  const [entries,setEntries] = useState<Entry[]>([]);
  const [sessions,setSessions] = useState<Session[]>([]);
  const [mood,setMood] = useState<MoodScore>(3);
  const [stress,setStress] = useState<MoodScore>(3);
  const [day,setDay] = useState(localDay());
  const [sleep,setSleep] = useState('7');
  const [exercise,setExercise] = useState('0');
  const [note,setNote] = useState('');
  const [saving,setSaving] = useState(false);
  const [privacyAccepted,setPrivacyAccepted] = useState(false);

  const refresh = async () => {
    const [m, a] = await Promise.all([listEntries(),listSessions()]);
    setEntries(m); setSessions(a);
  };
  const handleError = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
    Alert.alert('Unable to complete',message);
  };
  const boot = async () => {
    try {
      const consent = await hasConsent();
      setConsented(consent);
      if (consent) { await openVault(); await refresh(); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open encrypted database.');
    } finally {setReady(true);}
  };
  useEffect(() => {void boot();},[]);
  const proceed = async () => {
    if (!privacyAccepted) return;
    setSaving(true);
    try {
      await acceptConsent(); await openVault(); await refresh();
      setConsented(true); setError('');
    } catch (cause) {handleError(cause);}
    finally {setSaving(false);}
  };
  const save = async () => {
    setSaving(true);
    try {
      await saveEntry({
        day, mood, sleep_hours:Number(sleep), exercise_min:Number(exercise),
        stress, note:note.trim()
      });
      await refresh();
      setNote(''); setDay(localDay());
      Alert.alert('Saved on your device','Your check-in is encrypted in the local database.');
    } catch (cause) {handleError(cause);}
    finally {setSaving(false);}
  };
  const edit = (entry: Entry) => {
    setDay(entry.day);setMood(entry.mood);setStress(entry.stress);
    setSleep(String(entry.sleep_hours));setExercise(String(entry.exercise_min));
    setNote(entry.note);setTab('Today');
  };
  const confirmRemove = (entry: Entry) => Alert.alert(
    'Delete this day?', 'This permanently removes the check-in from this device.', [
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:()=>void (async()=>{
        try {await removeEntry(entry.id);await refresh();}catch(e){handleError(e);}
      })()}
    ]
  );
  const confirmErase = () => Alert.alert(
    'Delete all local data?', 'All mood logs and activity records will be permanently deleted. This cannot be undone.', [
      {text:'Cancel',style:'cancel'},
      {text:'Delete everything',style:'destructive',onPress:()=>void (async()=>{
        try {
          await eraseEverything();setEntries([]);setSessions([]);
          setConsented(false);setPrivacyAccepted(false);setTab('Today');
          setNote('');setDay(localDay());setError('');
        } catch(e) {handleError(e);}
      })()}
    ]
  );
  const activities = useMemo(()=>recommend(entries),[entries]);
  const patterns = useMemo(()=>detectPatterns(entries),[entries]);
  const recent = useMemo(()=>[...entries].sort((a,b)=>a.day.localeCompare(b.day)).slice(-7),[entries]);
  const completed = sessions.length;

  if (!ready) return <SafeAreaView style={s.center}>
    <ActivityIndicator size="large" color={C.primary}/><Text style={s.muted}>Opening your private space…</Text>
  </SafeAreaView>;

  if (!consented || error) return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark"/>
      <ScrollView contentContainerStyle={[s.content,{flexGrow:1,justifyContent:'center'}]}>
        <Text style={s.logo}>◡  mood insight</Text>
        <Card tint={C.teal}>
          <Text style={s.kicker}>PRIVATE BY DESIGN</Text>
          <Text style={s.hero}>Your space, your pace.</Text>
          <Text style={s.copy}>A calm place to notice your moods, understand patterns and choose small wellbeing activities.</Text>
        </Card>
        {error ? <Card tint="#FFE9E6"><Text style={s.error}>{error}</Text>
          <Text style={s.copy}>SQLCipher must be included in an Android/iOS native development build; Expo Go cannot open this vault.</Text>
          <Primary label="Retry secure setup" action={()=>{setError('');setReady(false);void boot();}}/>
        </Card> : null}
        <Text style={s.h2}>Your information stays on this phone.</Text>
        <Text style={s.copy}>Mood, sleep, movement, stress and journal notes are stored in a SQLCipher AES-256 encrypted SQLite database. Its random key is protected by the device keychain/keystore. No account, ad tracking, analytics or cloud mood sync is included. Data older than 365 days is removed when you next open/use the app.</Text>
        <Text style={s.copy}>Recommendations support general wellbeing only. They cannot diagnose, provide therapy or manage emergencies. In immediate danger, contact local emergency services.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:privacyAccepted}}
          onPress={()=>setPrivacyAccepted(!privacyAccepted)} style={s.consent}>
          <Text style={s.consentMark}>{privacyAccepted?'☑':'□'}</Text>
          <Text style={[s.copy,{flex:1,marginBottom:0}]}>I am 18 or older, understand the limitations, and consent to local data storage.</Text>
        </Pressable>
        <Primary label={saving?'Setting up…':'Enter my private space'} disabled={!privacyAccepted||saving||Boolean(error)} action={()=>void proceed()}/>
      </ScrollView>
    </SafeAreaView>
  );

  return <SafeAreaView style={s.root}>
    <StatusBar style="dark"/>
    <View style={s.topBar}><Text style={s.logo}>◡  mood insight</Text><Pill>● ON-DEVICE ONLY</Pill></View>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        {tab==='Today'? <>
          <Heading kicker="Daily check-in" title="How are you feeling?" description="There is no right answer. Take a moment for yourself."/>
          <Card tint={C.teal}><Text style={s.kicker}>YOUR WEEK SO FAR</Text>
            <View style={s.statRow}>
              <View><Text style={s.statNum}>{averageMood(entries)}</Text><Text style={s.statLabel}>Average mood</Text></View>
              <View><Text style={s.statNum}>{currentStreak(entries)}</Text><Text style={s.statLabel}>Day streak</Text></View>
              <View><Text style={s.statNum}>{entries.length}</Text><Text style={s.statLabel}>Check-ins</Text></View>
            </View>
          </Card>
          <Card>
            <Field label="Date (YYYY-MM-DD)" value={day} onChangeText={setDay}/>
            <Label>YOUR MOOD TODAY</Label>
            <View style={s.moodRow}>{MOODS.map(m=>
              <Pressable accessibilityRole="button" accessibilityLabel={m.label} key={m.mood}
                onPress={()=>setMood(m.mood)} style={[s.mood,mood===m.mood && s.moodSelected]}>
                <Text style={s.moodEmoji}>{m.emoji}</Text><Text style={s.moodText}>{m.label}</Text>
              </Pressable>)}</View>
            <View style={s.twoCol}>
              <View style={{flex:1}}><Field label="Sleep last night (hrs)" value={sleep} onChangeText={setSleep} keyboardType="numeric"/></View>
              <View style={{flex:1}}><Field label="Movement (min)" value={exercise} onChangeText={setExercise} keyboardType="numeric"/></View>
            </View>
            <Label>STRESS LEVEL · {stress}/5</Label>
            <View style={s.chipRow}>{([1,2,3,4,5] as MoodScore[]).map(v=>
              <Pressable key={v} accessibilityLabel={'Stress '+v} onPress={()=>setStress(v)}
                style={[s.chip,stress===v && s.chipActive]}>
                <Text style={[s.chipText,stress===v && {color:C.white}]}>{v}</Text>
              </Pressable>)}</View>
            <Field label="Your thoughts (optional)" value={note} onChangeText={setNote} multiline maxLength={2000}/>
            <Primary label={saving?'Saving…':'Save private check-in'} disabled={saving} action={()=>void save()}/>
            <Text style={s.footnote}>One entry per day. Saving the same date updates it.</Text>
          </Card>
        </>:null}

        {tab==='Patterns'?<>
          <Heading kicker="Personal insights" title="A picture of your patterns" description="Only what your own entries can support."/>
          <Card tint={C.lilac}><Text style={s.kicker}>WHAT YOU'VE SHARED</Text>
            <Text style={s.heroSmall}>{entries.length} recorded days</Text>
            <Text style={s.copy}>Patterns need at least 7 days of logs. Group comparisons also require at least 3 days in each group.</Text>
          </Card>
          <Text style={s.h2}>Mood across recent check-ins</Text>
          <Card><View style={s.chart}>{recent.length ? recent.map(e=>
            <View key={e.id} style={s.chartCol}>
              <Text style={s.chartValue}>{e.mood}</Text>
              <View style={[s.bar,{height:18+e.mood*22,backgroundColor:e.mood<=2?'#DC947E':C.primary}]}/>
              <Text style={s.chartDay}>{new Date(e.day+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})}</Text>
            </View>) : <Text style={s.copy}>Your trend will appear after your first check-in.</Text>}
          </View></Card>
          <Text style={s.h2}>Detected associations</Text>
          {patterns.length?patterns.map((p,i)=><Card key={p.id} tint={i%2===0?C.teal:C.peach}>
            <Text style={s.kicker}>{p.count} DAYS COMPARED</Text>
            <Text style={s.h3}>{p.title}</Text><Text style={s.copy}>{p.detail}</Text>
          </Card>):<Card><Text style={s.h3}>No dependable comparisons yet</Text>
            <Text style={s.copy}>Try logging for a few more days. We will never invent statistics to fill empty charts.</Text>
          </Card>}
          <Text style={s.footnote}>These are descriptive observations, not diagnoses, predictions, or evidence that one activity caused a mood change.</Text>
        </>:null}

        {tab==='Activities'?<>
          <Heading kicker="Small, useful actions" title="Something gentle for today" description="Three suggestions with a reason, time and difficulty."/>
          <Card tint={C.teal}><Text style={s.kicker}>PERSONALISED, NOT PRESCRIPTIVE</Text>
            <Text style={s.copy}>Suggestions consider your latest check-in and observed patterns when enough history exists. They do not claim proven individual benefits.</Text>
          </Card>
          {activities.map((a:Activity,i:number)=><Card key={a.id}>
            <View style={s.activityRow}><Text style={s.activityIndex}>0{i+1}</Text>
              <View style={{flex:1}}><Text style={s.h3}>{a.title}</Text>
                <Text style={s.activityMeta}>{a.minutes} min  ·  {a.difficulty}</Text>
              </View></View>
            <Text style={s.copy}>{a.reason}</Text>
            <Pressable accessibilityRole="button" style={s.outline} onPress={()=>void(async()=>{
              try {await logSession(a.id,localDay());await refresh();Alert.alert('Nice work','Activity saved privately on your phone.');}
              catch(e){handleError(e);}
            })()}><Text style={s.outlineText}>I tried this  ✓</Text></Pressable>
          </Card>)}
          <Text style={s.h2}>Your activity feedback</Text>
          <Card><Text style={s.copy}>{completed} activities recorded. Feedback can help you reflect on what feels useful.</Text>
            {sessions.slice(0,5).map(item=><View key={item.id} style={s.sessionRow}>
              <View style={{flex:1}}><Text style={s.sessionTitle}>{item.activity_id.replace(/-/g,' ')}</Text>
                <Text style={s.small}>{readableDay(item.day)}</Text></View>
              {item.helpful===null?
                <View style={s.feedbackRow}>
                  <Pressable accessibilityLabel="Helpful" onPress={()=>void(async()=>{await rateSession(item.id,true);await refresh();})()}><Text style={s.feedback}>👍</Text></Pressable>
                  <Pressable accessibilityLabel="Not helpful" onPress={()=>void(async()=>{await rateSession(item.id,false);await refresh();})()}><Text style={s.feedback}>👎</Text></Pressable>
                </View>
              : <Text style={s.small}>{item.helpful===1?'Helpful':'Not helpful'}</Text>}
            </View>)}
          </Card>
        </>:null}

        {tab==='Journal'?<>
          <Heading kicker="Your private journal" title="Every day has a story" description="Your mood history is encrypted and stored only on this device."/>
          {entries.length===0?<Card><Text style={s.h3}>Your journal is empty</Text>
            <Text style={s.copy}>Start with a check-in. It takes less than a minute.</Text>
            <Primary label="Log my mood" action={()=>setTab('Today')}/>
          </Card>:entries.map(e=><Card key={e.id}>
            <View style={s.journalHeader}>
              <View><Text style={s.h3}>{readableDay(e.day)}</Text>
                <Text style={s.activityMeta}>{MOODS.find(m=>m.mood===e.mood)?.emoji}  {MOODS.find(m=>m.mood===e.mood)?.label} · Stress {e.stress}/5</Text>
              </View>
              <Pill>{e.mood}/5</Pill>
            </View>
            <Text style={s.small}>{e.sleep_hours}h sleep  ·  {e.exercise_min}m movement</Text>
            {e.note ? <Text style={[s.copy,{marginTop:12}]}>{e.note}</Text> : null}
            <View style={s.journalActions}>
              <Pressable onPress={()=>edit(e)}><Text style={s.action}>Edit</Text></Pressable>
              <Pressable onPress={()=>confirmRemove(e)}><Text style={[s.action,{color:C.red}]}>Delete</Text></Pressable>
            </View>
          </Card>)}
        </>:null}

        {tab==='Privacy'?<>
          <Heading kicker="Data control" title="Your data. Your choice." description="A simple privacy promise you can verify."/>
          <Card tint={C.teal}><Text style={s.h3}>Encrypted on your phone</Text>
            <Text style={s.copy}>Native SQLCipher SQLite encrypts entries using AES-256. Your randomly generated database key is held by platform SecureStore. The app does not call any mood-data API or collect telemetry.</Text>
          </Card>
          <Card><Text style={s.h3}>12-month retention</Text>
            <Text style={s.copy}>Entries older than 365 days are automatically purged whenever the encrypted vault is opened or used. The app does not run a background deletion task while closed.</Text>
            <Text style={s.h3}>No medical claims</Text>
            <Text style={s.copy}>Personal patterns are descriptive only. This tool does not diagnose, treat, prescribe, or replace qualified care. For emergencies, contact local emergency services.</Text>
            <Text style={s.h3}>Delete your records</Text>
            <Text style={s.copy}>Remove everything including encrypted journal data, activity feedback and the stored encryption key.</Text>
            <Pressable style={s.danger} onPress={confirmErase}><Text style={s.dangerText}>Permanently erase all data</Text></Pressable>
          </Card>
        </>:null}
        <View style={{height:28}}/>
      </ScrollView>
    </KeyboardAvoidingView>
    <View style={s.tabBar}>{NAV.map(n=><Pressable key={n.label}
      accessibilityLabel={n.label+' tab'} accessibilityRole="tab"
      accessibilityState={{selected:tab===n.label}}
      onPress={()=>setTab(n.label)} style={s.tabButton}>
      <Text style={[s.navIcon,tab===n.label&&{color:C.primary}]}>{n.icon}</Text>
      <Text style={[s.navText,tab===n.label&&s.navActive]}>{n.label}</Text>
    </Pressable>)}</View>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg,paddingTop:Platform.OS==='android'?NativeStatusBar.currentHeight||0:0},
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg,gap:20},
  topBar:{height:65,paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    borderBottomWidth:1,borderBottomColor:C.line,backgroundColor:C.white},
  logo:{fontSize:20,fontWeight:'900',letterSpacing:-.7,color:C.primary},
  pill:{paddingHorizontal:10,paddingVertical:7,backgroundColor:'#E9F3EF',borderRadius:100},
  pillText:{color:C.primary,fontSize:9,fontWeight:'800',letterSpacing:.8},
  content:{padding:20,paddingBottom:30,gap:14},
  heading:{marginTop:5,marginBottom:4},
  kicker:{color:C.primary,fontSize:10,fontWeight:'900',letterSpacing:1.6,marginBottom:8},
  h1:{fontSize:30,lineHeight:36,fontWeight:'900',color:C.ink,letterSpacing:-1.2,marginBottom:5},
  h2:{fontSize:20,fontWeight:'800',color:C.ink,marginTop:12,marginBottom:4},
  h3:{fontSize:17,fontWeight:'800',color:C.ink,marginBottom:5},
  subheading:{fontSize:14,lineHeight:22,color:C.muted},
  card:{backgroundColor:C.white,borderRadius:23,padding:19,borderWidth:1,borderColor:'#EAEDEB',gap:8},
  hero:{fontSize:33,fontWeight:'900',color:C.ink,lineHeight:39,letterSpacing:-1.2,marginBottom:10},
  heroSmall:{fontSize:23,fontWeight:'800',color:C.ink},
  copy:{fontSize:14,lineHeight:22,color:C.muted,marginBottom:4},
  label:{fontSize:11,fontWeight:'800',letterSpacing:.7,color:C.ink,marginBottom:9},
  field:{marginBottom:14},
  input:{borderWidth:1,borderColor:C.line,backgroundColor:'#FCFDFC',paddingHorizontal:14,
    paddingVertical:11,borderRadius:13,color:C.ink,fontSize:15,minHeight:48},
  multiline:{height:92,textAlignVertical:'top'},
  moodRow:{flexDirection:'row',gap:4,marginBottom:16},
  mood:{flex:1,alignItems:'center',paddingVertical:9,paddingHorizontal:1,borderRadius:12,borderWidth:1,borderColor:'transparent'},
  moodSelected:{backgroundColor:C.teal,borderColor:C.primary},
  moodEmoji:{fontSize:26,marginBottom:5},
  moodText:{fontSize:9,color:C.muted,fontWeight:'700',textAlign:'center'},
  twoCol:{flexDirection:'row',gap:12},
  chipRow:{flexDirection:'row',gap:9,marginBottom:18},
  chip:{width:44,height:41,borderWidth:1,borderColor:C.line,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:C.grey},
  chipActive:{backgroundColor:C.primary,borderColor:C.primary},
  chipText:{fontSize:14,fontWeight:'800',color:C.ink},
  primary:{backgroundColor:C.primary,borderRadius:13,alignItems:'center',paddingVertical:16,marginTop:5},
  primaryText:{fontSize:15,fontWeight:'800',color:C.white},
  footnote:{fontSize:11,lineHeight:18,color:C.muted,textAlign:'center',marginTop:8},
  statRow:{flexDirection:'row',justifyContent:'space-between',paddingTop:10},
  statNum:{fontSize:30,fontWeight:'900',color:C.ink},
  statLabel:{fontSize:11,color:C.muted,marginTop:4},
  chart:{minHeight:180,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-around',paddingVertical:16,gap:4},
  chartCol:{flex:1,alignItems:'center',justifyContent:'flex-end',gap:8},
  chartValue:{fontSize:11,color:C.muted,fontWeight:'800'},
  chartDay:{fontSize:9,color:C.muted},
  bar:{width:'65%',borderTopLeftRadius:7,borderTopRightRadius:7},
  activityRow:{flexDirection:'row',gap:14,alignItems:'flex-start'},
  activityIndex:{fontSize:26,fontWeight:'900',color:C.primary},
  activityMeta:{fontSize:12,color:C.primary,fontWeight:'700',marginTop:3},
  outline:{borderWidth:1,borderColor:C.primary,borderRadius:12,paddingVertical:12,alignItems:'center',marginTop:5},
  outlineText:{color:C.primary,fontSize:13,fontWeight:'800'},
  sessionRow:{flexDirection:'row',paddingVertical:12,alignItems:'center',borderTopWidth:1,borderTopColor:C.line},
  sessionTitle:{fontWeight:'800',fontSize:13,textTransform:'capitalize',color:C.ink},
  small:{fontSize:12,color:C.muted,lineHeight:19},
  feedbackRow:{flexDirection:'row',gap:12},
  feedback:{fontSize:23},
  journalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  journalActions:{flexDirection:'row',gap:25,paddingTop:9,marginTop:5,borderTopWidth:1,borderTopColor:C.line},
  action:{fontSize:13,fontWeight:'800',color:C.primary},
  danger:{borderWidth:1,borderColor:C.red,padding:13,borderRadius:12,marginTop:10,alignItems:'center'},
  dangerText:{fontWeight:'800',color:C.red},
  error:{color:C.red,fontWeight:'800',fontSize:14},
  consent:{flexDirection:'row',gap:12,alignItems:'flex-start',paddingVertical:12},
  consentMark:{fontSize:25,color:C.primary},
  muted:{color:C.muted},
  tabBar:{flexDirection:'row',paddingBottom:Platform.OS==='ios'?8:10,paddingTop:10,
    paddingHorizontal:7,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.line},
  tabButton:{flex:1,alignItems:'center',justifyContent:'center',gap:3},
  navIcon:{fontSize:21,color:'#94A29E',fontWeight:'800'},
  navText:{fontSize:10,color:C.muted,fontWeight:'700'},
  navActive:{color:C.primary,fontWeight:'900'}
});
