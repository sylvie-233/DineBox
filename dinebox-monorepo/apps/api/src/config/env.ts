import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

/** 环境变量加载顺序：.env → .env.local（后者覆盖）。 */
const workingDir = process.cwd();
for (const [file, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const path = resolve(workingDir, file);
  if (existsSync(path)) {
    loadEnv({ path, override, quiet: true });
  }
}

/** 环境变量契约：集中声明默认值与类型转换。 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  HOST: z.string().default('0.0.0.0'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3307),
  DB_USER: z.string().default('dinebox'),
  DB_PASSWORD: z.string().default('123456'),
  DB_NAME: z.string().default('dinebox'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET 长度至少 16 位'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(604800),

  CORS_ORIGIN: z.string().default('http://localhost:8090,http://localhost:8091'),
  H5_PUBLIC_URL: z.string().default('http://localhost:8090'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  LOG_PRETTY: z.enum(['true', 'false']).optional(),

  CACHE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  CACHE_PREFIX: z.string().default('dinebox'),
  CACHE_DEFAULT_TTL: z.coerce.number().int().positive().default(60),
  REDIS_URL: z.string().default(''),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6380),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),

  S3_ENDPOINT: z.string().default('http://127.0.0.1:9100'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('rustfsadmin'),
  S3_SECRET_KEY: z.string().default('rustfsadmin'),
  S3_BUCKET: z.string().default('dinebox'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
  S3_PUBLIC_URL: z.string().default(''),

  PRINT_ENCODING: z.enum(['gbk', 'utf8']).default('gbk'),
  PRINT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PRINT_WIDTH: z.coerce.number().int().min(24).max(64).default(32),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('；');
  console.error(`环境变量校验失败：${detail}`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
