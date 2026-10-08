import assert from 'node:assert/strict';
import { DEFAULT_RECIPE } from '../src/engine.js';

const base=process.env.BURGER_TEST_URL||'http://127.0.0.1:5193';
let cookie='';
async function request(path,data){
  const response=await fetch(base+path,{method:data?'POST':'GET',headers:{'Cookie':cookie,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return {status:response.status,data:await response.json()};
}
let {data:session}=await request('/api/shop',{});
let result=await request('/api/order',{id:session.id,version:session.version,recipe:DEFAULT_RECIPE});
assert.equal(result.status,200);session=result.data;
const before=structuredClone(session);
result=await request('/api/action',{id:session.id,version:session.version,action:'add_beef'});
assert.equal(result.status,400);
const unchanged=(await request('/api/shop/'+session.id)).data;
assert.equal(unchanged.version,before.version);assert.deepEqual(unchanged.shop,before.shop);

const plan=['select_T01','grill_0_beef','add_bottom','add_cheese','flip_0','add_lettuce','take_0','add_beef','add_tomato','add_ketchup','add_top','serve'];
for(const action of plan){
  const oldVersion=session.version;
  result=await request('/api/action',{id:session.id,version:oldVersion,action});
  assert.equal(result.status,200,action+': '+result.data.error);
  session=result.data;
  assert.equal(session.record.type,'manual');assert.equal(session.record.model,undefined);assert.equal(session.record.request,undefined);
  const stale=await request('/api/action',{id:session.id,version:oldVersion,action});
  assert.equal(stale.status,409);
}
assert.equal(session.shop.served.length,1);assert.equal(session.shop.served[0].score,100);
assert.equal(session.shop.steps,plan.length);assert.equal(session.shop.stats.waste,0);
console.log('手动 API 验证通过：非法操作不修改状态，旧版本返回 409，12 步正确出餐；手动记录未冒充模型返回。');
