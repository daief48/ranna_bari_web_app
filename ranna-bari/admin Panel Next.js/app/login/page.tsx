import { redirect } from 'next/navigation';

import { signIn, setSessionCookie } from '@/lib/auth';
import { ThemeToggle } from '@/components/ui/client';
import { OperatorPicker, type Operator } from './operator-picker';

export const metadata = { title: 'Sign in · RannaBari Admin' };

const DOMAIN = 'rannabari.app';
const DEMO_PASSWORD = 'rannabari';

/**
 * The ground.
 *
 * Three washes from the status palette — vermilion, saffron, sage — drifting
 * against each other over a fine grid, with a grain plate on top. The whole
 * stack is masked to nothing before it reaches the card, so the form never
 * has to fight it for contrast.
 *
 * The desk itself is deliberately undecorated; this is the one screen that is
 * not the desk. It is the front door, seen once per session by someone who
 * has not started working yet, so it can afford to be a picture.
 *
 * Grain is an inline feTurbulence rather than a PNG: it is a few hundred
 * bytes, it never 404s, and it resolves at whatever DPR the screen has.
 */
function Ground() {
  const grain =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.42'/%3E%3C/svg%3E\")";

  /* Both axes, one hairline every 34px, in the colour the tables rule their
     rows with. A grid rather than the ruled paper it replaces: lines in one
     direction read as a form to fill in, lines in two read as a plan. */
  const grid = [
    'repeating-linear-gradient(to bottom, transparent 0 33px, var(--line2) 33px 34px)',
    'repeating-linear-gradient(to right, transparent 0 33px, var(--line2) 33px 34px)',
  ].join(',');

  const gridFade = 'radial-gradient(120% 90% at 22% 12%, black 12%, transparent 72%)';

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ backgroundImage: grid, maskImage: gridFade, WebkitMaskImage: gridFade }}
      />

      <div className="rb-aurora absolute -inset-[30%]" />

      <div
        className="absolute inset-0 opacity-[0.13] mix-blend-overlay dark:opacity-[0.07]"
        style={{ backgroundImage: grain }}
      />
    </div>
  );
}

const OPERATORS: Operator[] = [
  { email: 'admin@', role: 'Super admin', sees: 'everything', tone: 'primary' },
  { email: 'ops@', role: 'Operations', sees: 'kitchens, KYC, orders, meals', tone: 'sage' },
  { email: 'finance@', role: 'Finance', sees: 'ledger, payouts, disputes', tone: 'saffron' },
  { email: 'support@', role: 'Support', sees: 'orders and cases, read-mostly', tone: 'ink3' },
];

const PRINCIPLES = [
  'The ledger is append-only. A correction is a new entry in the opposite direction.',
  'Money moves on completed, not delivered — the courier’s word is not the customer’s.',
  'Authorisation is checked three times. Only the one on the server counts.',
];

