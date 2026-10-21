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
