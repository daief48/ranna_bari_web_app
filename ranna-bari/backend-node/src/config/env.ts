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
  /* A serverless container is a deployment, never a developer's machine. Left
     to a flat 'development' default, a Netlify function with NODE_ENV unset
     ran with every dev branch open — codes returned in responses, SMTP
     optional, no proxy trust. Detected from the platform's own variables so
     the safe answer does not depend on someone remembering the dashboard. */
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY ? 'production' : 'development'),
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

  /* The explicit, loud way to keep the unverified dev flows (an OTP handed back
     in the response, a wallet top-up with no payment behind it) alive in a
     production deploy — a demo, a staging box with NODE_ENV=production.
     Defaults off, so production fails closed: with no SMS provider and no
     payment gateway wired in, anyone could otherwise sign in as any phone
     number and print wallet money. */
  ALLOW_DEV_FLOWS: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

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

  /* A placeholder is not a secret. The example file's old `change-me-…`
     values were long enough to pass the length check, which is how one of
     them ended up committed in a deploy config and treated as leaked. In
     production any value that still reads as a placeholder stops the boot;
     a developer's machine may keep whatever it likes. */
  if (parsed.data.NODE_ENV === 'production') {
    const placeholder = /change-me|<generate|example|placeholder/i;
    for (const key of ['ADMIN_AUTH_SECRET', 'APP_AUTH_SECRET', 'BACKEND_SERVICE_TOKEN'] as const) {
      if (placeholder.test(parsed.data[key])) {
        throw new Error(`${key} is a placeholder — generate a real secret (openssl rand -hex 32).`);
      }
    }
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
/**
 * May a flow that has no real verification behind it run?
 *
 * Yes everywhere except production, and in production only when someone has
 * set `ALLOW_DEV_FLOWS` on purpose. Guards the phone OTP being returned in the
 * response and the ungated wallet top-up.
 */
export const devFlowsAllowed = () => !isProd() || loadEnv().ALLOW_DEV_FLOWS;
export const smsIsLive = () => {
  const provider = loadEnv().SMS_PROVIDER;
  return !!provider && provider !== 'none';
};
/** True once SMTP is configured end to end — until then the dev branch hands codes back. */
export const mailIsLive = () => {
  const env = loadEnv();
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
};
