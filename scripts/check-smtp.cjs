const fs=require('node:fs'),path=require('node:path');
const config=path.join(__dirname,'..','.env.local');if(fs.existsSync(config))process.loadEnvFile(config);
const {verifySMTP}=require('../mailer.cjs');
verifySMTP().then(()=>console.log('SMTP: соединение, TLS и авторизация проверены. Письма не отправлялись.')).catch(error=>{
 const messages={MAIL_NOT_CONFIGURED:'Заполни SMTP_USER, SMTP_PASS и SMTP_FROM в .env.local.',INVALID_SMTP_PORT:'Проверь SMTP_PORT.',EAUTH:'Gmail отклонил вход. Проверь адрес и пароль приложения.',ETIMEDOUT:'Сервер не ответил. Проверь сеть и доступность SMTP-порта.',ESOCKET:'Ошибка подключения или TLS. Проверь сеть и настройки SMTP.',ECONNECTION:'Не удалось подключиться к SMTP-серверу.',EDNS:'Не удалось определить адрес SMTP-сервера.'};
 console.error('SMTP: '+(messages[error.code||error.message]||'Проверка не прошла. Проверь настройки SMTP.'));process.exitCode=1;
});
