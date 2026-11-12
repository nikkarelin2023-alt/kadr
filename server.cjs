const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const envFile=path.join(__dirname,'.env.local');if(fs.existsSync(envFile))process.loadEnvFile(envFile);
if(process.env.NODE_ENV==='production'&&!/^https:\/\/[^/]+$/.test(process.env.APP_ORIGIN||''))throw Error('Set APP_ORIGIN to your HTTPS origin for production');
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/catalog-rules.js':'catalog-rules.js','/discovery.js':'discovery.js','/collection.js':'collection.js','/auth.js':'auth.js'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const accountHandler=require('./account.cjs').createAccountHandler();
const {discover}=require('./discover.cjs'),{search}=require('./search.cjs'),{json,tmdb,details}=require('./tmdb.cjs'),Rules=require('./catalog-rules.js');
const respond=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');if(await accountHandler(req,res,url))return;
 if(url.pathname==='/api/discover')return respond(res,200,await discover(url.searchParams));
 if(url.pathname==='/api/search')return respond(res,200,await search(url.searchParams));
 if(url.pathname==='/api/catalog')return respond(res,200,await json('https://api.tvmaze.com/shows?page=0'));
 const season=url.pathname.match(/^\/api\/seasons\/(\d+)$/);if(season)return respond(res,200,await json('https://api.tvmaze.com/shows/'+season[1]+'/seasons'));
 if(url.pathname==='/api/tmdb/catalog'){const items=[];for(const kind of ['movie','tv']){const page=await tmdb('/'+kind+'/popular?language=ru-RU&page=1');items.push(...page.results.map(f=>({id:f.id,kind})))}return respond(res,200,(await details(items)).filter(f=>Rules.isReleased(f)))}
 const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found')}
 const data=await fs.promises.readFile(path.join(__dirname,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
 }catch{if(!res.headersSent)respond(res,502,{error:'Сервис временно недоступен. Попробуй ещё раз.'});else res.end()}
});
server.requestTimeout=180000;server.headersTimeout=20000;
server.listen(Number(process.env.PORT||8080),process.env.HOST||'0.0.0.0',()=>console.log('Kadr listening on port '+(process.env.PORT||8080)));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>{accountHandler.close();process.exit(0)});setTimeout(()=>process.exit(1),15000).unref()});
