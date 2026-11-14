import test from 'node:test';
import assert from 'node:assert/strict';
import { keywords, pointId } from '../src/data/qdrant.ts';
test('Sparse search uses identical Unicode normalization for query and index', () => {
  assert.deepEqual(keywords('Điện thoại'), keywords('dien thoai'));
  assert.deepEqual(keywords('Lenovo 16GB'), keywords('LENOVO 16gb'));
  assert.equal(keywords('!?').indices.length,0);
  const repeated = keywords('ram ram');
  assert.equal(repeated.indices.length,1);
  assert.ok(repeated.values[0]! > 1);
});
test('Qdrant IDs are deterministic UUIDs and source identity is preserved', () => {
  assert.match(pointId('variant:cellphones:01'),/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(pointId('variant:cellphones:01'),pointId('variant:fptshop:01'));
});
