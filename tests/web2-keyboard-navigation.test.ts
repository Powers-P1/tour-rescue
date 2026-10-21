import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRovingIndex } from '../web2/src/keyboard-navigation.ts';

test('horizontal tabs use Left/Right, Home/End and wrap without vertical arrows',()=>{
 assert.equal(nextRovingIndex('ArrowRight',1,2,'tablist'),0);
 assert.equal(nextRovingIndex('ArrowLeft',0,2,'tablist'),1);
 assert.equal(nextRovingIndex('Home',1,2,'tablist'),0);
 assert.equal(nextRovingIndex('End',0,2,'tablist'),1);
 assert.equal(nextRovingIndex('ArrowDown',0,2,'tablist'),null);
});
test('radios use four arrows with wrap and never leave their group',()=>{
 assert.equal(nextRovingIndex('ArrowDown',2,3,'radiogroup'),0);
 assert.equal(nextRovingIndex('ArrowUp',0,3,'radiogroup'),2);
 assert.equal(nextRovingIndex('ArrowRight',0,3,'radiogroup'),1);
 assert.equal(nextRovingIndex('ArrowLeft',0,3,'radiogroup'),2);
 assert.equal(nextRovingIndex('Enter',0,3,'radiogroup'),null);
 assert.equal(nextRovingIndex('ArrowDown',-1,3,'radiogroup'),null);
});
