const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
// Local secrets are read only by the server and are never served as static files.
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const files = {'/auth.js':'auth.js','/catalog-rules.js':'catalog-rules.js','/collection.js':'collection.js','/discovery.js':'discovery.js','/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const {execFile}=require('node:child_process');
function requestTV(endpoint){return new Promise((resolve,reject)=>{execFile("C:\\Users\\User\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe",['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; (Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 'https://api.tvmaze.com"+endpoint+"').Content"],{timeout:25000,maxBuffer:10000000,windowsHide:true},(err,out)=>{if(err)return reject(err);try{resolve(JSON.parse(out.replace(/^\uFEFF/,'')))}catch(e){reject(e)}})})}
const seasonCache=new Map();
let cache=null,expires=0,pending=null;
function loadCatalog(){
 if(cache&&Date.now()<expires)return Promise.resolve(cache);
 if(pending)return pending;
 pending=requestTV('/shows?page=0').then(data=>{cache=data;expires=Date.now()+3600000;return data}).finally(()=>pending=null);return pending;
}
let tmdbCache=null,tmdbPending=null,tmdbExpires=0;
function loadTMDB(){
 if(tmdbCache&&Date.now()<tmdbExpires)return Promise.resolve(tmdbCache);
 if(tmdbPending)return tmdbPending;
 if(!process.env.TMDB_READ_TOKEN?.trim())return Promise.reject(new Error('TOKEN_MISSING'));
 const script=`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
 $headers=@{Authorization='Bearer '+$env:TMDB_READ_TOKEN}
 $items=@(); foreach($kind in @('movie','tv')) { $list=Invoke-RestMethod -Uri ('https://api.themoviedb.org/3/'+$kind+'/popular?language=ru-RU&page=1') -Headers $headers -TimeoutSec 20; foreach($item in $list.results){$items+=@{id=$item.id;kind=$kind}} }
 $result=@($items | ForEach-Object -Parallel { $ErrorActionPreference='Stop'; $h=@{Authorization='Bearer '+$env:TMDB_READ_TOKEN}; $d=Invoke-RestMethod -Uri ('https://api.themoviedb.org/3/'+$_.kind+'/'+$_.id+'?language=ru-RU') -Headers $h -TimeoutSec 20; $d | Add-Member -NotePropertyName media_type -NotePropertyValue $_.kind; $d } -ThrottleLimit 5)
 ConvertTo-Json -InputObject $result -Depth 30 -Compress`;
 tmdbPending=new Promise((resolve,reject)=>execFile("C:\\Users\\User\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe",['-NoProfile','-NonInteractive','-Command',script],{timeout:150000,maxBuffer:15000000,windowsHide:true},(err,out)=>{if(err)return reject(new Error('TMDB_UNAVAILABLE'));try{const data=JSON.parse(out.replace(/^\uFEFF/,''));if(!Array.isArray(data)||!data.length)throw Error();tmdbCache=data;tmdbExpires=Date.now()+3600000;resolve(data)}catch{reject(new Error('TMDB_INVALID_RESPONSE'))}})).finally(()=>tmdbPending=null);return tmdbPending;
}
const {discover}=require('./discover.cjs');
const {search}=require('./search.cjs');
const accountHandler=require('./account.cjs').createAccountHandler();
http.createServer(async(req,res)=>{
 const requestUrl=new URL(req.url,'http://localhost');
 if(await accountHandler(req,res,requestUrl))return;
 if(requestUrl.pathname==='/api/search'){try{const result=await search(requestUrl.searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify(result))}catch{res.writeHead(502);return res.end('{}')}}
 if(requestUrl.pathname==='/api/discover'){try{const result=await discover(requestUrl.searchParams);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify(result))}catch{res.writeHead(502,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Не удалось загрузить подборку TMDB'}))}}

 if(new URL(req.url,'http://localhost').pathname==='/api/tmdb/catalog'){
 try{const data=await loadTMDB();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify(data))}catch{res.statusCode=502;return res.end(JSON.stringify({error:'TMDB unavailable'}))}
 }
 const seasonMatch=new URL(req.url,'http://localhost').pathname.match(/^\/api\/seasons\/(\d+)$/);
 if(seasonMatch){try{const id=seasonMatch[1];if(!seasonCache.has(id))seasonCache.set(id,await requestTV('/shows/'+id+'/seasons'));res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(seasonCache.get(id)))}catch{res.writeHead(502);return res.end('{}')}}
 if(new URL(req.url,'http://localhost').pathname==='/api/catalog'){
 try{const data=await loadCatalog();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify(data))}catch(e){res.writeHead(502,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Catalog unavailable'}))}
 }

  const file=files[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);return res.end('Not found');}
  fs.readFile(path.join(__dirname,file),(error,data)=>{
    if(error){res.writeHead(500);return res.end('Unable to read file');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});
    res.end(data);
  });
}).listen(8080,'0.0.0.0',()=>console.log('Kadr: http://localhost:8080'));

