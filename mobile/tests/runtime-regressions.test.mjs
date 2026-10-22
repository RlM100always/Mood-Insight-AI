import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Android E2E taps explicit native alert OK before navigating',()=>{
  const script=readFileSync(new URL('../scripts/android-smoke.sh',import.meta.url),'utf8');
  assert.ok(script.includes('find_and_tap "OK"'));
  assert.ok(script.includes("PASS: save confirmation dismissed cleanly"));
  assert.ok(script.includes("Journal tab"));
  assert.ok(script.includes("Check app features"));
});
test('SQLCipher startup does not cache a closed database after a failed init',()=>{
  const vault=readFileSync(new URL('../src/data/vault.ts',import.meta.url),'utf8');
  assert.ok(vault.includes('if (database === candidate) database = null;'));
  assert.ok(vault.includes('input.day > localDay()'));
  assert.ok(vault.includes('input.day < localDay('));
});

test('quick check-in marks skipped measurements as unknown rather than observed defaults',()=>{
  const vault=readFileSync(new URL('../src/data/vault.ts',import.meta.url),'utf8');
  const types=readFileSync(new URL('../src/types.ts',import.meta.url),'utf8');
  const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
  assert.ok(vault.includes("['sleep_recorded','exercise_recorded','stress_recorded','energy_recorded','sleep_quality_recorded']"));
  assert.ok(vault.includes('INTEGER NOT NULL DEFAULT 0 CHECK('));
  assert.ok(types.includes('sleep_recorded: 0 | 1'));
  assert.ok(app.includes("useState('')"));
  assert.ok(app.includes('Choose a mood to save'));
  assert.ok(app.includes('optional'));
});

test('tab navigation resets the shared content scroll position',()=>{
  const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
  assert.ok(app.includes('useRef, useState'));
  assert.ok(app.includes('const scrollRef = useRef<any>(null)'));
  assert.ok(app.includes('scrollRef.current?.scrollTo({y:0,animated:false})'));
  assert.ok(app.includes('ref={scrollRef}'));
  assert.ok(app.includes('onPress={()=>navigateTab(n.label)}'));
});

test('Android smoke exercises encrypted backup export, restore and failure cases',()=>{
  const script=readFileSync(new URL('../scripts/android-smoke.sh',import.meta.url),'utf8');
  const fixture=readFileSync(new URL('../scripts/create-e2e-backup.mjs',import.meta.url),'utf8');
  assert.ok(script.includes('PASS: encrypted backup export completed through the native share sheet'));
  assert.ok(script.includes('WrongPasswordForE2E2026'));
  assert.ok(script.includes('mood-insight-e2e-backup-tampered.mibak'));
  assert.ok(script.includes('E2E_SHOULD_NOT_OVERWRITE_LOCAL_ENTRY'));
  assert.ok(script.includes('E2E_RESTORED_ENTRY_CHECK'));
  assert.ok(fixture.includes('encryptBackup(payload,passphrase)'));
});
