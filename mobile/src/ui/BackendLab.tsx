import React,{useRef,useState} from 'react';
import {Alert,Pressable,Text,TextInput,View} from 'react-native';
import type {Entry} from '../types';
import {Panel,Heading,Choose,Action,colors,st} from './Shared';

/**
 * Explicitly opt-in bridge. By default this screen performs NO network requests
 * and never uploads notes, journals or credentials without user interaction.
 * Only HTTPS URLs accepted on physical devices. Flask binds localhost by default;
 * use your own audited HTTPS reverse proxy for a separate-device test.
 */
export function validateApiAddress(input:string):string{
  const value=input.trim().replace(/\/+$/,'');
  if(!/^https:\/\/[^/\s]+(?::\d+)?$/i.test(value)) throw new Error('An HTTPS server URL is required (no path or query).');
  if(value.includes('@') || value.length>220) throw new Error('Invalid server URL.');
  return value;
}
type Props={entries:Entry[]};
type RemoteHistory={entries:{id:string;day:string;mood:number;stress:number}[]};
async function apiCall(origin:string,path:string,method:'GET'|'POST',
                       auth?:string,payload?:object):Promise<any>{
  const controller=new AbortController();
  const limit=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch(origin+path,{
      method,
      headers:{'Accept':'application/json',...(payload?{'Content-Type':'application/json'}:{}),
        ...(auth?{'Authorization':'Bearer '+auth}:{})},
      body:payload?JSON.stringify(payload):undefined,
      signal:controller.signal
    });
    const json=await response.json();
    if(!response.ok)throw new Error(json.error||('API returned '+response.status));
    return json;
  }finally{clearTimeout(limit);}
}
export function ResearchApiBridge({entries}:Props){
  const [expanded,setExpanded]=useState(false);
  const [url,setUrl]=useState('');
  const [username,setUsername]=useState('Demo User');
  const [age,setAge]=useState('22');
  const [password,setPassword]=useState('');
  const [userId,setUserId]=useState('');
  const [token,setToken]=useState('');
  const [status,setStatus]=useState('Not connected. All mood logs stay on this phone.');
  const [busy,setBusy]=useState(false);
  const [sharing,setSharing]=useState(false);
  const [remote,setRemote]=useState<RemoteHistory|null>(null);
  const session=useRef<string>('');
  const action=async(work:()=>Promise<void>)=>{
    if(busy)return;setBusy(true);
    try{await work();}catch(e){
      const message=e instanceof Error?e.message:'Unknown connection error';
      setStatus('Error: '+message);
      Alert.alert('Optional local API',message);
    }finally{setBusy(false);}
  };
  const withOrigin=()=>validateApiAddress(url);
  const check=()=>void action(async()=>{
    const health=await apiCall(withOrigin(),'/health','GET');
    const info=await apiCall(withOrigin(),'/model_info','GET');
    setStatus('Connected to '+health.service+'. ML: '+info.data_origin+
      '. Measured real-world accuracy: '+(info.accuracy??'not available')+'.');
  });
  const auth=(mode:'register'|'login')=>void action(async()=>{
    const origin=withOrigin();
    const details=mode==='register'?
      await apiCall(origin,'/user','POST',undefined,{name:username,age:Number(age),password}):
      await apiCall(origin,'/login','POST',undefined,{user_id:userId,password});
    const id=details.user_id||userId;
    setUserId(id);setToken(details.token);
    session.current=details.token;
    setPassword('');
    setStatus('Authenticated for this session. Account: '+id+'. No mood entries uploaded.');
  });
  const sendLatest=()=>void action(async()=>{
    if(!sharing)throw new Error('Confirm explicit consent to send this one check-in.');
    const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
    if(!latest)throw new Error('You must save an on-device mood check-in first.');
    if(!token)throw new Error('Create/login to your backend account first.');
    // No note or personal context is transferred, only numerical features and date.
    const result=await apiCall(withOrigin(),'/log_mood','POST',session.current,{
      day:latest.day,mood:latest.mood,stress:latest.stress,
      sleep_hours:latest.sleep_hours,exercise_min:latest.exercise_min,
      energy:latest.energy||3,sleep_quality:latest.sleep_quality||3,note:''
    });
    setSharing(false);
    setStatus('One numerical entry sent explicitly: '+result.day+
      '. Private journal notes remained on-device.');
  });
  const history=()=>void action(async()=>{
    if(!token)throw new Error('Please authenticate first.');
    const result=await apiCall(withOrigin(),'/history?days=14','GET',session.current);
    setRemote(result);
    setStatus('Received '+result.entries.length+' opt-in backend entries (14 days).');
  });
  const recommend=()=>void action(async()=>{
    if(!token)throw new Error('Please authenticate first.');
    if(!sharing)throw new Error('Enable explicit consent to send numerical check-in details.');
    const latest=[...entries].sort((a,b)=>b.day.localeCompare(a.day))[0];
    if(!latest)throw new Error('Save a local check-in first.');
    const result=await apiCall(withOrigin(),'/recommend','POST',session.current,{
      mood:latest.mood,stress:latest.stress,
      sleep_hours:latest.sleep_hours,exercise_min:latest.exercise_min
    });
    setStatus('Flask suggested: '+result.activities.map((x:{title:string})=>x.title).join(' / ')+
      '. No note was sent. Recommendations are rules, not verified AI efficacy.');
    setSharing(false);
  });

  return <View style={{gap:11}}>
    <Pressable accessibilityRole="button" onPress={()=>setExpanded(!expanded)} style={st.button}>
      <Text style={st.buttonText}>Optional Flask backend connection {expanded?'−':'+'}</Text>
    </Pressable>
    {expanded?<View style={{gap:12}}>
      <Panel tint={colors.warm}>
        <Text style={st.title}>Opt-in research backend · OFF by default</Text>
        <Text style={st.body}>All five primary app workflows operate offline in SQLCipher. Connecting to Flask is optional, requires your own running HTTPS server, and cannot send data without your explicit actions.</Text>
        <Text style={st.sub}>For development, Flask runs at 127.0.0.1 on a computer. A physical Android/iPhone cannot reach it until you configure an HTTPS tunnel/reverse proxy. Do not expose the development server directly on the public internet.</Text>
      </Panel>
      <Panel>
        <Text style={st.label}>YOUR SELF-HOSTED HTTPS API ADDRESS</Text>
        <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url"
          accessibilityLabel="HTTPS Flask API URL" value={url} onChangeText={setUrl}
          placeholder="https://your-private-api.example" style={{backgroundColor:colors.bg,
            color:colors.ink,padding:12,borderRadius:10}}/>
        <Action text={busy?'Working…':'Check health and model information'} onPress={check}/>
        <Text selectable style={st.sub}>{status}</Text>
      </Panel>
      <Panel>
        <Heading>Research account</Heading>
        <Text style={st.sub}>Optional server account, separate from the phone's encrypted vault.</Text>
        <TextInput accessibilityLabel="Server profile name" value={username} onChangeText={setUsername}
          placeholder="Name" style={{backgroundColor:colors.bg,color:colors.ink,padding:10,borderRadius:10}}/>
        <TextInput accessibilityLabel="Account age" keyboardType="numeric" value={age} onChangeText={setAge}
          placeholder="Age 18+" style={{backgroundColor:colors.bg,color:colors.ink,padding:10,borderRadius:10}}/>
        <TextInput accessibilityLabel="Backend user ID" value={userId} onChangeText={setUserId}
          placeholder="User ID (for returning account)" autoCapitalize="none"
          style={{backgroundColor:colors.bg,color:colors.ink,padding:10,borderRadius:10}}/>
        <TextInput accessibilityLabel="Backend password" value={password} onChangeText={setPassword}
          secureTextEntry placeholder="12+ character password"
          style={{backgroundColor:colors.bg,color:colors.ink,padding:10,borderRadius:10}}/>
        <View style={st.row}><Choose text="Create account" selected={false} onPress={()=>auth('register')}/>
          <Choose text="Log in" selected={false} onPress={()=>auth('login')}/></View>
        <Text selectable style={st.sub}>Your backend user ID: {userId||'Not created'}. Store it yourself. Token stays in memory and expires after one hour.</Text>
      </Panel>
      <Panel tint={colors.soft}>
        <Heading>Explicit one-entry sync</Heading>
        <Text style={st.body}>Only your latest check-in's date, mood, stress, sleep hours, exercise minutes, energy and sleep quality may be sent. Journal text, context tags and history are not uploaded.</Text>
        <Choose text={sharing?'☑ I authorise one request':'□ I authorise one request'}
          selected={sharing} onPress={()=>setSharing(!sharing)}/>
        <Action text="Send one numerical mood log" onPress={sendLatest}/>
        <Action text="Request three Flask recommendations" onPress={recommend}/>
        <Action text="View my backend 14-day history" onPress={history}/>
        {remote? <Text style={st.sub}>Backend history: {remote.entries.length} records. Latest: {remote.entries[0]?.day||'none'}.</Text>:null}
      </Panel>
    </View>:null}
  </View>;
}
