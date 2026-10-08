import { DEFAULT_RECIPE, validateRecipe } from './engine.js';
export function makeOrderQuestions(text) {
  const binary = (item, defaultValue) => ({ instructions:`顾客点单：${text}。这份汉堡是否要${item}？顾客明确说不要、不加、去掉则选no；明确要则选yes；未提及时默认${defaultValue?'添加':'不添加'}。只判断汉堡配料，别把番茄酱当番茄片。`, criteria:{ yes:`添加一份${item}`, no:`不添加${item}` } });
  return {
    supported:{ instructions:`这条点单是否可以由汉堡店菜单完整满足？菜单只提供牛肉、鸡肉、素肉汉堡，单层或双层肉饼，芝士、生菜、番茄、酸黄瓜、洋葱，番茄酱/蛋黄酱/无酱，薯条与可乐。不提供鱼、猪肉、培根、鸡蛋、其他菜品、其他饮料；一次最多3份相同配方汉堡，所有汉堡配方需相同。如果存在明确不支持的要求选unsupported；要求多个不同配方选mixed；未点汉堡、仅聊天或指令无关选unclear；可以明确按菜单满足则选supported。`, criteria:{ supported:'可以按菜单完整制作同一配方汉堡', unsupported:'存在菜单外食材、菜品、饮料或超出数量', mixed:'多份汉堡且配方不相同，请分开点', unclear:'没有可识别的汉堡点单' } },
    protein:{ instructions:`${text}。汉堡主肉是哪一种？明确素食或不要肉选veggie；鸡肉选chicken；牛肉选beef；没指定则默认牛肉。`, criteria:{ beef:'牛肉饼', chicken:'鸡肉饼', veggie:'素肉饼' } },
    patties:{ instructions:`${text}。每一个汉堡要几层肉饼？双层、双肉饼、两块肉饼选two。两个汉堡不等于双层。未提每个汉堡肉饼数量默认单层。`, criteria:{ one:'每个汉堡一块肉饼', two:'每个汉堡两块肉饼' } },
    cheese:{ instructions:`${text}。每个汉堡要多少份芝士？不要、不加选none；双份、多加、加倍芝士选double；要芝士或未提默认一份。`, criteria:{ none:'没有芝士', one:'一份芝士', double:'两份芝士' } },
    lettuce:binary('生菜',true), tomato:binary('番茄片',true), pickle:binary('酸黄瓜',false), onion:binary('洋葱',false),
    sauce:{ instructions:`${text}。汉堡酱料是哪一种？无酱、不加酱选none；蛋黄酱、沙拉酱、美乃滋选mayo；番茄酱或未指定默认ketchup。`, criteria:{ ketchup:'番茄酱', mayo:'蛋黄酱', none:'不加任何酱' } },
    fries:{ instructions:`${text}。是否明确点了一份薯条配餐？没提或明确不要就选no；套餐默认包括薯条和可乐。`, criteria:{ yes:'包含薯条', no:'不包含薯条' } },
    drink:{ instructions:`${text}。是否明确点了一杯可乐或饮料？没提或明确不要就选no；套餐默认包括薯条和可乐。`, criteria:{ yes:'包含可乐', no:'不包含可乐' } },
    quantity:{ instructions:`${text}。顾客总共要几个汉堡？默认1。双层、双倍肉饼不等于两个汉堡。`, criteria:{ one:'1个汉堡', two:'2个相同汉堡', three:'3个相同汉堡' } },
  };
}
export function decodeOrder(answers) {
  const value = (key) => answers[key]?.choice;
  if (value('supported') !== 'supported') {
    const messages = { unsupported:'这项要求超出今天的菜单。可以点牛肉、鸡肉或素肉汉堡，配薯条和可乐。', mixed:'不同配方的汉堡请分开点，我会分别开单。', unclear:'告诉我你想吃哪种汉堡吧，例如：双层牛肉汉堡，不要洋葱，配薯条。' };
    throw new Error(messages[value('supported')] || '这份点单没有识别成功，请重新描述。');
  }
  const recipe = validateRecipe({ ...DEFAULT_RECIPE, protein:value('protein'), patties:value('patties')==='two'?2:1,
    cheese:{none:0,one:1,double:2}[value('cheese')],
    lettuce:value('lettuce')==='yes'?1:0, tomato:value('tomato')==='yes'?1:0, pickle:value('pickle')==='yes'?1:0, onion:value('onion')==='yes'?1:0,
    sauce:value('sauce'), fries:value('fries')==='yes', drink:value('drink')==='yes' });
  return { recipe, quantity:{one:1,two:2,three:3}[value('quantity')] || 1 };
}
