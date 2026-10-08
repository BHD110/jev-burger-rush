import { INGREDIENTS } from './engine.js';

export function gameKitchen(sticker) {
  return `<div class="kitchen-floor game-floor">
    <div id="notice" role="status" hidden></div>
    <div class="game-scene" aria-label="可以操作的汉堡店厨房">
      <img class="room-art" src="${import.meta.env.BASE_URL}assets/kitchen-room.webp" alt="暖色汉堡店厨房，煎台、备料台、炸篮和出餐口连在同一个房间里">
      <div class="room-light" aria-hidden="true"></div>
      <button class="scene-hotspot hotspot-grill" data-zone="grill" aria-label="操作煎台"><span>煎台</span><i>点击放肉 / 翻面</i></button>
      <button class="scene-hotspot hotspot-prep" data-zone="assembly" aria-label="操作备料台"><span>备料台</span><i>点击添加配料</i></button>
      <button class="scene-hotspot hotspot-fries" data-zone="sides" aria-label="操作炸篮和饮料机"><span>配餐</span><i>点击炸薯条 / 接可乐</i></button>
      <button class="scene-hotspot hotspot-pass" data-zone="pickup" aria-label="操作出餐口"><span>出餐口</span><i>做好了，按铃出餐</i></button>
      <div class="scene-grill" data-station="grill"><div id="grill" class="grill"></div><div class="cooked-title sr-only">熟肉盘 <span id="cooked-count">0 块</span></div><div id="cooked-tray"></div></div>
      <div class="scene-prep" data-station="assembly"><span id="assembly-ticket" class="scene-ticket">等一份新订单</span><div id="burger-stage"><div class="plate"></div><div id="burger-layers"></div><div id="assembly-empty"><span>空餐盘</span></div></div></div>
      <div class="scene-sides" data-station="sides"><div class="side-items"><div id="fries-area"></div><div id="drink-area"></div></div></div>
      <div class="scene-pickup" data-station="pickup"><div id="pickup"></div></div>
      <div class="game-chef chef-portrait" id="game-chef">${sticker(15,'chef-face','机器人主厨')}<span class="chef-shadow"></span><b id="chef-avatar-name">JEV</b></div>
      <div class="chef-bar game-speech"><div class="chef-speech"><span class="chef-name">今日主厨 <i id="connection-dot"></i></span><p id="chef-line">点好单，点击煎台开始做。</p></div><span id="model-info" class="sr-only">连接官方 Jev…</span><span id="steps" class="step-badge">第 0 步</span></div>
      <div class="scene-spark" aria-hidden="true">✦</div>
      <div class="game-tip" id="game-tip">点击厨房里的设备开始操作</div>
    </div>
    <div class="game-tray" id="game-tray" hidden><div class="tray-heading"><h3 id="tray-title">操作厨房</h3><button id="close-tray" aria-label="收起厨房操作">×</button></div><p id="target-recipe"></p><div id="grill-actions" class="manual-actions" hidden></div><div class="ingredient-strip" aria-label="组装配料" hidden>${['bottom','beef','cheese','lettuce','tomato','pickle','onion','ketchup','mayo','top'].map(key=>`<button ${key==='beef'?'data-protein="true"':''} data-manual="add_${key}" title="${INGREDIENTS[key].name}" aria-label="${key==='bottom'?'放下层面包':key==='top'?'盖上层面包':'加入'+INGREDIENTS[key].name}" disabled>${sticker(INGREDIENTS[key].sprite)}<span>${key==='bottom'?'面包':key==='top'?'封口':INGREDIENTS[key].name.replace('饼','')}</span></button>`).join('')}</div><div id="side-actions" class="manual-actions" hidden></div><button id="serve-manual" data-manual="serve" class="red-btn" hidden disabled>按铃出餐 →</button><div class="assembly-status"><div id="assembly-progress"></div><button class="text-btn redo-btn" data-manual="restart_burger" disabled>重做</button></div></div>
    <div class="floor-footer game-bottom"><span id="interaction-hint">先点单，再点击设备，自己动手做汉堡。</span><div class="cost-notes"><span>成本 <b id="expenses">¥0</b></span><span>小费 <b id="tips">¥0</b></span><span>浪费 <b id="waste">0</b></span></div></div>
  </div>`;
}

export function updateGame(shop,record,automatic) {
  const scene=document.querySelector('.game-scene');
  if(!scene)return;
  const floor=scene.parentElement;
  const width=Math.max(200,Math.min(floor.clientWidth,Math.max(120,floor.clientHeight-25)*16/9));
  scene.style.width=width+'px';scene.style.height=width*9/16+'px';
  const zone=record?.action?.station||'assembly';
  const positions={grill:[.24,.75],assembly:[.51,.75],sides:[.78,.71],pickup:[.70,.86],tickets:[.51,.81]};
  const [x,y]=positions[zone]||positions.assembly;
  const chef=document.getElementById('game-chef');
  chef.style.setProperty('--chef-x',`${scene.clientWidth*x}px`);chef.style.setProperty('--chef-y',`${scene.clientHeight*y}px`);
  document.getElementById('chef-avatar-name').textContent=automatic?'JEV':'你';
  document.getElementById('game-tip').textContent=!shop.orders.length?'点一份汉堡开工，或请三位客人进店':automatic?'Jev 在掌勺 · 点击设备可以接手':'你在掌勺 · 点煎台放肉，点备料台加配料';
  scene.classList.toggle('frying',Boolean(shop.fryer));
  scene.classList.toggle('grilling',shop.grill.some(Boolean));
  scene.classList.toggle('has-order',Boolean(shop.orders.length));
  for(const btn of scene.querySelectorAll('[data-zone]'))btn.classList.toggle('zone-active',btn.dataset.zone===zone&&Boolean(shop.orders.length));
  // Size food in world coordinates so the plate stays on the preparation counter.
  scene.style.setProperty('--burger-width',`${scene.clientWidth*.085}px`);
  scene.style.setProperty('--burger-height',`${scene.clientWidth*.056}px`);
}
