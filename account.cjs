const crypto=require('node:crypto');
const {SQLiteRepository}=require('./database.cjs');
const Mail=require('./mailer.cjs');
function createAccountHandler({repository,sendCode=Mail.sendCode,env=process.env}={}){
 const db=repository||new SQLiteRepository(env.DATABASE_PATH);
 const cookie=id=>`kadr_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${id?2592000:0}${env.NODE_ENV==='production'?'; Secure':''}`;
 const sid=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('kadr_session='))?.slice(13);
 const reply=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))};
 async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2000000)throw Error('TOO_LARGE');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
 const address=req=>env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
 const handler=async(req,res,url)=>{
  if(url.pathname==='/api/health'){reply(res,db.health()?200:503,{ok:db.health()});return true}
  if(!url.pathname.startsWith('/api/auth/')&&!url.pathname.startsWith('/api/account/'))return false;
  if(url.pathname==='/api/auth/config'){reply(res,200,{configured:Mail.mailConfigured(env),database:'sqlite',storageReady:db.health()});return true}
  if(req.method!=='GET'){let origin;try{origin=new URL(req.headers.origin).origin}catch{}const expected=env.APP_ORIGIN||(env.NODE_ENV==='production'?null:'http://'+req.headers.host);if(origin!==expected||!String(req.headers['content-type']||'').startsWith('application/json')){reply(res,403,{error:'Запрос отклонён'});return true}}
  try{
   if(url.pathname==='/api/auth/code'&&req.method==='POST'){
    if(!Mail.mailConfigured(env)){reply(res,503,{error:'База SQLite готова. Для отправки кодов нужно настроить SMTP.'});return true}
    const data=await body(req),email=String(data.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){reply(res,400,{error:'Проверь адрес почты'});return true}
    const emailHash=crypto.createHash('sha256').update(email).digest('hex');
    if(db.recentCode(email)||!db.limit('email:'+emailHash,5,3600000)||!db.limit('send:'+address(req),30,3600000)){reply(res,429,{error:'Слишком много запросов. Попробуй позже.'});return true}
    const code=String(crypto.randomInt(100000,1000000));db.issueCode(email,code);
    try{await sendCode(email,code,env)}catch{db.invalidateCode(email);reply(res,502,{error:'Не удалось отправить письмо. Проверь SMTP или попробуй позже.'});return true}
    reply(res,200,{ok:true});return true;
   }
   if(url.pathname==='/api/auth/verify'&&req.method==='POST'){
    if(!db.limit('verify:'+address(req),15,300000)){reply(res,429,{error:'Слишком много попыток. Подожди несколько минут.'});return true}
    const data=await body(req),email=String(data.email||'').trim().toLowerCase(),code=String(data.code||'');if(!/^\d{6}$/.test(code)){reply(res,400,{error:'Введи шестизначный код из письма'});return true}
    const result=db.verifyCode(email,code);if(!result){reply(res,400,{error:'Код неверный или истёк. Запроси новый.'});return true}
    reply(res,200,{user:result.user},{'Set-Cookie':cookie(result.token)});return true;
   }
   if(url.pathname==='/api/auth/logout'&&req.method==='POST'){db.logout(sid(req));reply(res,200,{ok:true},{'Set-Cookie':cookie('')});return true}
   const user=db.session(sid(req));
   if(url.pathname==='/api/auth/session'&&req.method==='GET'){reply(res,200,{user});return true}
   if(!user){reply(res,401,{error:'Войди снова, чтобы синхронизировать коллекцию'});return true}
   if(url.pathname==='/api/account/items'&&req.method==='GET'){reply(res,200,{items:db.items(user.id).map(row=>({...row,corrections:cleanCorrections(row.corrections),card:cleanCard(row.card,row.item_id)}))});return true}
   if(url.pathname==='/api/account/items'&&req.method==='POST'){
    const data=await body(req);if(!Array.isArray(data.changes)||data.changes.length>500){reply(res,400,{error:'Слишком большой пакет изменений'});return true}
    const rows=data.changes.map(value=>{if(!Number.isSafeInteger(value.id)||value.id<=0||!['saved','watched',null].includes(value.status)||![null,'like','dislike'].includes(value.rating))throw Error('INVALID');return {item_id:value.id,status:value.status,rating:value.rating,corrections:cleanCorrections(value.corrections),card:cleanCard(value.card,value.id)}});db.saveItems(user.id,rows);reply(res,200,{ok:true});return true;
   }
   reply(res,404,{error:'Не найдено'});return true;
  }catch(error){const status=error.message==='TOO_LARGE'?413:error.message==='INVALID'||error instanceof SyntaxError?400:500;reply(res,status,{error:status===400?'Некорректные данные':'Не удалось сохранить данные. Попробуй ещё раз.'});return true}
 };
 handler.close=()=>db.close();return handler;
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
