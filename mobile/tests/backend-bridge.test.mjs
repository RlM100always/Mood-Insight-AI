import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/ui/BackendLab.tsx',import.meta.url),'utf8');
test('backend bridge is opt-in with numerical-only upload',()=>{
  assert.ok(ui.includes('setSharing(false)'));
  assert.ok(ui.includes('https:\\/\\/'));
  assert.ok(ui.includes("note:''"));
  assert.ok(!ui.includes('note:latest.note'));
  assert.ok(ui.includes('Privacy')===false);
});
