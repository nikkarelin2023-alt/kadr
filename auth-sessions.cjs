const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createStore(dir=__dirname){
 const keyFile=path.join(dir,'.auth-key'),file=path.join(dir,'.auth-sessions');
 let key;if(fs.existsSync(keyFile))key=fs.readFileSync(keyFile);else{key=crypto.randomBytes(32);fs.writeFileSync(keyFile,key,{mode:0o600})}
 let data={};try{const bytes=fs.readFileSync(file);const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));data=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'))}catch{}
 const save=()=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const payload=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);fs.writeFileSync(file,Buffer.concat([iv,cipher.getAuthTag(),payload]),{mode:0o600})};
 return {get(id){const session=data[id];return session&&session.validUntil>Date.now()?session:null},set(id,value){data[id]=value;save()},delete(id){delete data[id];save()},create(value){for(const [id,s]of Object.entries(data))if(s.validUntil<Date.now())delete data[id];const id=crypto.randomBytes(32).toString('hex');this.set(id,{...value,validUntil:Date.now()+30*86400000});return id}};
}
module.exports={createStore};
