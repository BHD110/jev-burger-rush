import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import { resolve,dirname,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { TypeSafeClient,choice } from '@typesafe-ai/sdk';
import { createShop,addOrder,validateRecipe,applyAction,makeDecision,getActions } from './src/engine.js';
import { makeOrderQuestions,decodeOrder } from './src/order-parser.js';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.BURGER_PORT||5193), model=process.env.BURGER_MODEL||'jev-latest';
// No server-owned credentials or environment fallback. Keys are visitor-specific and never persisted.
const visitors=new Map(), KEY_TTL=2*60*60*1000;
const expiryTimer=setInterval(()=>{
  const now=Date.now();
  for(const [id,v] of visitors){if(now>=v.keyExpires)v.key=null;if(now-v.touched>KEY_TTL)visitors.delete(id);}
},1000);expiryTimer.unref();
const cookieName='jev_burger_session';
function visitor(req,res){
  const now=Date.now();
  for(const [id,v] of visitors)if(now-v.touched>KEY_TTL)visitors.delete(id);
  const token=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  let v=visitors.get(token);
  if(!v){
    if(visitors.size>=500)throw Object.assign(new Error('访问人数较多，请稍后再试。'),{status:429});
    v={id:randomUUID(),key:null,keyExpires:0,touched:now};visitors.set(v.id,v);
    const secure=req.headers['x-forwarded-proto']==='https'?'; Secure':'';
    res.setHeader('Set-Cookie',`${cookieName}=${v.id}; Path=/; HttpOnly; SameSite=Strict${secure}`);
  }
  v.touched=now;
  if(now>v.keyExpires)v.key=null;
  return v;
}
function userKey(v){if(!v.key||Date.now()>v.keyExpires)throw Object.assign(new Error('请先点击「连接 Jev」，输入你自己的 API key。'),{status:401});return v.key;}
const logs=resolve(root,'logs');await mkdir(logs,{recursive:true});
const sessions=new Map();
const production=process.argv.includes('--production');
const vite=production?null:await(await import('vite')).createServer({root,server:{middlewareMode:true},appType:'spa'});
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let content='';for await(const chunk of req){content+=chunk;if(content.length>12000)throw new Error('请求太大');}return JSON.parse(content||'{}');}
const snapshot=(s)=>({id:s.id,version:s.version,shop:s.shop,recordCount:s.records.length});
const save=(s)=>writeFile(resolve(logs,`shop-${s.id}.json`),JSON.stringify({...snapshot(s),records:s.records},null,2)).catch(e=>console.error('保存记录失败',e.code));
async function infer(request,signal,v){
  const client=new TypeSafeClient({apiKey:userKey(v),baseURL:'https://api.typesafe.ai'});
  const started=performance.now();
  const response=await client.systemOne({model,state:request.state,questions:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,choice(q.instructions,q.criteria)]))},{timeout:20000,retry:{maxRetries:0},signal});
  return {model:response.model,latencyMs:Math.round(performance.now()-started),request:{model,...request},response};
}
async function api(req,res,path){
  if(['POST','DELETE'].includes(req.method)&&req.headers.origin){
    let valid=false;try{valid=new URL(req.headers.origin).host===req.headers.host;}catch{}
    if(!valid)return json(res,403,{error:'请从本站页面操作。'});
  }
  const v=visitor(req,res);
  if(req.method==='GET'&&path==='/api/health')return json(res,200,{ok:true,configured:Boolean(v.key),app:'jev-burger-rush',model});
  if(path==='/api/key'&&req.method==='POST'){
    const data=await body(req),key=typeof data.key==='string'?data.key.trim():'';
    if(!/^apikey_[A-Za-z0-9_-]{8,240}$/.test(key))return json(res,400,{error:'请输入有效的 Jev API key。'});
    v.key=key;v.keyExpires=Date.now()+KEY_TTL;
    return json(res,200,{configured:true,expiresInSeconds:KEY_TTL/1000});
  }
  if(path==='/api/key'&&req.method==='DELETE'){v.key=null;v.keyExpires=0;return json(res,200,{configured:false});}
  if(req.method==='POST'&&path==='/api/shop'){
    for(const [id,s] of sessions)if(!s.busy&&Date.now()-s.touched>7200000)sessions.delete(id);
    if(sessions.size>=50)return json(res,429,{error:'店铺会话过多，请稍后重试。'});
    const s={id:randomUUID(),owner:v.id,version:0,shop:createShop(),records:[],busy:false,touched:Date.now()};sessions.set(s.id,s);return json(res,201,snapshot(s));
  }
  if(req.method==='GET'&&/^\/api\/shop\/[a-f0-9-]+$/.test(path)){
    const s=sessions.get(path.split('/').at(-1));return s?.owner===v.id?json(res,200,{...snapshot(s),records:s.records}):json(res,404,{error:'店铺已关闭，请重新开店。'});
  }
  if(req.method==='POST'&&['/api/order','/api/step','/api/rush','/api/action'].includes(path)){
    const data=await body(req),s=sessions.get(data.id);
    if(!s||s.owner!==v.id)return json(res,404,{error:'店铺会话已失效，请重新开店。'});
    // 所有变更共用版本与锁，点单与模型决策不会写入过时厨房状态。
    if(s.busy||data.version!==s.version)return json(res,409,{error:'厨房正在更新，请稍后再试。'});
    if(['/api/step','/api/action'].includes(path)&&!s.shop.orders.length)return json(res,409,{error:'还没有订单，先点一份汉堡吧。'});
    if(['/api/step','/api/action'].includes(path)&&s.shop.steps>=600)return json(res,409,{error:'本店已达到演示操作上限，请重新开店。'});
    if(path==='/api/action'&&!getActions(s.shop).some(a=>a.id===data.action))return json(res,400,{error:'当前不能这样操作，请查看厨房状态。'});
    s.busy=true;s.touched=Date.now();
    const controller=new AbortController();const onClose=()=>{if(!res.writableEnded)controller.abort();};res.on('close',onClose);
    try{
      let record;
      if(path==='/api/order'){
        const text=typeof data.text==='string'?data.text.trim().slice(0,400):'';
        if(!text&&!data.recipe)return json(res,400,{error:'请描述想吃的汉堡，或用菜单点单。'});
        let parsed,classification=null;
        if(data.recipe)parsed={recipe:validateRecipe(data.recipe),quantity:Number(data.quantity||1)};
        else{
          const questions=makeOrderQuestions(text);
          classification=await infer({state:{customerRequest:text,defaultBurger:'单层牛肉、1份芝士、1份生菜、1份番茄片、番茄酱，无洋葱和酸黄瓜，无配餐'},questions:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,{type:'choice',...q}]))},controller.signal,v);
          try{parsed=decodeOrder(classification.response.answers);}
          catch(error){const rejected={type:'rejected_order',at:new Date().toISOString(),text,error:error.message,...classification};s.records.push(rejected);await save(s);return json(res,422,{...snapshot(s),record:rejected,error:error.message});}
        }
        if(![1,2,3].includes(parsed.quantity))return json(res,400,{error:'每次可以点 1 到 3 个相同汉堡。'});
        if(s.shop.orders.length+parsed.quantity>6)return json(res,400,{error:'取餐区最多容纳 6 份订单，请等 Jev 出餐。'});
        if(controller.signal.aborted)return;
        const added=[];let next=s.shop;
        for(let i=0;i<parsed.quantity;i++){const result=addOrder(next,parsed.recipe,text,'你');next=result.shop;added.push(result.order.id);}
        s.shop=next;record={type:'order',at:new Date().toISOString(),tickets:added,text,parsed,...classification};
      }else if(path==='/api/rush'){
        if(s.shop.orders.length>3)return json(res,400,{error:'高峰演示会加入 3 份订单，请先给取餐区腾出位置。'});
        const templates=[
          {customer:'小橘',recipe:{protein:'beef',patties:1,cheese:1,lettuce:1,tomato:1,pickle:0,onion:0,sauce:'ketchup',fries:true,drink:false}},
          {customer:'阿蓝',recipe:{protein:'chicken',patties:1,cheese:0,lettuce:1,tomato:0,pickle:1,onion:0,sauce:'mayo',fries:false,drink:true}},
          {customer:'小芽',recipe:{protein:'veggie',patties:1,cheese:1,lettuce:1,tomato:1,pickle:0,onion:0,sauce:'none',fries:false,drink:false}},
        ];
        let next=s.shop;for(const t of templates)next=addOrder(next,t.recipe,'',t.customer).shop;s.shop=next;record={type:'rush',at:new Date().toISOString(),note:'菜单结构化点单，未调用模型解析；后续制作每一步由 Jev 选择。'};
      }else if(path==='/api/action'){
        const before=structuredClone(s.shop),applied=applyAction(s.shop,data.action);
        s.shop=applied.shop;
        record={type:'manual',at:new Date().toISOString(),step:s.shop.steps,action:applied.action,effect:applied.effect,receipt:applied.receipt,before,after:structuredClone(s.shop)};
      }else{
        const decision=makeDecision(s.shop),before=structuredClone(s.shop);
        const inference=await infer({state:decision.state,questions:{next_action:{type:'choice',instructions:decision.instructions,criteria:decision.criteria}}},controller.signal,v);
        if(controller.signal.aborted)return;
        const applied=applyAction(s.shop,inference.response.answers.next_action.choice);
        s.shop=applied.shop;record={type:'action',at:new Date().toISOString(),step:s.shop.steps,...inference,action:applied.action,effect:applied.effect,receipt:applied.receipt,before,after:structuredClone(s.shop)};
      }
      s.version++;s.records.push(record);await save(s);if(!res.destroyed)json(res,200,{...snapshot(s),record});
    }catch(error){if(!controller.signal.aborted){
      // Upstream errors may echo headers or key fragments: never expose raw errors.
      const missing=error.status===401&&error.message.startsWith('请先点击');
      if(missing)json(res,401,{error:error.message});
      else{console.error('[厨房] 请求失败',Number(error.status)||502);json(res,502,{error:'Jev 调用没有成功，请检查你的 key、账户余额和网络后重试。'});}
    }}
    finally{s.busy=false;res.off('close',onClose);}
    return;
  }
  return json(res,404,{error:'未找到接口'});
}
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
    if(path.startsWith('/api/'))return await api(req,res,path);
    if(path==='/media/lunch-rush.mp4'&&process.env.BURGER_MEDIA_DIR&&['GET','HEAD'].includes(req.method)){
      const video=resolve(process.env.BURGER_MEDIA_DIR,'lunch-rush.mp4');
      try{
        const {size}=await stat(video);let start=0,end=size-1,status=200;
        if(req.headers.range){
          const match=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
          if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
          if(!match[1])start=Math.max(0,size-Number(match[2]));
          else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
          if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
          status=206;
        }
        res.writeHead(status,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
        if(req.method==='HEAD')res.end();else createReadStream(video,{start,end}).on('error',()=>res.destroy()).pipe(res);
      }catch{res.writeHead(404);res.end();}return;
    }
    if(/^\/(server\.mjs|logs|test|scripts|\.env|\.git|package\.json|pnpm-lock\.yaml)([/.]|$)/.test(path)){res.writeHead(404);res.end();return;}
    if(vite){vite.middlewares(req,res);return;}
    const relative=decodeURIComponent(path)==='/'?'/index.html':decodeURIComponent(path),file=resolve(root,'dist',`.${relative}`);
    if(!file.startsWith(resolve(root,'dist')+sep)){res.writeHead(403);res.end();return;}
    try{if(!(await stat(file)).isFile())throw new Error('not file');const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.json':'application/json'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}
  }catch(error){if(!res.headersSent)json(res,error.status||400,{error:error.status===429?error.message:'请求无效，请重试。'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Jev Burger Rush http://127.0.0.1:${port}/ · 用户自备 key · ${model}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await vite?.close();server.close(()=>process.exit(0));});
