const Rules=require('./catalog-rules.js');
const {tmdb,details}=require('./tmdb.cjs');
async function search(params){const id=Number(params.get('id')),kind=params.get('type');if(Number.isSafeInteger(id)&&id>0&&['movie','tv'].includes(kind))return {items:await details([{id,kind}]),hasMore:false};
 const query=(params.get('q')||'').trim().slice(0,150),page=Math.min(500,Math.max(1,Number(params.get('page'))||1));if(!query)return {items:[],hasMore:false};
 const list=await tmdb('/search/multi?'+new URLSearchParams({query,page:String(page),language:'ru-RU',include_adult:'false'}));const items=await details(list.results.filter(f=>['movie','tv'].includes(f.media_type)).map(f=>({id:f.id,kind:f.media_type})));return {items:items.filter(f=>Rules.isReleased(f)),hasMore:list.page<Math.min(500,list.total_pages)};
}
module.exports={search};
