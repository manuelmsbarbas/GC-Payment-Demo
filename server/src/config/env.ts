import dotenv from 'dotenv';

dotenv.config();

const required = ['GC_ACCESS_TOKEN', 'GC_WEBHOOK_SECRET'] as const;
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

export const env = {
  gcAccessToken: process.env.GC_ACCESS_TOKEN!,
  gcWebhookSecret: process.env.GC_WEBHOOK_SECRET!,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  port: parseInt(process.env.PORT ?? '3001', 10),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
} as const;
