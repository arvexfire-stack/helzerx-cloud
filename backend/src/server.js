import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerAuthRoutes } from './auth.js';

const env = process.env;
const nodeEnv = env.NODE_ENV ?? 'development';
const host = env.HOST ?? '127.0.0.1';
const port = Number(env.PORT ?? 4000);
const frontendOrigin = env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
if (nodeEnv === 'production' && (!env.FRONTEND_ORIGIN || !/^https:\/\//i.test(env.FRONTEND_ORIGIN))) {
  throw new Error('Production requires an HTTPS FRONTEND_ORIGIN');
}
const app = Fastify({
  logger: { level: nodeEnv === 'production' ? 'info' : 'debug', redact: [
    'req.headers.authorization','req.headers.cookie','res.headers.set-cookie',
    '*.password','*.token','*.secret','*.apiKey'
  ] },
  bodyLimit: 1024 * 1024, trustProxy: false, requestTimeout: 15000, connectionTimeout: 10000
});
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
  origin(origin, callback) {
    if (!origin || origin === frontendOrigin) return callback(null, true);
    callback(new Error('Origin not allowed'), false);
  },
  credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/health', { config: { rateLimit: false } }, async () => ({ status:'ok', service:'helzerx-cloud-api' }));

const plans = [
  { id:'HXC-V02', ramGb:2, cpuCores:2, storageGb:30, monthlyUsdCents:229 },
  { id:'HXC-V04', ramGb:4, cpuCores:2, storageGb:60, monthlyUsdCents:349 },
  { id:'HXC-V06', ramGb:6, cpuCores:3, storageGb:90, monthlyUsdCents:469 },
  { id:'HXC-V08', ramGb:8, cpuCores:4, storageGb:120, monthlyUsdCents:569 },
  { id:'HXC-V12', ramGb:12, cpuCores:4, storageGb:160, monthlyUsdCents:799 },
  { id:'HXC-V16', ramGb:16, cpuCores:6, storageGb:220, monthlyUsdCents:999 },
  { id:'HXC-V24', ramGb:24, cpuCores:8, storageGb:320, monthlyUsdCents:1349 },
  { id:'HXC-V32', ramGb:32, cpuCores:10, storageGb:400, monthlyUsdCents:1549 },
  { id:'HXC-V48', ramGb:48, cpuCores:12, storageGb:600, monthlyUsdCents:1799 },
  { id:'HXC-V64', ramGb:64, cpuCores:16, storageGb:800, monthlyUsdCents:2199 }
];
app.get('/api/v1/plans', async () => ({ data:plans.map((p)=>({...p,currency:'USD',billingInterval:'month',serviceType:'lxc'})) }));

await registerAuthRoutes(app);

app.setNotFoundHandler(async (request,reply)=>reply.code(404).send({
  error:{code:'NOT_FOUND',message:'The requested API route was not found.'},requestId:request.id
}));
app.setErrorHandler(async(error,request,reply)=>{
  request.log.error({err:error,requestId:request.id},'Request failed');
  const statusCode = error.statusCode && error.statusCode>=400 && error.statusCode<500 ? error.statusCode : 500;
  return reply.code(statusCode).send({error:{
    code:statusCode===500?'INTERNAL_ERROR':'REQUEST_ERROR',
    message:statusCode===500?'An unexpected error occurred.':error.message
  },requestId:request.id});
});
const shutdown = async(signal)=>{
  app.log.info({signal},'Shutting down API');
  try { await app.close(); process.exit(0); }
  catch(error) { app.log.error({err:error},'Graceful shutdown failed'); process.exit(1); }
};
process.once('SIGINT',()=>void shutdown('SIGINT'));
process.once('SIGTERM',()=>void shutdown('SIGTERM'));
try { await app.listen({host,port}); }
catch(error) { app.log.error({err:error},'Unable to start API'); process.exit(1); }
