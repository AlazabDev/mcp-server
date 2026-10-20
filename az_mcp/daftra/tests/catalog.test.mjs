import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ops=JSON.parse(readFileSync(new URL('../catalog.json',import.meta.url)));
test('301 operations with unique IDs and unique method+path',()=>{
 assert.equal(ops.length,301);
 assert.equal(new Set(ops.map(x=>x.id)).size,301);
 assert.equal(new Set(ops.map(x=>x.m+' '+x.p)).size,301);
});
test('every operation maps to a module',()=>{
 for(const op of ops){assert.ok(op.module);assert.ok(op.id);assert.ok(op.m);assert.ok(op.p);}
});
test('invoice by id',()=>{assert.equal(ops.find(x=>x.id==='get_invoices_id_format')?.p,'/invoices/{id}{format}')});
