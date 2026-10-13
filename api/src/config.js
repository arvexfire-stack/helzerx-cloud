import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  ORDERING_ENABLED: z.enum(['true', 'false']).default('false'),
  DISCORD_SERVICE_TOKEN: z.string().default(''),
  DISCORD_GUILD_ID: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  CORS_ORIGINS: z.string().default('https://cloud.helzerx.cyou'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map(issue => issue.path.join('.'));
    throw new Error(`Invalid API configuration: ${fields.join(', ')}`);
  }
  const value = parsed.data;
  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    host: value.API_HOST,
    port: value.API_PORT,
    appBaseUrl: value.APP_BASE_URL,
    databaseUrl: value.DATABASE_URL,
    databaseSsl: value.DATABASE_SSL === 'true',
    orderingEnabled: value.ORDERING_ENABLED === 'true',
    discordServiceToken: value.DISCORD_SERVICE_TOKEN,
    discordGuildId: value.DISCORD_GUILD_ID,
    trustProxy: value.TRUST_PROXY === 'true',
    corsOrigins: new Set(value.CORS_ORIGINS.split(',').map(x => x.trim()).filter(Boolean)),
    logLevel: value.LOG_LEVEL
  });
}