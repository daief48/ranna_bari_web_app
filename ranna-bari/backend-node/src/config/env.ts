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
  SMS_PROVIDER: z.string().default('none'),

  /* Email, for the cook flow's verification and password-reset codes. All
     defaulted for the same reason as SMS_PROVIDER: an unset host means
     `mailIsLive()` is false and the dev branch hands the code back, rather
     than a boot failure on a machine that never sends mail. */
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('RannaBari <no-reply@rannabari.app>'),

  ADMIN_ORIGIN: z.string().default('http://localhost:3100'),

  /* The address the outside world uses for this service, for URLs that get
     baked into stored rows (a kitchen's gallery). Empty in development, where
     localhost is the truth; set in production, where it is not. */
  PUBLIC_BASE_URL: z.string().default(''),
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

/** The outside address of this service, for URLs it stores on rows. */
export const publicBaseUrl = () =>
  loadEnv().PUBLIC_BASE_URL || `http://localhost:${loadEnv().PORT}`;
export const smsIsLive = () => {
  const provider = loadEnv().SMS_PROVIDER;
  return !!provider && provider !== 'none';
};
/** True once SMTP is configured end to end — until then the dev branch hands codes back. */
export const mailIsLive = () => {
  const env = loadEnv();
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
};
