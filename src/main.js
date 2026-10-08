import './style.css';
import './game.css';
import { updateGame } from './game-kitchen.js';
import { workspace } from './workspace.js';
import { ticketsHTML, renderPanels } from './panels.js';
import { INGREDIENTS,TOPPINGS,DEFAULT_RECIPE,recipeText,getActions,createShop,orderProgress,price } from './engine.js';
const esc=(value)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sticker(index,classes='',label=''){const x=index%4,y=Math.floor(index/4);return `<span class="sticker ${classes}" style="--sx:${x*100/3}%;--sy:${y*100/3}%"${label?` role="img" aria-label="${esc(label)}"`:''}></span>`;}
document.querySelector('#app').innerHTML=workspace(sticker)+`
<dialog id="menu-dialog"><div class="dialog-title"><div><span class="small-kicker">想吃什么，自己搭。</span><h2>自选汉堡菜单</h2></div><button class="close" data-close="menu-dialog" aria-label="关闭菜单">✕</button></div><form id="menu-form"><div class="menu-proteins"><label>${sticker(2)}<input type="radio" name="protein" value="beef" checked> 牛肉</label><label>${sticker(2,'chicken')}<input type="radio" name="protein" value="chicken"> 鸡肉</label><label>${sticker(2,'veggie')}<input type="radio" name="protein" value="veggie"> 素肉</label></div><div class="menu-row"><label>肉饼层数<select name="patties"><option value="1">单层</option><option value="2">双层</option></select></label><label>芝士<select name="cheese"><option value="0">不要芝士</option><option value="1" selected>一份芝士</option><option value="2">加倍芝士</option></select></label><label>酱料<select name="sauce"><option value="ketchup">番茄酱</option><option value="mayo">蛋黄酱</option><option value="none">不加酱</option></select></label></div><div class="topping-menu">${TOPPINGS.filter(k=>k!=='cheese').map(k=>`<label>${sticker(INGREDIENTS[k].sprite)}<input type="checkbox" name="${k}"${DEFAULT_RECIPE[k]?' checked':''}>${INGREDIENTS[k].name}</label>`).join('')}</div><div class="menu-row side-menu"><label>${sticker(10)}<input type="checkbox" name="fries">配薯条</label><label>${sticker(11)}<input type="checkbox" name="drink">配可乐</label><label>来几份<select name="quantity"><option value="1">1 份</option><option value="2">2 份</option><option value="3">3 份</option></select></label></div><div id="menu-summary" class="menu-summary"></div><button class="red-btn menu-submit" type="submit">就按这个做，下单 →</button></form></dialog>
<dialog id="trace-dialog"><div class="dialog-title"><div><span class="small-kicker">看看 Jev 到底收到了什么</span><h2>每一步的真实输入与输出</h2></div><button class="close" data-close="trace-dialog" aria-label="关闭决策记录">✕</button></div><p class="trace-help">中文点单会并行识别肉类、层数、配料和配餐；厨房每一步会再选择一个动作。以下是实际接口记录。动作说明由游戏规则提供，Jev 不生成文字推理。概率分布也不代表出餐正确率。</p><select id="trace-select" aria-label="选择决策记录"></select><div class="trace-columns"><section><h3>发给 Jev</h3><pre id="trace-request"></pre></section><section><h3>Jev 返回</h3><pre id="trace-response"></pre></section></div><div id="trace-candidates"></div></dialog>
<dialog id="ticket-dialog"><div class="dialog-title"><h2>这位客人的点单</h2><button class="close" data-close="ticket-dialog" aria-label="关闭小票">✕</button></div><div id="ticket-detail"></div></dialog>
<dialog id="key-dialog"><div class="dialog-title"><h2>连接你的 Jev</h2><button class="close" data-close="key-dialog" aria-label="关闭密钥设置">✕</button></div><p>输入你自己的 Jev API key，即可让它听单和掌勺。手动玩不需要 key。</p><form id="key-form"><label for="api-key">Jev API key</label><input id="api-key" type="password" required autocomplete="off" spellcheck="false" placeholder="粘贴你的 API key"><p class="panel-help">密钥只在服务器内存中临时保留，最长 2 小时；不会写入文件、决策记录或浏览器存储。用量由你的账户承担。</p><div class="key-actions"><button class="red-btn" id="connect-key" type="submit">连接 Jev</button><button class="outline" id="forget-key" type="button">清除密钥</button></div><p id="key-notice" role="status"></p></form></dialog>
`;
const $=(id)=>document.getElementById(id);
let session=null,shop=createShop(),records=[],ready=false,jevReady=false,automatic=false,ordering=false,stepPromise=null,runner=null,epoch=0,lastRecord=null,noticeTimer=null,paintedOrder=null,paintedLayers=[];
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const money=(v)=>`¥${Number(v).toFixed(v%1?2:0)}`;
const apiURL=path=>new URL(path.replace(/^\//,''),new URL(import.meta.env.BASE_URL,location.origin));
async function api(path,data){const res=await fetch(apiURL(path),data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const result=await res.json();if(!res.ok){if(res.status===401){jevReady=false;connectionLabel();}const error=new Error(result.error||'请求没有成功');error.status=res.status;error.data=result;throw error;}return result;}
function connectionLabel(){$('key-settings').textContent=jevReady?'Jev 已连接':'连接 Jev';$('connection-dot').classList.toggle('connected',jevReady);$('model-info').textContent=jevReady?'你的 Jev 已连接 · 可以掌勺':'手动厨房已就绪 · 连接 Jev 后可自动掌勺';}
function requireKey(){if(jevReady)return true;automatic=false;$('key-dialog').showModal();notice('先输入你自己的 key，才能让 Jev 听单或掌勺。',true);return false;}
function accept(result){session={id:result.id,version:result.version};shop=result.shop;if(result.record){records.push(result.record);lastRecord=result.record;}if(result.records){records=result.records;lastRecord=records.at(-1)||null;}sessionStorage.setItem('jev-burger-shop',session.id);}
function notice(message,error=false){clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;if(message&&!error)noticeTimer=setTimeout(()=>notice(''),5500);}
function controls(){
  $('submit-order').disabled=!ready||ordering;
  $('submit-order').textContent=ordering?'听单中…':'下单 →';
  $('rush').disabled=!ready||ordering||shop.orders.length>3;
  $('single').disabled=!ready||ordering||Boolean(stepPromise)||automatic||!shop.orders.length;
  $('auto').disabled=!ready||ordering;
  $('auto').textContent=automatic?'Ⅱ 我来玩':'▶ 交给 Jev';
  $('reset').disabled=ordering||Boolean(stepPromise);
  document.querySelector('.menu-submit').disabled=!ready||ordering;
  $('export').disabled=!records.length;
  $('auto').setAttribute('aria-pressed',String(!automatic));
  renderPanels({shop,records,ready,automatic,busy:ordering||Boolean(stepPromise),sticker,esc});
  updateGame(shop,lastRecord,automatic);
}
function grillHTML(slot,index){
  const state=!slot?'空煎台':slot.elapsed>=7?'煎焦了':slot.flipped&&slot.elapsed>=4?'熟了，快取出':!slot.flipped&&slot.elapsed>=2?'该翻面了':slot.flipped?'正在煎另一面':'正在煎第一面';
  return `<div class="grill-slot ${slot?'occupied':''} ${slot?.elapsed>=7?'burnt':''}"><span class="grill-tag">${index===0?'左':'右'}煎台</span><div class="hotplate">${slot?sticker(2,`grill-patty ${slot.protein} ${slot.elapsed<4?'raw':''}`,INGREDIENTS[slot.protein].name):'<span class="empty-plate">等一块肉饼</span>'}${slot&&slot.elapsed<7?'<i class="steam s1"></i><i class="steam s2"></i>':''}</div><div class="heat-line"><i style="width:${slot?Math.min(100,slot.elapsed/7*100):0}%"></i></div><span class="grill-state">${slot?INGREDIENTS[slot.protein].name+' · ':''}${state}</span></div>`;
}
function render(){
  $('revenue').textContent=money(shop.stats.revenue);$('served-count').textContent=`${shop.served.length} 份`;
  $('rating').textContent=shop.served.length?`${(shop.served.reduce((a,o)=>a+o.score,0)/shop.served.length/20).toFixed(1)} ★`:'—';
  $('queue-count').textContent=`${shop.orders.length} 份待做`;
  const time=9*60+Math.floor(shop.clock/60);$('clock').textContent=`${String(Math.floor(time/60)).padStart(2,'0')}:${String(time%60).padStart(2,'0')}`;
  $('grill').innerHTML=shop.grill.map(grillHTML).join('');
  $('cooked-count').textContent=`${shop.cooked.length} 块`;
  $('cooked-tray').innerHTML=shop.cooked.length?shop.cooked.map(p=>`<span class="cooked-piece">${sticker(2,p.protein)}<small>${INGREDIENTS[p.protein].name}</small></span>`).join(''):'<span class="tray-empty">熟肉放这里，组装时取用。</span>';
  const strip=$('tickets');const previousScroll=strip.scrollLeft;strip.innerHTML=ticketsHTML(shop,sticker,esc);strip.scrollLeft=previousScroll;
  const order=shop.orders.find(o=>o.id===shop.active);
  const displayOrder=order||shop.served.at(-1);
  $('assembly-ticket').textContent=order?`${order.id} · ${order.customer}`:displayOrder?`${displayOrder.id} · 已出餐`:'等一份新订单';
  $('target-recipe').textContent=displayOrder?recipeText(displayOrder.recipe):'看好小票，想吃的都要加上。';
  $('assembly-empty').hidden=Boolean(displayOrder?.layers.length);
  $('burger-layers').innerHTML=displayOrder?displayOrder.layers.map((ingredient,i)=>{
    const sprite=INGREDIENTS[ingredient].sprite;const layers=displayOrder.layers.length;const newLayer=paintedOrder===displayOrder.id&&i>=paintedLayers.length?' layer-new':'';
    const gap=Math.max(1,document.querySelector('.game-scene').clientWidth*.0025);
    if(['ketchup','mayo'].includes(ingredient))return `<span class="sauce-layer layer-${ingredient}${newLayer}" style="--layer:${i};--gap:${gap}px" role="img" aria-label="${INGREDIENTS[ingredient].name}"><i></i><i></i><i></i></span>`;
    return sticker(sprite,`burger-layer layer-${ingredient}${newLayer}`,INGREDIENTS[ingredient].name).replace('style="',`style="--layer:${i};--gap:${gap}px;--total:${layers};`);
  }).join(''):'';
  paintedOrder=displayOrder?.id||null;paintedLayers=displayOrder?.layers.slice()||[];
  $('assembly-progress').textContent=displayOrder?.layers.length?`${order?'':'上一份已完成 · '}${displayOrder.layers.map(k=>INGREDIENTS[k].name).join(' + ')}`:'空餐盘 · 等 Jev 开始组装';
  if(order){const p=orderProgress(order);const missing=[...Object.entries(p.stillMissing).map(([k,n])=>`${k}${n>1?' ×'+n:''}`),...p.sideDishesStillMissing];$('assembly-progress').textContent=missing.length?'还差：'+missing.join('、'):p.completelyReadyToServe?'配料和配餐都齐了，可以出餐':'配料已齐，请按小票检查后封口';}
  if(!order&&displayOrder)$('assembly-progress').textContent=`已出餐 · ${displayOrder.score} 分 · ${displayOrder.correct?'配料与小票一致':displayOrder.issues.join('、')}`;
  $('assembly-progress').title=$('assembly-progress').textContent;
  const fryer=shop.fryer;
  $('fries-area').innerHTML=`${sticker(10,displayOrder?.fries?'side-ready':'side-wait')}<b>薯条</b><span>${displayOrder?.fries?order?'已装盘':'已随餐送出':fryer?`${fryer.order} · ${fryer.elapsed>=2?'炸好了':'炸制中'}`:order?.recipe.fries?'这单要薯条':'这单没点'}</span>`;
  $('drink-area').innerHTML=`${sticker(11,displayOrder?.drink?'side-ready':'side-wait')}<b>可乐</b><span>${displayOrder?.drink?order?'已接好':'已随餐送出':order?.recipe.drink?'这单要可乐':'这单没点'}</span>`;
  const receipt=shop.served.at(-1);
  $('pickup').innerHTML=receipt?`<span class="served-stamp">${receipt.correct?'✓ 好评出餐':'出餐待改进'} · ${receipt.id}</span><strong>${'★'.repeat(receipt.stars)}${'☆'.repeat(5-receipt.stars)}</strong><p>${receipt.correct?'配料与点单一致，客人很开心。':esc(receipt.issues.join('，'))}</p>`:'<span>出餐铃还没响</span><p>做好一份，送出一份小快乐。</p>';
  $('expenses').textContent=money(shop.stats.expenses);$('tips').textContent=money(shop.stats.tips);$('waste').textContent=shop.stats.waste;
  $('steps').textContent=`第 ${shop.steps} 步`;
  $('receipts').innerHTML=shop.served.length?shop.served.toReversed().slice(0,12).map(o=>`<article class="receipt"><span class="receipt-number">${o.id}</span><div><h3>${esc(o.customer)} · ${o.recipe.patties===2?'双层':'单层'}${INGREDIENTS[o.recipe.protein].name.replace('饼','')}汉堡</h3><p>${o.correct?'按照小票做对啦！':esc(o.issues.join('，'))}</p></div><span class="receipt-stars">${'★'.repeat(o.stars)}${'☆'.repeat(5-o.stars)}</span><b>${money(o.price)}</b><small>小费 ${money(o.tip)}</small></article>`).join(''):'<p class="history-empty">第一份汉堡出餐后，就会有第一条好评。</p>';

  updateGame(shop,lastRecord,automatic);
  controls();
}
function speak(text,record){$('chef-line').textContent=text;if(record?.model)$('model-info').textContent=`官方 ${record.model} · ${record.latencyMs} ms`;$('connection-dot').classList.toggle('thinking',Boolean(stepPromise)||ordering);}
async function resync(){if(!session)return;try{accept(await api(`/api/shop/${session.id}`));render();}catch{}}
function performStep(){
  if(stepPromise||ordering||!ready||!shop.orders.length)return stepPromise||Promise.resolve();
  if(!requireKey())return Promise.resolve();
  const myEpoch=epoch;
  stepPromise=(async()=>{
    speak('看一眼小票，决定下一步…');controls();
    try{
      const result=await api('/api/step',{id:session.id,version:session.version});
      if(myEpoch!==epoch)return;
      accept(result);render();speak(result.record.action.label+'。',result.record);
      const station=document.querySelector(`[data-station="${result.record.action.station}"]`)||document.querySelector('.kitchen');station.classList.add('working');
      document.querySelector('.chef-portrait').classList.add('chef-working');
      await delay(650/Number($('speed').value));station.classList.remove('working');document.querySelector('.chef-portrait').classList.remove('chef-working');
      if(result.record.receipt)notice(result.record.receipt.correct?`${result.record.receipt.id} 出餐成功，配料全对！收获 ${result.record.receipt.stars} 星评价。`:`${result.record.receipt.id} 已出餐，但有配料问题：${result.record.receipt.issues.join('，')}`,!result.record.receipt.correct);
    }catch(error){automatic=false;notice(error.message,true);speak('这一步没做好，厨房先暂停。可以重试或查看记录。');await resync();}
    finally{stepPromise=null;controls();$('connection-dot').classList.remove('thinking');if(!automatic&&!ordering)speak('厨房已暂停，可以看小票或只做一步。',lastRecord);}
  })();
  controls();$('connection-dot').classList.add('thinking');
  return stepPromise;
}
function kick(){
  if(runner||ordering||!automatic||!ready||!shop.orders.length)return;
  const myEpoch=epoch;
  runner=(async()=>{
    let count=0;
    while(automatic&&!ordering&&myEpoch===epoch&&shop.orders.length&&count<150){await performStep();count++;if(automatic)await delay(380/Number($('speed').value));}
    if(count>=150){automatic=false;notice('这一轮做了 150 步，先暂停检查厨房。可以继续，或重新开店。',true);}
    if(!shop.orders.length&&myEpoch===epoch)speak('订单都做好啦！下一位客人，想吃点什么？',lastRecord);
  })().finally(()=>{runner=null;controls();if(automatic&&!ordering&&shop.orders.length)queueMicrotask(kick);});
}
async function submitOrder(payload,closeMenu=false){
  if(ordering||!ready)return;
  if(payload.text&&!requireKey())return;
  ordering=true;notice('');controls();
  try{
    if(stepPromise)await stepPromise;
    speak(payload.text?'正在听你的点单…':'收到自选菜单，我来做。');
    const result=await api('/api/order',{id:session.id,version:session.version,...payload});
    accept(result);render();
    notice(`收到 ${result.record.tickets.join('、')}：${recipeText(result.record.parsed.recipe)}。`);
    speak('收到你的单啦，照着小票现做！',result.record);
    if(closeMenu)$('menu-dialog').close();else $('order-text').value='';
  }catch(error){if(error.data?.record){accept(error.data);render();}notice(error.message,true);speak('这份点单需要改一下，看看菜单再告诉我。');if(error.status===409)await resync();}
  finally{ordering=false;controls();kick();}
}
$('order-form').addEventListener('submit',e=>{e.preventDefault();const text=$('order-text').value.trim();if(!text){notice('告诉 Jev 你想吃什么汉堡吧。',true);return;}submitOrder({text});});
$('order-text').addEventListener('input',()=>notice(''));
for(const btn of document.querySelectorAll('[data-example]'))btn.addEventListener('click',()=>{$('order-text').value=btn.dataset.example;$('order-text').focus();});
$('custom-button').addEventListener('click',()=>$('menu-dialog').showModal());
for(const btn of document.querySelectorAll('[data-close]'))btn.addEventListener('click',()=>$(btn.dataset.close).close());
$('menu-form').addEventListener('submit',e=>{
  e.preventDefault();const data=new FormData(e.currentTarget);
  const recipe={protein:data.get('protein'),patties:Number(data.get('patties')),cheese:Number(data.get('cheese')),sauce:data.get('sauce'),fries:data.has('fries'),drink:data.has('drink')};
  for(const key of TOPPINGS.filter(k=>k!=='cheese'))recipe[key]=data.has(key)?1:0;
  submitOrder({recipe,quantity:Number(data.get('quantity'))},true);
});
$('auto').addEventListener('click',()=>{if(!automatic&&!requireKey())return;automatic=!automatic;if(!automatic){speak(stepPromise?'做完手上这一步，就先休息。':'厨房已暂停。你可以观察或只做一步。');}controls();kick();});
$('single').addEventListener('click',()=>performStep());
$('rush').addEventListener('click',async()=>{
  if(ordering)return;ordering=true;notice('');controls();
  try{if(stepPromise)await stepPromise;const result=await api('/api/rush',{id:session.id,version:session.version});accept(result);render();notice('小橘、阿蓝、小芽进店啦，三份不同口味的订单已挂好。');speak('午餐高峰来啦，煎台和组装台一起忙起来！');}
  catch(error){notice(error.message,true);if(error.status===409)await resync();}finally{ordering=false;controls();kick();}
});
async function resetShop(){
  if(stepPromise||ordering)return;ordering=true;epoch++;automatic=false;controls();
  try{accept(await api('/api/shop',{}));records=[];lastRecord=null;render();notice('');speak('新的一天，点一份你想吃的吧！');}
  catch(error){notice(error.message,true);}finally{ordering=false;controls();}
}
$('reset').addEventListener('click',resetShop);
$('tickets').addEventListener('click',e=>{
  const btn=e.target.closest('[data-ticket]');if(!btn)return;const order=[...shop.orders,...shop.served].find(o=>o.id===btn.dataset.ticket);if(!order)return;
  if(!automatic&&!ordering&&!stepPromise&&shop.orders.some(o=>o.id===order.id)){if(shop.active!==order.id)manualAction(`select_${order.id}`);selectZone('assembly');return;}
  $('ticket-detail').innerHTML=`<p class="detail-request">“${esc(order.text)}”</p><p>${esc(recipeText(order.recipe))}</p><ul>${Object.entries(order.recipe).filter(([k])=>TOPPINGS.includes(k)).map(([k,v])=>`<li>${INGREDIENTS[k].name}<b>${v?`${v} 份`:'不要'}</b></li>`).join('')}</ul><p class="ticket-detail-note">这张小票是实际制作目标；Jev 自己选择接下来做哪一步。</p>`;if(shop.orders.some(o=>o.id===order.id)){const p=orderProgress(order);$('ticket-detail').innerHTML+=`<p class="panel-help">还差：${esc([...Object.entries(p.stillMissing).map(([k,v])=>k+' × '+v),...p.sideDishesStillMissing].join('、')||'食材已齐')}</p><div class="ticket-detail-actions"><button class="green-btn" data-manual="select_${order.id}" ${automatic||ordering||stepPromise||shop.active===order.id?'disabled':''}>切换到这份订单</button></div>`;}else{$('ticket-detail').innerHTML+=`<p class="panel-help">已出餐 · ${order.score} 分 · ${order.stars} 星 · ${esc(order.issues.join('、')||'配料与点单完全一致')}</p>`;}$('ticket-dialog').showModal();
});
function fillTrace(index){
  const record=records[Number(index)];
  $('trace-request').textContent=record?.request?JSON.stringify(record.request,null,2):record?JSON.stringify({type:record.type,parsed:record.parsed,action:record.action,before:record.before,note:record.type==='manual'?'这一步由你手动操作，没有调用 Jev。':'这次是菜单结构化点单，没有调用 Jev 做语义识别。'},null,2):'点单以后，这里会出现真实记录。';
  $('trace-response').textContent=record?.response?JSON.stringify(record.response,null,2):record?.type==='manual'?JSON.stringify({action:record.action,effect:record.effect,after:record.after},null,2):'尚无模型返回。';
  const answer=record?.response?.answers?.next_action;
  $('trace-candidates').innerHTML=answer?`<h3>这次的候选与选择</h3>${Object.entries(record.request.questions.next_action.criteria).map(([id,label])=>`<div class="trace-option ${id===answer.choice?'chosen':''}"><span>${id===answer.choice?'✓ ':''}${esc(label)}</span><b>${((answer.probabilities[id]||0)*100).toFixed(1)}%</b></div>`).join('')}`:'';
}
function openTrace(index=records.length-1){
  $('trace-select').innerHTML=records.map((r,i)=>`<option value="${i}">${r.type==='order'?`接单 ${r.tickets.join('、')}`:r.type==='rejected_order'?'这份点单未接收':r.type==='rush'?'午餐高峰接单':`第 ${r.step} 步 · ${r.type==='manual'?'你：':''}${esc(r.action.label)}`}</option>`).join('');
  $('trace-select').value=String(index);fillTrace(index);$('trace-dialog').showModal();
}
$('trace-button').addEventListener('click',()=>openTrace());
$('recent-actions').addEventListener('click',e=>{const btn=e.target.closest('[data-record]');if(btn)openTrace(Number(btn.dataset.record));});
$('trace-select').addEventListener('change',e=>fillTrace(e.target.value));
$('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({id:session.id,shop,records},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`jev-burger-${session.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
// Tabs and speed controls stay in place as the kitchen updates.
for(const btn of document.querySelectorAll('[data-panel]'))btn.addEventListener('click',()=>{
  for(const tab of document.querySelectorAll('[data-panel]')){
    const selected=tab===btn;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('panel-'+tab.dataset.panel).hidden=!selected;
  }
});
document.querySelector('.side-tabs').addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const tabs=[...document.querySelectorAll('[data-panel]')],index=tabs.indexOf(document.activeElement);
  const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].click();tabs[next].focus();
});
for(const btn of document.querySelectorAll('[data-speed]'))btn.addEventListener('click',()=>{
  $('speed').value=btn.dataset.speed;for(const item of document.querySelectorAll('[data-speed]')){item.classList.toggle('selected',item===btn);item.setAttribute('aria-pressed',String(item===btn));}
});
$('notice').addEventListener('click',()=>notice(''));
function menuRecipe(){
  const data=new FormData($('menu-form'));
  const recipe={protein:data.get('protein'),patties:Number(data.get('patties')),cheese:Number(data.get('cheese')),sauce:data.get('sauce'),fries:data.has('fries'),drink:data.has('drink')};
  for(const key of TOPPINGS.filter(k=>k!=='cheese'))recipe[key]=data.has(key)?1:0;
  return {recipe,quantity:Number(data.get('quantity'))};
}
function updateMenuSummary(){const {recipe,quantity}=menuRecipe();$('menu-summary').innerHTML=`<span>${esc(recipeText(recipe))}${quantity>1?' · '+quantity+' 份':''}</span><b>${money(price(recipe)*quantity)}</b>`;}
$('menu-form').addEventListener('change',updateMenuSummary);updateMenuSummary();
async function manualAction(action){
  if(automatic||ordering||stepPromise||!ready)return;
  if(!getActions(shop).some(a=>a.id===action)){notice('当前不能这样操作。请先看小票和厨房状态。',true);return;}
  const myEpoch=epoch;ordering=true;controls();notice('');
  try{
    const result=await api('/api/action',{id:session.id,version:session.version,action});if(myEpoch!==epoch)return;
    accept(result);render();speak('你：'+result.record.action.label+'。');
    if($('ticket-dialog').open)$('ticket-dialog').close();
    if(result.record.receipt)notice(`${result.record.receipt.id} 已出餐 · ${result.record.receipt.score} 分${result.record.receipt.issues.length?' · '+result.record.receipt.issues.join('、'):''}`,!result.record.receipt.correct);
  }catch(error){notice(error.message,true);if(error.status===409)await resync();}
  finally{ordering=false;controls();}
}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-manual]');if(btn&&!btn.disabled)manualAction(btn.dataset.manual);});
let resizeFrame;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(render);});
let openZone=null;
function selectZone(zone){
  openZone=zone;$('game-tray').hidden=!zone;
  const titles={grill:'煎台 · 放肉、翻面、取出',assembly:'备料台 · 按小票叠汉堡',sides:'配餐 · 薯条和可乐',pickup:'出餐口 · 按铃交给客人'};
  $('tray-title').textContent=titles[zone]||'操作厨房';
  $('grill-actions').hidden=zone!=='grill';document.querySelector('.ingredient-strip').hidden=zone!=='assembly';$('side-actions').hidden=zone!=='sides';$('serve-manual').hidden=zone!=='pickup';document.querySelector('.assembly-status').hidden=!['assembly','pickup'].includes(zone);
}
for(const btn of document.querySelectorAll('[data-zone]'))btn.addEventListener('click',()=>{
  if(automatic){automatic=false;speak(stepPromise?'等手上这一步做完，就轮到你。':'轮到你了，点设备开始操作。');controls();}
  selectZone(btn.dataset.zone);
});
$('close-tray').addEventListener('click',()=>selectZone(null));
$('auto').addEventListener('click',()=>{if(automatic)selectZone(null);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')selectZone(null);});
$('toggle-insights').addEventListener('click',()=>{const open=$('app').classList.toggle('insights-open');$('toggle-insights').setAttribute('aria-expanded',String(open));});
function toggleFocus(){ $('app').classList.toggle('game-focus');requestAnimationFrame(render); }
$('game-fullscreen').addEventListener('click',toggleFocus);
const exitFocus=document.createElement('button');exitFocus.id='exit-focus';exitFocus.textContent='退出专注';exitFocus.addEventListener('click',toggleFocus);document.querySelector('.kitchen-controls').append(exitFocus);
$('key-settings').addEventListener('click',()=>{$('key-notice').textContent='';$('key-dialog').showModal();});
$('key-dialog').addEventListener('close',()=>{$('api-key').value='';});
$('key-form').addEventListener('submit',async e=>{
  e.preventDefault();$('connect-key').disabled=true;$('key-notice').textContent='正在连接…';
  try{await api('/api/key',{key:$('api-key').value.trim()});jevReady=true;connectionLabel();$('key-dialog').close();notice('你的 key 已连接，可以把厨房交给 Jev。');}
  catch(error){$('key-notice').textContent=error.message;}
  finally{$('api-key').value='';$('connect-key').disabled=false;controls();}
});
$('forget-key').addEventListener('click',async()=>{
  automatic=false;
  try{if(stepPromise)await stepPromise;const res=await fetch(apiURL('/api/key'),{method:'DELETE'});if(!res.ok)throw new Error('清除失败，请重试。');jevReady=false;connectionLabel();$('key-dialog').close();notice('密钥已清除。你仍然可以手动操作厨房。');}
  catch(error){$('key-notice').textContent=error.message;}finally{controls();}
});
render();
try{
  const health=await api('/api/health');ready=health.ok;jevReady=health.configured;connectionLabel();
  const saved=sessionStorage.getItem('jev-burger-shop');let restored=false;
  if(saved)try{accept(await api(`/api/shop/${saved}`));restored=true;}catch{}
  if(!restored)accept(await api('/api/shop',{}));
  render();if(restored){const lastModel=records.findLast(r=>r.model);if(lastModel)$('model-info').textContent=`官方 ${lastModel.model} · ${lastModel.latencyMs} ms`;automatic=false;speak(shop.orders.length?'厨房进度已保留，点「交给 Jev」继续。':'欢迎回来，今天想吃点什么？',lastRecord);controls();}
}catch(error){notice(error.message,true);speak('厨房服务还没连上，请检查本地服务。');}
