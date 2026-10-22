import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {encryptBackup} from '../src/backup.ts';

const output=resolve(process.argv[2]||'e2e-restore-fixture.mibak');
const now=Date.now();
const day=(value)=>{
 const d=new Date(value);
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const today=day(now);
const yesterday=day(now-86_400_000);
const entry=(id,date,mood,note,created_at)=>({
 id,day:date,mood,sleep_hours:7,exercise_min:20,stress:2,note,
 energy:4,sleep_quality:4,context_tags:'Study',
 sleep_recorded:1,exercise_recorded:1,stress_recorded:1,
 energy_recorded:1,sleep_quality_recorded:1,created_at,updated_at:created_at
});
const payload={
 schema:'mood-insight-backup',version:1,exported_at:new Date(now).toISOString(),
 entries:[
  entry('e2e-restore-yesterday',yesterday,4,'E2E_RESTORED_ENTRY_CHECK',now-86_400_000),
  entry('e2e-restore-today',today,1,'E2E_SHOULD_NOT_OVERWRITE_LOCAL_ENTRY',now)
 ],
 sessions:[{
  id:'e2e-restore-session',activity_id:'walk',day:yesterday,
  created_at:now-86_400_000,helpful:1,duration_seconds:120,mood_before:3,mood_after:4
 }],
 preferences:{focus:'calm',max_minutes:5,weekly_checkins:4,weekly_activities:3}
};
const passphrase='MoodInsightE2EBackupPassphrase2026';
const encrypted=await encryptBackup(payload,passphrase);
const envelope=JSON.parse(encrypted);
envelope.ciphertext=(envelope.ciphertext.startsWith('00')?'01':'00')+envelope.ciphertext.slice(2);
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,encrypted,{mode:0o600});
writeFileSync(output.replace(/\.mibak$/,'-tampered.mibak'),JSON.stringify(envelope,null,2)+'\n',{mode:0o600});
console.log('Created encrypted synthetic E2E backup fixtures.');
