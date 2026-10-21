import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const au=JSON.parse(readFileSync(new URL('../src/data/australian_nsmhw.json',import.meta.url),'utf8'));
test('Australian reference is source-attributed real aggregate data',()=>{
  assert.match(au.source_url,/^https:\/\/www\.abs\.gov\.au/);
  assert.equal(au.age_groups.length,7);
  assert.equal(au.disorder_groups.length,4);
  assert.equal(au.age_groups[0].persons,38.8);
  assert.equal(au.age_groups[1].persons,26.3);
  assert.ok(au.age_groups.every(x=>x.female>=0&&x.female<=100&&x.male>=0&&x.male<=100));
  assert.ok(au.unsuitable_for.includes('training individual daily mood model'));
  assert.equal(au.data_type.includes('aggregate'),true);
});
