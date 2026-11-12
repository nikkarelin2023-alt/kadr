const {request}=require('./network.cjs');
const pending=new Map(),cache=new Map();
async function json(url,headers={}){
 const cached=cache.get(url);if(cached&&cached.until>Date.now())return cached.data;
 if(pending.has(url))return pending.get(url);
 const promise=request(url,{headers}).then(response=>{if(response.status>=300)throw Error('Upstream API unavailable');if(cache.size>=1000)cache.delete(cache.keys().next().value);cache.set(url,{data:response.data,until:Date.now()+3600000});return response.data}).finally(()=>pending.delete(url));pending.set(url,promise);return promise;
}
async function tmdb(endpoint){if(!process.env.TMDB_READ_TOKEN)throw Error('TMDB not configured');return json('https://api.themoviedb.org/3'+endpoint,{Authorization:'Bearer '+process.env.TMDB_READ_TOKEN})}
async function details(items){const result=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(5,items.length)},async()=>{while(cursor<items.length){const index=cursor++,item=items[index];result[index]={...await tmdb('/'+item.kind+'/'+item.id+'?language=ru-RU'),media_type:item.kind}}}));return result}
module.exports={json,tmdb,details};
