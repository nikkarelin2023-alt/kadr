const assert=require('node:assert/strict'),{Readable}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAccountHandler,cleanCard}=require('./account.cjs');
const {createStore}=require('./auth-sessions.cjs');
async function call(handler,route,{method='GET',body,cookie,origin='http://localhost:8080'}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;req.socket={remoteAddress:'127.0.0.1'};req.headers={host:'localhost:8080',origin,'content-type':'application/json',cookie};
 const response={writeHead(status,headers){this.status=status;this.headers=headers},end(value){this.data=JSON.parse(value)}};
 await handler(req,response,new URL(route,'http://localhost:8080'));return response;
}
(async()=>{
 const unavailable=createAccountHandler({env:{}});assert.equal((await call(unavailable,'/api/auth/config')).data.configured,false);assert.equal((await call(unavailable,'/api/auth/code',{method:'POST',body:{email:'test@example.com'}})).status,503);
 const values=new Map();const store={get:id=>values.get(id),set:(id,v)=>values.set(id,v),delete:id=>values.delete(id),create(v){values.set('session1',v);return 'session1'}};
 const user={id:'00000000-0000-0000-0000-000000000001',email:'test@example.com'};const requests=[];
 const handler=createAccountHandler({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key',NODE_ENV:'production'},store,transport:async(url,options)=>{requests.push({url,options});if(url.endsWith('/otp'))return {status:200,data:{}};if(url.endsWith('/verify'))return {status:200,data:{user,access_token:'PRIVATE_ACCESS',refresh_token:'PRIVATE_REFRESH',expires_at:Math.floor(Date.now()/1000)+3600}};if(url.includes('/rest/v1/'))return {status:options.method==='POST'?201:200,data:options.method==='POST'?null:[]};return {status:200,data:{}}}});
 assert.equal((await call(handler,'/api/auth/code',{method:'POST',body:{email:user.email},origin:'http://evil.example'})).status,403);assert.equal(requests.length,0);
 assert.equal((await call(handler,'/api/auth/code',{method:'POST',body:{email:user.email}})).status,200);
 const verify=await call(handler,'/api/auth/verify',{method:'POST',body:{email:user.email,code:'123456'}});assert.equal(verify.status,200);assert(!JSON.stringify(verify.data).includes('PRIVATE'));assert(verify.headers['Set-Cookie'].includes('HttpOnly'));assert(verify.headers['Set-Cookie'].includes('Secure'));
 const cookie='kadr_session=session1';assert.equal((await call(handler,'/api/auth/session',{cookie})).data.user.id,user.id);
 assert.equal((await call(handler,'/api/account/items')).status,401);
 assert.equal((await call(handler,'/api/account/items',{method:'POST',cookie,body:{changes:[{id:42,user_id:'someone-else',status:'saved',rating:null,corrections:{light:true},card:{id:42,title:'<script>bad</script>',type:'movie',bg:'" onclick="bad',score:'<img>',countryCodes:['RU','invalid']}}]}})).status,200);
 const saved=requests.findLast(x=>x.url.includes('/rest/v1/')&&x.options.method==='POST');assert.equal(saved.options.body[0].user_id,user.id);assert.equal(saved.options.headers.Authorization,'Bearer PRIVATE_ACCESS');assert(!saved.options.body[0].card.title.includes('<script>'));assert.equal(saved.options.body[0].card.score,null);
 assert.equal((await call(handler,'/api/auth/logout',{method:'POST',cookie,body:{}})).status,200);assert.equal((await call(handler,'/api/auth/session',{cookie})).data.user,null);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kadr-session-test-'));try{const encrypted=createStore(dir);const id=encrypted.create({access_token:'TEST_SECRET',validUntil:Date.now()+10000});assert(!fs.readFileSync(path.join(dir,'.auth-sessions')).includes(Buffer.from('TEST_SECRET')));assert.equal(createStore(dir).get(id).access_token,'TEST_SECRET');encrypted.delete(id);assert.equal(encrypted.get(id),null)}finally{for(const name of ['.auth-key','.auth-sessions'])fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir)}
 assert.equal(cleanCard({type:'series',countryCodes:['RU'],score:7.5},99).id,99);
 console.log('Passed: unconfigured state, origin checks, OTP/session/logout, private cookies, per-user writes, card sanitization, encrypted session persistence');
})().catch(error=>{console.error(error);process.exitCode=1});
