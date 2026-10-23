import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptBackup,decryptBackup,validateBackupPayload} from '../src/backup.ts';
const now=new Date(),day=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
const payload={schema:'mood-insight-backup',version:1,exported_at:now.toISOString(),
 entries:[{id:'entry-1',day,mood:4,sleep_hours:7,exercise_min:20,stress:2,note:'private note',energy:3,sleep_quality:4,context_tags:'Work',sleep_recorded:1,exercise_recorded:1,stress_recorded:1,energy_recorded:0,sleep_quality_recorded:1,created_at:Date.now(),updated_at:Date.now()}],
 sessions:[{id:'session-1',activity_id:'walk',day,created_at:Date.now(),helpful:1,duration_seconds:120,mood_before:3,mood_after:4}],
 preferences:{focus:'balance',max_minutes:10,weekly_checkins:4,weekly_activities:3,favorite_activity_ids:'walk'}};
test('backup encrypts/decrypts records without exposing journal plaintext',async()=>{
 const encrypted=await encryptBackup(payload,'correct horse battery staple 2026');
 assert.ok(!encrypted.includes('private note'));assert.ok(!encrypted.includes('session-1'));
 assert.deepEqual(await decryptBackup(encrypted,'correct horse battery staple 2026'),payload);
});
test('wrong passphrase and tampered ciphertext are rejected',async()=>{
 const encrypted=await encryptBackup(payload,'correct horse battery staple 2026');
 await assert.rejects(()=>decryptBackup(encrypted,'wrong passphrase is here'),/Could not decrypt/);
 const envelope=JSON.parse(encrypted);envelope.ciphertext=(envelope.ciphertext.startsWith('00')?'01':'00')+envelope.ciphertext.slice(2);
 await assert.rejects(()=>decryptBackup(JSON.stringify(envelope),'correct horse battery staple 2026'),/Could not decrypt/);
});
test('payload validation rejects duplicate days, invalid preferences and future dates',()=>{
 assert.throws(()=>validateBackupPayload({...payload,entries:[...payload.entries,{...payload.entries[0],id:'other'}]}),/invalid or expired/);
 assert.throws(()=>validateBackupPayload({...payload,preferences:{...payload.preferences,focus:'diagnosis'}}),/preferences/);
 assert.throws(()=>validateBackupPayload({...payload,entries:[{...payload.entries[0],day:'2099-01-01'}]}),/invalid or expired/);
});

test('backup rejects weak passphrases, malformed envelopes and oversized payloads',async()=>{
 await assert.rejects(()=>encryptBackup(payload,'short'),/at least 12 characters/);
 await assert.rejects(()=>decryptBackup('x'.repeat(100),'short'),/at least 12 characters/);
 const malformed={format:'mood-insight-encrypted-backup',version:1,cipher:'AES-256-GCM',
   kdf:'PBKDF2-SHA256',iterations:310000,salt:'0'.repeat(32),nonce:'0'.repeat(24),ciphertext:'not-hex'};
 await assert.rejects(()=>decryptBackup(JSON.stringify(malformed),'correct horse battery staple 2026'),/Could not decrypt/);
 await assert.rejects(()=>decryptBackup('x'.repeat(10_000_001),'correct horse battery staple 2026'),/too large/);
});

test('backup validation rejects malformed optional provenance and activity durations',()=>{
 assert.throws(()=>validateBackupPayload({...payload,entries:[{...payload.entries[0],sleep_recorded:2}]}),/invalid or expired/);
 assert.equal(validateBackupPayload({...payload,entries:[{...payload.entries[0],context_tags:'Custom context'}]}).entries[0].context_tags,'Custom context');
 assert.throws(()=>validateBackupPayload({...payload,entries:[{...payload.entries[0],context_tags:'bad,comma,inside'}]}),/invalid or expired/);
 assert.throws(()=>validateBackupPayload({...payload,sessions:[{...payload.sessions[0],duration_seconds:7201}]}),/invalid activity history/);
 assert.throws(()=>validateBackupPayload({...payload,sessions:[...payload.sessions,{...payload.sessions[0],id:'session-1'}]}),/invalid activity history/);
});

test('legacy backup preferences without favourites restore with an empty favourites list without mutating input',()=>{
 const legacy={...payload,preferences:{focus:'balance',max_minutes:10,weekly_checkins:4,weekly_activities:3}};
 const before=JSON.stringify(legacy);
 const normalized=validateBackupPayload(legacy);
 assert.equal(normalized.preferences.favorite_activity_ids,'');
 assert.equal(JSON.stringify(legacy),before);
});
test('custom context labels and favourites round-trip inside encrypted backup',async()=>{
 const custom={...payload,entries:[{...payload.entries[0],context_tags:'Remote work,Deadline'}],
   preferences:{...payload.preferences,favorite_activity_ids:'walk,journal'}};
 const encrypted=await encryptBackup(custom,'correct horse battery staple 2026');
 const restored=await decryptBackup(encrypted,'correct horse battery staple 2026');
 assert.equal(restored.entries[0].context_tags,'Remote work,Deadline');
 assert.equal(restored.preferences.favorite_activity_ids,'walk,journal');
});
