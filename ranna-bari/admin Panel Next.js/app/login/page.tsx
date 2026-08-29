import { redirect } from 'next/navigation';

import { signIn, createSession, setSessionCookie } from '@/lib/auth';
import { ThemeToggle } from '@/components/ui/client';
import { BTN } from '@/components/ui';

export const metadata = { title: 'Sign in · RannaBari Admin' };

/**
 * The washi ground.
 *
 * Ruled paper, one hairline every 28px in the same colour the tables use for
 * their row rules, with a soft vermilion wash where the wordmark sits. Masked
 * to nothing at the edges so it never competes with the form — the black in
 * the mask is an alpha channel, not a colour.
 */
function Ground() {
  const fade = 'radial-gradient(115% 100% at 28% 18%, black 18%, transparent 76%)';
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: [
          'radial-gradient(85% 65% at 14% 2%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 62%)',
          'repeating-linear-gradient(to bottom, transparent 0 27px, var(--line2) 27px 28px)',
        ].join(','),
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    />
  );
}

const OPERATORS: { email: string; role: string; sees: string }[] = [
  { email: 'admin@', role: 'Super admin', sees: 'everything' },
  { email: 'ops@', role: 'Operations', sees: 'kitchens, KYC, orders, meals' },
  { email: 'finance@', role: 'Finance', sees: 'ledger, payouts, disputes' },
  { email: 'support@', role: 'Support', sees: 'orders and cases, read-mostly' },
];

const INPUT =
  'w-full rounded-[10px] border border-line bg-canvas px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-ink3 focus:border-primary-200';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; totp?: string }>;
}) {
  const params = await searchParams;

  async function submit(formData: FormData) {
    'use server';

    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const totp = String(formData.get('totp') ?? '');
    const next = String(formData.get('next') ?? '') || '/';

    const out = await signIn(email, password, totp || undefined);

    if (!out.ok) {
      const query = new URLSearchParams({ error: out.error });
      if (out.needsTotp) query.set('totp', '1');
      if (next !== '/') query.set('next', next);
      redirect(`/login?${query.toString()}`);
    }

    await setSessionCookie(await createSession(out.session));
    // Only same-origin paths, so a crafted ?next= cannot bounce someone off
    // the panel to an attacker's page after a successful sign-in.
    redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-5 py-12">
      <Ground />

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 grid w-full max-w-[900px] gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-16">
        <section className="max-w-[440px]">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="RannaBari"
              className="h-11 w-11 shrink-0 object-contain rounded-[12px] border border-line bg-raised shadow-sm dark:hidden"
            />
            <img
              src="/logo-dark.png"
              alt="RannaBari"
              className="h-11 w-11 shrink-0 object-contain rounded-[12px] border border-line bg-raised shadow-sm hidden dark:block"
            />
            <div>
              <div className="flex items-center">
                <span className="font-display text-[22px] leading-none font-bold tracking-[-0.02em] text-ink">
                  Ranna
                </span>
                <span className="font-display text-[22px] leading-none font-bold tracking-[-0.02em] text-primary">
                  Bari
                </span>
              </div>
              <div className="label mt-1.5 text-[11px] tracking-[0.04em]">
                Operator console
              </div>
            </div>
          </div>

          <h1 className="mt-8 font-display text-[32px] leading-[1.14] font-bold tracking-[-0.02em] text-balance text-ink sm:text-[38px]">
            The desk behind the kitchens.
          </h1>

          <p className="mt-3.5 max-w-[42ch] text-[13.5px] leading-relaxed text-ink2">
            Cooks and their paperwork, orders in flight, disputes, and the ledger every
            taka moves through. Sign in and the panel narrows to what your role may
            touch.
          </p>

          <ul className="mt-7 space-y-2.5 border-t border-line2 pt-6 text-[12.5px] leading-relaxed text-ink2">
            {[
              'The ledger is append-only. A correction is a new entry in the opposite direction.',
              'Money moves on completed, not delivered — the courier’s word is not the customer’s.',
              'Authorisation is checked three times. Only the one on the server counts.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink3"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <div>
          <form
            action={submit}
            className="rounded-[16px] border border-line bg-raised p-5 shadow-lg sm:p-6"
          >
            <input type="hidden" name="next" value={params.next ?? '/'} />

            <div className="mb-5">
              <h2 className="font-display text-[17px] leading-none font-bold text-ink">
                Sign in
              </h2>
              <p className="mt-1.5 text-[12px] text-ink3">
                Email and password. TOTP only if the account carries one.
              </p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label htmlFor="email" className="label mb-1.5 block">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  defaultValue="admin@rannabari.app"
                  className={INPUT}
                />
              </div>

              <div>
                <label htmlFor="password" className="label mb-1.5 block">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  defaultValue="rannabari"
                  className={INPUT}
                />
              </div>

              {params.totp ? (
                <div>
                  <label htmlFor="totp" className="label mb-1.5 block">
                    Authenticator code
                  </label>
                  <input
                    id="totp"
                    name="totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className={`${INPUT} tnum text-center text-[16px] tracking-[0.4em]`}
                  />
                </div>
              ) : null}

              {params.error ? (
                <p
                  role="alert"
                  className="rounded-[10px] border border-primary-100 bg-primary-50 px-3 py-2 text-[12.5px] leading-relaxed text-primary"
                >
                  {params.error}
                </p>
              ) : null}

              <button type="submit" className={`${BTN.primary} w-full !py-2.5`}>
                Sign in
              </button>
            </div>
          </form>

          {/* The demo's whole point is that authorisation is real, which needs
              two sign-ins to see. So the four accounts are on the door. */}
          <div className="mt-4 rounded-[14px] border border-line bg-sunken px-3.5 py-3">
            <div className="label opacity-80">Seeded operators</div>

            <dl className="mt-2.5 space-y-1.5 text-[12px]">
              {OPERATORS.map((op) => (
                <div key={op.email} className="flex items-baseline gap-2">
                  <dt className="w-[62px] shrink-0 font-semibold text-ink">{op.email}</dt>
                  <dd className="min-w-0 text-ink2">
                    <span className="font-medium text-ink2">{op.role}</span>
                    <span className="text-ink3"> — {op.sees}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 border-t border-line2 pt-2.5 text-[11.5px] leading-relaxed text-ink3">
              All four take the password{' '}
              <code className="tnum rounded-[5px] border border-line bg-raised px-1 py-px font-semibold text-ink2">
                rannabari
              </code>
              . The form is pre-filled as <span className="text-ink2">admin@</span> — press
              Sign in. Come back as{' '}
              <span className="text-ink2">finance@</span> to see the money screens without
              the operations ones.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
