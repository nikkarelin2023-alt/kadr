const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
class SQLiteRepository {
 constructor(filename=process.env.DATABASE_PATH||path.join(__dirname,'data','kadr.sqlite')){
  if(filename!==':memory:')fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(filename);this.filename=filename;
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT;');
  for(const name of fs.readdirSync(path.join(__dirname,'migrations')).filter(n=>n.endsWith('.sql')).sort()){
   this.transaction(()=>{if(this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(name))return;this.db.exec(fs.readFileSync(path.join(__dirname,'migrations',name),'utf8'));this.db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name,Date.now())});
  }
 }
 transaction(action){this.db.exec('BEGIN IMMEDIATE');try{const result=action();this.db.exec('COMMIT');return result}catch(error){this.db.exec('ROLLBACK');throw error}}
 limit(bucket,max,window,now=Date.now()){return this.transaction(()=>{this.db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);this.db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(bucket,now+window);return this.db.prepare('SELECT count FROM rate_limits WHERE bucket=?').get(bucket).count<=max})}
 issueCode(email,code,now=Date.now()){
  const salt=crypto.randomBytes(16).toString('hex'),value=crypto.scryptSync(code,salt,32).toString('hex');
  this.db.prepare('INSERT INTO email_codes VALUES (?,?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,salt=excluded.salt,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at').run(email,value,salt,now+600000,now);
 }
 invalidateCode(email){this.db.prepare('DELETE FROM email_codes WHERE email=?').run(email)}
 recentCode(email,now=Date.now()){const row=this.db.prepare('SELECT sent_at FROM email_codes WHERE email=?').get(email);return row&&now-row.sent_at<60000}
 verifyCode(email,code,now=Date.now()){
  return this.transaction(()=>{const row=this.db.prepare('SELECT * FROM email_codes WHERE email=?').get(email);if(!row||row.expires_at<=now||row.attempts>=5)return null;
   const actual=crypto.scryptSync(code,row.salt,32);if(!crypto.timingSafeEqual(actual,Buffer.from(row.code_hash,'hex'))){this.db.prepare('UPDATE email_codes SET attempts=attempts+1 WHERE email=?').run(email);return null}
   this.db.prepare('DELETE FROM email_codes WHERE email=?').run(email);
   this.db.prepare('INSERT INTO users VALUES (?,?,?) ON CONFLICT(email) DO NOTHING').run(crypto.randomUUID(),email,now);
   const user=this.db.prepare('SELECT id,email FROM users WHERE email=?').get(email),token=crypto.randomBytes(32).toString('hex');
   this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token),user.id,now+30*86400000,now);return {user,token};
  });
 }
 session(token,now=Date.now()){if(!/^[a-f0-9]{64}$/.test(token||''))return null;return this.db.prepare('SELECT users.id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(hash(token),now)||null}
 logout(token){if(token)this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token))}
 items(userId){return this.db.prepare('SELECT * FROM user_items WHERE user_id=? ORDER BY item_id').all(userId).map(row=>({...row,corrections:JSON.parse(row.corrections),card:row.card?JSON.parse(row.card):null}))}
 saveItems(userId,rows){this.transaction(()=>{const statement=this.db.prepare('INSERT INTO user_items VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET status=excluded.status,rating=excluded.rating,corrections=excluded.corrections,card=excluded.card,updated_at=excluded.updated_at');for(const row of rows)statement.run(userId,row.item_id,row.status,row.rating,JSON.stringify(row.corrections),row.card?JSON.stringify(row.card):null,Date.now())})}
 health(){return this.db.prepare('SELECT 1 AS ok').get().ok===1}
 async backup(destination){fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true,mode:0o700});await backup(this.db,destination)}
 close(){this.db.close()}
}
module.exports={SQLiteRepository};
