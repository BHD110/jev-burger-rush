export const INGREDIENTS = {
  bottom: { name: '下层面包', cost: .4, sprite: 1 }, top: { name: '上层面包', cost: .4, sprite: 0 },
  beef: { name: '牛肉饼', cost: 1.8, sprite: 2 }, chicken: { name: '鸡肉饼', cost: 1.6, sprite: 2 }, veggie: { name: '素肉饼', cost: 1.4, sprite: 2 },
  cheese: { name: '芝士', cost: .4, sprite: 4 }, lettuce: { name: '生菜', cost: .2, sprite: 3 }, tomato: { name: '番茄', cost: .3, sprite: 5 },
  pickle: { name: '酸黄瓜', cost: .2, sprite: 6 }, onion: { name: '洋葱', cost: .2, sprite: 7 }, ketchup: { name: '番茄酱', cost: .15, sprite: 8 }, mayo: { name: '蛋黄酱', cost: .15, sprite: 9 },
};
export const DEFAULT_RECIPE = { protein: 'beef', patties: 1, cheese: 1, lettuce: 1, tomato: 1, pickle: 0, onion: 0, sauce: 'ketchup', fries: false, drink: false };
export const TOPPINGS = ['cheese', 'lettuce', 'tomato', 'pickle', 'onion'];
export function validateRecipe(value) {
  if (!value || !['beef','chicken','veggie'].includes(value.protein) || ![1,2].includes(value.patties)) throw new Error('请选择牛肉、鸡肉或素肉，以及单层或双层肉饼。');
  for (const key of TOPPINGS) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > (key === 'cheese' ? 2 : 1)) throw new Error(`配料数量不正确：${key}`);
  if (!['ketchup','mayo','none'].includes(value.sauce) || typeof value.fries !== 'boolean' || typeof value.drink !== 'boolean') throw new Error('酱料或配餐选择不正确。');
  return Object.fromEntries(Object.keys(DEFAULT_RECIPE).map((key) => [key, value[key]]));
}
export function createShop() {
  return { clock: 0, steps: 0, nextTicket: 1, active: null, orders: [], served: [], grill: [null,null], fryer: null, cooked: [],
    inventory: Object.fromEntries(Object.keys(INGREDIENTS).map((key) => [key, 40])),
    stats: { revenue: 0, tips: 0, expenses: 0, waste: 0 }, history: [] };
}
export function price(recipe) { return (recipe.protein === 'beef' ? 14 : recipe.protein === 'chicken' ? 13 : 12) + (recipe.patties - 1) * 4 + Math.max(0,recipe.cheese - 1) + (recipe.fries ? 6 : 0) + (recipe.drink ? 4 : 0); }
export function recipeText(recipe) {
  const parts = [`${recipe.patties === 2 ? '双层' : '单层'}${INGREDIENTS[recipe.protein].name.replace('饼','')}汉堡`];
  for (const key of TOPPINGS) if (recipe[key]) parts.push(`${recipe[key] === 2 ? '双份' : ''}${INGREDIENTS[key].name}`);
  parts.push({ ketchup:'番茄酱', mayo:'蛋黄酱', none:'不加酱' }[recipe.sauce]);
  if (recipe.fries) parts.push('薯条'); if (recipe.drink) parts.push('可乐');
  return parts.join(' / ');
}
export function addOrder(shop, recipe, text = '', customer = '你') {
  const clean = validateRecipe(recipe);
  if (shop.orders.length >= 6) throw new Error('取餐区已经有 6 份订单，请等 Jev 出餐后再点。');
  const next = structuredClone(shop);
  const order = { id: `T${String(next.nextTicket++).padStart(2,'0')}`, customer, recipe: clean, text: text.slice(0,400) || recipeText(clean),
    price: price(clean), createdAt: shop.clock, layers: [], closed: false, fries: false, drink: false };
  next.orders.push(order);
  return { shop: next, order };
}
export function expectedLayers(recipe) {
  const result = { bottom: 1, top: 1, [recipe.protein]: recipe.patties };
  for (const key of TOPPINGS) if (recipe[key]) result[key] = recipe[key];
  if (recipe.sauce !== 'none') result[recipe.sauce] = 1;
  return result;
}
export function orderProgress(order) {
  const required=expectedLayers(order.recipe),assembled={};
  for(const key of order.layers)assembled[key]=(assembled[key]||0)+1;
  const missing=Object.fromEntries(Object.entries(required).filter(([key,value])=>(assembled[key]||0)<value).map(([key,value])=>[INGREDIENTS[key].name,value-(assembled[key]||0)]));
  const extra=Object.fromEntries(Object.entries(assembled).filter(([key,value])=>value>(required[key]||0)).map(([key,value])=>[INGREDIENTS[key].name,value-(required[key]||0)]));
  const sides=[];if(order.recipe.fries&&!order.fries)sides.push('薯条');if(order.recipe.drink&&!order.drink)sides.push('可乐');
  const extraSides=[];if(!order.recipe.fries&&order.fries)extraSides.push('薯条');if(!order.recipe.drink&&order.drink)extraSides.push('可乐');
  return { requiredIngredientCounts:Object.fromEntries(Object.entries(required).map(([key,n])=>[INGREDIENTS[key].name,n])),
    assembledIngredientCounts:Object.fromEntries(Object.entries(assembled).map(([key,n])=>[INGREDIENTS[key].name,n])),
    stillMissing:missing,extras:extra,sideDishesStillMissing:sides,extraSideDishes:extraSides,
    completelyReadyToServe:order.closed&&!Object.keys(missing).length&&!Object.keys(extra).length&&!sides.length&&!extraSides.length };
}
export function gradeOrder(shop, order) {
  const expected = expectedLayers(order.recipe);
  const actual = {};
  for (const key of order.layers) actual[key] = (actual[key] || 0) + 1;
  const issues = []; let count = 0;
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const delta = (actual[key] || 0) - (expected[key] || 0);
    if (delta) { count += Math.abs(delta); issues.push(`${delta > 0 ? '多了' : '缺少'}${Math.abs(delta)}份${INGREDIENTS[key].name}`); }
  }
  for (const key of ['fries','drink']) if (order.recipe[key] !== order[key]) { count++; issues.push(`${order[key] ? '多了' : '缺少'}${key === 'fries' ? '薯条' : '可乐'}`); }
  const waiting = shop.clock - order.createdAt;
  const penalty = Math.min(20, Math.floor(Math.max(0, waiting - 240) / 30));
  const score = Math.max(0, 100 - count * 20 - penalty);
  return { score, stars: Math.max(1, Math.round(score / 20)), correct: count === 0, issues, waiting, tip: count === 0 ? Number((score / 100 * 4).toFixed(2)) : 0 };
}
const countLayer = (order, ingredient) => order.layers.filter((x) => x === ingredient).length;
export function getActions(shop) {
  if (!shop.orders.length) return [];
  const actions = [];
  for (const order of shop.orders) if (order.id !== shop.active) actions.push({ id: `select_${order.id}`, kind: 'select', order: order.id, label: `处理 ${order.id} 订单`, station: 'tickets', description: `切换到 ${order.id}（${order.customer}）的组装盘。已有汉堡会保留，不自动添加配料。` });
  shop.grill.forEach((slot,index) => {
    const name = index === 0 ? '左' : '右';
    if (!slot) {
      for (const protein of ['beef','chicken','veggie']) if (shop.inventory[protein] > 0 && shop.cooked.length < 5) actions.push({ id: `grill_${index}_${protein}`, kind: 'grill', index, protein, station: 'grill', label: `${name}煎台放${INGREDIENTS[protein].name}`, description: `放入一份生的${INGREDIENTS[protein].name}。经过 2 次后续操作要翻面，总共 4 次后续操作后可取出，达到 7 次操作会焦。` });
    } else if (slot.elapsed >= 7) actions.push({ id:`discard_${index}`, kind:'discard', index, station:'grill', label:`清理${name}煎台焦肉`, description:'丢掉已经烤焦的肉饼，释放煎台。产生浪费，材料不退回。' });
    else {
      if (!slot.flipped && slot.elapsed >= 2) actions.push({ id:`flip_${index}`, kind:'flip', index, station:'grill', label:`给${name}煎台肉饼翻面`, description:`${INGREDIENTS[slot.protein].name}已煎 ${slot.elapsed} 次操作，翻面后才能完成烹饪。` });
      if (slot.flipped && slot.elapsed >= 4) actions.push({ id:`take_${index}`, kind:'take', index, station:'grill', label:`取出${name}煎台熟肉`, description:`将已煎熟的${INGREDIENTS[slot.protein].name}放到熟肉盘。当前煎了 ${slot.elapsed} 次操作，到 7 次会焦，及时取出。` });
    }
  });
  const order = shop.orders.find((o) => o.id === shop.active);
  if (order) {
    if (!order.layers.length && shop.inventory.bottom > 0) actions.push({ id:'add_bottom', kind:'add', ingredient:'bottom', order:order.id, station:'assembly', label:'放下层面包', description:`给 ${order.id} 的组装盘放底层面包，开始制作汉堡。` });
    if (order.layers.length && !order.closed) {
      for (const protein of ['beef','chicken','veggie']) if (shop.cooked.some((p) => p.protein === protein) && countLayer(order,protein) < 2) actions.push({ id:`add_${protein}`, kind:'add', ingredient:protein, order:order.id, station:'assembly', label:`加入熟${INGREDIENTS[protein].name}`, description:`从熟肉盘取一份${INGREDIENTS[protein].name}放入 ${order.id}。不会自动添加其他材料。` });
      for (const ingredient of [...TOPPINGS,'ketchup','mayo']) if (shop.inventory[ingredient] > 0 && countLayer(order,ingredient) < (ingredient === 'cheese' ? 2 : 1)) actions.push({ id:`add_${ingredient}`, kind:'add', ingredient, order:order.id, station:'assembly', label:`加入${INGREDIENTS[ingredient].name}`, description:`给 ${order.id} 添加一份${INGREDIENTS[ingredient].name}。菜单里能添加，不表示这份订单要求添加；应按订单决定。` });
      if (order.layers.some((key) => ['beef','chicken','veggie'].includes(key)) && shop.inventory.top > 0) actions.push({ id:'add_top', kind:'add', ingredient:'top', order:order.id, station:'assembly', label:'盖上上层面包', description:`封好 ${order.id} 汉堡。封好后不能再加料，应先核对肉饼数量、配料和酱料。` });
    }
    if (order.closed) actions.push({ id:'serve', kind:'serve', order:order.id, station:'pickup', label:`为 ${order.id} 出餐`, description:`将 ${order.id} 汉堡和已备好的配餐交给顾客。系统会独立核对缺料、多料及等待时间，并据此评分、结账。` });
    if (order.layers.length) actions.push({ id:'restart_burger', kind:'restart', order:order.id, station:'assembly', label:'重做当前汉堡', description:`丢弃 ${order.id} 盘中的汉堡，重新组装。配餐保留，已用食材不退回，产生浪费。只在做错时需要。` });
    if (!order.drink) actions.push({ id:'pour_drink', kind:'drink', order:order.id, station:'sides', label:`为 ${order.id} 接可乐`, description:'给当前订单配一杯可乐。即使订单没点饮料，也可以操作；要判断是否需要。' });
    if (order.drink) actions.push({ id:'remove_drink',kind:'removeSide',side:'drink',order:order.id,station:'sides',label:`拿走 ${order.id} 可乐`,description:'把当前餐盘的可乐丢掉，产生一次浪费。只有误放了顾客没点的饮料才需要。' });
    if (order.fries) actions.push({ id:'remove_fries',kind:'removeSide',side:'fries',order:order.id,station:'sides',label:`拿走 ${order.id} 薯条`,description:'把当前餐盘的薯条丢掉，产生一次浪费。只有误放了顾客没点的薯条才需要。' });
    if (!order.fries && !shop.fryer) actions.push({ id:'start_fries', kind:'fries', order:order.id, station:'sides', label:`为 ${order.id} 炸薯条`, description:'把当前订单的薯条放入炸篮，经过 2 次后续操作可捞出。即使订单没点薯条，也可以操作。' });
  }
  if (shop.fryer && shop.fryer.elapsed >= 2) actions.push({ id:'take_fries', kind:'takeFries', station:'sides', label:`捞出 ${shop.fryer.order} 薯条`, description:`薯条已经炸好，放入 ${shop.fryer.order} 的餐盘。` });
  actions.push({ id:'wait', kind:'wait', station:'grill', label:'稍等火候', description:'不添加材料，让煎台和炸篮推进一次操作的烹饪时间。顾客也会继续等待。没有在烹饪时等待没有收益。' });
  return actions;
}
export function applyAction(shop, id) {
  const action = getActions(shop).find((a) => a.id === id);
  if (!action) throw new Error(`当前厨房不能执行：${id}`);
  const next = structuredClone(shop);
  const order = next.orders.find((o) => o.id === action.order);
  let effect = action.label; let receipt = null; let newGrill = -1; let newFryer = false;
  if (action.kind === 'select') next.active = order.id;
  if (action.kind === 'grill') {
    next.inventory[action.protein]--; next.stats.expenses += INGREDIENTS[action.protein].cost;
    next.grill[action.index] = { protein:action.protein, elapsed:0, flipped:false }; newGrill = action.index;
  }
  if (action.kind === 'flip') next.grill[action.index].flipped = true;
  if (action.kind === 'take') { next.cooked.push({ protein:next.grill[action.index].protein }); next.grill[action.index] = null; }
  if (action.kind === 'discard') { next.grill[action.index] = null; next.stats.waste++; }
  if (action.kind === 'add') {
    if (['beef','chicken','veggie'].includes(action.ingredient)) next.cooked.splice(next.cooked.findIndex((p) => p.protein === action.ingredient),1);
    else { next.inventory[action.ingredient]--; next.stats.expenses += INGREDIENTS[action.ingredient].cost; }
    order.layers.push(action.ingredient); if (action.ingredient === 'top') order.closed = true;
  }
  if (action.kind === 'restart') { order.layers = []; order.closed = false; next.stats.waste++; }
  if (action.kind === 'drink') { order.drink = true; next.stats.expenses += 1; }
  if (action.kind === 'removeSide') { order[action.side] = false; next.stats.waste++; }
  if (action.kind === 'fries') { next.fryer = { order:order.id, elapsed:0 }; newFryer = true; next.stats.expenses += 1.5; }
  if (action.kind === 'takeFries') { const ticket = next.orders.find((o) => o.id === next.fryer.order); if (ticket) ticket.fries = true; next.fryer = null; }
  next.clock += 5; next.steps++;
  next.grill.forEach((slot,i) => { if (slot && i !== newGrill) slot.elapsed++; });
  if (next.fryer && !newFryer) next.fryer.elapsed++;
  if (action.kind === 'serve') {
    const grade = gradeOrder(next, order); receipt = { ...order, ...grade, servedAt:next.clock };
    next.orders = next.orders.filter((o) => o.id !== order.id); next.active = null;
    next.served.push(receipt); next.stats.revenue += order.price; next.stats.tips += grade.tip;
    effect += ` · ${grade.score}分 · 收入 ¥${order.price}`;
  }
  next.stats.expenses = Number(next.stats.expenses.toFixed(2)); next.stats.tips = Number(next.stats.tips.toFixed(2));
  next.history.push({ step:next.steps, action:id, label:action.label, effect, station:action.station });
  return { shop:next, action, effect, receipt };
}
export function makeDecision(shop) {
  const actions = getActions(shop);
  return {
    state: {
      goal:'你是汉堡店厨师，按每一份顾客订单制作完全正确的汉堡和配餐，尽快出餐。不要给顾客加未点的食材，不要漏配料。',
      kitchenRules:[
        '一次选一个操作。执行任何操作都让厨房推进 5 秒模拟时间；不做真实时间估算，以状态中 elapsed 为准。',
        '肉饼放上煎台后 elapsed 从0开始。每个后续操作+1；elapsed>=2 时需要翻面；翻过且 elapsed>=4 才熟；elapsed>=7 会焦不能使用。接近焦的熟肉应及时取出。',
        '每份肉饼需要自己放入、翻面、取出。熟肉盘里的肉可用于任何相同肉类订单；双层汉堡要2块肉。',
        '每个订单都有独立组装盘。先选择订单，放底层面包，再加订单所需的所有肉、配料、酱料，最后盖上上层面包。封好后不能继续加料。',
        '煎肉时可并行组装、炸薯条或接饮料。炸薯条 elapsed>=2 后需捞出。薯条会放入启动它的订单，不必切换到该订单。',
        '候选动作是物理上能做的全部操作，包括错误配料与多余配餐。必须对照 recipe 选择，不要把能做误当成应该做。',
        'recipe 中配料数量0就是不要，1就是1份，cheese=2要加两次。sauce=none表示两种酱都不要。未点薯条或饮料不要添加。',
        '出餐评分由代码独立核对。当前订单如已完成就出餐；不要无限等待、备餐过量或反复切换。',
      ],
      currentOrder:shop.active, orders:shop.orders.map((o) => ({ id:o.id, customer:o.customer, request:o.text, recipe:o.recipe, assembledLayers:o.layers, closed:o.closed, friesReady:o.fries, drinkReady:o.drink, waitedSeconds:shop.clock-o.createdAt })),
      grill:shop.grill.map((slot,i) => ({ position:i===0?'左':'右', ...slot, empty:!slot, ready:Boolean(slot?.flipped && slot.elapsed>=4 && slot.elapsed<7), burnt:Boolean(slot?.elapsed>=7) })),
      cookedPattyTray:shop.cooked, fryer:shop.fryer, pantry:shop.inventory,
      exactOrderProgress:shop.orders.map(o=>({id:o.id,...orderProgress(o)})),
      recentActions:shop.history.slice(-6),
    },
    instructions:'根据顾客订单、当前组装盘、煎台火候和配餐状态，厨师现在最应该执行哪一个操作？exactOrderProgress 是游戏精确数出的缺料清单，stillMissing 中的每一份都要补齐；比如芝士剩1份就要再加一次，双层肉要两块。先加完全部配料再盖上层面包；仅 completelyReadyToServe=true 才应该出餐。薯条在炸篮里不等于已经装盘，要等熟后选择捞出。优先避免熟肉烧焦，不多加配料，准备完成后立即出餐。一次只选一个当前可执行的动作。',
    criteria:Object.fromEntries(actions.map((a) => [a.id, `${a.label}。${a.description}`])),
  };
}
