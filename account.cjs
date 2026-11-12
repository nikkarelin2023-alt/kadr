const crypto=require('node:crypto');
const {request}=require('./supabase-request.cjs');
const {createStore}=require('./auth-sessions.cjs');
function createAccountHandler({transport=request,store,env=process.env}={}){
 let sessions=store;const refreshes=new Map(),limits=new Map();
 const configured=()=>/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(env.SUPABASE_URL||'')&&Boolean(env.SUPABASE_PUBLISHABLE_KEY);
 const api=async(path,options={})=>transport(env.SUPABASE_URL.replace(/\/$/,'')+path,{...options,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,...options.headers}});
 const cookie=(id)=>`kadr_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${id?2592000:0}${env.NODE_ENV==='production'?'; Secure':''}`;
 const sid=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('kadr_session='))?.slice(13);
 const reply=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))};
 function rate(key,max,window){const now=Date.now(),old=limits.get(key);const value=old&&old.until>now?old:{n:0,until:now+window};value.n++;limits.set(key,value);if(limits.size>10000)for(const[k,v]of limits)if(v.until<now)limits.delete(k);return value.n<=max}
 async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2000000)throw new Error('TOO_LARGE');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
 async function session(req){const id=sid(req);const value=id&&sessions.get(id);if(!value)return null;if(value.expires_at*1000>Date.now()+60000)return {id,...value};
  if(!refreshes.has(id))refreshes.set(id,(async()=>{const result=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:value.refresh_token}});if(result.status!==200){sessions.delete(id);return null}const next={...value,...result.data};sessions.set(id,next);return {id,...next}})().finally(()=>refreshes.delete(id)));
  return refreshes.get(id);
 }
 return async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/auth/')&&!url.pathname.startsWith('/api/account/'))return false;
  if(url.pathname==='/api/auth/config'){reply(res,200,{configured:configured()});return true}
  if(!configured()){reply(res,503,{error:'Вход ещё не подключён. Нужно настроить проект Supabase.'});return true}
  sessions??=createStore();
  if(req.method!=='GET'){
   let origin;try{origin=new URL(req.headers.origin).host}catch{}
   if(origin!==req.headers.host||!String(req.headers['content-type']||'').startsWith('application/json')){reply(res,403,{error:'Запрос отклонён'});return true}
  }
  try{
   if(url.pathname==='/api/auth/code'&&req.method==='POST'){
    const data=await body(req),email=String(data.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){reply(res,400,{error:'Проверь адрес почты'});return true}
    const hash=crypto.createHash('sha256').update(email).digest('hex');
    if(!rate('email:'+hash,5,3600000)||!rate('ip:'+req.socket.remoteAddress,30,3600000)){reply(res,429,{error:'Слишком много запросов. Попробуй позже.'});return true}
    const result=await api('/auth/v1/otp',{method:'POST',body:{email,create_user:true}});
    reply(res,result.status<300?200:result.status===429?429:400,result.status<300?{ok:true}:{error:'Не удалось отправить код. Проверь настройки почты Supabase или попробуй позже.'});return true;
   }
   if(url.pathname==='/api/auth/verify'&&req.method==='POST'){
    if(!rate('verify:'+req.socket.remoteAddress,15,300000)){reply(res,429,{error:'Слишком много попыток. Подожди несколько минут.'});return true}
    const data=await body(req);if(!/^\d{6,10}$/.test(String(data.code||''))){reply(res,400,{error:'Введи код из письма'});return true}
    const result=await api('/auth/v1/verify',{method:'POST',body:{email:String(data.email||'').trim().toLowerCase(),token:String(data.code),type:'email'}});
    if(result.status!==200||!result.data?.user?.id){reply(res,400,{error:'Код неверный или истёк. Запроси новый.'});return true}
    const id=sessions.create(result.data);reply(res,200,{user:{id:result.data.user.id,email:result.data.user.email}},{'Set-Cookie':cookie(id)});return true;
   }
   if(url.pathname==='/api/auth/logout'&&req.method==='POST'){
    const id=sid(req),value=id&&sessions.get(id);if(id)sessions.delete(id);
    if(value)try{await api('/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+value.access_token}})}catch{}
    reply(res,200,{ok:true},{'Set-Cookie':cookie('')});return true;
   }
   const active=await session(req);
   if(url.pathname==='/api/auth/session'&&req.method==='GET'){reply(res,200,{user:active?{id:active.user.id,email:active.user.email}:null});return true}
   if(!active){reply(res,401,{error:'Войди снова, чтобы синхронизировать коллекцию'});return true}
   const headers={Authorization:'Bearer '+active.access_token};
   if(url.pathname==='/api/account/items'&&req.method==='GET'){
    const rows=[];for(let offset=0;offset<10000;offset+=1000){const result=await api('/rest/v1/user_items?select=*&order=item_id&user_id=eq.'+encodeURIComponent(active.user.id)+'&offset='+offset+'&limit=1000',{headers});if(result.status!==200)throw Error('DATABASE');rows.push(...result.data.map(row=>({...row,corrections:cleanCorrections(row.corrections),card:cleanCard(row.card,row.item_id)})));if(result.data.length<1000)break}reply(res,200,{items:rows});return true;
   }
   if(url.pathname==='/api/account/items'&&req.method==='POST'){
    const data=await body(req);if(!Array.isArray(data.changes)||data.changes.length>500){reply(res,400,{error:'Слишком большой пакет изменений'});return true}
    const rows=data.changes.map(value=>{if(!Number.isSafeInteger(value.id)||value.id<=0||!['saved','watched',null].includes(value.status)||![null,'like','dislike'].includes(value.rating))throw Error('INVALID');return {user_id:active.user.id,item_id:value.id,status:value.status,rating:value.rating,corrections:cleanCorrections(value.corrections),card:cleanCard(value.card,value.id),updated_at:new Date().toISOString()}});
    const result=await api('/rest/v1/user_items?on_conflict=user_id,item_id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:rows});if(result.status>=300)throw Error('DATABASE');reply(res,200,{ok:true});return true;
   }
   reply(res,404,{error:'Не найдено'});return true;
  }catch(error){reply(res,error.message==='TOO_LARGE'?413:502,{error:'Не удалось связаться с аккаунтом. Проверь подключение и настройку базы.'});return true}
 };
}
function cleanCorrections(data){const out={};for(const key of ['light','inspire','think','surprise','laugh','tension'])if(data?.[key]===true)out[key]=true;return out}
function cleanCard(card,id){
 if(!card)return null;if(typeof card!=='object')throw Error('INVALID');
 const copy=JSON.parse(JSON.stringify(card));if(JSON.stringify(copy).length>30000)throw Error('INVALID');copy.id=id;
 const clean=text=>String(text).slice(0,12000).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 for(const key of ['title','symbol','desc','fullDesc','genre','statusLabel'])if(copy[key]!=null)copy[key]=clean(copy[key]);
 for(const key of ['genres','moods','countryCodes'])if(Array.isArray(copy[key]))copy[key]=copy[key].slice(0,30).map(clean);
 for(const key of ['image','source'])if(copy[key]){try{const u=new URL(copy[key]);if(u.protocol!=='https:'||!['image.tmdb.org','www.themoviedb.org','static.tvmaze.com','www.tvmaze.com'].includes(u.hostname))copy[key]=null}catch{copy[key]=null}}
 copy.moods=Array.isArray(copy.moods)?copy.moods:[];copy.genres=Array.isArray(copy.genres)?copy.genres:[];copy.title=copy.title||'Без названия';copy.desc=copy.desc||'Описание отсутствует';
 copy.type=copy.type==='series'?'series':'movie';copy.tmdb=copy.tmdb===true;
 for(const field of ['year','min','scoreRaw','votes','seasons'])if(copy[field]!=null)copy[field]=Number.isFinite(Number(copy[field]))?Number(copy[field]):null;
 copy.score=copy.score!=null&&Number.isFinite(Number(copy.score))?Number(copy.score).toFixed(1):null;copy.relaxation=0;
 copy.genreIds=Array.isArray(copy.genreIds)?copy.genreIds.filter(Number.isSafeInteger).slice(0,30):[];
 copy.countryCodes=Array.isArray(copy.countryCodes)?copy.countryCodes.filter(c=>/^[A-Z]{2}$/.test(c)):[];copy.countryNames=[];
 copy.bg='linear-gradient(135deg,#697f78,#343647)';return copy;
}
module.exports={createAccountHandler,cleanCard};
