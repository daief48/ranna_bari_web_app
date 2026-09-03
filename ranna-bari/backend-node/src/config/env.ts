import { z } from 'zod';

/**
 * Load `.env`, if there is one.
 *
 * Node reads no such file on its own, and a `.env` that nothing reads is
 * worse than no `.env` at all — it documents variables that are not set and
 * fails somewhere far from the cause. `npm run dev` threw on a missing
 * MONGODB_URI that was sitting in the file the whole time.
 *
 * `loadEnvFile` throws when the file is absent, which is the normal case in
 * production: there the variables come from the platform, and the catch is
 * the intended path rather than an error being swallowed.
 *
 * It runs at module scope so it has happened before anything calls
 * `loadEnv()`, and real environment variables still win — the platform's
 * configuration must beat a file somebody left in the image.
 */
try {
  process.loadEnvFile();
} catch {
  /* No .env. The environment is expected to be set already. */
}

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
  /*
   * The SMS gateway, described rather than chosen. See lib/sms.ts — 'none'
   * logs and reports undelivered, 'http' calls SMS_URL with SMS_BODY as a
   * {to}/{text} template.
   */
  SMS_PROVIDER: z.string().default('none'),
  SMS_URL: z.string().default(''),
  SMS_METHOD: z.string().default('POST'),
  SMS_BODY: z.string().default(''),
  SMS_AUTH: z.string().default(''),
  SMS_CONTENT_TYPE: z.string().default('application/json'),
  /** How many neighbours one published meal may text. Cost has a ceiling. */
  SMS_MEAL_FANOUT_MAX: z.coerce.number().default(200),

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
