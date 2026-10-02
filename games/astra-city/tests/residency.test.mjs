import test from 'node:test';
import assert from 'node:assert/strict';
import {selectResidentCells} from '../src/world/residency.js';

const cells=[];
for(let z=-2;z<=1;z++)for(let x=-2;x<=1;x++)cells.push({id:`${x},${z}`,x,z,bounds:[x*48,z*48,(x+1)*48,(z+1)*48]});

test('resident cells stay bounded to a 3x3 neighborhood',()=>{
  const ids=selectResidentCells(cells,[-20,0,-20],1);
  assert.equal(ids.size,9);
  assert(ids.has('-1,-1'));
  assert(!ids.has('1,1'));
});

test('resident cells shrink naturally at the district edge',()=>{
  const ids=selectResidentCells(cells,[-80,0,-60],1);
  assert.equal(ids.size,4);
  assert(ids.has('-2,-2'));
});

test('out-of-bounds positions choose the nearest district cell',()=>{
  const ids=selectResidentCells(cells,[500,0,500],0);
  assert.deepEqual([...ids],['1,1']);
});
