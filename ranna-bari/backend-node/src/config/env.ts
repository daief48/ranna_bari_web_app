import { z } from 'zod';

/**
 * The environment, validated once at boot.
 *
 * A missing secret should stop the process on the first line, not surface as
 * a signature failure under load three hours later. Everything downstream can
 * then treat these as present and correctly shaped.
 */
const schema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  /* Two realms, two secrets — and they must differ. Sharing one would make an
     operator session verify as a customer token, which is the exact confusion
     the two-realm split exists to prevent. */
  ADMIN_AUTH_SECRET: z.string().min(32, 'ADMIN_AUTH_SECRET must be at least 32 characters'),
  APP_AUTH_SECRET: z.string().min(32, 'APP_AUTH_SECRET must be at least 32 characters'),

  BACKEND_SERVICE_TOKEN: z
    .string()
    .min(32, 'BACKEND_SERVICE_TOKEN must be at least 32 characters'),

  /* Defaults to off so a missing variable fails closed: no provider means the
     dev branch, and the dev branch is the one that hands the code back. */
  SMS_PROVIDER: z.string().default('none'),

  ADMIN_ORIGIN: z.string().default('http://localhost:3100'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Environment is not usable:\n${lines.join('\n')}`);
  }

  if (parsed.data.ADMIN_AUTH_SECRET === parsed.data.APP_AUTH_SECRET) {
    throw new Error(
      'ADMIN_AUTH_SECRET and APP_AUTH_SECRET must differ — one secret means one realm.',
    );
  }

  cached = parsed.data;
  return cached;
}

/** For tests, which build an environment per suite. */
export function resetEnv() {
  cached = null;
}

export const isProd = () => loadEnv().NODE_ENV === 'production';
export const smsIsLive = () => {
  const provider = loadEnv().SMS_PROVIDER;
  return !!provider && provider !== 'none';
};
