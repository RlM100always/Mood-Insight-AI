import {gcm} from '@noble/ciphers/aes.js';
import * as Crypto from 'expo-crypto';
import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,hexToBytes,utf8ToBytes} from '@noble/hashes/utils.js';
import type {Entry,Session} from './types';
import type {Preferences} from './deep.ts';
import {CONTEXT_TAGS} from './deep.ts';
import {localDay} from './insights.ts';
export type BackupPayload={schema:'mood-insight-backup';version:1;exported_at:string;entries:Entry[];sessions:Session[];preferences:Preferences};
type Envelope={format:'mood-insight-encrypted-backup';version:1;cipher:'AES-256-GCM';kdf:'PBKDF2-SHA256';iterations:number;salt:string;nonce:string;ciphertext:string};
const ITERATIONS=310_000,MAX_FILE_CHARS=10_000_000,MAX_ENTRIES=400,MAX_SESSIONS=5000;
const DAY_MS=86_400_000,RETENTION_MS=365*DAY_MS,AAD=utf8ToBytes('MoodInsightEncryptedBackup:v1');
function fail(message:string):never{throw new Error(message);}
function decodeUtf8(bytes:Uint8Array):string{
 let out='',i=0;
 while(i<bytes.length){const a=bytes[i++];if(a<0x80){out+=String.fromCharCode(a);continue;}
  if((a&0xe0)===0xc0){if(i>=bytes.length)throw new Error('Invalid UTF-8');const b=bytes[i++];out+=String.fromCharCode(((a&0x1f)<<6)|(b&0x3f));continue;}
  if((a&0xf0)===0xe0){if(i+1>=bytes.length)throw new Error('Invalid UTF-8');const b=bytes[i++],c=bytes[i++];out+=String.fromCharCode(((a&0x0f)<<12)|((b&0x3f)<<6)|(c&0x3f));continue;}
  if((a&0xf8)===0xf0){if(i+2>=bytes.length)throw new Error('Invalid UTF-8');const b=bytes[i++],c=bytes[i++],d=bytes[i++];const cp=(((a&7)<<18)|((b&0x3f)<<12)|((c&0x3f)<<6)|(d&0x3f))-0x10000;out+=String.fromCharCode(0xd800+(cp>>10),0xdc00+(cp&0x3ff));continue;}
  throw new Error('Invalid UTF-8');
 }return out;
}
function validDay(day:unknown):day is string{
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const parsed=new Date(day+'T12:00:00');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day;
}
function validScore(v:unknown):v is number{return typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=5;}
function validNullableScore(v:unknown):v is number|null{return v===null||validScore(v);}
function validTimestamp(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Date.now()+DAY_MS;}
export function validateBackupPayload(value:unknown):BackupPayload{
 if(!value||typeof value!=='object')return fail('Backup content is invalid.');
 const p=value as Partial<BackupPayload>;
 if(p.schema!=='mood-insight-backup'||p.version!==1||typeof p.exported_at!=='string'||!Number.isFinite(Date.parse(p.exported_at))||!Array.isArray(p.entries)||!Array.isArray(p.sessions)||!p.preferences)return fail('This is not a supported Mood Insight backup.');
 if(p.entries.length>MAX_ENTRIES||p.sessions.length>MAX_SESSIONS)return fail('Backup contains more records than this app supports.');
 const today=localDay(),cutoff=localDay(new Date(Date.now()-RETENTION_MS)),days=new Set<string>(),ids=new Set<string>();
 for(const raw of p.entries){
  const e=raw as Entry;
  if(!e||typeof e!=='object'||typeof e.id!=='string'||e.id.length<1||e.id.length>128||!validDay(e.day)||e.day<cutoff||e.day>today||days.has(e.day)||ids.has(e.id)||
   !validScore(e.mood)||typeof e.sleep_hours!=='number'||!Number.isFinite(e.sleep_hours)||e.sleep_hours<0||e.sleep_hours>24||
   !Number.isInteger(e.exercise_min)||e.exercise_min<0||e.exercise_min>600||!validScore(e.stress)||!validScore(e.energy)||!validScore(e.sleep_quality)||
   typeof e.note!=='string'||e.note.length>2000||typeof e.context_tags!=='string'||e.context_tags.length>250||
   e.context_tags.split(',').some(t=>t.length>0&&!CONTEXT_TAGS.some(c=>c===t))||
   ![e.sleep_recorded,e.exercise_recorded,e.stress_recorded,e.energy_recorded,e.sleep_quality_recorded].every(v=>v===0||v===1)||
   !validTimestamp(e.created_at)||!validTimestamp(e.updated_at))return fail('Backup has an invalid or expired check-in. Nothing was restored.');
  days.add(e.day);ids.add(e.id);
 }
 const sessionIds=new Set<string>();
 for(const raw of p.sessions){
  const s=raw as Session;
  if(!s||typeof s!=='object'||typeof s.id!=='string'||s.id.length<1||s.id.length>128||sessionIds.has(s.id)||typeof s.activity_id!=='string'||!/^[a-z]+$/.test(s.activity_id)||
   !validDay(s.day)||s.day<cutoff||s.day>today||!validTimestamp(s.created_at)||!Number.isInteger(s.duration_seconds)||s.duration_seconds<0||s.duration_seconds>7200||
   !(s.helpful===null||s.helpful===0||s.helpful===1)||!validNullableScore(s.mood_before)||!validNullableScore(s.mood_after))return fail('Backup has invalid activity history. Nothing was restored.');
  sessionIds.add(s.id);
 }
 const pref=p.preferences as Preferences;
 if(!pref||!['balance','calm','sleep','energy','connection'].includes(pref.focus)||![5,10,15,20,30].includes(pref.max_minutes)||
  !Number.isInteger(pref.weekly_checkins)||pref.weekly_checkins<1||pref.weekly_checkins>7||!Number.isInteger(pref.weekly_activities)||pref.weekly_activities<1||pref.weekly_activities>14)return fail('Backup preferences are invalid. Nothing was restored.');
 return p as BackupPayload;
}
export async function encryptBackup(payload:BackupPayload,passphrase:string):Promise<string>{
 const valid=validateBackupPayload(payload);
 if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>256)fail('Use a backup passphrase of at least 12 characters.');
 const salt=Crypto.getRandomBytes(16),nonce=Crypto.getRandomBytes(12),key=await pbkdf2Async(sha256,utf8ToBytes(passphrase),salt,{c:ITERATIONS,dkLen:32});
 const ciphertext=gcm(key,nonce,AAD).encrypt(utf8ToBytes(JSON.stringify(valid)));
 const envelope:Envelope={format:'mood-insight-encrypted-backup',version:1,cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:bytesToHex(salt),nonce:bytesToHex(nonce),ciphertext:bytesToHex(ciphertext)};
 return JSON.stringify(envelope,null,2)+'\n';
}
export async function decryptBackup(raw:string,passphrase:string):Promise<BackupPayload>{
 if(typeof raw!=='string'||raw.length<100||raw.length>MAX_FILE_CHARS)fail('Backup file is empty or too large.');
 if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>256)fail('Use the original backup passphrase (at least 12 characters).');
 try{
  const e=JSON.parse(raw) as Envelope;
  if(e.format!=='mood-insight-encrypted-backup'||e.version!==1||e.cipher!=='AES-256-GCM'||e.kdf!=='PBKDF2-SHA256'||e.iterations!==ITERATIONS||
   !/^[0-9a-f]{32}$/.test(e.salt)||!/^[0-9a-f]{24}$/.test(e.nonce)||typeof e.ciphertext!=='string'||!/^(?:[0-9a-f]{2}){16,5000000}$/.test(e.ciphertext))fail('Backup format is invalid or unsupported.');
  const key=await pbkdf2Async(sha256,utf8ToBytes(passphrase),hexToBytes(e.salt),{c:ITERATIONS,dkLen:32});
  return validateBackupPayload(JSON.parse(decodeUtf8(gcm(key,hexToBytes(e.nonce),AAD).decrypt(hexToBytes(e.ciphertext)))));
 }catch{fail('Could not decrypt this backup. Check the passphrase and file integrity. Your current data was not changed.');}
}
