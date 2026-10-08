import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { DEFAULT_RECIPE } from '../src/engine.js';
const base=process.env.BURGER_URL||'http://127.0.0.1:5193';
let cookie='';
async function post(path,payload){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify(payload)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const j=await r.json();if(!r.ok)throw new Error(`${r.status} ${j.error}`);return j;}
if(!process.env.TYPESAFE_API_KEY)throw new Error('Set TYPESAFE_API_KEY for this test only. The server never reads it.');
await post('/api/key',{key:process.env.TYPESAFE_API_KEY});
const report={at:new Date().toISOString(),cases:[]};
async function play(name,payload,expected,rush=false){
  let game=await post('/api/shop',{});
  game=await post(rush?'/api/rush':'/api/order',{id:game.id,version:game.version,...payload});
  if(expected)assert.deepEqual(game.shop.orders[0].recipe,expected,`${name} 点单识别不符合预期`);
  console.log(`\n${name} · ${game.id}`);
  const models=new Set();const latency=[];
  while(game.shop.orders.length&&game.shop.steps<140){
    const previous=game;game=await post('/api/step',{id:game.id,version:game.version});
    assert.equal(game.version,previous.version+1);
    models.add(game.record.model);latency.push(game.record.latencyMs);
    console.log(`${game.shop.steps}. ${game.record.effect} (${game.record.latencyMs} ms)`);
    if(game.shop.steps===1){const stale=await fetch(base+'/api/step',{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify({id:game.id,version:previous.version})});assert.equal(stale.status,409);}
  }
  const result={name,id:game.id,steps:game.shop.steps,served:game.shop.served.map(o=>({id:o.id,correct:o.correct,score:o.score,issues:o.issues})),remaining:game.shop.orders.length,waste:game.shop.stats.waste,models:[...models],averageLatencyMs:Math.round(latency.reduce((a,b)=>a+b,0)/latency.length)};
  report.cases.push(result);await writeFile(new URL('../logs/model-test.json',import.meta.url),JSON.stringify(report,null,2));
  assert.equal(game.shop.orders.length,0,`${name} 未完成`);assert.ok(game.shop.served.every(o=>o.correct),`${name} 存在出餐错误`);
  console.log(JSON.stringify(result));
}
await play('中文点单：双层牛肉加倍芝士配薯条',{text:'我要双层牛肉汉堡，多加芝士，不要洋葱，配薯条。'},{...DEFAULT_RECIPE,patties:2,cheese:2,fries:true});
await play('中文点单：鸡肉去芝士番茄，加酸黄瓜蛋黄酱',{text:'鸡肉汉堡，不要芝士和番茄，加酸黄瓜和蛋黄酱。'},{...DEFAULT_RECIPE,protein:'chicken',cheese:0,tomato:0,pickle:1,sauce:'mayo'});
await play('三种口味午餐高峰',{},null,true);
console.log('\n全部真实 Jev 测试通过。');
