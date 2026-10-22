import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptBackup,decryptBackup,validateBackupPayload} from '../src/backup.ts';
const now=new Date(),day=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
const payload={schema:'mood-insight-backup',version:1,exported_at:now.toISOString(),
 entries:[{id:'entry-1',day,mood:4,sleep_hours:7,exercise_min:20,stress:2,note:'private note',energy:3,sleep_quality:4,context_tags:'Work',sleep_recorded:1,exercise_recorded:1,stress_recorded:1,energy_recorded:0,sleep_quality_recorded:1,created_at:Date.now(),updated_at:Date.now()}],
 sessions:[{id:'session-1',activity_id:'walk',day,created_at:Date.now(),helpful:1,duration_seconds:120,mood_before:3,mood_after:4}],
 preferences:{focus:'balance',max_minutes:10,weekly_checkins:4,weekly_activities:3}};
test('backup encrypts/decrypts records without exposing journal plaintext',async()=>{
 const encrypted=await encryptBackup(payload,'correct horse battery staple 2026');
 assert.ok(!encrypted.includes('private note'));assert.ok(!encrypted.includes('session-1'));
 assert.deepEqual(await decryptBackup(encrypted,'correct horse battery staple 2026'),payload);
});
test('wrong passphrase and tampered ciphertext are rejected',async()=>{
 const encrypted=await encryptBackup(payload,'correct horse battery staple 2026');
 await assert.rejects(()=>decryptBackup(encrypted,'wrong passphrase is here'),/Could not decrypt/);
 const envelope=JSON.parse(encrypted);envelope.ciphertext=envelope.ciphertext.slice(0,-2)+'00';
 await assert.rejects(()=>decryptBackup(JSON.stringify(envelope),'correct horse battery staple 2026'),/Could not decrypt/);
});
test('payload validation rejects duplicate days, invalid preferences and future dates',()=>{
 assert.throws(()=>validateBackupPayload({...payload,entries:[...payload.entries,{...payload.entries[0],id:'other'}]}),/invalid or expired/);
 assert.throws(()=>validateBackupPayload({...payload,preferences:{...payload.preferences,focus:'diagnosis'}}),/preferences/);
 assert.throws(()=>validateBackupPayload({...payload,entries:[{...payload.entries[0],day:'2099-01-01'}]}),/invalid or expired/);
});
