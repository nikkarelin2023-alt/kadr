function mailConfigured(env=process.env){return ['SMTP_HOST','SMTP_USER','SMTP_PASS','SMTP_FROM'].every(key=>Boolean(env[key]?.trim()))}
function createTransport(env=process.env){
 if(!mailConfigured(env))throw Error('MAIL_NOT_CONFIGURED');
 const mailer=require('nodemailer');const port=Number(env.SMTP_PORT||587);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_SMTP_PORT');
 const host=env.SMTP_HOST.trim();const password=host==='smtp.gmail.com'?env.SMTP_PASS.replace(/\s/g,''):env.SMTP_PASS;
 return mailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user:env.SMTP_USER.trim(),pass:password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
}
async function sendCode(email,code,env=process.env){
 const transport=createTransport(env);
 try{await transport.sendMail({from:env.SMTP_FROM,to:email,subject:'Код для входа в Кадр',text:`Твой код для входа: ${code}\nКод действует 10 минут. Если ты не запрашивал вход, проигнорируй письмо.`})}finally{transport.close()}
}
async function verifySMTP(env=process.env){const transport=createTransport(env);try{await transport.verify()}finally{transport.close()}}
module.exports={sendCode,mailConfigured,verifySMTP};
