import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getPool } from './db.js';

const scrypt = promisify(scryptCallback);
const hash = (v) => createHash('sha256').update(v).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
function cookieMap(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}
function error(reply, status, code, message) {
  return reply.code(status).send({ error: { code, message } });
}
async function makePasswordHash(password) {
  const salt = randomBytes(16);
  const key = Buffer.from(await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
  return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex');
}
async function checkPassword(password, stored) {
  const p = String(stored).split('$');
  if (p.length !== 3 || p[0] !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(p[1]) || !/^[a-f0-9]{128}$/i.test(p[2])) return false;
  const key = Buffer.from(await scrypt(password, Buffer.from(p[1], 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
  return safeEqual(key.toString('hex'), p[2].toLowerCase());
}

export async function registerAuthRoutes(app) {
  const secure = process.env.NODE_ENV === 'production';
  const sessionCookie = (v) => 'hx_session=' + encodeURIComponent(v) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800' + (secure ? '; Secure' : '');
  const csrfCookie = (v) => 'hx_csrf=' + encodeURIComponent(v) + '; Path=/; SameSite=Lax; Max-Age=604800' + (secure ? '; Secure' : '');
  const clear = ['hx_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (secure ? '; Secure' : ''), 'hx_csrf=; Path=/; SameSite=Lax; Max-Age=0' + (secure ? '; Secure' : '')];

  app.post('/api/v1/auth/register', { config: { rateLimit: { max: 4, timeWindow: '15 minutes' } },
    schema: { body: { type: 'object', additionalProperties: false, required: ['email','password','displayName'], properties: {
      email: { type: 'string', format: 'email', minLength: 5, maxLength: 254 },
      password: { type: 'string', minLength: 12, maxLength: 128 },
      displayName: { type: 'string', minLength: 2, maxLength: 80 }
    } } } }, async (req, reply) => {
    if (!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM)) {
      return error(reply, 503, 'REGISTRATION_UNAVAILABLE', 'Account registration is temporarily unavailable.');
    }
    const email = req.body.email.trim().toLowerCase();
    const name = req.body.displayName.trim();
    if (name.length < 2 || /[\u0000-\u001f\u007f]/.test(name)) return error(reply, 400, 'INVALID_NAME', 'Enter a valid display name.');
    const passwordHash = await makePasswordHash(req.body.password);
    const verifyToken = token();
    const client = await getPool().connect();
    let userId;
    try {
      await client.query('BEGIN');
      const created = await client.query('INSERT INTO users(email,password_hash,display_name,status) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id', [email,passwordHash,name,'pending_verification']);
      if (!created.rowCount) { await client.query('ROLLBACK'); return error(reply,409,'ACCOUNT_EXISTS','An account with that email already exists.'); }
      userId = created.rows[0].id;
      await client.query("INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')", [userId,hash(verifyToken)]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({ host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT), secure:process.env.SMTP_SECURE==='true', auth:{ user:process.env.SMTP_USER, pass:process.env.SMTP_PASSWORD }, connectionTimeout:8000, greetingTimeout:8000, socketTimeout:10000 });
      const url = new URL('/verify-email', process.env.FRONTEND_ORIGIN || 'http://localhost:5173');
      url.searchParams.set('token',verifyToken);
      await transporter.sendMail({ from:process.env.MAIL_FROM, to:email, subject:'Verify your HelzerX Cloud account', text:'Verify your email within 30 minutes: ' + url.toString() });
    } catch (e) {
      req.log.error({ event:'verification_email_failed', message:e.message }, 'Verification email delivery failed');
      await getPool().query("DELETE FROM users WHERE id=$1 AND status='pending_verification'", [userId]);
      return error(reply,503,'EMAIL_DELIVERY_FAILED','Email delivery failed. Please try registering again shortly.');
    }
    return reply.code(201).send({ data:{ message:'Check your email to verify your account.' } });
  });

  app.post('/api/v1/auth/verify-email', { config:{ rateLimit:{max:10,timeWindow:'15 minutes'} },
    schema:{body:{type:'object',additionalProperties:false,required:['token'],properties:{token:{type:'string',minLength:32,maxLength:128}}}} }, async (req,reply) => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT id,user_id FROM email_verification_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE',[hash(req.body.token)]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return error(reply,400,'INVALID_OR_EXPIRED_TOKEN','This verification link is invalid or expired.'); }
      await client.query("UPDATE users SET email_verified_at=NOW(),status='active',updated_at=NOW() WHERE id=$1 AND status='pending_verification'",[found.rows[0].user_id]);
      await client.query('UPDATE email_verification_tokens SET used_at=NOW() WHERE id=$1',[found.rows[0].id]);
      await client.query('COMMIT');
      return reply.send({data:{message:'Email verified. You can now sign in.'}});
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });

  app.post('/api/v1/auth/login', { config:{rateLimit:{max:8,timeWindow:'15 minutes'}},
    schema:{body:{type:'object',additionalProperties:false,required:['email','password'],properties:{email:{type:'string',format:'email',minLength:5,maxLength:254},password:{type:'string',minLength:1,maxLength:128}}}} }, async (req,reply) => {
    const result = await getPool().query('SELECT id,email,password_hash,display_name,role,status,email_verified_at FROM users WHERE LOWER(email)=LOWER($1)',[req.body.email.trim()]);
    const user = result.rows[0];
    const dummyHash = 'scrypt$00000000000000000000000000000000
    if (!user || !valid) return error(reply,401,'INVALID_CREDENTIALS','Email or password is incorrect.');
    if (user.status !== 'active' || !user.email_verified_at) return error(reply,403,'ACCOUNT_NOT_ACTIVE','Verify your email or contact support to access your account.');
    const session = token(); const csrf = token();
    await getPool().query("INSERT INTO sessions(user_id,token_hash,csrf_token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '7 days')",[user.id,hash(session),hash(csrf)]);
    reply.header('Set-Cookie',[sessionCookie(session),csrfCookie(csrf)]);
    return reply.send({data:{user:{id:user.id,email:user.email,displayName:user.display_name,role:user.role}}});
  });

  app.post('/api/v1/auth/logout', async (req,reply) => {
    const c = cookieMap(req.headers.cookie);
    if (c.hx_session) await getPool().query('UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL',[hash(c.hx_session)]);
    reply.header('Set-Cookie',clear);
    return reply.send({data:{message:'Signed out.'}});
  });
  app.get('/api/v1/auth/me',{preHandler:requireCustomerSession},async(req)=>({data:{user:req.customer}}));

  app.get('/api/v1/services',{preHandler:requireCustomerSession},async(req)=>{
    const result = await getPool().query('SELECT s.id,s.hostname,s.status,s.ipv4_address,s.created_at,p.title AS plan_title,p.ram_gb,p.cpu_cores,p.storage_gb FROM service_instances s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 ORDER BY s.created_at DESC',[req.customer.id]);
    return {data:result.rows};
  });

  app.post('/api/v1/services/:serviceId/actions',{preHandler:[requireCustomerSession,requireCsrf],
    schema:{params:{type:'object',required:['serviceId'],properties:{serviceId:{type:'string',format:'uuid'}}},
    body:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['start','stop','restart']}}}}},async(req,reply)=>{
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT s.id,s.status,o.status AS order_status FROM service_instances s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE',[req.params.serviceId,req.customer.id]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return error(reply,404,'SERVICE_NOT_FOUND','Service not found.'); }
      const service = found.rows[0];
      if (service.order_status !== 'active' || !['running','stopped'].includes(service.status)) { await client.query('ROLLBACK'); return error(reply,409,'SERVICE_NOT_ACTIONABLE','This service cannot perform that action right now.'); }
      if ((req.body.action==='start' && service.status==='running') || (req.body.action==='stop' && service.status==='stopped') || (req.body.action==='restart' && service.status!=='running')) { await client.query('ROLLBACK'); return error(reply,409,'INVALID_STATE','The service is already in that state.'); }
      const job = await client.query("INSERT INTO provisioning_jobs(service_instance_id,job_type,idempotency_key,status) VALUES($1,$2,$3,'queued') RETURNING id,status,created_at",[service.id,req.body.action,'customer-action:'+service.id+':'+token()]);
      await client.query("INSERT INTO audit_events(actor_user_id,action,target_type,target_id,outcome,request_id) VALUES($1,$2,'service_instance',$3,'success',$4)",[req.customer.id,'service.'+req.body.action+'.queued',service.id,req.id]);
      await client.query('COMMIT');
      return reply.code(202).send({data:{job:job.rows[0],message:'Action queued. It will run when the infrastructure worker is online.'}});
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
}

export async function requireCustomerSession(req,reply) {
  const c = cookieMap(req.headers.cookie);
  if (!c.hx_session) return error(reply,401,'AUTH_REQUIRED','Sign in to continue.');
  const result = await getPool().query('SELECT u.id,u.email,u.display_name,u.role,u.status,s.csrf_token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()',[hash(c.hx_session)]);
  const row = result.rows[0];
  if (!row || row.status!=='active') return error(reply,401,'SESSION_INVALID','Your session is invalid or expired.');
  req.customer = {id:row.id,email:row.email,displayName:row.display_name,role:row.role};
  req.sessionCsrfHash = row.csrf_token_hash;
}
async function requireCsrf(req,reply) {
  const c = cookieMap(req.headers.cookie);
  if (!c.hx_csrf || !safeEqual(hash(c.hx_csrf),req.sessionCsrfHash) || !safeEqual(req.headers['x-csrf-token'],c.hx_csrf)) {
    return error(reply,403,'CSRF_VALIDATION_FAILED','Refresh your session and try again.');
  }
}
 + '0'.repeat(128);
    const valid = await checkPassword(req.body.password,user ? user.password_hash : dummyHash);
    if (!user || !valid) return error(reply,401,'INVALID_CREDENTIALS','Email or password is incorrect.');
    if (user.status !== 'active' || !user.email_verified_at) return error(reply,403,'ACCOUNT_NOT_ACTIVE','Verify your email or contact support to access your account.');
    const session = token(); const csrf = token();
    await getPool().query("INSERT INTO sessions(user_id,token_hash,csrf_token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '7 days')",[user.id,hash(session),hash(csrf)]);
    reply.header('Set-Cookie',[sessionCookie(session),csrfCookie(csrf)]);
    return reply.send({data:{user:{id:user.id,email:user.email,displayName:user.display_name,role:user.role}}});
  });

  app.post('/api/v1/auth/logout', async (req,reply) => {
    const c = cookieMap(req.headers.cookie);
    if (c.hx_session) await getPool().query('UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL',[hash(c.hx_session)]);
    reply.header('Set-Cookie',clear);
    return reply.send({data:{message:'Signed out.'}});
  });
  app.get('/api/v1/auth/me',{preHandler:requireCustomerSession},async(req)=>({data:{user:req.customer}}));

  app.get('/api/v1/services',{preHandler:requireCustomerSession},async(req)=>{
    const result = await getPool().query('SELECT s.id,s.hostname,s.status,s.ipv4_address,s.created_at,p.title AS plan_title,p.ram_gb,p.cpu_cores,p.storage_gb FROM service_instances s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 ORDER BY s.created_at DESC',[req.customer.id]);
    return {data:result.rows};
  });

  app.post('/api/v1/services/:serviceId/actions',{preHandler:[requireCustomerSession,requireCsrf],
    schema:{params:{type:'object',required:['serviceId'],properties:{serviceId:{type:'string',format:'uuid'}}},
    body:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['start','stop','restart']}}}}},async(req,reply)=>{
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT s.id,s.status,o.status AS order_status FROM service_instances s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE',[req.params.serviceId,req.customer.id]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return error(reply,404,'SERVICE_NOT_FOUND','Service not found.'); }
      const service = found.rows[0];
      if (service.order_status !== 'active' || !['running','stopped'].includes(service.status)) { await client.query('ROLLBACK'); return error(reply,409,'SERVICE_NOT_ACTIONABLE','This service cannot perform that action right now.'); }
      if ((req.body.action==='start' && service.status==='running') || (req.body.action==='stop' && service.status==='stopped')) { await client.query('ROLLBACK'); return error(reply,409,'INVALID_STATE','The service is already in that state.'); }
      const job = await client.query("INSERT INTO provisioning_jobs(service_instance_id,job_type,idempotency_key,status) VALUES($1,$2,$3,'queued') RETURNING id,status,created_at",[service.id,req.body.action,'customer-action:'+service.id+':'+token()]);
      await client.query("INSERT INTO audit_events(actor_user_id,action,target_type,target_id,outcome,request_id) VALUES($1,$2,'service_instance',$3,'success',$4)",[req.customer.id,'service.'+req.body.action+'.queued',service.id,req.id]);
      await client.query('COMMIT');
      return reply.code(202).send({data:{job:job.rows[0],message:'Action queued. It will run when the infrastructure worker is online.'}});
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
}

export async function requireCustomerSession(req,reply) {
  const c = cookieMap(req.headers.cookie);
  if (!c.hx_session) return error(reply,401,'AUTH_REQUIRED','Sign in to continue.');
  const result = await getPool().query('SELECT u.id,u.email,u.display_name,u.role,u.status,s.csrf_token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()',[hash(c.hx_session)]);
  const row = result.rows[0];
  if (!row || row.status!=='active') return error(reply,401,'SESSION_INVALID','Your session is invalid or expired.');
  req.customer = {id:row.id,email:row.email,displayName:row.display_name,role:row.role};
  req.sessionCsrfHash = row.csrf_token_hash;
}
async function requireCsrf(req,reply) {
  const c = cookieMap(req.headers.cookie);
  if (!c.hx_csrf || !safeEqual(hash(c.hx_csrf),req.sessionCsrfHash) || !safeEqual(req.headers['x-csrf-token'],c.hx_csrf)) {
    return error(reply,403,'CSRF_VALIDATION_FAILED','Refresh your session and try again.');
  }
}
