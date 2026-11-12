const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Rules=require('./catalog-rules.js');
const storage=new Map([['kadr-v1',JSON.stringify({saved:[1],watched:[],ratings:{},entries:{}})]]);
const originalGuest=storage.get('kadr-v1');
const el={classList:{toggle(){},remove(){}},querySelector(){return el},querySelectorAll(){return []},addEventListener(){},append(){},setAttribute(){}};
const context=vm.createContext({document:{querySelector(){return el},querySelectorAll(){return []},body:el},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},location:{protocol:'file:'},console,queueMicrotask,URLSearchParams,CatalogRules:Rules,setTimeout(){return 1},clearTimeout(){}});
for(const file of ['app.js','discovery.js','collection.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const auth=fs.readFileSync('auth.js','utf8');vm.runInContext(auth.slice(0,auth.indexOf("document.querySelector('#account-button').onclick")),context);
vm.runInContext(`render=()=>{};toast=()=>{};posts=[];fetch=async(url,options)=>({ok:true,json:async()=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true}}return {items:[{item_id:42,status:'saved',rating:null,corrections:{},card:{id:42,title:'Cloud film',genreIds:[35],type:'movie',moods:['light']}}]}}});`,context);
(async()=>{
 await vm.runInContext("loadAccount({id:'user-a',email:'test@example.com'})",context);
 assert.equal(vm.runInContext('state.saved[0]',context),42);assert.equal(storage.get('kadr-v1'),originalGuest);
 vm.runInContext("state.saved=[];state.watched=[42];persist()",context);await vm.runInContext('syncAccount()',context);
 assert.equal(vm.runInContext('posts[0].changes[0].status',context),'watched');assert.equal(storage.get('kadr-v1'),originalGuest);
 await vm.runInContext('syncAccount()',context);assert.equal(vm.runInContext('posts.length',context),1);
 vm.runInContext("state.watched=[];persist()",context);await vm.runInContext('syncAccount()',context);assert.equal(vm.runInContext('posts[1].changes[0].status',context),null);
 vm.runInContext("state.saved=[42];fetch=async()=>({ok:false,json:async()=>({error:'offline'})})",context);await vm.runInContext('syncAccount()',context);assert.equal(vm.runInContext('account.syncError',context),'offline');assert.equal(vm.runInContext('state.saved[0]',context),42);
 console.log('Passed: guest/account isolation, per-item synchronization, no duplicate writes, removals, retained local edits on failure');
})().catch(error=>{console.error(error);process.exitCode=1});
