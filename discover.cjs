const Rules=require('./catalog-rules.js');
const genres={comedy:[35,35],drama:[18,18],adventure:[12,10759],action:[28,10759],crime:[80,80],mystery:[9648,9648],fantasy:[14,10765],scifi:[878,10765],horror:[27,null],thriller:[53,null],romance:[10749,null],animation:[16,16],family:[10751,10751],documentary:[99,99]};
const cache=new Map();
function buildQueries(params){
 const page=Math.min(500,Math.max(1,Number(params.get('page'))||1));
 const selected=(params.get('genres')||'').split(',').filter(g=>genres[g]);
 const excluded=(params.get('exclude')||'').split(',').filter(g=>genres[g]);
 const rawRating=Number(params.get('rating'));
 const rating=Number.isFinite(rawRating)?Math.round(Math.min(9,Math.max(0,rawRating))*2)/2:7;
 const ratingEnabled=params.has('ratingEnabled')?params.get('ratingEnabled')==='1':params.has('rating')&&rating>0;
 const ranges={old:['','1999-12-31'],zero:['2000-01-01','2009-12-31'],ten:['2010-01-01','2019-12-31'],new:['2020-01-01','']};
 return (params.get('format')==='movie'?['movie']:params.get('format')==='series'?['tv']:['movie','tv']).flatMap(kind=>{
  const column=kind==='movie'?0:1;
  const moodRule=Rules.moods[params.get('mood')];
  const include=selected.filter(g=>!excluded.includes(g)).map(g=>genres[g][column]).filter(Boolean);
  if(selected.length&&!include.length)return [];
  const query=new URLSearchParams({language:'ru-RU',page:String(page),include_adult:'false',sort_by:'popularity.desc'});
  if(moodRule)query.set('with_genres',moodRule.include.join('|'));else if(include.length)query.set('with_genres',[...new Set(include)].join('|'));
  const omit=[...excluded.map(g=>genres[g][column]).filter(Boolean),...(moodRule?.exclude||[])];if((include.length&&include.every(id=>omit.includes(id)))||(moodRule&&moodRule.include.every(id=>omit.includes(id))))return [];if(omit.length)query.set('without_genres',[...new Set(omit)].join(','));
  if(ratingEnabled){query.set('vote_average.gte',String(rating));query.set('vote_count.gte','100')}
  const countries=[...new Set((params.get('countries')||'').split(',').filter(c=>Rules.countries[c]))];if(countries.length)query.set('with_origin_country',countries.join('|'));
  const datePrefix=kind==='movie'?'primary_release_date':'first_air_date';query.set(datePrefix+'.lte',Rules.today());if(kind==='movie')query.set('with_release_type','2|3|4|5|6');
  if(kind==='tv'&&params.get('ended')==='1')query.set('with_status','3');
  const chosen=['old','zero','ten','new'].filter(k=>(params.get('era')||'').split(',').includes(k));
  return (chosen.length?chosen:[null]).map(key=>{const q=new URLSearchParams(query);const range=ranges[key];if(range){const prefix=kind==='movie'?'primary_release_date':'first_air_date';if(range[0])q.set(prefix+'.gte',range[0]);if(range[1])q.set(prefix+'.lte',range[1]<Rules.today()?range[1]:Rules.today())}return {kind,url:'https://api.themoviedb.org/3/discover/'+kind+'?'+q}});
 }).filter(Boolean);
}
async function discover(params){
 const queries=buildQueries(params);if(!queries.length)return {items:[],hasMore:false};
 const key=JSON.stringify(queries),old=cache.get(key);if(old&&old.expires>Date.now())return old.value;
 const {tmdb,details}=require('./tmdb.cjs');const items=[];let hasMore=false;
 for(const q of queries){const endpoint=q.url.replace('https://api.themoviedb.org/3','');const list=await tmdb(endpoint);hasMore ||= list.page<Math.min(500,list.total_pages);items.push(...list.results.map(f=>({id:f.id,kind:q.kind})))}
 const value={items:(await details(items)).filter(f=>Rules.isReleased(f)),hasMore};if(cache.size>100)cache.delete(cache.keys().next().value);cache.set(key,{value,expires:Date.now()+3600000});return value;
}
module.exports={discover,buildQueries};
