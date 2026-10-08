import { gameKitchen } from './game-kitchen.js';
import { INGREDIENTS } from './engine.js';

export function workspace(sticker) {
  return `
  <header class="shop-header">
    <div class="shop-brand"><span class="brand-burger" aria-hidden="true"><i></i><i></i><i></i></span><div><h1>Jev 的汉堡小店<span>✦</span></h1><p>你来点单，Jev 来做。</p></div></div>
    <form id="order-form"><label class="sr-only" for="order-text">用中文点单</label><input id="order-text" maxlength="400" autocomplete="off" placeholder="双层牛肉，多加芝士，不要洋葱，配薯条…"><button id="submit-order" class="red-btn" type="submit">下单 →</button></form>
    <button id="custom-button" class="outline">自选菜单</button><button id="rush" class="outline rush-btn">午餐高峰</button>
    <div class="header-tools"><button id="key-settings" class="outline">连接 Jev</button><button id="toggle-insights" class="outline" aria-expanded="false">Jev 决策</button><button id="game-fullscreen" class="icon-btn" aria-label="专注厨房" title="专注厨房">⛶</button><button id="export" class="icon-btn" aria-label="导出记录" title="导出完整输入输出记录">↓</button><button id="reset" class="icon-btn" aria-label="重新开店" title="重新开店">↻</button></div>
  </header>
  <div class="awning" aria-hidden="true"></div>
  <div class="shop-meta"><div class="quick-orders"><span>试试点单</span><button data-example="来一个经典牛肉汉堡，配一杯可乐。">牛肉 + 可乐</button><button data-example="我要双层牛肉汉堡，多加芝士，不要洋葱，配薯条。">双层加倍芝士</button><button data-example="鸡肉汉堡，不要芝士和番茄，加酸黄瓜和蛋黄酱。">鸡肉 · 不要芝士</button><button data-example="一个素肉汉堡，不要任何酱，不要洋葱。">素肉 · 不加酱</button></div><div class="business"><span>营业额 <b id="revenue">¥0</b></span><span>已出餐 <b id="served-count">0 份</b></span><span>评价 <b id="rating">—</b></span></div></div>
  <main class="workspace game-workspace">
    <section class="kitchen" aria-label="汉堡厨房">
      <div class="kitchen-head"><div class="kitchen-heading"><span class="open-sign">营业中</span><h2>今日厨房</h2><span id="clock">09:00</span></div><div class="kitchen-controls"><button id="auto" class="green-btn">Ⅱ 暂停 / 接手</button><button id="single" class="outline">只做一步</button><div class="speed-control" role="group" aria-label="演示速度"><button data-speed="0.65">½×</button><button data-speed="1" class="selected">1×</button><button data-speed="2">2×</button></div><select id="speed" class="sr-only" aria-label="演示速度"><option value="0.65">慢慢看</option><option value="1" selected>正常</option><option value="2">快一点</option></select></div></div>
      ${gameKitchen(sticker)}
    </section>
    <aside class="insight-panel" aria-label="Jev 决策与店铺信息">
      <div class="panel-title"><h2>Jev 的决策</h2><span class="live-label"><i></i> 实时决策</span></div>
      <section class="decision-card" aria-label="最新决策"><div class="decision-pick"><h3 id="decision-label">等你的第一份点单</h3><strong id="decision-prob">—</strong></div><div class="prob-track"><i id="decision-fill"></i></div><div id="decision-alternatives"></div><p id="decision-meta">候选动作和选择概率会显示在这里</p><button id="trace-button" class="text-btn">查看完整输入 / 输出 ↗</button></section>
      <div class="side-tabs" role="tablist" aria-label="店铺信息"><button role="tab" aria-selected="true" aria-controls="panel-history" data-panel="history">历史记录</button><button role="tab" aria-selected="false" aria-controls="panel-stock" data-panel="stock">原料库存</button><button role="tab" aria-selected="false" aria-controls="panel-receipts" data-panel="receipts">出餐评价</button></div>
      <section id="panel-history" class="side-content" role="tabpanel"><div id="recent-actions"></div></section>
      <section id="panel-stock" class="side-content" role="tabpanel" hidden><p class="panel-help">使用食材后实时减少，重新开店会补满。</p><div id="stock-list"></div></section>
      <section id="panel-receipts" class="side-content" role="tabpanel" hidden><div id="receipts"></div></section>
      <div class="panel-foot">官方 Jev · 真实请求与返回<br>选择概率不代表出餐正确率</div>
    </aside>
  </main>
  <section class="order-dock" aria-label="订单"><div class="dock-head"><div><h2>订单</h2><span id="queue-count">0 份待做</span></div><span>点小票看完整配方 · 点击小票选单 · 点厨房设备制作</span></div><div id="tickets" class="ticket-strip" data-station="tickets"></div></section>
  <footer><span>原创汉堡店 · AI 食材与角色贴纸</span><span>固定菜单 · 虚拟经营</span></footer>`;
}
