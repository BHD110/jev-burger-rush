import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.BURGER_URL||'http://127.0.0.1:5193';
let cookie='';
async function call(path,data){const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify(data)});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return{status:res.status,data:await res.json()};}
if(!process.env.TYPESAFE_API_KEY)throw new Error('Set TYPESAFE_API_KEY for this test only.');
await call('/api/key',{key:process.env.TYPESAFE_API_KEY});
const created=await call('/api/shop',{});let s=created.data;
const rejected=await call('/api/order',{id:s.id,version:s.version,text:'我要一份披萨和一杯咖啡。'});
assert.equal(rejected.status,422);assert.equal(rejected.data.shop.orders.length,0);assert.equal(rejected.data.record.type,'rejected_order');
const ordered=await call('/api/order',{id:s.id,version:s.version,text:'两个单层素肉汉堡，不要芝士，不要酱，不要番茄。'});
assert.equal(ordered.status,200);s=ordered.data;assert.equal(s.shop.orders.length,2);
for(const order of s.shop.orders){assert.equal(order.recipe.protein,'veggie');assert.equal(order.recipe.patties,1);assert.equal(order.recipe.cheese,0);assert.equal(order.recipe.sauce,'none');assert.equal(order.recipe.tomato,0);}
const results=await Promise.all([call('/api/step',{id:s.id,version:s.version}),call('/api/step',{id:s.id,version:s.version})]);
assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
const live=await(await fetch(base+'/api/shop/'+s.id,{headers:{'Cookie':cookie}})).json();assert.equal(live.shop.steps,1);
const report={at:new Date().toISOString(),id:s.id,unsupportedOrderRejected:true,quantityTwoRecognized:true,negativeIngredientsRecognized:true,concurrentStepProtected:true};
await writeFile(new URL('../logs/edge-test.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
