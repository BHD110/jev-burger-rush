import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShop,addOrder,DEFAULT_RECIPE,getActions,applyAction,gradeOrder,validateRecipe,orderProgress } from '../src/engine.js';
const step=(s,id)=>applyAction(s,id).shop;
function queued(recipe=DEFAULT_RECIPE){return addOrder(createShop(),recipe).shop;}
function cooked(){let s=queued();for(const id of ['select_T01','grill_0_beef','add_bottom','wait','flip_0','wait','take_0'])s=step(s,id);return s;}
test('生肉不能取出；需要翻面才能熟，达到烧焦时只能清理',()=>{
  let s=queued();s=step(s,'grill_0_beef');assert.throws(()=>step(s,'take_0'));assert.throws(()=>step(s,'flip_0'));
  s=step(s,'wait');s=step(s,'wait');s=step(s,'flip_0');s=step(s,'wait');assert.ok(getActions(s).some(a=>a.id==='take_0'));
  s=step(s,'wait');s=step(s,'wait');s=step(s,'wait');assert.equal(s.grill[0].elapsed,7);assert.throws(()=>step(s,'take_0'));
  s=step(s,'discard_0');assert.equal(s.grill[0],null);assert.equal(s.stats.waste,1);
});
test('封口后不能再加配料；评分独立检查缺料、多料与配餐',()=>{
  let s=cooked();for(const id of ['add_beef','add_cheese','add_lettuce','add_tomato','add_ketchup','add_top'])s=step(s,id);
  assert.throws(()=>step(s,'add_onion'));const r=applyAction(s,'serve');assert.equal(r.receipt.score,100);assert.equal(r.receipt.correct,true);assert.equal(r.shop.stats.revenue,14);assert.equal(r.shop.orders.length,0);
  const o=queued({...DEFAULT_RECIPE,fries:true}).orders[0];o.layers=['bottom','beef','cheese','lettuce','tomato','ketchup','onion','top'];o.closed=true;
  const grade=gradeOrder(createShop(),o);assert.equal(grade.correct,false);assert.ok(grade.issues.includes('多了1份洋葱'));assert.ok(grade.issues.includes('缺少薯条'));assert.equal(grade.tip,0);
});
test('双层肉饼、加倍芝士和不要酱要准确核对',()=>{
  const s=queued({...DEFAULT_RECIPE,patties:2,cheese:2,sauce:'none',onion:0});const o=s.orders[0];
  o.layers=['bottom','beef','beef','cheese','cheese','lettuce','tomato','top'];assert.equal(gradeOrder(s,o).correct,true);
  o.layers.push('mayo');assert.equal(gradeOrder(s,o).correct,false);
});
test('精确缺料信息包括双份配料与多余配餐，多放的配餐可以移除',()=>{
  let s=queued({...DEFAULT_RECIPE,cheese:2});s=step(s,'select_T01');s=step(s,'pour_drink');
  const o=s.orders[0];o.layers=['bottom','beef','cheese','lettuce','tomato','ketchup','top'];o.closed=true;
  const p=orderProgress(o);assert.deepEqual(p.stillMissing,{'芝士':1});assert.deepEqual(p.extraSideDishes,['可乐']);assert.equal(p.completelyReadyToServe,false);
  o.layers.splice(3,0,'cheese');s=step(s,'remove_drink');assert.equal(orderProgress(s.orders[0]).completelyReadyToServe,true);assert.equal(s.stats.waste,1);
});
test('多个订单组装盘独立；炸薯条归属启动它的订单',()=>{
  let s=queued({...DEFAULT_RECIPE,fries:true});s=addOrder(s,{...DEFAULT_RECIPE,protein:'chicken'}).shop;
  for(const id of ['select_T01','add_bottom','start_fries','select_T02','add_bottom','take_fries'])s=step(s,id);
  assert.equal(s.orders[0].fries,true);assert.equal(s.orders[1].fries,false);assert.deepEqual(s.orders[0].layers,['bottom']);assert.deepEqual(s.orders[1].layers,['bottom']);assert.equal(s.fryer,null);
});
test('非法动作不污染状态；订单与库存有界；多余选项保留给模型判断',()=>{
  const s=queued();const before=structuredClone(s);assert.throws(()=>step(s,'add_beef'));assert.deepEqual(s,before);
  assert.throws(()=>validateRecipe({...DEFAULT_RECIPE,protein:'fish'}));assert.throws(()=>validateRecipe({...DEFAULT_RECIPE,cheese:100}));
  let full=createShop();for(let i=0;i<6;i++)full=addOrder(full,DEFAULT_RECIPE).shop;assert.throws(()=>addOrder(full,DEFAULT_RECIPE));
  let current=step(s,'select_T01');current=step(current,'add_bottom');assert.ok(getActions(current).some(a=>a.id==='add_onion'));assert.ok(getActions(current).some(a=>a.id==='pour_drink'));
});
