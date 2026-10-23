import React,{useState} from 'react';
import {Alert,Text,TextInput} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import {encryptBackup,decryptBackup} from '../backup';
import {createBackupSnapshot,mergeBackupSnapshot} from '../data/vault';
import {Panel,Action,st,colors} from './Shared';
type Props={refresh:()=>Promise<void>};
export function BackupRestore({refresh}:Props){
 const [passphrase,setPassphrase]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const exportNow=async()=>{
  if(busy)return;
  if(passphrase.length<12){Alert.alert('Passphrase too short','Use at least 12 characters. Keep it safe; a lost passphrase cannot be recovered.');return;}
  if(passphrase!==confirm){Alert.alert('Passphrases do not match','Enter the same passphrase twice.');return;}
  setBusy(true);setStatus('');
  try{
   const encrypted=await encryptBackup(await createBackupSnapshot(),passphrase,size=>Crypto.getRandomBytes(size));
   if(!FileSystem.cacheDirectory)throw new Error('Private cache storage is unavailable on this device.');
   const uri=FileSystem.cacheDirectory+'mood-insight-backup-'+new Date().toISOString().slice(0,10)+'.mibak';
   await FileSystem.writeAsStringAsync(uri,encrypted,{encoding:FileSystem.EncodingType.UTF8});
   if(!(await Sharing.isAvailableAsync()))throw new Error('The system share sheet is unavailable on this device.');
   // File creation is the app-controlled success boundary. Android share sheets can
   // keep their result callback pending even after this app is foregrounded again,
   // so do not delay user feedback or lock the UI on an external chooser callback.
   setStatus('Encrypted backup prepared. Choose where to save it in the system share sheet; keep the file and passphrase separately.');
   setPassphrase('');setConfirm('');setBusy(false);
   try{
    await Sharing.shareAsync(uri,{mimeType:'application/octet-stream',dialogTitle:'Save encrypted Mood Insight backup'});
    setStatus('Encrypted backup prepared. Keep the saved file and passphrase separately; journal text is encrypted.');
   }catch(e){
    setStatus('Encrypted backup prepared in private temporary storage, but the system share sheet did not complete. Re-export when you are ready to save a copy.');
    Alert.alert('Backup share did not complete',e instanceof Error?e.message:'Please try export again.');
   }
  }catch(e){Alert.alert('Backup could not be prepared',e instanceof Error?e.message:'Please try again.');}
  finally{setBusy(false);}
 };
 const chooseRestore=async()=>{
  if(busy)return;
  if(passphrase.length<12){Alert.alert('Passphrase needed','Enter the original backup passphrase (at least 12 characters).');return;}
  setBusy(true);setStatus('');
  try{
   const picked=await DocumentPicker.getDocumentAsync({type:['application/json','text/plain','application/octet-stream'],copyToCacheDirectory:true,multiple:false});
   if(picked.canceled||!picked.assets?.[0])return;
   const file=picked.assets[0];
   if(typeof file.size==='number'&&file.size>10_000_000)throw new Error('Backup file is too large.');
   const raw=await FileSystem.readAsStringAsync(file.uri,{encoding:FileSystem.EncodingType.UTF8});
   const payload=await decryptBackup(raw,passphrase);
   setBusy(false);
   Alert.alert('Restore encrypted backup?',payload.entries.length+' check-ins and '+payload.sessions.length+' activity records were found. Missing dates will be merged. Existing same-day entries are kept; preferences will be restored from backup.',
    [{text:'Cancel',style:'cancel'},{text:'Merge backup',onPress:()=>void (async()=>{
      setBusy(true);
      try{const result=await mergeBackupSnapshot(payload);await refresh();setStatus('Restore complete: added '+result.entriesAdded+' check-ins and '+result.sessionsAdded+' activity records. Existing same-day entries were kept.');setPassphrase('');}
      catch(e){Alert.alert('Restore failed',e instanceof Error?e.message:'Your existing records were not intentionally replaced.');}
      finally{setBusy(false);}
    })()}]);
  }catch(e){setPassphrase('');Alert.alert('Backup could not be restored',e instanceof Error?e.message:'Please try again.');}
  finally{setBusy(false);}
 };
 return <Panel>
  <Text style={st.title}>Encrypted backup & restore</Text>
  <Text style={st.body}>Portable passphrase-protected backup using AES-256-GCM. It includes check-ins, journal, activity feedback and preferences. Nothing is uploaded to a server.</Text>
  <Text style={st.label}>BACKUP PASSPHRASE · 12+ CHARACTERS</Text>
  <TextInput accessibilityLabel="Backup passphrase" value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter a strong passphrase" placeholderTextColor={colors.sub} style={{backgroundColor:colors.bg,color:colors.ink,padding:12,borderRadius:10}}/>
  <Text style={st.label}>CONFIRM PASSPHRASE FOR EXPORT</Text>
  <TextInput accessibilityLabel="Confirm backup passphrase" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Repeat passphrase for export" placeholderTextColor={colors.sub} style={{backgroundColor:colors.bg,color:colors.ink,padding:12,borderRadius:10}}/>
  <Action text={busy?'Working…':'Export encrypted backup'} onPress={()=>void exportNow()}/>
  <Action text={busy?'Working…':'Choose backup file to restore'} onPress={()=>void chooseRestore()}/>
  <Text style={st.sub}>Restore merges missing dates and keeps existing same-day check-ins. Preferences are restored from the backup. The passphrase is never saved; losing it means the backup cannot be recovered.</Text>
  {status?<Text selectable style={st.body}>{status}</Text>:null}
 </Panel>;
}
