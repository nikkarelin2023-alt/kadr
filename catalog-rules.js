(function(root){
 const countries={US:'США',GB:'Великобритания',FR:'Франция',DE:'Германия',KR:'Южная Корея',RU:'Россия'};
 const genres={comedy:[35,35],drama:[18,18],adventure:[12,10759],action:[28,10759],crime:[80,80],mystery:[9648,9648],fantasy:[14,10765],scifi:[878,10765],horror:[27,null],thriller:[53,null],romance:[10749,null],animation:[16,16],family:[10751,10751],documentary:[99,99]};
 // These are transparent genre heuristics, not claims about a film's emotional content.
 const moods={laugh:{include:[35],exclude:[18,27,53]},light:{include:[35,16,10751],exclude:[27,53,10752,10768]},inspire:{include:[12,10759,18,99],exclude:[27]},think:{include:[18,99,878,10765,9648],exclude:[]},surprise:{include:[9648,878,10765,12,10759,14],exclude:[]},tension:{include:[53,27,9648,80,28,10759],exclude:[]}};
 function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
 function isReleased(f,day=today()){const date=f.releaseDate||f.release_date||f.first_air_date;const type=f.media_type==='tv'||f.type==='series'?'series':'movie';const status=f.releaseStatus||f.status;return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&date<=day&&(type==='series'?!['Planned','Pilot','In Production'].includes(status):!status||status==='Released')}
 function moodMatches(f,mood){const r=moods[mood];if(!r)return true;const ids=f.genreIds||[];return ids.some(id=>r.include.includes(id))&&!ids.some(id=>r.exclude.includes(id))}
 function effective(p,level){return {...p,genres:level>=2?[]:p.genres,exclude:level>=2?[]:p.exclude,era:level>=3?[]:p.era,ratingEnabled:level<1&&p.ratingEnabled,mood:level>=4?'':p.mood}}
 function matches(f,p){
  if(p.format&&p.format!=='any'&&f.type!==p.format)return false;
  if(p.ended&&f.type==='series'&&f.statusLabel!=='Завершён')return false;
  if(p.countries?.length&&!p.countries.some(code=>(f.countryCodes||[]).includes(code)))return false;
  if(p.mood&&!moodMatches(f,p.mood))return false;
  const col=f.type==='series'?1:0,ids=f.genreIds||[];
  const include=(p.genres||[]).map(g=>genres[g]?.[col]).filter(Boolean),exclude=(p.exclude||[]).map(g=>genres[g]?.[col]).filter(Boolean);
  if(p.genres?.length&&(!include.length||!include.some(id=>ids.includes(id))))return false;
  if(exclude.some(id=>ids.includes(id)))return false;
  if(p.ratingEnabled&&(!(f.scoreRaw>=p.rating)||!(f.votes>=100)))return false;
  if(p.era?.length&&!p.era.some(e=>e==='old'?f.year>0&&f.year<2000:e==='zero'?f.year>=2000&&f.year<=2009:e==='ten'?f.year>=2010&&f.year<=2019:e==='new'?f.year>=2020:false))return false;
  return true;
 }
 const rules={today,isReleased,countries,genres,moods,moodMatches,effective,matches};if(typeof module!=='undefined')module.exports=rules;else root.CatalogRules=rules;
})(globalThis);
