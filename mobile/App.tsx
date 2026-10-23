import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar as NativeStatusBar,
  StyleSheet, Text, TextInput, View
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import type {Activity, Entry, MoodScore, Session} from './src/types';
import {
  hasConsent, acceptConsent, openVault, listEntries, saveEntry, removeEntry,
  listSessions, logSession, rateSession, eraseEverything, loadPreferences, savePreferences, checkVaultHealth
} from './src/data/vault';
import {currentStreak, detectPatterns, localDay, readableDay, recommend} from './src/insights';
import {windowSummary} from './src/advanced';
import {DEFAULT_PREFERENCES,suggestedNextStep} from './src/deep';
import {buildEntryInput} from './src/checkin';
import type {Preferences,Situation} from './src/deep';
import {AdditionalCheckin,JournalSearch} from './src/ui/Tracking';
import {InsightExplorer,ProgressExplorer} from './src/ui/Explore';
import {ActivityExplorer} from './src/ui/Activities';
import {ResearchApiBridge} from './src/ui/BackendLab';
import {BackupRestore} from './src/ui/BackupRestore';
import {evaluatePersonalMood} from './src/ml/personal';
import appConfig from './app.json';

const C = {
  ink: '#19263A', muted: '#637183', bg: '#F6F7F4', white: '#FFFFFF',
  primary: '#325C57', teal: '#D8EDE5', peach: '#FBE6DA',
  lilac: '#EAE3F8', line: '#E6EAE8', grey: '#F0F3F2', red: '#AA4B45'
};
type Tab = 'Today' | 'Patterns' | 'Activities' | 'Journal' | 'Progress' | 'Privacy';
const NAV: {label: Tab; icon: string}[] = [
  {label: 'Today',icon: '◉'}, {label: 'Patterns',icon: '▥'},
  {label: 'Activities',icon: '✦'}, {label: 'Journal',icon: '▤'},
  {label: 'Progress',icon: '◷'}, {label: 'Privacy',icon: '♧'}
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
function Field({label,value,onChangeText,keyboardType='default',multiline=false,maxLength,placeholder}:{
  label:string;value:string;onChangeText:(text:string)=>void;
  keyboardType?:'numeric'|'default';multiline?:boolean;maxLength?:number;placeholder?:string;
}) {
  return <View style={s.field}><Label>{label}</Label>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
      keyboardType={keyboardType} multiline={multiline} maxLength={maxLength} placeholder={placeholder}
      placeholderTextColor="#9AA5AB" style={[s.input,multiline && s.multiline]}
      autoCorrect={multiline} />
  </View>;
}

export default function App() {
  const [ready,setReady] = useState(false);
  const [consented,setConsented] = useState(false);
  const [error,setError] = useState('');

  const [featureError,setFeatureError] = useState('');
  const [diagnosing,setDiagnosing] = useState(false);
  const [diagnosticResult,setDiagnosticResult] = useState('');
  const [tab,setTab] = useState<Tab>('Today');
  const scrollRef = useRef<any>(null);
  const navigateTab = (next:Tab) => {
    setTab(next);
    scrollRef.current?.scrollTo({y:0,animated:false});
  };
  const [entries,setEntries] = useState<Entry[]>([]);
  const [sessions,setSessions] = useState<Session[]>([]);
  const [mood,setMood] = useState<MoodScore|null>(null);
  const [stress,setStress] = useState<MoodScore|null>(null);
  const [day,setDay] = useState(localDay());
  const [sleep,setSleep] = useState('');
  const [exercise,setExercise] = useState('');
  const [note,setNote] = useState('');
  const [energy,setEnergy] = useState<MoodScore|null>(null);
  const [sleepQuality,setSleepQuality] = useState<MoodScore|null>(null);
  const [formInitialized,setFormInitialized] = useState(false);
  const [tags,setTags] = useState<string[]>([]);
  const [preferences,setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [activitySituation,setActivitySituation] = useState<Situation>('general');
  const [saving,setSaving] = useState(false);
  const [privacyAccepted,setPrivacyAccepted] = useState(false);

  const fillEntry = (entry:Entry) => {
    setDay(entry.day);setMood(entry.mood);
    setStress(entry.stress_recorded===1?entry.stress:null);
    setSleep(entry.sleep_recorded===1?String(entry.sleep_hours):'');
    setExercise(entry.exercise_recorded===1?String(entry.exercise_min):'');
    setNote(entry.note);setEnergy(entry.energy_recorded===1?entry.energy:null);
    setSleepQuality(entry.sleep_quality_recorded===1?entry.sleep_quality:null);
    setTags(entry.context_tags?entry.context_tags.split(','):[]);
    setFormInitialized(true);
  };
  const refresh = async () => {
    const [m, a, p] = await Promise.all([listEntries(),listSessions(),loadPreferences()]);
    setEntries(m); setSessions(a);setPreferences(p);
  };
  const handleError = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
    setFeatureError(message);
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
  useEffect(() => {
    if(!ready||!consented||formInitialized)return;
    const todayEntry=entries.find(e=>e.day===localDay());
    if(todayEntry)fillEntry(todayEntry);
    setFormInitialized(true);
  },[ready,consented,entries,formInitialized]);
  const proceed = async () => {
    if (!privacyAccepted) return;
    setSaving(true);
    try {
      await acceptConsent(); await openVault(); await refresh();
      setConsented(true); setError(''); setFeatureError('');
    } catch (cause) {handleError(cause);}
    finally {setSaving(false);}
  };
  const save = async () => {
    if(mood===null){setFeatureError('Choose your mood before saving. Sleep, movement, stress, energy and sleep quality are optional.');return;}
    setSaving(true);
    try {
      const payload=buildEntryInput({day,mood,sleep,exercise,stress,note:note.trim(),energy,sleepQuality,tags});
      await saveEntry(payload);
      await refresh();
      setFeatureError('');
      setFormInitialized(true);
      Alert.alert('Saved on your device','Your check-in is encrypted locally. Any skipped measurements are marked as not logged, not treated as zero or average.');
    } catch (cause) {handleError(cause);}
    finally {setSaving(false);}
  };
  const edit = (entry: Entry) => {
    fillEntry(entry);navigateTab('Today');
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
          setConsented(false);setPrivacyAccepted(false);navigateTab('Today');
          setNote('');setDay(localDay());setError('');setFeatureError('');setDiagnosticResult('');setMood(null);setStress(null);setSleep('');setExercise('');setEnergy(null);setSleepQuality(null);setTags([]);setFormInitialized(true);setPreferences(DEFAULT_PREFERENCES);
        } catch(e) {handleError(e);}
      })()}
    ]
  );
  const persistPreferences = async (p:Preferences) => {await savePreferences(p);setPreferences(p);setFeatureError('');};
  const runHealthCheck = async () => {
    if (diagnosing) return;
    setDiagnosing(true);setDiagnosticResult('');
    try {
      const result = await checkVaultHealth();
      setFeatureError('');
      setDiagnosticResult('PASS: '+result.database+'; Journal: '+result.journal+
        '; Activities: '+result.activities+'; Preferences: '+result.preferences+
        '; Optional measurements: '+result.optionalMeasurements+'. SQLCipher '+result.cipher);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown native database failure';
      setFeatureError(message);
      setDiagnosticResult('FAILED: '+message);
    } finally {setDiagnosing(false);}
  };
  const activities = useMemo(()=>recommend(entries),[entries]);
  const nextStep = useMemo(()=>suggestedNextStep(entries,sessions),[entries,sessions]);
  const patterns = useMemo(()=>detectPatterns(entries),[entries]);
  const weekSummary = useMemo(()=>windowSummary(entries,7),[entries]);
  const recent = useMemo(()=>[...entries].sort((a,b)=>a.day.localeCompare(b.day)).slice(-7),[entries]);
  const completed = sessions.length;
  const currentDay=localDay();
  const personalModel = useMemo(()=>evaluatePersonalMood(entries,currentDay),[entries,currentDay]);

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
        <Text style={s.copy}>Your check-ins and journal are stored in a SQLCipher AES-256 encrypted database; its random key is protected by the device keychain/keystore. No account is required, and the app has no ad tracking or analytics. By default, records stay on this phone. The optional research backend is off unless you open it and explicitly send data; notes and context tags are never uploaded. Data older than 365 days is removed when you next open/use the app.</Text>
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
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        {featureError ? <Card tint="#FFEAE5">
          <Text style={s.error}>A feature could not complete</Text>
          <Text style={s.copy}>{featureError}</Text>
          <Pressable accessibilityRole="button" onPress={()=>setFeatureError('')}>
            <Text style={{color:C.primary,fontWeight:'800'}}>Dismiss message</Text>
          </Pressable>
        </Card> : null}
        {tab==='Today'? <>
          <Heading kicker="Daily check-in" title="How are you feeling?" description="There is no right answer. Take a moment for yourself."/>
          <Card tint={C.teal}><Text style={s.kicker}>YOUR WEEK SO FAR</Text>
            <View style={s.statRow}>
              <View><Text style={s.statNum}>{weekSummary.averageMood===null?'–':weekSummary.averageMood.toFixed(1)}</Text><Text style={s.statLabel}>7-day avg mood</Text></View>
              <View><Text style={s.statNum}>{currentStreak(entries)}</Text><Text style={s.statLabel}>Day streak</Text></View>
              <View><Text style={s.statNum}>{weekSummary.logged}</Text><Text style={s.statLabel}>Days logged / 7</Text></View>
            </View>
          </Card>
          <Card tint={C.lilac}>
            <Text style={s.kicker}>YOUR NEXT SMALL STEP</Text>
            <Text style={s.h3}>{nextStep.title}</Text>
            <Text style={s.copy}>{nextStep.body}</Text>
            <Primary label={nextStep.buttonLabel} action={()=>{setActivitySituation(nextStep.situation);navigateTab('Activities');}}/>
            <Text style={s.footnote}>Suggestions are optional and based only on your own local check-ins and activity feedback. They are not diagnoses.</Text>
          </Card>
          <Card>
            <Field label="Date (YYYY-MM-DD)" value={day} onChangeText={value=>{
            setDay(value);
            if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
              const existing=entries.find(e=>e.day===value);
              if(existing)fillEntry(existing);
              else{setMood(null);setStress(null);setSleep('');setExercise('');setNote('');setEnergy(null);setSleepQuality(null);setTags([]);setFormInitialized(true);}
            }
          }}/>
            <Label>YOUR MOOD TODAY</Label>
            <View style={s.moodRow}>{MOODS.map(m=>
              <Pressable accessibilityRole="button" accessibilityLabel={m.label}
                accessibilityState={{selected:mood===m.mood}} key={m.mood}
                onPress={()=>setMood(m.mood)} style={[s.mood,mood===m.mood && s.moodSelected]}>
                <Text style={s.moodEmoji}>{m.emoji}</Text><Text style={s.moodText}>{m.label}</Text>
              </Pressable>)}</View>
            <View style={s.twoCol}>
              <View style={{flex:1}}><Field label="Sleep last night (hrs) · optional" value={sleep} onChangeText={setSleep} keyboardType="numeric" placeholder="Skip if unsure"/></View>
              <View style={{flex:1}}><Field label="Movement (min) · optional" value={exercise} onChangeText={setExercise} keyboardType="numeric" placeholder="Skip if unsure"/></View>
            </View>
            <Label>STRESS LEVEL · OPTIONAL{stress===null?' · NOT LOGGED':' · '+stress+'/5'}</Label>
            <View style={s.chipRow}>
              <Pressable accessibilityRole="button" accessibilityState={{selected:stress===null}} onPress={()=>setStress(null)} style={[s.chip,stress===null&&s.chipActive]}>
                <Text style={[s.chipText,stress===null&&{color:C.white}]}>Skip</Text>
              </Pressable>
              {([1,2,3,4,5] as MoodScore[]).map(v=>
              <Pressable key={v} accessibilityRole="button" accessibilityState={{selected:stress===v}} accessibilityLabel={'Stress '+v} onPress={()=>setStress(v)}
                style={[s.chip,stress===v && s.chipActive]}>
                <Text style={[s.chipText,stress===v && {color:C.white}]}>{v}</Text>
              </Pressable>)}</View>
            <AdditionalCheckin energy={energy} onEnergy={setEnergy} quality={sleepQuality} onQuality={setSleepQuality} tags={tags} onTags={setTags}/>
            <Field label="Your thoughts (optional)" value={note} onChangeText={setNote} multiline maxLength={2000}/>
            <Primary label={saving?'Saving…':entries.some(e=>e.day===day)?'Update private check-in':'Save private check-in'} disabled={saving} action={()=>void save()}/>
            <Text style={s.footnote}>Choose a mood to save. Sleep, movement, stress, energy and sleep quality can be skipped; skipped values are excluded from comparisons. One entry per day; saving the same date updates it.</Text>
          </Card>
          <Card tint={C.peach}>
            <Text style={s.h3}>When an app isn't enough</Text>
            <Text style={s.copy}>If you may be in immediate danger or cannot keep yourself safe, contact your local emergency service or go to the nearest emergency department. Mood Insight is not monitored and cannot alert anyone.</Text>
            <Primary label="Find local emotional support" action={()=>void Linking.openURL('https://findahelpline.com/en').catch(()=>Alert.alert('Support page unavailable','Please contact local emergency services or someone you trust if you need urgent help.'))}/>
            <Text style={s.footnote}>The directory lets you look for support options by country. Check the service’s own page for its current hours and eligibility.</Text>
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
          <Text style={s.h2}>Personal learning experiment</Text>
          <Card tint={C.lilac}>
            <Text style={s.kicker}>ON-DEVICE · YOUR OWN RECORDED CHECK-INS</Text>
            <Text style={s.copy}>This small experimental model learns only from your own consecutive-day entries stored on this phone. It uses an earlier day's mood, sleep, movement and stress to study the next day's recorded mood. It does not upload data.</Text>
            {personalModel.status==='ready'?<>
              <Text style={s.heroSmall}>Exploratory next-day mood class: {personalModel.predictedMood}/5</Text>
              <Text style={s.copy}>Chronological holdout: {Math.round((personalModel.modelAccuracy||0)*100)}% correct versus {Math.round((personalModel.baselineAccuracy||0)*100)}% for a simple baseline across {personalModel.holdout} held-out day pairs.</Text>
              <Text style={s.copy}>Mean absolute error: {(personalModel.modelMae||0).toFixed(2)} versus {(personalModel.baselineMae||0).toFixed(2)} baseline. Model certainty for the displayed class: {Math.round((personalModel.modelConfidence||0)*100)}%.</Text>
              <Text style={s.small}>Probability by mood: {personalModel.probabilityByMood?.map((p,i)=>(i+1)+'/5 '+Math.round(p*100)+'%').join(' · ')}</Text>
              <Text style={s.small}>Largest inputs for this estimate: {personalModel.topInputs.join(' · ')}. These describe model influence, not causes of your mood.</Text>
              <Text style={s.copy}>This is a small personal experiment, not a clinical prediction. It appears only after its held-out results beat the baseline; never use it for health decisions.</Text>
            </>:<>
              <Text style={s.copy}>{personalModel.message}</Text>
              {personalModel.modelAccuracy!==null&&personalModel.baselineAccuracy!==null?
                <Text style={s.small}>Historical holdout: {Math.round(personalModel.modelAccuracy*100)}% versus {Math.round(personalModel.baselineAccuracy*100)}% baseline, {personalModel.holdout} day pairs.</Text>:null}
            </>}
            <Text style={s.footnote}>Australian statistics elsewhere in this app are population context, not individual-level training data. This personal model is not Australian-population-trained or clinically validated.</Text>
          </Card>
          <Text style={s.h2}>Detected associations</Text>
          {patterns.length?patterns.map((p,i)=><Card key={p.id} tint={i%2===0?C.teal:C.peach}>
            <Text style={s.kicker}>{p.count} DAYS COMPARED</Text>
            <Text style={s.h3}>{p.title}</Text><Text style={s.copy}>{p.detail}</Text>
          </Card>):<Card><Text style={s.h3}>No dependable comparisons yet</Text>
            <Text style={s.copy}>Try logging for a few more days. We will never invent statistics to fill empty charts.</Text>
          </Card>}
          <InsightExplorer entries={entries} sessions={sessions}/>
          <Text style={s.footnote}>These are descriptive observations, not diagnoses, predictions, or evidence that one activity caused a mood change.</Text>
        </>:null}

        {tab==='Activities'?<>
          <Heading kicker="Personal activity plans" title="Small actions, real choices" description="A step-by-step plan, tailored reasons and feedback that changes your recommendations."/>
          <ActivityExplorer entries={entries} sessions={sessions} preferences={preferences} situation={activitySituation} onSituationChange={setActivitySituation} onPreferences={persistPreferences} refresh={refresh}/>
        </>:null}

        {tab==='Journal'?<>
          <Heading kicker="Private journal" title="Your story, your words" description="Search context, notes and dates; edit or remove any entry."/>
          <JournalSearch entries={entries} onEdit={edit} onDelete={confirmRemove}/>
        </>:null}
        {tab==='Progress'?<>
          <Heading kicker="A gentle progress space" title="Your wellbeing journey" description="Set realistic goals and reflect on your own participation."/>
          <ProgressExplorer entries={entries} sessions={sessions} preferences={preferences} onPreferences={persistPreferences}/>
        </>:null}

        {tab==='Privacy'?<>
          <Heading kicker="Data control" title="Your data. Your choice." description="A simple privacy promise you can verify."/>
          <Card tint={C.teal}><Text style={s.h3}>Encrypted on your phone</Text>
            <Text style={s.copy}>Native SQLCipher SQLite encrypts entries using AES-256. Your randomly generated database key is held by platform SecureStore. No mood data is sent by default. The optional research bridge can send explicitly selected numerical check-ins only after you enable it and confirm consent; journal notes and context tags remain local.</Text>
          </Card>
          <Card>
            <Text style={s.h3}>Run native feature diagnostics</Text>
            <Text style={s.copy}>Check encrypted storage, read/write, journal, activity records and preferences without deleting your data. No diagnostics are uploaded.</Text>
            <Primary label={diagnosing?'Checking local database…':'Check app features'} disabled={diagnosing} action={()=>void runHealthCheck()}/>
            {diagnosticResult ? <Text selectable style={[s.copy,{color:diagnosticResult.startsWith('PASS')?C.primary:C.red}]}>{diagnosticResult}</Text> : null}
            <Text style={s.footnote}>App version: {appConfig.expo.version}. If a check fails, share only the error text (not private notes).</Text>
          </Card>
          <BackupRestore refresh={refresh}/>
          <ResearchApiBridge entries={entries}/>
          <Card><Text style={s.h3}>12-month retention</Text>
            <Text style={s.copy}>Entries older than 365 days are automatically purged whenever the encrypted vault is opened or used. The app does not run a background deletion task while closed.</Text>
            <Text style={s.copy}>Some older check-ins may show sleep, movement or stress as “not logged”. Those values are preserved, but older app versions could not tell whether a default was deliberately entered, so they are excluded from comparisons until you edit and re-enter them.</Text>
            <Text style={s.h3}>Get human support</Text>
            <Text style={s.copy}>If you need emotional support, use the country-based directory to find a local service. If you are in immediate danger, contact your local emergency service. This app is not monitored.</Text>
            <Primary label="Find local support options" action={()=>void Linking.openURL('https://findahelpline.com/en').catch(()=>Alert.alert('Support page unavailable','Please contact local emergency services or someone you trust if you need urgent help.'))}/>
            <Text style={s.h3}>No medical claims</Text>
            <Text style={s.copy}>Personal patterns are descriptive only. This tool does not diagnose, treat, prescribe, or replace qualified care.</Text>
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
      onPress={()=>navigateTab(n.label)} style={s.tabButton}>
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
