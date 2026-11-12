const fs=require('node:fs'),path=require('node:path');
const envFile=path.join(__dirname,'..','.env.local');if(fs.existsSync(envFile))process.loadEnvFile(envFile);
const {SQLiteRepository}=require('../database.cjs');
const source=new SQLiteRepository();const target=path.resolve(process.argv[2]||path.join('backups','kadr-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'));
if(source.filename!==':memory:'&&path.resolve(source.filename)===target){source.close();throw Error('Backup must use a different path')}
if(fs.existsSync(target)){source.close();throw Error('Backup target already exists')}
source.backup(target).then(()=>console.log('Backup saved: '+target)).catch(()=>{console.error('Backup failed');process.exitCode=1}).finally(()=>source.close());