/** A field that reads as an inset well on the glass, not a box drawn on it. */
const INPUT =
  'w-full rounded-[11px] border border-line bg-field px-3.5 py-2.5 text-[14px] text-ink shadow-[var(--shadow-well)] outline-none transition-[border-color,box-shadow] duration-[var(--dur-2)] placeholder:text-ink3 hover:border-line-strong focus:border-primary-200 focus:shadow-[0_0_0_3px_var(--ring)]';

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

    /* The backend's own token, verbatim. Re-signing it here would put the
       two sides back out of step — and this cookie is also what the socket
       relay presents upstream. */
    await setSessionCookie(out.token);
    // Only same-origin paths, so a crafted ?next= cannot bounce someone off
    // the panel to an attacker's page after a successful sign-in.
    redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-5 py-12">
      <Ground />

      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 grid w-full max-w-[1000px] gap-12 lg:grid-cols-[minmax(0,1fr)_412px] lg:items-center lg:gap-20">
        {/* ---------------------------------------------------------- *
         * the statement
         * ---------------------------------------------------------- */}
        <section className="max-w-[460px]">
          <div className="flex items-center gap-3.5">
            <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-line bg-raised shadow-[var(--shadow-sm)]">
              {/* 128px marks, 9 KB each. The 512px originals this replaced
                  were 360 KB apiece to draw a 48px square. */}
              <img
                src="/logo-mark.png"
                alt=""
                width={128}
                height={128}
                className="h-8 w-8 object-contain dark:hidden"
              />
              <img
                src="/logo-mark-dark.png"
                alt=""
                width={128}
                height={128}
                className="hidden h-8 w-8 object-contain dark:block"
              />
            </span>

            <div>
              <div className="flex items-baseline">
                <span className="font-display text-[23px] leading-none font-bold tracking-[-0.02em] text-ink">
                  Ranna
                </span>
                <span className="font-display bg-gradient-to-br from-primary to-saffron bg-clip-text text-[23px] leading-none font-bold tracking-[-0.02em] text-transparent">
                  Bari
                </span>
              </div>
              <div className="label mt-1.5 text-[10.5px]">Operator console</div>
            </div>
          </div>

          <h1 className="mt-9 font-display text-[34px] leading-[1.1] font-bold tracking-[-0.025em] text-balance text-ink sm:text-[42px]">
            The desk behind
            <br />
            the kitchens.
          </h1>

          <p className="mt-4 max-w-[43ch] text-[13.5px] leading-relaxed text-ink2">
            Cooks and their paperwork, orders in flight, disputes, and the ledger every
            taka moves through. Sign in and the panel narrows to what your role may
            touch.
          </p>

          <ul className="mt-8 grid gap-3 border-t border-line2 pt-7">
            {PRINCIPLES.map((line, i) => (
              <li key={line} className="flex gap-3 text-[12.5px] leading-relaxed text-ink2">
                <span
                  aria-hidden
                  className="tnum mt-px w-4 shrink-0 text-[10.5px] font-semibold text-ink3"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------- *
         * the door
         * ---------------------------------------------------------- */}
        <div className="rb-enter">
          {/* A 1px gradient rim, brightest at the top left where the light is.
              A flat border at this size reads as a dialog; a lit one reads as
              a pane of glass sitting on the picture behind it. */}
          <div className="rounded-[19px] bg-gradient-to-br from-[color-mix(in_oklab,var(--ink)_16%,transparent)] via-line to-transparent p-px shadow-[var(--shadow-lg)]">
            <div className="rounded-[18px] bg-[color-mix(in_oklab,var(--raised)_86%,transparent)] p-6 backdrop-blur-2xl">
              <form action={submit}>
                <input type="hidden" name="next" value={params.next ?? '/'} />

                <div className="mb-6">
                  <h2 className="font-display text-[19px] leading-none font-bold text-ink">
                    Sign in
                  </h2>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink3">
                    Email and password. TOTP only if the account carries one.
                  </p>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label htmlFor="email" className="label mb-2 block">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                      defaultValue={`admin@${DOMAIN}`}
                      className={INPUT}
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="label mb-2 block">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      defaultValue={DEMO_PASSWORD}
                      className={INPUT}
                    />
                  </div>

                  {params.totp ? (
                    <div>
                      <label htmlFor="totp" className="label mb-2 block">
                        Authenticator code
                      </label>
                      <input
                        id="totp"
                        name="totp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        className={`${INPUT} tnum text-center text-[17px] tracking-[0.4em]`}
                      />
                    </div>
                  ) : null}

                  {params.error ? (
                    <p
                      role="alert"
                      className="rounded-[11px] border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-primary"
                    >
                      {params.error}
                    </p>
                  ) : null}

                  {/* Lifts a pixel on hover and gives it back on press, so the
                      one button on the screen answers the pointer. */}
                  <button
                    type="submit"
                    className="mt-1 inline-flex w-full items-center justify-center rounded-[11px] border border-transparent bg-gradient-to-b from-primary to-primary-600 px-3 py-3 text-[13.5px] font-semibold text-on-primary shadow-[var(--shadow-sm)] transition-[transform,box-shadow,filter] duration-[var(--dur-2)] hover:-translate-y-px hover:brightness-[1.06] hover:shadow-[var(--shadow-md)] active:translate-y-0 active:brightness-95"
                  >
                    Sign in
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* The demo's whole point is that authorisation is real, which needs
              two sign-ins to see. So the four accounts are on the door — and
              clickable, because retyping them is the reason nobody checks. */}
          <div className="mt-4 rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--sunken)_78%,transparent)] px-3 py-3 backdrop-blur-xl">
            <div className="flex items-baseline justify-between px-2">
              <span className="label">Seeded operators</span>
              <span className="text-[10.5px] text-ink3">click to fill</span>
            </div>

            <OperatorPicker
              operators={OPERATORS}
              domain={DOMAIN}
              password={DEMO_PASSWORD}
            />

            <p className="mt-2.5 border-t border-line2 px-2 pt-2.5 text-[11.5px] leading-relaxed text-ink3">
              All four take the password{' '}
              <code className="tnum rounded-[5px] border border-line bg-raised px-1.5 py-px font-semibold text-ink2">
                {DEMO_PASSWORD}
              </code>
              . Come back as <span className="text-ink2">finance@</span> to see the money
              screens without the operations ones.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
