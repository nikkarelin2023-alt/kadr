const {spawn}=require('node:child_process');
// Use the same Windows network stack as the existing TMDB adapter.
const shell=process.env.KADR_POWERSHELL||'C:\\Users\\User\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe';
async function request(url,{method='GET',headers={},body}={}){
 if(process.platform!=='win32'||process.env.KADR_NETWORK==='fetch'){
  const response=await fetch(url,{method,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const text=await response.text();return {status:response.status,data:text?JSON.parse(text):null};
 }
 const script=`$ErrorActionPreference='Stop';[Console]::InputEncoding=[System.Text.Encoding]::UTF8;[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
 $inputData=ConvertFrom-Json ([Console]::In.ReadToEnd()) -AsHashtable
 $p=@{Uri=$inputData.url;Method=$inputData.method;Headers=$inputData.headers;TimeoutSec=25;SkipHttpErrorCheck=$true}
 if($inputData.ContainsKey('body')){$p.Body=ConvertTo-Json -InputObject $inputData.body -Depth 40 -Compress;$p.ContentType='application/json; charset=utf-8'}
 $response=Invoke-WebRequest @p
 ConvertTo-Json -InputObject @{status=[int]$response.StatusCode;body=[string]$response.Content} -Compress`;
 return new Promise((resolve,reject)=>{
  const child=spawn(shell,['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',size=0;const timer=setTimeout(()=>{child.kill();reject(new Error('NETWORK_ERROR'))},35000);
  child.stdout.setEncoding('utf8');
  child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>12000000){child.kill();return}output+=chunk.toString('utf8')});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('NETWORK_ERROR'))});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('NETWORK_ERROR'));try{const response=JSON.parse(output.replace(/^\uFEFF/,''));resolve({status:response.status,data:response.body?JSON.parse(response.body):null})}catch{reject(new Error('NETWORK_ERROR'))}});
  child.stdin.end(JSON.stringify({url,method,headers,...(body===undefined?{}:{body})}));
 });
}
module.exports={request};
