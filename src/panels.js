import { INGREDIENTS, getActions, orderProgress } from './engine.js';

const money=v=>`¥${Number(v).toFixed(v%1?2:0)}`;
const percent=v=>`${Math.round(Number(v||0)*100)}%`;

export function ticketsHTML(shop, sticker, esc) {
  const orders=[...shop.orders,...shop.served.toReversed().slice(0,6)];
  if(!orders.length)return `<div class="no-tickets">${sticker(13)}<div><h3>店门开啦，第一位客人就是你。</h3><p>在上方点一份汉堡，或点击「午餐高峰」。</p></div><span>客人的要求会写在小票上，<br>制作进度也能在这里看到。</span></div>`;
  return orders.map(o=>{
    const served=shop.served.some(s=>s.id===o.id), active=shop.active===o.id;
    const progress=orderProgress(o), meat=o.layers.filter(k=>k===o.recipe.protein).length>=o.recipe.patties;
    const assembled=!Object.keys(progress.stillMissing).some(k=>k!=='上层面包');
    const sides=!progress.sideDishesStillMissing.length;
    const stages=[{name:'煎肉',done:meat},{name:'组装',done:assembled},{name:'配餐',done:sides},{name:'出餐',done:served}];
    const next=stages.findIndex(s=>!s.done);
    const status=served?`${o.stars} 星 · 已出餐`:o.closed?'待出餐':active?'正在制作':'排队中';
    const tags=[o.recipe.patties===2?'双层':'单层',o.recipe.cheese===0?'不要芝士':o.recipe.cheese===2?'双份芝士':'芝士',o.recipe.sauce==='none'?'不加酱':o.recipe.sauce==='mayo'?'蛋黄酱':'番茄酱',o.recipe.fries?'+ 薯条':'',o.recipe.drink?'+ 可乐':''].filter(Boolean);
    return `<button class="ticket ${active?'ticket-active':''} ${served?'ticket-served':''}" data-ticket="${o.id}" aria-label="查看 ${o.id} ${o.customer}的订单"><div class="ticket-head">${sticker(o.customer==='阿蓝'?14:13,'customer-face')}<div><b>${esc(o.customer)}</b><span>${o.id} · ${money(o.price)}</span></div><i class="ticket-status">${status}</i></div><p class="ticket-request" title="${esc(o.text)}">${esc(o.text)}</p><div class="ticket-tags">${tags.map(t=>`<span class="${t.startsWith('不要')||t==='不加酱'?'no-tag':''}">${t}</span>`).join('')}</div><div class="ticket-pips">${stages.map((s,i)=>`<span class="${s.done?'done':i===next?'now':''}">${s.done?'✓ ':''}${s.name}</span>`).join('')}</div></button>`;
  }).join('');
}

export function renderPanels({shop,records,ready,automatic,busy,sticker,esc}) {
  const el=id=>document.getElementById(id);
  const record=records.findLast(r=>r.type==='action');
  const answer=record?.response?.answers?.next_action;
  const p=answer?.probabilities||{};
  el('decision-label').textContent=record?record.action.label:busy?'正在处理…':'等你的第一份点单';
  el('decision-prob').textContent=answer?percent(p[answer.choice]):'—';
  el('decision-fill').style.width=answer?percent(p[answer.choice]):'0%';
  const criteria=record?.request?.questions?.next_action?.criteria||{};
  const others=Object.entries(p).filter(([id])=>id!==answer?.choice).sort((a,b)=>b[1]-a[1]).slice(0,3);
  el('decision-alternatives').innerHTML=others.length?others.map(([id,v])=>`<div class="alternative"><span title="${esc(criteria[id]||id)}">${esc((criteria[id]||id).split('。')[0])}</span><b>${percent(v)}</b></div>`).join(''):'<p class="decision-empty">Jev 会观察小票、火候和已放配料，<br>再从当前可做的动作里选一个。</p>';
  el('decision-meta').textContent=record?`第 ${record.step} 步 · ${record.latencyMs} 毫秒 · ${automatic?'Jev 掌勺':'已暂停，可手动操作'}`:'每次厨房决策都会真实调用官方 Jev';
  const actions=records.map((r,i)=>({r,i})).filter(({r})=>r.type==='action'||r.type==='manual').toReversed().slice(0,40);
  el('recent-actions').innerHTML=actions.length?actions.map(({r,i})=>`<button class="history-row" data-record="${i}" title="查看这一步的完整记录"><span>${String(r.step).padStart(2,'0')}</span><div>${esc(r.action.label)}</div><b>${r.type==='manual'?'你操作':percent(r.response?.answers?.next_action?.probabilities?.[r.action.id])}</b></button>`).join(''):'<p class="history-empty">厨房还没开始忙。<br>点单后，每一步都会留在这里。</p>';
  el('stock-list').innerHTML=Object.entries(shop.inventory).map(([key,count])=>`<div class="stock-row">${sticker(INGREDIENTS[key].sprite,key)}<div><p>${INGREDIENTS[key].name}<b>${count} / 40</b></p><div class="stock-track"><i style="width:${Math.max(0,Math.min(100,count/40*100))}%"></i></div></div></div>`).join('');
  const canManual=ready&&!automatic&&!busy;
  const protein=shop.orders.find(o=>o.id===shop.active)?.recipe.protein||'beef';
  const meatBtn=document.querySelector('.ingredient-strip button[data-protein]');
  if(meatBtn){meatBtn.dataset.manual='add_'+protein;meatBtn.title='加入熟'+INGREDIENTS[protein].name;meatBtn.setAttribute('aria-label',meatBtn.title);meatBtn.querySelector('.sticker').className='sticker '+protein;meatBtn.querySelector('span:last-child').textContent=INGREDIENTS[protein].name.replace('饼','');}
  const legal=getActions(shop), ids=new Set(legal.map(a=>a.id));
  for(const btn of document.querySelectorAll('[data-manual]'))btn.disabled=!canManual||!ids.has(btn.dataset.manual);
  const manualHTML=station=>{
    if(!canManual)return '<span>暂停后可手动操作</span>';
    const options=legal.filter(a=>a.station===station);
    return options.length?options.map(a=>`<button data-manual="${a.id}" title="${esc(a.description)}">${esc(a.kind==='grill'?a.label.replace('煎台放',' · ').replace('饼',''):a.label)}</button>`).join(''):'<span>先选择下方的一份订单</span>';
  };
  el('grill-actions').innerHTML=manualHTML('grill');
  el('side-actions').innerHTML=manualHTML('sides');
  el('interaction-hint').textContent=automatic?'Jev 正在掌勺 · 暂停后可以点击食材，自己接手厨房':busy?'等当前这一步做完，就可以接手':'你已接手 · 点击小票选单、煎台放肉、配料组装，也可让 Jev 做一步';
}
