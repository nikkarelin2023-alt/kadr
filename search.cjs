const Rules=require('./catalog-rules.js');
const {execFile}=require('node:child_process');
const shell='C:\\Users\\User\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe';
function search(params){
 const detailId=Number(params.get('id'));const detailType=params.get('type');const isDetail=Number.isSafeInteger(detailId)&&detailId>0&&['movie','tv'].includes(detailType);
 const query=(params.get('q')||'').trim().slice(0,150);const page=Math.min(500,Math.max(1,Number(params.get('page'))||1));
 if(!query&&!isDetail)return Promise.resolve({items:[],hasMore:false});
 const url=isDetail?'https://api.themoviedb.org/3/'+detailType+'/'+detailId+'?language=ru-RU':'https://api.themoviedb.org/3/search/multi?'+new URLSearchParams({query,language:'ru-RU',include_adult:'false',page:String(page)});
 const script=isDetail?`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$h=@{Authorization='Bearer '+$env:TMDB_READ_TOKEN};$d=Invoke-RestMethod -Uri $env:KADR_SEARCH_URL -Headers $h -TimeoutSec 20;$d|Add-Member -NotePropertyName media_type -NotePropertyValue $env:KADR_DETAIL_TYPE;ConvertTo-Json -InputObject @{items=@($d);hasMore=$false} -Depth 30 -Compress`:`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
 $h=@{Authorization='Bearer '+$env:TMDB_READ_TOKEN};$list=Invoke-RestMethod -Uri $env:KADR_SEARCH_URL -Headers $h -TimeoutSec 20
 $items=@($list.results | Where-Object {$_.media_type -eq 'movie' -or $_.media_type -eq 'tv'} | ForEach-Object -Parallel {$ErrorActionPreference='Stop';$h=@{Authorization='Bearer '+$env:TMDB_READ_TOKEN};$d=Invoke-RestMethod -Uri ('https://api.themoviedb.org/3/'+$_.media_type+'/'+$_.id+'?language=ru-RU') -Headers $h -TimeoutSec 20;$d|Add-Member -NotePropertyName media_type -NotePropertyValue $_.media_type;$d} -ThrottleLimit 5)
 ConvertTo-Json -InputObject @{items=$items;hasMore=($list.page -lt [Math]::Min(500,$list.total_pages))} -Depth 30 -Compress`;
 return new Promise((resolve,reject)=>execFile(shell,['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,KADR_SEARCH_URL:url,KADR_DETAIL_TYPE:detailType||''},windowsHide:true,timeout:150000,maxBuffer:10000000},(err,out)=>{if(err)return reject(new Error('Search unavailable'));try{const data=JSON.parse(out.replace(/^\uFEFF/,''));if(!isDetail)data.items=data.items.filter(f=>Rules.isReleased(f));resolve(data)}catch{reject(new Error('Invalid response'))}}));
}
module.exports={search};
